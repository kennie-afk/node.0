import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { addStaff, assertLedgerBalanced, assertLoanBookAgrees, boot, deposit, fullStaff, get, lendUntil, makeMember, makeProduct, newTenant, on, patch, post, shutdown } from './helpers';
import { parseReference } from '../src/mpesa/service';
import { checkNationalId, checkPayslip } from '../src/intake/documents';
import {
  StatementFormatError, consistencyFlags, parseCsv, parseMoney, parseStatementCsv, parseStatementPdfText, parseTime, summarise
} from '../src/intake/statement';
import { definitionSchema } from '../src/returns/engine';

vi.setConfig({ testTimeout: 120_000 });
afterAll(shutdown);

const SECRET = process.env.MPESA_CALLBACK_SECRET ?? 'mpesa-secret-1234567';
const K = (n: number) => n * 100;

let tx = Math.floor(Math.random() * 1e9);
const transTime = () => new Date(Date.now() + 3 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
const confirmation = (shortCode: string, billRef: string, amount: number) => ({
  TransactionType: 'Pay Bill', TransID: `T${String((tx += 1)).padStart(9, '0')}`, TransTime: transTime(), TransAmount: amount, BusinessShortCode: shortCode, BillRefNumber: billRef, MSISDN: '254700000001'
});
let paybillSeq = 600_000 + Math.floor(Math.random() * 300_000);

async function setPaybill(t: Awaited<ReturnType<typeof newTenant>>): Promise<string> {
  const code = String((paybillSeq += 1));
  expect((await patch(t.owner.auth, `/v1/branches/${t.branchId}`, { paybillNumber: code })).status).toBe(200);
  return code;
}
async function callback(body: object, secret = SECRET) {
  const { app } = await boot();
  return request(app).post(`/v1/mpesa/c2b/${secret}/confirmation`).send(body);
}

describe('account references (pure)', () => {
  it('reads members, products and loans however a person types them', () => {
    expect(parseReference('M00012')).toEqual({ type: 'savings', memberNo: 'M00012' });
    expect(parseReference('m 00012')).toEqual({ type: 'savings', memberNo: 'M00012' });
    expect(parseReference('M00012-SH')).toEqual({ type: 'shares', memberNo: 'M00012' });
    expect(parseReference('m00012 dp')).toEqual({ type: 'deposits', memberNo: 'M00012' });
    expect(parseReference('L00034')).toEqual({ type: 'loan', loanNo: 'L00034' });
    expect(parseReference('l-00034')).toEqual({ type: 'loan', loanNo: 'L00034' });
    expect(parseReference('MARY')).toBeNull();
    expect(parseReference('')).toBeNull();
    expect(parseReference('M12')).toBeNull();
  });
});

describe.runIf(on)('M-Pesa paybill reconciliation (real Postgres)', () => {
  it('turns away a callback with the wrong secret, and applies a right one', async () => {
    const t = await newTenant('Mpesa Secret');
    const code = await setPaybill(t);
    const m = await makeMember(t.owner.auth);
    expect((await callback(confirmation(code, m.memberNo, 100), 'wrong-secret-wrong')).status).toBe(404);
    expect((await callback(confirmation(code, m.memberNo, 100))).status).toBe(200);
    expect((await get(t.owner.auth, `/v1/members/${m.id}`)).body.balances.savingsCents).toBe(K(100));
  });

  it('puts a payment to a member number into savings, shares or deposits, and one to a loan number into the repayment', async () => {
    const t = await newTenant('Mpesa Apply');
    const s = await fullStaff(t);
    const code = await setPaybill(t);
    const m = await makeMember(t.owner.auth);
    await callback(confirmation(code, m.memberNo, 500));
    await callback(confirmation(code, `${m.memberNo}-SH`, 200));
    await callback(confirmation(code, `${m.memberNo}-DP`, 300));
    expect((await get(t.owner.auth, `/v1/members/${m.id}`)).body.balances).toMatchObject({ savingsCents: K(500), sharesCents: K(200), depositsCents: K(300) });
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200 });
    const loanId = await lendUntil(s, m.id, p, K(12_000), 3, 'disbursed');
    const loanNo = (await get(t.owner.auth, `/v1/loans/${loanId}`)).body.loanNo;
    const before = (await get(t.owner.auth, `/v1/loans/${loanId}`)).body.outstandingTotalCents;
    await callback(confirmation(code, loanNo.toLowerCase(), 1_000));
    const after = (await get(t.owner.auth, `/v1/loans/${loanId}`)).body.outstandingTotalCents;
    expect(before - after).toBe(K(1_000));
    await assertLedgerBalanced(t);
    await assertLoanBookAgrees(t);
  });

  it('applies a confirmation Safaricom delivers twice only once', async () => {
    const t = await newTenant('Mpesa Twice');
    const code = await setPaybill(t);
    const m = await makeMember(t.owner.auth);
    const body = confirmation(code, m.memberNo, 750);
    await Promise.all([callback(body), callback(body), callback(body)]);
    expect((await get(t.owner.auth, `/v1/members/${m.id}`)).body.balances.savingsCents).toBe(K(750));
    expect((await get(t.owner.auth, '/v1/mpesa/payments')).body.items).toHaveLength(1);
    await assertLedgerBalanced(t);
  });

  it('keeps a payment nobody could match, shows why, and lets a person assign it exactly once', async () => {
    const t = await newTenant('Mpesa Queue');
    const teller = await addStaff(t, 'teller');
    const code = await setPaybill(t);
    const m = await makeMember(t.owner.auth);
    await callback(confirmation(code, 'MARY', 400));
    await callback(confirmation(code, '', 100));
    await callback(confirmation(code, 'M99999', 50));
    const queue = (await get(teller.auth, '/v1/mpesa/payments?status=unmatched')).body.items;
    expect(queue).toHaveLength(3);
    expect(queue.find((p: { billRef: string }) => p.billRef === 'MARY').note).toMatch(/does not name a member or loan/);
    expect(queue.find((p: { billRef: string }) => p.billRef === 'M99999').note).toMatch(/No member/);
    const mary = queue.find((p: { billRef: string }) => p.billRef === 'MARY');
    const assigned = await post(teller.auth, `/v1/mpesa/payments/${mary.id}/assign`, { target: { type: 'savings', memberNo: m.memberNo } });
    expect(assigned.status).toBe(200);
    expect((await post(teller.auth, `/v1/mpesa/payments/${mary.id}/assign`, { target: { type: 'savings', memberNo: m.memberNo } })).status).toBe(409);
    expect((await get(t.owner.auth, `/v1/members/${m.id}`)).body.balances.savingsCents).toBe(K(400));
    const blank = queue.find((p: { billRef: string }) => p.billRef === '');
    expect((await post(teller.auth, `/v1/mpesa/payments/${blank.id}/ignore`, { note: 'Sent to the wrong paybill' })).status).toBe(200);
    expect((await get(teller.auth, '/v1/mpesa/payments?status=unmatched')).body.items).toHaveLength(1);
    await assertLedgerBalanced(t);
  });

  it('keeps a deposit meant for a lender in the queue with the reason: a lender takes no deposits', async () => {
    const t = await newTenant('Mpesa Lender', 'lender');
    const code = await setPaybill(t);
    const m = await makeMember(t.owner.auth);
    await callback(confirmation(code, m.memberNo, 500));
    const q = (await get(t.owner.auth, '/v1/mpesa/payments?status=unmatched')).body.items;
    expect(q).toHaveLength(1);
    expect(q[0].note).toMatch(/non-deposit-taking/);
  });

  it('ignores a payment to a paybill nobody owns, and never mixes tenants', async () => {
    const a = await newTenant('Mpesa A');
    const b = await newTenant('Mpesa B');
    const codeA = await setPaybill(a);
    const codeB = await setPaybill(b);
    const mA = await makeMember(a.owner.auth);
    expect((await callback(confirmation('999999', mA.memberNo, 100))).status).toBe(200);
    // B's paybill with A's member number: B has no such member, so it waits in B's queue, never touching A
    await callback(confirmation(codeB, mA.memberNo, 100));
    expect((await get(a.owner.auth, `/v1/members/${mA.id}`)).body.balances.savingsCents).toBe(0);
    expect((await get(b.owner.auth, '/v1/mpesa/payments?status=unmatched')).body.items).toHaveLength(1);
    expect((await get(a.owner.auth, '/v1/mpesa/payments')).body.items).toHaveLength(0);
    void codeA;
  });

  it('only exists as a simulator when it is switched on, and routes the simulated payment the real way', async () => {
    const t = await newTenant('Mpesa Sim');
    await setPaybill(t);
    const m = await makeMember(t.owner.auth);
    const sim = await post(t.owner.auth, '/v1/mpesa/simulate', { billRef: m.memberNo, amountCents: K(250) });
    expect(sim.status).toBe(201);
    expect((await get(t.owner.auth, `/v1/members/${m.id}`)).body.balances.savingsCents).toBe(K(250));
    const noPaybill = await newTenant('Mpesa Sim None');
    expect((await post(noPaybill.owner.auth, '/v1/mpesa/simulate', { billRef: 'M00001', amountCents: 100 })).status).toBe(400);
  });
});

