import { PoolClient } from 'pg';
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { AppError, BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../domain/errors';
import { can, Permission, Role } from '../domain/roles';

/** Who is acting, taken from the verified token and the database, never from the request body. */
export interface Ctx {
  orgId: string;
  userId: string;
  role: Role;
  /** set when the person works at one branch only */
  branchId: string | null;
}

export function ctxOf(req: Request): Ctx {
  const principal = req.principal;
  if (!principal) throw new UnauthorizedError();
  return { orgId: principal.orgId, userId: principal.userId, role: principal.role, branchId: principal.branchId };
}

export function need(ctx: Ctx, permission: Permission): void {
  if (!can(ctx.role, permission)) throw new ForbiddenError('Your role does not allow this.');
}

/** Wraps an async handler so a rejection reaches the error middleware. */
export const wrap =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };

export interface BranchRow {
  id: string;
  code: string;
  name: string;
  timezone: string;
  tillNumber: string | null;
  isDemo: boolean;
  archived: boolean;
}

function toBranch(row: Record<string, any>): BranchRow {
  return { id: row.id, code: row.code, name: row.name, timezone: row.timezone, tillNumber: row.till_number, isDemo: row.is_demo, archived: row.archived };
}

/**
 * Decides which branch a request is about. Someone confined to a branch can only ever use theirs; anyone else
 * names one, or, when the organisation has exactly one real branch, gets it by default. Archived branches are
 * read-only history and are refused for new work.
 */
export async function pickBranch(client: PoolClient, ctx: Ctx, requested: string | undefined | null, opts: { allowArchived?: boolean } = {}): Promise<BranchRow> {
  if (ctx.branchId && requested && requested !== ctx.branchId) {
    throw new ForbiddenError('You work at a different branch.');
  }
  const wanted = ctx.branchId ?? requested ?? null;
  let row: Record<string, any> | undefined;
  if (wanted) {
    row = (await client.query('SELECT * FROM branches WHERE id = $1', [wanted])).rows[0];
    if (!row) throw new NotFoundError('That branch was not found.');
  } else {
    const rows = (await client.query('SELECT * FROM branches WHERE NOT archived AND NOT is_demo ORDER BY created_at')).rows;
    if (rows.length === 0) throw new NotFoundError('There is no branch yet.');
    if (rows.length > 1) throw new BadRequestError('Say which branch (branchId): this organisation has more than one.');
    row = rows[0];
  }
  if (row!.archived && !opts.allowArchived) throw new ConflictError('That branch is archived.');
  return toBranch(row!);
}

/** The branch's own calendar date right now: the business day sales and closes belong to. */
export async function businessDayNow(client: PoolClient, timezone: string): Promise<string> {
  const { rows } = await client.query(`SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS day`, [timezone]);
  return rows[0].day as string;
}

export async function audit(
  client: PoolClient,
  ctx: Ctx,
  action: string,
  entity: string,
  entityId: string | null,
  detail: Record<string, unknown> = {},
  branchId: string | null = null
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (org_id, branch_id, actor_id, action, entity, entity_id, detail) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [ctx.orgId, branchId, ctx.userId, action, entity, entityId, JSON.stringify(detail)]
  );
}

export interface WitnessInput {
  phone: string;
  pin: string;
}

/**
 * A second person confirms a controlled-drug entry by signing in with their own phone and PIN at the till.
 * They must belong to this organisation, be active, be allowed to handle controlled drugs, and not be the actor.
 */
export async function verifyWitness(client: PoolClient, ctx: Ctx, witness: WitnessInput | undefined, normalisePhone: (raw: string) => string): Promise<string> {
  if (!witness) throw new BadRequestError('A controlled drug needs a witness: a second person must confirm with their phone and PIN.');
  let phone: string;
  try {
    phone = normalisePhone(witness.phone);
  } catch {
    throw new BadRequestError('The witness phone number is not valid.');
  }
  const row = (await client.query(`SELECT id, role, pin_hash, status FROM users WHERE phone = $1`, [phone])).rows[0];
  const matches = await bcrypt.compare(witness.pin, row?.pin_hash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
  if (!row || !matches || row.status !== 'active') throw new UnauthorizedError('The witness credentials are not valid.');
  if (row.id === ctx.userId) throw new AppError(422, 'witness-must-differ', 'The witness must be a different person from you.');
  if (!can(row.role, 'controlled')) throw new ForbiddenError('That person may not witness controlled-drug entries.');
  return row.id as string;
}
