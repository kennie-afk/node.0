import db from '@models';
import { Family } from './family.model';
import { BadRequestError } from '../utils/errors';

const FamilyDbModel = db.Family;

export const createFamily = async (familyData: Partial<Family>): Promise<Family> => {
  try {
    const newFamily = await FamilyDbModel.create(familyData);
    return newFamily;
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
        throw new BadRequestError('Family with this name already exists.');
    }
    throw new Error(`Service error creating family: ${error.message}`);
  }
};

export const getAllFamilies = async (): Promise<Family[]> => {
  try {
    const families = await FamilyDbModel.findAll();
    return families;
  } catch (error: any) {
    throw new Error(`Service error fetching all families: ${error.message}`);
  }
};

export const getFamilyById = async (id: number): Promise<Family | null> => {
  try {
    const family = await FamilyDbModel.findByPk(id);
    return family;
  } catch (error: any) {
    throw new Error(`Service error fetching family by ID ${id}: ${error.message}`);
  }
};

export const updateFamily = async (id: number, familyData: Partial<Family>): Promise<Family | null> => {
  try {
    const [updatedRowsCount] = await FamilyDbModel.update(familyData, {
      where: { id },
      returning: true,
    });
    if (updatedRowsCount === 0) {
      return null;
    }
    const updatedFamily = await FamilyDbModel.findByPk(id);
    return updatedFamily;
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
        throw new BadRequestError('Family name already in use.');
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