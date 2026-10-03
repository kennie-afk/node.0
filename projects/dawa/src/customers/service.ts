/** Customers with credit accounts, their ledger, and named price lists. */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError, NotFoundError } from '../domain/errors';
import { normalisePhone } from '../admin/phone';
import { audit, Ctx, need } from '../common/context';
import { can } from '../domain/roles';

export const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().nullable(),
  creditLimitCents: z.number().int().min(0).max(1_000_000_000).default(0),
  priceListId: z.string().uuid().optional().nullable()
});

function phoneOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return normalisePhone(raw);
  } catch {
    return raw;
  }
}

export async function createCustomer(client: PoolClient, ctx: Ctx, input: z.infer<typeof customerSchema>) {
  need(ctx, 'customers_write');
  // Giving someone credit or a special price is a financial decision: managers and owners only.
  if ((input.creditLimitCents > 0 || input.priceListId) && !can(ctx.role, 'discount')) {
    throw new AppError(403, 'forbidden', 'Only a manager or the owner can give a customer credit or a price list.');
  }
  const row = (
    await client.query(
      `INSERT INTO customers (org_id, name, phone, credit_limit_cents, price_list_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, phone, credit_limit_cents, price_list_id`,
      [ctx.orgId, input.name, phoneOf(input.phone), input.creditLimitCents, input.priceListId ?? null]
    )
  ).rows[0];
  await audit(client, ctx, 'customer.create', 'customer', row.id, { name: input.name, creditLimitCents: input.creditLimitCents });
  return { id: row.id as string, name: row.name as string, phone: row.phone as string | null, creditLimitCents: Number(row.credit_limit_cents), priceListId: row.price_list_id as string | null };
}

export async function updateCustomerTerms(client: PoolClient, ctx: Ctx, id: string, input: { creditLimitCents?: number; priceListId?: string | null; active?: boolean }) {
  need(ctx, 'discount');
  const row = (await client.query('SELECT * FROM customers WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!row) throw new NotFoundError('That customer was not found.');
  const limit = input.creditLimitCents ?? Number(row.credit_limit_cents);
  const list = input.priceListId === undefined ? row.price_list_id : input.priceListId;
  const active = input.active ?? row.active;
  await client.query('UPDATE customers SET credit_limit_cents = $2, price_list_id = $3, active = $4 WHERE id = $1', [id, limit, list, active]);
  await audit(client, ctx, 'customer.terms', 'customer', id, { from: Number(row.credit_limit_cents), to: limit });
  return { id, creditLimitCents: limit, priceListId: list as string | null, active: active as boolean };
}

export async function listCustomers(client: PoolClient, opts: { search?: string; limit?: number } = {}) {
  const params: unknown[] = [];
  let clause = 'c.active';
  if (opts.search) {
    params.push(`%${opts.search}%`);
    clause += ` AND (c.name ILIKE $1 OR c.phone ILIKE $1)`;
  }
  const rows = (
    await client.query(
      `SELECT c.id, c.name, c.phone, c.credit_limit_cents, c.price_list_id, COALESCE((SELECT sum(amount_cents) FROM customer_ledger l WHERE l.customer_id = c.id), 0)::bigint AS balance
         FROM customers c WHERE ${clause} ORDER BY c.name LIMIT ${Math.min(opts.limit ?? 100, 300)}`,
      params
    )
  ).rows;
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, phone: r.phone as string | null, creditLimitCents: Number(r.credit_limit_cents), priceListId: r.price_list_id as string | null, balanceCents: Number(r.balance) }));
}

export const accountPaymentSchema = z.object({
  amountCents: z.number().int().positive().max(1_000_000_000),
  method: z.enum(['cash', 'mpesa']),
  reference: z.string().trim().max(40).optional()
});

