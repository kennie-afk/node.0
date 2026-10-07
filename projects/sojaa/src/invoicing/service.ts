/**
 * Client invoicing from verified shifts. An invoice bills only shifts with a check-in AND a check-out, at the site's rate on that day; a
 * shift can be billed once (unique key). Invoices, lines, evidence, credit notes, payments and allocations are append-only: a mistake is a
 * credit note. Debtors are computed from those facts.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { audit, Ctx, getSettings, need } from '../common/context';
import { nextCounter, pad } from '../common/counters';
import { addDays, localDayOf, monthBounds, TZ } from '../common/time';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors';
import { verifiedMinutes } from '../ops/attendance';
import { AGEING, allocateCost, allocatePayment, BillableShift, buildInvoice, Rate } from './compute';
import { ATTENDANCE_SQL } from '../ops/attendance-service';

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

async function lock(client: PoolClient, key: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}

async function loadRates(client: PoolClient, siteIds: string[]): Promise<Rate[]> {
  if (siteIds.length === 0) return [];
  const rows = (await client.query(`SELECT id, site_id, post_id, basis, amount_cents, to_char(effective_from, 'YYYY-MM-DD') AS effective_from, row_number() OVER (ORDER BY created_at, id)::int AS seq FROM site_rates WHERE site_id = ANY($1::uuid[])`, [siteIds])).rows;
  return rows.map((r) => ({ id: r.id, siteId: r.site_id, postId: r.post_id, basis: r.basis, amountCents: Number(r.amount_cents), effectiveFrom: r.effective_from, seq: r.seq }));
}

export const generateSchema = z.object({ clientId: z.string().uuid(), month: z.string().regex(monthRe) });

/** Verified-and-unbilled shifts of a client in a month, with how many minutes count. */
async function billableShifts(client: PoolClient, clientId: string, month: string) {
  const { first, nextFirst } = monthBounds(month);
  const settings = await getSettings(client);
  const rows = (
    await client.query(
      `SELECT s.id, s.site_id, si.name AS site, s.post_id, p.name AS post, s.start_at, s.end_at, s.scheduled_minutes, s.guard_id, ${ATTENDANCE_SQL}
         FROM shifts s JOIN sites si ON si.id = s.site_id JOIN posts p ON p.id = s.post_id
        WHERE si.client_id = $1 AND s.status = 'scheduled' AND s.guard_id IS NOT NULL AND s.end_at <= now()
          AND s.start_at >= ($2::date::timestamp AT TIME ZONE '${TZ}') AND s.start_at < ($3::date::timestamp AT TIME ZONE '${TZ}')
          AND NOT EXISTS (SELECT 1 FROM client_invoice_shifts x WHERE x.shift_id = s.id) ORDER BY s.start_at, s.id`,
      [clientId, first, nextFirst]
    )
  ).rows;
  const shifts: BillableShift[] = rows.map((r) => ({
    shiftId: r.id, siteId: r.site_id, siteName: r.site, postId: r.post_id, postName: r.post, day: localDayOf(r.start_at),
    verifiedMinutes: verifiedMinutes({ startAt: r.start_at, endAt: r.end_at, scheduledMinutes: r.scheduled_minutes }, { inAt: r.in_at, outAt: r.out_at, inOverridden: false, outOverridden: false }, settings.billBasis, settings.lateGraceMinutes)
  }));
  return shifts;
}

/** What generating now would bill, without writing: the figure a payroll person checks before issuing. */
export async function previewInvoice(client: PoolClient, ctx: Ctx, input: z.infer<typeof generateSchema>) {
  need(ctx, 'invoices_write');
  const shifts = await billableShifts(client, input.clientId, input.month);
  const rates = await loadRates(client, [...new Set(shifts.map((s) => s.siteId))]);
  const built = buildInvoice(shifts, rates);
  return { month: input.month, totalCents: built.total, billedShifts: built.lines.reduce((n, l) => n + l.shifts.length, 0), notVerified: built.unbillable.filter((u) => u.reason === 'not_verified').length, noRate: built.unbillable.filter((u) => u.reason === 'no_rate').length, lines: built.lines.map((l) => ({ description: l.description, basis: l.basis, quantity: l.quantity, unitCents: l.unitCents, amountCents: l.amountCents })) };
}

