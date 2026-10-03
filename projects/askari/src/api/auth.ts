import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { withoutTenant } from '../persistence/pool';
import { branchCodeFrom } from '../admin/provisioning';
import { authenticate, forgetStanding, requirePermission, requireWritable } from './middleware';
import { env } from '../config/env';
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from '../domain/errors';
import { signToken } from './token';
import { generatePin, normalisePhone } from '../admin/phone';
import { audit, wrap } from '../common/context';
import { canGrantRole, ROLES } from '../domain/roles';
import { inOrg, parse } from './helpers';

const router = Router();

/** People type their number the way they always do (0712..., +254..., 254...); accounts are stored as 254XXXXXXXXX. */
function loginPhone(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  try {
    return normalisePhone(raw);
  } catch {
    return raw;
  }
}

const loginLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  limit: env.LOGIN_RATE_LIMIT_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // keyed on the normalised number, so 0712... and 254712... cannot be used to get two sets of attempts
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? 'unknown')}|${loginPhone(req.body?.phone)}`,
  message: { code: 'too-many-attempts', message: 'Too many sign in attempts. Try again shortly.' }
});

const loginSchema = z.object({ phone: z.string().min(6).max(20), pin: z.string().min(4).max(64) });

router.post('/auth/login', loginLimiter, wrap(async (req, res) => {
  const body = parse(loginSchema, req.body);
  const row = await withoutTenant(async (client) => (await client.query('SELECT id, org_id, branch_id, role, display_name, pin_hash FROM resolve_login($1)', [loginPhone(body.phone)])).rows[0]);
  // the same work is done whether or not the number exists, so response time does not reveal which numbers have accounts
  const stored = row?.pin_hash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  const matches = await bcrypt.compare(body.pin, stored);
  if (!row || !matches) throw new UnauthorizedError('Those credentials are not valid.');
  const { token, expiresInSeconds } = signToken({ userId: row.id, orgId: row.org_id, branchId: row.branch_id, role: row.role });
  res.json({ token, expiresInSeconds, displayName: row.display_name, role: row.role, orgId: row.org_id, branchId: row.branch_id });
}));

router.get('/auth/me', authenticate, wrap(async (req, res) => {
  res.json(await inOrg(req, async (client, ctx) => {
    const user = (await client.query('SELECT id, display_name, role, phone, staff_no, branch_id FROM users WHERE id = $1', [ctx.userId])).rows[0];
    const org = (await client.query('SELECT id, name FROM organisations WHERE id = $1', [ctx.orgId])).rows[0];
    return { id: user.id, displayName: user.display_name, role: user.role, phone: user.phone, staffNo: user.staff_no, branchId: user.branch_id, organisation: { id: org.id, name: org.name } };
  }));
}));

const pinSchema = z.object({ currentPin: z.string().min(4).max(64), newPin: z.string().regex(/^\d{6}$/, 'a new PIN is exactly six digits') });
router.post('/auth/pin', authenticate, wrap(async (req, res) => {
  const body = parse(pinSchema, req.body);
  await inOrg(req, async (client, ctx) => {
    const row = (await client.query('SELECT pin_hash FROM users WHERE id = $1', [ctx.userId])).rows[0];
    if (!(await bcrypt.compare(body.currentPin, row.pin_hash))) throw new UnauthorizedError('That is not your current PIN.');
    await client.query('UPDATE users SET pin_hash = $2 WHERE id = $1', [ctx.userId, await bcrypt.hash(body.newPin, 10)]);
    await audit(client, ctx, 'user.pin_change', 'user', ctx.userId);
  });
  res.json({ ok: true });
}));

// ---- team ---------------------------------------------------------------------------------------

router.get('/team', authenticate, requirePermission('team_write'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (client, ctx) => {
    const params: unknown[] = [];
    let where = 'NOT u.is_demo';
    if (ctx.branchId) {
      params.push(ctx.branchId);
      where += ` AND (u.branch_id = $1 OR u.branch_id IS NULL AND u.role <> 'owner')`;
    }
    const rows = (await client.query(`SELECT u.id, u.display_name, u.role, u.phone, u.staff_no, u.status, u.branch_id, b.name AS branch FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE ${where} ORDER BY u.created_at`, params)).rows;
    return rows.map((r) => ({ id: r.id, displayName: r.display_name, role: r.role, phone: r.phone, staffNo: r.staff_no, status: r.status, branchId: r.branch_id, branch: r.branch }));
  }));
}));

const newUserSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  phone: z.string().min(6).max(20),
  role: z.enum(ROLES),
  branchId: z.string().uuid().optional().nullable(),
  staffNo: z.string().trim().max(40).optional().nullable()
});

router.post('/team', authenticate, requirePermission('team_write'), requireWritable, wrap(async (req, res) => {
  const body = parse(newUserSchema, req.body);
  const created = await inOrg(req, async (client, ctx) => {
    if (!canGrantRole(ctx.role, body.role)) throw new UnauthorizedError('You cannot create a person with that role.');
    let phone: string;
    try {
      phone = normalisePhone(body.phone);
    } catch (error) {
      throw new BadRequestError(error instanceof Error ? error.message : 'that is not a valid phone number');
    }
    const taken = await client.query('SELECT 1 FROM resolve_login($1)', [phone]);
    if (taken.rows.length > 0) throw new ConflictError('That phone number already belongs to an account.');
    // a manager adds people to their own branch only
    const branchId = ctx.branchId ?? body.branchId ?? null;
    if (branchId) {
      const ok = await client.query('SELECT 1 FROM branches WHERE id = $1 AND NOT archived', [branchId]);
      if (ok.rows.length === 0) throw new NotFoundError('That branch was not found.');
    }
    if (body.role === 'supervisor' && !branchId) {
      const only = (await client.query('SELECT id FROM branches WHERE NOT archived AND NOT is_demo')).rows;
      if (only.length > 1) throw new BadRequestError('Say which branch this person works at.');
    }
    const pin = generatePin();
    const row = (await client.query(
      `INSERT INTO users (org_id, branch_id, role, display_name, phone, staff_no, pin_hash) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [ctx.orgId, branchId, body.role, body.displayName, phone, body.staffNo ?? null, await bcrypt.hash(pin, 10)]
    )).rows[0];
    await audit(client, ctx, 'user.create', 'user', row.id, { role: body.role, name: body.displayName }, branchId);
    return { id: row.id as string, phone, pin };
  });
  // the PIN is shown once and never stored in clear
  res.status(201).json({ ...created, pinShownOnce: true });
}));

