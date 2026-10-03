/** Clients, their sites and posts, QR checkpoints, and what each post is billed at. */
import { PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { audit, Ctx, need, pickBranch } from '../common/context';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors';
import { can } from '../domain/roles';

const text = (max: number) => z.string().trim().max(max);

export const clientSchema = z.object({
  name: text(160).min(2),
  contactName: text(120).optional().nullable(),
  contactPhone: text(30).optional().nullable(),
  contactEmail: text(160).optional().nullable(),
  kraPin: text(20).optional().nullable(),
  paymentTermsDays: z.number().int().min(0).max(365).optional()
});

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export async function createClient(client: PoolClient, ctx: Ctx, input: z.infer<typeof clientSchema>) {
  need(ctx, 'clients_write');
  const row = (
    await client.query(
      `INSERT INTO clients (org_id, name, contact_name, contact_phone, contact_email, kra_pin, payment_terms_days) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 30)) RETURNING id`,
      [ctx.orgId, input.name, blank(input.contactName), blank(input.contactPhone), blank(input.contactEmail), blank(input.kraPin), input.paymentTermsDays ?? null]
    )
  ).rows[0];
  await audit(client, ctx, 'client.create', 'client', row.id, { name: input.name });
  return getClient(client, ctx, row.id);
}

export async function updateClient(client: PoolClient, ctx: Ctx, id: string, input: Partial<z.infer<typeof clientSchema>> & { status?: 'active' | 'ended' }) {
  need(ctx, 'clients_write');
  const has = (k: string) => (input as Record<string, unknown>)[k] !== undefined;
  const r = await client.query(
    `UPDATE clients SET name = COALESCE($2, name), contact_name = CASE WHEN $3::boolean THEN $4 ELSE contact_name END, contact_phone = CASE WHEN $5::boolean THEN $6 ELSE contact_phone END,
        contact_email = CASE WHEN $7::boolean THEN $8 ELSE contact_email END, kra_pin = CASE WHEN $9::boolean THEN $10 ELSE kra_pin END,
        payment_terms_days = COALESCE($11, payment_terms_days), status = COALESCE($12, status) WHERE id = $1`,
    [id, input.name ?? null, has('contactName'), blank(input.contactName), has('contactPhone'), blank(input.contactPhone), has('contactEmail'), blank(input.contactEmail), has('kraPin'), blank(input.kraPin), input.paymentTermsDays ?? null, input.status ?? null]
  );
  if (r.rowCount === 0) throw new NotFoundError('That client was not found.');
  await audit(client, ctx, 'client.update', 'client', id, { fields: Object.keys(input) });
  return getClient(client, ctx, id);
}

const CLIENT_COLS = `c.id, c.name, c.contact_name, c.contact_phone, c.contact_email, c.kra_pin, c.payment_terms_days, c.status, c.portal_token IS NOT NULL AS has_portal,
  (SELECT count(*) FROM sites s WHERE s.client_id = c.id AND s.active)::int AS sites`;

function clientView(r: Record<string, any>) {
  return { id: r.id, name: r.name, contactName: r.contact_name, contactPhone: r.contact_phone, contactEmail: r.contact_email, kraPin: r.kra_pin, paymentTermsDays: r.payment_terms_days, status: r.status, hasPortal: r.has_portal, sites: r.sites };
}

export async function getClient(client: PoolClient, _ctx: Ctx, id: string) {
  const r = (await client.query(`SELECT ${CLIENT_COLS} FROM clients c WHERE c.id = $1`, [id])).rows[0];
  if (!r) throw new NotFoundError('That client was not found.');
  return clientView(r);
}

export async function listClients(client: PoolClient, opts: { q?: string; page: number; pageSize: number }) {
  const params: unknown[] = [];
  let where = '';
  if (opts.q) {
    params.push(`%${opts.q.replace(/[%_\\]/g, '\\$&')}%`);
    where = 'WHERE c.name ILIKE $1';
  }
  const total = Number((await client.query(`SELECT count(*) AS n FROM clients c ${where}`, params)).rows[0].n);
  const rows = (await client.query(`SELECT ${CLIENT_COLS} FROM clients c ${where} ORDER BY c.status, c.name LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`, params)).rows;
  return { items: rows.map(clientView), total, page: opts.page, pageSize: opts.pageSize };
}

/** The client's read-only link. Rotating it kills the old one. The token is the only secret; it shows attendance verification and nothing else. */
export async function setPortal(client: PoolClient, ctx: Ctx, id: string, enabled: boolean): Promise<{ token: string | null }> {
  need(ctx, 'clients_write');
  const token = enabled ? randomBytes(24).toString('base64url') : null;
  const r = await client.query('UPDATE clients SET portal_token = $2 WHERE id = $1', [id, token]);
  if (r.rowCount === 0) throw new NotFoundError('That client was not found.');
  await audit(client, ctx, enabled ? 'client.portal_enable' : 'client.portal_disable', 'client', id);
  return { token };
}

export async function getPortalToken(client: PoolClient, ctx: Ctx, id: string): Promise<{ token: string | null }> {
  need(ctx, 'clients_write');
  const r = (await client.query('SELECT portal_token FROM clients WHERE id = $1', [id])).rows[0];
  if (!r) throw new NotFoundError('That client was not found.');
  return { token: r.portal_token };
}

// ---- sites, posts, checkpoints -------------------------------------------------------------------

export const siteSchema = z.object({
  clientId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  name: text(160).min(2),
  address: text(300).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  geofenceM: z.number().int().min(20).max(5000).optional().nullable(),
  checkpointsOrdered: z.boolean().optional(),
  roundsPerShift: z.number().int().min(0).max(48).optional(),
  postName: text(120).optional()
});

const SITE_COLS = `s.id, s.client_id, c.name AS client, s.branch_id, b.name AS branch, s.name, s.address, s.lat, s.lng, s.geofence_m, s.checkpoints_ordered, s.rounds_per_shift, s.active,
  (SELECT count(*) FROM checkpoints k WHERE k.site_id = s.id AND k.active)::int AS checkpoints`;

function siteView(r: Record<string, any>) {
  return { id: r.id, clientId: r.client_id, client: r.client, branchId: r.branch_id, branch: r.branch, name: r.name, address: r.address, lat: r.lat, lng: r.lng, geofenceM: r.geofence_m, checkpointsOrdered: r.checkpoints_ordered, roundsPerShift: r.rounds_per_shift, active: r.active, checkpoints: r.checkpoints };
}

export async function createSite(client: PoolClient, ctx: Ctx, input: z.infer<typeof siteSchema>) {
  need(ctx, 'sites_write');
  if ((input.lat == null) !== (input.lng == null)) throw new BadRequestError('Give both latitude and longitude, or neither.');
  const branch = await pickBranch(client, ctx, input.branchId);
  const row = (
    await client.query(
      `INSERT INTO sites (org_id, branch_id, client_id, name, address, lat, lng, geofence_m, checkpoints_ordered, rounds_per_shift) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [ctx.orgId, branch.id, input.clientId, input.name, blank(input.address), input.lat ?? null, input.lng ?? null, input.geofenceM ?? null, input.checkpointsOrdered ?? false, input.roundsPerShift ?? 0]
    )
  ).rows[0];
  await client.query('INSERT INTO posts (org_id, site_id, name) VALUES ($1, $2, $3)', [ctx.orgId, row.id, input.postName?.trim() || 'Main post']);
  await audit(client, ctx, 'site.create', 'site', row.id, { name: input.name }, branch.id);
  return getSite(client, ctx, row.id);
}

export async function updateSite(client: PoolClient, ctx: Ctx, id: string, input: Partial<Omit<z.infer<typeof siteSchema>, 'clientId' | 'branchId' | 'postName'>> & { active?: boolean }) {
  need(ctx, 'sites_write');
  const has = (k: string) => (input as Record<string, unknown>)[k] !== undefined;
  if (has('lat') !== has('lng')) throw new BadRequestError('Give both latitude and longitude, or neither.');
  if (has('lat') && (input.lat == null) !== (input.lng == null)) throw new BadRequestError('Give both latitude and longitude, or neither.');
  const r = await client.query(
    `UPDATE sites SET name = COALESCE($2, name), address = CASE WHEN $3::boolean THEN $4 ELSE address END, lat = CASE WHEN $5::boolean THEN $6::double precision ELSE lat END,
       lng = CASE WHEN $5::boolean THEN $7::double precision ELSE lng END, geofence_m = CASE WHEN $8::boolean THEN $9::int ELSE geofence_m END,
       checkpoints_ordered = COALESCE($10, checkpoints_ordered), rounds_per_shift = COALESCE($11, rounds_per_shift), active = COALESCE($12, active) WHERE id = $1`,
    [id, input.name ?? null, has('address'), blank(input.address), has('lat'), input.lat ?? null, input.lng ?? null, has('geofenceM'), input.geofenceM ?? null, input.checkpointsOrdered ?? null, input.roundsPerShift ?? null, input.active ?? null]
  );
  if (r.rowCount === 0) throw new NotFoundError('That site was not found.');
  await audit(client, ctx, 'site.update', 'site', id, { fields: Object.keys(input) });
  return getSite(client, ctx, id);
}

export async function getSite(client: PoolClient, ctx: Ctx, id: string) {
  const r = (await client.query(`SELECT ${SITE_COLS} FROM sites s JOIN clients c ON c.id = s.client_id JOIN branches b ON b.id = s.branch_id WHERE s.id = $1`, [id])).rows[0];
  if (!r || (ctx.branchId && r.branch_id !== ctx.branchId)) throw new NotFoundError('That site was not found.');
  return siteView(r);
}

export async function listSites(client: PoolClient, ctx: Ctx, opts: { q?: string; clientId?: string; active?: boolean; page: number; pageSize: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (ctx.branchId) add('s.branch_id = ?', ctx.branchId);
  if (opts.clientId) add('s.client_id = ?', opts.clientId);
  if (opts.active !== undefined) add('s.active = ?', opts.active);
  if (opts.q) add('(s.name ILIKE ? OR c.name ILIKE ?)'.replace(/\?/g, `$${params.length + 1}`), `%${opts.q.replace(/[%_\\]/g, '\\$&')}%`);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((await client.query(`SELECT count(*) AS n FROM sites s JOIN clients c ON c.id = s.client_id ${clause}`, params)).rows[0].n);
  const rows = (await client.query(`SELECT ${SITE_COLS} FROM sites s JOIN clients c ON c.id = s.client_id JOIN branches b ON b.id = s.branch_id ${clause} ORDER BY s.active DESC, c.name, s.name LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`, params)).rows;
  return { items: rows.map(siteView), total, page: opts.page, pageSize: opts.pageSize };
}

export async function listPosts(client: PoolClient, siteId: string) {
  const rows = (await client.query('SELECT id, site_id, name, guards_required, active FROM posts WHERE site_id = $1 ORDER BY active DESC, name', [siteId])).rows;
  return rows.map((r) => ({ id: r.id, siteId: r.site_id, name: r.name, guardsRequired: r.guards_required, active: r.active }));
}

export const postSchema = z.object({ name: text(120).min(1), guardsRequired: z.number().int().min(1).max(50).optional() });

export async function createPost(client: PoolClient, ctx: Ctx, siteId: string, input: z.infer<typeof postSchema>) {
  need(ctx, 'sites_write');
  await getSite(client, ctx, siteId);
  const row = (await client.query('INSERT INTO posts (org_id, site_id, name, guards_required) VALUES ($1, $2, $3, COALESCE($4, 1)) RETURNING id', [ctx.orgId, siteId, input.name, input.guardsRequired ?? null])).rows[0];
  await audit(client, ctx, 'post.create', 'post', row.id, { name: input.name });
  return (await listPosts(client, siteId)).find((p) => p.id === row.id)!;
}

export async function updatePost(client: PoolClient, ctx: Ctx, id: string, input: { name?: string; guardsRequired?: number; active?: boolean }) {
  need(ctx, 'sites_write');
  const r = await client.query('UPDATE posts SET name = COALESCE($2, name), guards_required = COALESCE($3, guards_required), active = COALESCE($4, active) WHERE id = $1 RETURNING site_id', [id, input.name ?? null, input.guardsRequired ?? null, input.active ?? null]);
  if (!r.rows[0]) throw new NotFoundError('That post was not found.');
  await audit(client, ctx, 'post.update', 'post', id, { ...input });
  return (await listPosts(client, r.rows[0].site_id)).find((p) => p.id === id)!;
}

export async function listCheckpoints(client: PoolClient, ctx: Ctx, siteId: string) {
  await getSite(client, ctx, siteId);
  const rows = (await client.query('SELECT id, name, seq, token, active FROM checkpoints WHERE site_id = $1 ORDER BY active DESC, seq', [siteId])).rows;
  // the token is what the printed QR carries: only people who may scan or manage sites see it
  const showToken = can(ctx.role, 'sites_write') || can(ctx.role, 'patrol_scan');
  return rows.map((r) => ({ id: r.id, name: r.name, seq: r.seq, active: r.active, ...(showToken ? { token: r.token } : {}) }));
}

export async function createCheckpoint(client: PoolClient, ctx: Ctx, siteId: string, name: string) {
  need(ctx, 'sites_write');
  await getSite(client, ctx, siteId);
  const seq = Number((await client.query('SELECT COALESCE(max(seq), 0) + 1 AS n FROM checkpoints WHERE site_id = $1', [siteId])).rows[0].n);
  const row = (await client.query('INSERT INTO checkpoints (org_id, site_id, name, seq, token) VALUES ($1, $2, $3, $4, $5) RETURNING id', [ctx.orgId, siteId, name.trim(), seq, randomBytes(12).toString('base64url')])).rows[0];
  await audit(client, ctx, 'checkpoint.create', 'checkpoint', row.id, { name });
  return (await listCheckpoints(client, ctx, siteId)).find((c) => c.id === row.id)!;
}

/** A new QR: the old token stops working at once (a wall QR was photographed, or a plate was replaced). */
export async function rotateCheckpoint(client: PoolClient, ctx: Ctx, id: string) {
  need(ctx, 'sites_write');
  const r = await client.query('UPDATE checkpoints SET token = $2 WHERE id = $1 RETURNING site_id', [id, randomBytes(12).toString('base64url')]);
  if (!r.rows[0]) throw new NotFoundError('That checkpoint was not found.');
  await audit(client, ctx, 'checkpoint.rotate', 'checkpoint', id);
  return (await listCheckpoints(client, ctx, r.rows[0].site_id)).find((c) => c.id === id)!;
}

export async function setCheckpointActive(client: PoolClient, ctx: Ctx, id: string, active: boolean) {
  need(ctx, 'sites_write');
  const r = await client.query('UPDATE checkpoints SET active = $2 WHERE id = $1 RETURNING site_id', [id, active]);
  if (!r.rows[0]) throw new NotFoundError('That checkpoint was not found.');
  await audit(client, ctx, active ? 'checkpoint.enable' : 'checkpoint.disable', 'checkpoint', id);
  return (await listCheckpoints(client, ctx, r.rows[0].site_id)).find((c) => c.id === id)!;
}

// ---- what each post is billed at ---------------------------------------------------------------------

export const rateSchema = z.object({
  postId: z.string().uuid().optional().nullable(),
  basis: z.enum(['per_shift', 'per_hour']),
  amountCents: z.number().int().min(1).max(10_000_000_000),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export async function addRate(client: PoolClient, ctx: Ctx, siteId: string, input: z.infer<typeof rateSchema>) {
  need(ctx, 'invoices_write');
  await getSite(client, ctx, siteId);
  if (input.postId) {
    const ok = await client.query('SELECT 1 FROM posts WHERE id = $1 AND site_id = $2', [input.postId, siteId]);
    if (ok.rows.length === 0) throw new ConflictError('That post does not belong to this site.');
  }
  const row = (await client.query('INSERT INTO site_rates (org_id, site_id, post_id, basis, amount_cents, effective_from, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [ctx.orgId, siteId, input.postId ?? null, input.basis, input.amountCents, input.effectiveFrom, ctx.userId])).rows[0];
  await audit(client, ctx, 'rate.add', 'site', siteId, { ...input });
  return row.id as string;
}

export async function listRates(client: PoolClient, ctx: Ctx, siteId: string) {
  await getSite(client, ctx, siteId);
  const rows = (await client.query(`SELECT r.id, r.post_id, p.name AS post, r.basis, r.amount_cents, to_char(r.effective_from, 'YYYY-MM-DD') AS effective_from FROM site_rates r LEFT JOIN posts p ON p.id = r.post_id WHERE r.site_id = $1 ORDER BY r.effective_from DESC, r.created_at DESC`, [siteId])).rows;
  return rows.map((r) => ({ id: r.id, postId: r.post_id, post: r.post, basis: r.basis, amountCents: Number(r.amount_cents), effectiveFrom: r.effective_from }));
}

/** Active posts with their site and client, for the roster's pickers: one page, searchable, never the whole firm at once. */
export async function listAllPosts(client: PoolClient, ctx: Ctx, opts: { q?: string; siteId?: string; page: number; pageSize: number }) {
  const where = ['p.active', 's.active'];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace(/\?/g, `$${params.length}`)); };
  if (ctx.branchId) add('s.branch_id = ?', ctx.branchId);
  if (opts.siteId) add('s.id = ?', opts.siteId);
  if (opts.q) add('(s.name ILIKE ? OR c.name ILIKE ? OR p.name ILIKE ?)', `%${opts.q.replace(/[%_\\]/g, '\\$&')}%`);
  const from = 'FROM posts p JOIN sites s ON s.id = p.site_id JOIN clients c ON c.id = s.client_id';
  const total = Number((await client.query(`SELECT count(*) AS n ${from} WHERE ${where.join(' AND ')}`, params)).rows[0].n);
  const rows = (await client.query(`SELECT p.id, p.name, p.site_id, s.name AS site, c.name AS client ${from} WHERE ${where.join(' AND ')} ORDER BY c.name, s.name, p.name LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`, params)).rows;
  return { items: rows.map((r) => ({ id: r.id, name: r.name, siteId: r.site_id, site: r.site, client: r.client })), total, page: opts.page, pageSize: opts.pageSize };
}