export async function generateInvoice(client: PoolClient, ctx: Ctx, input: z.infer<typeof generateSchema>, opts: { issueDate?: string } = {}) {
  need(ctx, 'invoices_write');
  const c = (await client.query('SELECT id, payment_terms_days FROM clients WHERE id = $1', [input.clientId])).rows[0];
  if (!c) throw new NotFoundError('That client was not found.');
  if (input.month > localDayOf(new Date()).slice(0, 7)) throw new BadRequestError('That month has not started yet.');
  await lock(client, `invoice:${ctx.orgId}:${input.clientId}:${input.month}`);
  const shifts = await billableShifts(client, input.clientId, input.month);
  const rates = await loadRates(client, [...new Set(shifts.map((s) => s.siteId))]);
  const built = buildInvoice(shifts, rates);
  const notVerified = built.unbillable.filter((u) => u.reason === 'not_verified').length;
  const noRate = built.unbillable.filter((u) => u.reason === 'no_rate').length;
  if (built.lines.length === 0) throw new ConflictError(`Nothing to bill for ${input.month}: ${notVerified} shift(s) had no verified attendance and ${noRate} had no rate.`);
  // opts.issueDate exists for the sample organisation only (so it can show an overdue invoice); the API never passes it
  const today = opts.issueDate ?? localDayOf(new Date());
  const due = addDays(today, c.payment_terms_days);
  const n = await nextCounter(client, ctx.orgId, `invoice-${today.slice(0, 4)}`);
  const number = `INV-${today.slice(0, 4)}-${pad(n, 5)}`;
  const inv = (
    await client.query(
      `INSERT INTO client_invoices (org_id, client_id, number, month, issue_date, due_date, total_cents, verified_shifts, unverified_shifts, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [ctx.orgId, input.clientId, number, input.month, today, due, built.total, built.lines.reduce((k, l) => k + l.shifts.length, 0), notVerified + noRate, ctx.userId]
    )
  ).rows[0];
  for (const line of built.lines) {
    const l = (
      await client.query(
        `INSERT INTO client_invoice_lines (org_id, invoice_id, site_id, post_id, description, basis, quantity, unit_cents, amount_cents) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [ctx.orgId, inv.id, line.siteId, line.postId, line.description, line.basis, line.quantity, line.unitCents, line.amountCents]
      )
    ).rows[0];
    for (const s of line.shifts) await client.query('INSERT INTO client_invoice_shifts (org_id, invoice_id, line_id, shift_id, verified_minutes, billed_cents) VALUES ($1, $2, $3, $4, $5, $6)', [ctx.orgId, inv.id, l.id, s.shiftId, s.verifiedMinutes, s.billedCents]);
  }
  await applyCredit(client, ctx, input.clientId, inv.id, built.total);
  await audit(client, ctx, 'invoice.generate', 'client_invoice', inv.id, { number, month: input.month, totalCents: built.total, shifts: built.lines.reduce((k, l) => k + l.shifts.length, 0), notVerified, noRate });
  return { ...(await getInvoice(client, ctx, inv.id)), notVerified, noRate };
}

/** Money the client has already paid on account (payments not yet allocated) goes to the new invoice, oldest payment first. */
async function applyCredit(client: PoolClient, ctx: Ctx, clientId: string, invoiceId: string, totalCents: number) {
  const rows = (
    await client.query(
      `SELECT p.id, p.amount_cents - COALESCE((SELECT sum(a.amount_cents) FROM client_payment_allocations a WHERE a.payment_id = p.id), 0) AS remaining FROM client_payments p WHERE p.client_id = $1 ORDER BY p.received_on, p.created_at, p.id`,
      [clientId]
    )
  ).rows;
  let need = totalCents;
  for (const r of rows) {
    const remaining = Number(r.remaining);
    if (need <= 0) break;
    if (remaining <= 0) continue;
    const take = Math.min(need, remaining);
    await client.query('INSERT INTO client_payment_allocations (org_id, payment_id, invoice_id, amount_cents) VALUES ($1, $2, $3, $4)', [ctx.orgId, r.id, invoiceId, take]);
    need -= take;
  }
}