const patchUserSchema = z.object({ status: z.enum(['active', 'disabled']).optional(), role: z.enum(ROLES).optional(), branchId: z.string().uuid().nullable().optional(), staffNo: z.string().trim().max(40).nullable().optional() });

router.patch('/team/:id', authenticate, requirePermission('team_write'), requireWritable, wrap(async (req, res) => {
  const body = parse(patchUserSchema, req.body);
  const id = String(req.params.id);
  res.json(await inOrg(req, async (client, ctx) => {
    const target = (await client.query('SELECT id, role, branch_id, status FROM users WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!target) throw new NotFoundError('That person was not found.');
    if (target.role === 'owner' || target.id === ctx.userId) throw new UnauthorizedError('That account cannot be changed here.');
    if (!canGrantRole(ctx.role, target.role)) throw new UnauthorizedError('You cannot change that person.');
    if (body.role && !canGrantRole(ctx.role, body.role)) throw new UnauthorizedError('You cannot give that role.');
    if (ctx.branchId && target.branch_id !== ctx.branchId) throw new UnauthorizedError('That person works at a different branch.');
    await client.query(
      `UPDATE users SET status = COALESCE($2, status), role = COALESCE($3, role), branch_id = CASE WHEN $4::boolean THEN $5 ELSE branch_id END, staff_no = CASE WHEN $6::boolean THEN $7 ELSE staff_no END WHERE id = $1`,
      [id, body.status ?? null, body.role ?? null, body.branchId !== undefined, body.branchId ?? null, body.staffNo !== undefined, body.staffNo ?? null]
    );
    await audit(client, ctx, 'user.update', 'user', id, { ...body });
    forgetStanding(ctx.orgId, id);
    return { id, updated: true };
  }));
}));

router.post('/team/:id/reset-pin', authenticate, requirePermission('team_write'), requireWritable, wrap(async (req, res) => {
  const id = String(req.params.id);
  const pin = generatePin();
  await inOrg(req, async (client, ctx) => {
    const target = (await client.query('SELECT id, role, branch_id FROM users WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!target) throw new NotFoundError('That person was not found.');
    if (target.role === 'owner' || !canGrantRole(ctx.role, target.role)) throw new UnauthorizedError('You cannot reset that PIN.');
    if (ctx.branchId && target.branch_id !== ctx.branchId) throw new UnauthorizedError('That person works at a different branch.');
    await client.query('UPDATE users SET pin_hash = $2 WHERE id = $1', [id, await bcrypt.hash(pin, 10)]);
    await audit(client, ctx, 'user.pin_reset', 'user', id);
  });
  res.json({ id, pin, pinShownOnce: true });
}));

// ---- branches -----------------------------------------------------------------------------------

router.get('/branches', authenticate, wrap(async (req, res) => {
  res.json(await inOrg(req, async (client, ctx) => {
    const params: unknown[] = [];
    let where = 'NOT archived';
    if (ctx.branchId) {
      params.push(ctx.branchId);
      where += ' AND id = $1';
    }
    const rows = (await client.query(`SELECT id, code, name, timezone, is_demo FROM branches WHERE ${where} ORDER BY is_demo, created_at`, params)).rows;
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, timezone: r.timezone, isSample: r.is_demo }));
  }));
}));

const branchSchema = z.object({ name: z.string().trim().min(2).max(120), code: z.string().regex(/^[A-Z0-9]{2,8}$/).optional() });

router.post('/branches', authenticate, requirePermission('branches_write'), requireWritable, wrap(async (req, res) => {
  const body = parse(branchSchema, req.body);
  const created = await inOrg(req, async (client, ctx) => {
    const taken = new Set((await client.query('SELECT code FROM branches')).rows.map((r) => r.code as string));
    const code = body.code ?? branchCodeFrom(body.name, taken);
    const row = (await client.query(`INSERT INTO branches (org_id, code, name) VALUES ($1, $2, $3) RETURNING id, code, name`, [ctx.orgId, code, body.name])).rows[0];
    await audit(client, ctx, 'branch.create', 'branch', row.id, { name: body.name }, row.id);
    return { id: row.id, code: row.code, name: row.name };
  });
  res.status(201).json(created);
}));

const branchPatch = z.object({ name: z.string().trim().min(2).max(120).optional() });
router.patch('/branches/:id', authenticate, requirePermission('branches_write'), requireWritable, wrap(async (req, res) => {
  const body = parse(branchPatch, req.body);
  res.json(await inOrg(req, async (client, ctx) => {
    const row = (await client.query(
      `UPDATE branches SET name = COALESCE($2, name) WHERE id = $1 RETURNING id, code, name`,
      [String(req.params.id), body.name ?? null]
    )).rows[0];
    if (!row) throw new NotFoundError('That branch was not found.');
    await audit(client, ctx, 'branch.update', 'branch', row.id, { ...body }, row.id);
    return { id: row.id, code: row.code, name: row.name };
  }));
}));

export default router;
