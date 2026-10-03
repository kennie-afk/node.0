/**
 * Turns a business into a working tenant: organisation, first site and bay, a starter price list
 * and an owner who can sign in. Everything runs through `withOrg` on the application's own
 * restricted role, so the row-level-security policies are what authorise each insert (the
 * organisation row is inserted under the very id the session is scoped to). No privileged
 * connection is needed, and provisioning cannot write into any other tenant.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { withOrg, withoutTenant } from '../persistence/pool';
import { ConflictError, NotFoundError } from '../domain/errors';
import { generatePin, normalisePhone } from './phone';
import { createSubscription } from '../billing/service';

const PIN_ROUNDS = 10;

export interface StarterService {
  name: string;
  listPriceCents: number;
  expectedWaterL: number;
  expectedDurationS: number;
  commissionRate: number;
}

export const STARTER_SERVICES: StarterService[] = [
  { name: 'Basic wash', listPriceCents: 50_000, expectedWaterL: 60, expectedDurationS: 1200, commissionRate: 0.1 },
  { name: 'Full valet', listPriceCents: 120_000, expectedWaterL: 110, expectedDurationS: 3000, commissionRate: 0.1 },
  { name: 'Engine wash', listPriceCents: 80_000, expectedWaterL: 40, expectedDurationS: 1500, commissionRate: 0.1 }
];

export interface ProvisionInput {
  businessName: string;
  ownerName: string;
  ownerPhone: string;
  siteName?: string;
  tillNumber?: string | null;
  /** Supplied for scripted setups; otherwise a random PIN is generated and returned once. */
  pin?: string;
  signupId?: string;
}

export interface ProvisionResult {
  orgId: string;
  siteId: string;
  ownerId: string;
  phone: string;
  pin: string;
  pinWasGenerated: boolean;
}

export async function phoneInUse(phone: string): Promise<boolean> {
  return withoutTenant(async (client) => {
    const { rows } = await client.query('SELECT id FROM resolve_login($1)', [phone]);
    return rows.length > 0;
  });
}

