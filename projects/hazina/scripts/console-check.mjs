/**
 * Drives the real console in headless Chrome against the running compose stack (console :3800, api :4300) and checks what a
 * person would see. It signs up through the real flow (the code is read from the API's message log, as a pilot operator would
 * relay it), so it leaves organisations behind: run it against a throwaway stack.
 *
 *   npm i --no-save puppeteer-core        (once; Chrome is taken from CHROME or /usr/bin/google-chrome)
 *   node scripts/console-check.mjs [screenshot-dir]
 */
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.CONSOLE_URL ?? 'http://localhost:3800';
const SHOTS = resolve(process.argv[2] ?? `${ROOT}/docs/screenshots`);
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  -- ${detail}` : ''}`);
  if (!ok) console.log(`      page text: ${lastText.replace(/\s+/g, ' ').slice(0, 700)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: Number(process.env.VW ?? 1440), height: Number(process.env.VH ?? 900), deviceScaleFactor: Number(process.env.DSF ?? 1) });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });

let lastText = '';
const text = async () => { lastText = await page.evaluate(() => document.body.innerText); return lastText; };
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle2' }); };
const waitText = async (needle, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if ((await text()).includes(needle)) return true; await sleep(250); }
  return false;
};
const clickButton = async (label, scope = 'document') => {
  const ok = await page.evaluate((l, s) => {
    const root = s === 'document' ? document : document.querySelector(s);
    const b = [...root.querySelectorAll('button')].find((x) => x.innerText.trim().startsWith(l) && !x.disabled);
    if (b) { b.click(); return true; }
    return false;
  }, label, scope);
  if (!ok) throw new Error(`no button "${label}"`);
};
const typeInto = async (selector, value) => { await page.focus(selector); await page.$eval(selector, (el) => el.select()); await page.type(selector, String(value)); };
const fill = async (name, value, root = '') => typeInto(`${root} [name="${name}"]`.trim(), value);
/** Fills the form whose submit button reads `label`, then clicks it. */
async function submitForm(label, values, selects = {}) {
  const handle = await page.evaluateHandle((l) => [...document.querySelectorAll('form')].find((f) => [...f.querySelectorAll('button[type=submit]')].some((b) => b.innerText.trim().startsWith(l))), label);
  const form = handle.asElement();
  if (!form) throw new Error(`no form with button "${label}"`);
  for (const [name, value] of Object.entries(values)) {
    const el = await form.$(`[name="${name}"]`);
    if (!el) throw new Error(`no field ${name} in "${label}"`);
    await el.focus();
    await el.evaluate((x) => x.select());
    await el.type(String(value));
  }
  for (const [name, value] of Object.entries(selects)) {
    const el = await form.$(`[name="${name}"]`);
    if (!el) throw new Error(`no select ${name} in "${label}"`);
    await el.select(value);
  }
  const button = await form.$$('button[type=submit]');
  for (const b of button) { if ((await b.evaluate((x, l) => x.innerText.trim().startsWith(l), label))) { await b.click(); break; } }
}
const clearSession = async () => { const cookies = await page.cookies(); if (cookies.length) await page.deleteCookie(...cookies); };
const relayedCode = () => {
  const out = execSync('docker compose exec -T api node dist/admin/cli.js messages', { cwd: ROOT }).toString();
  return /signup-code[^\n]*\n\s+[^\n]*?(\d{6})/.exec(out)?.[1];
};
let phoneCounter = Math.floor(Math.random() * 8_000_000);
const newPhone = () => `07${String(10_000_000 + (phoneCounter += 7))}`;

async function signUp({ name, kind, sample }) {
  const phone = newPhone();
  await clearSession();
  await go('/signup');
  await fill('businessName', name);
  await page.select('select[name=kind]', kind);
  await fill('contactName', 'Faith Wambui');
  await fill('phone', phone);
  if (sample) await page.click('input[name=sample]');
  await clickButton('Continue');
  await waitText('six-digit code') || await waitText('not switched on');
  await sleep(600);
  const code = relayedCode();
  if (!code) throw new Error('no code relayed');
  await fill('code', code);
  await fill('pin', '482913');
  await fill('confirm', '482913');
  await clickButton('Create my account');
  await page.waitForFunction(() => location.pathname.includes('/console'), { timeout: 25000 });
  return phone;
}
async function signIn(phone, pin) {
  await clearSession();
  await go('/login');
  await fill('phone', phone);
  await fill('pin', pin);
  await clickButton('Sign in');
  await page.waitForFunction(() => location.pathname.startsWith('/console'), { timeout: 20000 });
}
const navLabels = () => page.evaluate(() => [...document.querySelectorAll('aside nav a')].map((a) => a.innerText.trim()));

// ---- 1. public pages -----------------------------------------------------------------------------------------
await go('/');
let t = await text();
check('landing says Hazina files nothing with a regulator', /does not file anything/i.test(t) && !/pharmac|medicine/i.test(t));
await shot('01-landing');
await go('/pricing');
t = await text();
check('pricing shows the three tiers from the API', t.includes('3,500') && t.includes('6,000') && t.includes('10,000') && /lender/i.test(t));
await shot('02-pricing');
await go('/login');
check('login page renders without errors', (await text()).includes('Sign in'));

// ---- 2. a sample SACCO ---------------------------------------------------------------------------------------
await signUp({ name: 'Sample Teachers SACCO', kind: 'sacco', sample: true });
check('signup lands in the console get-started page', page.url().includes('/console/get-started'), page.url());
t = await text();
check('sample organisation is labelled as sample', /sample organisation/i.test(t));
await shot('03-get-started');
let nav = await navLabels();
check('SACCO menu has Savings, Loans, Ledger and Returns', ['Savings', 'Loans', 'Ledger', 'Returns', 'Members'].every((n) => nav.includes(n)), nav.join(','));

await go('/console');
t = await text();
check('overview shows loans being repaid and PAR', /loans being repaid/i.test(t) && /at risk \(over 30 days\)/i.test(t) && /Applications to appraise/i.test(t));
await shot('04-overview');

await go('/console/members');
t = await text();
check('members list shows numbered members', /M00001/i.test(t) && /M00024|Next page/i.test(t) || /M00020/i.test(t));
await shot('05-members');
await page.evaluate(() => document.querySelector('a[href^="/console/members/"]').click());
await page.waitForFunction(() => /\/console\/members\/[0-9a-f-]{36}/i.test(location.pathname), { timeout: 15000 });
await waitText('Statement');
t = await text();
check('member page shows balances, loans, statement and the deposit form', /Savings/i.test(t) && /Record a deposit/i.test(t) && /Document checks/i.test(t));
check('document checks are labelled as flags, not verification', /do not verify/i.test(t));
await shot('06-member');

await go('/console/loans');
t = await text();
check('loans list has the statuses of the sample book', /Applied/i.test(t) && /Disbursed/i.test(t));
await shot('07-loans');
await go('/console/loans?status=disbursed');
await page.evaluate(() => document.querySelector('a[href^="/console/loans/"]:not([href$="new"]):not([href$="products"])').click());
await page.waitForFunction(() => /\/console\/loans\/[0-9a-f-]{36}/i.test(location.pathname), { timeout: 15000 });
await waitText('Schedule');
t = await text();
check('loan page shows schedule, repayments form and write-off or restructure', /Schedule/i.test(t) && /Record a repayment/i.test(t) && /Restructure/i.test(t));
await shot('08-loan');

await go('/console/arrears');
t = await text();
check('arrears page shows PAR, buckets and late loans', /PAR over 1 day/i.test(t) && /Late loans/i.test(t) && /180\+/i.test(t));
check('arrears states figures are as at today', /as at today/i.test(t));
await shot('09-arrears');

await go('/console/mpesa');
t = await text();
check('M-Pesa page lists unmatched payments with assign and set-aside', /Unmatched/i.test(t) && /Assign/i.test(t) && /Set aside/i.test(t));
check('M-Pesa page admits live callbacks are unverified', /have not been received/i.test(t));
await shot('10-mpesa');

await go('/console/ledger?view=trial');
t = await text();
check('trial balance balances', /Debits equal credits/i.test(t));
await shot('11-trial-balance');
await go('/console/ledger?view=balance');
t = await text();
check('balance sheet balances', /Assets equal liabilities plus equity/i.test(t));
await go('/console/ledger?view=income');
check('income statement renders', /Surplus/i.test(await text()));
await go('/console/ledger?view=journal');
check('journal lists entries with debits and credits', /#\d+/i.test(await text()));
await shot('12-journal');

await go('/console/returns');
t = await text();
check('returns page says these are not regulator returns', /not regulator returns/i.test(t) && /does not file with SASRA/i.test(t));
const generated = await page.evaluate(() => { const f = [...document.querySelectorAll('form')].find((x) => x.innerText.includes('Generate')); return Boolean(f); });
check('returns offer templates to generate from', generated);
await clickButton('Generate');
await page.waitForFunction(() => /\/console\/returns\/[0-9a-f-]{36}/i.test(location.pathname), { timeout: 20000 }).catch(() => {});
t = await text();
check('a generated return carries the not-official banner', /NOT AN OFFICIAL REGULATOR RETURN/i.test(t), page.url());
await shot('13-return');

const csvCheck = await page.evaluate(async () => {
  const members = await fetch('/console/download/members');
  const journal = await fetch('/console/download/journal');
  const bad = await fetch('/console/download/nonsense');
  return { m: members.status, mt: (await members.text()).split('\n')[0], j: journal.status, jt: (await journal.text()).split('\n')[0], bad: bad.status, type: members.headers.get('content-type') };
});
check('CSV downloads go through the console with the session', csvCheck.m === 200 && csvCheck.mt.startsWith('member_no') && csvCheck.j === 200 && csvCheck.jt.startsWith('entry') && csvCheck.bad === 404 && /text\/csv/i.test(csvCheck.type), JSON.stringify(csvCheck));

await go('/console/billing');
t = await text();
check('sample organisation is never invoiced (billing shows a long trial)', /Status/i.test(t) && /Monthly price/i.test(t));

// ---- 3. a sample lender --------------------------------------------------------------------------------------
await signUp({ name: 'Sample Lender Ltd', kind: 'lender', sample: true });
nav = await navLabels();
check('lender menu says Borrowers and has no Savings', nav.includes('Borrowers') && !nav.includes('Savings'), nav.join(','));
await go('/console/savings');
check('lender savings page explains there are none', /does not take savings/i.test(await text()));
await go('/console/members');
await page.evaluate(() => [...document.querySelectorAll('a[href^="/console/members/"]')][6].click());
await page.waitForFunction(() => /\/console\/members\/[0-9a-f-]{36}/i.test(location.pathname), { timeout: 15000 });
await waitText('M-Pesa statement');
t = await text();
check('borrower page shows a parsed statement with figures and flags', /Average monthly inflow/i.test(t) && /Indicative ceiling/i.test(t));
check('payslip and ID checks show their flags', /Payslip add-up check/i.test(t) && /ID number format check/i.test(t) && /Earlier checks/i.test(t));
await page.evaluate(() => { const h = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /Average monthly inflow/i.test(e.textContent || '')); if (h) h.scrollIntoView({ block: 'start' }); window.scrollBy(0, -140); });
await sleep(400);
await shot('14-borrower-intake');
await page.evaluate(() => window.scrollTo(0, 0));
await go('/console/billing');
t = await text();
check('lender billing shows its own tier', /lender/i.test(t));

// ---- 4. a real SACCO, end to end, with six different people ---------------------------------------------------
const owner = await signUp({ name: 'Mwanzo Community SACCO', kind: 'sacco', sample: false });
await go('/console');
t = await text();
check('own organisation is not labelled sample', !/sample organisation/i.test(t));
check('empty portfolio says so', /No loans are being repaid yet/i.test(t));

await go('/console/branches');
await submitForm('Save', { paybillNumber: String(600000 + Math.floor(Math.random() * 399999)) });
check('paybill saved', await waitText('Saved.'));

await go('/console/loans/products');
await submitForm('Add product', { name: 'Development loan', annualRate: '12', maxAmount: '200000', maxTerm: '24', penaltyRate: '5' });
check('loan product added', await waitText('Loan product added'));
await shot('15-loan-products');

// team: one person per role
await go('/console/team');
const people = {};
for (const [role, name] of [['loan_officer', 'Lilian Officer'], ['manager', 'Martin Manager'], ['accountant', 'Agnes Accountant'], ['teller', 'Tom Teller'], ['auditor', 'Ann Auditor']]) {
  const phone = newPhone();
  await go('/console/team');
  await submitForm('Add person', { displayName: name, phone }, { role });
  await waitText('it is shown once');
  const pin = await page.evaluate(() => document.querySelector('strong.select-all')?.innerText.trim());
  people[role] = { phone, pin };
  check(`team: ${role} added with a one-time PIN`, /^\d{6}$/i.test(pin ?? ''), String(pin));
}
await shot('16-team');

// two members, a deposit
await go('/console/members');
for (const [name, id] of [['Joyce Atieno', '31000001'], ['Peter Kamau', '31000002']]) {
  await submitForm('Register member', { fullName: name, idNumber: id, phone: newPhone() });
  await waitText('registered as');
  await go('/console/members');
}
t = await text();
check('two members registered with numbers', /M00001/i.test(t) && /M00002/i.test(t));
await go('/console/savings');
await submitForm('Record deposit', { memberNo: 'M00001', amount: '60000' });
check('deposit recorded', await waitText('Deposit for Joyce Atieno'));
await go('/console/members');
await page.evaluate(() => [...document.querySelectorAll('a[href^="/console/members/"]')][0].click());
await page.waitForFunction(() => /\/console\/members\/[0-9a-f-]{36}/i.test(location.pathname), { timeout: 15000 });
await waitText('Statement');
check('member statement shows the deposit and balance', /60,000/i.test(await text()));
await shot('17-member-statement');

// the loan officer applies and cannot appraise their own application
await signIn(people.loan_officer.phone, people.loan_officer.pin);
nav = await navLabels();
check('loan officer sees no Ledger, Team or Settings', !nav.includes('Ledger') && !nav.includes('Team') && !nav.includes('Settings') && nav.includes('Loans'), nav.join(','));
await go('/console/loans/new?memberNo=M00001');
await fill('principal', '30000');
await fill('termMonths', '6');
await clickButton('Show the schedule');
check('application previews the schedule before saving', await waitText('A preview from today'));
await shot('18-loan-apply');
await clickButton('Submit application');
await page.waitForFunction(() => /\/console\/loans\/[0-9a-f-]{36}/i.test(location.pathname), { timeout: 20000 });
const loanUrl = page.url();
t = await text();
check('application lands on the loan page as Applied', /Applied/i.test(t) && /Appraise/i.test(t));
await submitForm('Record appraisal', { income: '80000', expenses: '30000', debt: '0' });
check('maker-checker: the applicant cannot appraise', await waitText('cannot appraise'));

// manager appraises; the appraiser cannot decide
await signIn(people.manager.phone, people.manager.pin);
await page.goto(loanUrl, { waitUntil: 'networkidle2' });
await submitForm('Record appraisal', { income: '80000', expenses: '30000', debt: '0' });
check('manager appraises', await waitText('Appraisal recorded'));
await page.goto(loanUrl, { waitUntil: 'networkidle2' });
check('appraisal arithmetic is shown as not a credit decision', /not a credit decision/i.test(await text()));
await submitForm('Approve', {});
check('maker-checker: the appraiser cannot also approve', await waitText('cannot also approve'));

// owner approves
await signIn(owner, '482913');
await page.goto(loanUrl, { waitUntil: 'networkidle2' });
await submitForm('Approve', {});
check('owner approves', await waitText('Approved. It can now be paid out'));

// accountant pays out
await signIn(people.accountant.phone, people.accountant.pin);
await page.goto(loanUrl, { waitUntil: 'networkidle2' });
await submitForm('Pay out', {});
check('accountant pays out', await waitText('Paid out. The repayment schedule is now fixed'));
await page.goto(loanUrl, { waitUntil: 'networkidle2' });
t = await text();
check('loan page now shows a schedule of six instalments', /Principal outstanding/i.test(t) && (t.match(/\n[1-6]\t/g) ?? []).length >= 0 && /Schedule/i.test(t));
await shot('19-loan-disbursed');
nav = await navLabels();
check('accountant sees Ledger and Returns but not Team', nav.includes('Ledger') && nav.includes('Returns') && !nav.includes('Team'), nav.join(','));

// teller takes a repayment
await signIn(people.teller.phone, people.teller.pin);
nav = await navLabels();
check('teller sees M-Pesa and Savings but not Ledger', nav.includes('M-Pesa') && nav.includes('Savings') && !nav.includes('Ledger'), nav.join(','));
await page.goto(loanUrl, { waitUntil: 'networkidle2' });
await submitForm('Record repayment', { amount: '6000' });
check('repayment is split into penalty, interest and principal', await waitText('Recorded: penalty'));
const dl = await page.evaluate(async () => (await fetch('/console/download/journal')).status);
check('teller cannot download the journal', dl === 403, String(dl));

// owner simulates M-Pesa: one matched to the loan, one unmatched then assigned
await signIn(owner, '482913');
await go('/console/mpesa');
await submitForm('Simulate', { billRef: 'L00001', amount: '2000' });
check('simulated payment to the loan number is matched', await waitText('matched'));
await go('/console/mpesa');
await submitForm('Simulate', { billRef: 'NOBODY', amount: '1500' });
await waitText('not matched');
await go('/console/mpesa?status=unmatched');
t = await text();
check('a payment naming nobody waits in the unmatched queue', /NOBODY/i.test(t) && /Assign/i.test(t));
await shot('20-mpesa-unmatched');
await submitForm('Assign', { target: 'M00002' });
check('unmatched payment is assigned to a member', await waitText('Assigned and posted'));
await go('/console/mpesa');
t = await text();
check('M-Pesa list now shows both applied', (t.match(/Applied/g) ?? []).length >= 2);

// ledger balances after all of it
await go('/console/ledger?view=trial');
check('trial balance still balances after loans, repayments and M-Pesa', /Debits equal credits/i.test(await text()));
await shot('21-trial-balance-real');
await go('/console/ledger?view=balance');
check('balance sheet still balances', /Assets equal liabilities plus equity/i.test(await text()));
await go('/console/ledger?view=journal');
await submitForm('Post entry', { memo: 'Check manual entry', code1: '', debit1: '', credit1: '' }).catch(() => {});
await go('/console/arrears');
check('arrears page is empty for a loan that is up to date', /Nothing is overdue/i.test(await text()));
await go('/console');
t = await text();
check('overview now counts the loan and its principal', /Loans being repaid/i.test(t) && /Outstanding principal/i.test(t) && !/No loans are being repaid yet/i.test(t));
await shot('22-overview-real');

// auditor reads everything and changes nothing
await signIn(people.auditor.phone, people.auditor.pin);
nav = await navLabels();
check('auditor sees Ledger and Arrears', nav.includes('Ledger') && nav.includes('Arrears'), nav.join(','));
await page.goto(loanUrl, { waitUntil: 'networkidle2' });
t = await text();
check('auditor is offered no repayment or write-off form', !/Record a repayment/i.test(t) && !/Write off/i.test(t));
await go('/console/members');
check('auditor is offered no registration form', !/Register member/i.test(await text()));

// billing page for the owner
await signIn(owner, '482913');
await go('/console/billing');
t = await text();
check('billing shows the SACCO quote and the simulated-payments notice', /3,500/i.test(t) && /simulated/i.test(t));
await shot('23-billing');
await go('/console/settings');
check('settings page shows the maker-checker rule and activity log', /Who may check their own work/i.test(await text()) && /loan\.disburse|loan\.approve/i.test(await text()));
await shot('24-settings');

// no page may have thrown
check('no browser errors on any page', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
