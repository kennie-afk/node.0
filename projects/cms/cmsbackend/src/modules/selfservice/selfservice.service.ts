import { Transaction } from 'sequelize';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { camel, columnExists, getRow, idCursor, idNext, normalisePhone, requireLinkedMember, select, selectOne, tableExists, updateRow } from '../ops-kit';
import { permissionsOf, effectiveRole } from '../../auth/permissions';
import { fromMinor } from '../../common/money';
import { recordAudit } from '../finance/audit.service';

export async function profile(t: Transaction, churchId: number, userId: number) {
  const user = await selectOne<any>(t, `SELECT id, username, email, role, is_admin, member_id FROM users WHERE church_id = ? AND id = ?`, [churchId, userId]);
  if (!user) throw new NotFoundError('account not found');
  const role = effectiveRole(user.role, user.is_admin === true || user.is_admin === 1);
  const member = user.member_id ? await selectOne<any>(t, `SELECT id, first_name, middle_name, last_name, gender, date_of_birth, email, phone_number, address, city, county, postal_code, status, baptism_date, membership_date, family_id FROM members WHERE church_id = ? AND id = ?`, [churchId, user.member_id]) : null;
  return {
    user: { id: Number(user.id), username: user.username, email: user.email, role },
    permissions: permissionsOf(role),
    member: member ? camel(member, { days: ['date_of_birth', 'baptism_date', 'membership_date'] }) : null
  };
}

const EDITABLE = { phoneNumber: 'phone_number', email: 'email', address: 'address', city: 'city', county: 'county', postalCode: 'postal_code' } as const;

/** A member may correct how the church reaches them, never their status, family or history. */
export async function updateProfile(t: Transaction, churchId: number, userId: number, patch: Partial<Record<keyof typeof EDITABLE, string | null>>) {
  const memberId = await requireLinkedMember(t, churchId, userId);
  const values: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(EDITABLE)) {
    const v = patch[key as keyof typeof EDITABLE];
    if (v === undefined) continue;
    if (key === 'phoneNumber' && v) {
      const phone = normalisePhone(v);
      if (!phone) throw new BadRequestError('that phone number is not valid');
      values[column] = phone;
    } else values[column] = key === 'email' && v ? v.toLowerCase() : v;
  }
  await updateRow(t, 'members', churchId, memberId, values);
  return profile(t, churchId, userId);
}

export async function groups(t: Transaction, churchId: number, userId: number) {
  const memberId = await requireLinkedMember(t, churchId, userId);
  const ministries = await select<any>(t, `SELECT m.id, m.name, mm.role FROM ministry_members mm JOIN ministries m ON m.church_id = mm.church_id AND m.id = mm.ministry_id WHERE mm.church_id = ? AND mm.member_id = ? ORDER BY m.name`, [churchId, memberId]);
  const smallGroups = await select<any>(t, `SELECT g.id, g.name FROM small_group_members sg JOIN small_groups g ON g.church_id = sg.church_id AND g.id = sg.small_group_id WHERE sg.church_id = ? AND sg.member_id = ? ORDER BY g.name`, [churchId, memberId]);
  return { ministries: ministries.map((r) => camel(r)), smallGroups: smallGroups.map((r) => camel(r)) };
}

export async function events(t: Transaction, churchId: number, userId: number) {
  const memberId = await requireLinkedMember(t, churchId, userId);
  const upcoming = await select<any>(t, `SELECT id, name, type, start_time, end_time, location FROM events WHERE church_id = ? AND start_time >= ? ORDER BY start_time LIMIT 20`, [churchId, new Date()]);
  const serving = (await tableExists(t, 'roster_assignments'))
    ? await select<any>(t, `SELECT a.id, a.status, a.starts_at, e.name AS event_name, tm.name AS team_name FROM roster_assignments a JOIN events e ON e.church_id = a.church_id AND e.id = a.event_id JOIN volunteer_teams tm ON tm.church_id = a.church_id AND tm.id = a.team_id WHERE a.church_id = ? AND a.member_id = ? AND a.starts_at >= ? AND a.status <> 'DECLINED' ORDER BY a.starts_at LIMIT 20`, [churchId, memberId, new Date()])
    : [];
  return { upcoming: upcoming.map((r) => camel(r)), serving: serving.map((r) => camel(r)) };
}

