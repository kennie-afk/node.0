import { createHash } from 'node:crypto';
import { Transaction } from 'sequelize';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { camel, insertRow, normalisePhone, select, selectOne, updateRow } from '../ops-kit';
import { parseCsv } from './csv';

const ALIASES: Record<string, string> = {
  firstname: 'firstName', first: 'firstName', givenname: 'firstName',
  lastname: 'lastName', surname: 'lastName', last: 'lastName', familyname: 'lastName',
  middlename: 'middleName',
  gender: 'gender', sex: 'gender',
  dateofbirth: 'dateOfBirth', dob: 'dateOfBirth', birthdate: 'dateOfBirth',
  email: 'email', emailaddress: 'email',
  phone: 'phoneNumber', phonenumber: 'phoneNumber', mobile: 'phoneNumber', telephone: 'phoneNumber',
  address: 'address', city: 'city', town: 'city', county: 'county',
  postalcode: 'postalCode', postcode: 'postalCode',
  status: 'status', baptismdate: 'baptismDate', membershipdate: 'membershipDate', joined: 'membershipDate',
  notes: 'notes'
};
const COLUMN: Record<string, string> = {
  firstName: 'first_name', lastName: 'last_name', middleName: 'middle_name', gender: 'gender', dateOfBirth: 'date_of_birth', email: 'email',
  phoneNumber: 'phone_number', address: 'address', city: 'city', county: 'county', postalCode: 'postal_code', status: 'status',
  baptismDate: 'baptism_date', membershipDate: 'membership_date', notes: 'notes'
};
const STATUSES = ['Active', 'Inactive', 'New Convert', 'Deceased', 'Guest'];
const GENDERS = ['Male', 'Female', 'Other'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 5000;

export interface RowError {
  row: number;
  field?: string;
  message: string;
}

interface Parsed {
  row: number;
  data: Record<string, string | null>;
}

function parseDay(value: string): string | null {
  const v = value.trim();
  if (DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))) return v;
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (!Number.isNaN(Date.parse(`${iso}T00:00:00Z`))) return iso;
  }
  return null;
}

export function validateRows(csv: string): { rows: Parsed[]; errors: RowError[]; total: number } {
  let table: string[][];
  try {
    table = parseCsv(csv);
  } catch (e) {
    throw new BadRequestError((e as Error).message);
  }
  if (table.length < 2) throw new BadRequestError('the file needs a header row and at least one member');
  if (table.length - 1 > MAX_ROWS) throw new BadRequestError(`a file may contain at most ${MAX_ROWS} members; split it`);
  const header = table[0].map((h) => ALIASES[h.toLowerCase().replace(/[^a-z]/g, '')] ?? null);
  if (!header.includes('firstName') || !header.includes('lastName')) {
    throw new BadRequestError('the header must include first_name and last_name');
  }
  const errors: RowError[] = [];
  const rows: Parsed[] = [];
  const seenPhone = new Map<string, number>();
  const seenEmail = new Map<string, number>();
  table.slice(1).forEach((cells, index) => {
    const rowNo = index + 2;
    const data: Record<string, string | null> = {};
    header.forEach((field, i) => {
      if (field) data[field] = (cells[i] ?? '').trim() || null;
    });
    const before = errors.length;
    const bad = (field: string, message: string) => errors.push({ row: rowNo, field, message });
    if (!data.firstName) bad('firstName', 'first name is required');
    if (!data.lastName) bad('lastName', 'last name is required');
    if (data.gender) {
      const g = GENDERS.find((x) => x.toLowerCase() === data.gender!.toLowerCase()) ?? (data.gender.toLowerCase() === 'm' ? 'Male' : data.gender.toLowerCase() === 'f' ? 'Female' : null);
      if (!g) bad('gender', 'use Male, Female or Other');
      else data.gender = g;
    }
    if (data.status) {
      const s = STATUSES.find((x) => x.toLowerCase() === data.status!.toLowerCase());
      if (!s) bad('status', `use one of ${STATUSES.join(', ')}`);
      else data.status = s;
    }
    if (data.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) bad('email', 'not a valid e-mail address');
      else data.email = data.email.toLowerCase();
    }
    if (data.phoneNumber) {
      const p = normalisePhone(data.phoneNumber);
      if (!p) bad('phoneNumber', 'not a valid phone number');
      else data.phoneNumber = p;
    }
    for (const f of ['dateOfBirth', 'baptismDate', 'membershipDate']) {
      if (data[f]) {
        const d = parseDay(data[f]!);
        if (!d) bad(f, 'use YYYY-MM-DD or DD/MM/YYYY');
        else data[f] = d;
      }
    }
    if (errors.length === before) {
      if (data.phoneNumber) {
        if (seenPhone.has(data.phoneNumber)) bad('phoneNumber', `duplicates row ${seenPhone.get(data.phoneNumber)} in this file`);
        else seenPhone.set(data.phoneNumber, rowNo);
      }
      if (data.email) {
        if (seenEmail.has(data.email)) bad('email', `duplicates row ${seenEmail.get(data.email)} in this file`);
        else seenEmail.set(data.email, rowNo);
      }
    }
    if (errors.length === before) rows.push({ row: rowNo, data });
  });
  return { rows, errors, total: table.length - 1 };
}

