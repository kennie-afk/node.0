/** CSV exports (and printable payslips). Every export is an authenticated read, bounded, and never includes wages for a role that may not see them. */
import { Router } from 'express';
import { authenticate, requirePermission } from './middleware';
import { wrap } from '../common/context';
import { inOrg, queryString } from './helpers';
import { toCsv } from '../common/csv';
import { can } from '../domain/roles';
import { BadRequestError, NotFoundError } from '../domain/errors';
import { formatKsh, Cents } from '../domain/money';
import { isDay, localDayOf, monthBounds, TZ } from '../common/time';
import { listGuards } from '../ops/guards';
import { ATTENDANCE_SQL } from '../ops/attendance-service';
import { complianceReport, getPayslip } from '../payroll/service';
import { debtors, getInvoice, invoiceEvidence } from '../invoicing/service';
import { orgInfo } from '../common/context';

const router = Router();
const csv = (res: import('express').Response, name: string, body: string) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(body);
};
const kes = (c: number | null | undefined) => (c === null || c === undefined ? '' : (c / 100).toFixed(2));
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const stamp = () => localDayOf(new Date());

router.get('/exports/guards.csv', authenticate, requirePermission('read'), wrap(async (req, res) => {
  const rows = await inOrg(req, async (c, ctx) => {
    const all = [];
    for (let page = 1; page <= 200; page += 1) {
      const p = await listGuards(c, ctx, { page, pageSize: 100, status: queryString(req.query.status) });
      all.push(...p.items);
      if (p.items.length < 100) break;
    }
    return { all, pay: can(ctx.role, 'salary_view') };
  });
  const header = ['guard_no', 'name', 'branch', 'status', 'phone', 'national_id', 'psra_reg_no (as typed by the firm)', 'psra_expiry', 'nssf_no', 'sha_no', 'kra_pin', 'hired_on', 'exited_on', ...(rows.pay ? ['monthly_basic_kes', 'allowance_kes'] : [])];
  csv(res, `guards-${stamp()}.csv`, toCsv(header, rows.all.map((g) => [g.guardNo, g.fullName, g.branch, g.status, g.phone, g.nationalId, g.psraRegNo, g.psraExpiry, g.nssfNo, g.shaNo, g.kraPin, g.hiredOn, g.exitedOn, ...(rows.pay ? [kes(g.monthlyBasicCents), kes(g.allowanceCents)] : [])])));
}));

router.get('/exports/attendance.csv', authenticate, requirePermission('read'), wrap(async (req, res) => {
  const from = String(req.query.from ?? '');
  const to = String(req.query.to ?? from);
  if (!isDay(from) || !isDay(to) || to < from) throw new BadRequestError('Give from and to dates, like 2026-10-01.');
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 62) throw new BadRequestError('Export at most 63 days at a time.');
  const rows = await inOrg(req, async (c, ctx) => {
    const params: unknown[] = [from, to];
    let branch = '';
    if (ctx.branchId) { params.push(ctx.branchId); branch = ' AND s.branch_id = $3'; }
    return (await c.query(
      `SELECT s.id, to_char(s.start_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day, si.name AS site, cl.name AS client, p.name AS post, g.guard_no, g.full_name AS guard, s.start_at, s.end_at, s.status, s.overtime_approved_minutes, ${ATTENDANCE_SQL}
         FROM shifts s JOIN sites si ON si.id = s.site_id JOIN clients cl ON cl.id = si.client_id JOIN posts p ON p.id = s.post_id LEFT JOIN guards g ON g.id = s.guard_id
        WHERE s.start_at >= ($1::date::timestamp AT TIME ZONE '${TZ}') AND s.start_at < (($2::date + 1)::timestamp AT TIME ZONE '${TZ}')${branch} ORDER BY s.start_at, si.name LIMIT 50000`, params)).rows;
  });
  csv(res, `attendance-${from}-${to}.csv`, toCsv(['date', 'client', 'site', 'post', 'guard_no', 'guard', 'scheduled_start', 'scheduled_end', 'status', 'check_in', 'check_out', 'in_overridden', 'out_overridden', 'in_geofence', 'in_method', 'overtime_approved_min'],
    rows.map((r) => [r.day, r.client, r.site, r.post, r.guard_no, r.guard, r.start_at, r.end_at, r.status, r.in_at, r.out_at, r.in_overridden ? 'yes' : '', r.out_overridden ? 'yes' : '', r.in_geofence, r.in_method, r.overtime_approved_minutes])));
}));

