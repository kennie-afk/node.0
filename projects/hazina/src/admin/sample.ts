/**
 * Sample data for the "try it first" organisation. It is built by calling the real services (not by inserting rows), so
 * what a visitor sees is what the product produces: a gap-free ledger, schedules that add up, penalties, an arrears
 * ageing, items waiting for a second person, an unmatched M-Pesa payment queue. Names, ID numbers and phone numbers are
 * invented and sit in ranges that belong to no one (ID numbers 90000001 up, phones 254700000000 up). Dates are relative to
 * today so the arrears are always current.
 *
 * Because it runs inside the organisation's own transaction under maker-checker, the steps of each loan are taken by four
 * different synthetic staff ids; they appear in the audit trail as sample staff.
 */
import { PoolClient } from 'pg';
import { Ctx } from '../common/context';
import { createMember } from '../members/service';
import { postDeposit, requestWithdrawal } from '../savings/service';
import {
  applyForLoan, appraiseLoan, createProduct, decideLoan, disburseLoan, repayLoan, runPenalties
} from '../loans/service';
import { addDaysToDay } from '../loans/schedule';
import { uploadStatement, recordPayslipCheck, recordIdCheck } from '../intake/service';
import { SYSTEM_USER_ID } from '../mpesa/service';

const OFFICER = '00000000-0000-4000-8000-000000000a01';
const APPRAISER = '00000000-0000-4000-8000-000000000a02';
const APPROVER = '00000000-0000-4000-8000-000000000a03';
const ACCOUNTANT = '00000000-0000-4000-8000-000000000a04';

const NAMES = [
  'Wanjiku Kamau', 'Otieno Odhiambo', 'Achieng Atieno', 'Kiprono Chebet', 'Mwende Mutua', 'Njoroge Githinji', 'Akinyi Owino', 'Kipchoge Rotich',
  'Naliaka Wekesa', 'Mutheu Kioko', 'Barasa Simiyu', 'Chepkemoi Langat', 'Wambui Maina', 'Ouma Onyango', 'Jeptoo Kosgei', 'Mueni Musyoka',
  'Karanja Mwangi', 'Adhiambo Ochieng', 'Kibet Tanui', 'Nyambura Njenga', 'Omondi Okoth', 'Wafula Mukhwana', 'Zawadi Mwanzia', 'Hawa Abdi'
];

