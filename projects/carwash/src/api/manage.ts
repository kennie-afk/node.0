/**
 * Write side of the console: sites, bays, price list, team, and resolving flags; plus the job
 * API a worker's device uses to record the work ledger. Every query runs through `withOrg`, so
 * row-level security confines it to the caller's organisation whatever the SQL says.
 */
import { Router, Request } from 'express';
import bcrypt from 'bcrypt';
import { z, ZodType } from 'zod';
import { withOrg } from '../persistence/pool';
import { authenticate, requireRole, requireWritable } from './middleware';
import { payShortcode } from '../billing/service';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../domain/errors';
import { assertTransition, EVENT_RESULTING_STATE, JobEventType, JobState } from '../domain/job';
import { normalisePlate } from '../domain/plate';
import { insertPayment, recordJobEvent, transitionJob } from '../persistence/repositories';
import { DEVICE_TYPES, phoneInUse, registerDevice } from '../admin/provisioning';
import { normalisePhone } from '../admin/phone';
import { accounts } from './accounts';
import { listSite } from './scope';
import { usersPage } from '../persistence/listings';
import { sendArray } from './respond';
import { afterClause, decodeCursor, keySelect, orderBy, parseLimit, SortColumn } from '../persistence/paging';

const router = Router();
const owner = requireRole('owner');
const uuid = z.string().uuid();

function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestError(
      result.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ')
    );
  }
  return result.data;
}

function idParam(req: Request): string {
  return parse(uuid, req.params.id);
}

// ---- sites and bays --------------------------------------------------------------------------

const siteFields = {
  name: z.string().trim().min(2).max(120),
  timezone: z.string().min(3).max(60),
  tillNumber: z.string().trim().min(3).max(20).nullable(),
  opensMinute: z.number().int().min(0).max(1439),
  closesMinute: z.number().int().min(1).max(1440),
  daysOpen: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  litresPerWash: z.number().positive().max(2000),
  cashRatio: z.number().min(0).max(1)
};

const siteCreate = z.object({ ...siteFields, timezone: siteFields.timezone.default('Africa/Nairobi'), tillNumber: siteFields.tillNumber.optional() }).partial({
  opensMinute: true,
  closesMinute: true,
  daysOpen: true,
  litresPerWash: true,
  cashRatio: true
});
const siteUpdate = z.object(siteFields).partial();

/** Forecourt's own billing shortcode must never be claimed as a car wash's till. */
function checkTill(till: string | null | undefined): void {
  const billing = payShortcode();
  if (till && billing && till === billing) {
    throw new BadRequestError('That number is reserved. Use your own till or paybill number.');
  }
}

function checkHours(opens?: number, closes?: number): void {
  if (opens !== undefined && closes !== undefined && closes <= opens) {
    throw new BadRequestError('closesMinute must be later than opensMinute');
  }
}

function siteDto(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    tillNumber: row.till_number,
    opensMinute: row.opens_minute,
    closesMinute: row.closes_minute,
    daysOpen: row.days_open,
    litresPerWash: Number(row.litres_per_wash),
    cashRatio: Number(row.cash_ratio)
  };
}

