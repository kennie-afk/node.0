import { Request, Response } from 'express';
import * as smallGroupService from './small_group.service';

export const createSmallGroup = async (req: Request, res: Response): Promise<Response> => {
  try {
    const smallGroupData = req.body;
    const newSmallGroup = await smallGroupService.createSmallGroup(smallGroupData);
    return res.status(201).json(newSmallGroup);
  } catch (error: any) {
    console.error('Error in createSmallGroup controller:', error.message);
    if (error.message.includes('not found')) {
      return res.status(404).json({ message: error.message });
    }
    if (error.message.includes('already exists')) {
      return res.status(409).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to create small group.' });
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
    console.error('Error in getAllSmallGroups controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve small groups.' });
  }
};

export const getSmallGroupById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const smallGroup = await smallGroupService.getSmallGroupById(Number(id));

    if (!smallGroup) {
      return res.status(404).json({ message: 'Small Group not found.' });
    }

    return res.status(200).json(smallGroup);
  }
  catch (error: any) {
    console.error('Error in getSmallGroupById controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve small group.' });
  }
};

export const updateSmallGroup = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const smallGroupData = req.body;

    const updatedSmallGroup = await smallGroupService.updateSmallGroup(Number(id), smallGroupData);

    if (!updatedSmallGroup) {
      return res.status(404).json({ message: 'Small Group not found or no changes made.' });
    }

    return res.status(200).json(updatedSmallGroup);
  } catch (error: any) {
    console.error('Error in updateSmallGroup controller:', error.message);
    if (error.message.includes('not found')) {
      return res.status(404).json({ message: error.message });
    }
    if (error.message.includes('already exists')) {
      return res.status(409).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to update small group.' });
  }
};

export const deleteSmallGroup = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const deletedRowCount = await smallGroupService.deleteSmallGroup(Number(id));

    if (deletedRowCount === 0) {
      return res.status(404).json({ message: 'Small Group not found.' });
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error in deleteSmallGroup controller:', error.message);
    return res.status(500).json({ message: 'Failed to delete small group.' });
  }
};

export const addMemberToSmallGroup = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { smallGroupId, memberId } = req.params;
    const { role } = req.body;
    const smallGroupMember = await smallGroupService.addMemberToSmallGroup(Number(smallGroupId), Number(memberId), role);
    return res.status(201).json(smallGroupMember);
  } catch (error: any) {
    console.error('Error in addMemberToSmallGroup controller:', error.message);
    if (error.message.includes('not found')) {
      return res.status(404).json({ message: error.message });
    }
    if (error.message.includes('already part of')) {
      return res.status(409).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to add member to small group.' });
  }
};

export const removeMemberFromSmallGroup = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { smallGroupId, memberId } = req.params;
    const deletedCount = await smallGroupService.removeMemberFromSmallGroup(Number(smallGroupId), Number(memberId));
    if (deletedCount === 0) {
      return res.status(404).json({ message: 'Member not found in this small group.' });
    }
    return res.status(204).send();
  } catch (error: any) {
    console.error('Error in removeMemberFromSmallGroup controller:', error.message);
    return res.status(500).json({ message: 'Failed to remove member from small group.' });
  }
};

export const getMembersOfSmallGroup = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { smallGroupId } = req.params;
    const members = await smallGroupService.getMembersOfSmallGroup(Number(smallGroupId));
    return res.status(200).json(members);
  } catch (error: any) {
    console.error('Error in getMembersOfSmallGroup controller:', error.message);
    if (error.message.includes('not found')) {
      return res.status(404).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to retrieve members of small group.' });
  }
};