import { Transaction } from 'sequelize';
import { exec, select, selectOne } from '../finance/sql';
import { recordAudit } from '../finance/audit.service';
import { decodeCursor, toKeysetPage } from '../../common/keyset';
import { fromMinor, toInt } from '../../common/money';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { Frequency, dateOnly, insertReturningId, installmentsDue, today } from './shared';
import { assertFund } from './types.service';

const CENTS = `CAST(ROUND(c.amount * 100) AS BIGINT)`;

// ---- campaigns ----------------------------------------------------------------------------

export interface CampaignInput {
  name: string;
  description?: string | null;
  goalMinor?: number;
  startDate: string;
  endDate?: string | null;
  fundId?: number | null;
}

function ratioBp(part: number, whole: number): number {
  return whole > 0 ? Math.round((part * 10_000) / whole) : 0;
}

export async function campaignProgress(t: Transaction, churchId: number, row: any) {
  const id = toInt(row.id);
  const raised = await selectOne<any>(
    t,
    `SELECT COALESCE(SUM(${CENTS}), 0) AS n, COUNT(*) AS gifts, COUNT(DISTINCT c.member_id) AS donors
       FROM contribution c WHERE c.church_id = :churchId AND c.campaign_id = :id AND c.status = 'POSTED'`,
    { churchId, id }
  );
  const pledged = await selectOne<any>(
    t,
    `SELECT COALESCE(SUM(amount_minor), 0) AS n, COUNT(*) AS pledges FROM pledges WHERE church_id = :churchId AND campaign_id = :id AND status <> 'CANCELLED'`,
    { churchId, id }
  );
  const raisedMinor = toInt(raised?.n);
  const pledgedMinor = toInt(pledged?.n);
  const goal = toInt(row.goal_minor);
  return {
    id,
    name: row.name,
    description: row.description,
    goal: fromMinor(goal),
    goalMinor: goal,
    startDate: dateOnly(row.start_date),
    endDate: row.end_date ? dateOnly(row.end_date) : null,
    fundId: row.fund_id === null ? null : toInt(row.fund_id),
    status: row.status,
    raised: fromMinor(raisedMinor),
    raisedMinor,
    pledged: fromMinor(pledgedMinor),
    pledgedMinor,
    pledgeCount: toInt(pledged?.pledges),
    giftCount: toInt(raised?.gifts),
    donorCount: toInt(raised?.donors),
    progressBasisPoints: ratioBp(raisedMinor, goal),
    remaining: fromMinor(Math.max(goal - raisedMinor, 0))
  };
}

export async function createCampaign(t: Transaction, churchId: number, actorId: number, input: CampaignInput) {
  const dup = await selectOne(t, `SELECT id FROM giving_campaigns WHERE church_id = :churchId AND name = :name`, { churchId, name: input.name });
  if (dup) throw new ConflictError('a campaign with that name already exists');
  if (input.fundId) await assertFund(t, churchId, input.fundId);
  if (input.endDate && input.endDate < input.startDate) throw new BadRequestError('endDate is before startDate');
  await exec(
    t,
    `INSERT INTO giving_campaigns (church_id, name, description, goal_minor, start_date, end_date, fund_id, created_at, updated_at)
     VALUES (:churchId, :name, :description, :goal, :start, :end, :fund, :now, :now)`,
    { churchId, name: input.name, description: input.description ?? null, goal: input.goalMinor ?? 0, start: input.startDate, end: input.endDate ?? null, fund: input.fundId ?? null, now: new Date() }
  );
  const row = await selectOne<any>(t, `SELECT * FROM giving_campaigns WHERE church_id = :churchId AND name = :name`, { churchId, name: input.name });
  await recordAudit(t, churchId, { action: 'campaign.create', entityType: 'campaign', entityId: toInt(row!.id), actorId, data: { name: input.name } });
  return campaignProgress(t, churchId, row);
}

