/**
 * Sample data for the "try it first" organisation. Built by calling the real services where a service exists (guards, clients, sites,
 * invoices, payroll), and by inserting shifts and attendance directly because a service refuses to record the past. Names, ID numbers and phone
 * numbers are invented and sit in ranges that belong to no one (ID numbers 90000001 up). Every date is relative to today so the board, the
 * arrears and the open month are always current. Pseudo-randomness is a fixed-seed generator: the same sample every time.
 *
 * It deliberately contains things a firm would want to see caught: guards paid below the minimum, a lapsed PSRA number, missing NSSF numbers,
 * a missed shift, a late arrival, a check-in outside the geofence, an overdue invoice, an open critical incident, a pending swap.
 */
import { PoolClient } from 'pg';
import { Ctx } from '../common/context';
import { addDays, localDayOf, monthOf, TZ } from '../common/time';
import { createGuard, setPay } from '../ops/guards';
import { createClient, createCheckpoint, createPost, createSite, addRate } from '../ops/sites';
import { createTemplate, requestSwap, approveOvertime } from '../ops/roster-service';
import { reportIncident, addNote } from '../ops/incidents';
import { generateInvoice, creditNote, recordPayment, invoiceEvent } from '../invoicing/service';
import { addHoliday, confirmTable, loadIllustrative } from '../payroll/rates';
import { closePeriod, runPayroll } from '../payroll/service';
import { DeductionKind } from '../payroll/deductions';

const NAMES = [
  'Wanjiku Kamau', 'Otieno Odhiambo', 'Achieng Atieno', 'Kiprono Chebet', 'Mwende Mutua', 'Njoroge Githinji', 'Akinyi Owino', 'Kipchoge Rotich',
  'Naliaka Wekesa', 'Mutheu Kioko', 'Barasa Simiyu', 'Chepkemoi Langat', 'Wambui Maina', 'Ouma Onyango', 'Jeptoo Kosgei', 'Mueni Musyoka',
  'Karanja Mwangi', 'Adhiambo Ochieng', 'Kibet Tanui', 'Nyambura Njenga', 'Omondi Okoth', 'Wafula Mukhwana', 'Zawadi Mwanzia', 'Hawa Abdi'
];

const kes = (n: number) => n * 100;

