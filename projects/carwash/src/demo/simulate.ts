/**
 * A live feed for demos. It plays the people and devices of the three demo sites against the
 * real services, over HTTP, exactly as production would drive them:
 *
 *   - a gate camera posts plate captures to the ingestion service;
 *   - a worker signs in and records each job through the job API;
 *   - flow meters post water readings to the ingestion service while the wash runs;
 *   - the customer's payment arrives as a Daraja C2B callback (mock mode: a POST with the shared
 *     secret, no real money anywhere) or the worker declares cash.
 *
 * A small share of visits misbehave on purpose (an unrecorded wash, an under-quote, a wash never
 * paid, a payment with no job) so the flags on the console move too.
 *
 *   npm run demo:simulate                      run until Ctrl-C
 *   npm run demo:simulate -- --minutes 5       run for five minutes and print a summary
 *   flags: --tick 8 (seconds between arrivals) --mischief 0.15 (share of visits that misbehave)
 *
 * Environment: API_URL, INGESTION_URL, MPESA_CALLBACK_SECRET (same value the API runs with).
 */
import { DEMO_PIN, demoSecret, generatePlan } from './plan';

const API = process.env.API_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? 4000}`;
const INGESTION = process.env.INGESTION_URL ?? `http://127.0.0.1:${process.env.INGESTION_PORT ?? 4100}`;
const CALLBACK_SECRET = process.env.MPESA_CALLBACK_SECRET ?? '';

function flag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

const TICK_MS = flag('tick', 8) * 1000;
const MISCHIEF = flag('mischief', 0.15);
const RUN_MINUTES = flag('minutes', 0);
const STEP_MS = 5000;

const tally = { visits: 0, jobs: 0, mpesa: 0, cash: 0, ghost: 0, underquoted: 0, unpaid: 0, orphan: 0, readings: 0, errors: 0 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)]!;

