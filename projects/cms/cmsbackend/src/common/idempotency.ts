/**
 * Idempotency-Key support for mutating endpoints. A client (or an M-Pesa callback) that retries a
 * request after a timeout must not post the money twice. The first 2xx response is stored with
 * the key, inside the same transaction as the work, so the two commit or roll back together; a
 * retry with the same key and body gets the stored response replayed, and the same key with a
 * different body is refused.
 */
import { createHash } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { currentTenantOrNull } from './tenant-context';
import { requestTx } from './http';
import db from '@models';
import { QueryTypes } from 'sequelize';

const KEY = /^[A-Za-z0-9_\-:.]{8,80}$/;

export const idempotent = () => async (req: Request, res: Response, next: NextFunction) => {
  const raw = req.header('idempotency-key');
  const tenant = currentTenantOrNull();
  if (!raw || !tenant) return next();
  if (!KEY.test(raw)) {
    return res.status(400).json({ message: 'Idempotency-Key must be 8-80 characters of letters, digits, _ - : .', requestId: req.id });
  }
  try {
    const t = await requestTx();
    const hash = createHash('sha256').update(`${req.method}|${req.baseUrl}${req.path}|${JSON.stringify(req.body ?? {})}`).digest('hex');
    const rows = (await db.sequelize.query(
      'SELECT request_hash, status_code, response FROM idempotency_keys WHERE church_id = :churchId AND key = :key',
      { replacements: { churchId: tenant.churchId, key: raw }, transaction: t, type: QueryTypes.SELECT }
    )) as Array<{ request_hash: string; status_code: number; response: unknown }>;
    const prior = rows[0];
    if (prior) {
      if (String(prior.request_hash).trim() !== hash) {
        return res.status(422).json({ message: 'That Idempotency-Key was already used with a different request.', requestId: req.id });
      }
      res.setHeader('Idempotent-Replayed', 'true');
      const body = typeof prior.response === 'string' ? JSON.parse(prior.response) : prior.response;
      return res.status(Number(prior.status_code)).json(body);
    }

    const send = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Fire-and-forget into the request transaction; it commits (or fails) with the response.
        db.sequelize
          .query(
            `INSERT INTO idempotency_keys (church_id, key, method, path, request_hash, status_code, response)
             VALUES (:churchId, :key, :method, :path, :hash, :status, :response)`,
            {
              replacements: {
                churchId: tenant.churchId,
                key: raw,
                method: req.method,
                path: `${req.baseUrl}${req.path}`.slice(0, 200),
                hash,
                status: res.statusCode,
                response: JSON.stringify(body)
              },
              transaction: t
            }
          )
          .then(() => send(body))
          .catch(next);
        return res;
      }
      return send(body);
    }) as Response['json'];
    next();
  } catch (error) {
    next(error);
  }
};