router.get('/exports/payroll/:month.csv', authenticate, requirePermission('salary_view'), wrap(async (req, res) => {
  const month = String(req.params.month);
  const rows = await inOrg(req, async (c) => {
    const p = (await c.query('SELECT id FROM pay_periods WHERE month = $1', [month])).rows[0];
    if (!p) throw new NotFoundError('Run payroll for that month first.');
    return (await c.query('SELECT * FROM payslips WHERE period_id = $1 ORDER BY guard_no', [p.id])).rows;
  });
  const header = ['guard_no', 'name', 'national_id', 'days_employed', 'basic_kes', 'allowance_kes', 'holiday_rest_premium_kes', 'overtime_kes', 'adjustments_kes', 'gross_kes', 'nssf_employee_kes', 'sha_employee_kes', 'housing_employee_kes', 'paye_kes', 'net_kes', 'employer_cost_kes', 'minimum_required_kes', 'below_minimum', 'flags'];
  const ded = (r: Record<string, any>, k: string) => kes((r.deductions as Array<{ kind: string; employeeCents: number }>).find((d) => d.kind === k)?.employeeCents ?? 0);
  csv(res, `payroll-register-${month}.csv`, toCsv(header, rows.map((r) => [r.guard_no, r.guard_name, r.national_id, r.days_employed, kes(Number(r.basic_cents)), kes(Number(r.allowance_cents)), kes(Number(r.premium_cents)), kes(Number(r.overtime_cents)), kes(Number(r.adjustments_cents)), kes(Number(r.gross_cents)), ded(r, 'nssf'), ded(r, 'sha'), ded(r, 'housing'), ded(r, 'paye'), kes(Number(r.net_cents)), kes(Number(r.employer_cost_cents)), kes(Number(r.min_required_cents)), r.below_minimum ? 'YES' : '', (r.flags as Array<{ code: string }>).map((f) => f.code).join(';')])));
}));

router.get('/exports/compliance/:month.csv', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  const r = await inOrg(req, (c, ctx) => complianceReport(c, ctx, String(req.params.month)));
  csv(res, `compliance-${r.month}.csv`, toCsv(['guard_no', 'guard', 'days_employed', 'basic_kes', 'required_minimum_kes', 'shortfall_kes'], r.belowMinimum.map((b) => [b.guardNo, b.guardName, b.daysEmployed, kes(b.basicCents), kes(b.requiredCents), kes(b.shortfallCents)])));
}));