export async function getCampaign(t: Transaction, churchId: number, id: number) {
  const row = await selectOne<any>(t, `SELECT * FROM giving_campaigns WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`campaign ${id} was not found`);
  return campaignProgress(t, churchId, row);
}

export async function listCampaigns(t: Transaction, churchId: number, status?: string) {
  const rows = await select<any>(
    t,
    `SELECT * FROM giving_campaigns WHERE church_id = ? ${status ? 'AND status = ?' : ''} ORDER BY start_date DESC, id DESC LIMIT 200`,
    status ? [churchId, status] : [churchId]
  );
  return Promise.all(rows.map((row) => campaignProgress(t, churchId, row)));
}

export async function updateCampaign(
  t: Transaction,
  churchId: number,
  actorId: number,
  id: number,
  changes: { name?: string; description?: string | null; goalMinor?: number; endDate?: string | null; status?: string; fundId?: number | null }
) {
  const current = await selectOne<any>(t, `SELECT * FROM giving_campaigns WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!current) throw new NotFoundError(`campaign ${id} was not found`);
  if (changes.fundId) await assertFund(t, churchId, changes.fundId);
  await exec(
    t,
    `UPDATE giving_campaigns SET name = :name, description = :description, goal_minor = :goal, end_date = :end, status = :status, fund_id = :fund, updated_at = :now WHERE church_id = :churchId AND id = :id`,
    {
      name: changes.name ?? current.name,
      description: changes.description === undefined ? current.description : changes.description,
      goal: changes.goalMinor ?? toInt(current.goal_minor),
      end: changes.endDate === undefined ? current.end_date : changes.endDate,
      status: changes.status ?? current.status,
      fund: changes.fundId === undefined ? current.fund_id : changes.fundId,
      now: new Date(),
      churchId,
      id
    }
  );
  await recordAudit(t, churchId, { action: 'campaign.update', entityType: 'campaign', entityId: id, actorId, data: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, String(v)])) });
  return getCampaign(t, churchId, id);
}

// ---- pledges ------------------------------------------------------------------------------

export interface PledgeInput {
  memberId: number;
  campaignId?: number | null;
  givingTypeId?: number | null;
  amountMinor: number;
  installmentMinor?: number | null;
  frequency: Frequency;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
}

async function fulfilled(t: Transaction, churchId: number, pledgeIds: number[]): Promise<Map<number, number>> {
  if (pledgeIds.length === 0) return new Map();
  const rows = await select<any>(
    t,
    `SELECT c.pledge_id, SUM(${CENTS}) AS n FROM contribution c
      WHERE c.church_id = ? AND c.status = 'POSTED' AND c.pledge_id IN (${pledgeIds.map(() => '?').join(',')}) GROUP BY c.pledge_id`,
    [churchId, ...pledgeIds]
  );
  return new Map(rows.map((r) => [toInt(r.pledge_id), toInt(r.n)]));
}

function pledgeDto(row: any, paid: number, asOf: string) {
  const total = toInt(row.amount_minor);
  const installment = row.installment_minor === null ? null : toInt(row.installment_minor);
  const start = dateOnly(row.start_date);
  const end = row.end_date ? dateOnly(row.end_date) : null;
  let dueToDate = total;
  if (row.frequency !== 'ONE_TIME' && installment) {
    dueToDate = Math.min(total, installment * installmentsDue(start, row.frequency, asOf, end));
  } else if (asOf < start) {
    dueToDate = 0;
  }
  return {
    id: toInt(row.id),
    memberId: toInt(row.member_id),
    memberName: row.first_name ? `${row.first_name} ${row.last_name}` : undefined,
    campaignId: row.campaign_id === null ? null : toInt(row.campaign_id),
    givingTypeId: row.giving_type_id === null ? null : toInt(row.giving_type_id),
    amount: fromMinor(total),
    amountMinor: total,
    installment: installment === null ? null : fromMinor(installment),
    frequency: row.frequency,
    startDate: start,
    endDate: end,
    status: row.status,
    notes: row.notes,
    fulfilled: fromMinor(paid),
    fulfilledMinor: paid,
    outstanding: fromMinor(Math.max(total - paid, 0)),
    outstandingMinor: Math.max(total - paid, 0),
    progressBasisPoints: ratioBp(Math.min(paid, total), total),
    dueToDate: fromMinor(dueToDate),
    behind: fromMinor(row.status === 'ACTIVE' ? Math.max(dueToDate - paid, 0) : 0),
    asOf
  };
}

