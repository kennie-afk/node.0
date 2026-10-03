/**
 * Self-serve signup: a business enters its details, proves it holds the phone number with a
 * six-digit code, chooses its own PIN, and gets a working organisation, a first branch, a starter
 * price list and a free trial. No operator is involved and no PIN is ever handed over.
 *
 * Codes are stored only as a bcrypt hash, expire, allow a few attempts, and a resend has a cooldown
 * and a ceiling. The organisation is created exactly once even if verify is called twice at the same
 * moment: the request row is claimed atomically before provisioning starts.
 */
import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';
import { withoutTenant } from '../persistence/pool';
import { env } from '../config/env';
import { logger } from '../common/logger';
import { AppError, BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from '../domain/errors';
import { normalisePhone } from '../admin/phone';
import { phoneInUse, provisionOrganisation } from '../admin/provisioning';
import { sendMessage } from '../notify/provider';
import { signToken } from '../api/token';

const CODE_ROUNDS = 8;
const MAX_REQUESTS_PER_PHONE_PER_HOUR = 5;
const MAX_RESENDS = 5;

export interface SignupInput {
  businessName: string;
  contactName: string;
  phone: string;
  expectedGuards?: number;
  registrationNo?: string;
  /** try it first: a separate sample organisation with sample data, never billed */
  sample?: boolean;
  notes?: string;
}

function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function codeMessage(code: string): string {
  return `Your Askari verification code is ${code}. It expires in ${env.SIGNUP_CODE_TTL_MINUTES} minutes. If you did not ask for it, ignore this message.`;
}

function tooMany(message: string): AppError {
  return new AppError(429, 'too-many-attempts', message);
}

function phoneOrThrow(raw: string): string {
  try {
    return normalisePhone(raw);
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : 'that is not a valid phone number');
  }
}

export interface StartResult {
  id: string;
  delivery: 'sent' | 'logged' | 'failed';
  expiresInMinutes: number;
}

export async function startSignup(input: SignupInput): Promise<StartResult> {
  const phone = phoneOrThrow(input.phone);
  if (await phoneInUse(phone)) {
    throw new ConflictError('That phone number already has a Askari account. Sign in instead.');
  }

  const recent = await withoutTenant(async (client) => {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM signup_requests WHERE phone = $1 AND created_at > now() - interval '1 hour'`,
      [phone]
    );
    return rows[0].n as number;
  });
  if (recent >= MAX_REQUESTS_PER_PHONE_PER_HOUR) {
    throw tooMany('Too many requests for this number. Try again in an hour.');
  }

  const code = newCode();
  const codeHash = await bcrypt.hash(code, CODE_ROUNDS);
  const id = await withoutTenant(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO signup_requests (business_name, contact_name, phone, expected_guards, registration_no, sample, notes, code_hash, code_expires_at, code_sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + ($9 || ' minutes')::interval, now()) RETURNING id`,
      [input.businessName, input.contactName, phone, input.expectedGuards ?? 0, input.registrationNo ?? null, input.sample ?? false, input.notes ?? null, codeHash, String(env.SIGNUP_CODE_TTL_MINUTES)]
    );
    return rows[0]!.id;
  });

  const sent = await sendMessage({ to: phone, purpose: 'signup-code', body: codeMessage(code) });
  logger.info('signup started', { signupRequestId: id, delivery: sent.status });
  return { id, delivery: sent.status, expiresInMinutes: env.SIGNUP_CODE_TTL_MINUTES };
}