const BALANCE_SQL = `i.total_cents
   - COALESCE((SELECT sum(n.amount_cents) FROM client_credit_notes n WHERE n.invoice_id = i.id), 0)
   - COALESCE((SELECT sum(a.amount_cents) FROM client_payment_allocations a WHERE a.invoice_id = i.id), 0)`;

function statusOf(total: number, balance: number, due: string, today: string): 'paid' | 'part_paid' | 'open' | 'overdue' {
  if (balance <= 0) return 'paid';
  if (due < today) return 'overdue';
  return balance < total ? 'part_paid' : 'open';
}

const invoiceView = (r: Record<string, any>, today: string) => {
  const total = Number(r.total_cents);
  const balance = Number(r.balance);
  return {
    id: r.id, number: r.number, clientId: r.client_id, client: r.client, month: r.month, issueDate: r.issue_date, dueDate: r.due_date, totalCents: total, creditedCents: Number(r.credited),
    paidCents: Number(r.paid), balanceCents: balance, status: statusOf(total, balance, r.due_date, today), verifiedShifts: r.verified_shifts, unverifiedShifts: r.unverified_shifts, disputed: r.disputed
  };
};

const DISPUTED = `COALESCE((SELECT e.kind = 'dispute' FROM client_invoice_events e WHERE e.invoice_id = i.id AND e.kind IN ('dispute', 'resolve') ORDER BY e.id DESC LIMIT 1), false)`;
const INV_COLS = `i.id, i.number, i.client_id, c.name AS client, i.month, to_char(i.issue_date, 'YYYY-MM-DD') AS issue_date, to_char(i.due_date, 'YYYY-MM-DD') AS due_date, i.total_cents, i.verified_shifts, i.unverified_shifts,
   COALESCE((SELECT sum(n.amount_cents) FROM client_credit_notes n WHERE n.invoice_id = i.id), 0) AS credited,
   COALESCE((SELECT sum(a.amount_cents) FROM client_payment_allocations a WHERE a.invoice_id = i.id), 0) AS paid,
   ${BALANCE_SQL} AS balance, ${DISPUTED} AS disputed`;

export async function listInvoices(client: PoolClient, opts: { clientId?: string; status?: string; month?: string; page: number; pageSize: number }) {
  const today = localDayOf(new Date());
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.clientId) { params.push(opts.clientId); where.push(`i.client_id = $${params.length}`); }
  if (opts.month) { params.push(opts.month); where.push(`i.month = $${params.length}`); }
  if (opts.status === 'paid') where.push(`(${BALANCE_SQL}) <= 0`);
  else if (opts.status === 'overdue') { params.push(today); where.push(`(${BALANCE_SQL}) > 0 AND i.due_date < $${params.length}::date`); }
  else if (opts.status === 'open') where.push(`(${BALANCE_SQL}) > 0`);
  else if (opts.status === 'disputed') where.push(DISPUTED);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((await client.query(`SELECT count(*) AS n FROM client_invoices i ${clause}`, params)).rows[0].n);
  const rows = (await client.query(`SELECT ${INV_COLS} FROM client_invoices i JOIN clients c ON c.id = i.client_id ${clause} ORDER BY i.issue_date DESC, i.number DESC LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`, params)).rows;
  return { items: rows.map((r) => invoiceView(r, today)), total, page: opts.page, pageSize: opts.pageSize };
}

