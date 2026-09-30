/**
 * The demo world, as data. A deterministic generator (seeded PRNG, no database, no clock other
 * than the `now` it is given) that lays out an organisation, three sites, a team, a price list
 * and fourteen days of trading - with a handful of frauds planted on known days. Keeping it pure
 * means the tests can run the planted days through the real reconciliation engine and prove
 * each one is actually detected, and the seed can write exactly the same plan to Postgres.
 */
import { JobRecord, PaymentRecord, ReconciliationInput, TelemetryWindow, VehicleObservation } from '../reconciliation/types';
import { cents } from '../domain/money';

export const DEMO_ORG_NAME = 'Mwangaza Car Wash (DEMO)';
export const DEMO_PIN = '246810';
export const DEMO_OWNER_PHONE = '254700000001';
export const DEMO_TILL_PREFIX = '51100';
/** Kenya is UTC+3 all year. Opening hours are stored as local minutes. */
const LOCAL_OFFSET_MIN = 180;

export interface PlanService {
  key: string;
  name: string;
  kind: 'base' | 'addon';
  listPriceCents: number;
  expectedWaterL: number;
  expectedDurationS: number;
  commissionRate: number;
}

export interface PlanPerson {
  key: string;
  displayName: string;
  phone: string;
  role: 'owner' | 'manager' | 'supervisor' | 'worker';
  siteKey: string | null;
}

export interface PlanSite {
  key: string;
  name: string;
  till: string;
  litresPerWash: number;
  cashRatio: number;
  bays: string[];
  volume: number;
  /** a device that has gone quiet, to give the devices screen something to show */
  silentBay: string | null;
}

export interface PlanPayment {
  channel: 'cash' | 'mpesa';
  amountCents: number;
  ref: string | null;
  msisdn: string | null;
  at: Date;
}

export interface PlanJob {
  key: string;
  siteKey: string;
  bay: string;
  workerKey: string;
  plate: string;
  serviceKeys: string[];
  listCents: number;
  quotedCents: number;
  authorisedByKey: string | null;
  state: 'closed' | 'abandoned' | 'awaiting_payment' | 'in_progress';
  createdAt: Date;
  startedAt: Date;
  finishedAt: Date;
  closedAt: Date | null;
  litres: number;
  payment: PlanPayment | null;
}

export interface PlanGhost {
  siteKey: string;
  bay: string;
  plate: string;
  at: Date;
  minutes: number;
  litres: number;
}

export interface PlanOrphanPayment {
  siteKey: string;
  amountCents: number;
  ref: string;
  msisdn: string;
  at: Date;
}

export interface PlanAfterHours {
  siteKey: string;
  bay: string;
  at: Date;
  minutes: number;
  litres: number;
}

export interface DemoPlan {
  today: Date;
  services: PlanService[];
  sites: PlanSite[];
  people: PlanPerson[];
  jobs: PlanJob[];
  ghosts: PlanGhost[];
  orphans: PlanOrphanPayment[];
  afterHours: PlanAfterHours[];
  days: string[];
}

export interface Scenario {
  site: string;
  daysAgo: number;
  kind: 'after_hours' | 'cash_heavy' | 'orphan_payments' | 'ghost_washes' | 'unpaid' | 'abandoned' | 'underquote';
  count?: number;
  worker?: string;
  /** the flag this scenario is expected to raise, asserted by the tests */
  expects: string[];
}

export const SCENARIOS: Scenario[] = [
  { site: 'westlands', daysAgo: 2, kind: 'after_hours', count: 3, expects: ['after_hours_operation'] },
  { site: 'westlands', daysAgo: 4, kind: 'unpaid', count: 3, expects: ['job_without_payment'] },
  { site: 'westlands', daysAgo: 6, kind: 'cash_heavy', expects: ['cash_ratio_spike'] },
  { site: 'westlands', daysAgo: 9, kind: 'orphan_payments', count: 3, expects: ['payment_without_job'] },
  { site: 'kilimani', daysAgo: 3, kind: 'ghost_washes', count: 7, expects: ['ghost_wash'] },
  { site: 'kilimani', daysAgo: 8, kind: 'unpaid', count: 4, expects: ['job_without_payment'] },
  { site: 'kilimani', daysAgo: 12, kind: 'abandoned', count: 4, worker: 'kilimani-w3', expects: ['abandoned_job_pattern'] },
  { site: 'thika', daysAgo: 1, kind: 'ghost_washes', count: 6, expects: ['ghost_wash'] },
  { site: 'thika', daysAgo: 5, kind: 'underquote', count: 8, worker: 'thika-w2', expects: ['underquoting'] },
  { site: 'thika', daysAgo: 10, kind: 'cash_heavy', expects: ['cash_ratio_spike'] }
];

