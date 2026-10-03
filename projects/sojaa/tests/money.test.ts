import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { addStaff, boot, confirmAllTables, get, lastMonth, localInstant, localParts, makeGuard, makePlace, newTenant, nextId, on, pastShift, patch, post, put, setPay, shutdown, Tenant, del, Place } from './helpers';

vi.setConfig({ testTimeout: 180_000 });
afterAll(shutdown);

const LM = lastMonth();
const at = (i: number, hhmm = '06:00') => localInstant(LM.days[i]!, hhmm);

async function firm(name: string) {
  const t = await newTenant(name);
  const payroll = await addStaff(t, 'payroll');
  const place = await makePlace(t.owner.auth);
  return { t, payroll, place };
}

async function guardPaid(t: Tenant, kes: number, over: Record<string, unknown> = {}) {
  const g = await makeGuard(t.owner.auth, over);
  await setPay(t.owner.auth, g.id, kes);
  return g;
}

describe.runIf(on)('deduction tables', () => {
  it('start empty and unconfirmed; payroll still runs but deducts nothing and says so', async () => {
    const { t, payroll } = await firm('Tables Firm');
    const tables = await get(payroll.auth, '/v1/payroll/tables');
    expect(tables.body.map((x: { kind: string; status: string; source: string }) => [x.kind, x.status, x.source])).toEqual([['housing', 'unconfirmed', 'none'], ['nssf', 'unconfirmed', 'none'], ['paye', 'unconfirmed', 'none'], ['sha', 'unconfirmed', 'none']]);
    const g = await guardPaid(t, 30_000);
    await patch(t.owner.auth, `/v1/guards/${g.id}`, { hiredOn: LM.days[0] });
    const run = await post(payroll.auth, `/v1/payroll/periods/${LM.month}/run`);
    expect(run.status).toBe(200);
    expect(run.body.tables).toMatchObject({ ready: false });
    const slips = await get(payroll.auth, `/v1/payroll/periods/${LM.month}/payslips`);
    expect(slips.body.items[0]).toMatchObject({ grossCents: 3_000_000, netCents: 3_000_000, employeeDeductionsCents: 0 });
    expect(slips.body.items[0].deductions.every((d: { applied: boolean }) => !d.applied)).toBe(true);
  });

  it('loads an illustrative set as unverified and unconfirmed, and needs a named confirmation with a note', async () => {
    const { payroll } = await firm('Confirm Firm');
    const loaded = await post(payroll.auth, '/v1/payroll/tables/nssf/illustrative');
    expect(loaded.body).toMatchObject({ source: 'illustrative_unverified', status: 'unconfirmed' });
    expect((await post(payroll.auth, '/v1/payroll/tables/nssf/confirm', { note: 'ok' })).status).toBe(400);
    expect((await post(payroll.auth, '/v1/payroll/tables/sha/confirm', { note: 'Checked against the schedule' })).status).toBe(409); // nothing entered yet
    const ok = await post(payroll.auth, '/v1/payroll/tables/nssf/confirm', { note: 'Checked against the NSSF schedule dated 1 Jan' });
    expect(ok.body).toMatchObject({ status: 'confirmed', confirmedBy: expect.any(String) });
    // changing a confirmed table un-confirms it
    const changed = await put(payroll.auth, '/v1/payroll/tables/nssf', { config: { employeeRateBp: 500, employerRateBp: 500, upperLimitCents: null } });
    expect(changed.body).toMatchObject({ status: 'unconfirmed', source: 'firm_entered' });
    expect(changed.body.confirmedBy).toBeNull();
  });

  it('validates what the firm enters and who may enter it', async () => {
    const { t, payroll } = await firm('Validate Firm');
    const sup = await addStaff(t, 'supervisor');
    const ops = await addStaff(t, 'ops_manager');
    expect((await put(payroll.auth, '/v1/payroll/tables/nssf', { config: { employeeRateBp: 99_999, employerRateBp: 0, upperLimitCents: null } })).status).toBe(400);
    expect((await put(payroll.auth, '/v1/payroll/tables/paye', { config: { bands: [{ upToCents: 100, rateBp: 10 }], personalReliefCents: 0, taxableDeducts: [] } })).status).toBe(400);
    expect((await put(payroll.auth, '/v1/payroll/tables/bogus', { config: {} })).status).toBe(404);
    expect((await put(sup.auth, '/v1/payroll/tables/nssf', { config: { employeeRateBp: 1, employerRateBp: 1, upperLimitCents: null } })).status).toBe(403);
    expect((await post(ops.auth, '/v1/payroll/tables/nssf/illustrative')).status).toBe(403);
    expect((await get(sup.auth, '/v1/payroll/tables')).status).toBe(403);
    const na = await post(payroll.auth, '/v1/payroll/tables/housing/not-applicable', { note: 'Not applicable to us, per our accountant' });
    expect(na.body.status).toBe('not_applicable');
    expect((await post(payroll.auth, '/v1/payroll/tables/housing/not-applicable', { note: 'x' })).status).toBe(400);
  });
});

