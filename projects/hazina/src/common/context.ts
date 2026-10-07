import { PoolClient } from 'pg';
import { Request, Response, NextFunction } from 'express';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../domain/errors';
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
  paybillNumber: string | null;
  isDemo: boolean;
  archived: boolean;
}

function toBranch(row: Record<string, any>): BranchRow {
  return { id: row.id, code: row.code, name: row.name, timezone: row.timezone, paybillNumber: row.paybill_number, isDemo: row.is_demo, archived: row.archived };
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

export interface OrgInfo {
  kind: 'sacco' | 'lender';
  isDemo: boolean;
  name: string;
}

export async function orgInfo(client: PoolClient): Promise<OrgInfo> {
  const row = (await client.query('SELECT kind, is_demo, name FROM organisations LIMIT 1')).rows[0];
  if (!row) throw new NotFoundError('This organisation was not found.');
  return { kind: row.kind, isDemo: row.is_demo, name: row.name };
}

export interface OrgSettings {
  makerChecker: 'strict' | 'relaxed';
  withdrawalApprovalCents: number;
  capacityShareBp: number;
  financialYearStartMonth: number;
  /** loan loss provision percentage per ageing bucket, in basis points of the exposure. ILLUSTRATIVE, not regulatory guidance. */
  provisionRatesBp: Record<string, number>;
}

export async function getSettings(client: PoolClient): Promise<OrgSettings> {
  const row = (await client.query('SELECT * FROM org_settings LIMIT 1')).rows[0];
  return {
    makerChecker: row?.maker_checker ?? 'strict',
    withdrawalApprovalCents: Number(row?.withdrawal_approval_cents ?? 5_000_000),
    capacityShareBp: Number(row?.capacity_share_bp ?? 3000),
    financialYearStartMonth: Number(row?.financial_year_start_month ?? 1),
    provisionRatesBp: (row?.provision_rates_bp as Record<string, number> | undefined) ?? { current: 100, '1-30': 500, '31-60': 2500, '61-90': 5000, '91-180': 7500, '180+': 10000 }
  };
}

/**
 * Maker-checker: the person who made a step may not also check it. Strict organisations never allow it. Relaxed ones
 * allow an owner only, and the caller records the exception in the audit trail (see the `selfChecked` flag it returns).
 */
export function mayCheck(ctx: Ctx, settings: OrgSettings, makers: Array<string | null | undefined>): { allowed: boolean; selfChecked: boolean } {
  const isMaker = makers.some((maker) => maker && maker === ctx.userId);
  if (!isMaker) return { allowed: true, selfChecked: false };
  if (settings.makerChecker === 'relaxed' && ctx.role === 'owner') return { allowed: true, selfChecked: true };
  return { allowed: false, selfChecked: false };
}

/** The branch's own calendar date right now: the business day entries belong to. */
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
