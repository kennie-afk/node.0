import db from '@models';
import { createCrudService } from '../common/crud-service';
import { TenantRepository } from '../common/tenant-repository';
import { Page, Pagination } from '../common/pagination';
import { BadRequestError } from '../utils/errors';

const service = createCrudService<any>(db.Ministry, 'Ministry', {
  include: [{ model: db.Member, as: 'leader', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] }],
  order: [['name', 'ASC'], ['id', 'ASC']]
});

const memberships = new TenantRepository<any>(db.MinistryMember, 'Ministry membership');
const members = new TenantRepository<any>(db.Member, 'Member');

export const repository = service.repository;

export const createMinistry = service.create;
export const getAllMinistries = service.list;
export const getMinistryById = service.findById;
export const updateMinistry = service.update;
export const deleteMinistry = service.remove;

async function assertBothInChurch(groupId: number, memberId: number): Promise<void> {
  await service.findByIdOrFail(groupId);
  if (!(await members.exists({ id: memberId }))) {
    throw new BadRequestError('That member does not belong to this church.');
  }
}

export const addMemberToMinistry = async (
  groupId: number,
  memberId: number,
  attributes: Record<string, unknown> = {}
) => {
  await assertBothInChurch(groupId, memberId);

  const existing = await memberships.findOne({ ministryId: groupId, memberId });
  if (existing) {
    throw new BadRequestError('That member is already in this group.');
  }

  return memberships.create({ ...attributes, ministryId: groupId, memberId });
};

export const removeMemberFromMinistry = async (
  groupId: number,
  memberId: number
): Promise<void> => {
  await service.findByIdOrFail(groupId);

  const membership = await memberships.findOne({ ministryId: groupId, memberId });
  if (!membership) {
    throw new BadRequestError('That member is not in this group.');
  }

  await membership.destroy();
};

export const getMembersOfMinistry = async (
  groupId: number,
  pagination: Pagination
): Promise<Page<any>> => {
  await service.findByIdOrFail(groupId);

  return memberships.list({
    pagination,
    where: { ministryId: groupId },
    include: [{ model: db.Member, as: 'member' }],
    order: [['memberId', 'ASC']]
  });
};

export default service;