describe.runIf(on)('payroll arithmetic and the minimum-wage report', () => {
  it('pays a full-month guard exactly, prorates a part month, and flags the guard paid below the minimum', async () => {
    const { t, payroll, place } = await firm('Pay Firm');
    await confirmAllTables(t);
    const full = await guardPaid(t, 30_000);
    const low = await guardPaid(t, 20_000);
    const joinDay = LM.days[15]!;
    const joiner = await guardPaid(t, 30_000, { hiredOn: joinDay });
    expect((await patch(t.owner.auth, `/v1/guards/${full.id}`, { hiredOn: LM.days[0] })).status).toBe(200);
    expect((await patch(t.owner.auth, `/v1/guards/${low.id}`, { hiredOn: LM.days[0] })).status).toBe(200);
    expect(place.siteId).toBeTruthy();
    const run = await post(payroll.auth, `/v1/payroll/periods/${LM.month}/run`);
    expect(run.body.summary).toMatchObject({ guards: 3, belowMinimum: 1, blocking: 1 });
    const slips = (await get(payroll.auth, `/v1/payroll/periods/${LM.month}/payslips?pageSize=10`)).body.items as Array<Record<string, any>>;
    const by = (id: string) => slips.find((s) => s.guardId === id)!;
    expect(by(full.id)).toMatchObject({ basicCents: 3_000_000, belowMinimum: false, daysEmployed: LM.days.length });
    expect(by(low.id)).toMatchObject({ basicCents: 2_000_000, belowMinimum: true, minRequiredCents: 3_000_000 });
    const employed = LM.days.length - 15;
    expect(by(joiner.id)).toMatchObject({ daysEmployed: employed, basicCents: Math.round((3_000_000 * employed) / LM.days.length), belowMinimum: false });
    expect(by(full.id).deductions.every((d: { applied: boolean }) => d.applied)).toBe(true);
    expect(by(full.id).netCents).toBe(by(full.id).grossCents - by(full.id).employeeDeductionsCents);
    const report = await get(payroll.auth, `/v1/payroll/compliance/${LM.month}`);
    expect(report.body.belowMinimum).toHaveLength(1);
    expect(report.body.belowMinimum[0]).toMatchObject({ guardId: low.id, shortfallCents: 1_000_000 });
    expect(report.body.notice).toMatch(/not checked it against the current Regulation of Wages/);
  });

  it('turns the minimum and the allowance rule into the firm\'s own setting', async () => {
    const { t, payroll } = await firm('Min Setting Firm');
    const g = await guardPaid(t, 25_000);
    await patch(t.owner.auth, `/v1/guards/${g.id}`, { hiredOn: LM.days[0] });
    await put(payroll.auth, `/v1/guards/${g.id}/pay`, { monthlyBasicCents: 2_500_000, allowanceCents: 600_000 });
    expect((await get(payroll.auth, `/v1/payroll/compliance/${LM.month}`)).body.belowMinimum).toHaveLength(1);
    await patch(t.owner.auth, '/v1/settings', { allowancesCountTowardMin: true });
    expect((await get(payroll.auth, `/v1/payroll/compliance/${LM.month}`)).body.belowMinimum).toHaveLength(0);
    await patch(t.owner.auth, '/v1/settings', { minWageCents: 4_000_000 });
    expect((await get(payroll.auth, `/v1/payroll/compliance/${LM.month}`)).body.belowMinimum).toHaveLength(1);
  });

  it('pays approved overtime and a holiday premium from verified attendance, and nothing for unverified time', async () => {
    const { t, payroll, place } = await firm('Premium Firm');
    const g = await guardPaid(t, 30_000);
    await patch(t.owner.auth, `/v1/guards/${g.id}`, { hiredOn: LM.days[0] });
    await pastShift(t, place, g.id, at(2), { overtimeMin: 120 }); // checked out 2h late, 120 approved
    const g2 = await guardPaid(t, 30_000);
    await patch(t.owner.auth, `/v1/guards/${g2.id}`, { hiredOn: LM.days[0] });
    await pastShift(t, place, g2.id, at(3)); // 12h shift on the holiday below
    await pastShift(t, place, g2.id, at(5), { inAfterMin: null }); // never checked in: no pay effect
    expect((await post(t.owner.auth, '/v1/holidays', { day: LM.days[3], name: 'Test holiday' })).status).toBe(201);
    const run = await post(payroll.auth, `/v1/payroll/periods/${LM.month}/run`);
    expect(run.status).toBe(200);
    const slips = (await get(payroll.auth, `/v1/payroll/periods/${LM.month}/payslips`)).body.items as Array<Record<string, any>>;
    // hourly = 3,000,000 / 225; 2h overtime at 1.5 = 3 hourly units = 40,000; a 12h holiday shift at 2.0 = 24 units = 320,000
    expect(slips.find((s) => s.guardId === g.id)).toMatchObject({ overtimeCents: 40_000, premiumCents: 0, grossCents: 3_040_000 });
    expect(slips.find((s) => s.guardId === g2.id)).toMatchObject({ overtimeCents: 0, premiumCents: 320_000, grossCents: 3_320_000 });
  });

  it('does not pay overtime that was never approved', async () => {
    const { t, payroll, place } = await firm('No OT Firm');
    const g = await guardPaid(t, 30_000);
    await patch(t.owner.auth, `/v1/guards/${g.id}`, { hiredOn: LM.days[0] });
    const { pool } = await boot();
    const id = await pastShift(t, place, g.id, at(2));
    await pool.withOrg(t.orgId, (c) => c.query(`INSERT INTO attendance_events (org_id, shift_id, guard_id, kind, at, effective_at, method, reason) VALUES ($1, $2, $3, 'override_out', now(), $4, 'override', 'Stayed late without approval')`, [t.orgId, id, g.id, new Date(at(2).getTime() + 15 * 3_600_000)]));
    await post(payroll.auth, `/v1/payroll/periods/${LM.month}/run`);
    const slip = (await get(payroll.auth, `/v1/payroll/periods/${LM.month}/payslips`)).body.items[0];
    expect(slip.overtimeCents).toBe(0);
  });

  it('counts a shift with no check-out as unresolved and makes closing say so', async () => {
    const { t, payroll, place } = await firm('Unresolved Firm');
    await confirmAllTables(t);
    const g = await guardPaid(t, 30_000);
    await patch(t.owner.auth, `/v1/guards/${g.id}`, { hiredOn: LM.days[0] });
    await pastShift(t, place, g.id, at(4), { outAtEnd: false });
    const run = await post(payroll.auth, `/v1/payroll/periods/${LM.month}/run`);
    expect(run.body.unresolvedShifts).toBe(1);
    const close = await post(payroll.auth, `/v1/payroll/periods/${LM.month}/close`, {});
    expect(close.status).toBe(409);
    expect(close.body.message).toMatch(/1 shift\(s\) have no check-out/);
  });

  it('keeps wages from anyone who may not see them', async () => {
    const { t, payroll } = await firm('Wage Privacy');
    const sup = await addStaff(t, 'supervisor');
    const ops = await addStaff(t, 'ops_manager');
    await guardPaid(t, 30_000);
    await post(payroll.auth, `/v1/payroll/periods/${LM.month}/run`);
    for (const who of [sup, ops]) {
      expect((await get(who.auth, `/v1/payroll/periods/${LM.month}/payslips`)).status).toBe(403);
      expect((await get(who.auth, `/v1/exports/payroll/${LM.month}.csv`)).status).toBe(403);
    }
    expect((await get(sup.auth, `/v1/exports/guards.csv`)).text).not.toMatch(/monthly_basic/);
    expect((await get(payroll.auth, `/v1/exports/guards.csv`)).text).toMatch(/monthly_basic_kes/);
    expect((await post(sup.auth, `/v1/payroll/periods/${LM.month}/run`)).status).toBe(403);
  });
});

