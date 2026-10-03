/** The "get started" checklist: what a new firm has done and what to do next, read from the data itself. */
import { PoolClient } from 'pg';
import { orgInfo } from '../common/context';

export async function checklist(client: PoolClient) {
  const org = await orgInfo(client);
  const one = async (sql: string) => Number((await client.query(sql)).rows[0].n);
  const sites = await one(`SELECT count(*) AS n FROM sites WHERE active`);
  const guards = await one(`SELECT count(*) AS n FROM guards WHERE status = 'active'`);
  const paid = await one(`SELECT count(*) AS n FROM guards WHERE status = 'active' AND monthly_basic_cents > 0`);
  const shifts = await one(`SELECT count(*) AS n FROM shifts WHERE status = 'scheduled'`);
  const checkins = await one(`SELECT count(*) AS n FROM attendance_events WHERE kind = 'in'`);
  const tables = await one(`SELECT count(*) AS n FROM rate_tables WHERE status IN ('confirmed', 'not_applicable')`);
  const rates = await one(`SELECT count(*) AS n FROM site_rates`);
  const invoices = await one(`SELECT count(*) AS n FROM client_invoices`);
  const periods = await one(`SELECT count(*) AS n FROM pay_periods`);
  const items = [
    { key: 'site', title: 'Add a client and a site', done: sites > 0, hint: 'A site is where guards stand. Give it a map position so a check-in far away is flagged.' },
    { key: 'guards', title: 'Add your guards', done: guards > 0, hint: 'Name, ID number, and the PSRA, NSSF, SHA and KRA numbers you hold. Sojaa stores what you type; it cannot verify any of them.' },
    { key: 'pay', title: 'Set what each guard is paid', done: guards > 0 && paid === guards, hint: 'Monthly basic pay. Payroll checks it against the minimum you configure, and flags anyone below.' },
    { key: 'roster', title: 'Build a roster', done: shifts > 0, hint: 'Make a day and a night shift, then create a run of them for a post and assign guards. A guard cannot be put on two overlapping shifts.' },
    { key: 'checkin', title: 'Record a first check-in', done: checkins > 0, hint: 'From the attendance board or the check-in page on a phone. The time is the server\'s, never the phone\'s.' },
    { key: 'rate', title: 'Set what a client pays', done: rates > 0, hint: 'A rate per shift or per hour for each site, so invoices can be built from verified shifts.' },
    { key: 'tables', title: 'Confirm your deduction tables', done: tables === 4, hint: 'NSSF, SHA, housing levy and PAYE. Sojaa states no rate as fact: enter yours (or load the illustrative set), check them against the official schedules, and confirm.' },
    { key: 'payroll', title: 'Run payroll for a month', done: periods > 0, hint: 'See each guard\'s pay and the compliance report. Close the month once the figures are right; a closed month never changes.' },
    { key: 'invoice', title: 'Invoice a client from verified shifts', done: invoices > 0, hint: 'Only shifts with a check-in and a check-out are billed, and each only once.' }
  ];
  return { isSample: org.isDemo, items, doneCount: items.filter((i) => i.done).length, total: items.length };
}