router.post('/sites', authenticate, owner, requireWritable, async (req, res, next) => {
  try {
    const body = parse(siteCreate, req.body);
    checkHours(body.opensMinute, body.closesMinute);
    checkTill(body.tillNumber);
    const row = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO sites (org_id, name, timezone, till_number, opens_minute, closes_minute, days_open, litres_per_wash, cash_ratio)
         VALUES ($1, $2, $3, $4, COALESCE($5, 360), COALESCE($6, 1140), COALESCE($7::int[], '{0,1,2,3,4,5,6}'), COALESCE($8, 60), COALESCE($9, 0.1))
         RETURNING *`,
        [req.principal!.orgId, body.name, body.timezone, body.tillNumber ?? null, body.opensMinute ?? null, body.closesMinute ?? null, body.daysOpen ?? null, body.litresPerWash ?? null, body.cashRatio ?? null]
      );
      await client.query(`INSERT INTO bays (org_id, site_id, label) VALUES ($1, $2, 'Bay 1')`, [req.principal!.orgId, rows[0].id]);
      return rows[0];
    });
    res.status(201).json(siteDto(row));
  } catch (error) {
    next(error);
  }
});

router.get('/sites/:id', authenticate, async (req, res, next) => {
  try {
    const id = idParam(req);
    if (req.principal!.siteId && req.principal!.siteId !== id) throw new NotFoundError('That site was not found.');
    const data = await withOrg(req.principal!.orgId, async (client) => {
      const site = await client.query('SELECT * FROM sites WHERE id = $1', [id]);
      if (!site.rows[0]) return null;
      const bays = await client.query(
        `SELECT b.id, b.label, (SELECT count(*) FROM devices d WHERE d.bay_id = b.id) AS devices,
                (SELECT count(*) FROM jobs j WHERE j.bay_id = b.id) AS jobs
           FROM bays b WHERE b.site_id = $1 ORDER BY b.label`,
        [id]
      );
      return { site: site.rows[0], bays: bays.rows };
    });
    if (!data) throw new NotFoundError('That site was not found.');
    res.json({
      ...siteDto(data.site),
      bays: data.bays.map((bay) => ({ id: bay.id, label: bay.label, devices: Number(bay.devices), jobs: Number(bay.jobs) }))
    });
  } catch (error) {
    next(error);
  }
});

router.put('/sites/:id', authenticate, owner, requireWritable, async (req, res, next) => {
  try {
    const id = idParam(req);
    const body = parse(siteUpdate, req.body);
    checkTill(body.tillNumber);
    const row = await withOrg(req.principal!.orgId, async (client) => {
      const current = await client.query('SELECT * FROM sites WHERE id = $1', [id]);
      const existing = current.rows[0];
      if (!existing) return null;
      checkHours(body.opensMinute ?? existing.opens_minute, body.closesMinute ?? existing.closes_minute);
      const { rows } = await client.query(
        `UPDATE sites SET name = $2, timezone = $3, till_number = $4, opens_minute = $5, closes_minute = $6,
                days_open = $7, litres_per_wash = $8, cash_ratio = $9 WHERE id = $1 RETURNING *`,
        [
          id,
          body.name ?? existing.name,
          body.timezone ?? existing.timezone,
          body.tillNumber === undefined ? existing.till_number : body.tillNumber,
          body.opensMinute ?? existing.opens_minute,
          body.closesMinute ?? existing.closes_minute,
          body.daysOpen ?? existing.days_open,
          body.litresPerWash ?? existing.litres_per_wash,
          body.cashRatio ?? existing.cash_ratio
        ]
      );
      return rows[0];
    });
    if (!row) throw new NotFoundError('That site was not found.');
    res.json(siteDto(row));
  } catch (error) {
    next(error);
  }
});

const bayBody = z.object({ label: z.string().trim().min(1).max(40) });

router.post('/sites/:id/bays', authenticate, owner, requireWritable, async (req, res, next) => {
  try {
    const siteId = idParam(req);
    const { label } = parse(bayBody, req.body);
    const row = await withOrg(req.principal!.orgId, async (client) => {
      const site = await client.query('SELECT id FROM sites WHERE id = $1', [siteId]);
      if (!site.rows[0]) throw new NotFoundError('That site was not found.');
      const dup = await client.query('SELECT 1 FROM bays WHERE site_id = $1 AND lower(label) = lower($2)', [siteId, label]);
      if (dup.rows[0]) throw new ConflictError(`${label} already exists at this site`);
      const { rows } = await client.query('INSERT INTO bays (org_id, site_id, label) VALUES ($1, $2, $3) RETURNING id, label', [req.principal!.orgId, siteId, label]);
      return rows[0];
    });
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

router.put('/bays/:id', authenticate, owner, requireWritable, async (req, res, next) => {
  try {
    const { label } = parse(bayBody, req.body);
    const row = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query('UPDATE bays SET label = $2 WHERE id = $1 RETURNING id, label', [idParam(req), label]);
      return rows[0];
    });
    if (!row) throw new NotFoundError('That bay was not found.');
    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.delete('/bays/:id', authenticate, owner, requireWritable, async (req, res, next) => {
  try {
    const removed = await withOrg(req.principal!.orgId, async (client) => {
      const jobs = await client.query('SELECT count(*) AS n FROM jobs WHERE bay_id = $1', [idParam(req)]);
      if (Number(jobs.rows[0].n) > 0) {
        throw new ConflictError('That bay has recorded jobs, so it is kept for the history. Rename it instead.');
      }
      const { rowCount } = await client.query('DELETE FROM bays WHERE id = $1', [idParam(req)]);
      return rowCount ?? 0;
    });
    if (removed === 0) throw new NotFoundError('That bay was not found.');
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ---- price list ------------------------------------------------------------------------------

const serviceFields = {
  name: z.string().trim().min(2).max(120),
  listPriceCents: z.number().int().min(0).max(100_000_000),
  expectedWaterL: z.number().min(0).max(5000),
  expectedDurationS: z.number().int().min(0).max(86_400),
  commissionRate: z.number().min(0).max(1),
  // what one wash of this service is expected to draw, e.g. { detergent: 0.05 }: the baseline supply_pilferage needs
  consumables: z.record(z.string().trim().min(1).max(60), z.number().min(0).max(10_000)).refine((value) => Object.keys(value).length <= 30, 'at most 30 consumables'),
  active: z.boolean()
};
const serviceCreate = z.object(serviceFields).partial({ expectedWaterL: true, expectedDurationS: true, commissionRate: true, consumables: true, active: true });
const serviceUpdate = z.object(serviceFields).partial();
const SERVICE_COLUMNS: SortColumn[] = [
  { sql: 's.active', dir: 'desc', type: 'boolean' },
  { sql: 's.list_price_cents', dir: 'asc', type: 'bigint' },
  { sql: 's.id', dir: 'asc', type: 'uuid' }
];

function serviceDto(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    listPriceCents: Number(row.list_price_cents),
    expectedWaterL: Number(row.expected_water_l),
    expectedDurationS: row.expected_duration_s,
    commissionRate: Number(row.commission_rate),
    consumables: (row.consumables ?? {}) as Record<string, number>,
    active: row.active
  };
}

router.get('/services', authenticate, async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 200, 500);
    const cursor = decodeCursor(req.query.after, 3);
    const params: unknown[] = [];
    const after = afterClause(SERVICE_COLUMNS, cursor, params);
    params.push(limit + 1);
    const rows = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query(
        `SELECT s.*, (SELECT count(*) FROM job_services js WHERE js.service_id = s.id) AS uses, ${keySelect(SERVICE_COLUMNS)}
           FROM services s ${after ? `WHERE ${after}` : ''} ORDER BY ${orderBy(SERVICE_COLUMNS)} LIMIT $${params.length}`,
        params
      );
      return rows;
    });
    // an array, not an envelope: every dropdown in the console reads this list; the cursor is in X-Next-Cursor
    sendArray(res, rows, limit, SERVICE_COLUMNS, (row) => ({ ...serviceDto(row), uses: Number(row.uses) }));
  } catch (error) {
    next(error);
  }
});

router.post('/services', authenticate, owner, requireWritable, async (req, res, next) => {
  try {
    const body = parse(serviceCreate, req.body);
    const row = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO services (org_id, name, list_price_cents, expected_water_l, expected_duration_s, commission_rate, active, consumables)
         VALUES ($1, $2, $3, COALESCE($4, 0), COALESCE($5, 0), COALESCE($6, 0.1), COALESCE($7, true), COALESCE($8::jsonb, '{}'::jsonb)) RETURNING *`,
        [req.principal!.orgId, body.name, body.listPriceCents, body.expectedWaterL ?? null, body.expectedDurationS ?? null, body.commissionRate ?? null, body.active ?? null, body.consumables ? JSON.stringify(body.consumables) : null]
      );
      return rows[0];
    });
    res.status(201).json(serviceDto(row));
  } catch (error) {
    next(error);
  }
});