async function findExisting(t: Transaction, churchId: number, data: Record<string, string | null>) {
  if (data.phoneNumber) {
    const byPhone = await selectOne<any>(t, `SELECT id FROM members WHERE church_id = ? AND phone_number = ?`, [churchId, data.phoneNumber]);
    if (byPhone) return Number(byPhone.id);
  }
  if (data.email) {
    const byEmail = await selectOne<any>(t, `SELECT id FROM members WHERE church_id = ? AND LOWER(email) = ?`, [churchId, data.email]);
    if (byEmail) return Number(byEmail.id);
  }
  return null;
}

export interface ImportOptions {
  csv: string;
  dryRun: boolean;
  updateExisting: boolean;
  allowPartial: boolean;
  userId: number;
}

export async function importMembers(t: Transaction, churchId: number, options: ImportOptions) {
  const fileHash = createHash('sha256').update(options.csv.trim().replace(/\r\n/g, '\n')).digest('hex');
  if (!options.dryRun) {
    const prior = await selectOne<any>(t, `SELECT * FROM import_jobs WHERE church_id = ? AND kind = 'MEMBERS' AND file_hash = ? AND update_existing = ? AND status = 'APPLIED'`, [churchId, fileHash, options.updateExisting]);
    if (prior) return { ...jobDto(prior), replayed: true };
  }
  const { rows, errors, total } = validateRows(options.csv);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const plan: Array<{ parsed: Parsed; existingId: number | null }> = [];
  for (const parsed of rows) plan.push({ parsed, existingId: await findExisting(t, churchId, parsed.data) });
  for (const p of plan) {
    if (p.existingId === null) created += 1;
    else if (options.updateExisting) updated += 1;
    else skipped += 1;
  }

  if (options.dryRun) {
    return {
      id: null, status: 'DRY_RUN', replayed: false, totalRows: total, createdCount: created, updatedCount: updated, skippedCount: skipped,
      errorCount: errors.length, errors,
      preview: plan.slice(0, 20).map((p) => ({ row: p.parsed.row, action: p.existingId === null ? 'CREATE' : options.updateExisting ? 'UPDATE' : 'SKIP', name: `${p.parsed.data.firstName} ${p.parsed.data.lastName}` }))
    };
  }
  if (errors.length > 0 && !options.allowPartial) {
    throw new BadRequestError(`${errors.length} row(s) have errors; fix them or pass allowPartial to import the valid rows (first: row ${errors[0].row}, ${errors[0].message})`);
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const { parsed, existingId } of plan) {
    const values: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(parsed.data)) {
      if (value !== null && COLUMN[field]) values[COLUMN[field]] = value;
    }
    if (existingId === null) {
      await insertRow(t, 'members', churchId, { status: 'Active', membership_date: today, ...values });
    } else if (options.updateExisting) {
      await updateRow(t, 'members', churchId, existingId, values);
    }
  }

  const id = await insertRow(t, 'import_jobs', churchId, {
    kind: 'MEMBERS', file_hash: fileHash, status: 'APPLIED', update_existing: options.updateExisting, total_rows: total,
    created_count: created, updated_count: updated, skipped_count: skipped, error_count: errors.length,
    errors: JSON.stringify(errors.slice(0, 200)), created_by: options.userId
  });
  return { ...jobDto((await selectOne<any>(t, `SELECT * FROM import_jobs WHERE id = ?`, [id]))!), replayed: false };
}

function jobDto(row: any) {
  return camel(row, { json: ['errors'], bools: ['update_existing'], omit: ['file_hash'] });
}

export async function listImportJobs(t: Transaction, churchId: number) {
  return (await select<any>(t, `SELECT * FROM import_jobs WHERE church_id = ? ORDER BY id DESC LIMIT 100`, [churchId])).map(jobDto);
}

export async function getImportJob(t: Transaction, churchId: number, id: number) {
  const row = await selectOne<any>(t, `SELECT * FROM import_jobs WHERE church_id = ? AND id = ?`, [churchId, id]);
  if (!row) throw new NotFoundError(`import ${id} was not found`);
  return jobDto(row);
}
