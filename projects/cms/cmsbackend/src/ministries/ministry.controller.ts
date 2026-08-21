import { Request, Response } from 'express';
import * as ministryService from './ministry.service';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors';

export const createMinistry = async (req: Request, res: Response) => {
  try {
    const newMinistry = await ministryService.createMinistry(req.body);
    return res.status(201).json(newMinistry);
  } catch (error: any) {
    throw error;
  }
};

export const getAllMinistries = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const filters = req.query;

    const { ministries, totalCount } = await ministryService.getAllMinistries(filters, limit, offset);
    return res.status(200).json({ data: ministries, meta: { totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) } });
  } catch (error: any) {
    throw error;
  }
};

export const getMinistryById = async (req: Request, res: Response) => {
  try {
    const ministry = await ministryService.getMinistryById(Number(req.params.id));
    if (!ministry) throw new NotFoundError('Ministry not found.');
    return res.status(200).json(ministry);
  } catch (error: any) {
    throw error;
  }
};

export const updateMinistry = async (req: Request, res: Response) => {
  try {
    const updatedMinistry = await ministryService.updateMinistry(Number(req.params.id), req.body);
    if (!updatedMinistry) throw new NotFoundError('Ministry not found or no changes made.');
    return res.status(200).json(updatedMinistry);
  } catch (error: any) {
    throw error;
  }
};

export const deleteMinistry = async (req: Request, res: Response) => {
  try {
    const deletedRowCount = await ministryService.deleteMinistry(Number(req.params.id));
    if (deletedRowCount === 0) throw new NotFoundError('Ministry not found.');
    return res.status(204).send();
  } catch (error: any) {
    throw error;
  }
};

export const addMemberToMinistry = async (req: Request, res: Response) => {
  try {
    const { ministryId } = req.params;
    const { memberId, role } = req.body;
    const result = await ministryService.addMemberToMinistry(Number(ministryId), memberId, role);
    return res.status(201).json(result);
  } catch (error: any) {
    throw error;
  }
};

export const removeMemberFromMinistry = async (req: Request, res: Response) => {
  try {
    const { ministryId } = req.params;
    const { memberId } = req.body;
    const deletedCount = await ministryService.removeMemberFromMinistry(Number(ministryId), memberId);
    if (deletedCount === 0) throw new NotFoundError('Member not found in this ministry.');
    return res.status(204).send();
  } catch (error: any) {
    throw error;
  }
};

export const getMembersOfMinistry = async (req: Request, res: Response) => {
  try {
    const members = await ministryService.getMembersOfMinistry(Number(req.params.ministryId));
    return res.status(200).json(members);
  } catch (error: any) {
    throw error;
  }
};