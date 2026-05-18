import { Request, Response } from 'express';
import * as contributionService from './contribution.service';
import { NotFoundError, BadRequestError } from '../utils/errors';

export const createContribution = async (req: Request, res: Response): Promise<Response> => {
  try {
    const newContribution = await contributionService.createContribution(req.body);
    return res.status(201).json(newContribution);
  } catch (error: any) {
    throw error;
  }
};

export const getAllContributions = async (req: Request, res: Response): Promise<Response> => {
  try {
    let memberId: number | undefined = undefined;

    if (req.query.memberId) {
      const parsedId = Number(req.query.memberId);
      if (isNaN(parsedId) || parsedId <= 0) {
        throw new BadRequestError('Invalid memberId provided');
      }
      memberId = parsedId;
    }

    const contributions = await contributionService.getAllContributions(memberId);
    return res.status(200).json(contributions);
  } catch (error: any) {
    throw error;
  }
};

export const getContributionById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const contribution = await contributionService.getContributionById(Number(req.params.id));
    if (!contribution) {
      throw new NotFoundError('Contribution not found.');
    }
    return res.status(200).json(contribution);
  } catch (error: any) {
    throw error;
  }
};

export const updateContribution = async (req: Request, res: Response): Promise<Response> => {
  try {
    const updatedContribution = await contributionService.updateContribution(Number(req.params.id), req.body);
    if (!updatedContribution) {
      throw new NotFoundError('Contribution not found or no changes made.');
    }
    return res.status(200).json(updatedContribution);
  } catch (error: any) {
    throw error;
  }
};

export const deleteContribution = async (req: Request, res: Response): Promise<Response> => {
  try {
    const deletedRowCount = await contributionService.deleteContribution(Number(req.params.id));
    if (deletedRowCount === 0) {
      throw new NotFoundError('Contribution not found.');
    }
    return res.status(204).send();
  } catch (error: any) {
    throw error;
  }
};