describe.runIf(on)('closing a pay period', () => {
  async function ready(name: string) {
    const f = await firm(name);
    await confirmAllTables(f.t);
    const g = await guardPaid(f.t, 30_000);
    await patch(f.t.owner.auth, `/v1/guards/${g.id}`, { hiredOn: LM.days[0] });
    return { ...f, g };
  }

  it('refuses to close until every deduction table is confirmed', async () => {
    const { t, payroll } = await firm('Gate Firm');
    await guardPaid(t, 30_000);
    const r = await post(payroll.auth, `/v1/payroll/periods/${LM.month}/close`, {});
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/Confirm these deduction tables.*nssf/);
  });

  it('refuses to close a month that has not started or is not over', async () => {
    const { payroll } = await ready('Early Close');
    const now = localParts(new Date()).date.slice(0, 7);
    const [y, m] = now.split('-').map(Number);
    const next = `${m === 12 ? y! + 1 : y}-${String(m === 12 ? 1 : m! + 1).padStart(2, '0')}`;
    expect((await post(payroll.auth, `/v1/payroll/periods/${next}/run`)).status).toBe(400);
    expect((await post(payroll.auth, `/v1/payroll/periods/${now}/close`, {})).status).toBe(409);
    expect((await post(payroll.auth, `/v1/payroll/periods/2026-13/run`)).status).toBe(400);
  });

  it('requires a written acknowledgement to close over a blocking flag, and records it', async () => {
    const f = await ready('Ack Firm');
    const low = await guardPaid(f.t, 20_000);
    await patch(f.t.owner.auth, `/v1/guards/${low.id}`, { hiredOn: LM.days[0] });
    const blocked = await post(f.payroll.auth, `/v1/payroll/periods/${LM.month}/close`, {});
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/1 guard\(s\) have a blocking flag/);
    expect((await post(f.payroll.auth, `/v1/payroll/periods/${LM.month}/close`, { acknowledge: 'short' })).status).toBe(400);
    const ok = await post(f.payroll.auth, `/v1/payroll/periods/${LM.month}/close`, { acknowledge: 'Owner knows about the underpaid guard; contract is being renegotiated.' });
    expect(ok.status).toBe(200);
    expect(ok.body.period.status).toBe('closed');
    const period = await get(f.payroll.auth, `/v1/payroll/periods/${LM.month}`);
    expect(period.body.snapshot.acknowledged).toMatch(/renegotiated/);
    expect(period.body.snapshot.tables).toHaveLength(4);
    expect(JSON.stringify((await get(f.t.owner.auth, '/v1/audit')).body)).toContain('payroll.close');
  });

  it('is permanent: no run, no edit, no delete, no new payslip, however it is attempted', async () => {
    const f = await ready('Permanent Firm');
    const close = await post(f.payroll.auth, `/v1/payroll/periods/${LM.month}/close`, {});
    expect(close.status).toBe(200);
    expect((await post(f.payroll.auth, `/v1/payroll/periods/${LM.month}/close`, {})).status).toBe(409);
    expect((await post(f.payroll.auth, `/v1/payroll/periods/${LM.month}/run`)).status).toBe(409);
    const { pool } = await boot();
    // straight to the database as the restricted role: the triggers refuse
    await expect(pool.withOrg(f.t.orgId, (c) => c.query(`UPDATE payslips SET net_cents = net_cents + 1`))).rejects.toThrow(/closed/);
    await expect(pool.withOrg(f.t.orgId, (c) => c.query(`DELETE FROM payslips`))).rejects.toThrow(/closed/);
    await expect(pool.withOrg(f.t.orgId, (c) => c.query(`UPDATE pay_periods SET status = 'open'`))).rejects.toThrow(/closed/);
    await expect(pool.withOrg(f.t.orgId, (c) => c.query(`DELETE FROM pay_periods`))).rejects.toThrow(/cannot be deleted|closed/);
    await expect(pool.withOrg(f.t.orgId, (c) => c.query(`INSERT INTO payslips (org_id, period_id, guard_id, guard_no, guard_name, days_in_month, days_employed, basic_cents, allowance_cents, gross_cents, net_cents, employer_cost_cents, min_required_cents)
        SELECT $1, p.id, g.id, 'X', 'Y', 30, 30, 1, 0, 1, 1, 1, 0 FROM pay_periods p, guards g LIMIT 1 ON CONFLICT DO NOTHING`, [f.t.orgId]))).rejects.toThrow(/closed/);
    // and even the table owner is bound by the trigger
    await expect(pool.withMigrator((c) => c.query(`UPDATE payslips SET net_cents = 1 WHERE period_id IN (SELECT id FROM pay_periods WHERE org_id = $1)`, [f.t.orgId]))).rejects.toThrow(/closed/);
  });

  it('corrects a closed month by an adjustment paid in an open month, never by reopening', async () => {
    const f = await ready('Adjust Firm');
    await post(f.payroll.auth, `/v1/payroll/periods/${LM.month}/close`, {});
    const now = localParts(new Date()).date.slice(0, 7);
    expect((await post(f.payroll.auth, '/v1/payroll/adjustments', { guardId: f.g.id, effectiveMonth: LM.month, amountCents: 5_000, kind: 'correction', reason: 'Into the closed month' })).status).toBe(409);
    expect((await post(f.payroll.auth, '/v1/payroll/adjustments', { guardId: f.g.id, effectiveMonth: now, amountCents: 0, kind: 'correction', reason: 'Zero is not an adjustment' })).status).toBe(400);
    expect((await post(f.payroll.auth, '/v1/payroll/adjustments', { guardId: f.g.id, effectiveMonth: now, amountCents: 5_000, kind: 'correction', reason: 'no' })).status).toBe(400);
    const a = await post(f.payroll.auth, '/v1/payroll/adjustments', { guardId: f.g.id, effectiveMonth: now, amountCents: 12_345, kind: 'arrears', reason: 'Underpaid by KES 123.45 last month', relatedMonth: LM.month });
    expect(a.status).toBe(201);
    await post(f.payroll.auth, '/v1/payroll/adjustments', { guardId: f.g.id, effectiveMonth: now, amountCents: -2_345, kind: 'deduction', reason: 'Uniform deposit recovered' });
    const list = await get(f.payroll.auth, `/v1/payroll/adjustments?month=${now}`);
    expect(list.body.total).toBe(2);
    expect(list.body.items.find((x: { amountCents: number }) => x.amountCents === 12_345).relatedMonth).toBe(LM.month);
    await post(f.payroll.auth, `/v1/payroll/periods/${now}/run`);
    const slip = (await get(f.payroll.auth, `/v1/payroll/periods/${now}/payslips`)).body.items.find((s: { guardId: string }) => s.guardId === f.g.id);
    expect(slip.adjustmentsCents).toBe(10_000);
    const { pool } = await boot();
    await expect(pool.withOrg(f.t.orgId, (c) => c.query(`UPDATE payroll_adjustments SET amount_cents = 1`))).rejects.toThrow(/permission denied/);
    await expect(pool.withOrg(f.t.orgId, (c) => c.query(`DELETE FROM payroll_adjustments`))).rejects.toThrow(/permission denied/);
  });

  it('stops overtime approval and holiday changes inside a closed month, and says attendance corrections need an adjustment', async () => {
    const f = await ready('Closed Edits Firm');
    const ops = await addStaff(f.t, 'ops_manager');
    const sid = await pastShift(f.t, f.place, f.g.id, at(6));
    await post(f.payroll.auth, `/v1/payroll/periods/${LM.month}/close`, {});
    expect((await put(ops.auth, `/v1/shifts/${sid}/overtime`, { minutes: 30 })).status).toBe(409);
    expect((await post(f.payroll.auth, '/v1/holidays', { day: LM.days[6], name: 'Late holiday' })).status).toBe(409);
    const ov = await post(ops.auth, `/v1/shifts/${sid}/override`, { kind: 'out', effectiveAt: new Date(at(6).getTime() + 13 * 3_600_000).toISOString(), reason: 'Stayed past the end' });
    expect(ov.status).toBe(201);
    expect(ov.body.periodClosed).toBe(true);
    expect(ov.body.note).toMatch(/payroll adjustment/);
  });

  it('prints a payslip with every name escaped, and marks an open month a draft', async () => {
    const f = await firm('Print Firm');
    await confirmAllTables(f.t);
    const evil = await guardPaid(f.t, 30_000, { fullName: '<script>alert(1)</script> & "Co"' });
    await patch(f.t.owner.auth, `/v1/guards/${evil.id}`, { hiredOn: LM.days[0] });
    await post(f.payroll.auth, `/v1/payroll/periods/${LM.month}/run`);
    const slip = (await get(f.payroll.auth, `/v1/payroll/periods/${LM.month}/payslips`)).body.items[0];
    const html = await get(f.payroll.auth, `/v1/payslips/${slip.id}/print`);
    expect(html.status).toBe(200);
    expect(html.text).not.toContain('<script>alert(1)</script>');
    expect(html.text).toContain('&lt;script&gt;');
    expect(html.text).toMatch(/DRAFT: period still open/);
    expect(html.text).toMatch(/does not verify them against any official schedule/);
    await post(f.payroll.auth, `/v1/payroll/periods/${LM.month}/close`, {});
    expect((await get(f.payroll.auth, `/v1/payslips/${slip.id}/print`)).text).toMatch(/closed period/);
  });

  it('neutralises a spreadsheet formula in an exported name', async () => {
    const f = await firm('Csv Firm');
    const g = await guardPaid(f.t, 30_000, { fullName: '=HYPERLINK("http://evil","x")' });
    await patch(f.t.owner.auth, `/v1/guards/${g.id}`, { hiredOn: LM.days[0] });
    await post(f.payroll.auth, `/v1/payroll/periods/${LM.month}/run`);
    const csv = (await get(f.payroll.auth, `/v1/exports/payroll/${LM.month}.csv`)).text;
    expect(csv.split('\n')[0]).toMatch(/guard_no,name,national_id/);
    expect(csv).not.toMatch(/,=HYPERLINK/);
    expect(csv).toMatch(/'=HYPERLINK/);
  });
});

