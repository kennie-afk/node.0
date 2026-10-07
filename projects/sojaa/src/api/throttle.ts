/**
 * Brute-force throttling for sign-in and guard PINs, kept in Postgres so it survives a restart and is the
 * same on every replica. Two kinds of key per attempt:
 *
 *  - the ATTACKER key, `ip|phone`: strict (a handful of tries, then a lock that doubles each time it is
 *    tripped). Whoever is guessing is stopped by their own key.
 *  - the ACCOUNT key, `phone` alone: only a ceiling against a distributed guess (many addresses at one
 *    number). Its lock is short and never escalates, and attempts made while it is locked do not extend it,
 *    so one person cannot keep a guard locked out of their own account; the worst they can do is cost the
 *    guard a few minutes after sustained, wide guessing.
 *
 * Because the keys differ, a guard on their own phone is not blocked by what someone else typed from another
 * address. (Behind a proxy that does not pass the client address, the attacker key degenerates to the
 * account key: set trust proxy / X-Forwarded-For properly in front of the API.)
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { withoutTenant } from '../persistence/pool';
import { ipKeyGenerator } from 'express-rate-limit';

export interface ThrottleRule {
  scope: string;
  attackerLimit: number;
  windowSeconds: number;
  attackerBaseLockSeconds: number;
  attackerMaxLockSeconds: number;
  accountLimit: number;
  accountLockSeconds: number;
  message: string;
}

async function hit(key: string, limit: number, windowS: number, baseS: number, maxS: number): Promise<number> {
  return withoutTenant(async (c) => (await c.query('SELECT auth_throttle_hit($1, $2, $3, $4, $5) AS wait', [key, limit, windowS, baseS, maxS])).rows[0].wait as number);
}

export function throttleKeys(scope: string, ip: string, phone: string): { attacker: string; account: string } {
  return { attacker: `${scope}:att:${ipKeyGenerator(ip)}|${phone}`, account: `${scope}:acct:${phone}` };
}

export function throttle(rule: ThrottleRule, phoneOf: (req: Request) => string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const keys = throttleKeys(rule.scope, req.ip ?? 'unknown', phoneOf(req));
      const attackerWait = await hit(keys.attacker, rule.attackerLimit, rule.windowSeconds, rule.attackerBaseLockSeconds, rule.attackerMaxLockSeconds);
      const accountWait = attackerWait > 0 ? 0 : await hit(keys.account, rule.accountLimit, rule.windowSeconds, rule.accountLockSeconds, rule.accountLockSeconds);
      const wait = Math.max(attackerWait, accountWait);
      if (wait > 0) {
        res.setHeader('Retry-After', String(wait));
        res.status(429).json({ code: 'too-many-attempts', message: rule.message });
        return;
      }
      // A successful attempt gives its counts back: the attacker key is cleared, the account key loses one.
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          void withoutTenant(async (c) => {
            await c.query('DELETE FROM auth_throttle WHERE key = $1', [keys.attacker]);
            await c.query('UPDATE auth_throttle SET fails = greatest(fails - 1, 0) WHERE key = $1', [keys.account]);
          }).catch(() => undefined);
        } else if (res.statusCode !== 401) {
          // a request that never reached the credential check (bad input, wrong state) is not a guess
          void withoutTenant(async (c) => {
            await c.query('UPDATE auth_throttle SET fails = greatest(fails - 1, 0) WHERE key = ANY($1)', [[keys.attacker, keys.account]]);
          }).catch(() => undefined);
        }
      });
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Housekeeping: rows idle for a day carry no information. */
export async function purgeThrottle(): Promise<number> {
  return withoutTenant(async (c) => (await c.query(`DELETE FROM auth_throttle WHERE window_start < now() - interval '1 day' AND (locked_until IS NULL OR locked_until < now())`)).rowCount ?? 0);
}