// ---- statement intake ------------------------------------------------------------------------------------------

const HEADER = 'Receipt No.,Completion Time,Details,Transaction Status,Paid in,Withdrawn,Balance';
function statement(months: number, opts: { breakBalance?: boolean; duplicate?: boolean; irregular?: boolean } = {}): string {
  const lines = [HEADER];
  let balance = 10_000_00;
  let n = 0;
  for (let m = months; m >= 1; m -= 1) {
    const base = new Date(Date.now() - m * 30 * 86_400_000);
    for (const [day, details, inc, out] of [[2, 'Funds received from - 254711000111 ACME LTD', opts.irregular && m === 2 ? 5_000_00 : 40_000_00, 0], [6, 'Pay Bill to 888880 - LANDLORD', 0, 12_000_00], [11, 'Customer Transfer to - 254722000222 SHOP', 0, 4_000_00]] as const) {
      const d = new Date(base.getTime()); d.setUTCDate(day);
      balance += inc - out;
      n += 1;
      const shown = opts.breakBalance && n === 4 ? balance + 9_999_00 : balance;
      lines.push(`RC${String(n).padStart(8, '0')},${d.toISOString().slice(0, 10)} 10:${String(10 + n % 50).padStart(2, '0')}:00,${details},Completed,${(inc / 100).toFixed(2)},${(out / 100).toFixed(2)},${(shown / 100).toFixed(2)}`);
    }
  }
  if (opts.duplicate) lines.push(lines[1]!);
  return lines.join('\n');
}

