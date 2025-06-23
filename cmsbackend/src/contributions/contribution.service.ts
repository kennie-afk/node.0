'use strict';

import db from '@models';
import { Contribution } from './contribution.model';
import { Member } from '@members/member.model';
import { Op } from 'sequelize';

const ContributionDbModel = db.Contribution;
const MemberDbModel = db.Member;

const AGGREGATED_CONTRIBUTION_TYPES = ['Tithe', 'Offering'];

export const createContribution = async (data: {
  memberId?: number | null;
  contributorName?: string | null;
  amount: number;
  contributionDate: Date | string;
  contributionType: string;
  paymentMethod?: string;
  transactionId?: string;
  notes?: string;
}) => {
  try {
    let { memberId, contributorName, amount, contributionDate, contributionType, ...rest } = data;

    if (amount <= 0) {
      throw new Error('Contribution amount must be a positive number.');
    }
    if (!contributionType) {
      throw new Error('Contribution type is required.');
    }
    if (!contributionDate) {
      throw new Error('Contribution date is required.');
    }

    if (AGGREGATED_CONTRIBUTION_TYPES.includes(contributionType)) {
      if (memberId !== undefined && memberId !== null) {
        throw new Error(`Tithes and Offerings are recorded as daily totals. Member ID should not be provided for type '${contributionType}'.`);
      }
      if (contributorName !== undefined && contributorName !== null && contributorName.trim() !== '') {
        throw new Error(`Tithes and Offerrings are recorded as daily totals. Contributor name should not be provided for type '${contributionType}'.`);
      }

      memberId = null;
      contributorName = null;

      const existingTotal = await ContributionDbModel.findOne({
        where: {
          contributionType: contributionType,
          contributionDate: new Date(contributionDate),
          memberId: null,
          contributorName: null
        }
      });

      if (existingTotal) {
        existingTotal.amount = parseFloat(existingTotal.amount.toString()) + amount;
        await existingTotal.save();
        return existingTotal;
      }

    } else {
      if (!memberId && !contributorName) {
        throw new Error(`For contribution type '${contributionType}', either a member ID or a contributor name must be provided.`);
      }

      if (memberId) {
        const member = await MemberDbModel.findByPk(memberId);
        if (!member) {
          throw new Error(`Member with ID ${memberId} not found.`);
        }
      }
    }

    const newContribution = await ContributionDbModel.create({
      memberId,
      contributorName,
      amount,
      contributionDate: new Date(contributionDate),
      contributionType,
      ...rest,
    });

    if (!AGGREGATED_CONTRIBUTION_TYPES.includes(newContribution.contributionType)) {
      const createdWithMember = await ContributionDbModel.findByPk(newContribution.id, {
        include: [{
          model: MemberDbModel,
          as: 'contributorMember',
          attributes: ['id', 'firstName', 'lastName']
        }]
      });
      return createdWithMember;
    }
    return newContribution;
  } catch (error: any) {
    console.error('Service error creating contribution:', error.message);
    throw new Error(`Service error creating contribution: ${error.message}`);
  }
};

export const getAllContributions = async (filters: {
  type?: string;
  startDate?: string;
  endDate?: string;
  memberId?: number;
  limit?: number;
  offset?: number;
}) => {
  try {
    const where: any = {};
    const include: any[] = [];

    if (filters.type) {
      where.contributionType = filters.type;
    }
    if (filters.memberId) {
      where.memberId = filters.memberId;
      include.push({
        model: MemberDbModel,
        as: 'contributorMember',
        attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
        required: true
      });
    } else {
      include.push({
        model: MemberDbModel,
        as: 'contributorMember',
        attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
        required: false
      });
    }

    if (filters.startDate && filters.endDate) {
      where.contributionDate = {
        [Op.between]: [new Date(filters.startDate), new Date(filters.endDate)]
      };
    } else if (filters.startDate) {
      where.contributionDate = {
        [Op.gte]: new Date(filters.startDate)
      };
    } else if (filters.endDate) {
      where.contributionDate = {
        [Op.lte]: new Date(filters.endDate)
      };
    }

    const contributions = await ContributionDbModel.findAll({
      where,
      limit: filters.limit ? Number(filters.limit) : undefined,
      offset: filters.offset ? Number(filters.offset) : undefined,
      order: [['contributionDate', 'DESC']],
      include: include
    });
    return contributions;
  } catch (error: any) {
    console.error('Service error fetching all contributions:', error.message);
    throw new Error(`Service error fetching all contributions: ${error.message}`);
  }
};