async function call<T>(base: string, path: string, init: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...(init.headers ?? {})
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${text.slice(0, 200)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function login(phone: string): Promise<string> {
  return (await call<{ token: string }>(API, '/v1/auth/login', { body: { phone, pin: DEMO_PIN } })).token;
}

function plate(): string {
  const l = (set: string) => set[Math.floor(Math.random() * set.length)]!;
  return `K${l('ABCD')}${l('ABCDEFGHJKLMNPRSTUVWXYZ')} ${Math.floor(Math.random() * 900) + 100}${l('ABCDEFGHJKLMNPRSTUVWXYZ')}`;
}

function transTime(at: Date): string {
  const eat = new Date(at.getTime() + 3 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${eat.getUTCFullYear()}${p(eat.getUTCMonth() + 1)}${p(eat.getUTCDate())}${p(eat.getUTCHours())}${p(eat.getUTCMinutes())}${p(eat.getUTCSeconds())}`;
}

interface SimDevice {
  id: string;
  secret: string;
  sequence: number;
}

interface SimSite {
  key: string;
  id: string;
  name: string;
  till: string;
  workerToken: string;
  bays: Array<{ label: string; busy: boolean; meter: SimDevice }>;
  camera: SimDevice;
}

interface Service {
  id: string;
  name: string;
  listPriceCents: number;
  expectedWaterL: number;
  active: boolean;
}

async function bootstrap(): Promise<{ sites: SimSite[]; services: Service[]; ownerToken: string }> {
  const plan = generatePlan({ now: new Date() });
  const ownerToken = await login('254700000001');
  const sites = await call<Array<{ id: string; name: string; tillNumber: string }>>(API, '/v1/sites', { token: ownerToken });
  const services = (await call<Service[]>(API, '/v1/services', { token: ownerToken })).filter((s) => s.active);
  const devices = await call<Array<{ id: string; type: string; site: string; bay: string | null; lastSequence: number }>>(API, '/v1/devices', { token: ownerToken });

  const out: SimSite[] = [];
  for (const site of sites) {
    const planSite = plan.sites.find((candidate) => candidate.name === site.name);
    if (!planSite) continue;
    const worker = plan.people.find((person) => person.siteKey === planSite.key && person.role === 'worker')!;
    const detail = await call<{ bays: Array<{ label: string }> }>(API, `/v1/sites/${site.id}`, { token: ownerToken });
    const mine = devices.filter((device) => device.site === site.name);
    const camera = mine.find((device) => device.type === 'camera');
    if (!camera) continue;
    out.push({
      key: planSite.key,
      id: site.id,
      name: site.name,
      till: site.tillNumber,
      workerToken: await login(worker.phone),
      camera: { id: camera.id, secret: demoSecret(planSite.key, 'gate', 'camera'), sequence: camera.lastSequence },
      bays: detail.bays.flatMap((bay) => {
        const meter = mine.find((device) => device.type === 'flow_meter' && device.bay === bay.label);
        return meter ? [{ label: bay.label, busy: false, meter: { id: meter.id, secret: demoSecret(planSite.key, bay.label, 'flow_meter'), sequence: meter.lastSequence } }] : [];
      })
    });
  }
  return { sites: out, services, ownerToken };
}

async function postReadings(device: SimDevice, readings: Array<{ metric: string; value: number }>): Promise<void> {
  const ts = new Date();
  ts.setUTCMilliseconds(0);
  await call(INGESTION, '/v1/telemetry', {
    headers: { 'x-device-id': device.id, 'x-device-secret': device.secret },
    body: {
      deviceId: device.id,
      readings: readings.map((reading) => ({ sequence: ++device.sequence, ts: ts.toISOString(), metric: reading.metric, value: reading.value }))
    }
  });
  tally.readings += readings.length;
}

async function camera(site: SimSite, direction: 'entry' | 'exit', plateText: string): Promise<void> {
  await call(INGESTION, '/v1/plates', {
    headers: { 'x-device-id': site.camera.id, 'x-device-secret': site.camera.secret },
    body: { deviceId: site.camera.id, captures: [{ ts: new Date().toISOString(), plate: plateText, confidence: 0.9, direction }] }
  });
}

async function runWater(site: SimSite, bay: SimSite['bays'][number], litres: number, seconds: number): Promise<void> {
  const steps = Math.max(1, Math.round((seconds * 1000) / STEP_MS));
  for (let step = 0; step < steps; step += 1) {
    await postReadings(bay.meter, [
      { metric: 'water_litres', value: Math.round((litres / steps) * 100) / 100 },
      { metric: 'pump_seconds', value: Math.round(seconds / steps) }
    ]);
    await sleep(STEP_MS);
  }
}

async function mpesaCallback(site: SimSite, amountCents: number, billRef: string): Promise<void> {
  const ref = `S${Math.random().toString(36).slice(2, 11).toUpperCase()}`;
  await call(API, '/v1/webhooks/mpesa/confirmation', {
    headers: { 'x-callback-secret': CALLBACK_SECRET },
    body: {
      TransactionType: 'Pay Bill',
      TransID: ref,
      TransTime: transTime(new Date()),
      TransAmount: amountCents / 100,
      BusinessShortCode: site.till,
      BillRefNumber: billRef,
      MSISDN: `2547${Math.floor(Math.random() * 90_000_000) + 10_000_000}`,
      FirstName: 'Demo'
    }
  });
}

async function visit(site: SimSite, services: Service[]): Promise<void> {
  const bay = site.bays.find((candidate) => !candidate.busy);
  if (!bay) return; // every bay is busy: the customer drives off, as they do
  bay.busy = true;
  tally.visits += 1;
  const vehicle = plate();
  const dice = Math.random();
  const mischief = dice < MISCHIEF;
  const kind = mischief ? pick(['ghost', 'underquote', 'unpaid', 'orphan']) : 'normal';
  const seconds = 40 + Math.floor(Math.random() * 40);
  const litres = Math.round(60 * (0.94 + Math.random() * 0.12) * 10) / 10;

  try {
    await camera(site, 'entry', vehicle);

    if (kind === 'ghost') {
      // The wash happens; nobody records a job.
      tally.ghost += 1;
      await runWater(site, bay, litres, seconds);
      await camera(site, 'exit', vehicle);
      return;
    }

    const base = pick(services.filter((service) => service.expectedWaterL > 0));
    const extras = services.filter((service) => service.expectedWaterL === 0 && Math.random() < 0.2);
    const chosen = [base, ...extras];
    const list = chosen.reduce((sum, service) => sum + service.listPriceCents, 0);
    const quoted = kind === 'underquote' ? Math.round((list * 0.7) / 100) * 100 : list;
    if (kind === 'underquote') tally.underquoted += 1;

    const job = await call<{ id: string }>(API, '/v1/jobs', {
      token: site.workerToken,
      body: { bayId: null, plate: vehicle, serviceIds: chosen.map((service) => service.id), quotedTotalCents: quoted }
    });
    tally.jobs += 1;
    await call(API, `/v1/jobs/${job.id}/events`, { token: site.workerToken, body: { type: 'started' } });
    await runWater(site, bay, litres, seconds);
    await call(API, `/v1/jobs/${job.id}/events`, { token: site.workerToken, body: { type: 'work_finished' } });

    if (kind === 'unpaid') {
      tally.unpaid += 1;
      await camera(site, 'exit', vehicle);
      return; // left awaiting payment
    }

    if (Math.random() < 0.25) {
      await call(API, `/v1/jobs/${job.id}/cash`, { token: site.workerToken, body: { amountCents: quoted } });
      tally.cash += 1;
    } else {
      await sleep(1500 + Math.random() * 2500);
      await mpesaCallback(site, quoted, Math.random() < 0.7 ? vehicle : '');
      tally.mpesa += 1;
    }
    await call(API, `/v1/jobs/${job.id}/events`, { token: site.workerToken, body: { type: 'closed' } }).catch(() => undefined);
    if (kind === 'orphan') {
      tally.orphan += 1;
      await mpesaCallback(site, [50_000, 65_000, 80_000][Math.floor(Math.random() * 3)]!, 'NOREF');
    }
    await camera(site, 'exit', vehicle);
  } catch (error) {
    tally.errors += 1;
    console.error(`  ! ${site.name}: ${error instanceof Error ? error.message : error}`);
  } finally {
    bay.busy = false;
  }
}

function report(): void {
  console.log(
    `  visits ${tally.visits} | jobs ${tally.jobs} | mpesa ${tally.mpesa} | cash ${tally.cash} | readings ${tally.readings} | ` +
      `ghost ${tally.ghost} under-quoted ${tally.underquoted} unpaid ${tally.unpaid} orphan ${tally.orphan} | errors ${tally.errors}`
  );
}

async function main(): Promise<void> {
  if (CALLBACK_SECRET.length < 16) {
    throw new Error('set MPESA_CALLBACK_SECRET to the value the API runs with (16+ characters)');
  }
  console.log(`Forecourt live simulator -> api ${API}, ingestion ${INGESTION}`);
  const { sites, services, ownerToken } = await bootstrap();
  if (sites.length === 0) throw new Error('no demo sites found; run `npm run demo:seed` first');
  console.log(`  ${sites.map((s) => `${s.name} (${s.bays.length} bays)`).join(', ')}. Ctrl-C to stop.\n`);

  const today = () => new Date().toISOString().slice(0, 10);
  let stopping = false;
  const inFlight = new Set<Promise<void>>();
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });

  const closer = setInterval(async () => {
    for (const site of sites) {
      await call(API, '/v1/sites/close', { token: ownerToken, body: { siteId: site.id, day: today() } }).catch(() => undefined);
    }
    report();
  }, 45_000);

  const deadline = RUN_MINUTES > 0 ? Date.now() + RUN_MINUTES * 60_000 : Infinity;
  while (!stopping && Date.now() < deadline) {
    const site = pick(sites);
    const task = visit(site, services).finally(() => inFlight.delete(task));
    inFlight.add(task);
    await sleep(TICK_MS * (0.6 + Math.random() * 0.8));
  }

  clearInterval(closer);
  console.log('\nFinishing visits in flight...');
  await Promise.allSettled([...inFlight]);
  for (const site of sites) {
    await call(API, '/v1/sites/close', { token: ownerToken, body: { siteId: site.id, day: today() } }).catch(() => undefined);
  }
  report();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