export async function getInvoice(client: PoolClient, _ctx: Ctx, id: string) {
  const today = localDayOf(new Date());
  const r = (await client.query(`SELECT ${INV_COLS} FROM client_invoices i JOIN clients c ON c.id = i.client_id WHERE i.id = $1`, [id])).rows[0];
  if (!r) throw new NotFoundError('That invoice was not found.');
  const lines = (await client.query('SELECT id, description, basis, quantity, unit_cents, amount_cents FROM client_invoice_lines WHERE invoice_id = $1 ORDER BY description, unit_cents', [id])).rows;
  const credits = (await client.query('SELECT n.id, n.number, n.amount_cents, n.reason, n.created_at, u.display_name AS by FROM client_credit_notes n LEFT JOIN users u ON u.id = n.created_by WHERE n.invoice_id = $1 ORDER BY n.created_at', [id])).rows;
  const events = (await client.query('SELECT e.id, e.kind, e.body, e.at, u.display_name AS by FROM client_invoice_events e LEFT JOIN users u ON u.id = e.by_user WHERE e.invoice_id = $1 ORDER BY e.id', [id])).rows;
  const payments = (await client.query(`SELECT p.id, a.amount_cents, p.method, p.reference, to_char(p.received_on, 'YYYY-MM-DD') AS received_on FROM client_payment_allocations a JOIN client_payments p ON p.id = a.payment_id WHERE a.invoice_id = $1 ORDER BY p.received_on`, [id])).rows;
  return {
    ...invoiceView(r, today),
    lines: lines.map((l) => ({ id: l.id, description: l.description, basis: l.basis, quantity: Number(l.quantity), unitCents: Number(l.unit_cents), amountCents: Number(l.amount_cents) })),
    creditNotes: credits.map((n) => ({ id: n.id, number: n.number, amountCents: Number(n.amount_cents), reason: n.reason, createdAt: n.created_at, by: n.by })),
    events: events.map((e) => ({ id: Number(e.id), kind: e.kind, body: e.body, at: e.at, by: e.by })),
    payments: payments.map((p) => ({ id: p.id, amountCents: Number(p.amount_cents), method: p.method, reference: p.reference, receivedOn: p.received_on }))
  };
}

/** The evidence: every shift an invoice bills, with when the guard was verified present. This is what answers "you billed us for shifts nobody worked". */
export async function invoiceEvidence(client: PoolClient, id: string) {
  const rows = (
    await client.query(
      `SELECT x.shift_id, si.name AS site, p.name AS post, g.full_name AS guard, g.guard_no, s.start_at, s.end_at, x.verified_minutes, x.billed_cents, ${ATTENDANCE_SQL}
         FROM client_invoice_shifts x JOIN shifts s ON s.id = x.shift_id JOIN sites si ON si.id = s.site_id JOIN posts p ON p.id = s.post_id LEFT JOIN guards g ON g.id = s.guard_id
        WHERE x.invoice_id = $1 ORDER BY s.start_at, si.name`,
      [id]
    )
  ).rows;
  return rows.map((r) => ({ shiftId: r.shift_id, site: r.site, post: r.post, guard: r.guard, guardNo: r.guard_no, startAt: r.start_at, endAt: r.end_at, inAt: r.in_at, outAt: r.out_at, inOverridden: r.in_overridden, outOverridden: r.out_overridden, geofence: r.in_geofence, verifiedMinutes: r.verified_minutes, billedCents: Number(r.billed_cents) }));
}

export const creditSchema = z.object({ amountCents: z.number().int().min(1).max(100_000_000_000), reason: z.string().trim().min(5).max(500) });

export async function creditNote(client: PoolClient, ctx: Ctx, invoiceId: string, input: z.infer<typeof creditSchema>) {
  need(ctx, 'invoices_write');
  await lock(client, `invoice-credit:${invoiceId}`);
  const inv = (await client.query('SELECT total_cents, number FROM client_invoices WHERE id = $1', [invoiceId])).rows[0];
  if (!inv) throw new NotFoundError('That invoice was not found.');
  const credited = Number((await client.query('SELECT COALESCE(sum(amount_cents), 0) AS n FROM client_credit_notes WHERE invoice_id = $1', [invoiceId])).rows[0].n);
  if (credited + input.amountCents > Number(inv.total_cents)) throw new ConflictError('Credit notes cannot add up to more than the invoice.');
  const n = await nextCounter(client, ctx.orgId, `credit-${localDayOf(new Date()).slice(0, 4)}`);
  const number = `CN-${localDayOf(new Date()).slice(0, 4)}-${pad(n, 5)}`;
  await client.query('INSERT INTO client_credit_notes (org_id, invoice_id, number, amount_cents, reason, created_by) VALUES ($1, $2, $3, $4, $5, $6)', [ctx.orgId, invoiceId, number, input.amountCents, input.reason, ctx.userId]);
  await audit(client, ctx, 'invoice.credit', 'client_invoice', invoiceId, { number, amountCents: input.amountCents, reason: input.reason });
  return getInvoice(client, ctx, invoiceId);
}