export const getContributionById = async (id: number) => {
  try {
    const contribution = await ContributionDbModel.findByPk(id, {
      include: [{
        model: MemberDbModel,
        as: 'contributorMember',
        attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
        required: false
      }]
    });
    return contribution;
  } catch (error: any) {
    console.error(`Service error fetching contribution by ID ${id}:`, error.message);
    throw new Error(`Service error fetching contribution by ID ${id}: ${error.message}`);
  }
};

export const updateContribution = async (id: number, contributionData: {
  memberId?: number | null;
  contributorName?: string | null;
  amount?: number;
  contributionDate?: Date | string;
  contributionType?: string;
  paymentMethod?: string;
  transactionId?: string;
  notes?: string;
}) => {
  try {
    const contribution = await ContributionDbModel.findByPk(id);
    if (!contribution) {
      return null;
    }

    let { memberId, contributorName, amount, contributionDate, contributionType, ...rest } = contributionData;

    const originalContributionType = contribution.contributionType;
    const isOriginalAggregated = AGGREGATED_CONTRIBUTION_TYPES.includes(originalContributionType);
    const isNewAggregated = AGGREGATED_CONTRIBUTION_TYPES.includes(contributionType || originalContributionType);

    if (contributionType && contributionType !== originalContributionType) {
        if ((isOriginalAggregated && !isNewAggregated) || (!isOriginalAggregated && isNewAggregated)) {
            throw new Error(`Changing contribution type from '${originalContributionType}' to '${contributionType}' is not allowed due to privacy rules (cannot change aggregated type to identifiable or vice-versa).`);
        }
    }

    if (isOriginalAggregated || isNewAggregated) {
        if (memberId !== undefined && memberId !== null) {
            throw new Error(`Cannot set member ID for aggregated contribution type '${originalContributionType}'.`);
        }
        if (contributorName !== undefined && contributorName !== null && contributorName.trim() !== '') {
            throw new Error(`Cannot set contributor name for aggregated contribution type '${originalContributionType}'.`);
        }
        memberId = null;
        contributorName = null;
    } else {
        if (memberId !== undefined && memberId !== null) {
            const member = await MemberDbModel.findByPk(memberId);
            if (!member) {
                throw new Error(`Member with ID ${memberId} not found for update.`);
            }
        }
    }

    if (amount !== undefined && amount <= 0) {
      throw new Error('Contribution amount must be a positive number.');
    }

    const updatePayload: {
      memberId?: number | null;
      contributorName?: string | null;
      amount?: number;
      contributionDate?: Date;
      contributionType?: string;
      paymentMethod?: string;
      transactionId?: string;
      notes?: string;
    } = {
      memberId,
      contributorName,
      amount,
      contributionType,
      ...rest
    };

    if (contributionDate !== undefined) {
      updatePayload.contributionDate = new Date(contributionDate);
    }

    const [updatedRowsCount] = await ContributionDbModel.update(updatePayload, {
      where: { id },
    });

    if (updatedRowsCount === 0) {
      return null;
    }

    const updatedContribution = await ContributionDbModel.findByPk(id, {
      include: [{
        model: MemberDbModel,
        as: 'contributorMember',
        attributes: ['id', 'firstName', 'lastName']
      }]
    });
    return updatedContribution;
  } catch (error: any) {
    console.error(`Service error updating contribution with ID ${id}:`, error.message);
    throw new Error(`Service error updating contribution with ID ${id}: ${error.message}`);
  }
};

export const deleteContribution = async (id: number) => {
  try {
    const deletedRowCount = await ContributionDbModel.destroy({
      where: { id },
    });
    return deletedRowCount;
  } catch (error: any) {
    console.error(`Service error deleting contribution with ID ${id}:`, error.message);
    throw new Error(`Service error deleting contribution with ID ${id}: ${error.message}`);
  }
};