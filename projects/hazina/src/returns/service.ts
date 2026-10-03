import { PoolClient } from 'pg';
import { z } from 'zod';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors';
import { Ctx, audit } from '../common/context';
import { Definition, defaultTemplates, definitionSchema, generate } from './engine';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function today(client: PoolClient): Promise<string> {
  return (await client.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS d`)).rows[0].d as string;
}

/** Called once when an organisation is created. */
export async function seedTemplates(client: PoolClient, orgId: string, kind: 'sacco' | 'lender'): Promise<void> {
  for (const t of defaultTemplates(kind)) {
    await client.query(`INSERT INTO return_templates (org_id, code, name, definition) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT DO NOTHING`, [orgId, t.code, t.name, JSON.stringify(t.definition)]);
  }
}

export async function listTemplates(client: PoolClient) {
  const rows = (await client.query(`SELECT DISTINCT ON (code) id, code, name, version, created_at FROM return_templates ORDER BY code, version DESC`)).rows;
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, version: r.version, isOfficial: false, createdAt: r.created_at }));
}

export const templateSchema = z.object({ code: z.string().regex(/^[A-Z0-9-]{3,40}$/), name: z.string().trim().min(2).max(160), definition: definitionSchema });

/** Adding a regulator's format later: a new template (or a new version of one). The old version stays, for the returns made with it. */
export async function addTemplate(client: PoolClient, ctx: Ctx, input: z.infer<typeof templateSchema>) {
  const latest = (await client.query('SELECT max(version) AS v FROM return_templates WHERE code = $1', [input.code])).rows[0].v as number | null;
  const version = (latest ?? 0) + 1;
  const row = (await client.query(
    `INSERT INTO return_templates (org_id, code, name, version, definition, created_by) VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
    [ctx.orgId, input.code, input.name, version, JSON.stringify(input.definition), ctx.userId]
  )).rows[0];
  await audit(client, ctx, 'returns.template_add', 'return_template', row.id, { code: input.code, version });
  return { id: row.id as string, code: input.code, version };
}

export const generateSchema = z.object({ templateId: z.string().uuid(), from: day, to: day });

export async function generateReturn(client: PoolClient, ctx: Ctx, input: z.infer<typeof generateSchema>) {
  if (input.to < input.from) throw new BadRequestError('The period ends before it starts.');
  const template = (await client.query('SELECT * FROM return_templates WHERE id = $1', [input.templateId])).rows[0];
  if (!template) throw new NotFoundError('That return template was not found.');
  const parsed = definitionSchema.safeParse(template.definition);
  if (!parsed.success) throw new ConflictError('That template is not valid any more.');
  const payload = await generate(client, parsed.data as Definition, input.from, input.to, await today(client));
  const row = (await client.query(
    `INSERT INTO returns (org_id, template_id, period_start, period_end, payload, generated_by) VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id, created_at`,
    [ctx.orgId, input.templateId, input.from, input.to, JSON.stringify({ template: { code: template.code, name: template.name, version: template.version }, ...payload }), ctx.userId]
  )).rows[0];
  await audit(client, ctx, 'returns.generate', 'return', row.id, { code: template.code, version: template.version, from: input.from, to: input.to });
  return { id: row.id as string, createdAt: row.created_at as Date, payload };
}

export async function listReturns(client: PoolClient, limit: number) {
  const rows = (await client.query(
    `SELECT r.id, r.period_start, r.period_end, r.created_at, t.code, t.name, t.version FROM returns r JOIN return_templates t ON t.id = r.template_id ORDER BY r.created_at DESC LIMIT $1`, [limit]
  )).rows;
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, version: r.version, periodStart: r.period_start, periodEnd: r.period_end, createdAt: r.created_at }));
}

export async function getReturn(client: PoolClient, id: string) {
  const r = (await client.query('SELECT id, payload, period_start, period_end, created_at FROM returns WHERE id = $1', [id])).rows[0];
  if (!r) throw new NotFoundError('That return was not found.');
  return { id: r.id, periodStart: r.period_start, periodEnd: r.period_end, createdAt: r.created_at, payload: r.payload };
}
