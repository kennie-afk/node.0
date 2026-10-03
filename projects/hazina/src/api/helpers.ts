import { Request } from 'express';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { withOrg } from '../persistence/pool';
import { BadRequestError } from '../domain/errors';
import { BranchRow, Ctx, ctxOf, pickBranch } from '../common/context';

export function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new BadRequestError(`${first?.path.join('.') || 'request'}: ${first?.message ?? 'is not valid'}`);
  }
  return result.data;
}

/** Runs a handler in the caller's tenant transaction with their verified identity. */
export function inOrg<T>(req: Request, run: (client: PoolClient, ctx: Ctx) => Promise<T>): Promise<T> {
  const ctx = ctxOf(req);
  return withOrg(ctx.orgId, (client) => run(client, ctx));
}

/** Same, with the branch the request is about already resolved and checked against the caller's own. */
export function inBranch<T>(req: Request, requested: unknown, run: (client: PoolClient, ctx: Ctx, branch: BranchRow) => Promise<T>): Promise<T> {
  const ctx = ctxOf(req);
  const wanted = typeof requested === 'string' && requested ? requested : undefined;
  return withOrg(ctx.orgId, async (client) => run(client, ctx, await pickBranch(client, ctx, wanted)));
}

export const queryString = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
export const queryInt = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};
export const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
