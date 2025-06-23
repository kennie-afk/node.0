import db from '@models';
import { SmallGroup } from './small_group.model';
import { Ministry } from '@ministries/ministry.model';
import { Member } from '@members/member.model';
import { SmallGroupMember } from './small_group_member.model';
import { Op } from 'sequelize';

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
      throw new Error(`Ministry with ID ${ministryId} not found.`);
    }

    if (leaderId) {
      const leader = await MemberDbModel.findByPk(leaderId);
      if (!leader) {
        throw new Error(`Leader with ID ${leaderId} not found.`);
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
      throw new Error(`Small Group with name '${data.name}' already exists under ministry ID ${data.ministryId}.`);
    }
    throw new Error(`Service error creating small group: ${error.message}`);
  }
};

export const getAllSmallGroups = async (filters: {
  ministryId?: number;
  leaderId?: number;
  meetingDay?: string;
  meetingTime?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}) => {
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

    const smallGroups = await SmallGroupDbModel.findAll({
      where,
      limit: filters.limit ? Number(filters.limit) : undefined,
      offset: filters.offset ? Number(filters.offset) : undefined,
      order: [['name', 'ASC']],
      include: include,
    });
    return smallGroups;
  } catch (error: any) {
    throw new Error(`Service error fetching all small groups: ${error.message}`);
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
    throw new Error(`Service error fetching small group by ID ${id}: ${error.message}`);
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
        throw new Error(`Ministry with ID ${ministryId} not found.`);
      }
    }

    if (leaderId !== undefined && leaderId !== null) {
      const leader = await MemberDbModel.findByPk(leaderId);
      if (!leader) {
        throw new Error(`Leader with ID ${leaderId} not found.`);
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
      throw new Error(`Small Group with name '${smallGroupData.name}' already exists under ministry ID ${smallGroupData.ministryId}.`);
    }
    throw new Error(`Service error updating small group with ID ${id}: ${error.message}`);
  }
};

export const deleteSmallGroup = async (id: number) => {
  try {
    const deletedRowCount = await SmallGroupDbModel.destroy({
      where: { id },
    });
    return deletedRowCount;
  } catch (error: any) {
    throw new Error(`Service error deleting small group with ID ${id}: ${error.message}`);
  }
};

export const addMemberToSmallGroup = async (smallGroupId: number, memberId: number, role?: string) => {
  try {
    const smallGroup = await SmallGroupDbModel.findByPk(smallGroupId);
    if (!smallGroup) {
      throw new Error('Small Group not found.');
    }

    const member = await MemberDbModel.findByPk(memberId);
    if (!member) {
      throw new Error('Member not found.');
    }

    const [smallGroupMember, created] = await SmallGroupMemberDbModel.findOrCreate({
      where: { smallGroupId, memberId },
      defaults: { smallGroupId, memberId, role: role || 'Member', startDate: new Date() }
    });

    if (!created) {
      throw new Error('Member is already part of this small group.');
    }

    return smallGroupMember;
  } catch (error: any) {
    throw new Error(`Service error adding member to small group: ${error.message}`);
  }
};

export const removeMemberFromSmallGroup = async (smallGroupId: number, memberId: number) => {
  try {
    const deletedCount = await SmallGroupMemberDbModel.destroy({
      where: { smallGroupId, memberId }
    });
    return deletedCount;
  } catch (error: any) {
    throw new Error(`Service error removing member from small group: ${error.message}`);
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
      throw new Error('Small Group not found.');
    }

    return smallGroup.members;
  } catch (error: any) {
    throw new Error(`Service error fetching members of small group: ${error.message}`);
  }
};