const PLEDGE_SELECT = `SELECT p.*, m.first_name, m.last_name FROM pledges p JOIN members m ON m.church_id = p.church_id AND m.id = p.member_id`;

export async function createPledge(t: Transaction, churchId: number, actorId: number, input: PledgeInput) {
  const member = await selectOne(t, `SELECT id FROM members WHERE church_id = :churchId AND id = :id`, { churchId, id: input.memberId });
  if (!member) throw new BadRequestError('memberId does not refer to a member in this church');
  if (input.campaignId) {
    const campaign = await selectOne(t, `SELECT id FROM giving_campaigns WHERE church_id = :churchId AND id = :id`, { churchId, id: input.campaignId });
    if (!campaign) throw new BadRequestError('campaignId does not refer to a campaign in this church');
  }
  if (input.givingTypeId) {
    const type = await selectOne(t, `SELECT id FROM giving_types WHERE church_id = :churchId AND id = :id`, { churchId, id: input.givingTypeId });
    if (!type) throw new BadRequestError('givingTypeId does not refer to a giving type in this church');
  }
  if (input.endDate && input.endDate < input.startDate) throw new BadRequestError('endDate is before startDate');
  if (input.installmentMinor && input.installmentMinor > input.amountMinor) throw new BadRequestError('an installment cannot exceed the pledge');
  const id = await insertReturningId(
    t,
    `INSERT INTO pledges (church_id, member_id, campaign_id, giving_type_id, amount_minor, installment_minor, frequency, start_date, end_date, notes, created_at, updated_at)
     VALUES (:churchId, :memberId, :campaignId, :typeId, :amount, :installment, :frequency, :start, :end, :notes, :now, :now)`,
    {
      churchId,
      memberId: input.memberId,
      campaignId: input.campaignId ?? null,
      typeId: input.givingTypeId ?? null,
      amount: input.amountMinor,
      installment: input.installmentMinor ?? null,
      frequency: input.frequency,
      start: input.startDate,
      end: input.endDate ?? null,
      notes: input.notes ?? null,
      now: new Date()
    }
  );
  await recordAudit(t, churchId, { action: 'pledge.create', entityType: 'pledge', entityId: id, actorId, data: { memberId: input.memberId, amount: fromMinor(input.amountMinor) } });
  return getPledge(t, churchId, id);
}