export async function resendCode(id: string): Promise<StartResult> {
  const row = await withoutTenant(async (client) => (await client.query('SELECT * FROM signup_requests WHERE id = $1', [id])).rows[0]);
  if (!row || row.status !== 'new' || !row.code_hash) {
    throw new NotFoundError('That signup request is not waiting for a code.');
  }
  if (row.resend_count >= MAX_RESENDS) {
    throw tooMany('That is as many codes as we can send for this request. Start again.');
  }
  const waited = Date.now() - new Date(row.code_sent_at).getTime();
  if (waited < env.SIGNUP_RESEND_COOLDOWN_SECONDS * 1000) {
    throw tooMany(`Wait ${Math.ceil((env.SIGNUP_RESEND_COOLDOWN_SECONDS * 1000 - waited) / 1000)} seconds before asking for another code.`);
  }

  const code = newCode();
  const codeHash = await bcrypt.hash(code, CODE_ROUNDS);
  await withoutTenant((client) =>
    client.query(
      `UPDATE signup_requests SET code_hash = $2, code_expires_at = now() + ($3 || ' minutes')::interval,
              code_attempts = 0, resend_count = resend_count + 1, code_sent_at = now()
        WHERE id = $1`,
      [id, codeHash, String(env.SIGNUP_CODE_TTL_MINUTES)]
    )
  );
  const sent = await sendMessage({ to: row.phone, purpose: 'signup-code', body: codeMessage(code) });
  return { id, delivery: sent.status, expiresInMinutes: env.SIGNUP_CODE_TTL_MINUTES };
}

export interface VerifyResult {
  token: string;
  expiresInSeconds: number;
  displayName: string;
  role: string;
  orgId: string;
  branchId: string;
}

export async function verifySignup(id: string, code: string, pin: string): Promise<VerifyResult> {
  if (!/^\d{6}$/.test(pin)) {
    throw new BadRequestError('Choose a PIN of exactly six digits.');
  }
  const row = await withoutTenant(async (client) => (await client.query('SELECT * FROM signup_requests WHERE id = $1', [id])).rows[0]);
  if (!row) throw new NotFoundError('That signup request was not found.');
  if (row.status !== 'new' || row.verified_at) throw new ConflictError('That signup request has already been used.');
  if (!row.code_hash) throw new BadRequestError('That request is set up by hand, not with a code.');
  if (new Date(row.code_expires_at).getTime() < Date.now()) {
    throw new UnauthorizedError('That code has expired. Ask for a new one.');
  }
  if (row.code_attempts >= env.SIGNUP_CODE_MAX_ATTEMPTS) {
    throw tooMany('Too many wrong codes. Ask for a new one.');
  }

  if (!(await bcrypt.compare(code, row.code_hash))) {
    const left = await withoutTenant(async (client) => {
      const { rows } = await client.query('UPDATE signup_requests SET code_attempts = code_attempts + 1 WHERE id = $1 RETURNING code_attempts', [id]);
      return env.SIGNUP_CODE_MAX_ATTEMPTS - (rows[0]?.code_attempts ?? env.SIGNUP_CODE_MAX_ATTEMPTS);
    });
    throw new UnauthorizedError(left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'That code is not right. Ask for a new one.');
  }

  // Claim the request atomically: of two simultaneous verifies, exactly one proceeds.
  const claimed = await withoutTenant(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE signup_requests SET verified_at = now() WHERE id = $1 AND verified_at IS NULL AND status = 'new'`,
      [id]
    );
    return rowCount === 1;
  });
  if (!claimed) throw new ConflictError('That signup request has already been used.');

  try {
    const made = await provisionOrganisation({
      businessName: row.business_name,
      ownerName: row.contact_name,
      ownerPhone: row.phone,
      registrationNo: row.registration_no,
      sample: row.sample,
      pin,
      signupId: id
    });
    await withoutTenant((client) => client.query('UPDATE signup_requests SET provisioned_org_id = $2, code_hash = NULL WHERE id = $1', [id, made.orgId]));
    const { token, expiresInSeconds } = signToken({ userId: made.ownerId, orgId: made.orgId, branchId: null, role: 'owner' });
    logger.info('self-serve organisation created', { orgId: made.orgId, signupRequestId: id });
    return { token, expiresInSeconds, displayName: row.contact_name, role: 'owner', orgId: made.orgId, branchId: made.branchId };
  } catch (error) {
    // Release the claim so the owner can try again (for example if the number was taken in the meantime).
    await withoutTenant((client) => client.query('UPDATE signup_requests SET verified_at = NULL WHERE id = $1', [id])).catch(() => undefined);
    throw error;
  }
}
