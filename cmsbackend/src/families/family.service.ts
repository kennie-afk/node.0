import db from '@models';
import { Family } from './family.model';
import { Member } from '../members/member.model'; 
import { Op } from 'sequelize';

const FamilyDbModel = db.Family;
const MemberDbModel = db.Member; 

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

export const getAllFamilies = async (filters: {
  familyName?: string;
  city?: string;
  county?: string;
  headOfFamilyMemberId?: number;
  email?: string;
  phoneNumber?: string;
}, limit: number, offset: number): Promise<{ families: Array<InstanceType<typeof Family>>, totalCount: number }> => { 
  try {
    const where: any = {};
    const include: any[] = [];

    if (filters.familyName) {
      where.familyName = { [Op.like]: `%${filters.familyName}%` };
    }
    if (filters.city) {
      where.city = { [Op.like]: `%${filters.city}%` };
    }
    if (filters.county) {
      where.county = { [Op.like]: `%${filters.county}%` };
    }
    if (filters.headOfFamilyMemberId) {
      where.headOfFamilyMemberId = filters.headOfFamilyMemberId;
      include.push({
        model: MemberDbModel,
        as: 'headOfFamily',
        attributes: ['id', 'firstName', 'lastName'],
        required: false
      });
    }
    if (filters.email) {
      where.email = { [Op.like]: `%${filters.email}%` };
    }
    if (filters.phoneNumber) {
      where.phoneNumber = { [Op.like]: `%${filters.phoneNumber}%` };
    }

    const { count, rows } = await FamilyDbModel.findAndCountAll({ 
      where,
      limit,
      offset,
      order: [['familyName', 'ASC']],
      include: include,
    });
    return { families: rows, totalCount: count };
  } catch (error: any) {
    throw new Error(`Service error fetching all families: ${error.message}`);
  }
};

export const getFamilyById = async (id: number): Promise<InstanceType<typeof Family> | null> => { 
  try {
    const family = await FamilyDbModel.findByPk(id, {
      include: [{
        model: MemberDbModel,
        as: 'headOfFamily',
        attributes: ['id', 'firstName', 'lastName'],
        required: false
      }]
    }); 
    return family;
  } catch (error: any) {
    throw new Error(`Service error fetching family by ID ${id}: ${error.message}`);
  }
};

export const updateFamily = async (id: number, familyData: {
  familyName?: string;
  headOfFamilyMemberId?: number | null;
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

    const updatedFamily = await FamilyDbModel.findByPk(id, {
      include: [{
        model: MemberDbModel,
        as: 'headOfFamily',
        attributes: ['id', 'firstName', 'lastName'],
        required: false
      }]
    }); 
    return updatedFamily;
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0].path;
      throw new Error(`Unique constraint error: Family with this ${field} already exists.`);
    }
    throw new Error(`Service error updating family with ID ${id}: ${error.message}`);
  }
};

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