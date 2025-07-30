'use strict';

import { Request, Response } from 'express';
import * as contributionService from './contribution.service';

export const createContribution = async (req: Request, res: Response): Promise<Response> => {
  try {
    const newContribution = await contributionService.createContribution(req.body);
    return res.status(201).json(newContribution);
  } catch (error: any) {
    console.error('Error in createContribution controller:', error.message);
    if (error.message.includes('required.') || error.message.includes('positive number.') ||
        error.message.includes('Member with ID') || error.message.includes('Either a member ID') ||
        error.message.includes('Tithes and Offerings are recorded as daily totals') ||
        error.message.includes('A total for')) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to create contribution.' });
  }
};

export const getAllContributions = async (req: Request, res: Response): Promise<Response> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const filters = req.query as {
      type?: string;
      startDate?: string;
      endDate?: string;
      memberId?: number;
    };

    const { contributions, totalCount } = await contributionService.getAllContributions(
      filters,
      limit,
      offset
    );

    return res.status(200).json({
      data: contributions,
      meta: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error: any) {
    console.error('Error in getAllContributions controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve contributions.' });
  }
};

export const getContributionById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const contribution = await contributionService.getContributionById(Number(id));
    if (!contribution) {
      return res.status(404).json({ message: 'Contribution not found.' });
    }
    return res.status(200).json(contribution);
  } catch (error: any) {
    console.error('Error in getContributionById controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve contribution.' });
  }
};

export const updateContribution = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const updatedContribution = await contributionService.updateContribution(Number(id), req.body);
    if (!updatedContribution) {
      return res.status(404).json({ message: 'Contribution not found or no changes made.' });
    }
    return res.status(200).json(updatedContribution);
  } catch (error: any) {
    console.error('Error in updateContribution controller:', error.message);
    if (error.message.includes('not found for update.') ||
        error.message.includes('Contribution not found') ||
        error.message.includes('amount must be a positive number') ||
        error.message.includes('Cannot set member ID for contribution type') ||
        error.message.includes('Cannot set contributor name for contribution type') ||
        error.message.includes('Changing contribution type')) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to update contribution.' });
  }
};

export const deleteContribution = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const deletedRowCount = await contributionService.deleteContribution(Number(id));
    if (deletedRowCount === 0) {
      return res.status(404).json({ message: 'Contribution not found.' });
    }
    return res.status(204).send();
  } catch (error: any) {
    console.error('Error in deleteContribution controller:', error.message);
    return res.status(500).json({ message: 'Failed to delete contribution.' });
  }
};