import db from '@models';
import { Op } from 'sequelize';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors';

const MinistryDbModel = db.Ministry;
const MemberDbModel = db.Member;
const MinistryMemberDbModel = db.MinistryMember;

export const createMinistry = async (data: any) => {
  const { leaderId, ...rest } = data;

  if (leaderId) {
    const leader = await MemberDbModel.findByPk(leaderId);
    if (!leader) throw new NotFoundError(`Leader with ID ${leaderId} not found.`);
  }

  const newMinistry = await MinistryDbModel.create({ leaderId, ...rest });

  return await MinistryDbModel.findByPk(newMinistry.id, {
    include: [{ model: MemberDbModel, as: 'leader' }]
  });
};

export const getAllMinistries = async (filters: any, limit: number, offset: number) => {
  const where: any = {};
  if (filters.name) where.name = { [Op.like]: `%${filters.name}%` };
  if (filters.leaderId) where.leaderId = filters.leaderId;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;

  const { count, rows } = await MinistryDbModel.findAndCountAll({
    where,
    limit,
    offset,
    include: [{ model: MemberDbModel, as: 'leader' }]
  });

  return { ministries: rows, totalCount: count };
};

export const getMinistryById = async (id: number) => {
  return await MinistryDbModel.findByPk(id, {
    include: [{ model: MemberDbModel, as: 'leader' }]
  });
};

export const updateMinistry = async (id: number, data: any) => {
  const [updatedRows] = await MinistryDbModel.update(data, { where: { id } });
  if (updatedRows === 0) return null;
  return await MinistryDbModel.findByPk(id);
};

export const deleteMinistry = async (id: number) => {
  return await MinistryDbModel.destroy({ where: { id } });
};

export const addMemberToMinistry = async (ministryId: number, memberId: number, role?: string) => {
  const ministry = await MinistryDbModel.findByPk(ministryId);
  if (!ministry) throw new NotFoundError('Ministry not found.');

  const member = await MemberDbModel.findByPk(memberId);
  if (!member) throw new NotFoundError('Member not found.');

  const effectiveRole = role || 'Member';

  const [ministryMember] = await MinistryMemberDbModel.findOrCreate({
    where: { ministryId, memberId },
    defaults: { ministryId, memberId, role: effectiveRole, startDate: new Date() }
  });

  return ministryMember;
};

export const removeMemberFromMinistry = async (ministryId: number, memberId: number) => {
  return await MinistryMemberDbModel.destroy({ where: { ministryId, memberId } });
};

export const getMembersOfMinistry = async (ministryId: number) => {
  const ministry = await MinistryDbModel.findByPk(ministryId, {
    include: [{
      model: MemberDbModel,
      as: 'members',
      through: { attributes: ['role', 'startDate'] }
    }]
  });

  if (!ministry) throw new NotFoundError('Ministry not found.');
  return ministry.members || [];
};