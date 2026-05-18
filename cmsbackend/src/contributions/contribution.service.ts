import db from '@models';
import { Contribution } from './contribution.model';

const ContributionDbModel = db.Contribution;

export const createContribution = async (contributionData: Partial<Contribution>): Promise<Contribution> => {
  try {
    const newContribution = await ContributionDbModel.create(contributionData);
    return newContribution;
  } catch (error: any) {
    throw new Error(`Service error creating contribution: ${error.message}`);
  }
};

export const getAllContributions = async (memberId?: number): Promise<Contribution[]> => {
  try {
    const whereClause: any = {};
    if (memberId) {
      whereClause.memberId = memberId;
    }

    const contributions = await ContributionDbModel.findAll({
      where: whereClause,
      include: [
        {
          model: db.Member,
          as: 'member',                    // ← Must match the 'as' in model
          attributes: ['firstName', 'lastName']
        }
      ],
      order: [['date', 'DESC']]
    });

    return contributions;
  } catch (error: any) {
    throw new Error(`Service error fetching contributions: ${error.message}`);
  }
};

export const getContributionById = async (id: number): Promise<Contribution | null> => {
  try {
    const contribution = await ContributionDbModel.findByPk(id, {
      include: [
        {
          model: db.Member,
          as: 'member',
          attributes: ['firstName', 'lastName']
        }
      ]
    });
    return contribution;
  } catch (error: any) {
    throw new Error(`Service error fetching contribution by ID ${id}: ${error.message}`);
  }
};

export const updateContribution = async (id: number, contributionData: Partial<Contribution>): Promise<Contribution | null> => {
  try {
    const [updatedRowsCount] = await ContributionDbModel.update(contributionData, {
      where: { id },
      returning: true,
    });
    if (updatedRowsCount === 0) {
      return null;
    }
    const updatedContribution = await ContributionDbModel.findByPk(id);
    return updatedContribution;
  } catch (error: any) {
    throw new Error(`Service error updating contribution with ID ${id}: ${error.message}`);
  }
};

export const deleteContribution = async (id: number): Promise<number> => {
  try {
    const deletedRowCount = await ContributionDbModel.destroy({
      where: { id },
    });
    return deletedRowCount;
  } catch (error: any) {
    throw new Error(`Service error deleting contribution with ID ${id}: ${error.message}`);
  }
};