export async function family(t: Transaction, churchId: number, userId: number) {
  const memberId = await requireLinkedMember(t, churchId, userId);
  const me = await getRow(t, 'members', churchId, memberId, 'member');
  if (!me.family_id) return { family: null, members: [] };
  const fam = await getRow(t, 'families', churchId, Number(me.family_id), 'family');
  const members = await select<any>(t, `SELECT id, first_name, last_name, gender, status FROM members WHERE church_id = ? AND family_id = ? ORDER BY id`, [churchId, me.family_id]);
  return { family: { id: Number(fam.id), name: fam.family_name }, members: members.map((r) => camel(r)) };
}

/**
 * The member's own giving. Reads the giving table only when it exists, and leaves out voided
 * gifts when the table knows about voiding. Amounts are returned as decimal strings.
 */
export async function giving(t: Transaction, churchId: number, userId: number, f: { year?: number; limit: number; cursor?: string }) {
  const memberId = await requireLinkedMember(t, churchId, userId);
  if (!(await tableExists(t, 'contribution'))) return { data: [], nextCursor: null, limit: f.limit, totalForYear: '0.00', year: f.year ?? null };
  const hasStatus = await columnExists(t, 'contribution', 'status');
  const where = ['church_id = ?', 'member_id = ?'];
  const params: unknown[] = [churchId, memberId];
  if (hasStatus) where.push(`status NOT IN ('VOID','VOIDED')`);
  let totalForYear = '0.00';
  if (f.year) {
    const from = new Date(Date.UTC(f.year, 0, 1));
    const to = new Date(Date.UTC(f.year + 1, 0, 1));
    where.push('contribution_date >= ?', 'contribution_date < ?');
    params.push(from, to);
    const sum = await selectOne<any>(t, `SELECT COALESCE(SUM(amount), 0) AS total FROM contribution WHERE ${where.join(' AND ')}`, params);
    totalForYear = Number(sum?.total ?? 0).toFixed(2);
  }
  const after = idCursor(f.cursor);
  const rows = await select<any>(t, `SELECT id, amount, contribution_date, contribution_type, payment_method FROM contribution WHERE ${where.join(' AND ')} ${after ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`, [...params, ...(after ? [after] : []), f.limit + 1]);
  const page = idNext(rows.map((r) => ({ id: Number(r.id), amount: Number(r.amount).toFixed(2), date: new Date(r.contribution_date).toISOString().slice(0, 10), type: r.contribution_type, paymentMethod: r.payment_method })), f.limit);
  return { ...page, totalForYear, year: f.year ?? null };
}
void fromMinor;

// ---- account <-> member links (administrators) -----------------------------------------

export async function linkAccount(t: Transaction, churchId: number, actorId: number, userId: number, memberId: number) {
  const user = await selectOne<any>(t, `SELECT id, member_id FROM users WHERE church_id = ? AND id = ?`, [churchId, userId]);
  if (!user) throw new NotFoundError(`user ${userId} was not found`);
  await getRow(t, 'members', churchId, memberId, 'member');
  const taken = await selectOne<any>(t, `SELECT id FROM users WHERE church_id = ? AND member_id = ? AND id <> ?`, [churchId, memberId, userId]);
  if (taken) throw new ConflictError('that member is already linked to another account');
  await select(t, `UPDATE users SET member_id = ? WHERE church_id = ? AND id = ? RETURNING id`, [memberId, churchId, userId]);
  await recordAudit(t, churchId, { action: 'account.link', entityType: 'user', entityId: userId, actorId, data: { memberId } });
  return { userId, memberId };
}

export async function unlinkAccount(t: Transaction, churchId: number, actorId: number, userId: number) {
  const rows = await select(t, `UPDATE users SET member_id = NULL WHERE church_id = ? AND id = ? AND member_id IS NOT NULL RETURNING id`, [churchId, userId]);
  if (rows.length === 0) throw new NotFoundError('that account is not linked');
  await recordAudit(t, churchId, { action: 'account.unlink', entityType: 'user', entityId: userId, actorId, data: {} });
}

export async function listLinks(t: Transaction, churchId: number) {
  return (await select<any>(t, `SELECT u.id AS user_id, u.username, u.email, u.member_id, m.first_name, m.last_name FROM users u LEFT JOIN members m ON m.church_id = u.church_id AND m.id = u.member_id WHERE u.church_id = ? ORDER BY u.username`, [churchId])).map((r) => camel(r));
}
