/**
 * Session and credential endpoints: sign out everywhere, change my PIN, and a manager resetting an
 * attendant's forgotten PIN. All of them end the account's existing sessions by bumping
 * users.token_version, which `authenticate` compares with the token on every request.
 *
 * None of these is gated on the subscription: a suspended organisation must still be able to secure its
 * accounts.
 */
import { Router } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { withOrg } from '../persistence/pool';
import { accounts } from './accounts';
import { authenticate, requireRole } from './middleware';
import { signToken } from './token';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../domain/errors';
import { generatePin } from '../admin/phone';
import { env } from '../config/env';

const router = Router();

const pinChangeLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  limit: env.LOGIN_RATE_LIMIT_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // someone holding a stolen token must not be able to guess the current PIN at leisure
  keyGenerator: (req) => req.principal?.userId ?? 'anonymous',
  message: { code: 'too-many-attempts', message: 'Too many wrong PINs. Try again shortly.' }
});

export const PIN_MIN_LENGTH = 6;

const pinChange = z.object({
  currentPin: z.string().min(1).max(64),
  newPin: z.string().min(PIN_MIN_LENGTH).max(64)
});

router.post('/auth/logout', authenticate, async (req, res, next) => {
  try {
    await bumpVersion(req.principal!.orgId, req.principal!.userId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/me/pin', authenticate, pinChangeLimiter, async (req, res, next) => {
  try {
    const parsed = pinChange.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(`newPin must be at least ${PIN_MIN_LENGTH} characters, and the current PIN is required`);
    const { currentPin, newPin } = parsed.data;
    if (currentPin === newPin) throw new BadRequestError('Choose a PIN different from the current one.');

    const { orgId, userId } = req.principal!;
    const row = await withOrg(orgId, async (client) => (await client.query('SELECT pin_hash, role, site_id FROM users WHERE id = $1', [userId])).rows[0]);
    if (!row || !(await bcrypt.compare(currentPin, row.pin_hash))) {
      throw new UnauthorizedError('The current PIN is not right.');
    }

    const hash = await bcrypt.hash(newPin, 10);
    const version = await withOrg(orgId, async (client) =>
      Number(
        (
          await client.query(
            `UPDATE users SET pin_hash = $2, pin_changed_at = now(), token_version = token_version + 1
              WHERE id = $1 RETURNING token_version`,
            [userId, hash]
          )
        ).rows[0].token_version
      )
    );
    accounts.invalidate(orgId, userId);

    // every other session is now void; hand this one a fresh token so the person is not thrown out
    const { token, expiresInSeconds } = signToken({ userId, orgId, siteId: row.site_id, role: row.role, tokenVersion: version });
    res.json({ token, expiresInSeconds });
  } catch (error) {
    next(error);
  }
});

// A manager may reset a worker's or supervisor's PIN at their own site; an owner may reset anyone's.
router.post('/users/:id/reset-pin', authenticate, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new BadRequestError('That is not a person id.');
    const caller = req.principal!;
    const pin = generatePin();
    const hash = await bcrypt.hash(pin, 10);

    await withOrg(caller.orgId, async (client) => {
      const { rows } = await client.query('SELECT role, site_id FROM users WHERE id = $1', [id.data]);
      const target = rows[0];
      if (!target) throw new NotFoundError('That person was not found.');
      if (caller.role === 'manager') {
        if (!['worker', 'supervisor'].includes(target.role)) throw new ForbiddenError('A manager can reset attendants and supervisors only.');
        if (caller.siteId && target.site_id !== caller.siteId) throw new ForbiddenError('That person works at another site.');
      }
      await client.query(
        'UPDATE users SET pin_hash = $2, pin_changed_at = now(), token_version = token_version + 1 WHERE id = $1',
        [id.data, hash]
      );
    });
    accounts.invalidate(caller.orgId, id.data);
    // the only time the PIN exists in clear: here, once
    res.json({ pin, note: 'Give this PIN to the person now. It cannot be shown again, and they should change it after signing in.' });
  } catch (error) {
    next(error);
  }
});

/** Ends every session of one account: used by sign-out and whenever role, site or status change. */
export async function bumpVersion(orgId: string, userId: string): Promise<void> {
  await withOrg(orgId, (client) => client.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [userId]));
  accounts.invalidate(orgId, userId);
}

export default router;
