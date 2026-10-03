/**
 * The returns template engine. A template is DATA: sections of rows, each row a measure from a fixed vocabulary. There is no
 * SQL in a template and no way to put any there, so an organisation (or Hazina) can add a regulator's format later by
 * writing a template, without a code change and without a security review of arbitrary queries.
 *
 * Hazina does NOT know the real return formats of the Central Bank, SASRA or the Commissioner for Co-operatives. The
 * templates it ships are GENERIC periodic returns; every generated return says so in its payload, and `is_official` in the
 * database is constrained to false.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { CODES } from '../ledger/chart';
import { AccountType, debitNormal } from '../ledger/chart';
import { portfolioSummary } from '../reports/portfolio';

export const measureSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ledger_balance'), codes: z.array(z.string().regex(/^[0-9]{4,8}$/)).min(1).max(20) }),
  z.object({ kind: z.literal('ledger_period'), codes: z.array(z.string().regex(/^[0-9]{4,8}$/)).min(1).max(20) }),
  z.object({ kind: z.literal('surplus_period') }),
  z.object({ kind: z.literal('members_count'), status: z.enum(['active', 'dormant', 'exited']).optional() }),
  z.object({ kind: z.literal('members_joined_period') }),
  z.object({ kind: z.literal('loans_outstanding_principal') }),
  z.object({ kind: z.literal('loans_count'), status: z.enum(['applied', 'appraised', 'approved', 'rejected', 'disbursed', 'closed', 'written_off', 'restructured']) }),
  z.object({ kind: z.literal('loans_disbursed_period') }),
  z.object({ kind: z.literal('loans_repaid_period') }),
  z.object({ kind: z.literal('par_amount'), days: z.number().int().min(0).max(365) }),
  z.object({ kind: z.literal('par_percent'), days: z.number().int().min(0).max(365) })
]);
export type Measure = z.infer<typeof measureSchema>;

export const definitionSchema = z.object({
  title: z.string().trim().min(2).max(160),
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        rows: z.array(z.object({ label: z.string().trim().min(1).max(200), measure: measureSchema, format: z.enum(['money', 'count', 'percent']).default('money') })).min(1).max(60)
      })
    )
    .min(1)
    .max(20)
});
export type Definition = z.infer<typeof definitionSchema>;

export const NOT_OFFICIAL = 'NOT AN OFFICIAL REGULATOR RETURN. This is a generic periodic summary generated from the organisation\'s own records. It is not in the format of any regulator and must not be submitted as one.';

async function ledgerNet(client: PoolClient, codes: string[], from: string | null, to: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT a.type, COALESCE(sum(l.debit_cents), 0)::bigint AS dr, COALESCE(sum(l.credit_cents), 0)::bigint AS cr
       FROM accounts a
       JOIN journal_lines l ON l.account_id = a.id
       JOIN journal_entries e ON e.id = l.entry_id AND e.entry_date <= $2::date AND ($3::date IS NULL OR e.entry_date >= $3::date)
      WHERE a.code = ANY($1::text[]) GROUP BY a.type`,
    [codes, to, from]
  );
  let total = 0;
  for (const r of rows) total += debitNormal(r.type as AccountType) ? Number(r.dr) - Number(r.cr) : Number(r.cr) - Number(r.dr);
  return total;
}

interface Ctx {
  from: string;
  to: string;
  portfolio: Awaited<ReturnType<typeof portfolioSummary>> | null;
  today: string;
}

async function evaluate(client: PoolClient, measure: Measure, c: Ctx): Promise<number> {
  switch (measure.kind) {
    case 'ledger_balance':
      return ledgerNet(client, measure.codes, null, c.to);
    case 'ledger_period':
      return ledgerNet(client, measure.codes, c.from, c.to);
    case 'surplus_period': {
      const income = await ledgerNet(client, ['4100', '4200', '4300', '4400', '4500'], c.from, c.to);
      const expense = await ledgerNet(client, ['5100', '5200', '5300', '5400', '5900'], c.from, c.to);
      return income - expense;
    }
    case 'members_count':
      return Number((await client.query(measure.status ? 'SELECT count(*)::int AS n FROM members WHERE status = $1 AND joined_on <= $2::date' : 'SELECT count(*)::int AS n FROM members WHERE joined_on <= $2::date', measure.status ? [measure.status, c.to] : [null, c.to])).rows[0].n);
    case 'members_joined_period':
      return Number((await client.query('SELECT count(*)::int AS n FROM members WHERE joined_on BETWEEN $1::date AND $2::date', [c.from, c.to])).rows[0].n);
    case 'loans_outstanding_principal':
      return ledgerNet(client, [CODES.loans], null, c.to);
    case 'loans_count':
      return Number((await client.query('SELECT count(*)::int AS n FROM loans WHERE status = $1', [measure.status])).rows[0].n);
    case 'loans_disbursed_period':
      return Number((await client.query(`SELECT COALESCE(sum(principal_cents), 0)::bigint AS n FROM loans WHERE disbursed_on BETWEEN $1::date AND $2::date AND restructured_from IS NULL`, [c.from, c.to])).rows[0].n);
    case 'loans_repaid_period':
      return Number((await client.query('SELECT COALESCE(sum(amount_cents - unapplied_cents - recovery_cents), 0)::bigint AS n FROM loan_repayments WHERE received_on BETWEEN $1::date AND $2::date', [c.from, c.to])).rows[0].n);
    case 'par_amount':
    case 'par_percent': {
      c.portfolio ??= await portfolioSummary(client);
      const row = c.portfolio.par.find((p) => p.days === measure.days);
      if (row) return measure.kind === 'par_amount' ? row.amountCents : row.percent;
      const amount = c.portfolio.positions.filter((p) => p.daysOverdue > measure.days).reduce((s, p) => s + p.outstandingPrincipalCents, 0);
      return measure.kind === 'par_amount' ? amount : c.portfolio.outstandingPrincipalCents > 0 ? Math.round((amount / c.portfolio.outstandingPrincipalCents) * 10_000) / 100 : 0;
    }
  }
}

export interface GeneratedReturn {
  title: string;
  isOfficial: false;
  banner: string;
  period: { from: string; to: string };
  generatedAt: string;
  sections: Array<{ title: string; rows: Array<{ label: string; value: number; format: 'money' | 'count' | 'percent' }> }>;
  notes: string[];
}

export async function generate(client: PoolClient, definition: Definition, from: string, to: string, todayDay: string): Promise<GeneratedReturn> {
  const c: Ctx = { from, to, portfolio: null, today: todayDay };
  const sections: GeneratedReturn['sections'] = [];
  let usesPortfolio = false;
  for (const section of definition.sections) {
    const rows: GeneratedReturn['sections'][number]['rows'] = [];
    for (const row of section.rows) {
      if (row.measure.kind === 'par_amount' || row.measure.kind === 'par_percent') usesPortfolio = true;
      rows.push({ label: row.label, value: await evaluate(client, row.measure, c), format: row.format });
    }
    sections.push({ title: section.title, rows });
  }
  const notes = [NOT_OFFICIAL];
  if (usesPortfolio) {
    notes.push(`Portfolio-at-risk rows are as at ${todayDay} (the day this was generated): repayment schedules keep no history.${to !== todayDay ? ' The period end differs from that day.' : ''}`);
  }
  notes.push('Interest income is recognised when received; penalties when charged. See docs/ACCOUNTING.md.');
  return { title: definition.title, isOfficial: false, banner: NOT_OFFICIAL, period: { from, to }, generatedAt: new Date().toISOString(), sections, notes };
}

/** The templates every organisation starts with. Generic, and labelled so. */
export function defaultTemplates(kind: 'sacco' | 'lender'): Array<{ code: string; name: string; definition: Definition }> {
  const position: Definition = {
    title: 'Financial position summary (generic)',
    sections: [
      { title: 'Assets', rows: [
        { label: 'Cash on hand', measure: { kind: 'ledger_balance', codes: [CODES.cash] }, format: 'money' },
        { label: 'M-Pesa collections', measure: { kind: 'ledger_balance', codes: [CODES.mpesa] }, format: 'money' },
        { label: 'Bank', measure: { kind: 'ledger_balance', codes: [CODES.bank] }, format: 'money' },
        { label: 'Loans receivable (principal)', measure: { kind: 'ledger_balance', codes: [CODES.loans] }, format: 'money' },
        { label: 'Penalties receivable', measure: { kind: 'ledger_balance', codes: [CODES.penaltiesReceivable] }, format: 'money' }
      ] },
      { title: 'Liabilities', rows: [
        ...(kind === 'sacco' ? [
          { label: 'Member savings', measure: { kind: 'ledger_balance' as const, codes: [CODES.savings] }, format: 'money' as const },
          { label: 'Member deposits', measure: { kind: 'ledger_balance' as const, codes: [CODES.deposits] }, format: 'money' as const }
        ] : []),
        { label: 'Unapplied receipts', measure: { kind: 'ledger_balance', codes: [CODES.unapplied] }, format: 'money' },
        { label: 'Payables', measure: { kind: 'ledger_balance', codes: [CODES.payables] }, format: 'money' },
        { label: 'Borrowings', measure: { kind: 'ledger_balance', codes: [CODES.borrowings] }, format: 'money' }
      ] },
      { title: 'Equity', rows: [
        { label: kind === 'sacco' ? 'Member share capital' : 'Owners capital', measure: { kind: 'ledger_balance', codes: [CODES.shares] }, format: 'money' },
        { label: 'Reserves', measure: { kind: 'ledger_balance', codes: [CODES.reserves] }, format: 'money' }
      ] },
      { title: 'Result for the period', rows: [
        { label: 'Interest income', measure: { kind: 'ledger_period', codes: [CODES.interestIncome] }, format: 'money' },
        { label: 'Penalty and fee income', measure: { kind: 'ledger_period', codes: [CODES.penaltyIncome, CODES.feeIncome] }, format: 'money' },
        { label: 'Surplus for the period', measure: { kind: 'surplus_period' }, format: 'money' }
      ] }
    ]
  };
  const quality: Definition = {
    title: 'Loan portfolio quality (generic)',
    sections: [
      { title: 'Portfolio', rows: [
        { label: 'Loans being repaid', measure: { kind: 'loans_count', status: 'disbursed' }, format: 'count' },
        { label: 'Outstanding principal', measure: { kind: 'loans_outstanding_principal' }, format: 'money' },
        { label: 'Loans paid out in the period', measure: { kind: 'loans_disbursed_period' }, format: 'money' },
        { label: 'Repaid in the period', measure: { kind: 'loans_repaid_period' }, format: 'money' },
        { label: 'Written off in the period', measure: { kind: 'ledger_period', codes: [CODES.badDebts] }, format: 'money' }
      ] },
      { title: 'Portfolio at risk (as at generation day)', rows: [
        ...[1, 30, 60, 90].flatMap((days) => [
          { label: `PAR > ${days} days (amount)`, measure: { kind: 'par_amount' as const, days }, format: 'money' as const },
          { label: `PAR > ${days} days (% of outstanding)`, measure: { kind: 'par_percent' as const, days }, format: 'percent' as const }
        ])
      ] }
    ]
  };
  const membership: Definition = {
    title: kind === 'sacco' ? 'Membership summary (generic)' : 'Borrower register summary (generic)',
    sections: [
      { title: kind === 'sacco' ? 'Members' : 'Borrowers', rows: [
        { label: 'Active', measure: { kind: 'members_count', status: 'active' }, format: 'count' },
        { label: 'Dormant', measure: { kind: 'members_count', status: 'dormant' }, format: 'count' },
        { label: 'Exited', measure: { kind: 'members_count', status: 'exited' }, format: 'count' },
        { label: 'Joined in the period', measure: { kind: 'members_joined_period' }, format: 'count' }
      ] }
    ]
  };
  return [
    { code: 'GENERIC-FIN-POSITION', name: position.title, definition: position },
    { code: 'GENERIC-PORTFOLIO-QUALITY', name: quality.title, definition: quality },
    { code: 'GENERIC-MEMBERSHIP', name: membership.title, definition: membership }
  ];
}
