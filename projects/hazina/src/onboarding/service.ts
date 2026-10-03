/**
 * First-hour support: a checklist worked out from the records (so it is never stale), and the opening-balance import that
 * lets a SACCO move off its spreadsheet without re-keying every member.
 *
 * A SAMPLE organisation is a separate tenant (see admin/sample.ts), so there is nothing here to hide or delete.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { BadRequestError } from '../domain/errors';
import { Ctx, audit, orgInfo } from '../common/context';
import { parseCsv, parseMoney } from '../intake/statement';
import { createMember } from '../members/service';
import { CODES } from '../ledger/chart';
import { postEntry } from '../ledger/service';

export async function checklist(client: PoolClient) {
  const one = async (sql: string): Promise<number> => Number((await client.query(sql)).rows[0].n);
  const org = await orgInfo(client);
  const members = await one(`SELECT count(*) AS n FROM members`);
  const products = await one(`SELECT count(*) AS n FROM loan_products WHERE active`);
  const staff = await one(`SELECT count(*) AS n FROM users WHERE status = 'active'`);
  const paybills = await one(`SELECT count(*) AS n FROM branches WHERE NOT archived AND paybill_number IS NOT NULL`);
  const deposits = await one(`SELECT count(*) AS n FROM savings_txns WHERE status = 'posted'`);
  const disbursed = await one(`SELECT count(*) AS n FROM loans WHERE status IN ('disbursed', 'closed', 'written_off', 'restructured')`);
  const repaid = await one(`SELECT count(*) AS n FROM loan_repayments`);
  const returns = await one(`SELECT count(*) AS n FROM returns`);
  const people = org.kind === 'sacco' ? 'members' : 'borrowers';
  const items = [
    { key: 'members', title: org.kind === 'sacco' ? 'Add your members' : 'Add your borrowers', done: members > 0, hint: `Register ${people} one by one, or import a spreadsheet with their opening balances.` },
    { key: 'products', title: 'Set up a loan product', done: products > 0, hint: 'The interest rate, the method (flat or reducing balance), the longest term, fees and penalties. Loans copy these terms when they are applied for.' },
    ...(org.kind === 'sacco' ? [{ key: 'deposit', title: 'Record a first deposit', done: deposits > 0, hint: 'Savings, shares or deposits, by cash, M-Pesa or bank. Each one posts to the ledger.' }] : []),
    { key: 'staff', title: 'Add your team', done: staff > 1, hint: 'Give each officer, teller and accountant their own phone and PIN. Approvals need different people.' },
    { key: 'paybill', title: 'Connect your M-Pesa paybill', done: paybills > 0, hint: 'Enter the paybill number so payments are matched to members and loans by account number. Until then, record M-Pesa payments by their code.' },
    { key: 'loan', title: 'Pay out a first loan', done: disbursed > 0, hint: 'Apply, appraise, approve (a different person), then disburse. The schedule is built when the money goes out.' },
    { key: 'repay', title: 'Take a first repayment', done: repaid > 0, hint: 'It is split into penalty, interest and principal, oldest instalment first.' },
    { key: 'return', title: 'Generate your first return', done: returns > 0, hint: 'A generic periodic summary from your own records. It is not a regulator form.' }
  ];
  return { kind: org.kind, isSample: org.isDemo, items, doneCount: items.filter((i) => i.done).length, total: items.length };
}

export const MAX_IMPORT_ROWS = 2000;

const COLUMN = {
  name: ['name', 'fullname', 'membername', 'borrowername'],
  id: ['idnumber', 'id', 'nationalid', 'idno'],
  phone: ['phone', 'mobile', 'phonenumber', 'msisdn'],
  savings: ['savings', 'openingsavings', 'savingsbalance'],
  shares: ['shares', 'openingshares', 'sharecapital', 'sharesbalance'],
  deposits: ['deposits', 'openingdeposits', 'depositsbalance']
} as const;

export const importSchema = z.object({ contentBase64: z.string().min(8), branchId: z.string().uuid().optional().nullable() });

/**
 * Creates members from a spreadsheet exported as CSV, with opening savings, shares and deposits if the columns exist. Opening
 * balances are posted against "Opening balance equity", one entry per member, so the ledger balances from day one and the
 * accountant clears that account as the real cash, bank and loan balances are entered. All or nothing: one bad row stops the
 * import and says which, so a half-imported member book never exists.
 */
export async function importMembers(client: PoolClient, ctx: Ctx, input: z.infer<typeof importSchema>) {
  const org = await orgInfo(client);
  const text = Buffer.from(input.contentBase64, 'base64').toString('utf8');
  const rows = parseCsv(text);
  if (rows.length < 2) throw new BadRequestError('The file needs a header row and at least one member.');
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw new BadRequestError(`At most ${MAX_IMPORT_ROWS} rows per import.`);
  const header = rows[0]!.map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const col = (names: readonly string[]) => header.findIndex((h) => names.includes(h));
  const idx = { name: col(COLUMN.name), id: col(COLUMN.id), phone: col(COLUMN.phone), savings: col(COLUMN.savings), shares: col(COLUMN.shares), deposits: col(COLUMN.deposits) };
  if (idx.name < 0) throw new BadRequestError('The header needs a "name" column.');
  if (org.kind === 'lender' && (idx.savings >= 0 || idx.shares >= 0 || idx.deposits >= 0)) throw new BadRequestError('A lender does not take savings, shares or deposits; remove those columns.');

  let created = 0;
  let postedCents = 0;
  const date = (await client.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS d`)).rows[0].d as string;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]!;
    const at = (k: number) => (k >= 0 ? (row[k] ?? '').trim() : '');
    try {
      const member = await createMember(client, ctx, { fullName: at(idx.name), idNumber: at(idx.id) || null, phone: at(idx.phone) || null, branchId: input.branchId ?? null });
      created += 1;
      const lines: Array<{ accountCode: string; debitCents?: number; creditCents?: number; memberId?: string }> = [];
      let total = 0;
      for (const [key, code] of [['savings', CODES.savings], ['shares', CODES.shares], ['deposits', CODES.deposits]] as const) {
        const cents = at(idx[key]) ? parseMoney(at(idx[key])) : 0;
        if (cents > 0) {
          lines.push({ accountCode: code, creditCents: cents, memberId: member.id });
          total += cents;
        }
      }
      if (total > 0) {
        lines.unshift({ accountCode: CODES.openingBalance, debitCents: total });
        await postEntry(client, ctx.orgId, { entryDate: date, memo: `opening balances ${member.memberNo}`, sourceType: 'opening_balance', sourceId: member.id, postedBy: ctx.userId, lines });
        postedCents += total;
      }
    } catch (error) {
      throw new BadRequestError(`Row ${i + 1} (${at(idx.name) || 'no name'}): ${error instanceof Error ? error.message : 'could not be imported'}. Nothing was imported.`);
    }
  }
  await audit(client, ctx, 'import.members', 'member', null, { created, openingBalanceCents: postedCents });
  return { created, openingBalanceCents: postedCents, note: postedCents > 0 ? 'Opening balances were posted against "Opening balance equity". Enter your real cash, bank and loan balances to clear it.' : null };
}