// A price change applies to jobs opened from now on; jobs already recorded keep the price they
// were quoted at, because job_services stores the unit price it was sold at.
router.put('/services/:id', authenticate, owner, requireWritable, async (req, res, next) => {
  try {
    const body = parse(serviceUpdate, req.body);
    const row = await withOrg(req.principal!.orgId, async (client) => {
      const current = await client.query('SELECT * FROM services WHERE id = $1', [idParam(req)]);
      const e = current.rows[0];
      if (!e) return null;
      const { rows } = await client.query(
        `UPDATE services SET name = $2, list_price_cents = $3, expected_water_l = $4, expected_duration_s = $5,
                commission_rate = $6, active = $7, consumables = $8::jsonb WHERE id = $1 RETURNING *`,
        [idParam(req), body.name ?? e.name, body.listPriceCents ?? e.list_price_cents, body.expectedWaterL ?? e.expected_water_l, body.expectedDurationS ?? e.expected_duration_s, body.commissionRate ?? e.commission_rate, body.active ?? e.active, JSON.stringify(body.consumables ?? e.consumables ?? {})]
      );
      return rows[0];
    });
    if (!row) throw new NotFoundError('That service was not found.');
    res.json(serviceDto(row));
  } catch (error) {
    next(error);
  }
});

// ---- team ------------------------------------------------------------------------------------

