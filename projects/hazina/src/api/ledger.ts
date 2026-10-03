import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { audit, wrap } from '../common/context';
import { inOrg, isoDay, parse, queryInt, queryString } from './helpers';
import { balanceSheet, incomeStatement, postEntry, reverseEntry, trialBalance } from '../ledger/service';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors';

const router = Router();

async function today(client: import('pg').PoolClient): Promise<string> {
  return (await client.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS d`)).rows[0].d as string;
}

router.get('/accounts', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (client) => {
    const rows = (await client.query('SELECT id, code, name, type, is_system, active FROM accounts ORDER BY code')).rows;
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, type: r.type, isSystem: r.is_system, active: r.active }));
  }));
}));

const accountSchema = z.object({ code: z.string().regex(/^[0-9]{4,8}$/, 'an account code is 4 to 8 digits'), name: z.string().trim().min(2).max(120), type: z.enum(['asset', 'liability', 'equity', 'income', 'expense']) });
router.post('/accounts', authenticate, requirePermission('accounts_write'), requireWritable, wrap(async (req, res) => {
  const body = parse(accountSchema, req.body);
  res.status(201).json(await inOrg(req, async (client, ctx) => {
    const row = (await client.query('INSERT INTO accounts (org_id, code, name, type) VALUES ($1, $2, $3, $4) RETURNING id, code, name, type', [ctx.orgId, body.code, body.name, body.type])).rows[0];
    await audit(client, ctx, 'account.create', 'account', row.id, { code: body.code });
    return row;
  }));
}));
router.patch('/accounts/:id', authenticate, requirePermission('accounts_write'), requireWritable, wrap(async (req, res) => {
  const body = parse(z.object({ active: z.boolean() }), req.body);
  res.json(await inOrg(req, async (client, ctx) => {
    const account = (await client.query('SELECT id, is_system FROM accounts WHERE id = $1', [String(req.params.id)])).rows[0];
    if (!account) throw new NotFoundError('That account was not found.');
    if (account.is_system && !body.active) throw new ConflictError('A system account cannot be switched off: the product posts to it.');
    await client.query('UPDATE accounts SET active = $2 WHERE id = $1', [account.id, body.active]);
    await audit(client, ctx, 'account.active', 'account', account.id, { active: body.active });
    return { id: account.id, active: body.active };
  }));
}));

/** Keyset paging on the entry number, newest first. */
router.get('/journal', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (client) => {
    const limit = Math.min(100, queryInt(req.query.limit, 25)) || 25;
    const before = queryInt(req.query.before, 0);
    const params: unknown[] = [];
    const where: string[] = [];
    if (before > 0) { params.push(before); where.push(`e.seq < $${params.length}`); }
    const source = queryString(req.query.source);
    if (source) { params.push(source); where.push(`e.source_type = $${params.length}`); }
    params.push(limit + 1);
    const entries = (await client.query(`SELECT e.* FROM journal_entries e ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY e.seq DESC LIMIT $${params.length}`, params)).rows;
    const page = entries.slice(0, limit);
    const ids = page.map((e) => e.id);
    const lines = ids.length
      ? (await client.query(`SELECT l.entry_id, l.line_no, a.code, a.name, l.debit_cents, l.credit_cents, l.member_id, l.loan_id FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.entry_id = ANY($1::uuid[]) ORDER BY l.entry_id, l.line_no`, [ids])).rows
      : [];
    return {
      items: page.map((e) => ({
        id: e.id, seq: Number(e.seq), date: e.entry_date, memo: e.memo, sourceType: e.source_type, totalCents: Number(e.total_cents), reverses: e.reverses,
        lines: lines.filter((l) => l.entry_id === e.id).map((l) => ({ lineNo: l.line_no, code: l.code, account: l.name, debitCents: Number(l.debit_cents), creditCents: Number(l.credit_cents), memberId: l.member_id, loanId: l.loan_id }))
      })),
      nextBefore: entries.length > limit ? Number(page[page.length - 1].seq) : null
    };
  }));
}));

const manualSchema = z.object({
  entryDate: isoDay,
  memo: z.string().trim().min(3).max(300),
  lines: z.array(z.object({ accountCode: z.string().regex(/^[0-9]{4,8}$/), debitCents: z.number().int().min(0).optional(), creditCents: z.number().int().min(0).optional(), memberId: z.string().uuid().optional() })).min(2).max(40)
});
router.post('/journal', authenticate, requirePermission('journal_post'), requireWritable, wrap(async (req, res) => {
  const body = parse(manualSchema, req.body);
  res.status(201).json(await inOrg(req, async (client, ctx) => {
    if (body.entryDate > (await today(client))) throw new BadRequestError('A journal entry cannot be dated in the future.');
    const posted = await postEntry(client, ctx.orgId, { entryDate: body.entryDate, memo: body.memo, sourceType: 'manual', postedBy: ctx.userId, lines: body.lines });
    await audit(client, ctx, 'journal.manual', 'journal_entry', posted.id, { seq: posted.seq, memo: body.memo });
    return posted;
  }));
}));
router.post('/journal/:id/reverse', authenticate, requirePermission('journal_post'), requireWritable, wrap(async (req, res) => {
  const body = parse(z.object({ memo: z.string().trim().min(3).max(300) }), req.body);
  res.status(201).json(await inOrg(req, async (client, ctx) => {
    const original = (await client.query('SELECT source_type FROM journal_entries WHERE id = $1', [String(req.params.id)])).rows[0];
    if (!original) throw new NotFoundError('That journal entry was not found.');
    // an entry made by a product feature is tied to a schedule or a member balance; reversing only the ledger side would
    // make the two disagree, so only manual entries can be reversed here
    if (original.source_type !== 'manual') throw new ConflictError('Only a manual journal entry can be reversed here. A repayment, deposit or loan entry is corrected through the feature that made it.');
    const posted = await reverseEntry(client, ctx.orgId, String(req.params.id), ctx.userId, body.memo, await today(client));
    await audit(client, ctx, 'journal.reverse', 'journal_entry', String(req.params.id), { seq: posted.seq });
    return posted;
  }));
}));

router.get('/reports/trial-balance', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (client) => ({ asOf: queryString(req.query.asOf) ?? (await today(client)), ...(await trialBalance(client, queryString(req.query.asOf) ?? (await today(client)))) })));
}));
router.get('/reports/income-statement', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (client) => {
    const to = queryString(req.query.to) ?? (await today(client));
    const from = queryString(req.query.from) ?? `${to.slice(0, 4)}-01-01`;
    return incomeStatement(client, from, to);
  }));
}));
router.get('/reports/balance-sheet', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (client) => balanceSheet(client, queryString(req.query.asOf) ?? (await today(client)))));
}));

export default router;