export function demoSecret(siteKey: string, bay: string, type: string): string {
  return `demo-${siteKey}-${bay.toLowerCase().replace(/[^a-z0-9]+/g, '')}-${type}-secret`;
}

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A moment given as a local (Nairobi) minute of the day on a UTC-dated day. */
function atLocal(day: Date, localMinute: number): Date {
  return new Date(day.getTime() + (localMinute - LOCAL_OFFSET_MIN) * 60_000);
}

export const SERVICES: PlanService[] = [
  { key: 'basic', name: 'Basic wash', kind: 'base', listPriceCents: 50_000, expectedWaterL: 60, expectedDurationS: 1300, commissionRate: 0.1 },
  { key: 'premium', name: 'Premium wash (with vacuum)', kind: 'base', listPriceCents: 80_000, expectedWaterL: 60, expectedDurationS: 2000, commissionRate: 0.1 },
  { key: 'wax', name: 'Wax and polish', kind: 'addon', listPriceCents: 120_000, expectedWaterL: 0, expectedDurationS: 900, commissionRate: 0.15 },
  { key: 'engine', name: 'Engine wash', kind: 'addon', listPriceCents: 70_000, expectedWaterL: 0, expectedDurationS: 600, commissionRate: 0.1 },
  { key: 'tyre', name: 'Tyre shine', kind: 'addon', listPriceCents: 15_000, expectedWaterL: 0, expectedDurationS: 240, commissionRate: 0.1 }
];

const SITES: PlanSite[] = [
  { key: 'westlands', name: 'Westlands', till: `${DEMO_TILL_PREFIX}01`, litresPerWash: 60, cashRatio: 0.3, bays: ['Bay 1', 'Bay 2', 'Bay 3'], volume: 1.2, silentBay: null },
  { key: 'kilimani', name: 'Kilimani', till: `${DEMO_TILL_PREFIX}02`, litresPerWash: 60, cashRatio: 0.3, bays: ['Bay 1', 'Bay 2'], volume: 1.0, silentBay: null },
  { key: 'thika', name: 'Thika Road', till: `${DEMO_TILL_PREFIX}03`, litresPerWash: 60, cashRatio: 0.3, bays: ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4'], volume: 0.85, silentBay: 'Bay 4' }
];

const WORKER_NAMES: Record<string, string[]> = {
  westlands: ['Samuel Kiptoo', 'Faith Achieng', 'Daniel Mwangi'],
  kilimani: ['Joseph Odhiambo', 'Mercy Wambui', 'Hassan Abdi'],
  thika: ['Peter Kariuki', 'Kevin Mutua', 'Lucy Chebet']
};
const MANAGERS: Record<string, string> = { westlands: 'Brian Otieno', kilimani: 'Grace Njeri', thika: 'Peter Kamau' };

function people(): PlanPerson[] {
  const out: PlanPerson[] = [{ key: 'owner', displayName: 'Amina Wanjiru', phone: DEMO_OWNER_PHONE, role: 'owner', siteKey: null }];
  let manager = 2;
  let worker = 11;
  for (const site of SITES) {
    out.push({ key: `${site.key}-m`, displayName: MANAGERS[site.key]!, phone: `2547000000${String(manager).padStart(2, '0')}`, role: 'manager', siteKey: site.key });
    manager += 1;
    WORKER_NAMES[site.key]!.forEach((name, index) => {
      out.push({ key: `${site.key}-w${index + 1}`, displayName: name, phone: `2547000000${worker}`, role: 'worker', siteKey: site.key });
      worker += 1;
    });
  }
  out.push({ key: 'westlands-s', displayName: 'Esther Naliaka', phone: '254700000005', role: 'supervisor', siteKey: 'westlands' });
  return out;
}

function plateFrom(random: () => number): string {
  const letter = (from: string) => from[Math.floor(random() * from.length)]!;
  const digits = String(Math.floor(random() * 900) + 100);
  return `K${letter('ABCD')}${letter('ABCDEFGHJKLMNPRSTUVWXYZ')} ${digits}${letter('ABCDEFGHJKLMNPRSTUVWXYZ')}`;
}

function mpesaRef(random: () => number, used: Set<string>): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  for (;;) {
    let ref = 'S';
    for (let i = 0; i < 9; i += 1) ref += alphabet[Math.floor(random() * alphabet.length)];
    if (!used.has(ref)) {
      used.add(ref);
      return ref;
    }
  }
}

