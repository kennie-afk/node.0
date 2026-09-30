import { NextFunction, Request, RequestHandler, Response } from 'express';
import { Transaction } from 'sequelize';
import { ZodType, z } from 'zod';
import { currentTenant } from './tenant-context';

/** The request's database transaction (stamped with the church). Begun on first use. */
export async function requestTx(): Promise<Transaction> {
  const tenantTx = currentTenant().tenantTx;
  if (!tenantTx) {
    throw new Error('no request transaction: this code ran outside an authenticated request');
  }
  return tenantTx.acquire();
}

export function route(
  handler: (req: Request, res: Response) => Promise<unknown>,
  status = 200
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res)
      .then((result) => {
        if (res.headersSent) return;
        if (status === 204 || result === undefined) {
          res.status(status === 200 && result === undefined ? 204 : status).end();
          return;
        }
        res.status(status).json(result);
      })
      .catch(next);
  };
}

/** Parses `{ body, query, params }` with a Zod schema; a failure becomes a 400 via the error handler. */
export function input<S extends ZodType>(schema: S, req: Request): z.output<S> {
  return schema.parse({ body: req.body, query: req.query, params: req.params });
}
