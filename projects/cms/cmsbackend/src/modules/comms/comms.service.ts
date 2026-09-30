import { QueryTypes, Transaction } from 'sequelize';
import db from '@models';
import { ApiError, BadRequestError, ConflictError } from '../../utils/errors';
import { camel, deleteRow, getRow, idCursor, idNext, insertRow, normalisePhone, select, selectOne, tableExists, updateRow, assertRef } from '../ops-kit';
import { runAsTenant } from '../../common/tenant-run';
import { requestTx } from '../../common/http';
import { isPostgres } from '../../common/tenant-db';
import { suppressedMembers } from '../dataops/consent.service';
import { getEmailProvider, getSmsProvider } from './providers';
import { recordAudit } from '../finance/audit.service';

export type Channel = 'SMS' | 'EMAIL';
export type Definition =
  | { type: 'ALL'; statuses?: string[] }
  | { type: 'MINISTRY'; ministryId: number }
  | { type: 'SMALL_GROUP'; smallGroupId: number }
  | { type: 'FILTER'; statuses?: string[]; gender?: string; city?: string; county?: string };

interface Recipient {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
}

const DEFAULT_STATUSES = ['Active', 'New Convert'];

/** Resolves an audience definition to members, in the query, scoped to the church. */
export async function resolveAudience(t: Transaction, churchId: number, def: Definition): Promise<Recipient[]> {
  const where = ['m.church_id = ?'];
  const params: unknown[] = [churchId];
  let join = '';
  if (def.type === 'MINISTRY') {
    join = 'JOIN ministry_members x ON x.church_id = m.church_id AND x.member_id = m.id AND x.ministry_id = ?';
    params.unshift(def.ministryId);
  } else if (def.type === 'SMALL_GROUP') {
    join = 'JOIN small_group_members x ON x.church_id = m.church_id AND x.member_id = m.id AND x.small_group_id = ?';
    params.unshift(def.smallGroupId);
  }
  const statuses = ('statuses' in def && def.statuses?.length ? def.statuses : DEFAULT_STATUSES);
  where.push(`m.status IN (${statuses.map(() => '?').join(',')})`);
  params.push(...statuses);
  if (def.type === 'FILTER') {
    if (def.gender) { where.push('m.gender = ?'); params.push(def.gender); }
    if (def.city) { where.push('LOWER(m.city) = ?'); params.push(def.city.toLowerCase()); }
    if (def.county) { where.push('LOWER(m.county) = ?'); params.push(def.county.toLowerCase()); }
  }
  const rows = await select<any>(t, `SELECT m.id, m.first_name, m.last_name, m.phone_number, m.email FROM members m ${join} WHERE ${where.join(' AND ')} ORDER BY m.id`, params);
  return rows.map((r) => ({ id: Number(r.id), firstName: r.first_name, lastName: r.last_name, phone: r.phone_number, email: r.email }));
}

export function render(template: string, r: Pick<Recipient, 'firstName' | 'lastName'>): string {
  return template
    .replace(/\{\{\s*firstName\s*\}\}/g, r.firstName)
    .replace(/\{\{\s*lastName\s*\}\}/g, r.lastName)
    .replace(/\{\{\s*fullName\s*\}\}/g, `${r.firstName} ${r.lastName}`);
}

// ---- templates --------------------------------------------------------------------------