const roles = ['owner', 'manager', 'supervisor', 'worker', 'support'] as const;
const userCreate = z.object({
  displayName: z.string().trim().min(2).max(120),
  phone: z.string().min(6).max(20),
  pin: z.string().min(4).max(64),
  role: z.enum(roles),
  siteId: uuid.nullable().optional()
});
const userUpdate = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  role: z.enum(roles).optional(),
  siteId: uuid.nullable().optional(),
  status: z.enum(['active', 'suspended']).optional(),
  pin: z.string().min(4).max(64).optional()
});

function userDto(row: Record<string, any>) {
  return {
    id: row.id,
    displayName: row.display_name,
    phone: row.phone,
    role: row.role,
    siteId: row.site_id,
    site: row.site ?? null,
    status: row.status
  };
}

const USER_SELECT = `SELECT u.id, u.display_name, u.phone, u.role, u.site_id, u.status, s.name AS site
                       FROM users u LEFT JOIN sites s ON s.id = u.site_id`;

router.get('/users', authenticate, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    res.json(await withOrg(req.principal!.orgId, (client) => usersPage(client, { siteId: listSite(req) }, req.query)));
  } catch (error) {
    next(error);
  }
});

router.get('/users/:id', authenticate, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const rows = await withOrg(req.principal!.orgId, async (client) => (await client.query(`${USER_SELECT} WHERE u.id = $1`, [idParam(req)])).rows);
    if (!rows[0]) throw new NotFoundError('That person was not found.');
    if (req.principal!.siteId && rows[0].site_id !== req.principal!.siteId) throw new NotFoundError('That person was not found.');
    res.json(userDto(rows[0]));
  } catch (error) {
    next(error);
  }
});

