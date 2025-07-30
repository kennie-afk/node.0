import { Request, Response } from 'express';
import * as sermonService from './sermon.service';

export const createSermon = async (req: Request, res: Response): Promise<Response> => {
  try {
    const newSermon = await sermonService.createSermon(req.body);
    return res.status(201).json(newSermon);
  } catch (error: any) {
    console.error('Error in createSermon controller:', error.message);
    if (error.message.includes('required.')) {
      return res.status(400).json({ message: error.message });
    }
    if (error.message.includes('not found.')) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to create sermon.' });
  }
};

export const getAllSermons = async (req: Request, res: Response): Promise<Response> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const { sermons, totalCount } = await sermonService.getAllSermons(limit, offset);

    return res.status(200).json({
      data: sermons,
      meta: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error: any) {
    console.error('Error in getAllSermons controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve sermons.' });
  }
};

export const getSermonById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const sermon = await sermonService.getSermonById(Number(id));
    if (!sermon) {
      return res.status(404).json({ message: 'Sermon not found.' });
    }
    return res.status(200).json(sermon);
  } catch (error: any) {
    console.error('Error in getSermonById controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve sermon.' });
  }
};

export const updateSermon = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const updatedSermon = await sermonService.updateSermon(Number(id), req.body);
    if (!updatedSermon) {
      return res.status(404).json({ message: 'Sermon not found or no changes made.' });
    }
    return res.status(200).json(updatedSermon);
  } catch (error: any) {
    console.error('Error in updateSermon controller:', error.message);
    if (error.message.includes('not found for update.')) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to update sermon.' });
  }
};

export const deleteSermon = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const deletedRowCount = await sermonService.deleteSermon(Number(id));
    if (deletedRowCount === 0) {
      return res.status(404).json({ message: 'Sermon not found.' });
    }
    return res.status(204).send();
  } catch (error: any) {
    console.error('Error in deleteSermon controller:', error.message);
    return res.status(500).json({ message: 'Failed to delete sermon.' });
  }
};