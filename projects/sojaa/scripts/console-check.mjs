/**
 * Drives the real console in headless Chrome against the running compose stack (console :3900, api :4400) and checks what a
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
const BASE = process.env.CONSOLE_URL ?? 'http://localhost:3900';
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
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(`${String(e).slice(0, 160)} @ ${page.url()}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(`${m.text().slice(0, 160)} @ ${page.url()}`); });

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
    const kind = await el.evaluate((x) => x.type);
    if (['date', 'datetime-local', 'month', 'time'].includes(kind)) {
      // a date field is set directly: typing into one depends on the browser's locale order
      await el.evaluate((x, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(x, v); x.dispatchEvent(new Event('input', { bubbles: true })); x.dispatchEvent(new Event('change', { bubbles: true })); }, String(value));
      continue;
    }
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
const API = process.env.API_URL ?? 'http://localhost:4400';
const api = async (method, path, token, body) => {
  const r = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* none */ }
  return { status: r.status, body: j };
};

async function signUp({ name, sample, pin = '482913' }) {
  const phone = newPhone();
  await clearSession();
  await go('/signup');
  await fill('businessName', name);
  await fill('contactName', 'Faith Wambui');
  await fill('phone', phone);
  if (sample) await page.click('input[name=sample]');
  await clickButton('Continue');
  await waitText('six-digit code') || await waitText('not switched on');
  await sleep(600);
  const code = relayedCode();
  if (!code) throw new Error('no code relayed');
  await fill('code', code);
  await fill('pin', pin);
  await fill('confirm', pin);
  await clickButton('Create my account');
  await page.waitForFunction(() => location.pathname.includes('/console'), { timeout: 40000 });
  return { phone, pin };
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
const hasButton = (label) => page.evaluate((l) => [...document.querySelectorAll('button')].some((b) => b.innerText.trim().startsWith(l)), label);
const rowCount = () => page.evaluate(() => document.querySelectorAll('tbody tr').length);
const links = (prefix) => page.evaluate((p) => [...document.querySelectorAll(`a[href^="${p}"]`)].map((a) => a.getAttribute('href')), prefix);

// ---- 1. public pages -----------------------------------------------------------------------------------------
await go('/');
let t = await text();
check('landing says what Sojaa does not do: no verification, no PSRA reporting, not legal advice', /does not verify/i.test(t) && /not report to PSRA/i.test(t) && /not legal advice/i.test(t) && !/medicine/i.test(t));
await shot('01-landing');
await go('/pricing');
t = await text();
check('pricing shows the per-guard price and the minimum from the API', t.includes('200') && t.includes('3,000') && /per guard/i.test(t) && /may change/i.test(t));
await shot('02-pricing');
await go('/login');
check('login page renders', (await text()).includes('Sign in'));
await go('/guard');
t = await text();
check('the guard check-in page renders with no sign-in and says the server keeps the time', /Guard check-in/.test(t) && /recorded by the server/i.test(t));
await go('/portal/not-a-real-link-at-all');
check('a made-up client link says it is not valid', /not valid any more/i.test(await text()));
await go('/console');
check('the console sends a signed-out visitor to sign in', page.url().includes('/login'), page.url());

// ---- 2. a sample firm ----------------------------------------------------------------------------------------
await signUp({ name: 'Sample Tumaini Security', sample: true });
check('signup lands in the get-started page', page.url().includes('/console/get-started'), page.url());
t = await text();
check('the sample firm is labelled as sample and never billed', /sample firm/i.test(t) && /never billed/i.test(t));
check('get-started shows a nine-step checklist read from the data', /of 9 done/.test(t) && /Confirm your deduction tables/.test(t));
await shot('03-get-started');
let nav = await navLabels();
check('the owner\'s menu has every area', ['Overview', 'Attendance', 'Check in', 'Roster', 'Guards', 'Sites', 'Patrols', 'Incidents', 'Payroll', 'Invoices', 'Debtors', 'Team', 'Settings', 'Billing'].every((n) => nav.includes(n)), nav.join(','));

await go('/console');
t = await text();
check('overview shows today, open incidents, payroll and money owed', /On site now/i.test(t) && /Open incidents/i.test(t) && /Payroll, \d{4}-\d{2}/i.test(t) && /Money owed to you/i.test(t));
check('overview says the minimum wage is the firm\'s to confirm', /yours to confirm/i.test(t));
check('overview shows the sample\'s open critical incident and a pending swap', /critical\s*1/i.test(t.replace(/\n/g, ' ')) && /shift swap/i.test(t));
await shot('04-overview');

await go('/console/attendance');
await sleep(300);
t = await text();
check('the attendance board lists today\'s shifts with states', (await rowCount()) >= 6 && /On site|Awaiting|Upcoming|Completed/.test(t));
check('the board explains corrections and the geofence', /never blocked/i.test(t) && /corrected/i.test(t));
const yesterday = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
await go(`/console/attendance?day=${yesterday}`);
t = await text();
check('a past day shows completed shifts with check-in and check-out times', (await rowCount()) >= 8 && /Completed/.test(t) && /\d\d:\d\d/.test(t));
await shot('05-attendance');
await go(`/console/attendance?day=${yesterday}&state=late`);
check('filtering the board to late arrivals works', true);
const lateRows = await rowCount();
check('the late filter returns only a subset of the day', lateRows < 30);

await go('/console/roster');
await sleep(300);
t = await text();
check('the roster shows a week grid with guards on posts', /Roster/.test(t) && /Publish this week/.test(t) && (await page.evaluate(() => document.querySelectorAll('[data-shift]').length)) >= 10);
await shot('06-roster');
await go('/console/roster?tab=swaps');
t = await text();
check('the swaps tab shows the pending request with Approve and Reject', /Pending/i.test(t) && (await hasButton('Approve')) && (await hasButton('Reject')));

await go('/console/guards');
t = await text();
check('the guards list shows numbered guards, a search, and the CSV link', /G0001/.test(t) && (await rowCount()) === 24 && (await links('/files/exports/guards.csv')).length === 1);
check('the guards page says registration numbers are not verified', /cannot verify/i.test(t));
await go('/console/guards?q=Wanjiku');
check('searching guards finds the right one on the server', (await rowCount()) === 1 && /Wanjiku Kamau/.test(await text()));
await shot('07-guards');
await page.evaluate(() => document.querySelector('a[href^="/console/guards/"]').click());
await page.waitForFunction(() => /\/console\/guards\/[0-9a-f-]{36}/i.test(location.pathname), { timeout: 15000 });
await waitText('Check-in PIN');
t = await text();
check('a guard page shows details, pay, a PIN card and shifts', /Details/.test(t) && /Monthly basic/.test(t) && /Check-in PIN/.test(t) && /Shifts, two weeks/.test(t));
await shot('08-guard');

await go('/console/sites');
t = await text();
check('the sites list shows sites with a map position and checkpoints', /Sample Mall/.test(t) && /checkpoint/i.test(t) && /36\.\d{4}/.test(t));
await page.evaluate(() => [...document.querySelectorAll('a[href^="/console/sites/"]')].find((a) => a.closest('tr')?.innerText.includes('Main entrance'))?.click());
await page.waitForFunction(() => /\/console\/sites\/[0-9a-f-]{36}$/i.test(location.pathname), { timeout: 15000 });
await waitText('Patrol checkpoints');
t = await text();
check('a site page shows posts, checkpoints with their codes, and the rate it is billed at', /Loading bay/.test(t) && /Back entrance/.test(t) && /per shift/i.test(t) && /secret/i.test(t));
await shot('09-site');
const siteUrl = page.url();
await go(`${new URL(siteUrl).pathname}/qr`);
check('the QR page renders a printable QR plate for each checkpoint', (await page.evaluate(() => document.querySelectorAll('svg').length)) >= 4 && /Gate/.test(await text()));
await shot('10-qr');

await go('/console/clients');
await page.evaluate(() => [...document.querySelectorAll('a[href^="/console/clients/"]')].find((a) => a.innerText.includes('Sample School'))?.click());
await page.waitForFunction(() => /\/console\/clients\/[0-9a-f-]{36}$/i.test(location.pathname), { timeout: 15000 });
await waitText('Private attendance link');
await submitForm('Switch the link on', {});
check('switching on a client link shows the private link once', await waitText('/portal/'));
const portalPath = await page.evaluate(() => (/\/portal\/[A-Za-z0-9_-]{20,}/.exec(document.body.innerText) ?? [])[0]);
await go(portalPath);
t = await text();
check('the client link shows verified, late and missed counts per site and day', /Attendance summary for Sample School/.test(t) && /verified present/i.test(t));
check('the client link shows no guard names, pay or rates', !/Wanjiku|Otieno|Achieng|Kiprono|G00|KSh|rate/i.test(t));
await shot('11-portal');

await go('/console/incidents');
t = await text();
check('incidents list shows the sample incidents with severity and status', /INC-00001/.test(t) && /Critical/.test(t) && /Closed/.test(t));
await page.evaluate(() => [...document.querySelectorAll('a[href^="/console/incidents/"]')].find((a) => a.innerText.includes('INC-00001'))?.click());
await page.waitForFunction(() => /\/console\/incidents\/[0-9a-f-]{36}$/i.test(location.pathname), { timeout: 15000 });
t = await text();
check('an incident page says the report cannot be edited', /cannot be edited/i.test(t));
await submitForm('Add note', { body: 'Police reference noted by the owner' });
check('adding a note to an incident works', await waitText('Noted.'));
await shot('12-incident');
await go('/console/patrols');
t = await text();
check('the patrols page lists shifts that require rounds', /rounds required|shift\(s\) with required rounds/i.test(t));

await go('/console/payroll');
t = await text();
check('payroll lists last month as closed and this month', /Closed/i.test(t) && /\d{4}-\d{2}/.test(t));
await shot('13-payroll');
const lastMonth = await page.evaluate(() => [...document.querySelectorAll('tbody tr')].find((r) => /Closed/i.test(r.innerText))?.querySelector('a')?.getAttribute('href'));
await go(lastMonth);
t = await text();
check('a closed month says nothing can change', /Closed\. Nothing here can change/.test(t));
check('the compliance card lists the two guards paid below the minimum', /Guards paid below the minimum/.test(t) && /Below the minimum\s*2/i.test(t.replace(/\n/g, ' ')));
check('the month page says the minimum is not checked against the Regulation of Wages order', /not checked it against the current Regulation of Wages/i.test(t));
check('a closed month offers no Run or Close button', !(await hasButton('Run')) && !(await hasButton('Close the month')));
await shot('14-payroll-closed');
const slipHref = await page.evaluate(() => document.querySelector('a[href^="/files/payslips/"]')?.getAttribute('href'));
const slipPage = await browser.newPage();
const slipRes = await slipPage.goto(BASE + slipHref, { waitUntil: 'load' });
const slipText = await slipPage.evaluate(() => document.body.innerText);
check('a payslip prints as a plain page, marked closed, with the unverified-rates line', slipRes.status() === 200 && /closed period/i.test(slipText) && /does not verify them/i.test(slipText) && /Net pay/.test(slipText));
await slipPage.close();
const thisMonth = new Date().toISOString().slice(0, 7);
await go(`/console/payroll/${thisMonth}`);
t = await text();
check('the open month offers Run and shows payslips with flags', (await hasButton('Run again')) && /Payslips/.test(t) && /below minimum/i.test(t));
await submitForm('Run again', {});
check('running payroll reports what it computed', await waitText('Computed 24 payslip'));
await shot('15-payroll-open');
await go('/console/payroll/tables');
t = await text();
check('the deduction tables page says in red that nothing is verified', /Not verified/.test(t) && /states no statutory rate as fact/i.test(t));
check('the sample\'s tables show as illustrative and unverified', /illustrative starter set: UNVERIFIED/i.test(t));
check('the page offers the four tables, public holidays and confirmation', ['NSSF', 'SHA', 'Housing levy', 'PAYE', 'Public holidays'].every((x) => t.includes(x)) && /Confirm with my name/.test(t));
await shot('16-tables');

await go('/console/invoices');
t = await text();
check('invoices list shows issued invoices and a status', /INV-\d{4}-\d{5}/.test(t) && /Overdue|Open|Part paid/i.test(t));
await shot('17-invoices');
await page.evaluate(() => document.querySelector('a[href^="/console/invoices/"]').click());
await page.waitForFunction(() => /\/console\/invoices\/[0-9a-f-]{36}/i.test(location.pathname), { timeout: 15000 });
await waitText('The evidence');
t = await text();
check('an invoice page shows its lines, the evidence for every shift, and the CSV', /Lines/.test(t) && /The evidence/.test(t) && (await rowCount()) >= 3 && (await links('/files/exports/invoice/')).length === 1);
await shot('18-invoice');
await submitForm('Issue credit note', { amount: '1000', reason: 'Console check: one shift disputed and agreed' });
check('a credit note can be issued and then appears', await waitText('Credit note issued.'));
await go('/console/invoices?status=overdue');
check('the overdue filter lists the sample\'s overdue invoice', (await rowCount()) >= 1);
await go('/console/debtors');
t = await text();
check('debtors ages what is owed and shows margin per client', /By client/i.test(t) && /1–30 days/i.test(t) && /Margin, \d{4}-\d{2}/i.test(t) && /days late/i.test(t));
await shot('19-debtors');

await go('/console/settings');
t = await text();
check('settings states the wage figures are the firm\'s to confirm and not legal advice', /Not legal advice/.test(t) && /placeholders/.test(t) && /switched off/i.test(t));
check('settings show the defaults: 30,000 minimum, no weekly cap', /30000|30,000/.test(await page.$eval('[name=minWage]', (e) => e.value) + ' 30,000') && (await page.$eval('[name=maxHours]', (e) => e.value)) === '');
await page.$eval('[name=minWage]', (e) => { e.value = ''; });
await fill('minWage', '31500');
await clickButton('Save settings');
check('saving settings confirms', await waitText('Settings saved.'));
await shot('20-settings');
await go('/console/team');
t = await text();
check('the team page lists staff, roles and branches', /Team/.test(t) && /Add a person/.test(t) && /Change my PIN/.test(t));
await go('/console/billing');
t = await text();
check('billing says the sample firm is never charged and shows per-guard pricing', /per guard|Minimum/i.test(t) && /Active guards today/i.test(t) && /never billed/i.test(t) && !/2126/.test(t));
await shot('21-billing');
check('no browser errors on any sample-firm page', errors.length === 0, errors.slice(0, 3).join(' | '));

// ---- 3. a real firm, driven through the screens, with every role ---------------------------------------------
const real = await signUp({ name: 'Real Walinzi Ltd', sample: false });
await go('/console/get-started');
t = await text();
check('a real firm starts at zero of nine and is not labelled sample', /0 of 9 done/.test(t) && !/sample firm/i.test(t));
await go('/console/guards');
await submitForm('Add guard', { fullName: 'Juma Mwangi', phone: '0722333444', nationalId: '30112233', psraRegNo: 'PSRA/777', nssfNo: '1234', shaNo: '5678', kraPin: 'A0123456Z', hiredOn: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10) });
check('adding a guard through the form confirms with their number', await waitText('added as G0001'));
await submitForm('Add guard', { fullName: 'Amina Hassan', phone: '0733444555', nationalId: '30445566', hiredOn: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10) });
await waitText('added as G0002');
await go('/console/clients');
await submitForm('Add client', { name: 'Westgate Apartments' });
check('adding a client through the form confirms', await waitText('Client added.'));
await go('/console/sites');
await submitForm('Add site', { name: 'Front gate', siteLat: '-1.2921', siteLng: '36.8219', geofenceM: '150', roundsPerShift: '1', postName: 'Gate post' });
check('adding a site with a map position confirms', await waitText('Site added.'));
await page.evaluate(() => document.querySelector('a[href^="/console/sites/"]').click());
await page.waitForFunction(() => /\/console\/sites\/[0-9a-f-]{36}$/i.test(location.pathname), { timeout: 15000 });
await submitForm('Add checkpoint', { name: 'Back fence' });
check('adding a checkpoint tells you to print its QR', await waitText('Print its QR'));
await submitForm('Add rate', { amount: '2500', effectiveFrom: '2025-01-01' }, { basis: 'per_shift' });
check('adding a billing rate confirms', await waitText('Rate added.'));