/** A tiny deterministic generator so the sample is the same every time. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

const CLIENTS = [
  { name: 'Sample Bank Ltd', terms: 30, sites: [{ name: 'Head office', lat: -1.2864, lng: 36.8172, rounds: 0 }, { name: 'Westlands branch', lat: -1.2676, lng: 36.8108, rounds: 0 }] },
  { name: 'Sample Mall', terms: 30, sites: [{ name: 'Main entrance and car park', lat: -1.3032, lng: 36.7073, rounds: 2 }] },
  { name: 'Sample School', terms: 14, sites: [{ name: 'Campus', lat: -1.2201, lng: 36.8870, rounds: 2 }] },
  { name: 'Sample Factory', terms: 45, sites: [{ name: 'Industrial area gate', lat: -1.3101, lng: 36.8590, rounds: 0 }] }
];

export async function seedSampleData(client: PoolClient, orgId: string, ownerId: string, branchId: string): Promise<void> {
  const owner: Ctx = { orgId, userId: ownerId, role: 'owner', branchId: null };
  const rand = lcg(2026);
  const now = new Date();
  const D = localDayOf(now);
  const phoneBase = String(parseInt(orgId.slice(0, 8), 16) % 1_000_000).padStart(6, '0');

  await client.query(`UPDATE organisations SET psra_licence_no = 'SAMPLE-PSRA-0000' WHERE id = $1`, [orgId]);

  // ---- guards (24) --------------------------------------------------------------------------------
  const guards: Array<{ id: string; name: string }> = [];
  for (let i = 0; i < NAMES.length; i += 1) {
    const g = await createGuard(client, owner, {
      fullName: NAMES[i]!, branchId, phone: `2547${phoneBase}${String(10 + i)}`, nationalId: String(90_000_001 + i),
      psraRegNo: i === 5 ? null : `SAMPLE-REG-${1000 + i}`, psraExpiry: i === 7 ? addDays(D, -20) : addDays(D, 200 + i * 5),
      nssfNo: i === 9 || i === 10 ? null : `SAMPLE-NSSF-${2000 + i}`, shaNo: `SAMPLE-SHA-${3000 + i}`, kraPin: i === 11 ? null : `SAMPLE${4000 + i}X`,
      restWeekday: i % 4 === 0 ? 0 : null, hiredOn: addDays(D, -400)
    });
    // two guards are paid below the configured minimum, on purpose
    const basic = i === 20 ? kes(18_000) : i === 21 ? kes(6_500) : kes(30_000 + (i % 5) * 1_000);
    await setPay(client, owner, g.id, { monthlyBasicCents: basic, allowanceCents: i % 3 === 0 ? kes(2_000) : 0 });
    guards.push({ id: g.id, name: NAMES[i]! });
  }

  // ---- clients, sites, posts, checkpoints, rates ----------------------------------------------------
  const posts: Array<{ siteId: string; postId: string; clientId: string; rounds: number; lat: number; lng: number; site: string }> = [];
  const clientIds: string[] = [];
  for (const c of CLIENTS) {
    const created = await createClient(client, owner, { name: c.name, contactName: 'Sample contact', paymentTermsDays: c.terms });
    clientIds.push(created.id);
    for (const s of c.sites) {
      const site = await createSite(client, owner, { clientId: created.id, branchId, name: s.name, lat: s.lat, lng: s.lng, geofenceM: 150, roundsPerShift: s.rounds, checkpointsOrdered: s.rounds > 0, postName: 'Gate' });
      if (s.rounds > 0) for (const cp of ['Gate', 'Store', 'Perimeter fence', 'Back entrance']) await createCheckpoint(client, owner, site.id, cp);
      const sitePosts = (await client.query('SELECT id FROM posts WHERE site_id = $1', [site.id])).rows;
      posts.push({ siteId: site.id, postId: sitePosts[0].id, clientId: created.id, rounds: s.rounds, lat: s.lat, lng: s.lng, site: s.name });
      const rateStart = addDays(D, -400);
      await addRate(client, owner, site.id, s.name.startsWith('Campus') ? { basis: 'per_hour', amountCents: kes(240), effectiveFrom: rateStart } : { basis: 'per_shift', amountCents: kes(2_400 + ((s.name.length * 37) % 9) * 100), effectiveFrom: rateStart });
    }
  }
  // the mall also has a second post at the same site
  const mall = posts.find((p) => p.site.startsWith('Main entrance'))!;
  const post2 = await createPost(client, owner, mall.siteId, { name: 'Loading bay' });
  posts.push({ ...mall, postId: post2.id });

  await createTemplate(client, owner, { name: 'Day 06:00-18:00', startTime: '06:00', endTime: '18:00' });
  await createTemplate(client, owner, { name: 'Night 18:00-06:00', startTime: '18:00', endTime: '06:00' });

  // ---- eight weeks of shifts and attendance, plus a week ahead ----------------------------------------
  const DAYS_BACK = 56;
  const todayShifts: Array<{ id: string; start: Date; end: Date; guardIdx: number; slot: number }> = [];
  const checkpointsBySite = new Map<string, string[]>();
  for (const p of posts) {
    if (p.rounds > 0 && !checkpointsBySite.has(p.siteId)) {
      checkpointsBySite.set(p.siteId, (await client.query('SELECT id FROM checkpoints WHERE site_id = $1 ORDER BY seq', [p.siteId])).rows.map((r) => r.id as string));
    }
  }
  const lowMargin = guards.length;
  for (let back = DAYS_BACK; back >= -7; back -= 1) {
    const day = addDays(D, -back);
    let slot = 0;
    for (const p of posts) {
      for (const kind of ['day', 'night'] as const) {
        const start = new Date(`${day}T${kind === 'day' ? '06:00' : '18:00'}:00+03:00`);
        const end = new Date(start.getTime() + 12 * 3_600_000);
        const guardIdx = (((DAYS_BACK - back) * 3 + slot * 2) % lowMargin + lowMargin) % lowMargin;
        slot += 1;
        const published = back > -3 ? now : null;
        const s = (
          await client.query(
            `INSERT INTO shifts (org_id, branch_id, site_id, post_id, guard_id, start_at, end_at, scheduled_minutes, published_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, 720, $8, $9) RETURNING id`,
            [orgId, branchId, p.siteId, p.postId, guards[guardIdx]!.id, start, end, published, ownerId]
          )
        ).rows[0];
        if (back === 0) todayShifts.push({ id: s.id, start, end, guardIdx, slot: slot - 1 });
        if (back < 0 || back === 0) continue;
        // a past shift: usually fine, sometimes late, rarely missed, now and then outside the geofence
        const roll = rand();
        if (roll < 0.04) continue; // missed: nobody checked in
        const lateMin = roll < 0.14 ? 20 + Math.floor(rand() * 30) : Math.floor(rand() * 8);
        const outside = rand() < 0.03;
        const inAt = new Date(start.getTime() + lateMin * 60_000);
        const outAt = new Date(end.getTime() + Math.floor(rand() * 10) * 60_000);
        const fix = outside ? { lat: p.lat + 0.02, lng: p.lng } : { lat: p.lat + (rand() - 0.5) * 0.0006, lng: p.lng + (rand() - 0.5) * 0.0006 };
        await client.query(
          `INSERT INTO attendance_events (org_id, shift_id, guard_id, kind, at, effective_at, method, recorded_by, lat, lng, geofence) VALUES ($1, $2, $3, 'in', $4, $4, 'supervisor', $5, $6, $7, $8)`,
          [orgId, s.id, guards[guardIdx]!.id, inAt, ownerId, fix.lat, fix.lng, outside ? 'outside' : 'within']
        );
        if (roll > 0.985) continue; // forgot to check out: left for a supervisor
        await client.query(`INSERT INTO attendance_events (org_id, shift_id, guard_id, kind, at, effective_at, method, recorded_by, geofence) VALUES ($1, $2, $3, 'out', $4, $4, 'supervisor', $5, 'unknown')`, [orgId, s.id, guards[guardIdx]!.id, outAt, ownerId]);
        if (p.rounds > 0) {
          const cps = checkpointsBySite.get(p.siteId)!;
          for (let round = 0; round < p.rounds; round += 1) {
            for (let k = 0; k < cps.length; k += 1) {
              if (round === 1 && k === 3 && rand() < 0.3) continue; // a missed checkpoint
              await client.query(
                `INSERT INTO patrol_scans (org_id, site_id, shift_id, guard_id, checkpoint_id, scanned_at, method, recorded_by, geofence) VALUES ($1, $2, $3, $4, $5, $6, 'supervisor', $7, 'within')`,
                [orgId, p.siteId, s.id, guards[guardIdx]!.id, cps[k], new Date(inAt.getTime() + (round * 4 + 1 + k * 0.5) * 3_600_000), ownerId]
              );
            }
          }
        }
        if (roll > 0.9 && roll <= 0.93) await client.query(`UPDATE shifts SET overtime_approved_minutes = 90, overtime_note = 'Relief did not arrive (sample)' WHERE id = $1`, [s.id]);
      }
    }
  }

  // today: some on site, one missed, one late, the rest upcoming
  for (const t of todayShifts) {
    const g = guards[t.guardIdx]!.id;
    const p = posts[Math.floor(t.slot / 2)]!;
    const started = t.start.getTime() <= now.getTime();
    if (!started) continue;
    if (t.slot === 2 && now.getTime() - t.start.getTime() > 61 * 60_000) continue; // missed today
    const lateMin = t.slot === 4 ? 35 : 3;
    const inAt = new Date(t.start.getTime() + lateMin * 60_000);
    if (inAt.getTime() > now.getTime()) continue;
    await client.query(`INSERT INTO attendance_events (org_id, shift_id, guard_id, kind, at, effective_at, method, recorded_by, lat, lng, geofence) VALUES ($1, $2, $3, 'in', $4, $4, 'supervisor', $5, $6, $7, 'within')`, [orgId, t.id, g, inAt, ownerId, p.lat, p.lng]);
    if (t.end.getTime() <= now.getTime()) await client.query(`INSERT INTO attendance_events (org_id, shift_id, guard_id, kind, at, effective_at, method, recorded_by, geofence) VALUES ($1, $2, $3, 'out', $4, $4, 'supervisor', $5, 'unknown')`, [orgId, t.id, g, t.end, ownerId]);
  }

  // ---- holidays, overtime, one swap, incidents ---------------------------------------------------------
  await addHoliday(client, owner, addDays(D, -20), 'Sample holiday (not a real calendar entry)');
  const future = (await client.query(`SELECT id, guard_id FROM shifts WHERE org_id = $1 AND start_at > now() + interval '2 days' AND guard_id IS NOT NULL ORDER BY start_at LIMIT 1`, [orgId])).rows[0];
  if (future) {
    const other = guards.find((g) => g.id !== future.guard_id)!;
    await requestSwap(client, { ...owner, role: 'ops_manager' }, future.id, other.id, 'Family event (sample)').catch(() => undefined);
  }
  const done = (await client.query(`SELECT s.id FROM shifts s WHERE s.org_id = $1 AND s.start_at < now() - interval '3 days' AND EXISTS (SELECT 1 FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'out') AND s.overtime_approved_minutes = 0 AND s.start_at > now() - interval '8 days' LIMIT 1`, [orgId])).rows[0];
  if (done) await approveOvertime(client, owner, done.id, 60, 'Handover delayed (sample)').catch(() => undefined);

  const inc = [
    { site: posts[0]!, severity: 'critical' as const, category: 'Break-in attempt', narrative: 'Sample: forced entry attempt at the rear door overnight; police informed; nothing taken.' },
    { site: posts[1]!, severity: 'minor' as const, category: 'Lost property', narrative: 'Sample: a visitor reported a lost phone; found at reception.' },
    { site: posts[2]!, severity: 'major' as const, category: 'Fire alarm', narrative: 'Sample: fire alarm triggered by smoke from a kitchen; area evacuated; no injuries.' },
    { site: posts[3]!, severity: 'info' as const, category: 'Access log', narrative: 'Sample: contractor on site after hours with written permission.' }
  ];
  const created: string[] = [];
  for (const i of inc) created.push((await reportIncident(client, owner, { siteId: i.site.siteId, severity: i.severity, category: i.category, narrative: i.narrative, occurredAt: new Date(now.getTime() - 3 * 86_400_000).toISOString() })).id);
  await addNote(client, owner, created[1]!, 'close', 'Sample: returned to the owner.');
  await addNote(client, owner, created[2]!, 'note', 'Sample: fire brigade confirmed no damage.');

  // ---- payroll tables, last month closed, this month open ---------------------------------------------
  for (const kind of ['nssf', 'sha', 'housing', 'paye'] as DeductionKind[]) {
    await loadIllustrative(client, owner, kind);
    await confirmTable(client, owner, kind, 'Sample organisation: illustrative values, NOT verified against any official schedule.');
  }
  const lastMonth = monthOf(addDays(`${D.slice(0, 7)}-01`, -1));
  await runPayroll(client, owner, lastMonth);
  await closePeriod(client, owner, lastMonth, { acknowledge: 'Sample organisation: two guards are deliberately paid below the minimum so the compliance report has something to show.' });
  await runPayroll(client, owner, D.slice(0, 7));

  // ---- invoices: last month for three clients (one overdue), a credit note, a payment, a dispute --------------
  const issueLast = addDays(`${D.slice(0, 7)}-01`, -1);
  const bankInvoice = await generateInvoice(client, owner, { clientId: clientIds[0]!, month: lastMonth }, { issueDate: addDays(issueLast, -60) });
  await generateInvoice(client, owner, { clientId: clientIds[1]!, month: lastMonth }, { issueDate: issueLast });
  const school = await generateInvoice(client, owner, { clientId: clientIds[2]!, month: lastMonth }, { issueDate: issueLast });
  await recordPayment(client, owner, { clientId: clientIds[1]!, amountCents: kes(50_000), receivedOn: addDays(D, -5), method: 'bank', reference: 'SAMPLE-BANK-REF-1' });
  await creditNote(client, owner, school.id, { amountCents: kes(2_400), reason: 'Sample: one shift disputed by the school and agreed as not worked' });
  await invoiceEvent(client, owner, bankInvoice.id, 'dispute', 'Sample: client says two night shifts were not covered; evidence attached from attendance');
  // the Factory is left un-invoiced on purpose: its shifts show as unbilled on the overview
  void TZ;
}