function msisdn(random: () => number): string {
  return `2547${String(Math.floor(random() * 90_000_000) + 10_000_000)}`;
}

/** Weighted local arrival minute: a morning rush, a late-afternoon rush, a quiet middle. */
function arrivalMinute(random: () => number, opens: number, closes: number): number {
  for (;;) {
    const minute = opens + 30 + Math.floor(random() * (closes - opens - 90));
    const hour = minute / 60;
    const weight = 0.35 + 0.65 * Math.max(Math.exp(-((hour - 10) ** 2) / 2.2), Math.exp(-((hour - 16.2) ** 2) / 1.6));
    if (random() < weight) return minute;
  }
}

export interface GenerateOptions {
  now: Date;
  days?: number;
  seed?: number;
}

export function generatePlan(options: GenerateOptions): DemoPlan {
  const { now } = options;
  const days = options.days ?? 14;
  const random = prng(options.seed ?? 20260930);
  const today = utcDay(now);
  const services = new Map(SERVICES.map((service) => [service.key, service]));
  const cast = people();
  const refs = new Set<string>();
  const jobs: PlanJob[] = [];
  const ghosts: PlanGhost[] = [];
  const orphans: PlanOrphanPayment[] = [];
  const afterHours: PlanAfterHours[] = [];
  const opens = 360;
  const closes = 1140;
  let serial = 0;

  const dayList: string[] = [];
  for (let back = days; back >= 0; back -= 1) {
    dayList.push(dayKey(new Date(today.getTime() - back * 86_400_000)));
  }

  for (const site of SITES) {
    const workers = cast.filter((person) => person.siteKey === site.key && person.role === 'worker');
    const manager = cast.find((person) => person.siteKey === site.key && person.role === 'manager')!;
    const regulars = Array.from({ length: 45 }, () => plateFrom(random));

    for (let back = days; back >= 0; back -= 1) {
      const day = new Date(today.getTime() - back * 86_400_000);
      const weekday = day.getUTCDay();
      const base = weekday === 6 ? 44 : weekday === 0 ? 36 : 27;
      const arrivals = Math.round(base * site.volume * (0.88 + random() * 0.24));
      const minutes = Array.from({ length: arrivals }, () => arrivalMinute(random, opens, closes)).sort((a, b) => a - b);
      const bayFree = new Map(site.bays.map((bay) => [bay, opens]));

      for (const arrival of minutes) {
        const [bay, free] = [...bayFree.entries()].sort((a, b) => a[1] - b[1])[0]!;
        const start = Math.max(arrival, free);
        const base = random() < 0.6 ? 'basic' : 'premium';
        const keys = [base];
        if (random() < 0.22) keys.push('wax');
        if (random() < 0.12) keys.push('engine');
        if (random() < 0.3) keys.push('tyre');
        const duration = Math.round(18 + random() * 8 + (base === 'premium' ? 10 : 0) + keys.filter((k) => k !== base && k !== 'tyre').length * 9);
        if (start + duration > closes - 5) continue;
        bayFree.set(bay, start + duration + 3);

        const createdAt = atLocal(day, arrival);
        const startedAt = atLocal(day, start);
        const finishedAt = atLocal(day, start + duration);
        if (finishedAt.getTime() > now.getTime() - 6 * 60_000) continue; // not done yet

        const list = keys.reduce((sum, key) => sum + services.get(key)!.listPriceCents, 0);
        const discounted = random() < 0.04;
        const quoted = discounted ? Math.round((list * 0.9) / 100) * 100 : list;
        const cash = random() < site.cashRatio - 0.12;
        const payAt = new Date(finishedAt.getTime() + (cash ? 60_000 : Math.floor(random() * 4 * 60_000)));
        const worker = workers[Math.floor(random() * workers.length)]!;
        const plate = random() < 0.5 ? regulars[Math.floor(random() * regulars.length)]! : plateFrom(random);

        serial += 1;
        jobs.push({
          key: `job-${serial}`,
          siteKey: site.key,
          bay,
          workerKey: worker.key,
          plate,
          serviceKeys: keys,
          listCents: list,
          quotedCents: quoted,
          authorisedByKey: discounted ? manager.key : null,
          state: 'closed',
          createdAt,
          startedAt,
          finishedAt,
          closedAt: new Date(payAt.getTime() + 60_000),
          litres: Math.round(site.litresPerWash * (0.93 + random() * 0.14) * 10) / 10,
          payment: {
            channel: cash ? 'cash' : 'mpesa',
            amountCents: quoted,
            ref: cash ? null : mpesaRef(random, refs),
            msisdn: cash ? null : msisdn(random),
            at: payAt
          }
        });
      }
    }
  }

  // ---- planted frauds ------------------------------------------------------------------
  for (const scenario of SCENARIOS) {
    const site = SITES.find((candidate) => candidate.key === scenario.site)!;
    const day = new Date(today.getTime() - scenario.daysAgo * 86_400_000);
    const key = dayKey(day);
    const dayJobs = jobs.filter((job) => job.siteKey === site.key && dayKey(job.createdAt) === key);
    const count = scenario.count ?? 0;

    switch (scenario.kind) {
      case 'cash_heavy':
        for (const job of dayJobs) {
          if (job.payment && random() < 0.88) {
            job.payment = { channel: 'cash', amountCents: job.payment.amountCents, ref: null, msisdn: null, at: job.payment.at };
          }
        }
        break;
      case 'unpaid':
        dayJobs
          .filter((job) => job.payment)
          .slice(3, 3 + count)
          .forEach((job, index) => {
            job.payment = null;
            job.state = index % 2 === 0 ? 'closed' : 'awaiting_payment';
            if (job.state === 'awaiting_payment') job.closedAt = null;
          });
        break;
      case 'abandoned':
        dayJobs
          .filter((job) => job.workerKey === scenario.worker)
          .slice(0, count)
          .forEach((job) => {
            job.state = 'abandoned';
            job.payment = null;
            job.litres = 0;
            job.closedAt = job.startedAt;
          });
        // the worker has to have opened at least `count` jobs that day to abandon them
        for (let extra = dayJobs.filter((job) => job.workerKey === scenario.worker).length; extra < count; extra += 1) {
          serial += 1;
          const at = atLocal(day, 500 + extra * 37);
          jobs.push({
            key: `job-${serial}`, siteKey: site.key, bay: site.bays[0]!, workerKey: scenario.worker!, plate: plateFrom(random),
            serviceKeys: ['basic'], listCents: 50_000, quotedCents: 50_000, authorisedByKey: null, state: 'abandoned',
            createdAt: at, startedAt: at, finishedAt: at, closedAt: at, litres: 0, payment: null
          });
        }
        break;
      case 'underquote':
        dayJobs
          .filter((job) => job.workerKey === scenario.worker && job.payment)
          .slice(0, count)
          .forEach((job) => {
            const quoted = Math.round((job.listCents * 0.7) / 100) * 100;
            job.quotedCents = quoted;
            job.authorisedByKey = null;
            job.payment = { ...job.payment!, amountCents: quoted };
          });
        break;
      case 'orphan_payments':
        for (let i = 0; i < count; i += 1) {
          orphans.push({ siteKey: site.key, amountCents: [50_000, 80_000, 65_000][i % 3]!, ref: mpesaRef(random, refs), msisdn: msisdn(random), at: atLocal(day, 600 + i * 95) });
        }
        break;
      case 'ghost_washes':
        for (let i = 0; i < count; i += 1) {
          ghosts.push({ siteKey: site.key, bay: site.bays[i % site.bays.length]!, plate: plateFrom(random), at: atLocal(day, 420 + i * 88), minutes: 22, litres: 62 });
        }
        break;
      case 'after_hours':
        afterHours.push({ siteKey: site.key, bay: site.bays[0]!, at: atLocal(day, 22 * 60 + 10), minutes: count * 20, litres: count * 60 });
        break;
    }
  }

  // ---- work in progress right now, so a live demo has something to move ----------------
  const liveSpecs: Array<{ site: string; state: PlanJob['state']; startedAgo: number; finishedAgo: number }> = [
    { site: 'westlands', state: 'in_progress', startedAgo: 9, finishedAgo: -10 },
    { site: 'westlands', state: 'awaiting_payment', startedAgo: 26, finishedAgo: 3 },
    { site: 'kilimani', state: 'in_progress', startedAgo: 4, finishedAgo: -16 },
    { site: 'thika', state: 'awaiting_payment', startedAgo: 31, finishedAgo: 5 }
  ];
  for (const spec of liveSpecs) {
    const site = SITES.find((candidate) => candidate.key === spec.site)!;
    const worker = cast.find((person) => person.siteKey === site.key && person.role === 'worker')!;
    serial += 1;
    const created = new Date(now.getTime() - (spec.startedAgo + 2) * 60_000);
    jobs.push({
      key: `job-${serial}`, siteKey: site.key, bay: site.bays[serial % site.bays.length]!, workerKey: worker.key, plate: plateFrom(random),
      serviceKeys: ['basic'], listCents: 50_000, quotedCents: 50_000, authorisedByKey: null, state: spec.state,
      createdAt: created, startedAt: new Date(now.getTime() - spec.startedAgo * 60_000), finishedAt: new Date(now.getTime() - spec.finishedAgo * 60_000),
      closedAt: null, litres: 0, payment: null
    });
  }

  return { today, services: SERVICES, sites: SITES, people: cast, jobs, ghosts, orphans, afterHours, days: dayList };
}

