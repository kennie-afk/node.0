#!/usr/bin/env node
/**
 * Seeds a demo church through the real API so every finance screen has data to show:
 *   API=http://localhost:14400 node src/features/finance/dev/seed.mjs
 * Idempotent on the church slug: a second run signs in and stops if the data is already there.
 * Demo passwords are dev-only.
 */
const API = process.env.API ?? 'http://localhost:14400';
const SLUG = process.env.SLUG ?? 'grace-chapel';
const PASSWORD = 'demo-passphrase-123';

async function call(method, path, token, body, extra = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  return json;
}
const login = async (email) => (await call('POST', '/auth/login', null, { email, password: PASSWORD })).token;

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(today.getTime() - n * 86400000));
const year = today.getUTCFullYear();

async function main() {
  try {
    await call('POST', '/churches', null, { church: { name: 'Grace Chapel Nairobi', slug: SLUG }, owner: { username: 'admin', email: `admin@${SLUG}.demo`, password: PASSWORD } });
    console.log('created church', SLUG);
  } catch (e) {
    if (!/taken|already/i.test(String(e))) throw e;
    console.log('church exists; signing in');
  }
  const admin = await login(`admin@${SLUG}.demo`);
  for (const [name, role] of [['treasurer', 'TREASURER'], ['approver', 'APPROVER'], ['auditor', 'AUDITOR'], ['pastor', 'PASTOR']]) {
    try { await call('POST', '/users', admin, { username: name, email: `${name}@${SLUG}.demo`, password: PASSWORD, role }); } catch (e) { if (!/already|in use/i.test(String(e))) throw e; }
  }
  const treasurer = await login(`treasurer@${SLUG}.demo`);
  const approver = await login(`approver@${SLUG}.demo`);

  const names = [['Amina', 'Wanjiru'], ['Brian', 'Otieno'], ['Cynthia', 'Mutua'], ['David', 'Kamau'], ['Esther', 'Achieng'], ['Felix', 'Kiprop'], ['Grace', 'Njeri'], ['Hassan', 'Mohamed'], ['Irene', 'Chebet'], ['James', 'Mwangi'], ['Karen', 'Atieno'], ['Lawrence', 'Ndungu']];
  let members = (await call('GET', '/members?pageSize=100', admin)).data ?? [];
  if (members.length === 0) for (const [i, [firstName, lastName]] of names.entries()) {
    members.push(await call('POST', '/members', admin, { firstName, lastName, phoneNumber: `07${String(10000000 + i * 137).slice(0, 8)}`, email: `${firstName.toLowerCase()}@example.org` }));
  }

  const funds = await call('GET', '/finance/funds', treasurer);
  const accounts = await call('GET', '/finance/accounts?postable=true', treasurer);
  const acct = (code) => accounts.find((a) => a.code === code)?.id;
  const fund = (code) => funds.find((f) => f.code === code)?.id;
  const types = await call('GET', '/giving/types', treasurer);
  const type = (code) => types.find((t) => t.code === code || t.name.toLowerCase().includes(code.toLowerCase()));
  console.log('giving types', types.map((t) => t.code).join(','));

  const phase = async (name, probe, fn) => { if (await probe()) { console.log('skip', name); return; } await fn(); console.log('done', name); };
  const banks = await call('GET', '/banking/accounts', treasurer);
  const cashBank = banks.find((b) => b.kind === 'BANK') ?? banks[0];

  await phase('campaign+gifts', async () => (await call('GET', '/giving/campaigns', treasurer)).length > 0, async () => {
  // A campaign with pledges
  const campaign = await call('POST', '/giving/campaigns', treasurer, { name: 'New Sanctuary Roof', goal: '500000.00', startDate: `${year}-01-01`, fundId: fund('BLD') });
  for (const m of members.slice(0, 5)) {
    await call('POST', '/giving/pledges', treasurer, { memberId: m.id, campaignId: campaign.id, amount: '20000.00', installment: '5000.00', frequency: 'MONTHLY', startDate: `${year}-01-01` });
  }

  // Twelve months of Sunday giving
  const tithe = type('TITHE') ?? types[0];
  const offering = type('OFFERING') ?? types[1];
  let n = 0;
  for (let back = 200; back >= 1; back -= 7) {
    const date = `${daysAgo(back)}T09:00:00.000Z`;
    for (const [i, m] of members.entries()) {
      if ((back + i) % 3 === 0) continue;
      n += 1;
      await call('POST', '/giving/contributions', treasurer, { memberId: m.id, amount: String(1000 + ((i * 37 + back) % 9) * 500) + '.00', date, givingTypeId: tithe.id, paymentMethod: i % 2 ? 'M-Pesa' : 'Cash', transactionId: `SEED-${back}-${i}` }).catch((e) => { if (n < 3) console.log(String(e)); });
    }
    await call('POST', '/giving/contributions', treasurer, { contributorName: 'Sunday plate', amount: String(8000 + (back % 5) * 1500) + '.00', date, givingTypeId: offering.id, paymentMethod: 'Cash', transactionId: `PLATE-${back}` }).catch(() => {});
  }
  console.log('gifts', n);
  });

  await phase('batch', async () => (await call('GET', '/giving/batches', treasurer)).data?.length > 0, async () => {
  // Counting batch: counted by treasurer, verified by approver
  const batch = await call('POST', '/giving/batches', treasurer, { name: 'Sunday service count', serviceDate: daysAgo(1) });
  await call('POST', `/giving/batches/${batch.id}/items`, treasurer, { memberId: members[0].id, amount: '3000.00', givingTypeId: tithe.id, paymentMethod: 'Cash' });
  await call('POST', `/giving/batches/${batch.id}/items`, treasurer, { contributorName: 'Plate', amount: '12000.00', givingTypeId: offering.id, paymentMethod: 'Cash' });
  await call('POST', `/giving/batches/${batch.id}/count`, treasurer, { countedTotal: '15000.00' });
  });

  await phase('bills', async () => (await call('GET', '/payables/bills?limit=1', treasurer)).data?.length > 0, async () => {
  // Vendors and bills
  const vendors = [];
  for (const name of ['Kenya Power', 'Nairobi Water', 'Safaricom', 'Mwangi Builders']) vendors.push(await call('POST', '/payables/vendors', treasurer, { name }));
  const expenseAccount = (code) => acct(code);
  const mkBill = (v, code, amt, billDays, dueDays, ref) =>
    call('POST', '/payables/bills', treasurer, { vendorId: v.id, reference: ref, billDate: daysAgo(billDays), dueDate: daysAgo(dueDays), memo: `${v.name} ${ref}`, lines: [{ accountId: expenseAccount(code), fundId: fund('GEN'), amount: amt, description: ref }] });
  const b1 = await mkBill(vendors[0], '5110', '18400.00', 20, 6, 'KPLC-0921');
  const b2 = await mkBill(vendors[1], '5110', '6250.50', 15, 1, 'NWSC-1100');
  const b3 = await mkBill(vendors[2], '5320', '4200.00', 10, -10, 'SAF-7781');
  const b4 = await mkBill(vendors[3], '5120', '240000.00', 5, -25, 'MB-INV-33');
  for (const b of [b1, b2, b3, b4]) await call('POST', `/payables/bills/${b.id}/submit`, treasurer);
  await call('POST', `/payables/bills/${b1.id}/approve`, approver, {});
  await call('POST', `/payables/bills/${b2.id}/approve`, approver, {});
  await call('POST', `/payables/bills/${b1.id}/pay`, treasurer, { amount: '18400.00', paidDate: daysAgo(3), bankAccountId: cashBank.id }, { 'Idempotency-Key': `seed-pay-${SLUG}-1` });
  await call('POST', `/payables/bills/${b2.id}/pay`, treasurer, { amount: '3000.00', paidDate: daysAgo(1), bankAccountId: cashBank.id }, { 'Idempotency-Key': `seed-pay-${SLUG}-2` });

  });

  await phase('bank+budget+payroll', async () => (await call('GET', '/budgets', treasurer)).length > 0, async () => {
  // Bank statement
  const main = banks.find((b) => b.kind === 'BANK') ?? banks[0];
  const stmt = `Date,Description,Reference,Amount\n${daysAgo(3)},KPLC payment,KPLC-0921,-18400.00\n${daysAgo(2)},Bank charges,CHG1,-350.00\n${daysAgo(1)},Transfer in,TRF9,25000.00\n`;
  await call('POST', `/banking/accounts/${main.id}/statements`, treasurer, { label: 'Current month', csv: stmt, closingBalance: '6250.00' }, { 'Idempotency-Key': `seed-stmt-${SLUG}-1` }).catch((e) => console.log('statement:', String(e).slice(0, 200)));

  // Budget
  const fy = (await call('GET', '/finance/fiscal-years', treasurer))[0];
  const budget = await call('POST', '/budgets', treasurer, { fiscalYearId: fy.id, name: `${year} operating budget`, lines: [
    { accountId: acct('4010'), fundId: fund('GEN'), annual: '1800000.00' }, { accountId: acct('5110'), fundId: fund('GEN'), annual: '300000.00' },
    { accountId: acct('5320'), fundId: fund('GEN'), annual: '60000.00' }, { accountId: acct('5120'), fundId: fund('GEN'), annual: '400000.00' }] });
  await call('POST', `/budgets/${budget.id}/approve`, approver).catch(() => {});
  await call('POST', `/budgets/${budget.id}/activate`, approver).catch(() => {});

  // Payroll
  for (const [name, salary] of [['Pastor Samuel Kiprono', '85000.00'], ['Ruth Wambui', '42000.00'], ['Peter Odhiambo', '28000.00']]) {
    await call('POST', '/payroll/employees', treasurer, { fullName: name, basicSalary: salary, startDate: `${year - 1}-06-01`, fundId: fund('GEN'), kraPin: 'A' + String(100000000 + name.length * 7).slice(0, 9) + 'Z', allowances: [{ name: 'Housing', amount: '10000.00', taxable: true }] }).catch((e) => console.log('employee:', String(e).slice(0, 160)));
  }
  const run = await call('POST', '/payroll/runs', treasurer, { year, month: today.getUTCMonth() === 0 ? 1 : today.getUTCMonth() }).catch((e) => { console.log('run:', String(e).slice(0, 200)); return null; });
  if (run) await call('POST', `/payroll/runs/${run.id}/calculate`, treasurer).catch((e) => console.log('calc:', String(e).slice(0, 200)));

  });
  // M-Pesa unallocated receipt (mock mode only)
  await call('POST', '/mpesa/simulate/c2b', treasurer, { amount: '2500.00', msisdn: '254799000111', billRef: 'BUILDING' }).catch((e) => console.log('mpesa:', String(e).slice(0, 160)));
  console.log('seed complete. Logins (password', PASSWORD + '):', ['admin', 'treasurer', 'approver', 'auditor', 'pastor'].map((r) => `${r}@${SLUG}.demo`).join(', '));
}
main().catch((e) => { console.error(e); process.exit(1); });