/** A payslip as a plain printable page (browser print to PDF). Every figure is the stored one; unconfirmed deduction tables are stated on the page. */
router.get('/payslips/:id/print', authenticate, requirePermission('salary_view'), wrap(async (req, res) => {
  const { p, org } = await inOrg(req, async (c, ctx) => ({ p: await getPayslip(c, ctx, String(req.params.id)), org: await orgInfo(c) }));
  const k = (n: number) => esc(formatKsh(n as Cents));
  const lines = [['Basic pay', p.basicCents], ['Allowances', p.allowanceCents], ['Holiday / rest-day premium', p.premiumCents], ['Overtime', p.overtimeCents], ['Adjustments', p.adjustmentsCents]]
    .filter(([, v]) => (v as number) !== 0 || true).map(([l, v]) => `<tr><td>${esc(l)}</td><td class="n">${k(v as number)}</td></tr>`).join('');
  const ded = (p.deductions as Array<{ label: string; employeeCents: number; applied: boolean }>).map((d) => `<tr><td>${esc(d.label)}${d.applied ? '' : ' <em>(not deducted: table not confirmed or not applicable)</em>'}</td><td class="n">${k(d.employeeCents)}</td></tr>`).join('');
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${esc(p.guardNo)} ${esc(p.month)}</title>
<style>body{font:13px/1.5 system-ui,sans-serif;max-width:640px;margin:24px auto;color:#111}h1{font-size:18px;margin:0}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:4px 0;border-bottom:1px solid #ddd}.n{text-align:right;font-variant-numeric:tabular-nums}.t td{font-weight:600;border-top:2px solid #111}.m{color:#555;font-size:12px}</style></head><body>
<h1>${esc(org.name)}${org.isDemo ? ' (SAMPLE)' : ''}</h1><p class="m">Payslip for ${esc(p.month)} ${p.periodStatus === 'closed' ? '(closed period)' : '(DRAFT: period still open)'}</p>
<p><strong>${esc(p.guardName)}</strong> &middot; ${esc(p.guardNo)}${p.nationalId ? ` &middot; ID ${esc(p.nationalId)}` : ''}<br><span class="m">${p.daysEmployed} of ${p.daysInMonth} days employed</span></p>
<table>${lines}<tr class="t"><td>Gross pay</td><td class="n">${k(p.grossCents)}</td></tr></table>
<table>${ded}<tr class="t"><td>Total deductions</td><td class="n">${k(p.employeeDeductionsCents)}</td></tr></table>
<table><tr class="t"><td>Net pay</td><td class="n">${k(p.netCents)}</td></tr></table>
<p class="m">Deduction rates are those the employer entered and confirmed in Sojaa. Sojaa does not verify them against any official schedule.</p></body></html>`);
}));

router.get('/exports/debtors.csv', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  const d = await inOrg(req, (c) => debtors(c));
  csv(res, `debtors-${d.asOf}.csv`, toCsv(['client', 'not_due_kes', '1-30_kes', '31-60_kes', '61-90_kes', '90+_kes', 'total_kes', 'open_invoices', 'oldest_days_overdue'], d.items.map((i) => [i.client, ...d.buckets.map((b) => kes(i.buckets[b])), kes(i.totalCents), i.invoices, i.oldestDaysOverdue])));
}));

router.get('/exports/invoice/:id.csv', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  const { inv, evidence } = await inOrg(req, async (c, ctx) => ({ inv: await getInvoice(c, ctx, String(req.params.id)), evidence: await invoiceEvidence(c, String(req.params.id)) }));
  csv(res, `${inv.number}-evidence.csv`, toCsv(['invoice', 'site', 'post', 'guard_no', 'guard', 'scheduled_start', 'scheduled_end', 'check_in', 'check_out', 'overridden', 'geofence', 'verified_minutes', 'billed_kes'],
    evidence.map((e) => [inv.number, e.site, e.post, e.guardNo, e.guard, e.startAt, e.endAt, e.inAt, e.outAt, e.inOverridden || e.outOverridden ? 'yes' : '', e.geofence, e.verifiedMinutes, kes(e.billedCents)])));
}));

router.get('/invoices/:id/evidence', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c) => invoiceEvidence(c, String(req.params.id))));
}));

router.get('/exports/incidents.csv', authenticate, requirePermission('read'), wrap(async (req, res) => {
  const rows = await inOrg(req, async (c, ctx) => {
    const params: unknown[] = [];
    let branch = '';
    if (ctx.branchId) { params.push(ctx.branchId); branch = 'WHERE i.branch_id = $1'; }
    return (await c.query(`SELECT i.incident_no, i.occurred_at, si.name AS site, i.severity, i.category, g.full_name AS guard, i.narrative FROM incidents i JOIN sites si ON si.id = i.site_id LEFT JOIN guards g ON g.id = i.guard_id ${branch} ORDER BY i.occurred_at DESC LIMIT 20000`, params)).rows;
  });
  csv(res, `incidents-${stamp()}.csv`, toCsv(['incident_no', 'occurred_at', 'site', 'severity', 'category', 'guard', 'narrative'], rows.map((r) => [r.incident_no, r.occurred_at, r.site, r.severity, r.category, r.guard, r.narrative])));
}));

void monthBounds;
export default router;
