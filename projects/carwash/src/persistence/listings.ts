/**
 * Filtered, keyset-paged queries behind every console list and every CSV export. The JSON endpoints
 * and the exports call the same functions, so what a manager sees on screen is exactly what they
 * download. Each function runs inside the caller's `withOrg`, so row-level security still decides
 * which organisation's rows exist at all.
 */
import { PoolClient } from 'pg';
import { normalisePlate } from '../domain/plate';
import {
  afterClause,
  decodeCursor,
  finishPage,
  keySelect,
  optionalDay,
  optionalOneOf,
  optionalUuid,
  orderBy,
  Page,
  parseLimit,
  SortColumn
} from './paging';

export const JOB_STATES = ['created', 'in_progress', 'awaiting_payment', 'paid', 'closed', 'abandoned', 'disputed', 'voided'] as const;
export const PAYMENT_CHANNELS = ['mpesa', 'card', 'bank', 'cash'] as const;
export const FLAG_STATES = ['open', 'explained', 'confirmed', 'dismissed'] as const;
export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export const ROLES = ['owner', 'manager', 'supervisor', 'worker', 'support'] as const;

type Query = Record<string, unknown>;

class Where {
  readonly params: unknown[] = [];
  private readonly parts: string[] = [];

  /** Each `?` in `sql` becomes the next positional parameter, taking the values in order. */
  add(sql: string, ...values: unknown[]): void {
    let next = 0;
    this.parts.push(
      sql.replace(/\?/g, () => {
        this.params.push(values[next++]);
        return `$${this.params.length}`;
      })
    );
  }

  clause(): string {
    return this.parts.length > 0 ? `WHERE ${this.parts.join(' AND ')}` : '';
  }
}

interface Scope {
  /** A principal tied to one site only ever sees that site, whatever the query string says. */
  siteId: string | null;
}

function dayRange(where: Where, column: string, query: Query): void {
  const from = optionalDay(query.from, 'from');
  const to = optionalDay(query.to, 'to');
  if (from) where.add(`${column} >= ?::date`, from);
  if (to) where.add(`${column} < ?::date + 1`, to);
}

async function run<Row extends Record<string, any>, T>(
  client: PoolClient,
  select: string,
  where: Where,
  columns: SortColumn[],
  query: Query,
  map: (row: Row) => T
): Promise<Page<T>> {
  const limit = parseLimit(query.limit);
  const cursor = decodeCursor(query.after, columns.length);
  const after = afterClause(columns, cursor, where.params);
  if (after) where.add(after);
  where.params.push(limit + 1);
  const { rows } = await client.query(
    `${select} ${where.clause()} ORDER BY ${orderBy(columns)} LIMIT $${where.params.length}`,
    where.params
  );
  return finishPage(rows as Row[], limit, columns, map);
}

// ---- jobs ------------------------------------------------------------------------------------

const JOB_COLUMNS: SortColumn[] = [
  { sql: 'j.created_at', dir: 'desc', type: 'timestamptz' },
  { sql: 'j.id', dir: 'desc', type: 'uuid' }
];

export interface JobListItem {
  id: string;
  state: string;
  site: string;
  quotedCents: number;
  listCents: number;
  createdAt: string;
  closedAt: string | null;
  plate: string | null;
  worker: string | null;
  paid: boolean;
}

export function jobsPage(client: PoolClient, scope: Scope, query: Query): Promise<Page<JobListItem>> {
  const where = new Where();
  const siteId = scope.siteId ?? optionalUuid(query.siteId, 'siteId');
  if (siteId) where.add('j.site_id = ?', siteId);
  const state = optionalOneOf(query.state, 'state', JOB_STATES);
  if (state) where.add('j.state = ?', state);
  const worker = optionalUuid(query.workerId, 'workerId');
  if (worker) where.add('j.worker_id = ?', worker);
  if (typeof query.plate === 'string' && query.plate.trim()) {
    // normalised plates hold only A-Z and 0-9, so the prefix needs no LIKE escaping
    where.add('v.plate_normalised LIKE ?', `${normalisePlate(query.plate)}%`);
  }
  dayRange(where, 'j.created_at', query);

  return run(
    client,
    `SELECT j.id, j.state, j.quoted_total_cents, j.list_total_cents, j.created_at, j.closed_at,
            v.plate_normalised, u.display_name AS worker, s.name AS site,
            EXISTS (SELECT 1 FROM payments p WHERE p.job_id = j.id AND p.reversed_at IS NULL) AS paid,
            ${keySelect(JOB_COLUMNS)}
       FROM jobs j
       JOIN sites s ON s.id = j.site_id
       LEFT JOIN vehicles v ON v.id = j.vehicle_id
       LEFT JOIN users u ON u.id = j.worker_id`,
    where,
    JOB_COLUMNS,
    query,
    (row) => ({
      id: row.id,
      state: row.state,
      site: row.site,
      quotedCents: Number(row.quoted_total_cents),
      listCents: Number(row.list_total_cents),
      createdAt: row.created_at,
      closedAt: row.closed_at,
      plate: row.plate_normalised,
      worker: row.worker,
      paid: row.paid
    })
  );
}