/** One site-day of the plan, shaped as the reconciliation engine's input (tests only). */
export function toReconciliationInput(plan: DemoPlan, siteKey: string, day: string): ReconciliationInput {
  const site = plan.sites.find((candidate) => candidate.key === siteKey)!;
  const inDay = (date: Date) => dayKey(date) === day;
  const jobs = plan.jobs.filter((job) => job.siteKey === siteKey && inDay(job.createdAt));
  const payments: PaymentRecord[] = [];
  const records: JobRecord[] = jobs.map((job) => {
    if (job.payment) {
      payments.push({ id: `pay-${job.key}`, siteId: siteKey, channel: job.payment.channel, amount: cents(job.payment.amountCents), externalRef: job.payment.ref, jobId: job.key, receivedAt: job.payment.at });
    }
    return {
      id: job.key, siteId: siteKey, bayId: job.bay, workerId: job.workerKey, state: job.state,
      quotedTotal: cents(job.quotedCents), listTotal: cents(job.listCents), createdAt: job.createdAt, closedAt: job.closedAt,
      serviceIds: job.serviceKeys, discountAuthorisedBy: job.authorisedByKey
    };
  });
  for (const orphan of plan.orphans.filter((o) => o.siteKey === siteKey && inDay(o.at))) {
    payments.push({ id: `orphan-${orphan.ref}`, siteId: siteKey, channel: 'mpesa', amount: cents(orphan.amountCents), externalRef: orphan.ref, jobId: null, receivedAt: orphan.at });
  }

  const hourly = new Map<string, TelemetryWindow>();
  const addWater = (bay: string, at: Date, minutes: number, litres: number) => {
    for (let m = 0; m < Math.max(1, minutes); m += 1) {
      const minuteAt = new Date(at.getTime() + m * 60_000);
      if (!inDay(minuteAt)) continue;
      const from = new Date(Math.floor(minuteAt.getTime() / 3_600_000) * 3_600_000);
      const key = `${bay}|${from.toISOString()}`;
      const window = hourly.get(key) ?? { siteId: siteKey, bayId: bay, from, to: new Date(from.getTime() + 3_600_000), litres: 0, pumpRuntimeSeconds: 0, machineCycles: 0 };
      window.litres += litres / Math.max(1, minutes);
      hourly.set(key, window);
    }
  };
  for (const job of jobs) if (job.litres > 0) addWater(job.bay, job.startedAt, Math.round((job.finishedAt.getTime() - job.startedAt.getTime()) / 60_000), job.litres);
  for (const ghost of plan.ghosts.filter((g) => g.siteKey === siteKey && inDay(g.at))) addWater(ghost.bay, ghost.at, ghost.minutes, ghost.litres);
  for (const late of plan.afterHours.filter((a) => a.siteKey === siteKey && inDay(a.at))) addWater(late.bay, late.at, late.minutes, late.litres);

  const observations: VehicleObservation[] = [
    ...jobs.filter((job) => job.state !== 'abandoned').map((job) => ({ siteId: siteKey, observedAt: new Date(job.createdAt.getTime() - 3 * 60_000), plateNormalised: job.plate.replace(/\s/g, ''), direction: 'entry' as const })),
    ...plan.ghosts.filter((g) => g.siteKey === siteKey && inDay(g.at)).map((g) => ({ siteId: siteKey, observedAt: g.at, plateNormalised: g.plate.replace(/\s/g, ''), direction: 'entry' as const }))
  ];

  return {
    siteId: siteKey,
    siteName: site.name,
    day: new Date(`${day}T00:00:00Z`),
    timezone: 'Africa/Nairobi',
    operatingHours: { opensMinute: 360, closesMinute: 1140, daysOpen: [0, 1, 2, 3, 4, 5, 6] },
    baseline: { siteId: siteKey, litresPerWash: site.litresPerWash, litresPerWashTolerance: 0.1, cashRatio: site.cashRatio, discountRateByWorker: {}, consumablePerWash: {} },
    jobs: records,
    payments,
    telemetry: [...hourly.values()],
    observations,
    consumables: []
  };
}