export async function listTemplates(t: Transaction, churchId: number) {
  return (await select<any>(t, `SELECT * FROM message_templates WHERE church_id = ? ORDER BY name`, [churchId])).map((r) => camel(r, { bools: ['is_active'] }));
}
export async function createTemplate(t: Transaction, churchId: number, input: { name: string; channel: Channel; subject?: string | null; body: string }) {
  if (input.channel === 'EMAIL' && !input.subject) throw new BadRequestError('an e-mail template needs a subject');
  const id = await insertRow(t, 'message_templates', churchId, { name: input.name, channel: input.channel, subject: input.subject ?? null, body: input.body, is_active: true });
  return camel(await getRow(t, 'message_templates', churchId, id, 'template'), { bools: ['is_active'] });
}
export async function updateTemplate(t: Transaction, churchId: number, id: number, patch: { name?: string; subject?: string | null; body?: string; isActive?: boolean }) {
  await getRow(t, 'message_templates', churchId, id, 'template');
  await updateRow(t, 'message_templates', churchId, id, { name: patch.name, subject: patch.subject, body: patch.body, is_active: patch.isActive });
  return camel(await getRow(t, 'message_templates', churchId, id, 'template'), { bools: ['is_active'] });
}
export async function deleteTemplate(t: Transaction, churchId: number, id: number) {
  await getRow(t, 'message_templates', churchId, id, 'template');
  await select(t, `UPDATE campaigns SET template_id = NULL WHERE church_id = ? AND template_id = ? RETURNING id`, [churchId, id]);
  await deleteRow(t, 'message_templates', churchId, id);
}

// ---- segments ---------------------------------------------------------------------------