router.post('/users', authenticate, owner, requireWritable, async (req, res, next) => {
  try {
    const body = parse(userCreate, req.body);
    let phone: string;
    try {
      phone = normalisePhone(body.phone);
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
    if (await phoneInUse(phone)) throw new ConflictError(`${phone} already belongs to an account`);
    const pinHash = await bcrypt.hash(body.pin, 10);
    const id = await withOrg(req.principal!.orgId, async (client) => {
      if (body.siteId) {
        const site = await client.query('SELECT 1 FROM sites WHERE id = $1', [body.siteId]);
        if (!site.rows[0]) throw new BadRequestError('siteId does not refer to a site in this organisation');
      }
      const { rows } = await client.query(
        `INSERT INTO users (org_id, site_id, role, display_name, phone, pin_hash) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [req.principal!.orgId, body.siteId ?? null, body.role, body.displayName, phone, pinHash]
      );
      return rows[0].id as string;
    });
    const rows = await withOrg(req.principal!.orgId, async (client) => (await client.query(`${USER_SELECT} WHERE u.id = $1`, [id])).rows);
    res.status(201).json(userDto(rows[0]));
  } catch (error) {
    next(error);
  }
});

router.put('/users/:id', authenticate, owner, requireWritable, async (req, res, next) => {
  try {
    const id = idParam(req);
    const body = parse(userUpdate, req.body);
    const pinHash = body.pin ? await bcrypt.hash(body.pin, 10) : null;
    const row = await withOrg(req.principal!.orgId, async (client) => {
      const current = await client.query('SELECT * FROM users WHERE id = $1', [id]);
      const existing = current.rows[0];
      if (!existing) return null;
      const losesOwner = existing.role === 'owner' && existing.status === 'active' && ((body.role && body.role !== 'owner') || body.status === 'suspended');
      if (losesOwner) {
        const owners = await client.query(`SELECT count(*) AS n FROM users WHERE role = 'owner' AND status = 'active' AND id <> $1`, [id]);
        if (Number(owners.rows[0].n) === 0) throw new ForbiddenError('An organisation must keep at least one active owner.');
      }
      if (body.siteId) {
        const site = await client.query('SELECT 1 FROM sites WHERE id = $1', [body.siteId]);
        if (!site.rows[0]) throw new BadRequestError('siteId does not refer to a site in this organisation');
      }
      const nextRole = body.role ?? existing.role;
      const nextSite = body.siteId === undefined ? existing.site_id : body.siteId;
      const nextStatus = body.status ?? existing.status;
      // a change to what the person may do ends their sessions, so it is honoured now and not at token expiry
      const sessionAffected = pinHash !== null || nextRole !== existing.role || nextSite !== existing.site_id || nextStatus !== existing.status;
      await client.query(
        `UPDATE users SET display_name = $2, role = $3, site_id = $4, status = $5, pin_hash = COALESCE($6, pin_hash),
                token_version = token_version + $7::int, pin_changed_at = CASE WHEN $6::text IS NULL THEN pin_changed_at ELSE now() END WHERE id = $1`,
        [id, body.displayName ?? existing.display_name, nextRole, nextSite, nextStatus, pinHash, sessionAffected ? 1 : 0]
      );
      return (await client.query(`${USER_SELECT} WHERE u.id = $1`, [id])).rows[0];
    });
    if (!row) throw new NotFoundError('That person was not found.');
    accounts.invalidate(req.principal!.orgId, id);
    res.json(userDto(row));
  } catch (error) {
    next(error);
  }
});

const deviceCreate = z.object({
  siteId: uuid,
  bayId: uuid.nullable().optional(),
  type: z.enum(DEVICE_TYPES),
  firmware: z.string().max(40).optional()
});

// The secret is in this response and nowhere else, ever: it is stored only as a hash.
router.post('/devices', authenticate, owner, requireWritable, async (req, res, next) => {
  try {
    const body = parse(deviceCreate, req.body);
    const device = await registerDevice(req.principal!.orgId, body);
    res.status(201).json({ id: device.id, secret: device.secret, note: 'Copy the secret now. It cannot be shown again.' });
  } catch (error) {
    next(error);
  }
});

// ---- devices ---------------------------------------------------------------------

router.get('/devices', authenticate, requireRole('owner', 'manager', 'supervisor', 'support'), async (req, res, next) => {
  try {
    const rows = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query(
        `SELECT d.id, d.type, d.firmware, d.status, d.last_seen, d.last_sequence, s.name AS site, b.label AS bay
           FROM devices d JOIN sites s ON s.id = d.site_id LEFT JOIN bays b ON b.id = d.bay_id
          WHERE ($1::uuid IS NULL OR d.site_id = $1)
          ORDER BY s.name, b.label, d.type`,
        [listSite(req)]
      );
      return rows;
    });
    res.json(
      rows.map((row) => ({
        id: row.id,
        type: row.type,
        firmware: row.firmware,
        status: row.status,
        lastSeen: row.last_seen,
        lastSequence: Number(row.last_sequence),
        site: row.site,
        bay: row.bay
      }))
    );
  } catch (error) {
    next(error);
  }
});

// ---- flags -----------------------------------------------------------------------------------

const resolveBody = z.object({
  state: z.enum(['open', 'explained', 'confirmed', 'dismissed']),
  note: z.string().trim().max(2000).optional()
});

router.get('/discrepancies/:id', authenticate, requireRole('owner', 'manager', 'supervisor', 'support'), async (req, res, next) => {
  try {
    const row = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query(
        `SELECT d.*, s.name AS site, u.display_name AS resolver
           FROM discrepancies d JOIN sites s ON s.id = d.site_id LEFT JOIN users u ON u.id = d.resolved_by
          WHERE d.id = $1`,
        [idParam(req)]
      );
      return rows[0];
    });
    if (!row || (req.principal!.siteId && row.site_id !== req.principal!.siteId)) throw new NotFoundError('That flag was not found.');
    res.json({
      id: row.id,
      type: row.type,
      severity: row.severity,
      estimatedCents: Number(row.est_value_cents),
      summary: row.summary,
      evidence: row.evidence,
      state: row.state,
      businessDay: row.business_day,
      site: row.site,
      siteId: row.site_id,
      resolvedBy: row.resolver,
      resolutionNote: row.resolution_note
    });
  } catch (error) {
    next(error);
  }
});

router.post('/discrepancies/:id/resolve', authenticate, requireRole('owner', 'manager'), requireWritable, async (req, res, next) => {
  try {
    const body = parse(resolveBody, req.body);
    if (body.state !== 'open' && !body.note) {
      throw new BadRequestError('note: say what you found, so the next person does not have to ask');
    }
    const row = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query(
        `UPDATE discrepancies SET state = $2, resolved_by = $3, resolution_note = $4
          WHERE id = $1 AND ($5::uuid IS NULL OR site_id = $5) RETURNING id, state`,
        [idParam(req), body.state, body.state === 'open' ? null : req.principal!.userId, body.state === 'open' ? null : body.note ?? null, req.principal!.siteId]
      );
      return rows[0];
    });
    if (!row) throw new NotFoundError('That flag was not found.');
    res.json({ id: row.id, state: row.state });
  } catch (error) {
    next(error);
  }
});

// ---- the work ledger: jobs recorded by a worker's device -------------------------------------

const workerRoles = requireRole('worker', 'supervisor', 'manager', 'owner');

const jobCreate = z.object({
  siteId: uuid.optional(),
  bayId: uuid.nullable().optional(),
  plate: z.string().trim().min(2).max(16).optional(),
  serviceIds: z.array(uuid).min(1).max(10),
  quotedTotalCents: z.number().int().min(0).optional(),
  discountAuthorisedBy: uuid.nullable().optional()
});

router.post('/jobs', authenticate, workerRoles, async (req, res, next) => {
  try {
    const body = parse(jobCreate, req.body);
    const siteId = req.principal!.siteId ?? body.siteId;
    if (!siteId) throw new BadRequestError('siteId: this account is not tied to a site, so say which one');
    if (req.principal!.siteId && body.siteId && body.siteId !== req.principal!.siteId) {
      throw new ForbiddenError('You can only record work at your own site.');
    }
    const created = await withOrg(req.principal!.orgId, async (client) => {
      const site = await client.query('SELECT 1 FROM sites WHERE id = $1', [siteId]);
      if (!site.rows[0]) throw new NotFoundError('That site was not found.');
      const services = await client.query('SELECT id, list_price_cents FROM services WHERE id = ANY($1::uuid[]) AND active', [body.serviceIds]);
      if (services.rows.length !== new Set(body.serviceIds).size) {
        throw new BadRequestError('serviceIds: one or more services do not exist or are switched off');
      }
      const list = services.rows.reduce((sum, row) => sum + Number(row.list_price_cents), 0);

      let vehicleId: string | null = null;
      if (body.plate) {
        const plate = normalisePlate(body.plate);
        const vehicle = await client.query(
          `INSERT INTO vehicles (org_id, plate_raw, plate_normalised, visit_count) VALUES ($1, $2, $3, 1)
           ON CONFLICT (org_id, plate_normalised) DO UPDATE SET visit_count = vehicles.visit_count + 1 RETURNING id`,
          [req.principal!.orgId, body.plate, plate]
        );
        vehicleId = vehicle.rows[0].id;
      }

      const job = await client.query(
        `INSERT INTO jobs (org_id, site_id, bay_id, vehicle_id, worker_id, quoted_total_cents, list_total_cents, discount_authorised_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, state, created_at`,
        [req.principal!.orgId, siteId, body.bayId ?? null, vehicleId, req.principal!.userId, body.quotedTotalCents ?? list, list, body.discountAuthorisedBy ?? null]
      );
      for (const service of services.rows) {
        await client.query('INSERT INTO job_services (org_id, job_id, service_id, unit_price_cents) VALUES ($1,$2,$3,$4)', [req.principal!.orgId, job.rows[0].id, service.id, service.list_price_cents]);
      }
      await recordJobEvent(client, { orgId: req.principal!.orgId, jobId: job.rows[0].id, type: 'job.created', actorId: req.principal!.userId, payload: { listCents: list, quotedCents: body.quotedTotalCents ?? list }, clientTs: null });
      return { id: job.rows[0].id as string, state: job.rows[0].state as string, listCents: list, quotedCents: body.quotedTotalCents ?? list };
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

const eventBody = z.object({ type: z.enum(['started', 'work_finished', 'closed', 'abandoned', 'disputed']) });

router.post('/jobs/:id/events', authenticate, workerRoles, async (req, res, next) => {
  try {
    const { type } = parse(eventBody, req.body);
    const eventType = `job.${type}` as JobEventType;
    const target = EVENT_RESULTING_STATE[eventType] as JobState;
    const state = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query('SELECT state, site_id FROM jobs WHERE id = $1', [idParam(req)]);
      const job = rows[0];
      if (!job) throw new NotFoundError('That job was not found.');
      if (req.principal!.siteId && job.site_id !== req.principal!.siteId) throw new ForbiddenError('That job belongs to another site.');
      try {
        assertTransition(job.state as JobState, target);
      } catch (error) {
        throw new ConflictError((error as Error).message);
      }
      await transitionJob(client, idParam(req), target, target === 'closed' || target === 'abandoned' ? new Date() : null);
      await recordJobEvent(client, { orgId: req.principal!.orgId, jobId: idParam(req), type: eventType, actorId: req.principal!.userId, payload: {}, clientTs: null });
      return target;
    });
    res.json({ id: idParam(req), state });
  } catch (error) {
    next(error);
  }
});

const MAX_CASH_CENTS = 100_000_000;
const cashBody = z.object({
  amountCents: z.number().int().positive().max(MAX_CASH_CENTS).optional(),
  // required when the amount differs from the quote: why the customer paid something else
  reason: z.string().trim().min(3).max(300).optional()
});

// A worker declaring cash. It is the one payment a human reports, which is exactly why the
// reconciliation compares it with the work and the water rather than trusting it. The amount may be
// left out (then it is the quoted price). Declaring a different amount needs a supervisor, manager or
// owner to do it: the person being checked does not get to decide that the till is short.
router.post('/jobs/:id/cash', authenticate, workerRoles, async (req, res, next) => {
  try {
    const { amountCents, reason } = parse(cashBody, req.body ?? {});
    const caller = req.principal!;
    const out = await withOrg(caller.orgId, async (client) => {
      const { rows } = await client.query('SELECT state, site_id, quoted_total_cents FROM jobs WHERE id = $1 FOR UPDATE', [idParam(req)]);
      const job = rows[0];
      if (!job) throw new NotFoundError('That job was not found.');
      if (caller.siteId && job.site_id !== caller.siteId) throw new ForbiddenError('That job belongs to another site.');
      if (job.state !== 'awaiting_payment') throw new ConflictError(`A job in ${job.state} cannot take a payment; finish the work first.`);

      const quoted = Number(job.quoted_total_cents);
      const declared = amountCents ?? quoted;
      const differs = declared !== quoted;
      const mayAuthorise = caller.role !== 'worker';
      if (differs && !mayAuthorise) {
        throw new ForbiddenError(`The quote is ${quoted / 100} KES. An attendant cannot take a different amount; ask a supervisor or manager to record it.`);
      }
      if (differs && !reason) {
        throw new BadRequestError('reason: say why the amount differs from the quote');
      }

      const payment = await insertPayment(client, {
        orgId: caller.orgId,
        siteId: job.site_id,
        jobId: idParam(req),
        channel: 'cash',
        amountCents: declared as never,
        externalRef: null,
        payerMsisdn: null,
        receivedAt: new Date()
      });
      if (differs) {
        await client.query('UPDATE payments SET variance_authorised_by = $2 WHERE id = $1', [payment.id, caller.userId]);
      }
      await transitionJob(client, idParam(req), 'paid');
      // both figures go in the audit trail, so a later argument is settled by the record
      await recordJobEvent(client, {
        orgId: caller.orgId,
        jobId: idParam(req),
        type: 'job.payment_matched',
        actorId: caller.userId,
        payload: {
          paymentId: payment.id,
          channel: 'cash',
          quotedCents: quoted,
          declaredCents: declared,
          ...(differs ? { varianceCents: declared - quoted, authorisedBy: caller.userId, reason } : {})
        },
        clientTs: null
      });
      return payment;
    });
    res.status(201).json({ paymentId: out.id, state: 'paid' });
  } catch (error) {
    next(error);
  }
});

router.get('/jobs/:id', authenticate, async (req, res, next) => {
  try {
    const data = await withOrg(req.principal!.orgId, async (client) => {
      const job = await client.query(
        `SELECT j.*, v.plate_normalised, u.display_name AS worker, s.name AS site, b.label AS bay
           FROM jobs j LEFT JOIN vehicles v ON v.id = j.vehicle_id LEFT JOIN users u ON u.id = j.worker_id
           JOIN sites s ON s.id = j.site_id LEFT JOIN bays b ON b.id = j.bay_id WHERE j.id = $1`,
        [idParam(req)]
      );
      if (!job.rows[0]) return null;
      if (req.principal!.siteId && job.rows[0].site_id !== req.principal!.siteId) return null;
      const lines = await client.query(
        `SELECT sv.name, js.unit_price_cents, js.qty FROM job_services js JOIN services sv ON sv.id = js.service_id WHERE js.job_id = $1 ORDER BY sv.name`,
        [idParam(req)]
      );
      const events = await client.query(`SELECT type, payload, server_ts FROM job_events WHERE job_id = $1 ORDER BY server_ts, id`, [idParam(req)]);
      const payments = await client.query(`SELECT id, channel, amount_cents, external_ref, received_at, reversed_at FROM payments WHERE job_id = $1 ORDER BY received_at`, [idParam(req)]);
      return { job: job.rows[0], lines: lines.rows, events: events.rows, payments: payments.rows };
    });
    if (!data) throw new NotFoundError('That job was not found.');
    res.json({
      id: data.job.id,
      state: data.job.state,
      site: data.job.site,
      bay: data.job.bay,
      plate: data.job.plate_normalised,
      worker: data.job.worker,
      quotedCents: Number(data.job.quoted_total_cents),
      listCents: Number(data.job.list_total_cents),
      discountAuthorised: data.job.discount_authorised_by !== null,
      createdAt: data.job.created_at,
      closedAt: data.job.closed_at,
      services: data.lines.map((l) => ({ name: l.name, unitPriceCents: Number(l.unit_price_cents), qty: l.qty })),
      events: data.events.map((e) => ({ type: e.type, at: e.server_ts, payload: e.payload })),
      payments: data.payments.map((p) => ({ id: p.id, channel: p.channel, amountCents: Number(p.amount_cents), reference: p.external_ref, receivedAt: p.received_at, reversed: p.reversed_at !== null }))
    });
  } catch (error) {
    next(error);
  }
});

export default router;