// ---- payments --------------------------------------------------------------------------------

const PAYMENT_COLUMNS: SortColumn[] = [
  { sql: 'p.received_at', dir: 'desc', type: 'timestamptz' },
  { sql: 'p.id', dir: 'desc', type: 'uuid' }
];

export interface PaymentListItem {
  id: string;
  channel: string;
  site: string;
  amountCents: number;
  reference: string | null;
  jobId: string | null;
  matched: boolean;
  reversed: boolean;
  receivedAt: string;
}

export function paymentsPage(client: PoolClient, scope: Scope, query: Query): Promise<Page<PaymentListItem>> {
  const where = new Where();
  const siteId = scope.siteId ?? optionalUuid(query.siteId, 'siteId');
  if (siteId) where.add('p.site_id = ?', siteId);
  const channel = optionalOneOf(query.channel, 'channel', PAYMENT_CHANNELS);
  if (channel) where.add('p.channel = ?', channel);
  const matched = optionalOneOf(query.matched, 'matched', ['yes', 'no'] as const);
  if (matched === 'yes') where.add('p.job_id IS NOT NULL');
  if (matched === 'no') where.add('p.job_id IS NULL');
  if (typeof query.reference === 'string' && query.reference.trim()) {
    where.add(`p.external_ref LIKE ? ESCAPE '\\'`, `${query.reference.trim().replace(/[\\%_]/g, '\\$&')}%`);
  }
  dayRange(where, 'p.received_at', query);

  return run(
    client,
    `SELECT p.id, p.channel, p.amount_cents, p.external_ref, p.job_id, p.received_at, p.reversed_at,
            s.name AS site, ${keySelect(PAYMENT_COLUMNS)}
       FROM payments p JOIN sites s ON s.id = p.site_id`,
    where,
    PAYMENT_COLUMNS,
    query,
    (row) => ({
      id: row.id,
      channel: row.channel,
      site: row.site,
      amountCents: Number(row.amount_cents),
      reference: row.external_ref,
      jobId: row.job_id,
      matched: row.job_id !== null,
      reversed: row.reversed_at !== null,
      receivedAt: row.received_at
    })
  );
}

// ---- flags -----------------------------------------------------------------------------------

const SEVERITY_RANK = `CASE d.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`;
const FLAG_COLUMNS: SortColumn[] = [
  { sql: SEVERITY_RANK, dir: 'asc', type: 'int' },
  { sql: 'd.est_value_cents', dir: 'desc', type: 'bigint' },
  { sql: 'd.business_day', dir: 'desc', type: 'date' },
  { sql: 'd.id', dir: 'desc', type: 'uuid' }
];

export interface FlagListItem {
  id: string;
  type: string;
  severity: string;
  estimatedCents: number;
  summary: string;
  evidence: unknown;
  state: string;
  businessDay: string;
  site: string;
  resolutionNote: string | null;
}