export async function invoiceEvent(client: PoolClient, ctx: Ctx, invoiceId: string, kind: 'dispute' | 'resolve' | 'note', body: string) {
  need(ctx, kind === 'note' ? 'invoices_write' : 'invoices_write');
  const current = await getInvoice(client, ctx, invoiceId);
  if (kind === 'resolve' && !current.disputed) throw new ConflictError('That invoice is not disputed.');
  if (kind === 'dispute' && current.disputed) throw new ConflictError('That invoice is already disputed.');
  if (body.trim().length < 3) throw new BadRequestError('Write a few words.');
  await client.query('INSERT INTO client_invoice_events (org_id, invoice_id, kind, body, by_user) VALUES ($1, $2, $3, $4, $5)', [ctx.orgId, invoiceId, kind, body.trim(), ctx.userId]);
  await audit(client, ctx, `invoice.${kind}`, 'client_invoice', invoiceId);
  return getInvoice(client, ctx, invoiceId);
}

// ---- payments and debtors -------------------------------------------------------------------------------

export const paymentSchema = z.object({
  clientId: z.string().uuid(),
  amountCents: z.number().int().min(1).max(100_000_000_000),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(['mpesa', 'bank', 'cash', 'cheque']),
  reference: z.string().trim().max(80).optional().nullable(),
  invoiceId: z.string().uuid().optional()
});

