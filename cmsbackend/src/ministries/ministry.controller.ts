import { Request, Response } from 'express';
import * as ministryService from './ministry.service';

export const createMinistry = async (req: Request, res: Response): Promise<Response> => {
  try {
    const ministryData = req.body;
    const newMinistry = await ministryService.createMinistry(ministryData);
    return res.status(201).json(newMinistry);
  } catch (error: any) {
    console.error('Error in createMinistry controller:', error.message);
    if (error.message.includes('not found')) {
      return res.status(404).json({ message: error.message });
    }
    if (error.message.includes('already exists')) {
      return res.status(409).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to create ministry.' });
  }
};

export const getAllMinistries = async (req: Request, res: Response): Promise<Response> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const filters = req.query;

    const { ministries, totalCount } = await ministryService.getAllMinistries(filters, limit, offset);

    return res.status(200).json({
      data: ministries,
      meta: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error: any) {
    console.error('Error in getAllMinistries controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve ministries.' });
  }
};

export const getMinistryById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const ministry = await ministryService.getMinistryById(Number(id));

    if (!ministry) {
      return res.status(404).json({ message: 'Ministry not found.' });
    }

    return res.status(200).json(ministry);
  } catch (error: any) {
    console.error('Error in getMinistryById controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve ministry.' });
  }
};

export const updateMinistry = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const ministryData = req.body;

    const updatedMinistry = await ministryService.updateMinistry(Number(id), ministryData);

    if (!updatedMinistry) {
      return res.status(404).json({ message: 'Ministry not found or no changes made.' });
    }

    return res.status(200).json(updatedMinistry);
  } catch (error: any) {
    console.error('Error in updateMinistry controller:', error.message);
    if (error.message.includes('not found')) {
      return res.status(404).json({ message: error.message });
    }
    if (error.message.includes('already exists')) {
      return res.status(409).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to update ministry.' });
  }
};

export const deleteMinistry = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const deletedRowCount = await ministryService.deleteMinistry(Number(id));

    if (deletedRowCount === 0) {
      return res.status(404).json({ message: 'Ministry not found.' });
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error in deleteMinistry controller:', error.message);
    return res.status(500).json({ message: 'Failed to delete ministry.' });
  }
};

export const addMemberToMinistry = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { ministryId, memberId } = req.params;
    const { role } = req.body;
    const ministryMember = await ministryService.addMemberToMinistry(Number(ministryId), Number(memberId), role);
    return res.status(201).json(ministryMember);
  } catch (error: any) {
    console.error('Error in addMemberToMinistry controller:', error.message);
    if (error.message.includes('not found')) {
      return res.status(404).json({ message: error.message });
    }
    if (error.message.includes('already part of')) {
      return res.status(409).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to add member to ministry.' });
  }
};

export const removeMemberFromMinistry = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { ministryId, memberId } = req.params;
    const deletedCount = await ministryService.removeMemberFromMinistry(Number(ministryId), Number(memberId));
    if (deletedCount === 0) {
      return res.status(404).json({ message: 'Member not found in this ministry.' });
    }
    return res.status(204).send();
  } catch (error: any) {
    console.error('Error in removeMemberFromMinistry controller:', error.message);
    return res.status(500).json({ message: 'Failed to remove member from ministry.' });
  }
};

export const getMembersOfMinistry = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { ministryId } = req.params;
    const members = await ministryService.getMembersOfMinistry(Number(ministryId));
    return res.status(200).json(members);
  } catch (error: any) {
    console.error('Error in getMembersOfMinistry controller:', error.message);
    if (error.message.includes('not found')) {
      return res.status(404).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to retrieve members of ministry.' });
  }
};