describe('statement parsing (pure; the file layouts are synthetic, not a real Safaricom statement)', () => {
  it('reads quoted fields, doubled quotes, semicolons and a byte-order mark', () => {
    expect(parseCsv('﻿a,b\n"x, y","say ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
    expect(parseCsv('a;b;c\n1;2;3\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });
  it('parses money and times the way they are written', () => {
    expect(parseMoney('1,234.50')).toBe(123_450);
    expect(parseMoney('-300.00')).toBe(30_000);
    expect(parseMoney('KES 500')).toBe(50_000);
    expect(parseMoney('')).toBe(0);
    expect(() => parseMoney('abc')).toThrow(StatementFormatError);
    expect(parseTime('2026-03-12 14:05:09').toISOString()).toBe('2026-03-12T11:05:09.000Z'); // EAT is UTC+3
    expect(parseTime('12/03/2026 14:05').toISOString()).toBe('2026-03-12T11:05:00.000Z'); // day first
    expect(() => parseTime('yesterday')).toThrow(StatementFormatError);
  });
  it('finds the header by name wherever it sits, and refuses a layout it does not know instead of guessing', () => {
    const withPreamble = `Customer name: SAMPLE\nPeriod: 2026\n\n${HEADER}\nRC1,2026-03-01 08:00:00,Funds received from - 254700 ACME,Completed,1000.00,0.00,1000.00\n`;
    expect(parseStatementCsv(withPreamble)).toHaveLength(1);
    expect(() => parseStatementCsv('Name,Age\nA,3\n')).toThrow(/Format not recognised/);
    expect(() => parseStatementCsv('')).toThrow(StatementFormatError);
    expect(() => parseStatementCsv(`${HEADER}\n`)).toThrow(/no transaction rows/);
  });
  it('summarises inflow by month and states its own limits', () => {
    const { summary } = summarise(parseStatementCsv(statement(4)), 3000);
    expect(summary.monthsCovered).toBeGreaterThanOrEqual(4);
    expect(summary.averageMonthlyInflowCents).toBeGreaterThan(0);
    expect(summary.topInflowSources[0]!.name).toContain('ACME');
    expect(summary.indicativeCapacityCents).toBe(Math.round((summary.averageMonthlyInflowCents * 3000) / 10_000));
    expect(summary.note).toMatch(/not a credit decision/);
  });
  it('flags a running balance that does not follow from the amounts, duplicate receipts, and a short period', () => {
    const edited = parseStatementCsv(statement(4, { breakBalance: true }));
    const { summary } = summarise(edited, 3000);
    expect(consistencyFlags(edited, summary).some((f) => f.code === 'balance_breaks')).toBe(true);
    const dup = parseStatementCsv(statement(4, { duplicate: true }));
    expect(consistencyFlags(dup, summarise(dup, 3000).summary).some((f) => f.code === 'duplicate_receipts' && f.severity === 'high')).toBe(true);
    const short = parseStatementCsv(statement(1));
    expect(consistencyFlags(short, summarise(short, 3000).summary).some((f) => f.code === 'short_period')).toBe(true);
    const clean = parseStatementCsv(statement(5));
    expect(consistencyFlags(clean, summarise(clean, 3000).summary).filter((f) => f.severity === 'high')).toHaveLength(0);
  });
  it('refuses PDF text it cannot read rather than return a partial statement', () => {
    expect(() => parseStatementPdfText('This is not a statement\nat all')).toThrow(/Format not recognised/);
  });
});

describe('document checks (pure)', () => {
  it('catches a payslip that does not add up, and one whose net exceeds gross', () => {
    expect(checkPayslip({ grossCents: 60_000_00, deductions: [{ name: 'PAYE', amountCents: 9_000_00 }, { name: 'NSSF', amountCents: 1_080_00 }], netCents: 49_920_00 })).toHaveLength(0);
    const flags = checkPayslip({ grossCents: 60_000_00, deductions: [{ name: 'PAYE', amountCents: 9_000_00 }], netCents: 58_000_00 });
    expect(flags.map((f) => f.code)).toContain('arithmetic');
    expect(checkPayslip({ grossCents: 10_000_00, deductions: [], netCents: 12_000_00 }).map((f) => f.code)).toEqual(expect.arrayContaining(['net_above_gross', 'arithmetic', 'no_deductions']));
  });
  it('flags unusual national ID shapes and a mismatch with the record', () => {
    expect(checkNationalId('29384756', '29384756')).toHaveLength(0);
    expect(checkNationalId('12345678', null).map((f) => f.code)).toContain('sequence');
    expect(checkNationalId('123', null).map((f) => f.code)).toContain('unusual_length');
    expect(checkNationalId('11111111', null).map((f) => f.code)).toContain('repeated_digit');
    expect(checkNationalId('A1234567', null).map((f) => f.code)).toContain('not_numeric');
    expect(checkNationalId('29384756', '65748392').map((f) => f.code)).toContain('differs_from_record');
  });
});

describe.runIf(on)('statement intake through the API (real Postgres)', () => {
  it('stores an upload with its figures and flags, refuses the same file twice, and records a failed upload', async () => {
    const t = await newTenant('Intake', 'lender');
    const officer = await addStaff(t, 'loan_officer');
    const m = await makeMember(t.owner.auth);
    const csv = statement(4);
    const body = { memberId: m.id, filename: 'statement.csv', contentBase64: Buffer.from(csv).toString('base64') };
    const first = await post(officer.auth, '/v1/intake/statement', body);
    expect(first.status).toBe(201);
    expect(first.body.rows).toBeGreaterThan(8);
    expect(first.body.summary.averageMonthlyInflowCents).toBeGreaterThan(0);
    expect((await post(officer.auth, '/v1/intake/statement', body)).status).toBe(409);
    const bad = await post(officer.auth, '/v1/intake/statement', { memberId: m.id, filename: 'junk.csv', contentBase64: Buffer.from('Name,Age\nA,3\n').toString('base64') });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/Format not recognised/);
    const history = await get(officer.auth, `/v1/members/${m.id}/intake`);
    expect(history.body.statements.map((s: { status: string }) => s.status).sort()).toEqual(['failed', 'parsed']);
    const cap = await post(officer.auth, '/v1/intake/capacity', { uploadId: first.body.id, instalmentCents: 1_000_00 });
    expect(cap.body.fits).toBe(true);
    expect((await post(officer.auth, '/v1/intake/capacity', { uploadId: first.body.id, instalmentCents: 900_000_00 })).body.fits).toBe(false);
  });

  it('refuses a PDF when the server has no text extractor, saying why', async () => {
    const t = await newTenant('Intake Pdf', 'lender');
    const m = await makeMember(t.owner.auth);
    const res = await post(t.owner.auth, '/v1/intake/statement', { memberId: m.id, filename: 'm-pesa.pdf', contentBase64: Buffer.from('%PDF-1.4\n%fake').toString('base64') });
    expect(res.status).toBe(400);
    expect(res.body.message.length).toBeGreaterThan(10);
  });

  it('checks a payslip and an ID against the member record, and a teller cannot use intake', async () => {
    const t = await newTenant('Intake Docs', 'lender');
    const teller = await addStaff(t, 'teller');
    const m = await makeMember(t.owner.auth);
    const slip = await post(t.owner.auth, '/v1/intake/payslip', { memberId: m.id, grossCents: 50_000_00, deductions: [{ name: 'PAYE', amountCents: 8_000_00 }], netCents: 40_000_00 });
    expect(slip.body.flags.map((f: { code: string }) => f.code)).toContain('arithmetic');
    const id = await post(t.owner.auth, '/v1/intake/national-id', { memberId: m.id, idNumber: '55555555' });
    expect(id.body.flags.map((f: { code: string }) => f.code)).toEqual(expect.arrayContaining(['repeated_digit', 'differs_from_record']));
    expect((await post(teller.auth, '/v1/intake/payslip', { memberId: m.id, grossCents: 1, deductions: [], netCents: 1 })).status).toBe(403);
  });
});

describe('return templates (pure)', () => {
  it('accepts a template made only of measures from the fixed vocabulary, and rejects anything else', () => {
    const ok = { title: 'Title', sections: [{ title: 'Section', rows: [{ label: 'Members', measure: { kind: 'members_count', status: 'active' }, format: 'count' }] }] };
    expect(definitionSchema.safeParse(ok).success).toBe(true);
    const sql = { title: 'Title', sections: [{ title: 'Section', rows: [{ label: 'x', measure: { kind: 'sql', query: 'SELECT 1' } }] }] };
    expect(definitionSchema.safeParse(sql).success).toBe(false);
    const injection = { title: 'Title', sections: [{ title: 'Section', rows: [{ label: 'x', measure: { kind: 'ledger_balance', codes: ["1010'; DROP TABLE accounts;--"] } }] }] };
    expect(definitionSchema.safeParse(injection).success).toBe(false);
  });
});

describe.runIf(on)('returns (real Postgres)', () => {
  it('generates the generic returns from the ledger, and says in every one that it is not an official regulator return', async () => {
    const t = await newTenant('Returns');
    const s = await fullStaff(t);
    const m = await makeMember(t.owner.auth);
    await deposit(t.owner.auth, m.id, K(20_000));
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200 });
    await lendUntil(s, m.id, p, K(10_000), 3, 'disbursed');
    const templates = (await get(s.accountant.auth, '/v1/returns/templates')).body;
    expect(templates.map((x: { code: string }) => x.code).sort()).toEqual(['GENERIC-FIN-POSITION', 'GENERIC-MEMBERSHIP', 'GENERIC-PORTFOLIO-QUALITY']);
    const today = new Date().toISOString().slice(0, 10);
    const position = templates.find((x: { code: string }) => x.code === 'GENERIC-FIN-POSITION');
    const made = await post(s.accountant.auth, '/v1/returns', { templateId: position.id, from: `${today.slice(0, 4)}-01-01`, to: today });
    expect(made.status).toBe(201);
    expect(made.body.payload.isOfficial).toBe(false);
    expect(made.body.payload.banner).toMatch(/NOT AN OFFICIAL REGULATOR RETURN/);
    const row = (label: string) => made.body.payload.sections.flatMap((x: { rows: Array<{ label: string; value: number }> }) => x.rows).find((r: { label: string }) => r.label === label);
    expect(row('Member savings').value).toBe(K(20_000));
    expect(row('Loans receivable (principal)').value).toBe(K(10_000));
    const quality = templates.find((x: { code: string }) => x.code === 'GENERIC-PORTFOLIO-QUALITY');
    const q = await post(s.accountant.auth, '/v1/returns', { templateId: quality.id, from: `${today.slice(0, 4)}-01-01`, to: today });
    expect(q.body.payload.notes.join(' ')).toMatch(/Portfolio-at-risk rows are as at/);
    const csv = await get(s.accountant.auth, `/v1/exports/return/${made.body.id}.csv`);
    expect(csv.text).toMatch(/NOT AN OFFICIAL REGULATOR RETURN/);
    expect((await get(s.accountant.auth, '/v1/returns')).body.items.length).toBe(2);
  });

  it('lets only the owner add a template, versions it, and the database refuses to mark one official', async () => {
    const t = await newTenant('Returns Templates');
    const accountant = await addStaff(t, 'accountant');
    const def = { title: 'Quarterly summary', sections: [{ title: 'Members', rows: [{ label: 'Active members', measure: { kind: 'members_count', status: 'active' }, format: 'count' }] }] };
    expect((await post(accountant.auth, '/v1/returns/templates', { code: 'MY-QUARTERLY', name: 'Quarterly', definition: def })).status).toBe(403);
    const v1 = await post(t.owner.auth, '/v1/returns/templates', { code: 'MY-QUARTERLY', name: 'Quarterly', definition: def });
    expect(v1.status).toBe(201);
    expect(v1.body.version).toBe(1);
    expect((await post(t.owner.auth, '/v1/returns/templates', { code: 'MY-QUARTERLY', name: 'Quarterly', definition: def })).body.version).toBe(2);
    expect((await post(t.owner.auth, '/v1/returns/templates', { code: 'BAD-ONE', name: 'Bad', definition: { title: 'x', sections: [{ title: 's', rows: [{ label: 'q', measure: { kind: 'sql', query: 'select 1' } }] }] } })).status).toBe(400);
    const { pool } = await boot();
    await expect(pool.withOrg(t.orgId, (c) => c.query(`INSERT INTO return_templates (org_id, code, name, definition, is_official) VALUES ($1, 'OFFICIAL-X', 'x', '{}'::jsonb, true)`, [t.orgId]))).rejects.toThrow(/check constraint/);
  });
});