export async function recordPayment(client: PoolClient, ctx: Ctx, input: z.infer<typeof paymentSchema>) {
  need(ctx, 'payments_post');
  const c = (await client.query('SELECT 1 FROM clients WHERE id = $1', [input.clientId])).rows[0];
  if (!c) throw new NotFoundError('That client was not found.');
  if (input.receivedOn > addDays(localDayOf(new Date()), 1)) throw new BadRequestError('The payment date is in the future.');
  await lock(client, `client-payments:${input.clientId}`);
  let payment: { id: string };
  try {
    payment = (await client.query('INSERT INTO client_payments (org_id, client_id, amount_cents, received_on, method, reference, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [ctx.orgId, input.clientId, input.amountCents, input.receivedOn, input.method, input.reference?.trim() || null, ctx.userId])).rows[0];
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new ConflictError('A payment with that reference was already recorded for this client.');
    throw error;
  }
  const open = (
    await client.query(`SELECT i.id, ${BALANCE_SQL} AS balance FROM client_invoices i WHERE i.client_id = $1 AND (${BALANCE_SQL}) > 0 ORDER BY (i.id = $2) DESC, i.issue_date, i.number`, [input.clientId, input.invoiceId ?? null])
  ).rows.map((r) => ({ id: r.id as string, balanceCents: Number(r.balance) }));
  const alloc = allocatePayment(input.amountCents, open);
  for (const a of alloc.allocations) await client.query('INSERT INTO client_payment_allocations (org_id, payment_id, invoice_id, amount_cents) VALUES ($1, $2, $3, $4)', [ctx.orgId, payment.id, a.invoiceId, a.amountCents]);
  await audit(client, ctx, 'payment.record', 'client', input.clientId, { amountCents: input.amountCents, method: input.method, reference: input.reference ?? null, allocated: input.amountCents - alloc.unallocatedCents });
  return { id: payment.id, allocatedCents: input.amountCents - alloc.unallocatedCents, onAccountCents: alloc.unallocatedCents, allocations: alloc.allocations };
}

export async function listPayments(client: PoolClient, opts: { clientId?: string; page: number; pageSize: number }) {
  const params: unknown[] = [];
  let where = '';
  if (opts.clientId) { params.push(opts.clientId); where = 'WHERE p.client_id = $1'; }
  const total = Number((await client.query(`SELECT count(*) AS n FROM client_payments p ${where}`, params)).rows[0].n);
  const rows = (await client.query(`SELECT p.id, p.client_id, c.name AS client, p.amount_cents, to_char(p.received_on, 'YYYY-MM-DD') AS received_on, p.method, p.reference,
      p.amount_cents - COALESCE((SELECT sum(a.amount_cents) FROM client_payment_allocations a WHERE a.payment_id = p.id), 0) AS on_account
      FROM client_payments p JOIN clients c ON c.id = p.client_id ${where} ORDER BY p.received_on DESC, p.created_at DESC LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`, params)).rows;
  return { items: rows.map((r) => ({ id: r.id, clientId: r.client_id, client: r.client, amountCents: Number(r.amount_cents), receivedOn: r.received_on, method: r.method, reference: r.reference, onAccountCents: Number(r.on_account) })), total, page: opts.page, pageSize: opts.pageSize };
}

// days past due as a SQL integer; the buckets mirror ageingBucket() in compute.ts (tests/dashboard-sql.test.ts holds them equal)
const LATE_SQL = `($1::date - b.due_date)`;
const AGEING_SUMS = `
  COALESCE(sum(b.balance) FILTER (WHERE ${LATE_SQL} <= 0), 0)::bigint AS not_due,
  COALESCE(sum(b.balance) FILTER (WHERE ${LATE_SQL} BETWEEN 1 AND 30), 0)::bigint AS d30,
  COALESCE(sum(b.balance) FILTER (WHERE ${LATE_SQL} BETWEEN 31 AND 60), 0)::bigint AS d60,
  COALESCE(sum(b.balance) FILTER (WHERE ${LATE_SQL} BETWEEN 61 AND 90), 0)::bigint AS d90,
  COALESCE(sum(b.balance) FILTER (WHERE ${LATE_SQL} > 90), 0)::bigint AS d90p`;
const OPEN_BALANCES = `(SELECT i.client_id, i.due_date, ${BALANCE_SQL} AS balance FROM client_invoices i) b`;

const bucketsOf = (r: Record<string, any>): Record<string, number> => ({ not_due: Number(r.not_due), '1-30': Number(r.d30), '31-60': Number(r.d60), '61-90': Number(r.d90), '90+': Number(r.d90p) });

/** The totals only: one aggregate row, for the dashboard. No per-client rows are loaded. */
export async function debtorsSummary(client: PoolClient, asOf: string = localDayOf(new Date())) {
  const r = (await client.query(`SELECT ${AGEING_SUMS}, count(DISTINCT b.client_id)::int AS clients FROM ${OPEN_BALANCES} WHERE b.balance > 0`, [asOf])).rows[0];
  const totals = bucketsOf(r);
  return { asOf, totals, totalCents: Object.values(totals).reduce((s, v) => s + v, 0), clients: r.clients as number };
}

/** Who owes what, aged by days past the due date. Aggregated in SQL, one row per debtor client. */
export async function debtors(client: PoolClient, asOf: string = localDayOf(new Date())) {
  const rows = (await client.query(
    `SELECT b.client_id, c.name AS client, ${AGEING_SUMS}, sum(b.balance)::bigint AS total, count(*)::int AS invoices, GREATEST(0, max($1::date - b.due_date))::int AS oldest
       FROM ${OPEN_BALANCES} JOIN clients c ON c.id = b.client_id WHERE b.balance > 0 GROUP BY b.client_id, c.name ORDER BY sum(b.balance) DESC, c.name, b.client_id`, [asOf])).rows;
  const items = rows.map((r) => ({ clientId: r.client_id as string, client: r.client as string, buckets: bucketsOf(r), totalCents: Number(r.total), invoices: r.invoices as number, oldestDaysOverdue: r.oldest as number }));
  const totals: Record<string, number> = Object.fromEntries(AGEING.map((bucket) => [bucket, 0]));
  for (const i of items) for (const bucket of AGEING) totals[bucket] = (totals[bucket] ?? 0) + (i.buckets[bucket] ?? 0);
  return { asOf, buckets: [...AGEING], totals, totalCents: items.reduce((s, x) => s + x.totalCents, 0), items };
}

/**
 * Margin per client for a month: invoiced (less credit notes) against the employer cost of the guards who worked there. Each guard's cost for
 * the month is split across clients by verified minutes. Needs payroll to have been run for the month; says so when it has not.
 */
export async function margin(client: PoolClient, ctx: Ctx, month: string) {
  need(ctx, 'reports');
  if (!monthRe.test(month)) throw new BadRequestError('use a month like 2026-10');
  const settings = await getSettings(client);
  const { first, nextFirst } = monthBounds(month);
  const period = (await client.query('SELECT id, status FROM pay_periods WHERE month = $1', [month])).rows[0];
  const costs = period ? (await client.query('SELECT guard_id, employer_cost_cents FROM payslips WHERE period_id = $1', [period.id])).rows : [];
  const shifts = (
    await client.query(
      `SELECT s.guard_id, si.client_id, s.start_at, s.end_at, s.scheduled_minutes, ${ATTENDANCE_SQL}
         FROM shifts s JOIN sites si ON si.id = s.site_id WHERE s.status = 'scheduled' AND s.guard_id IS NOT NULL AND s.start_at >= ($1::date::timestamp AT TIME ZONE '${TZ}') AND s.start_at < ($2::date::timestamp AT TIME ZONE '${TZ}')`,
      [first, nextFirst]
    )
  ).rows;
  const minutes = new Map<string, Record<string, number>>();
  for (const r of shifts) {
    const m = verifiedMinutes({ startAt: r.start_at, endAt: r.end_at, scheduledMinutes: r.scheduled_minutes }, { inAt: r.in_at, outAt: r.out_at, inOverridden: false, outOverridden: false }, 'actual', settings.lateGraceMinutes);
    if (m <= 0) continue;
    const per = minutes.get(r.guard_id) ?? {};
    per[r.client_id] = (per[r.client_id] ?? 0) + m;
    minutes.set(r.guard_id, per);
  }
  const costByClient = new Map<string, number>();
  for (const c of costs) {
    for (const [clientId, cents] of Object.entries(allocateCost(Number(c.employer_cost_cents), minutes.get(c.guard_id) ?? {}))) costByClient.set(clientId, (costByClient.get(clientId) ?? 0) + cents);
  }
  const invoiced = (
    await client.query(
      `SELECT i.client_id, c.name AS client, sum(i.total_cents)::bigint AS invoiced, COALESCE(sum((SELECT sum(n.amount_cents) FROM client_credit_notes n WHERE n.invoice_id = i.id)), 0)::bigint AS credited
         FROM client_invoices i JOIN clients c ON c.id = i.client_id WHERE i.month = $1 GROUP BY i.client_id, c.name`,
      [month]
    )
  ).rows;
  const names = new Map((await client.query('SELECT id, name FROM clients')).rows.map((r) => [r.id as string, r.name as string]));
  const ids = new Set<string>([...invoiced.map((r) => r.client_id as string), ...costByClient.keys()]);
  const items = [...ids].map((id) => {
    const inv = invoiced.find((r) => r.client_id === id);
    const net = Number(inv?.invoiced ?? 0) - Number(inv?.credited ?? 0);
    const cost = costByClient.get(id) ?? 0;
    return { clientId: id, client: names.get(id) ?? inv?.client ?? 'Unknown', invoicedCents: Number(inv?.invoiced ?? 0), creditedCents: Number(inv?.credited ?? 0), netCents: net, costCents: cost, marginCents: net - cost, marginPercent: net > 0 ? Math.round(((net - cost) / net) * 1000) / 10 : null };
  }).sort((a, b) => a.client.localeCompare(b.client));
  return {
    month,
    costKnown: !!period && costs.length > 0,
    costNote: period ? (period.status === 'closed' ? null : 'Payroll for this month is not closed; the cost is from the latest run.') : 'Run payroll for this month to see the cost side.',
    totals: { netCents: items.reduce((s, x) => s + x.netCents, 0), costCents: items.reduce((s, x) => s + x.costCents, 0), marginCents: items.reduce((s, x) => s + x.marginCents, 0) },
    items
  };
}
