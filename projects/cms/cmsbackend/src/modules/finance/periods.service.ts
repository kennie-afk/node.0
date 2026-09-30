import { Transaction } from 'sequelize';
import { exec, select, selectOne } from './sql';
import { toInt } from '../../common/money';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { recordAudit } from './audit.service';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const CLOSING_PERIOD_NUMBER = 13;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export interface PeriodRow {
  id: number;
  fiscalYearId: number;
  number: number;
  name: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED' | 'LOCKED';
}

function mapPeriod(row: any): PeriodRow {
  return {
    id: toInt(row.id),
    fiscalYearId: toInt(row.fiscal_year_id),
    number: toInt(row.number),
    name: row.name,
    startDate: String(row.start_date).slice(0, 10),
    endDate: String(row.end_date).slice(0, 10),
    status: row.status
  };
}

async function startMonth(t: Transaction, churchId: number): Promise<number> {
  const row = await selectOne<any>(t, `SELECT fiscal_year_start_month FROM finance_settings WHERE church_id = :churchId`, { churchId });
  return row ? toInt(row.fiscal_year_start_month) : 1;
}

/** Returns the fiscal year containing `date`, creating it (with its 12 periods + closing period) on demand. */
export async function ensureFiscalYearFor(t: Transaction, churchId: number, date: string): Promise<number> {
  const found = await selectOne<any>(
    t,
    `SELECT id FROM fiscal_years WHERE church_id = :churchId AND start_date <= :date AND end_date >= :date`,
    { churchId, date }
  );
  if (found) return toInt(found.id);

  const m = await startMonth(t, churchId);
  const y = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const startYear = month >= m ? y : y - 1;
  const endMonth = m === 1 ? 12 : m - 1;
  const endYear = m === 1 ? startYear : startYear + 1;
  const start = `${startYear}-${pad(m)}-01`;
  const end = `${endYear}-${pad(endMonth)}-${pad(lastDayOfMonth(endYear, endMonth))}`;
  const name = m === 1 ? `FY${startYear}` : `FY${startYear}/${String(endYear).slice(2)}`;

  await exec(t, `INSERT INTO fiscal_years (church_id, name, start_date, end_date) VALUES (:churchId, :name, :start, :end)`, {
    churchId,
    name,
    start,
    end
  });
  const year = await selectOne<any>(t, `SELECT id FROM fiscal_years WHERE church_id = :churchId AND name = :name`, { churchId, name });
  const yearId = toInt(year!.id);

  for (let i = 0; i < 12; i += 1) {
    const monthIndex = (m - 1 + i) % 12;
    const calendarYear = startYear + Math.floor((m - 1 + i) / 12);
    const from = `${calendarYear}-${pad(monthIndex + 1)}-01`;
    const to = `${calendarYear}-${pad(monthIndex + 1)}-${pad(lastDayOfMonth(calendarYear, monthIndex + 1))}`;
    await exec(
      t,
      `INSERT INTO fiscal_periods (church_id, fiscal_year_id, number, name, start_date, end_date)
       VALUES (:churchId, :yearId, :number, :name, :from, :to)`,
      { churchId, yearId, number: i + 1, name: `${MONTHS[monthIndex]} ${calendarYear}`, from, to }
    );
  }
  // Year-end closing entries live in their own period so they never distort the year's activity.
  await exec(
    t,
    `INSERT INTO fiscal_periods (church_id, fiscal_year_id, number, name, start_date, end_date)
     VALUES (:churchId, :yearId, :number, :name, :end, :end)`,
    { churchId, yearId, number: CLOSING_PERIOD_NUMBER, name: `${name} closing`, end }
  );
  return yearId;
}

/** The regular (1-12) period containing a date. Creates the year if it does not exist yet. */
export async function resolvePeriod(t: Transaction, churchId: number, date: string): Promise<PeriodRow> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BadRequestError('date must be YYYY-MM-DD');
  }
  const read = () =>
    selectOne<any>(
      t,
      `SELECT * FROM fiscal_periods WHERE church_id = :churchId AND start_date <= :date AND end_date >= :date AND number <= 12`,
      { churchId, date }
    );
  let row = await read();
  if (!row) {
    await ensureFiscalYearFor(t, churchId, date);
    row = await read();
  }
  if (!row) throw new BadRequestError(`no fiscal period covers ${date}`);
  return mapPeriod(row);
}

