import db from '@models';
import { Ministry } from './ministry.model';
import { Member } from '@members/member.model';
import { MinistryMember } from './ministry_member.model';
import { Op } from 'sequelize';

const MinistryDbModel = db.Ministry;
const MemberDbModel = db.Member;
const MinistryMemberDbModel = db.MinistryMember;

export const createMinistry = async (data: {
  name: string;
  description?: string | null;
  leaderId?: number | null;
  isActive?: boolean;
}) => {
  try {
    const { leaderId, ...rest } = data;

    if (leaderId) {
      const leader = await MemberDbModel.findByPk(leaderId);
      if (!leader) {
        throw new Error(`Leader with ID ${leaderId} not found.`);
      }
    }

    const newMinistry = await MinistryDbModel.create({
      leaderId,
      ...rest,
    });

    const createdMinistry = await MinistryDbModel.findByPk(newMinistry.id, {
      include: [
        { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'] }
      ]
    });

    if (leaderId) {
        await MinistryMemberDbModel.findOrCreate({
            where: { ministryId: newMinistry.id, memberId: leaderId },
            defaults: { ministryId: newMinistry.id, memberId: leaderId, role: 'Leader', startDate: new Date() }
        });
    }

    return createdMinistry;
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw new Error(`Ministry with name '${data.name}' already exists.`);
    }
    throw new Error(`Service error creating ministry: ${error.message}`);
  }
};

export const getAllMinistries = async (filters: {
  name?: string;
  leaderId?: number;
  isActive?: boolean;
}, limit: number, offset: number): Promise<{ ministries: Array<InstanceType<typeof Ministry>>, totalCount: number }> => {
  try {
    const where: any = {};
    const include: any[] = [
      { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'], required: false },
      { model: MemberDbModel, as: 'members', attributes: ['id', 'firstName', 'lastName'], through: { attributes: ['role', 'startDate', 'endDate'] }, required: false }
    ];

    if (filters.name) {
      where.name = { [Op.like]: `%${filters.name}%` };
    }
    if (filters.leaderId) {
      where.leaderId = filters.leaderId;
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    const { count, rows } = await MinistryDbModel.findAndCountAll({
      where,
      limit,
      offset,
      order: [['name', 'ASC']],
      include: include,
    });
    return { ministries: rows, totalCount: count };
  } catch (error: any) {
    throw new Error(`Service error fetching all ministries: ${error.message}`);
  }
};

export const getMinistryById = async (id: number) => {
  try {
    const ministry = await MinistryDbModel.findByPk(id, {
      include: [
        { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'] },
        { model: MemberDbModel, as: 'members', attributes: ['id', 'firstName', 'lastName'], through: { attributes: ['role', 'startDate', 'endDate'] } }
      ]
    });
    return ministry;
  } catch (error: any) {
    throw new Error(`Service error fetching ministry by ID ${id}: ${error.message}`);
  }
};

export const updateMinistry = async (id: number, ministryData: {
  name?: string;
  description?: string | null;
  leaderId?: number | null;
  isActive?: boolean;
}) => {
  try {
    const ministry = await MinistryDbModel.findByPk(id);
    if (!ministry) {
      return null;
    }

    const { leaderId, ...rest } = ministryData;

    if (leaderId !== undefined && leaderId !== null && leaderId !== ministry.leaderId) {
      const leader = await MemberDbModel.findByPk(leaderId);
      if (!leader) {
        throw new Error(`Leader with ID ${leaderId} not found.`);
      }

      const ministryMember = await MinistryMemberDbModel.findOne({
        where: { ministryId: id, memberId: leaderId }
      });

      if (!ministryMember) {
        throw new Error(`Member with ID ${leaderId} must be a member of this ministry before being assigned as leader.`);
      }

      if (ministryMember.role !== 'Leader') {
        await ministryMember.update({ role: 'Leader' });
      }
    } else if (leaderId === null && ministry.leaderId !== null) {

    }

    const [updatedRowsCount] = await MinistryDbModel.update({
      leaderId,
      ...rest,
    }, {
      where: { id },
    });

    if (updatedRowsCount === 0) {
      return null;
    }

    const updatedMinistry = await MinistryDbModel.findByPk(id, {
      include: [
        { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'] }
      ]
    });
    return updatedMinistry;
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw new Error(`Ministry with name '${ministryData.name}' already exists.`);
    }
    throw new Error(`Service error updating ministry with ID ${id}: ${error.message}`);
  }
};

export const deleteMinistry = async (id: number) => {
  try {
    const deletedRowCount = await MinistryDbModel.destroy({
      where: { id },
    });
    return deletedRowCount;
  } catch (error: any) {
    throw new Error(`Service error deleting ministry with ID ${id}: ${error.message}`);
  }
};

export const addMemberToMinistry = async (ministryId: number, memberId: number, role?: string) => {
  try {
    const ministry = await MinistryDbModel.findByPk(ministryId);
    if (!ministry) {
      throw new Error('Ministry not found.');
    }

    const member = await MemberDbModel.findByPk(memberId);
    if (!member) {
      throw new Error('Member not found.');
    }

    let effectiveRole = role || 'Member';
    if (ministry.leaderId === memberId) {
      effectiveRole = 'Leader';
    }

    const [ministryMember, created] = await MinistryMemberDbModel.findOrCreate({
      where: { ministryId, memberId },
      defaults: { ministryId, memberId, role: effectiveRole, startDate: new Date() }
    });

    if (!created) {
      if (ministryMember.role !== effectiveRole) {
        await ministryMember.update({ role: effectiveRole });
        return ministryMember;
      }
      throw new Error('Member is already part of this ministry.');
    }

    return ministryMember;
  } catch (error: any) {
    throw new Error(`Service error adding member to ministry: ${error.message}`);
  }
};

export const removeMemberFromMinistry = async (ministryId: number, memberId: number) => {
  try {
    const ministry = await MinistryDbModel.findByPk(ministryId);
    if (ministry && ministry.leaderId === memberId) {
      throw new Error('Cannot remove member from ministry: Member is currently the leader. Please assign a new leader first or set leader to null.');
    }

    const deletedCount = await MinistryMemberDbModel.destroy({
      where: { ministryId, memberId }
    });
    return deletedCount;
  } catch (error: any) {
    throw new Error(`Service error removing member from ministry: ${error.message}`);
  }
};

export const getMembersOfMinistry = async (ministryId: number) => {
  try {
    const ministry = await MinistryDbModel.findByPk(ministryId, {
      include: [{
        model: MemberDbModel,
        as: 'members',
        attributes: ['id', 'firstName', 'lastName', 'email'],
        through: { attributes: ['role', 'startDate', 'endDate'] }
      }]
    });

    if (!ministry) {
      throw new Error('Ministry not found.');
    }

    return ministry.members;
  } catch (error: any) {
    throw new Error(`Service error fetching members of ministry: ${error.message}`);
  }
};