/** A customer pays down their account. The ledger gets a negative row; nothing is edited. */
export async function recordAccountPayment(client: PoolClient, ctx: Ctx, customerId: string, branchId: string | null, input: z.infer<typeof accountPaymentSchema>) {
  need(ctx, 'sell');
  const customer = (await client.query('SELECT id, name FROM customers WHERE id = $1 FOR UPDATE', [customerId])).rows[0];
  if (!customer) throw new NotFoundError('That customer was not found.');
  const balance = Number((await client.query('SELECT COALESCE(sum(amount_cents), 0)::bigint AS b FROM customer_ledger WHERE customer_id = $1', [customerId])).rows[0].b);
  if (input.amountCents > balance) throw new AppError(422, 'overpay', `${customer.name} owes only KSh ${(balance / 100).toLocaleString('en-KE')}.`);
  await client.query(
    `INSERT INTO customer_ledger (org_id, customer_id, branch_id, kind, amount_cents, ref_type, note, actor_id) VALUES ($1, $2, $3, 'payment', $4, 'account_payment', $5, $6)`,
    [ctx.orgId, customerId, branchId, -input.amountCents, `${input.method}${input.reference ? ` ${input.reference}` : ''}`, ctx.userId]
  );
  return { customerId, balanceCents: balance - input.amountCents };
}

export async function statement(client: PoolClient, customerId: string) {
  const customer = (await client.query('SELECT id, name, phone, credit_limit_cents FROM customers WHERE id = $1', [customerId])).rows[0];
  if (!customer) throw new NotFoundError('That customer was not found.');
  const rows = (await client.query('SELECT id, kind, amount_cents, note, created_at FROM customer_ledger WHERE customer_id = $1 ORDER BY id DESC LIMIT 200', [customerId])).rows;
  const balance = Number((await client.query('SELECT COALESCE(sum(amount_cents), 0)::bigint AS b FROM customer_ledger WHERE customer_id = $1', [customerId])).rows[0].b);
  return {
    customer: { id: customer.id as string, name: customer.name as string, phone: customer.phone as string | null, creditLimitCents: Number(customer.credit_limit_cents) },
    balanceCents: balance,
    entries: rows.map((r) => ({ id: Number(r.id), kind: r.kind as string, amountCents: Number(r.amount_cents), note: r.note as string | null, at: r.created_at as Date }))
  };
}

export const priceListSchema = z.object({ name: z.string().trim().min(2).max(60) });
export const priceItemSchema = z.object({ productId: z.string().uuid(), priceCents: z.number().int().min(0).max(1_000_000_000) });

export async function createPriceList(client: PoolClient, ctx: Ctx, input: z.infer<typeof priceListSchema>) {
  need(ctx, 'discount');
  const row = (await client.query('INSERT INTO price_lists (org_id, name) VALUES ($1, $2) RETURNING id, name', [ctx.orgId, input.name])).rows[0];
  return { id: row.id as string, name: row.name as string };
}

export async function setPriceListItem(client: PoolClient, ctx: Ctx, priceListId: string, input: z.infer<typeof priceItemSchema>) {
  need(ctx, 'discount');
  const list = (await client.query('SELECT id FROM price_lists WHERE id = $1', [priceListId])).rows[0];
  if (!list) throw new NotFoundError('That price list was not found.');
  const product = (await client.query('SELECT id FROM products WHERE id = $1', [input.productId])).rows[0];
  if (!product) throw new NotFoundError('That product was not found.');
  await client.query(
    `INSERT INTO price_list_items (org_id, price_list_id, product_id, price_cents) VALUES ($1, $2, $3, $4)
     ON CONFLICT (price_list_id, product_id) DO UPDATE SET price_cents = EXCLUDED.price_cents`,
    [ctx.orgId, priceListId, input.productId, input.priceCents]
  );
  await audit(client, ctx, 'pricelist.item', 'price_list', priceListId, { productId: input.productId, priceCents: input.priceCents });
  return { priceListId, productId: input.productId, priceCents: input.priceCents };
}

export async function listPriceLists(client: PoolClient) {
  const lists = (await client.query('SELECT id, name FROM price_lists ORDER BY name')).rows;
  const items = (await client.query('SELECT price_list_id, product_id, price_cents FROM price_list_items')).rows;
  return lists.map((l) => ({
    id: l.id as string,
    name: l.name as string,
    items: items.filter((i) => i.price_list_id === l.id).map((i) => ({ productId: i.product_id as string, priceCents: Number(i.price_cents) }))
  }));
}