export async function provisionOrganisation(input: ProvisionInput): Promise<ProvisionResult> {
  const phone = normalisePhone(input.ownerPhone);
  // Sign-in finds a user by phone alone, so one number may belong to one account in the whole
  // system; a second would make the login ambiguous.
  if (await phoneInUse(phone)) {
    throw new ConflictError(`${phone} already belongs to an account`);
  }

  const pin = input.pin ?? generatePin();
  const pinHash = await bcrypt.hash(pin, PIN_ROUNDS);
  const orgId = randomUUID();

  const ids = await withOrg(orgId, async (client) => {
    await client.query(`INSERT INTO organisations (id, name) VALUES ($1, $2)`, [orgId, input.businessName]);

    const site = await client.query<{ id: string }>(
      `INSERT INTO sites (org_id, name, till_number) VALUES ($1, $2, $3) RETURNING id`,
      [orgId, input.siteName ?? input.businessName, input.tillNumber ?? null]
    );
    const siteId = site.rows[0]!.id;
    await client.query(`INSERT INTO bays (org_id, site_id, label) VALUES ($1, $2, 'Bay 1')`, [orgId, siteId]);

    for (const service of STARTER_SERVICES) {
      await client.query(
        `INSERT INTO services (org_id, name, list_price_cents, expected_water_l, expected_duration_s, commission_rate)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orgId, service.name, service.listPriceCents, service.expectedWaterL, service.expectedDurationS, service.commissionRate]
      );
    }

    const owner = await client.query<{ id: string }>(
      `INSERT INTO users (org_id, site_id, role, display_name, phone, pin_hash)
       VALUES ($1, NULL, 'owner', $2, $3, $4) RETURNING id`,
      [orgId, input.ownerName, phone, pinHash]
    );
    // Every organisation starts a free trial the moment it exists: nobody is ever without a subscription.
    await createSubscription(client, orgId);
    return { siteId, ownerId: owner.rows[0]!.id };
  });

  if (input.signupId) {
    await withoutTenant((client) =>
      client.query(`UPDATE signup_requests SET status = 'onboarded' WHERE id = $1`, [input.signupId])
    );
  }

  return { orgId, phone, pin, pinWasGenerated: input.pin === undefined, ...ids };
}

export const DEVICE_TYPES = ['flow_meter', 'pump_monitor', 'beam', 'doser', 'machine', 'camera'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export interface RegisteredDevice {
  id: string;
  secret: string;
}

/**
 * Registers a real device (a flow meter, a plate camera) so it can post telemetry. The secret is
 * random, returned once, and kept only as a bcrypt hash: a device is a credential, not an address.
 * Without this, only the demo seed could create devices, so the water and camera signals - the
 * non-human witnesses the whole product rests on - could not be switched on for a real site.
 */
export async function registerDevice(
  orgId: string,
  input: { siteId: string; bayId?: string | null; type: DeviceType; firmware?: string }
): Promise<RegisteredDevice> {
  if (!DEVICE_TYPES.includes(input.type)) {
    throw new ConflictError(`device type must be one of ${DEVICE_TYPES.join(', ')}`);
  }
  const secret = randomBytes(24).toString('hex');
  const secretHash = await bcrypt.hash(secret, PIN_ROUNDS);

  const id = await withOrg(orgId, async (client) => {
    const site = await client.query('SELECT 1 FROM sites WHERE id = $1', [input.siteId]);
    if (site.rows.length === 0) throw new NotFoundError('that site was not found');
    if (input.bayId) {
      const bay = await client.query('SELECT 1 FROM bays WHERE id = $1 AND site_id = $2', [input.bayId, input.siteId]);
      if (bay.rows.length === 0) throw new NotFoundError('that bay is not at that site');
    }
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO devices (org_id, site_id, bay_id, type, firmware, secret_hash) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [orgId, input.siteId, input.bayId ?? null, input.type, input.firmware ?? null, secretHash]
    );
    return rows[0]!.id;
  });
  return { id, secret };
}

export interface SignupRow {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  siteCount: number;
  notes: string | null;
  status: string;
  createdAt: Date;
}

export async function listSignups(status?: string): Promise<SignupRow[]> {
  return withoutTenant(async (client) => {
    const { rows } = await client.query(
      `SELECT id, business_name, contact_name, phone, site_count, notes, status, created_at
         FROM signup_requests WHERE ($1::text IS NULL OR status = $1)
        ORDER BY created_at DESC LIMIT 100`,
      [status ?? null]
    );
    return rows.map((row) => ({
      id: row.id,
      businessName: row.business_name,
      contactName: row.contact_name,
      phone: row.phone,
      siteCount: row.site_count,
      notes: row.notes,
      status: row.status,
      createdAt: row.created_at
    }));
  });
}

export async function findSignup(idOrLatest: string): Promise<SignupRow> {
  const rows = await listSignups();
  const found =
    idOrLatest === 'latest'
      ? rows.find((row) => row.status === 'new' || row.status === 'contacted')
      : rows.find((row) => row.id === idOrLatest);
  if (!found) {
    throw new NotFoundError(idOrLatest === 'latest' ? 'there is no signup request waiting' : `signup request ${idOrLatest} not found`);
  }
  return found;
}

export async function provisionFromSignup(
  idOrLatest: string,
  overrides: { siteName?: string; tillNumber?: string | null; ownerPhone?: string } = {}
): Promise<ProvisionResult & { signup: SignupRow }> {
  const signup = await findSignup(idOrLatest);
  if (signup.status === 'onboarded') {
    throw new ConflictError('that signup request has already been provisioned');
  }
  if (signup.status === 'declined') {
    throw new ConflictError('that signup request was declined');
  }
  const result = await provisionOrganisation({
    businessName: signup.businessName,
    ownerName: signup.contactName,
    ownerPhone: overrides.ownerPhone ?? signup.phone,
    siteName: overrides.siteName,
    tillNumber: overrides.tillNumber,
    signupId: signup.id
  });
  return { ...result, signup };
}
