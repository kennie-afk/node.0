import db from '@models';
import { Member } from './member.model';
import { BadRequestError } from '../utils/errors';

const MemberDbModel = db.Member;
const FamilyDbModel = db.Family;

export const createMember = async (memberData: Partial<Member>): Promise<Member> => {
  try {
    const newMember = await MemberDbModel.create(memberData);
    return newMember;
  } catch (error: any) {
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      throw new BadRequestError('Family ID does not exist.');
    }
    throw new Error(`Service error creating member: ${error.message}`);
  }
};

export const getAllMembers = async (): Promise<Member[]> => {
  try {
    const members = await MemberDbModel.findAll({
      include: [
        {
          model: FamilyDbModel,
          as: 'family',           // ← Must match the alias defined in the model
          attributes: ['id', 'familyName', 'address']
        }
      ],
      order: [['firstName', 'ASC']]
    });
    return members;
  } catch (error: any) {
    throw new Error(`Service error fetching all members: ${error.message}`);
  }
};

export const getMemberById = async (id: number): Promise<Member | null> => {
  try {
    const member = await MemberDbModel.findByPk(id, {
      include: [
        {
          model: FamilyDbModel,
          as: 'family',
          attributes: ['id', 'familyName', 'address']
        }
      ]
    });
    return member;
  } catch (error: any) {
    throw new Error(`Service error fetching member by ID ${id}: ${error.message}`);
  }
};

export const updateMember = async (id: number, memberData: Partial<Member>): Promise<Member | null> => {
  try {
    const [updatedRowsCount] = await MemberDbModel.update(memberData, {
      where: { id },
      returning: true,
    });

    if (updatedRowsCount === 0) {
      return null;
    }

    const updatedMember = await MemberDbModel.findByPk(id, {
      include: [
        {
          model: FamilyDbModel,
          as: 'family',
          attributes: ['id', 'familyName', 'address']
        }
      ]
    });
    return updatedMember;
  } catch (error: any) {
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      throw new BadRequestError('Family ID does not exist.');
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