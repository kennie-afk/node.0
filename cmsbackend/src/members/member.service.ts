import db from '@models';
import { Member } from './member.model';
import { Family } from '../families/family.model';
import { Ministry } from '../ministries/ministry.model';
import { MinistryMember } from '../ministries/ministry_member.model';
import { SmallGroup } from '../small_groups/small_group.model';
import { SmallGroupMember } from '../small_groups/small_group_member.model';
import { Contribution } from '../contributions/contribution.model';
import { Op } from 'sequelize';

const MemberDbModel = db.Member;
const FamilyDbModel = db.Family;
const MinistryDbModel = db.Ministry;
const MinistryMemberDbModel = db.MinistryMember;
const SmallGroupDbModel = db.SmallGroup;
const SmallGroupMemberDbModel = db.SmallGroupMember;
const ContributionDbModel = db.Contribution;

export const createMember = async (memberData: {
  firstName: string;
  lastName: string;
  middleName?: string;
  gender?: 'Male' | 'Female' | 'Other';
  dateOfBirth?: Date;
  email?: string;
  phoneNumber?: string;
  address?: string;
  city?: string;
  county?: string;
  postalCode?: string;
  status?: 'Active' | 'Inactive' | 'New Convert' | 'Deceased' | 'Guest';
  baptismDate?: Date;
  membershipDate: Date;
  familyId?: number;
  profilePictureUrl?: string;
  notes?: string;
}): Promise<InstanceType<typeof Member>> => {
  try {
    const { firstName, lastName, membershipDate, familyId, ...rest } = memberData;

    if (!firstName || !lastName || !membershipDate) {
      throw new Error('First name, last name, and membership date are required.');
    }

    if (familyId) {
      const familyExists = await FamilyDbModel.findByPk(familyId);
      if (!familyExists) {
        throw new Error(`Family with ID ${familyId} not found.`);
      }
    }

    const newMember = await MemberDbModel.create({
      firstName, lastName, membershipDate, familyId,
      ...rest
    });

    return newMember;
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0].path;
      throw new Error(`Unique constraint error: Member with this ${field} already exists.`);
    }
    throw new Error(`Service error creating member: ${error.message}`);
  }
};

export const getAllMembers = async (filters: {
  firstName?: string;
  lastName?: string;
  email?: string;
  status?: 'Active' | 'Inactive' | 'New Convert' | 'Deceased' | 'Guest';
  gender?: 'Male' | 'Female' | 'Other';
  city?: string;
  county?: string;
  familyId?: number;
  includeFamily?: boolean;
  includeMinistries?: boolean;
  includeSmallGroups?: boolean;
  includeContributions?: boolean;
  includeLedMinistries?: boolean;
}, limit: number, offset: number): Promise<{ members: Array<InstanceType<typeof Member>>, totalCount: number }> => {
  try {
    const where: any = {};
    const include: any[] = [];

    if (filters.firstName) {
      where.firstName = { [Op.like]: `%${filters.firstName}%` };
    }
    if (filters.lastName) {
      where.lastName = { [Op.like]: `%${filters.lastName}%` };
    }
    if (filters.email) {
      where.email = { [Op.like]: `%${filters.email}%` };
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.gender) {
        where.gender = filters.gender;
    }
    if (filters.city) {
        where.city = { [Op.like]: `%${filters.city}%` };
    }
    if (filters.county) {
        where.county = { [Op.like]: `%${filters.county}%` };
    }
    if (filters.familyId) {
        where.familyId = filters.familyId;
    }

    if (filters.includeFamily) {
      include.push({
        model: FamilyDbModel,
        as: 'family',
        attributes: ['id', 'familyName', 'address', 'city', 'county'],
        required: false
      });
    }

    if (filters.includeMinistries) {
      include.push({
        model: MinistryDbModel,
        as: 'ministries',
        attributes: ['id', 'name', 'description', 'isActive'],
        through: {
            model: MinistryMemberDbModel,
            attributes: ['role', 'startDate', 'endDate']
        },
        required: false
      });
    }

    if (filters.includeSmallGroups) {
      include.push({
        model: SmallGroupDbModel,
        as: 'smallGroups',
        attributes: ['id', 'name', 'description', 'meetingDay', 'meetingTime'],
        through: {
            model: SmallGroupMemberDbModel,
            attributes: ['role', 'startDate', 'endDate']
        },
        required: false
      });
    }

    if (filters.includeContributions) {
      include.push({
        model: ContributionDbModel,
        as: 'contributions',
        attributes: ['id', 'amount', 'contributionType', 'contributionDate', 'paymentMethod', 'transactionId', 'notes'],
        required: false
      });
    }

    if (filters.includeLedMinistries) {
      include.push({
        model: MinistryDbModel,
        as: 'ledMinistries',
        attributes: ['id', 'name', 'description', 'isActive'],
        required: false
      });
    }

    const { count, rows } = await MemberDbModel.findAndCountAll({
      where,
      limit,
      offset,
      order: [['lastName', 'ASC'], ['firstName', 'ASC']],
      include: include,
    });
    return { members: rows, totalCount: count };
  } catch (error: any) {
    throw new Error(`Service error fetching all members: ${error.message}`);
  }
};

