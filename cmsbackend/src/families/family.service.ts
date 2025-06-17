import db from '@models';
import { Family } from './family.model';
import { Member } from '../members/member.model'; 

const FamilyDbModel = db.Family;
const MemberDbModel = db.Member; 

/**
 * @param familyData 
 * @returns 
 * @throws {Error} 
 */
export const createFamily = async (familyData: {
  familyName: string;
  headOfFamilyMemberId?: number;
  address?: string;
  city?: string;
  county?: string;
  postalCode?: string;
  phoneNumber?: string;
  email?: string;
  notes?: string;
}): Promise<InstanceType<typeof Family>> => { 
  try {
    const { familyName, headOfFamilyMemberId, ...rest } = familyData;

    if (!familyName) {
      throw new Error('Family name is required.');
    }

    if (headOfFamilyMemberId) {
      const memberExists = await MemberDbModel.findByPk(headOfFamilyMemberId); 
      if (!memberExists) {
        throw new Error(`Head of family member with ID ${headOfFamilyMemberId} not found.`);
      }
    }

    const newFamily = await FamilyDbModel.create({ 
      familyName,
      headOfFamilyMemberId,
      ...rest,
    });

    return newFamily;
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0].path;
      throw new Error(`Unique constraint error: Family with this ${field} already exists.`);
    }
    throw new Error(`Service error creating family: ${error.message}`);
  }
};

/**
 * @returns 
 */
export const getAllFamilies = async (): Promise<Array<InstanceType<typeof Family>>> => { 
  try {
    const families = await FamilyDbModel.findAll(); 
    return families;
  } catch (error: any) {
    throw new Error(`Service error fetching all families: ${error.message}`);
  }
};

/**
 * @param id 
 * @returns 
 */
export const getFamilyById = async (id: number): Promise<InstanceType<typeof Family> | null> => { 
  try {
    const family = await FamilyDbModel.findByPk(id); 
    return family;
  } catch (error: any) {
    throw new Error(`Service error fetching family by ID ${id}: ${error.message}`);
  }
};

/**
 * @param id 
 * @param familyData 
 */
export const updateFamily = async (id: number, familyData: {
  familyName?: string;
  headOfFamilyMemberId?: number;
  address?: string;
  city?: string;
  county?: string;
  postalCode?: string;
  phoneNumber?: string;
  email?: string;
  notes?: string;
}): Promise<InstanceType<typeof Family> | null> => { 
  try {
    const { headOfFamilyMemberId, ...rest } = familyData;

    if (headOfFamilyMemberId !== undefined && headOfFamilyMemberId !== null) {
      const memberExists = await MemberDbModel.findByPk(headOfFamilyMemberId); 
      if (!memberExists) {
        throw new Error(`Head of family member with ID ${headOfFamilyMemberId} not found for update.`);
      }
    }

    const [updatedRowsCount] = await FamilyDbModel.update({ headOfFamilyMemberId, ...rest }, { 
      where: { id },
    });

    if (updatedRowsCount === 0) {
      return null;
    }

    const updatedFamily = await FamilyDbModel.findByPk(id); 
    return updatedFamily;
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0].path;
      throw new Error(`Unique constraint error: Family with this ${field} already exists.`);
    }
    throw new Error(`Service error updating family with ID ${id}: ${error.message}`);
  }
};

/**
 * @param id 
 * @returns 
 */
export const deleteFamily = async (id: number): Promise<number> => {
  try {
    const deletedRowCount = await FamilyDbModel.destroy({ 
      where: { id },
    });
    return deletedRowCount;
  } catch (error: any) {
    throw new Error(`Service error deleting family with ID ${id}: ${error.message}`);
  }
};