describe.runIf(on)('invoicing from verified shifts', () => {
  async function billing(name: string, basis: 'per_shift' | 'per_hour' = 'per_shift', amountKes = 2_500) {
    const f = await firm(name);
    const g = await makeGuard(f.t.owner.auth);
    const rate = await post(f.payroll.auth, `/v1/sites/${f.place.siteId}/rates`, { basis, amountCents: amountKes * 100, effectiveFrom: LM.days[0] });
    expect(rate.status).toBe(201);
    return { ...f, g };
  }

  it('bills only shifts with a check-in and a check-out, and reports what it left out', async () => {
    const f = await billing('Verified Firm');
    await pastShift(f.t, f.place, f.g.id, at(1));
    await pastShift(f.t, f.place, f.g.id, at(3));
    await pastShift(f.t, f.place, f.g.id, at(5), { inAfterMin: null }); // missed
    await pastShift(f.t, f.place, f.g.id, at(7), { outAtEnd: false }); // never checked out
    const preview = await post(f.payroll.auth, '/v1/invoices/preview', { clientId: f.place.clientId, month: LM.month });
    expect(preview.body).toMatchObject({ billedShifts: 2, totalCents: 500_000, notVerified: 2, noRate: 0 });
    const inv = await post(f.payroll.auth, '/v1/invoices', { clientId: f.place.clientId, month: LM.month });
    expect(inv.status).toBe(201);
    expect(inv.body).toMatchObject({ totalCents: 500_000, verifiedShifts: 2, unverifiedShifts: 2, balanceCents: 500_000, status: 'open' });
    expect(inv.body.number).toMatch(/^INV-\d{4}-\d{5}$/);
    expect(inv.body.lines).toHaveLength(1);
    expect(inv.body.lines[0]).toMatchObject({ quantity: 2, unitCents: 250_000, amountCents: 500_000 });
    const evidence = await get(f.payroll.auth, `/v1/invoices/${inv.body.id}/evidence`);
    expect(evidence.body).toHaveLength(2);
    expect(evidence.body[0]).toMatchObject({ verifiedMinutes: 720, billedCents: 250_000 });
    expect(evidence.body[0].inAt).toBeTruthy();
    expect((await get(f.payroll.auth, `/v1/exports/invoice/${inv.body.id}.csv`)).text).toMatch(/check_in,check_out/);
  });

  it('bills per hour on the verified minutes and not the scheduled ones when the guard left early', async () => {
    const f = await billing('Hourly Firm', 'per_hour', 300);
    await patch(f.t.owner.auth, '/v1/settings', { billBasis: 'actual' });
    const { pool } = await boot();
    const id = await pastShift(f.t, f.place, f.g.id, at(2), { hours: 12 });
    // the guard left 3 hours early: replace the check-out
    await pool.withOrg(f.t.orgId, (c) => c.query(`INSERT INTO attendance_events (org_id, shift_id, guard_id, kind, at, effective_at, method, reason) VALUES ($1, $2, $3, 'override_out', now(), $4, 'override', 'Left three hours early')`, [f.t.orgId, id, f.g.id, new Date(at(2).getTime() + 9 * 3_600_000)]));
    const inv = await post(f.payroll.auth, '/v1/invoices', { clientId: f.place.clientId, month: LM.month });
    expect(inv.body.totalCents).toBe(9 * 30_000);
    expect(inv.body.lines[0]).toMatchObject({ basis: 'per_hour', quantity: 9 });
  });

  it('never bills a shift twice: the second run finds nothing, and ten at once produce one invoice', async () => {
    const f = await billing('Once Firm');
    for (const i of [1, 2, 3]) await pastShift(f.t, f.place, f.g.id, at(i * 2));
    const results = await Promise.all(Array.from({ length: 6 }, () => post(f.payroll.auth, '/v1/invoices', { clientId: f.place.clientId, month: LM.month })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    const { pool } = await boot();
    const n = await pool.withOrg(f.t.orgId, async (c) => ({ billed: Number((await c.query('SELECT count(*) AS n FROM client_invoice_shifts')).rows[0].n), distinct: Number((await c.query('SELECT count(DISTINCT shift_id) AS n FROM client_invoice_shifts')).rows[0].n), invoices: Number((await c.query('SELECT count(*) AS n FROM client_invoices')).rows[0].n) }));
    expect(n).toEqual({ billed: 3, distinct: 3, invoices: 1 });
    expect((await post(f.payroll.auth, '/v1/invoices', { clientId: f.place.clientId, month: LM.month })).body.message).toMatch(/Nothing to bill/);
    // a straight duplicate insert is refused by the unique key itself
    await expect(pool.withOrg(f.t.orgId, (c) => c.query(`INSERT INTO client_invoice_shifts (org_id, invoice_id, line_id, shift_id, verified_minutes, billed_cents) SELECT org_id, invoice_id, line_id, shift_id, 1, 1 FROM client_invoice_shifts LIMIT 1`))).rejects.toThrow(/duplicate key/);
  });

  it('refuses to cancel an invoiced shift, and reports a shift with no rate instead of guessing', async () => {
    const f = await firm('NoRate Firm');
    const g = await makeGuard(f.t.owner.auth);
    const sid = await pastShift(f.t, f.place, g.id, at(1));
    const r = await post(f.payroll.auth, '/v1/invoices', { clientId: f.place.clientId, month: LM.month });
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/1 had no rate/);
    await post(f.payroll.auth, `/v1/sites/${f.place.siteId}/rates`, { basis: 'per_shift', amountCents: 100_000, effectiveFrom: LM.days[0] });
    await post(f.payroll.auth, '/v1/invoices', { clientId: f.place.clientId, month: LM.month });
    expect((await post(f.t.owner.auth, `/v1/shifts/${sid}/cancel`, { reason: 'Trying to hide a billed shift' })).status).toBe(409);
  });

  it('uses the rate in force on each day: a rate change mid-month makes two lines', async () => {
    const f = await billing('Rate Change Firm', 'per_shift', 1_000);
    await post(f.payroll.auth, `/v1/sites/${f.place.siteId}/rates`, { basis: 'per_shift', amountCents: 150_000, effectiveFrom: LM.days[10] });
    await pastShift(f.t, f.place, f.g.id, at(2));
    await pastShift(f.t, f.place, f.g.id, at(12));
    const inv = await post(f.payroll.auth, '/v1/invoices', { clientId: f.place.clientId, month: LM.month });
    expect(inv.body.totalCents).toBe(100_000 + 150_000);
    expect(inv.body.lines).toHaveLength(2);
    const rates = await get(f.payroll.auth, `/v1/sites/${f.place.siteId}/rates`);
    expect(rates.body).toHaveLength(2);
  });

  it('issues credit notes up to the invoice and no further, and records a dispute and its resolution', async () => {
    const f = await billing('Credit Firm');
    for (const i of [1, 3, 5, 7]) await pastShift(f.t, f.place, f.g.id, at(i));
    const inv = (await post(f.payroll.auth, '/v1/invoices', { clientId: f.place.clientId, month: LM.month })).body;
    expect(inv.totalCents).toBe(1_000_000);
    expect((await post(f.payroll.auth, `/v1/invoices/${inv.id}/credit`, { amountCents: 250_000, reason: 'x' })).status).toBe(400);
    const c1 = await post(f.payroll.auth, `/v1/invoices/${inv.id}/credit`, { amountCents: 250_000, reason: 'One shift disputed and agreed not worked' });
    expect(c1.body).toMatchObject({ creditedCents: 250_000, balanceCents: 750_000 });
    expect(c1.body.creditNotes[0].number).toMatch(/^CN-\d{4}-\d{5}$/);
    expect((await post(f.payroll.auth, `/v1/invoices/${inv.id}/credit`, { amountCents: 800_000, reason: 'More than the invoice allows' })).status).toBe(409);
    const d = await post(f.payroll.auth, `/v1/invoices/${inv.id}/events`, { kind: 'dispute', body: 'Client says night cover was missing on the 3rd' });
    expect(d.body.disputed).toBe(true);
    expect((await post(f.payroll.auth, `/v1/invoices/${inv.id}/events`, { kind: 'dispute', body: 'Again please' })).status).toBe(409);
    expect((await get(f.payroll.auth, '/v1/invoices?status=disputed')).body.total).toBe(1);
    expect((await post(f.payroll.auth, `/v1/invoices/${inv.id}/events`, { kind: 'resolve', body: 'Evidence showed full cover' })).body.disputed).toBe(false);
    expect((await post(f.payroll.auth, `/v1/invoices/${inv.id}/events`, { kind: 'resolve', body: 'Nothing to resolve' })).status).toBe(409);
    const { pool } = await boot();
    await expect(pool.withOrg(f.t.orgId, (c) => c.query(`UPDATE client_credit_notes SET amount_cents = 1`))).rejects.toThrow(/permission denied/);
    await expect(pool.withOrg(f.t.orgId, (c) => c.query(`UPDATE client_invoices SET total_cents = 1`))).rejects.toThrow(/permission denied/);
    await expect(pool.withOrg(f.t.orgId, (c) => c.query(`DELETE FROM client_invoice_lines`))).rejects.toThrow(/permission denied/);
  });

  it('allocates a payment to the oldest invoice first, keeps the excess on account, and applies it to the next invoice', async () => {
    const f = await billing('Pay Alloc Firm');
    await pastShift(f.t, f.place, f.g.id, at(1));
    const first = (await post(f.payroll.auth, '/v1/invoices', { clientId: f.place.clientId, month: LM.month })).body;
    await pastShift(f.t, f.place, f.g.id, at(5));
    const second = (await post(f.payroll.auth, '/v1/invoices', { clientId: f.place.clientId, month: LM.month })).body;
    expect([first.totalCents, second.totalCents]).toEqual([250_000, 250_000]);
    const pay = await post(f.payroll.auth, '/v1/payments', { clientId: f.place.clientId, amountCents: 400_000, receivedOn: localParts(new Date()).date, method: 'bank', reference: 'RTGS-1' });
    expect(pay.body).toMatchObject({ allocatedCents: 400_000, onAccountCents: 0 });
    expect(pay.body.allocations[0]).toMatchObject({ invoiceId: first.id, amountCents: 250_000 });
    expect((await get(f.payroll.auth, `/v1/invoices/${first.id}`)).body).toMatchObject({ status: 'paid', balanceCents: 0 });
    expect((await get(f.payroll.auth, `/v1/invoices/${second.id}`)).body).toMatchObject({ status: 'part_paid', balanceCents: 100_000 });
    expect((await post(f.payroll.auth, '/v1/payments', { clientId: f.place.clientId, amountCents: 1, receivedOn: localParts(new Date()).date, method: 'bank', reference: 'RTGS-1' })).status).toBe(409);
    const over = await post(f.payroll.auth, '/v1/payments', { clientId: f.place.clientId, amountCents: 500_000, receivedOn: localParts(new Date()).date, method: 'mpesa', reference: 'QWE123' });
    expect(over.body).toMatchObject({ allocatedCents: 100_000, onAccountCents: 400_000 });
    expect((await get(f.payroll.auth, '/v1/payments')).body.items.find((p: { reference: string }) => p.reference === 'QWE123').onAccountCents).toBe(400_000);
    await pastShift(f.t, f.place, f.g.id, at(9));
    const third = (await post(f.payroll.auth, '/v1/invoices', { clientId: f.place.clientId, month: LM.month })).body;
    expect(third).toMatchObject({ totalCents: 250_000, balanceCents: 0, status: 'paid' }); // paid from the credit on account
    expect((await post(f.payroll.auth, '/v1/payments', { clientId: f.place.clientId, amountCents: 100, receivedOn: '2999-01-01', method: 'cash' })).status).toBe(400);
  });

  it('ages what is owed by days past due, and gets the sample\'s overdue invoice right', async () => {
    const t = await newTenant('Debtors Sample', { sample: true });
    const d = await get(t.owner.auth, '/v1/debtors');
    expect(d.body.buckets).toEqual(['not_due', '1-30', '31-60', '61-90', '90+']);
    expect(d.body.totalCents).toBe(d.body.items.reduce((s: number, i: { totalCents: number }) => s + i.totalCents, 0));
    const bank = d.body.items.find((i: { client: string }) => i.client === 'Sample Bank Ltd');
    expect(bank.oldestDaysOverdue).toBeGreaterThan(0);
    expect(Object.entries(bank.buckets).filter(([k, v]) => k !== 'not_due' && (v as number) > 0).length).toBeGreaterThan(0);
    const csv = await get(t.owner.auth, '/v1/exports/debtors.csv');
    expect(csv.text.split('\n')[0]).toBe('client,not_due_kes,1-30_kes,31-60_kes,61-90_kes,90+_kes,total_kes,open_invoices,oldest_days_overdue');
    const overdue = await get(t.owner.auth, '/v1/invoices?status=overdue');
    expect(overdue.body.total).toBeGreaterThanOrEqual(1);
  });

  it('shows margin per client from invoices and the employer cost of the guards who worked there', async () => {
    const f = await billing('Margin Firm', 'per_shift', 5_000);
    await confirmAllTables(f.t);
    await setPay(f.t.owner.auth, f.g.id, 30_000);
    await patch(f.t.owner.auth, `/v1/guards/${f.g.id}`, { hiredOn: LM.days[0] });
    const second = await makePlace(f.t.owner.auth, { name: 'Second client site' });
    await post(f.payroll.auth, `/v1/sites/${second.siteId}/rates`, { basis: 'per_shift', amountCents: 400_000, effectiveFrom: LM.days[0] });
    for (const i of [1, 3, 5]) await pastShift(f.t, f.place, f.g.id, at(i));
    for (const i of [8]) await pastShift(f.t, second, f.g.id, at(i));
    await post(f.payroll.auth, '/v1/invoices', { clientId: f.place.clientId, month: LM.month });
    await post(f.payroll.auth, '/v1/invoices', { clientId: second.clientId, month: LM.month });
    const before = await get(f.payroll.auth, `/v1/margin/${LM.month}`);
    expect(before.body.costKnown).toBe(false);
    await post(f.payroll.auth, `/v1/payroll/periods/${LM.month}/run`);
    const m = await get(f.payroll.auth, `/v1/margin/${LM.month}`);
    expect(m.body.costKnown).toBe(true);
    const slip = (await get(f.payroll.auth, `/v1/payroll/periods/${LM.month}/payslips`)).body.items[0];
    const first = m.body.items.find((x: { clientId: string }) => x.clientId === f.place.clientId);
    const other = m.body.items.find((x: { clientId: string }) => x.clientId === second.clientId);
    expect(first.netCents).toBe(1_500_000);
    expect(other.netCents).toBe(400_000);
    expect(first.costCents + other.costCents).toBe(slip.employerCostCents); // split to the exact cent
    expect(first.costCents).toBeGreaterThan(other.costCents); // 3 shifts of minutes against 1
    expect(m.body.totals.marginCents).toBe(first.marginCents + other.marginCents);
  });

  it('lets only the owner and payroll invoice, and lets an ops manager read', async () => {
    const f = await billing('Invoice Roles');
    const ops = await addStaff(f.t, 'ops_manager');
    const sup = await addStaff(f.t, 'supervisor');
    await pastShift(f.t, f.place, f.g.id, at(1));
    expect((await post(ops.auth, '/v1/invoices', { clientId: f.place.clientId, month: LM.month })).status).toBe(403);
    expect((await post(sup.auth, '/v1/payments', { clientId: f.place.clientId, amountCents: 1, receivedOn: LM.days[0], method: 'cash' })).status).toBe(403);
    expect((await get(ops.auth, '/v1/invoices')).status).toBe(200);
    expect((await get(sup.auth, '/v1/invoices')).status).toBe(403);
    expect((await get(sup.auth, `/v1/sites/${f.place.siteId}/rates`)).status).toBe(403);
    expect((await post(f.payroll.auth, '/v1/invoices', { clientId: f.place.clientId, month: '2999-01' })).status).toBe(400);
  });
});

describe.runIf(on)('the client\'s read-only portal', () => {
  it('shows attendance verification by site and day and nothing about guards or pay', async () => {
    const f = await firm('Portal Firm');
    const g = await guardPaid(f.t, 30_000, { fullName: 'Secret Guardname' });
    await pastShift(f.t, f.place, g.id, at(1));
    await pastShift(f.t, f.place, g.id, at(3), { inAfterMin: null });
    await pastShift(f.t, f.place, g.id, at(5), { inAfterMin: 40 });
    const off = await get(f.t.owner.auth, `/v1/clients/${f.place.clientId}/portal`);
    expect(off.body.token).toBeNull();
    const link = await put(f.t.owner.auth, `/v1/clients/${f.place.clientId}/portal`, { enabled: true });
    expect(link.body.token.length).toBeGreaterThanOrEqual(24);
    const { app } = await boot();
    const r = await request(app).get(`/v1/portal/${link.body.token}?month=${LM.month}`);
    expect(r.status).toBe(200);
    expect(r.body.sites[0].totals).toMatchObject({ scheduled: 3, verified: 2, late: 1, missed: 1 });
    const text = JSON.stringify(r.body);
    for (const secret of ['Secret Guardname', 'guard', 'G0001', 'monthly', 'rate', 'invoice', 'phone']) expect(text.toLowerCase()).not.toContain(secret.toLowerCase().replace('guard', 'guardname').replace('guardname', secret === 'guard' ? 'secretguardname' : secret.toLowerCase()));
    const rotated = await put(f.t.owner.auth, `/v1/clients/${f.place.clientId}/portal`, { enabled: true });
    expect(rotated.body.token).not.toBe(link.body.token);
    expect((await request(app).get(`/v1/portal/${link.body.token}`)).status).toBe(404);
    expect((await request(app).get(`/v1/portal/${rotated.body.token}`)).status).toBe(200);
    await put(f.t.owner.auth, `/v1/clients/${f.place.clientId}/portal`, { enabled: false });
    expect((await request(app).get(`/v1/portal/${rotated.body.token}`)).status).toBe(404);
    expect((await request(app).get('/v1/portal/short')).status).toBe(404);
    expect((await put(f.payroll.auth, `/v1/clients/${f.place.clientId}/portal`, { enabled: true })).status).toBe(200); // payroll may manage clients
  });

  it('does not let an ended client\'s link keep working', async () => {
    const f = await firm('Ended Client');
    const link = await put(f.t.owner.auth, `/v1/clients/${f.place.clientId}/portal`, { enabled: true });
    await patch(f.t.owner.auth, `/v1/clients/${f.place.clientId}`, { status: 'ended' });
    const { app } = await boot();
    expect((await request(app).get(`/v1/portal/${link.body.token}`)).status).toBe(404);
  });
});

void nextId; void del; export type _P = Place;