export async function getPledge(t: Transaction, churchId: number, id: number, asOf = today()) {
  const row = await selectOne<any>(t, `${PLEDGE_SELECT} WHERE p.church_id = :churchId AND p.id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`pledge ${id} was not found`);
  const paid = (await fulfilled(t, churchId, [id])).get(id) ?? 0;
  return pledgeDto(row, paid, asOf);
}

export async function listPledges(
  t: Transaction,
  churchId: number,
  filter: { memberId?: number; campaignId?: number; status?: string; behindOnly?: boolean },
  limit: number,
  cursor?: string
) {
  const where = ['p.church_id = ?'];
  const params: unknown[] = [churchId];
  for (const [column, value] of [['p.member_id', filter.memberId], ['p.campaign_id', filter.campaignId], ['p.status', filter.status]] as const) {
    if (value) {
      where.push(`${column} = ?`);
      params.push(value);
    }
  }
  const c = decodeCursor<{ id: number }>(cursor);
  if (c) {
    where.push('p.id < ?');
    params.push(c.id);
  }
  const rows = await select<any>(t, `${PLEDGE_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT ?`, [...params, limit + 1]);
  const page = rows.slice(0, limit);
  const paid = await fulfilled(t, churchId, page.map((r) => toInt(r.id)));
  const asOf = today();
  let data = page.map((r) => pledgeDto(r, paid.get(toInt(r.id)) ?? 0, asOf));
  if (filter.behindOnly) data = data.filter((p) => p.behind !== '0.00');
  return { data, nextCursor: rows.length > limit ? toKeysetPage(rows, limit, (r: any) => ({ id: toInt(r.id) })).nextCursor : null, limit };
}

export async function updatePledge(
  t: Transaction,
  churchId: number,
  actorId: number,
  id: number,
  changes: { amountMinor?: number; installmentMinor?: number | null; endDate?: string | null; notes?: string | null }
) {
  const current = await selectOne<any>(t, `SELECT * FROM pledges WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!current) throw new NotFoundError(`pledge ${id} was not found`);
  if (current.status === 'CANCELLED') throw new ConflictError('a cancelled pledge cannot be changed');
  const amount = changes.amountMinor ?? toInt(current.amount_minor);
  const installment = changes.installmentMinor === undefined ? current.installment_minor : changes.installmentMinor;
  if (installment && Number(installment) > amount) throw new BadRequestError('an installment cannot exceed the pledge');
  await exec(
    t,
    `UPDATE pledges SET amount_minor = :amount, installment_minor = :installment, end_date = :end, notes = :notes, updated_at = :now WHERE church_id = :churchId AND id = :id`,
    {
      amount,
      installment,
      end: changes.endDate === undefined ? current.end_date : changes.endDate,
      notes: changes.notes === undefined ? current.notes : changes.notes,
      now: new Date(),
      churchId,
      id
    }
  );
  await recordAudit(t, churchId, { action: 'pledge.update', entityType: 'pledge', entityId: id, actorId, data: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, String(v)])) });
  await syncPledgeStatus(t, churchId, id);
  return getPledge(t, churchId, id);
}

export async function cancelPledge(t: Transaction, churchId: number, actorId: number, id: number, reason: string) {
  const current = await selectOne<any>(t, `SELECT status FROM pledges WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!current) throw new NotFoundError(`pledge ${id} was not found`);
  if (current.status === 'CANCELLED') throw new ConflictError('that pledge is already cancelled');
  await exec(t, `UPDATE pledges SET status = 'CANCELLED', notes = :notes, updated_at = :now WHERE church_id = :churchId AND id = :id`, {
    notes: `Cancelled: ${reason}`.slice(0, 500),
    now: new Date(),
    churchId,
    id
  });
  await recordAudit(t, churchId, { action: 'pledge.cancel', entityType: 'pledge', entityId: id, actorId, data: { reason } });
  return getPledge(t, churchId, id);
}

/** ACTIVE <-> FULFILLED follows what has actually been given (and un-follows a voided gift). */
export async function syncPledgeStatus(t: Transaction, churchId: number, pledgeId: number): Promise<void> {
  const pledge = await selectOne<any>(t, `SELECT amount_minor, status FROM pledges WHERE church_id = :churchId AND id = :pledgeId`, { churchId, pledgeId });
  if (!pledge || pledge.status === 'CANCELLED') return;
  const paid = (await fulfilled(t, churchId, [pledgeId])).get(pledgeId) ?? 0;
  const next = paid >= toInt(pledge.amount_minor) ? 'FULFILLED' : 'ACTIVE';
  if (next !== pledge.status) {
    await exec(t, `UPDATE pledges SET status = :next, updated_at = :now WHERE church_id = :churchId AND id = :pledgeId`, { next, now: new Date(), churchId, pledgeId });
  }
}
