import db from '@models';
import { Member } from './member.model'; 
import { Family } from '../families/family.model'; 

const MemberDbModel = db.Member;
const FamilyDbModel = db.Family; 

/**
 * @param memberData 
 * @returns 
 * @throws {Error} 
 */
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

/**
 * @returns
 */
export const getAllMembers = async (): Promise<Array<InstanceType<typeof Member>>> => { 
  try {
    const members = await MemberDbModel.findAll({ 
      include: [{ model: db.Family, as: 'family' }]
    });
    return members;
  } catch (error: any) {
    throw new Error(`Service error fetching all members: ${error.message}`);
  }
};

/**
 * @param id 
 * @returns 
 */
export const getMemberById = async (id: number): Promise<InstanceType<typeof Member> | null> => { // FIXED: Use InstanceType
  try {
    const member = await MemberDbModel.findByPk(id, { 
      include: [{ model: db.Family, as: 'family' }]
    });
    return member;
  } catch (error: any) {
    throw new Error(`Service error fetching member by ID ${id}: ${error.message}`);
  }
};

/**
 * @param id 
 * @param memberData 
 * @returns 
 */
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
  familyId?: number;
  profilePictureUrl?: string;
  notes?: string;
}): Promise<InstanceType<typeof Member> | null> => { 
  try {
    const { familyId, ...rest } = memberData;

    if (familyId !== undefined && familyId !== null) {
      const familyExists = await FamilyDbModel.findByPk(familyId); 
      if (!familyExists) {
        throw new Error(`Family with ID ${familyId} not found for update.`);
      }
    }

    const [updatedRowsCount] = await MemberDbModel.update({ familyId, ...rest }, { 
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

/**
 * @param id 
 * @returns 
 */
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