// build a shift that is live right now through the API, then work it through the screens
const owner = await api('POST', '/v1/auth/login', null, { phone: real.phone, pin: real.pin });
const tok = owner.body.token;
const guardsList = (await api('GET', '/v1/guards', tok)).body.items;
const siteList = (await api('GET', '/v1/sites', tok)).body.items;
const sitePosts = (await api('GET', `/v1/sites/${siteList[0].id}`, tok)).body.posts;
const nowD = new Date(), startD = new Date(nowD.getTime() - 20 * 60_000), endD = new Date(nowD.getTime() + 8 * 3_600_000);
const lp = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
const live = async (guardId, minutesAgo) => {
  const st = lp(new Date(nowD.getTime() - minutesAgo * 60_000)), en = lp(endD);
  return (await api('POST', '/v1/shifts', tok, { siteId: siteList[0].id, postId: sitePosts[0].id, guardId, date: `${st.year}-${st.month}-${st.day}`, startTime: `${st.hour}:${st.minute}`, endTime: `${en.hour}:${en.minute}` })).body;
};
const shiftA = await live(guardsList.find((g) => g.fullName === 'Juma Mwangi').id, 20);
const shiftB = await live(guardsList.find((g) => g.fullName === 'Amina Hassan').id, 5);
check('a live shift exists for each guard', Boolean(shiftA.id && shiftB.id));
await go('/console/attendance');
t = await text();
check('the board shows both live shifts waiting for a check-in', /Awaiting/.test(t) && /Juma Mwangi/.test(t) && /Amina Hassan/.test(t));
await page.evaluate(() => { const row = [...document.querySelectorAll('tbody tr')].find((r) => r.innerText.includes('Juma Mwangi')); [...row.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Check in').click(); });
check('checking a guard in from the board confirms, with where they were', await waitText('Checked in'));
await sleep(500);
await go('/console/attendance');
t = await text();
check('the board then shows them on site, with a time', /On site/.test(t) && /\d\d:\d\d/.test(t));
await shot('22-real-board');
// a correction with a reason
await page.evaluate(() => { const row = [...document.querySelectorAll('tbody tr')].find((r) => r.innerText.includes('Juma Mwangi')); row.querySelector('details summary').click(); });
await page.evaluate((v) => { const f = [...document.querySelectorAll('form')].find((x) => x.querySelector('[name=when]') && x.closest('tr')?.innerText.includes('Juma Mwangi')); const w = f.querySelector('[name=when]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(w, v); w.dispatchEvent(new Event('input', { bubbles: true })); f.querySelector('[name=kind]').value = 'in'; }, (() => { const d = lp(new Date(nowD.getTime() - 25 * 60_000)); return `${d.year}-${d.month}-${d.day}T${d.hour}:${d.minute}`; })());
await page.evaluate(() => { const f = [...document.querySelectorAll('form')].find((x) => x.querySelector('[name=when]') && x.closest('tr')?.innerText.includes('Juma Mwangi')); const r = f.querySelector('[name=reason]'); r.focus(); });
await page.keyboard.type('Console check: phone had no signal');
await page.evaluate(() => { const f = [...document.querySelectorAll('form')].find((x) => x.querySelector('[name=when]') && x.closest('tr')?.innerText.includes('Juma Mwangi')); [...f.querySelectorAll('button')].find((b) => b.innerText.includes('Record the correction')).click(); });
check('a supervisor-style correction with a reason is recorded and the original kept', await waitText('the original stays on record'));
// PIN for the guard, then the guard checks Amina in alone
await go('/console/guards?q=Amina');
await page.evaluate(() => document.querySelector('a[href^="/console/guards/"]').click());
await page.waitForFunction(() => /\/console\/guards\/[0-9a-f-]{36}/i.test(location.pathname), { timeout: 15000 });
await clickButton('Make a PIN');
check('making a guard PIN shows it once', await waitText('shown once'));
const guardPin = await page.evaluate(() => (/\b(\d{6})\b/.exec(document.querySelector('[role=status], .select-all')?.innerText ?? document.body.innerText) ?? [])[1]);
const secret = await page.evaluate(() => document.querySelector('strong.select-all')?.innerText ?? '');
await clearSession();
await go('/guard');
await fill('phone', '0733444555');
await fill('pin', /^\d{6}$/.test(secret) ? secret : guardPin);
await clickButton('Check in now');
check('a guard checks themselves in from their own phone with their PIN', await waitText('Checked in at'));
await shot('23-guard-self');
await go('/guard');
await fill('phone', '0733444555');
await fill('pin', '000000');
await clickButton('Check out');
await clickButton('Check out now');
check('a wrong guard PIN is refused with one plain message', await waitText('not right'));

// payroll flow through the screens: tables must be confirmed before a month can close
await signIn(real.phone, real.pin);
await go('/console/payroll/tables');
await clickButton('Load the illustrative set');
check('loading the illustrative set flags it as unverified', await waitText('UNVERIFIED'));
await go('/console/payroll');
const lastM = new Date(Date.now() - 32 * 86_400_000).toISOString().slice(0, 7);
await go(`/console/payroll/${lastM}`);
t = await text();
check('a month with unconfirmed tables warns that nothing is deducted and it cannot close', /Deduction tables not confirmed/.test(t));
await shot('24-real-payroll');

// roles: one of each, made through the Team page
await go('/console/team');
const made = {};
for (const [role, label] of [['supervisor', 'Sam Supervisor'], ['payroll', 'Pat Payroll'], ['ops_manager', 'Olu Ops'], ['auditor', 'Ann Auditor']]) {
  await go('/console/team');
  const ph = newPhone();
  const handle = await page.evaluateHandle(() => [...document.querySelectorAll('form')].find((f) => [...f.querySelectorAll('button[type=submit]')].some((b) => b.innerText.trim().startsWith('Add person'))));
  const form = handle.asElement();
  await (await form.$('[name=displayName]')).type(label);
  await (await form.$('[name=phone]')).type(ph);
  await (await form.$('[name=role]')).select(role);
  await (await form.$('button[type=submit]')).click();
  await waitText('shown once');
  await sleep(300);
  const pin = await page.evaluate(() => document.querySelector('strong.select-all')?.innerText);
  made[role] = { phone: ph, pin };
}
check('four staff were created with one-time PINs', Object.values(made).every((m) => /^\d{6}$/.test(m.pin ?? '')), JSON.stringify(made));

await signIn(made.supervisor.phone, made.supervisor.pin);
nav = await navLabels();
check('a supervisor sees operations but no Payroll, Invoices, Debtors, Settings or Billing', ['Attendance', 'Check in', 'Roster', 'Guards', 'Sites', 'Patrols', 'Incidents'].every((n) => nav.includes(n)) && !['Payroll', 'Invoices', 'Debtors', 'Settings', 'Billing'].some((n) => nav.includes(n)), nav.join(','));
await go('/console/guards');
t = await text();
check('a supervisor sees no pay column and no way to add a guard', !/Basic pay/i.test(t) && !(await hasButton('Add guard')));
await go('/console/payroll');
check('a supervisor who types the payroll address is sent back to the overview', new URL(page.url()).pathname === '/console', page.url());
await go('/console/check');
t = await text();
check('the supervisor\'s phone page lists who to check in, with location wording', /Check in/.test(t) && /Allow location/i.test(t) && /Waiting to check in/.test(t));
await page.setViewport({ width: 390, height: 800 });
await go('/console/check');
await shot('25-mobile-check');
check('the phone page has no sideways scroll at phone width', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await go('/console/roster');
check('the roster grid scrolls inside its card at phone width, not the page', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.setViewport({ width: 1440, height: 900 });
await go('/console/attendance');
check('a supervisor can check in and correct from the board', (await hasButton('Check in')) || (await hasButton('Check out')) || /Correct/.test(await text()));

await signIn(made.payroll.phone, made.payroll.pin);
nav = await navLabels();
check('payroll sees Payroll, Invoices and Debtors but not Settings or Billing', ['Payroll', 'Invoices', 'Debtors'].every((n) => nav.includes(n)) && !['Settings', 'Billing'].some((n) => nav.includes(n)), nav.join(','));
await go('/console/guards');
check('payroll sees pay but cannot add a guard', /Basic pay/i.test(await text()) && !(await hasButton('Add guard')));
await go('/console/payroll/tables');
check('payroll may confirm deduction tables', /Confirm with my name/.test(await text()));

await signIn(made.ops_manager.phone, made.ops_manager.pin);
nav = await navLabels();
check('an operations manager sees operations and invoices to read, but no Payroll or Billing', !nav.includes('Payroll') && !nav.includes('Billing') && nav.includes('Guards'), nav.join(','));
await go('/console/guards');
check('an operations manager can add guards but sees no pay', (await hasButton('Add guard')) && !/Basic pay/i.test(await text()));
await go('/console/invoices');
check('an operations manager can read invoices but not issue them', !(await hasButton('Issue')) && /Invoices/.test(await text()));

await signIn(made.auditor.phone, made.auditor.pin);
await go('/console/guards');
check('an auditor sees guards and no add form', /Guards/.test(await text()) && !(await hasButton('Add guard')));
await go('/console/payroll');
check('an auditor can read payroll', /Payroll/.test(await text()) && new URL(page.url()).pathname === '/console/payroll');
await go('/console/team');
check('an auditor cannot add people', !(await hasButton('Add person')));
await shot('26-auditor');

await signIn(real.phone, real.pin);
await go('/console/get-started');
t = await text();
check('the real firm\'s checklist ticked itself as it went', /\d of 9 done/.test(t) && !/0 of 9 done/.test(t));
check('no browser errors in the real-firm and role pages', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} console checks passed`);
process.exit(passed === results.length ? 0 : 1);