export function flagsPage(client: PoolClient, scope: Scope, query: Query): Promise<Page<FlagListItem>> {
  const where = new Where();
  const siteId = scope.siteId ?? optionalUuid(query.siteId, 'siteId');
  if (siteId) where.add('d.site_id = ?', siteId);
  const state = optionalOneOf(query.state, 'state', [...FLAG_STATES, 'all'] as const);
  if (state && state !== 'all') where.add('d.state = ?', state);
  const severity = optionalOneOf(query.severity, 'severity', SEVERITIES);
  if (severity) where.add('d.severity = ?', severity);
  if (typeof query.type === 'string' && /^[a-z_]{3,40}$/.test(query.type)) where.add('d.type = ?', query.type);
  dayRange(where, 'd.business_day', query);

  return run(
    client,
    `SELECT d.id, d.type, d.severity, d.est_value_cents, d.summary, d.evidence, d.state, d.business_day,
            d.resolution_note, s.name AS site, ${keySelect(FLAG_COLUMNS)}
       FROM discrepancies d JOIN sites s ON s.id = d.site_id`,
    where,
    FLAG_COLUMNS,
    query,
    (row) => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      estimatedCents: Number(row.est_value_cents),
      summary: row.summary,
      evidence: row.evidence,
      state: row.state,
      businessDay: row.business_day,
      site: row.site,
      resolutionNote: row.resolution_note
    })
  );
}

// ---- events ----------------------------------------------------------------------------------

const EVENT_COLUMNS: SortColumn[] = [
  { sql: 'e.server_ts', dir: 'desc', type: 'timestamptz' },
  { sql: 'e.id', dir: 'desc', type: 'bigint' }
];

export interface EventListItem {
  id: string;
  type: string;
  at: string;
  jobId: string;
  site: string;
  actor: string | null;
  payload: unknown;
}

export function eventsPage(client: PoolClient, scope: Scope, query: Query): Promise<Page<EventListItem>> {
  const where = new Where();
  const siteId = scope.siteId ?? optionalUuid(query.siteId, 'siteId');
  if (siteId) where.add('j.site_id = ?', siteId);
  const jobId = optionalUuid(query.jobId, 'jobId');
  if (jobId) where.add('e.job_id = ?', jobId);
  if (typeof query.type === 'string' && /^[a-z_.]{3,40}$/.test(query.type)) where.add('e.type = ?', query.type);
  dayRange(where, 'e.server_ts', query);

  return run(
    client,
    `SELECT e.id, e.type, e.server_ts, e.job_id, e.payload, j.site_id, s.name AS site, u.display_name AS actor,
            ${keySelect(EVENT_COLUMNS)}
       FROM job_events e
       JOIN jobs j ON j.id = e.job_id
       JOIN sites s ON s.id = j.site_id
       LEFT JOIN users u ON u.id = e.actor_id`,
    where,
    EVENT_COLUMNS,
    query,
    (row) => ({ id: String(row.id), type: row.type, at: row.server_ts, jobId: row.job_id, site: row.site, actor: row.actor, payload: row.payload })
  );
}

// ---- team ------------------------------------------------------------------------------------

const USER_COLUMNS: SortColumn[] = [
  { sql: 'u.display_name', dir: 'asc', type: 'text' },
  { sql: 'u.id', dir: 'asc', type: 'uuid' }
];

export interface UserListItem {
  id: string;
  displayName: string;
  phone: string;
  role: string;
  siteId: string | null;
  site: string | null;
  status: string;
}

export function usersPage(client: PoolClient, scope: Scope, query: Query): Promise<Page<UserListItem>> {
  const where = new Where();
  const siteId = scope.siteId ?? optionalUuid(query.siteId, 'siteId');
  if (siteId) where.add('u.site_id = ?', siteId);
  const role = optionalOneOf(query.role, 'role', ROLES);
  if (role) where.add('u.role = ?', role);
  const status = optionalOneOf(query.status, 'status', ['active', 'suspended'] as const);
  if (status) where.add('u.status = ?', status);
  if (typeof query.q === 'string' && query.q.trim()) {
    const escaped = query.q.trim().replace(/[\\%_]/g, '\\$&');
    where.add(`(u.display_name ILIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\')`, `%${escaped}%`, `${escaped}%`);
  }

  return run(
    client,
    `SELECT u.id, u.display_name, u.phone, u.role, u.site_id, u.status, s.name AS site, ${keySelect(USER_COLUMNS)}
       FROM users u LEFT JOIN sites s ON s.id = u.site_id`,
    where,
    USER_COLUMNS,
    query,
    (row) => ({ id: row.id, displayName: row.display_name, phone: row.phone, role: row.role, siteId: row.site_id, site: row.site, status: row.status })
  );
}
