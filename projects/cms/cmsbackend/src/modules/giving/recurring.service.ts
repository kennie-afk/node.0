import { Transaction } from 'sequelize';
import db from '@models';
import { exec, select, selectOne } from '../finance/sql';
import { recordAudit } from '../finance/audit.service';
import { fromMinor, toInt } from '../../common/money';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { Frequency, dateOnly, dueDate, insertReturningId } from './shared';
import { recordContribution } from './contributions.service';
import { assertFund } from './types.service';

type Schedule = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

const dto = (row: any) => ({
  id: toInt(row.id),
  memberId: toInt(row.member_id),
  memberName: row.first_name ? `${row.first_name} ${row.last_name}` : undefined,
  givingTypeId: toInt(row.giving_type_id),
  fundId: row.fund_id === null ? null : toInt(row.fund_id),
  amount: fromMinor(row.amount_minor),
  amountMinor: toInt(row.amount_minor),
  frequency: row.frequency as Schedule,
  paymentMethod: row.payment_method,
  pledgeId: row.pledge_id === null ? null : toInt(row.pledge_id),
  startDate: dateOnly(row.start_date),
  endDate: row.end_date ? dateOnly(row.end_date) : null,
  nextDueDate: dateOnly(row.next_due_date),
  lastGeneratedDate: row.last_generated_date ? dateOnly(row.last_generated_date) : null,
  status: row.status
});

const SELECT = `SELECT r.*, m.first_name, m.last_name FROM recurring_gifts r JOIN members m ON m.church_id = r.church_id AND m.id = r.member_id`;

export interface RecurringInput {
  memberId: number;
  givingTypeId: number;
  fundId?: number | null;
  amountMinor: number;
  frequency: Schedule;
  paymentMethod?: string | null;
  depositAccountId?: number | null;
  pledgeId?: number | null;
  startDate: string;
  endDate?: string | null;
}

export async function createRecurring(t: Transaction, churchId: number, actorId: number, input: RecurringInput) {
  const member = await selectOne(t, `SELECT id FROM members WHERE church_id = :churchId AND id = :id`, { churchId, id: input.memberId });
  if (!member) throw new BadRequestError('memberId does not refer to a member in this church');
  const type = await selectOne(t, `SELECT id FROM giving_types WHERE church_id = :churchId AND id = :id`, { churchId, id: input.givingTypeId });
  if (!type) throw new BadRequestError('givingTypeId does not refer to a giving type in this church');
  if (input.fundId) await assertFund(t, churchId, input.fundId);
  if (input.endDate && input.endDate < input.startDate) throw new BadRequestError('endDate is before startDate');
  const id = await insertReturningId(
    t,
    `INSERT INTO recurring_gifts (church_id, member_id, giving_type_id, fund_id, amount_minor, frequency, payment_method, deposit_account_id, pledge_id, start_date, end_date, next_due_date, created_at, updated_at)
     VALUES (:churchId, :memberId, :typeId, :fundId, :amount, :frequency, :method, :deposit, :pledgeId, :start, :end, :start, :now, :now)`,
    {
      churchId,
      memberId: input.memberId,
      typeId: input.givingTypeId,
      fundId: input.fundId ?? null,
      amount: input.amountMinor,
      frequency: input.frequency,
      method: input.paymentMethod ?? null,
      deposit: input.depositAccountId ?? null,
      pledgeId: input.pledgeId ?? null,
      start: input.startDate,
      end: input.endDate ?? null,
      now: new Date()
    }
  );
  await recordAudit(t, churchId, { action: 'recurring_gift.create', entityType: 'recurring_gift', entityId: id, actorId, data: { memberId: input.memberId, amount: fromMinor(input.amountMinor), frequency: input.frequency } });
  return getRecurring(t, churchId, id);
}

