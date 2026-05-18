import { Request, Response } from 'express';
import * as sermonService from './sermon.service';
import { NotFoundError, BadRequestError } from '../utils/errors';

export const createSermon = async (req: Request, res: Response): Promise<Response> => {
  try {
    const newSermon = await sermonService.createSermon(req.body);
    return res.status(201).json(newSermon);
  } catch (error: any) {
    throw error;
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
    throw error;
  }
};

export const getSermonById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const sermon = await sermonService.getSermonById(Number(id));
    if (!sermon) {
      throw new NotFoundError('Sermon not found.');
    }
    return res.status(200).json(sermon);
  } catch (error: any) {
    throw error;
  }
};

export const updateSermon = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const updatedSermon = await sermonService.updateSermon(Number(id), req.body);
    if (!updatedSermon) {
      throw new NotFoundError('Sermon not found or no changes made.');
    }
    return res.status(200).json(updatedSermon);
  } catch (error: any) {
    throw error;
  }
};

export const deleteSermon = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const deletedRowCount = await sermonService.deleteSermon(Number(id));
    if (deletedRowCount === 0) {
      throw new NotFoundError('Sermon not found.');
    }
    return res.status(204).send();
  } catch (error: any) {
    throw error;
  }
};