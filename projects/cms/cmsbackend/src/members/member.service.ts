import { Op } from 'sequelize';
import db from '@models';
import { Member } from './member.model';
import { TenantRepository } from '../common/tenant-repository';
import { Page, Pagination } from '../common/pagination';
import { BadRequestError } from '../utils/errors';
import { currentChurchId, currentTenant, holds } from '../common/tenant-context';
import { requestTx } from '../common/http';
import { select, selectOne } from '../modules/finance/sql';
import { listContributionsKeyset } from '../modules/giving/contributions.service';
import { minorOf } from '../modules/giving/shared';
import { listNotes } from '../modules/care/care.service';

const members = new TenantRepository<any>(db.Member, 'Member');
const families = new TenantRepository<any>(db.Family, 'Family');

const withFamily = [
  {
    model: db.Family,
    as: 'family',
    attributes: ['id', 'familyName', 'address']
  }
];

async function assertFamilyBelongsToChurch(familyId?: number | null): Promise<void> {
  if (familyId === undefined || familyId === null) {
    return;
  }
  if (!(await families.exists({ id: familyId }))) {
    throw new BadRequestError('Family ID does not exist in this church.');
  }
}

export const createMember = async (memberData: Partial<Member>): Promise<Member> => {
  await assertFamilyBelongsToChurch((memberData as any).familyId);
  return members.create(memberData as any);
};

export interface MemberFilter {
  q?: string;
  status?: string;
  familyId?: number;
  ministryId?: number;
  smallGroupId?: number;
  joinedFrom?: string;
  joinedTo?: string;
}

/**
 * The WHERE for the list. Search and every filter run in the database, and membership filters are
 * subqueries scoped to the caller's church (the ids are validated integers, never user text).
 */
function memberWhere(filter: MemberFilter): any {
  const churchId = currentChurchId();
  const and: any[] = [];
  if (filter.q) {
    // Search is done in the query so the picker never has to fetch everyone and filter locally.
    const like = db.sequelize.getDialect() === 'postgres' ? Op.iLike : Op.like;
    const term = `%${filter.q.replace(/[%_\\]/g, '')}%`;
    and.push({ [Op.or]: ['firstName', 'lastName', 'email', 'phoneNumber'].map((column) => ({ [column]: { [like]: term } })) });
  }
  if (filter.status) and.push({ status: filter.status });
  if (filter.familyId) and.push({ familyId: filter.familyId });
  if (filter.ministryId) {
    and.push({ id: { [Op.in]: db.sequelize.literal(`(SELECT member_id FROM ministry_members WHERE church_id = ${Number(churchId)} AND ministry_id = ${Number(filter.ministryId)})`) } });
  }
  if (filter.smallGroupId) {
    and.push({ id: { [Op.in]: db.sequelize.literal(`(SELECT member_id FROM small_group_members WHERE church_id = ${Number(churchId)} AND small_group_id = ${Number(filter.smallGroupId)})`) } });
  }
  if (filter.joinedFrom) and.push({ membershipDate: { [Op.gte]: filter.joinedFrom } });
  if (filter.joinedTo) and.push({ membershipDate: { [Op.lte]: filter.joinedTo } });
  return and.length ? { [Op.and]: and } : {};
}

/** Offset shape (with a total), kept for callers that page by number. */
export const getAllMembers = async (pagination: Pagination, filter: MemberFilter = {}): Promise<Page<Member>> =>
  members.list({
    pagination,
    where: memberWhere(filter),
    include: withFamily,
    order: [
      ['firstName', 'ASC'],
      ['id', 'ASC']
    ]
  });

/** Cursor page ordered by (first name, id); no count(*). */
export const listMembersKeyset = async (filter: MemberFilter, limit: number, cursor?: string) =>
  members.listKeyset({ where: memberWhere(filter), include: withFamily, sort: [['firstName', 'ASC'], ['id', 'ASC']], limit, cursor });

/**
 * Everything the pastoral view of one person needs, in one request. Giving and care are only read
 * when the caller holds those permissions, otherwise the section is null: this endpoint must not be
 * a way around the permission a separate screen would ask for.
 */
export const getMemberProfile = async (id: number) => {
  const t = await requestTx();
  const { churchId, userId, role } = currentTenant();
  const member = await members.findByIdOrFail(id, { include: withFamily });
  const q = { churchId, id };

  const ministries = await select<any>(t, `SELECT m.id, m.name, mm.role FROM ministry_members mm JOIN ministries m ON m.church_id = mm.church_id AND m.id = mm.ministry_id WHERE mm.church_id = :churchId AND mm.member_id = :id ORDER BY m.name`, q);
  const smallGroups = await select<any>(t, `SELECT g.id, g.name FROM small_group_members sm JOIN small_groups g ON g.church_id = sm.church_id AND g.id = sm.small_group_id WHERE sm.church_id = :churchId AND sm.member_id = :id ORDER BY g.name`, q);
  const familyMembers = (member as any).familyId
    ? await select<any>(t, `SELECT id, first_name AS "firstName", last_name AS "lastName", status FROM members WHERE church_id = :churchId AND family_id = :familyId AND id <> :id ORDER BY first_name, id LIMIT 25`, { ...q, familyId: (member as any).familyId })
    : [];
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const recent = await select<any>(t, `SELECT a.id, a.attendance_date AS "date", a.attendance_type AS "type", e.name AS "eventName", s.title AS "sermonTitle" FROM attendance a LEFT JOIN events e ON e.church_id = a.church_id AND e.id = a.event_id LEFT JOIN sermons s ON s.church_id = a.church_id AND s.id = a.sermon_id WHERE a.church_id = :churchId AND a.member_id = :id ORDER BY a.attendance_date DESC, a.id DESC LIMIT 15`, q);
  const last90 = await selectOne<any>(t, `SELECT COUNT(*) AS n FROM attendance WHERE church_id = :churchId AND member_id = :id AND attendance_date >= :since`, { ...q, since });

  let giving: unknown = null;
  if (holds('giving:read')) {
    const totals = await selectOne<any>(t, `SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total, MAX(contribution_date) AS last FROM contribution WHERE church_id = :churchId AND member_id = :id AND status = 'POSTED'`, q);
    const gifts = await listContributionsKeyset(t, churchId, { memberId: id, status: 'POSTED' } as any, 10);
    giving = { giftCount: Number(totals?.n ?? 0), totalMinor: minorOf(totals?.total), lastGiftAt: totals?.last ?? null, recent: gifts.data };
  }

  let care: unknown = null;
  if (holds('care:read')) {
    const notes = await listNotes(t, { churchId, userId, role }, { memberId: id, limit: 10 });
    care = { notes: notes.data };
  }

  return {
    member,
    familyMembers,
    ministries,
    smallGroups,
    attendance: { last90Days: Number(last90?.n ?? 0), recent },
    giving,
    care
  };
};

export const getMemberById = async (id: number): Promise<Member | null> => {
  return members.findById(id, { include: withFamily });
};

export const updateMember = async (
  id: number,
  memberData: Partial<Member>
): Promise<Member> => {
  await assertFamilyBelongsToChurch((memberData as any).familyId);
  await members.update(id, memberData as any);
  return members.findByIdOrFail(id, { include: withFamily });
};

export const deleteMember = async (id: number): Promise<void> => {
  await members.destroy(id);
};
