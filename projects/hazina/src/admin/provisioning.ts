/**
 * Turns a business into a working tenant: organisation, first branch, an owner who can sign in, and a free
 * trial. Everything runs through `withOrg` on the application's own restricted role, so the row-level-security
 * policies authorise each insert (the organisation row is inserted under the very id the session is scoped
 * to). No privileged connection is needed, and provisioning cannot write into any other tenant.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { withOrg, withoutTenant } from '../persistence/pool';
import { ConflictError, NotFoundError } from '../domain/errors';
import { generatePin, normalisePhone } from './phone';
import { createSubscription } from '../billing/service';
import { defaultChart } from '../ledger/chart';
import { seedTemplates } from '../returns/service';
import { seedSampleData } from './sample';

const PIN_ROUNDS = 10;

export interface ProvisionInput {
  businessName: string;
  ownerName: string;
  ownerPhone: string;
  kind?: 'sacco' | 'lender';
  registrationNo?: string | null;
  /** a separate sample organisation with sample data, never billed */
  sample?: boolean;
  branchName?: string;
  /** Supplied for scripted setups; otherwise a random PIN is generated and returned once. */
  pin?: string;
  signupId?: string;
}

export interface ProvisionResult {
  orgId: string;
  branchId: string;
  ownerId: string;
  phone: string;
  pin: string;
  pinWasGenerated: boolean;
}

/** A short code for a branch: its initials, padded, e.g. "Kilimani Branch" -> KB. */
export function branchCodeFrom(name: string, taken: Set<string> = new Set()): string {
  const initials = name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('');
  const base = (initials.length >= 2 ? initials : name.toUpperCase().replace(/[^A-Z0-9]/g, '')).slice(0, 5).padEnd(2, 'X');
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base.slice(0, 6)}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new ConflictError('could not make a branch code');
}

export async function phoneInUse(phone: string): Promise<boolean> {
  return withoutTenant(async (client) => {
    const { rows } = await client.query('SELECT id FROM resolve_login($1)', [phone]);
    return rows.length > 0;
  });
}

export async function provisionOrganisation(input: ProvisionInput): Promise<ProvisionResult> {
  const phone = normalisePhone(input.ownerPhone);
  // Sign-in finds a person by phone alone, so one number belongs to one account in the whole system.
  if (await phoneInUse(phone)) {
    throw new ConflictError(`${phone} already belongs to an account`);
  }

  const pin = input.pin ?? generatePin();
  const pinHash = await bcrypt.hash(pin, PIN_ROUNDS);
  const orgId = randomUUID();

  const ids = await withOrg(orgId, async (client) => {
    const kind = input.kind ?? 'sacco';
    await client.query(`INSERT INTO organisations (id, name, kind, registration_no, is_demo) VALUES ($1, $2, $3, $4, $5)`, [orgId, input.businessName, kind, input.registrationNo ?? null, input.sample ?? false]);
    const name = input.branchName ?? 'Head office';
    const branch = await client.query<{ id: string }>(
      `INSERT INTO branches (org_id, code, name) VALUES ($1, $2, $3) RETURNING id`,
      [orgId, branchCodeFrom(name), name]
    );
    const owner = await client.query<{ id: string }>(
      `INSERT INTO users (org_id, branch_id, role, display_name, phone, pin_hash) VALUES ($1, NULL, 'owner', $2, $3, $4) RETURNING id`,
      [orgId, input.ownerName, phone, pinHash]
    );
    await client.query('INSERT INTO org_settings (org_id) VALUES ($1)', [orgId]);
    for (const account of defaultChart(kind)) {
      await client.query('INSERT INTO accounts (org_id, code, name, type, is_system) VALUES ($1, $2, $3, $4, $5)', [orgId, account.code, account.name, account.type, account.system]);
    }
    await seedTemplates(client, orgId, kind);
    // Every organisation starts a free trial the moment it exists: nobody is ever without a subscription. A sample
    // organisation is never billed, so its trial does not end.
    await createSubscription(client, orgId, new Date(), undefined, input.sample ? 36_500 : undefined);
    if (input.sample) await seedSampleData(client, orgId, kind, owner.rows[0]!.id);
    return { branchId: branch.rows[0]!.id, ownerId: owner.rows[0]!.id };
  });

  if (input.signupId) {
    await withoutTenant((client) => client.query(`UPDATE signup_requests SET status = 'onboarded' WHERE id = $1`, [input.signupId]));
  }
  return { orgId, phone, pin, pinWasGenerated: input.pin === undefined, ...ids };
}

/** Operator recovery for a forgotten PIN: a new random one, shown once, stored only as a hash. */
export async function resetPin(rawPhone: string): Promise<{ phone: string; pin: string }> {
  const phone = normalisePhone(rawPhone);
  const account = await withoutTenant(async (client) => (await client.query('SELECT id, org_id FROM resolve_login($1)', [phone])).rows[0]);
  if (!account) throw new NotFoundError(`no active account for ${phone}`);
  const pin = generatePin();
  const pinHash = await bcrypt.hash(pin, PIN_ROUNDS);
  await withOrg(account.org_id, (client) => client.query('UPDATE users SET pin_hash = $2 WHERE id = $1', [account.id, pinHash]));
  return { phone, pin };
}
