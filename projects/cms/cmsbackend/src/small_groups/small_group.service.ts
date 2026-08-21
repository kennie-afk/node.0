import db from '@models';
import { SmallGroup } from './small_group.model';
import { Ministry } from '@ministries/ministry.model';
import { Member } from '@members/member.model';
import { SmallGroupMember } from './small_group_member.model';
import { Op } from 'sequelize';
import { NotFoundError, BadRequestError } from '../utils/errors';

const SmallGroupDbModel = db.SmallGroup;
const MinistryDbModel = db.Ministry;
const MemberDbModel = db.Member;
const SmallGroupMemberDbModel = db.SmallGroupMember;

export const createSmallGroup = async (data: {
  name: string;
  description?: string | null;
  ministryId: number;
  leaderId?: number | null;
  meetingDay?: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday' | null;
  meetingTime?: string | null;
  meetingLocation?: string | null;
  isActive?: boolean;
}) => {
  try {
    const { ministryId, leaderId, ...rest } = data;

    const parentMinistry = await MinistryDbModel.findByPk(ministryId);
    if (!parentMinistry) {
      throw new NotFoundError(`Ministry with ID ${ministryId} not found.`);
    }

    if (leaderId) {
      const leader = await MemberDbModel.findByPk(leaderId);
      if (!leader) {
        throw new NotFoundError(`Leader with ID ${leaderId} not found.`);
      }
    }

    const newSmallGroup = await SmallGroupDbModel.create({
      ministryId,
      leaderId,
      ...rest,
    });

    const createdSmallGroup = await SmallGroupDbModel.findByPk(newSmallGroup.id, {
      include: [
        { model: MinistryDbModel, as: 'parentMinistry', attributes: ['id', 'name'] },
        { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'] }
      ]
    });

    return createdSmallGroup;
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw new BadRequestError(`Small Group with name '${data.name}' already exists under ministry ID ${data.ministryId}.`);
    }
    throw error;
  }
};

export const getAllSmallGroups = async (filters: {
  ministryId?: number;
  leaderId?: number;
  meetingDay?: string;
  meetingTime?: string;
  isActive?: boolean;
}, limit: number, offset: number): Promise<{ smallGroups: Array<InstanceType<typeof SmallGroup>>, totalCount: number }> => {
  try {
    const where: any = {};
    const include: any[] = [
      { model: MinistryDbModel, as: 'parentMinistry', attributes: ['id', 'name'], required: false },
      { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'], required: false },
      { model: MemberDbModel, as: 'members', attributes: ['id', 'firstName', 'lastName'], through: { attributes: ['role', 'startDate', 'endDate'] }, required: false }
    ];

    if (filters.ministryId) {
      where.ministryId = filters.ministryId;
    }
    if (filters.leaderId) {
      where.leaderId = filters.leaderId;
    }
    if (filters.meetingDay) {
      where.meetingDay = filters.meetingDay;
    }
    if (filters.meetingTime) {
      where.meetingTime = filters.meetingTime;
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    const { count, rows } = await SmallGroupDbModel.findAndCountAll({
      where,
      limit,
      offset,
      order: [['name', 'ASC']],
      include: include,
    });
    return { smallGroups: rows, totalCount: count };
  } catch (error: any) {
    throw error;
  }
};

export const getSmallGroupById = async (id: number) => {
  try {
    const smallGroup = await SmallGroupDbModel.findByPk(id, {
      include: [
        { model: MinistryDbModel, as: 'parentMinistry', attributes: ['id', 'name'] },
        { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'] },
        { model: MemberDbModel, as: 'members', attributes: ['id', 'firstName', 'lastName'], through: { attributes: ['role', 'startDate', 'endDate'] } }
      ]
    });
    return smallGroup;
  } catch (error: any) {
    throw error;
  }
};

export const updateSmallGroup = async (id: number, smallGroupData: {
  name?: string;
  description?: string | null;
  ministryId?: number;
  leaderId?: number | null;
  meetingDay?: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday' | null;
  meetingTime?: string | null;
  meetingLocation?: string | null;
  isActive?: boolean;
}) => {
  try {
    const smallGroup = await SmallGroupDbModel.findByPk(id);
    if (!smallGroup) {
      return null;
    }

    const { ministryId, leaderId, ...rest } = smallGroupData;

    if (ministryId !== undefined && ministryId !== null) {
      const parentMinistry = await MinistryDbModel.findByPk(ministryId);
      if (!parentMinistry) {
        throw new NotFoundError(`Ministry with ID ${ministryId} not found.`);
      }
    }

    if (leaderId !== undefined && leaderId !== null) {
      const leader = await MemberDbModel.findByPk(leaderId);
      if (!leader) {
        throw new NotFoundError(`Leader with ID ${leaderId} not found.`);
      }
    }

    const [updatedRowsCount] = await SmallGroupDbModel.update({
      ministryId,
      leaderId,
      ...rest,
    }, {
      where: { id },
    });

    if (updatedRowsCount === 0) {
      return null;
    }

    const updatedSmallGroup = await SmallGroupDbModel.findByPk(id, {
      include: [
        { model: MinistryDbModel, as: 'parentMinistry', attributes: ['id', 'name'] },
        { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'] }
      ]
    });
    return updatedSmallGroup;
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw new BadRequestError(`Small Group with name '${smallGroupData.name}' already exists under ministry ID ${smallGroupData.ministryId}.`);
    }
    throw error;
  }
};

export const deleteSmallGroup = async (id: number) => {
  try {
    const deletedRowCount = await SmallGroupDbModel.destroy({
      where: { id },
    });
    return deletedRowCount;
  } catch (error: any) {
    throw error;
  }
};

export const addMemberToSmallGroup = async (smallGroupId: number, memberId: number, role?: string) => {
  try {
    const smallGroup = await SmallGroupDbModel.findByPk(smallGroupId);
    if (!smallGroup) {
      throw new NotFoundError('Small Group not found.');
    }

    const member = await MemberDbModel.findByPk(memberId);
    if (!member) {
      throw new NotFoundError('Member not found.');
    }

    const [smallGroupMember, created] = await SmallGroupMemberDbModel.findOrCreate({
      where: { smallGroupId, memberId },
      defaults: { smallGroupId, memberId, role: role || 'Member', startDate: new Date() }
    });

    if (!created) {
      throw new BadRequestError('Member is already part of this small group.');
    }

    return smallGroupMember;
  } catch (error: any) {
    throw error;
  }
};

export const removeMemberFromSmallGroup = async (smallGroupId: number, memberId: number) => {
  try {
    const deletedCount = await SmallGroupMemberDbModel.destroy({
      where: { smallGroupId, memberId }
    });
    return deletedCount;
  } catch (error: any) {
    throw error;
  }
};

export const getMembersOfSmallGroup = async (smallGroupId: number) => {
  try {
    const smallGroup = await SmallGroupDbModel.findByPk(smallGroupId, {
      include: [{
        model: MemberDbModel,
        as: 'members',
        attributes: ['id', 'firstName', 'lastName', 'email'],
        through: { attributes: ['role', 'startDate', 'endDate'] }
      }]
    });

    if (!smallGroup) {
      return null;
    }

    return smallGroup.members;
  } catch (error: any) {
    throw error;
  }
};
