import { Request, Response } from 'express';
import * as familyService from './family.service';

export const createFamily = async (req: Request, res: Response): Promise<Response> => {
  try {
    const familyData = req.body;

    const newFamily = await familyService.createFamily(familyData);
    return res.status(201).json(newFamily);
  } catch (error: any) {
    console.error('Error creating family:', error); 
    if (error.message.includes('required.')) {
      return res.status(400).json({ message: error.message });
    }
    if (error.message.includes('not found.')) {
      return res.status(400).json({ message: error.message });
    }
    if (error.message.includes('Unique constraint error')) {
      return res.status(409).json({ message: error.message }); 
    }
    return res.status(500).json({ message: 'Failed to create family.' });
  }
};

export const getAllFamilies = async (req: Request, res: Response): Promise<Response> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const filters = req.query;

    const { families, totalCount } = await familyService.getAllFamilies(filters, limit, offset); 
    
    return res.status(200).json({
      data: families,
      meta: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching families:', error);
    return res.status(500).json({ message: 'Failed to retrieve families.' });
  }
};

export const getFamilyById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const family = await familyService.getFamilyById(Number(id)); 

    if (!family) {
      return res.status(404).json({ message: 'Family not found.' });
    }

    return res.status(200).json(family);
  } catch (error: any) {
    console.error('Error fetching family by ID:', error);
    return res.status(500).json({ message: 'Failed to retrieve family.' });
  }
};

export const updateFamily = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const familyData = req.body;

    const updatedFamily = await familyService.updateFamily(Number(id), familyData);

    if (!updatedFamily) {
      return res.status(404).json({ message: 'Family not found or no changes made.' });
    }
    
    return res.status(200).json(updatedFamily);
  } catch (error: any) {
    if (error.message.includes('not found for update.')) {
      return res.status(400).json({ message: error.message });
    }
    if (error.message.includes('Unique constraint error')) {
      return res.status(409).json({ message: error.message });
    }
    console.error('Error updating family:', error);
    return res.status(500).json({ message: 'Failed to update family.' });
  }
};

export const deleteFamily = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const deletedRowCount = await familyService.deleteFamily(Number(id));

    if (deletedRowCount === 0) {
      return res.status(404).json({ message: 'Family not found.' });
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting family:', error);
    return res.status(500).json({ message: 'Failed to delete family.' });
  }
};