export async function getRecurring(t: Transaction, churchId: number, id: number) {
  const row = await selectOne<any>(t, `${SELECT} WHERE r.church_id = :churchId AND r.id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`recurring gift ${id} was not found`);
  return dto(row);
}

export async function listRecurring(t: Transaction, churchId: number, filter: { memberId?: number; status?: string }) {
  const where = ['r.church_id = ?'];
  const params: unknown[] = [churchId];
  if (filter.memberId) {
    where.push('r.member_id = ?');
    params.push(filter.memberId);
  }
  if (filter.status) {
    where.push('r.status = ?');
    params.push(filter.status);
  }
  return (await select<any>(t, `${SELECT} WHERE ${where.join(' AND ')} ORDER BY r.next_due_date, r.id LIMIT 500`, params)).map(dto);
}

export async function updateRecurring(
  t: Transaction,
  churchId: number,
  actorId: number,
  id: number,
  changes: { amountMinor?: number; status?: 'ACTIVE' | 'PAUSED' | 'ENDED'; endDate?: string | null; paymentMethod?: string | null }
) {
  const current = await selectOne<any>(t, `SELECT * FROM recurring_gifts WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!current) throw new NotFoundError(`recurring gift ${id} was not found`);
  await exec(
    t,
    `UPDATE recurring_gifts SET amount_minor = :amount, status = :status, end_date = :end, payment_method = :method, updated_at = :now WHERE church_id = :churchId AND id = :id`,
    {
      amount: changes.amountMinor ?? toInt(current.amount_minor),
      status: changes.status ?? current.status,
      end: changes.endDate === undefined ? current.end_date : changes.endDate,
      method: changes.paymentMethod === undefined ? current.payment_method : changes.paymentMethod,
      now: new Date(),
      churchId,
      id
    }
  );
  await recordAudit(t, churchId, { action: 'recurring_gift.update', entityType: 'recurring_gift', entityId: id, actorId, data: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, String(v)])) });
  return getRecurring(t, churchId, id);
}

export interface GenerationResult {
  asOf: string;
  generated: number;
  skippedExisting: number;
  failed: Array<{ scheduleId: number; date: string; reason: string }>;
}

/**
 * Turns every recurring schedule that has fallen due into real contributions. Idempotent: each
 * occurrence carries the transaction id RG-<schedule>-<date>, so running it twice (or two
 * workers racing) creates each gift once. A schedule whose period is closed is reported, left
 * due, and retried next run; it never blocks the others. Up to 24 missed occurrences per
 * schedule are caught up per run.
 */
export async function generateDueRecurringGifts(t: Transaction, churchId: number, asOf: string, actorId: number | null = null): Promise<GenerationResult> {
  const due = await select<any>(
    t,
    `SELECT * FROM recurring_gifts WHERE church_id = :churchId AND status = 'ACTIVE' AND next_due_date <= :asOf ORDER BY next_due_date, id LIMIT 500`,
    { churchId, asOf }
  );
  const result: GenerationResult = { asOf, generated: 0, skippedExisting: 0, failed: [] };

  for (const schedule of due) {
    const scheduleId = toInt(schedule.id);
    const start = dateOnly(schedule.start_date);
    const frequency = schedule.frequency as Frequency;
    const end = schedule.end_date ? dateOnly(schedule.end_date) : null;
    let next = dateOnly(schedule.next_due_date);
    let k = 0;
    while (k < 5000 && dueDate(start, frequency, k) < next) k += 1;
    let lastGenerated: string | null = schedule.last_generated_date ? dateOnly(schedule.last_generated_date) : null;
    let caught = 0;
    let blocked = false;

    while (next <= asOf && (!end || next <= end) && caught < 24) {
      const transactionId = `RG-${scheduleId}-${next}`;
      const existing = await selectOne(t, `SELECT id FROM contribution WHERE church_id = :churchId AND transaction_id = :transactionId`, { churchId, transactionId });
      if (existing) {
        result.skippedExisting += 1;
      } else {
        try {
          // A savepoint, so one failing occurrence cannot poison the surrounding transaction.
          await db.sequelize.transaction({ transaction: t }, async (sp: Transaction) => {
            await recordContribution(sp, churchId, actorId, {
              memberId: toInt(schedule.member_id),
              amountMinor: toInt(schedule.amount_minor),
              date: next,
              givingTypeId: toInt(schedule.giving_type_id),
              fundId: schedule.fund_id === null ? null : toInt(schedule.fund_id),
              paymentMethod: schedule.payment_method ?? 'Bank Transfer',
              depositAccountId: schedule.deposit_account_id === null ? null : toInt(schedule.deposit_account_id),
              pledgeId: schedule.pledge_id === null ? null : toInt(schedule.pledge_id),
              transactionId,
              source: 'RECURRING',
              notes: `Recurring ${frequency.toLowerCase()} gift`
            });
          });
          result.generated += 1;
        } catch (error) {
          result.failed.push({ scheduleId, date: next, reason: error instanceof Error ? error.message : String(error) });
          blocked = true;
          break;
        }
      }
      lastGenerated = next;
      k += 1;
      caught += 1;
      next = dueDate(start, frequency, k);
    }

    const finished = Boolean(end && next > end);
    await exec(
      t,
      `UPDATE recurring_gifts SET next_due_date = :next, last_generated_date = :last, status = :status, updated_at = :now WHERE church_id = :churchId AND id = :id`,
      { next: blocked ? next : next, last: lastGenerated, status: finished ? 'ENDED' : 'ACTIVE', now: new Date(), churchId, id: scheduleId }
    );
  }
  return result;
}
