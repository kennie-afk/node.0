import db from '@models';
import { Member } from './member.model';
import { TenantRepository } from '../common/tenant-repository';
import { Page, Pagination } from '../common/pagination';
import { BadRequestError } from '../utils/errors';

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

export const getAllMembers = async (
  pagination: Pagination,
  filters: Record<string, unknown> = {}
): Promise<Page<Member>> => {
  return members.list({
    pagination,
    where: filters,
    include: withFamily,
    order: [
      ['firstName', 'ASC'],
      ['id', 'ASC']
    ]
  });
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