export const getMemberById = async (
  id: number,
  includeFamily: boolean = false,
  includeMinistries: boolean = false,
  includeSmallGroups: boolean = false,
  includeContributions: boolean = false,
  includeLedMinistries: boolean = false
): Promise<InstanceType<typeof Member> | null> => {
  try {
    const include: any[] = [];

    if (includeFamily) {
      include.push({
        model: FamilyDbModel,
        as: 'family',
        attributes: ['id', 'familyName', 'address', 'city', 'county'],
        required: false
      });
    }

    if (includeMinistries) {
      include.push({
        model: MinistryDbModel,
        as: 'ministries',
        attributes: ['id', 'name', 'description', 'isActive'],
        through: {
            model: MinistryMemberDbModel,
            attributes: ['role', 'startDate', 'endDate']
        },
        required: false
      });
    }

    if (includeSmallGroups) {
      include.push({
        model: SmallGroupDbModel,
        as: 'smallGroups',
        attributes: ['id', 'name', 'description', 'meetingDay', 'meetingTime'],
        through: {
            model: SmallGroupMemberDbModel,
            attributes: ['role', 'startDate', 'endDate']
        },
        required: false
      });
    }

    if (includeContributions) {
      include.push({
        model: ContributionDbModel,
        as: 'contributions',
        attributes: ['id', 'amount', 'contributionType', 'contributionDate', 'paymentMethod', 'transactionId', 'notes'],
        required: false
      });
    }

    if (includeLedMinistries) {
      include.push({
        model: MinistryDbModel,
        as: 'ledMinistries',
        attributes: ['id', 'name', 'description', 'isActive'],
        required: false
      });
    }

    const member = await MemberDbModel.findByPk(id, { include });
    return member;
  } catch (error: any) {
    throw new Error(`Service error fetching member by ID ${id}: ${error.message}`);
  }
};

export const updateMember = async (id: number, memberData: {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  gender?: 'Male' | 'Female' | 'Other';
  dateOfBirth?: Date;
  email?: string;
  phoneNumber?: string;
  address?: string;
  city?: string;
  county?: string;
  postalCode?: string;
  status?: 'Active' | 'Inactive' | 'New Convert' | 'Deceased' | 'Guest';
  baptismDate?: Date;
  membershipDate?: Date;
  familyId?: number | null;
  profilePictureUrl?: string;
  notes?: string;
}): Promise<InstanceType<typeof Member> | null> => {
  try {
    const member = await MemberDbModel.findByPk(id);
    if (!member) {
      return null;
    }

    if (memberData.email && memberData.email !== member.email) {
      const existingEmail = await MemberDbModel.findOne({ where: { email: memberData.email } });
      if (existingEmail && existingEmail.id !== id) {
        throw new Error(`Email '${memberData.email}' is already taken by another member.`);
      }
    }
    if (memberData.phoneNumber && memberData.phoneNumber !== member.phoneNumber) {
      const existingPhone = await MemberDbModel.findOne({ where: { phoneNumber: memberData.phoneNumber } });
      if (existingPhone && existingPhone.id !== id) {
        throw new Error(`Phone number '${memberData.phoneNumber}' is already taken by another member.`);
      }
    }

    const fieldsToUpdate: { [key: string]: any } = { ...memberData };

    if (memberData.familyId !== undefined) {
      if (memberData.familyId === null) {
        fieldsToUpdate.familyId = null;
      } else {
        const familyExists = await FamilyDbModel.findByPk(memberData.familyId);
        if (!familyExists) {
          throw new Error(`Family with ID ${memberData.familyId} not found for update.`);
        }
        fieldsToUpdate.familyId = memberData.familyId;
      }
    } else {
        delete fieldsToUpdate.familyId;
    }

    const [updatedRowsCount] = await MemberDbModel.update(fieldsToUpdate, {
      where: { id },
    });

    if (updatedRowsCount === 0) {
      return null;
    }

    const updatedMember = await MemberDbModel.findByPk(id, {
      include: [{ model: db.Family, as: 'family' }]
    });
    return updatedMember;
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0].path;
      throw new Error(`Unique constraint error: Member with this ${field} already exists.`);
    }
    throw new Error(`Service error updating member with ID ${id}: ${error.message}`);
  }
};

export const deleteMember = async (id: number): Promise<number> => {
  try {
    const deletedRowCount = await MemberDbModel.destroy({
      where: { id },
    });
    return deletedRowCount;
  } catch (error: any) {
    throw new Error(`Service error deleting member with ID ${id}: ${error.message}`);
  }
};