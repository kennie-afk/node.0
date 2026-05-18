import { Request, Response } from 'express';
import * as smallGroupService from './small_group.service';
import { NotFoundError, BadRequestError } from '../utils/errors';

export const createSmallGroup = async (req: Request, res: Response): Promise<Response> => {
  try {
    const newSmallGroup = await smallGroupService.createSmallGroup(req.body);
    return res.status(201).json(newSmallGroup);
  } catch (error: any) {
    throw error;
  }
};

export const getAllSmallGroups = async (req: Request, res: Response): Promise<Response> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const filters = req.query;

    const { smallGroups, totalCount } = await smallGroupService.getAllSmallGroups(filters, limit, offset);

    return res.status(200).json({
      data: smallGroups,
      meta: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error: any) {
    throw error;
  }
};

export const getSmallGroupById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const smallGroup = await smallGroupService.getSmallGroupById(Number(id));
    if (!smallGroup) {
      throw new NotFoundError('Small Group not found.');
    }
    return res.status(200).json(smallGroup);
  } catch (error: any) {
    throw error;
  }
};

export const updateSmallGroup = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const smallGroupData = req.body;

    const updatedSmallGroup = await smallGroupService.updateSmallGroup(Number(id), smallGroupData);

    if (!updatedSmallGroup) {
      throw new NotFoundError('Small Group not found or no changes made.');
    }

    return res.status(200).json(updatedSmallGroup);
  } catch (error: any) {
    throw error;
  }
};

export const deleteSmallGroup = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const deletedRowCount = await smallGroupService.deleteSmallGroup(Number(id));

    if (deletedRowCount === 0) {
      throw new NotFoundError('Small Group not found.');
    }

    return res.status(204).send();
  } catch (error: any) {
    throw error;
  }
};

export const addMemberToSmallGroup = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { smallGroupId, memberId } = req.params;
    const { role } = req.body;
    const smallGroupMember = await smallGroupService.addMemberToSmallGroup(Number(smallGroupId), Number(memberId), role);
    return res.status(201).json(smallGroupMember);
  } catch (error: any) {
    throw error;
  }
};

export const removeMemberFromSmallGroup = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { smallGroupId, memberId } = req.params;
    const deletedCount = await smallGroupService.removeMemberFromSmallGroup(Number(smallGroupId), Number(memberId));
    if (deletedCount === 0) {
      throw new NotFoundError('Member not found in this small group.');
    }
    return res.status(204).send();
  } catch (error: any) {
    throw error;
  }
};

export const getMembersOfSmallGroup = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { smallGroupId } = req.params;
    const members = await smallGroupService.getMembersOfSmallGroup(Number(smallGroupId));
    if (!members) {
      throw new NotFoundError('Small Group not found.');
    }
    return res.status(200).json(members);
  } catch (error: any) {
    throw error;
  }
};
