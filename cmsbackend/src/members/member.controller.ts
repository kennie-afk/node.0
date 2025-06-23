import { Request, Response } from 'express';
import * as memberService from './member.service';

export const createMember = async (req: Request, res: Response): Promise<Response> => {
  try {
    const memberData = req.body;
    const newMember = await memberService.createMember(memberData);
    return res.status(201).json(newMember);
  } catch (error: any) {
    console.error('Error in createMember controller:', error.message);
    if (error.message.includes('Unique constraint error')) {
      const field = error.message.split(': ')[1].split(' ')[0];
      return res.status(409).json({ message: `${field} already exists.` });
    }
    if (error.message.includes('required.')) {
      return res.status(400).json({ message: error.message });
    }
    if (error.message.includes('not found.')) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to create member.' });
  }
};

export const getAllMembers = async (req: Request, res: Response): Promise<Response> => {
  try {
    const filters = req.query;
    const includeFamily = filters.includeFamily === 'true';
    const includeMinistries = filters.includeMinistries === 'true';
    const includeSmallGroups = filters.includeSmallGroups === 'true';
    const includeContributions = filters.includeContributions === 'true';
    const includeLedMinistries = filters.includeLedMinistries === 'true';

    const members = await memberService.getAllMembers({
      ...filters,
      includeFamily,
      includeMinistries,
      includeSmallGroups,
      includeContributions,
      includeLedMinistries
    });
    return res.status(200).json(members);
  } catch (error: any) {
    console.error('Error in getAllMembers controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve members.' });
  }
};

export const getMemberById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const includeFamily = req.query.includeFamily === 'true';
    const includeMinistries = req.query.includeMinistries === 'true';
    const includeSmallGroups = req.query.includeSmallGroups === 'true';
    const includeContributions = req.query.includeContributions === 'true';
    const includeLedMinistries = req.query.includeLedMinistries === 'true';

    const member = await memberService.getMemberById(
      Number(id),
      includeFamily,
      includeMinistries,
      includeSmallGroups,
      includeContributions,
      includeLedMinistries
    );

    if (!member) {
      return res.status(404).json({ message: 'Member not found.' });
    }

    return res.status(200).json(member);
  } catch (error: any) {
    console.error('Error in getMemberById controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve member.' });
  }
};

export const updateMember = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const memberData = req.body;

    const updatedMember = await memberService.updateMember(Number(id), memberData);

    if (!updatedMember) {
      return res.status(404).json({ message: 'Member not found or no changes made.' });
    }

    return res.status(200).json(updatedMember);
  } catch (error: any) {
    console.error('Error in updateMember controller:', error.message);
    if (error.message.includes('Unique constraint error')) {
      const field = error.message.split(': ')[1].split(' ')[0];
      return res.status(409).json({ message: `${field} already exists.` });
    }
    if (error.message.includes('not found for update.')) {
        return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to update member.' });
  }
};

export const deleteMember = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const deletedRowCount = await memberService.deleteMember(Number(id));

    if (deletedRowCount === 0) {
      return res.status(404).json({ message: 'Member not found.' });
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error in deleteMember controller:', error.message);
    return res.status(500).json({ message: 'Failed to delete member.' });
  }
};