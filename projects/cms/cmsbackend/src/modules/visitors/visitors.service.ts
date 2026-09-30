import { Transaction } from 'sequelize';
import { BadRequestError, ConflictError } from '../../utils/errors';
import { assertMember, camel, getRow, idCursor, idNext, insertRow, normalisePhone, select, selectOne, updateRow } from '../ops-kit';

export const STAGES = ['NEW', 'CONTACTED', 'VISITED_AGAIN', 'CLASS', 'JOINED', 'LOST'] as const;
export type Stage = (typeof STAGES)[number];
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

async function history(t: Transaction, churchId: number, visitorId: number, from: string | null, to: string, userId: number | null, note?: string | null) {
  await insertRow(t, 'visitor_stage_history', churchId, { visitor_id: visitorId, from_stage: from, to_stage: to, note: note ?? null, changed_by: userId, changed_at: new Date() }, false);
}

export async function createVisitor(t: Transaction, churchId: number, userId: number, i: { firstName: string; lastName: string; phone?: string | null; email?: string | null; firstVisitDate?: string; source?: string | null; notes?: string | null; assignedMemberId?: number | null; autoTask?: boolean }) {
  await assertMember(t, churchId, i.assignedMemberId, 'assignedMemberId');
  const phone = i.phone ? normalisePhone(i.phone) : null;
  if (i.phone && !phone) throw new BadRequestError('the phone number is not valid');
  const visit = i.firstVisitDate ?? dayOf(new Date());
  const id = await insertRow(t, 'visitors', churchId, { first_name: i.firstName, last_name: i.lastName, phone, email: i.email?.toLowerCase() ?? null, first_visit_date: visit, source: i.source ?? null, notes: i.notes ?? null, stage: 'NEW', status: 'OPEN', assigned_member_id: i.assignedMemberId ?? null, created_by: userId });
  await history(t, churchId, id, null, 'NEW', userId, 'first recorded');
  if (i.autoTask !== false) {
    const due = new Date(`${visit}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 2);
    await insertRow(t, 'visitor_tasks', churchId, { visitor_id: id, title: 'Welcome call or visit', due_date: dayOf(due), assignee_member_id: i.assignedMemberId ?? null, status: 'OPEN', created_by: userId });
  }
  return getVisitor(t, churchId, id);
}

const VDTO = { days: ['first_visit_date'] };

export async function getVisitor(t: Transaction, churchId: number, id: number) {
  const v = await getRow(t, 'visitors', churchId, id, 'visitor');
  const [stageHistory, tasks, interactions] = await Promise.all([
    select<any>(t, `SELECT * FROM visitor_stage_history WHERE church_id = ? AND visitor_id = ? ORDER BY id`, [churchId, id]),
    select<any>(t, `SELECT * FROM visitor_tasks WHERE church_id = ? AND visitor_id = ? ORDER BY due_date, id`, [churchId, id]),
    select<any>(t, `SELECT * FROM visitor_interactions WHERE church_id = ? AND visitor_id = ? ORDER BY id DESC`, [churchId, id])
  ]);
  return { ...camel(v, VDTO), history: stageHistory.map((r) => camel(r)), tasks: tasks.map((r) => camel(r, { days: ['due_date'] })), interactions: interactions.map((r) => camel(r)) };
}

export async function listVisitors(t: Transaction, churchId: number, f: { stage?: string; status?: string; assignedMemberId?: number; q?: string; overdue?: boolean; limit: number; cursor?: string }) {
  const where = ['v.church_id = ?'];
  const params: unknown[] = [churchId];
  if (f.stage) { where.push('v.stage = ?'); params.push(f.stage); }
  if (f.status) { where.push('v.status = ?'); params.push(f.status); }
  if (f.assignedMemberId) { where.push('v.assigned_member_id = ?'); params.push(f.assignedMemberId); }
  if (f.q) { const like = `%${f.q.toLowerCase().replace(/[%_]/g, '')}%`; where.push("(LOWER(v.first_name) LIKE ? OR LOWER(v.last_name) LIKE ? OR COALESCE(v.phone,'') LIKE ?)"); params.push(like, like, like); }
  if (f.overdue) { where.push(`EXISTS (SELECT 1 FROM visitor_tasks k WHERE k.church_id = v.church_id AND k.visitor_id = v.id AND k.status = 'OPEN' AND k.due_date < ?)`); params.push(dayOf(new Date())); }
  const after = idCursor(f.cursor);
  if (after) { where.push('v.id < ?'); params.push(after); }
  const rows = await select<any>(t, `SELECT v.* FROM visitors v WHERE ${where.join(' AND ')} ORDER BY v.id DESC LIMIT ?`, [...params, f.limit + 1]);
  return idNext(rows.map((r) => camel(r, VDTO)), f.limit);
}

export async function updateVisitor(t: Transaction, churchId: number, id: number, p: { firstName?: string; lastName?: string; phone?: string | null; email?: string | null; source?: string | null; notes?: string | null; assignedMemberId?: number | null }) {
  const v = await getRow(t, 'visitors', churchId, id, 'visitor');
  if (v.status !== 'OPEN') throw new ConflictError('a converted or closed visitor cannot be edited');
  await assertMember(t, churchId, p.assignedMemberId, 'assignedMemberId');
  const phone = p.phone === undefined ? undefined : p.phone === null ? null : normalisePhone(p.phone);
  if (p.phone && !phone) throw new BadRequestError('the phone number is not valid');
  await updateRow(t, 'visitors', churchId, id, { first_name: p.firstName, last_name: p.lastName, phone, email: p.email === undefined ? undefined : p.email?.toLowerCase() ?? null, source: p.source, notes: p.notes, assigned_member_id: p.assignedMemberId });
  return getVisitor(t, churchId, id);
}

export async function moveStage(t: Transaction, churchId: number, userId: number, id: number, stage: Stage, note?: string | null) {
  const v = await getRow(t, 'visitors', churchId, id, 'visitor');
  if (v.status !== 'OPEN') throw new ConflictError('a converted or closed visitor cannot change stage');
  if (stage === 'JOINED') throw new BadRequestError('use the convert action to make a visitor a member');
  if (stage === v.stage) throw new ConflictError(`already at ${stage}`);
  await updateRow(t, 'visitors', churchId, id, { stage, status: stage === 'LOST' ? 'CLOSED' : 'OPEN' });
  await history(t, churchId, id, v.stage, stage, userId, note);
  return getVisitor(t, churchId, id);
}

export async function addInteraction(t: Transaction, churchId: number, userId: number, id: number, i: { type: 'CALL' | 'SMS' | 'VISIT' | 'EMAIL'; summary: string }) {
  const v = await getRow(t, 'visitors', churchId, id, 'visitor');
  await insertRow(t, 'visitor_interactions', churchId, { visitor_id: id, type: i.type, summary: i.summary, by_user_id: userId, occurred_at: new Date() }, false);
  if (v.stage === 'NEW' && v.status === 'OPEN') {
    await updateRow(t, 'visitors', churchId, id, { stage: 'CONTACTED' });
    await history(t, churchId, id, 'NEW', 'CONTACTED', userId, `first ${i.type.toLowerCase()} logged`);
  }
  return getVisitor(t, churchId, id);
}

export async function addTask(t: Transaction, churchId: number, userId: number, id: number, i: { title: string; dueDate: string; assigneeMemberId?: number | null }) {
  await getRow(t, 'visitors', churchId, id, 'visitor');
  await assertMember(t, churchId, i.assigneeMemberId, 'assigneeMemberId');
  await insertRow(t, 'visitor_tasks', churchId, { visitor_id: id, title: i.title, due_date: i.dueDate, assignee_member_id: i.assigneeMemberId ?? null, status: 'OPEN', created_by: userId });
  return getVisitor(t, churchId, id);
}

export async function completeTask(t: Transaction, churchId: number, taskId: number) {
  const task = await getRow(t, 'visitor_tasks', churchId, taskId, 'task');
  if (task.status === 'DONE') throw new ConflictError('the task is already done');
  await updateRow(t, 'visitor_tasks', churchId, taskId, { status: 'DONE', completed_at: new Date() });
  return getVisitor(t, churchId, Number(task.visitor_id));
}

export async function dueTasks(t: Transaction, churchId: number, f: { assigneeMemberId?: number; within: number }) {
  const until = new Date();
  until.setUTCDate(until.getUTCDate() + f.within);
  const rows = await select<any>(
    t,
    `SELECT k.*, v.first_name, v.last_name, v.phone FROM visitor_tasks k JOIN visitors v ON v.church_id = k.church_id AND v.id = k.visitor_id
      WHERE k.church_id = ? AND k.status = 'OPEN' AND k.due_date <= ? ${f.assigneeMemberId ? 'AND k.assignee_member_id = ?' : ''} ORDER BY k.due_date LIMIT 500`,
    [churchId, dayOf(until), ...(f.assigneeMemberId ? [f.assigneeMemberId] : [])]
  );
  const today = dayOf(new Date());
  return rows.map((r) => ({ ...camel(r, { days: ['due_date'] }), overdue: String(camel(r, { days: ['due_date'] }).dueDate) < today }));
}

export async function pipeline(t: Transaction, churchId: number) {
  const rows = await select<any>(t, `SELECT stage, COUNT(*) AS n FROM visitors WHERE church_id = ? GROUP BY stage`, [churchId]);
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const r of rows) counts[r.stage] = Number(r.n);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { stages: counts, total, conversionRate: total === 0 ? 0 : Math.round((counts.JOINED / total) * 1000) / 10 };
}

/**
 * Converts a visitor to a member. The visitor row, its stage history, tasks and interactions all
 * stay, linked to the new member, so the story of how someone came in is never lost. If a member
 * with the same phone or e-mail already exists the caller must say so explicitly.
 */
export async function convert(t: Transaction, churchId: number, userId: number, id: number, opts: { linkExistingMemberId?: number | null }) {
  const v = await getRow(t, 'visitors', churchId, id, 'visitor');
  if (v.status === 'CONVERTED') throw new ConflictError('this visitor has already been converted');
  let memberId: number;
  if (opts.linkExistingMemberId) {
    await assertMember(t, churchId, opts.linkExistingMemberId, 'linkExistingMemberId');
    memberId = opts.linkExistingMemberId;
  } else {
    const dupe = await selectOne<any>(t, `SELECT id FROM members WHERE church_id = ? AND ((? IS NOT NULL AND phone_number = ?) OR (? IS NOT NULL AND LOWER(email) = ?))`, [churchId, v.phone, v.phone, v.email, v.email?.toLowerCase() ?? null]);
    if (dupe) throw new ConflictError(`a member with the same phone or e-mail already exists (member ${dupe.id}); pass linkExistingMemberId to link to them`);
    memberId = await insertRow(t, 'members', churchId, { first_name: v.first_name, last_name: v.last_name, phone_number: v.phone, email: v.email, status: 'New Convert', membership_date: dayOf(new Date()), notes: `Joined from visitor pipeline (first visit ${String(v.first_visit_date).slice(0, 10)})` });
  }
  await updateRow(t, 'visitors', churchId, id, { converted_member_id: memberId, stage: 'JOINED', status: 'CONVERTED' });
  await history(t, churchId, id, v.stage, 'JOINED', userId, `converted to member ${memberId}`);
  return { memberId, visitor: await getVisitor(t, churchId, id) };
}