export async function getPeriod(t: Transaction, churchId: number, periodId: number): Promise<PeriodRow> {
  const row = await selectOne<any>(t, `SELECT * FROM fiscal_periods WHERE church_id = :churchId AND id = :periodId`, { churchId, periodId });
  if (!row) throw new NotFoundError(`fiscal period ${periodId} was not found`);
  return mapPeriod(row);
}

export async function listFiscalYears(t: Transaction, churchId: number) {
  const years = await select<any>(t, `SELECT * FROM fiscal_years WHERE church_id = :churchId ORDER BY start_date DESC`, { churchId });
  const periods = await select<any>(t, `SELECT * FROM fiscal_periods WHERE church_id = :churchId ORDER BY start_date, number`, { churchId });
  return years.map((year) => ({
    id: toInt(year.id),
    name: year.name,
    startDate: String(year.start_date).slice(0, 10),
    endDate: String(year.end_date).slice(0, 10),
    status: year.status,
    closedAt: year.closed_at,
    periods: periods.filter((p) => toInt(p.fiscal_year_id) === toInt(year.id)).map(mapPeriod)
  }));
}

/**
 * Closing is sequential: a month cannot be closed while an earlier one in the same year is still
 * open, because the later month's figures would be final while the earlier one can still move.
 */
export async function closePeriod(t: Transaction, churchId: number, periodId: number, actorId: number): Promise<PeriodRow> {
  const period = await getPeriod(t, churchId, periodId);
  if (period.number === CLOSING_PERIOD_NUMBER) {
    throw new BadRequestError('the closing period is closed by closing the fiscal year');
  }
  if (period.status !== 'OPEN') throw new ConflictError(`period ${period.name} is already ${period.status.toLowerCase()}`);
  const earlier = await selectOne<any>(
    t,
    `SELECT name FROM fiscal_periods WHERE church_id = :churchId AND fiscal_year_id = :yearId AND number < :number AND status = 'OPEN' ORDER BY number LIMIT 1`,
    { churchId, yearId: period.fiscalYearId, number: period.number }
  );
  if (earlier) throw new ConflictError(`close ${earlier.name} first`);
  await exec(t, `UPDATE fiscal_periods SET status = 'CLOSED', closed_at = :now, closed_by = :actorId, updated_at = :now WHERE church_id = :churchId AND id = :periodId`, {
    now: new Date(),
    actorId,
    churchId,
    periodId
  });
  await recordAudit(t, churchId, { action: 'period.close', entityType: 'fiscal_period', entityId: periodId, actorId, data: { name: period.name } });
  return { ...period, status: 'CLOSED' };
}

/** Reopening rewinds history, so it is refused once the year is closed or a later period is closed. */
export async function reopenPeriod(t: Transaction, churchId: number, periodId: number, actorId: number, reason: string): Promise<PeriodRow> {
  const period = await getPeriod(t, churchId, periodId);
  if (period.status === 'OPEN') throw new ConflictError(`period ${period.name} is already open`);
  if (period.status === 'LOCKED') throw new ConflictError(`period ${period.name} belongs to a closed fiscal year and is locked`);
  const later = await selectOne<any>(
    t,
    `SELECT name FROM fiscal_periods WHERE church_id = :churchId AND fiscal_year_id = :yearId AND number > :number AND number <= 12 AND status <> 'OPEN' ORDER BY number LIMIT 1`,
    { churchId, yearId: period.fiscalYearId, number: period.number }
  );
  if (later) throw new ConflictError(`reopen ${later.name} first`);
  await exec(t, `UPDATE fiscal_periods SET status = 'OPEN', closed_at = NULL, closed_by = NULL, updated_at = :now WHERE church_id = :churchId AND id = :periodId`, {
    now: new Date(),
    churchId,
    periodId
  });
  await recordAudit(t, churchId, { action: 'period.reopen', entityType: 'fiscal_period', entityId: periodId, actorId, data: { name: period.name, reason } });
  return { ...period, status: 'OPEN' };
}