async function checkDefinition(t: Transaction, churchId: number, def: Definition) {
  if (def.type === 'MINISTRY') await assertRef(t, 'ministries', churchId, def.ministryId, 'ministryId');
  if (def.type === 'SMALL_GROUP') await assertRef(t, 'small_groups', churchId, def.smallGroupId, 'smallGroupId');
}
const segDto = (r: any) => camel(r, { json: ['definition'] });
export async function listSegments(t: Transaction, churchId: number) {
  return (await select<any>(t, `SELECT * FROM audience_segments WHERE church_id = ? ORDER BY name`, [churchId])).map(segDto);
}
export async function createSegment(t: Transaction, churchId: number, userId: number, input: { name: string; definition: Definition }) {
  await checkDefinition(t, churchId, input.definition);
  const id = await insertRow(t, 'audience_segments', churchId, { name: input.name, definition: JSON.stringify(input.definition), created_by: userId });
  return segDto(await getRow(t, 'audience_segments', churchId, id, 'segment'));
}
export async function updateSegment(t: Transaction, churchId: number, id: number, input: { name?: string; definition?: Definition }) {
  await getRow(t, 'audience_segments', churchId, id, 'segment');
  if (input.definition) await checkDefinition(t, churchId, input.definition);
  await updateRow(t, 'audience_segments', churchId, id, { name: input.name, definition: input.definition ? JSON.stringify(input.definition) : undefined });
  return segDto(await getRow(t, 'audience_segments', churchId, id, 'segment'));
}
export async function deleteSegment(t: Transaction, churchId: number, id: number) {
  await getRow(t, 'audience_segments', churchId, id, 'segment');
  if (await selectOne(t, `SELECT id FROM campaigns WHERE church_id = ? AND segment_id = ? LIMIT 1`, [churchId, id])) throw new ConflictError('a campaign uses this segment');
  await deleteRow(t, 'audience_segments', churchId, id);
}
export async function previewSegment(t: Transaction, churchId: number, id: number, channel: Channel) {
  const seg = segDto(await getRow(t, 'audience_segments', churchId, id, 'segment'));
  const people = await resolveAudience(t, churchId, seg.definition);
  const suppressed = await suppressedMembers(t, churchId, people.map((p) => p.id), channel);
  const reachable = people.filter((p) => !suppressed.has(p.id) && (channel === 'SMS' ? normalisePhone(p.phone) : p.email));
  return { total: people.length, reachable: reachable.length, optedOut: suppressed.size, sample: reachable.slice(0, 5).map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` })) };
}

// ---- campaigns --------------------------------------------------------------------------

const campDto = (r: any) => camel(r);
export async function createCampaign(t: Transaction, churchId: number, userId: number, input: { name: string; channel: Channel; purpose?: string; templateId?: number | null; subject?: string | null; body?: string; segmentId: number; scheduledAt?: Date | null }) {
  await assertRef(t, 'audience_segments', churchId, input.segmentId, 'segmentId');
  let body = input.body;
  let subject = input.subject ?? null;
  if (input.templateId) {
    const tpl = await getRow(t, 'message_templates', churchId, input.templateId, 'template');
    if (tpl.channel !== input.channel) throw new BadRequestError('the template is for a different channel');
    body = body ?? tpl.body;
    subject = subject ?? tpl.subject;
  }
  if (!body) throw new BadRequestError('a campaign needs a message body or a template');
  if (input.channel === 'EMAIL' && !subject) throw new BadRequestError('an e-mail campaign needs a subject');
  const id = await insertRow(t, 'campaigns', churchId, { name: input.name, channel: input.channel, purpose: input.purpose ?? 'COMMUNICATIONS', template_id: input.templateId ?? null, subject, body, segment_id: input.segmentId, status: 'DRAFT', scheduled_at: input.scheduledAt ?? null, recipient_count: 0, created_by: userId });
  return campDto(await getRow(t, 'campaigns', churchId, id, 'campaign'));
}

export async function listCampaigns(t: Transaction, churchId: number, limit: number, cursor?: string) {
  const after = idCursor(cursor);
  const rows = await select<any>(t, `SELECT * FROM campaigns WHERE church_id = ? ${after ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`, [churchId, ...(after ? [after] : []), limit + 1]);
  return idNext(rows.map(campDto), limit);
}

export async function campaignDetail(t: Transaction, churchId: number, id: number) {
  const campaign = campDto(await getRow(t, 'campaigns', churchId, id, 'campaign'));
  const stats = await select<any>(t, `SELECT status, COUNT(*) AS n FROM outbox_messages WHERE church_id = ? AND campaign_id = ? GROUP BY status`, [churchId, id]);
  return { ...campaign, delivery: Object.fromEntries(stats.map((s) => [s.status, Number(s.n)])) };
}

function dailyCap(): number {
  return Number(process.env.COMMS_DAILY_CAP ?? 5000);
}

async function sentToday(t: Transaction, churchId: number, channel: Channel): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const row = await selectOne<any>(t, `SELECT COUNT(*) AS n FROM outbox_messages WHERE church_id = ? AND channel = ? AND status <> 'SKIPPED' AND created_at >= ?`, [churchId, channel, since]);
  return Number(row?.n ?? 0);
}

/** Turns a draft campaign into per-recipient outbox rows. Re-sending a sent campaign is a no-op. */
export async function sendCampaign(t: Transaction, churchId: number, userId: number, id: number) {
  const campaign = await getRow(t, 'campaigns', churchId, id, 'campaign');
  if (campaign.status !== 'DRAFT') throw new ConflictError(`campaign is ${String(campaign.status).toLowerCase()}, not a draft`);
  const channel = campaign.channel as Channel;
  const segment = segDto(await getRow(t, 'audience_segments', churchId, campaign.segment_id, 'segment'));
  const people = await resolveAudience(t, churchId, segment.definition);
  const suppressed = await suppressedMembers(t, churchId, people.map((p) => p.id), channel, campaign.purpose);
  const notBefore = campaign.scheduled_at ? new Date(campaign.scheduled_at) : new Date();

  const deliverable: Array<{ person: Recipient; to: string }> = [];
  let skipped = 0;
  for (const person of people) {
    const to = channel === 'SMS' ? normalisePhone(person.phone) : person.email;
    if (suppressed.has(person.id) || !to) {
      skipped += 1;
      await insertRow(t, 'outbox_messages', churchId, { campaign_id: id, member_id: person.id, channel, purpose: campaign.purpose, to_address: to ?? '-', body: '-', status: 'SKIPPED', last_error: suppressed.has(person.id) ? 'opted out' : 'no address', dedupe_key: `c${id}:m${person.id}`, not_before: notBefore, attempts: 0 });
    } else {
      deliverable.push({ person, to });
    }
  }
  if (deliverable.length + (await sentToday(t, churchId, channel)) > dailyCap()) {
    throw new ApiError(`sending ${deliverable.length} ${channel} messages would exceed this church's daily cap of ${dailyCap()}`, 429);
  }
  for (const { person, to } of deliverable) {
    await insertRow(t, 'outbox_messages', churchId, {
      campaign_id: id, member_id: person.id, channel, purpose: campaign.purpose, to_address: to,
      subject: campaign.subject ? render(campaign.subject, person) : null, body: render(campaign.body, person),
      status: 'QUEUED', dedupe_key: `c${id}:m${person.id}`, not_before: notBefore, attempts: 0
    });
  }
  await updateRow(t, 'campaigns', churchId, id, { status: deliverable.length > 0 ? 'QUEUED' : 'COMPLETED', recipient_count: deliverable.length });
  await recordAudit(t, churchId, { action: 'campaign.send', entityType: 'campaign', entityId: id, actorId: userId, data: { queued: String(deliverable.length), skipped: String(skipped), channel } });
  return campaignDetail(t, churchId, id);
}

export async function cancelCampaign(t: Transaction, churchId: number, id: number) {
  const campaign = await getRow(t, 'campaigns', churchId, id, 'campaign');
  if (campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED') throw new ConflictError(`campaign is already ${String(campaign.status).toLowerCase()}`);
  await select(t, `UPDATE outbox_messages SET status = 'SKIPPED', last_error = 'campaign cancelled' WHERE church_id = ? AND campaign_id = ? AND status = 'QUEUED' RETURNING id`, [churchId, id]);
  await updateRow(t, 'campaigns', churchId, id, { status: 'CANCELLED' });
  return campaignDetail(t, churchId, id);
}

// ---- outbox -----------------------------------------------------------------------------

export interface EnqueueInput {
  channel: Channel;
  to: string;
  subject?: string | null;
  body: string;
  memberId?: number | null;
  purpose?: string;
  dedupeKey?: string | null;
  notBefore?: Date;
}

/**
 * The hook other modules (receipts, announcements, reminders) use to send a message. It respects
 * consent, is idempotent on dedupeKey, and returns the outbox id (or null if suppressed/duplicate).
 */
export async function enqueueMessage(t: Transaction, churchId: number, input: EnqueueInput): Promise<number | null> {
  const purpose = input.purpose ?? 'COMMUNICATIONS';
  if (input.dedupeKey) {
    const dup = await selectOne(t, `SELECT id FROM outbox_messages WHERE church_id = ? AND dedupe_key = ?`, [churchId, input.dedupeKey]);
    if (dup) return null;
  }
  if (input.memberId) {
    const blocked = await suppressedMembers(t, churchId, [input.memberId], input.channel, purpose);
    if (blocked.has(input.memberId)) return null;
  }
  const to = input.channel === 'SMS' ? normalisePhone(input.to) : input.to;
  if (!to) throw new BadRequestError('the recipient address is not valid');
  return insertRow(t, 'outbox_messages', churchId, { member_id: input.memberId ?? null, channel: input.channel, purpose, to_address: to, subject: input.subject ?? null, body: input.body, status: 'QUEUED', dedupe_key: input.dedupeKey ?? null, not_before: input.notBefore ?? new Date(), attempts: 0 });
}

export async function listOutbox(t: Transaction, churchId: number, filter: { status?: string; campaignId?: number; limit: number; cursor?: string }) {
  const where = ['church_id = ?'];
  const params: unknown[] = [churchId];
  if (filter.status) { where.push('status = ?'); params.push(filter.status); }
  if (filter.campaignId) { where.push('campaign_id = ?'); params.push(filter.campaignId); }
  const after = idCursor(filter.cursor);
  if (after) { where.push('id < ?'); params.push(after); }
  const rows = await select<any>(t, `SELECT id, campaign_id, member_id, channel, to_address, subject, status, attempts, last_error, sent_at, created_at FROM outbox_messages WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`, [...params, filter.limit + 1]);
  return idNext(rows.map((r) => camel(r)), filter.limit);
}

const MAX_ATTEMPTS = 3;

/**
 * Sends up to `batchSize` due messages for one church. Safe to run from several workers at once:
 * rows are claimed with FOR UPDATE SKIP LOCKED, so two workers never send the same message. A
 * failure is retried with back-off up to MAX_ATTEMPTS, then marked FAILED.
 */
export async function processOutbox(t: Transaction, churchId: number, batchSize = 50): Promise<{ sent: number; failed: number; retried: number }> {
  const lock = isPostgres(db.sequelize) ? 'FOR UPDATE SKIP LOCKED' : '';
  const due = await select<any>(t, `SELECT * FROM outbox_messages WHERE church_id = ? AND status = 'QUEUED' AND not_before <= ? ORDER BY id LIMIT ? ${lock}`, [churchId, new Date(), batchSize]);
  let sent = 0;
  let failed = 0;
  let retried = 0;
  const touched = new Set<number>();
  for (const row of due) {
    if (row.campaign_id) touched.add(Number(row.campaign_id));
    try {
      const result = row.channel === 'SMS' ? await getSmsProvider().send(row.to_address, row.body) : await getEmailProvider().send(row.to_address, row.subject ?? '', row.body);
      await updateRow(t, 'outbox_messages', churchId, Number(row.id), { status: 'SENT', attempts: Number(row.attempts) + 1, provider_ref: result.providerRef, sent_at: new Date(), last_error: null });
      sent += 1;
    } catch (error) {
      const attempts = Number(row.attempts) + 1;
      const final = attempts >= MAX_ATTEMPTS;
      await updateRow(t, 'outbox_messages', churchId, Number(row.id), {
        status: final ? 'FAILED' : 'QUEUED', attempts, last_error: (error as Error).message.slice(0, 300),
        not_before: final ? undefined : new Date(Date.now() + 2 ** attempts * 60_000)
      });
      if (final) failed += 1; else retried += 1;
    }
  }
  for (const campaignId of touched) {
    const left = await selectOne(t, `SELECT id FROM outbox_messages WHERE church_id = ? AND campaign_id = ? AND status = 'QUEUED' LIMIT 1`, [churchId, campaignId]);
    if (!left) await select(t, `UPDATE campaigns SET status = 'COMPLETED', updated_at = ? WHERE church_id = ? AND id = ? AND status = 'QUEUED' RETURNING id`, [new Date(), churchId, campaignId]);
  }
  return { sent, failed, retried };
}

/**
 * The worker's entry point: finds churches with mail due and drains each inside its own tenant
 * transaction. Returns totals so the caller can log them.
 */
export async function processOutboxAllChurches(perChurchBatch = 50, maxChurches = 200): Promise<{ churches: number; sent: number; failed: number; retried: number }> {
  let ids: number[];
  if (isPostgres(db.sequelize)) {
    const rows = (await db.sequelize.query('SELECT church_id FROM cms_outbox_pending_churches(:max)', { replacements: { max: maxChurches }, type: QueryTypes.SELECT, transaction: null as any })) as unknown as Array<{ church_id: number }>;
    ids = rows.map((r) => Number(r.church_id));
  } else {
    const rows = (await db.sequelize.query(`SELECT DISTINCT church_id FROM outbox_messages WHERE status = 'QUEUED' AND not_before <= :now LIMIT :max`, { replacements: { now: new Date(), max: maxChurches }, type: QueryTypes.SELECT })) as unknown as Array<{ church_id: number }>;
    ids = rows.map((r) => Number(r.church_id));
  }
  const totals = { churches: ids.length, sent: 0, failed: 0, retried: 0 };
  for (const churchId of ids) {
    const r = await runAsTenant(churchId, async () => processOutbox(await requestTx(), churchId, perChurchBatch));
    totals.sent += r.sent;
    totals.failed += r.failed;
    totals.retried += r.retried;
  }
  return totals;
}

export { tableExists };