async function today(client: PoolClient): Promise<string> {
  return (await client.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS d`)).rows[0].d as string;
}

const kes = (n: number) => n * 100;

export async function seedSampleData(client: PoolClient, orgId: string, kind: 'sacco' | 'lender', ownerId: string): Promise<void> {
  const base: Omit<Ctx, 'userId' | 'role'> = { orgId, branchId: null };
  const as = (userId: string, role: Ctx['role'] = 'manager'): Ctx => ({ ...base, userId, role });
  const D = await today(client);

  const people = kind === 'sacco' ? NAMES : NAMES.slice(0, 16);
  const members: Array<{ id: string; memberNo: string; name: string }> = [];
  for (let i = 0; i < people.length; i += 1) {
    const m = await createMember(client, as(OFFICER), {
      fullName: people[i]!,
      idNumber: String(90_000_001 + i),
      phone: `254700000${String(100 + i).padStart(3, '0')}`,
      gender: i % 2 === 0 ? 'female' : 'male',
      employer: i % 3 === 0 ? 'County government' : i % 3 === 1 ? 'Self-employed' : 'Teachers Service Commission'
    });
    members.push({ id: m.id, memberNo: m.memberNo, name: people[i]! });
  }

  const dev = await createProduct(client, as(APPROVER), {
    name: kind === 'sacco' ? 'Development loan' : 'Biashara loan', method: 'reducing', annualRateBp: kind === 'sacco' ? 1400 : 2400,
    minAmountCents: kes(5_000), maxAmountCents: kes(500_000), minTermMonths: 3, maxTermMonths: 36, processingFeeBp: 100, insuranceFeeBp: 0,
    penaltyRateBp: 500, graceDays: 0, maxMultipleOfSavings: 0, guarantorsRequired: 0
  });
  const quick = await createProduct(client, as(APPROVER), {
    name: kind === 'sacco' ? 'Emergency loan' : 'Salary advance', method: 'flat', annualRateBp: kind === 'sacco' ? 1000 : 3600,
    minAmountCents: kes(1_000), maxAmountCents: kes(50_000), minTermMonths: 1, maxTermMonths: 6, processingFeeBp: 0, insuranceFeeBp: 0,
    penaltyRateBp: 500, graceDays: 0, maxMultipleOfSavings: 0, guarantorsRequired: 0
  });

  if (kind === 'sacco') {
    const start = addDaysToDay(D, -170);
    for (let i = 0; i < members.length; i += 1) {
      const savings = kes(8_000 + ((i * 7_919) % 40_000));
      await postDeposit(client, as(OFFICER), { memberId: members[i]!.id, product: 'savings', amountCents: i === 3 ? kes(120_000) : savings, channel: i % 2 ? 'mpesa' : 'cash', reference: i % 2 ? `SMP${String(i).padStart(7, '0')}` : null, occurredOn: start });
      await postDeposit(client, as(OFFICER), { memberId: members[i]!.id, product: 'shares', amountCents: kes(2_000 + (i % 5) * 1_000), channel: 'cash', occurredOn: start });
      await postDeposit(client, as(OFFICER), { memberId: members[i]!.id, product: 'deposits', amountCents: kes(5_000 + (i % 4) * 5_000), channel: 'bank', occurredOn: start });
    }
    // a withdrawal large enough to need a second person
    await requestWithdrawal(client, as(OFFICER, 'teller'), { memberId: members[3]!.id, amountCents: kes(60_000), channel: 'bank' });
  }

  // Walks one loan through application, appraisal, approval and payout, taken by four different people.
  const lend = async (memberIndex: number, productId: string, amountKes: number, term: number, daysAgo: number | null, stage: 'applied' | 'appraised' | 'approved' | 'disbursed', purpose: string) => {
    const applied = await applyForLoan(client, as(OFFICER, 'loan_officer'), { memberId: members[memberIndex]!.id, productId, principalCents: kes(amountKes), termMonths: term, purpose, guarantors: [] });
    if (stage === 'applied') return applied;
    await appraiseLoan(client, as(APPRAISER, 'loan_officer'), applied.id, {
      monthlyIncomeCents: kes(Math.round(amountKes / 2) + 20_000), monthlyExpensesCents: kes(12_000), otherDebtServiceCents: 0, recommendation: 'approve', notes: 'Sample appraisal.'
    });
    if (stage === 'appraised') return applied;
    await decideLoan(client, as(APPROVER), applied.id, { approve: true, note: 'Approved (sample).' });
    if (stage === 'approved') return applied;
    const disbursedOn = addDaysToDay(D, -(daysAgo ?? 1));
    await disburseLoan(client, as(ACCOUNTANT, 'accountant'), applied.id, { channel: 'bank', disbursedOn });
    return applied;
  };

  const payInstalments = async (loanId: string, count: number) => {
    const rows = (await client.query('SELECT installment_no, due_date, principal_cents, interest_cents FROM loan_schedule WHERE loan_id = $1 ORDER BY installment_no LIMIT $2', [loanId, count])).rows;
    for (const r of rows) {
      await repayLoan(client, as(SYSTEM_USER_ID, 'teller'), loanId, { amountCents: Number(r.principal_cents) + Number(r.interest_cents), channel: 'cash', receivedOn: r.due_date as string });
    }
  };

  // paid two, now two overdue (oldest about 60 days)
  await payInstalments((await lend(0, dev.id, 150_000, 12, 150, 'disbursed', 'Dairy shed and equipment')).id, 2);
  // paid four of six, two overdue (oldest about 50 days)
  await payInstalments((await lend(1, quick.id, 30_000, 6, 200, 'disbursed', 'School fees')).id, 4);
  // up to date
  await payInstalments((await lend(2, dev.id, 80_000, 12, 100, 'disbursed', 'Stock for a shop')).id, 3);
  // paid one of three, two overdue (about 35 days)
  await payInstalments((await lend(4, quick.id, 20_000, 3, 95, 'disbursed', 'Medical bill')).id, 1);
  // never paid: well past 180 days
  await lend(5, quick.id, 15_000, 3, 330, 'disbursed', 'Rent');
  // waiting at each stage of the workflow
  await lend(6, dev.id, 60_000, 12, null, 'applied', 'Farm inputs');
  await lend(7, dev.id, 90_000, 18, null, 'appraised', 'Boda boda purchase');
  await lend(8, quick.id, 25_000, 4, null, 'approved', 'Wedding contribution');

  await runPenalties(client, as(ACCOUNTANT, 'accountant'), D);

  // payments from the paybill that nobody could match
  for (const [ref, bill, amount] of [['SMP0UNM001', 'MARY', 2500], ['SMP0UNM002', '', 1000], ['SMP0UNM003', 'M99999', 4000]] as const) {
    await client.query(
      `INSERT INTO mpesa_payments (org_id, external_ref, shortcode, bill_ref, amount_cents, payer_msisdn, received_at, status, note)
       VALUES ($1, $2, 'SAMPLE', $3, $4, '254700000999', now() - interval '2 days', 'unmatched', $5)`,
      [orgId, `${ref}${orgId.slice(0, 4).toUpperCase()}`, bill, kes(amount), bill ? `The account reference "${bill}" does not name a member or loan.` : 'The payment had no account reference.']
    );
  }

  if (kind === 'lender') {
    // a synthetic statement, so the intake screen has something to show: four months, some irregularity
    const lines = ['Receipt No.,Completion Time,Details,Transaction Status,Paid in,Withdrawn,Balance'];
    let balance = 12_000_00;
    let n = 0;
    for (let m = 4; m >= 1; m -= 1) {
      const monthStart = addDaysToDay(D, -m * 30);
      const events: Array<[number, string, number, number]> = [
        [2, 'Funds received from - 254711000111 SAMPLE EMPLOYER LTD', m === 2 ? 22_000_00 : 48_000_00, 0],
        [5, 'Pay Bill to 888880 - SAMPLE LANDLORD', 0, 15_000_00],
        [9, 'Customer Transfer to - 254722000222 SAMPLE SHOP', 0, 6_500_00],
        [14, 'Funds received from - 254733000333 SAMPLE CLIENT', m === 3 ? 0 : 9_000_00, 0],
        [20, 'Pay Bill to 400200 - SAMPLE GROCER', 0, 11_200_00]
      ];
      for (const [offset, details, paidIn, out] of events) {
        if (paidIn === 0 && out === 0) continue;
        balance += paidIn - out;
        n += 1;
        lines.push(`SAMPLE${String(n).padStart(4, '0')}X,${addDaysToDay(monthStart, offset)} 09:${String(10 + n).padStart(2, '0')}:00,${details},Completed,${(paidIn / 100).toFixed(2)},${(out / 100).toFixed(2)},${(balance / 100).toFixed(2)}`);
      }
    }
    const csv = Buffer.from(lines.join('\n'), 'utf8');
    const up = await uploadStatement(client, as(OFFICER, 'loan_officer'), { memberId: members[6]!.id, filename: 'sample-mpesa-statement.csv', contentBase64: csv.toString('base64') });
    if (!up.ok) throw new Error(`the sample statement did not parse: ${up.error}`);
    await recordPayslipCheck(client, as(OFFICER, 'loan_officer'), { memberId: members[6]!.id, grossCents: kes(60_000), deductions: [{ name: 'PAYE', amountCents: kes(9_000) }, { name: 'NSSF', amountCents: kes(1_080) }], netCents: kes(49_920), month: D.slice(0, 7) });
    await recordPayslipCheck(client, as(OFFICER, 'loan_officer'), { memberId: members[7]!.id, grossCents: kes(60_000), deductions: [{ name: 'PAYE', amountCents: kes(9_000) }], netCents: kes(58_000), month: D.slice(0, 7) });
    await recordIdCheck(client, as(OFFICER, 'loan_officer'), { memberId: members[6]!.id, idNumber: '90000007' });
  }
  void ownerId;
}
