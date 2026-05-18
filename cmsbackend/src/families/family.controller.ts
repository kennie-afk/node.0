import { Request, Response } from 'express';
import * as familyService from './family.service';
import { NotFoundError } from '../utils/errors';

export const createFamily = async (req: Request, res: Response): Promise<Response> => {
  try {
    const newFamily = await familyService.createFamily(req.body);
    return res.status(201).json(newFamily);
  } catch (error: any) {
    throw error;
  }
};

export const getAllFamilies = async (req: Request, res: Response): Promise<Response> => {
  try {
    const families = await familyService.getAllFamilies();
    return res.status(200).json(families);
  } catch (error: any) {
    throw error;
  }
};

export const getFamilyById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const family = await familyService.getFamilyById(Number(req.params.id));
    if (!family) {
      throw new NotFoundError('Family not found.');
    }
    return res.status(200).json(family);
  } catch (error: any) {
    throw error;
  }
};

export const updateFamily = async (req: Request, res: Response): Promise<Response> => {
  try {
    const updatedFamily = await familyService.updateFamily(Number(req.params.id), req.body);
    if (!updatedFamily) {
      throw new NotFoundError('Family not found or no changes made.');
    }
    return res.status(200).json(updatedFamily);
  } catch (error: any) {
    throw error;
  }
};

export const deleteFamily = async (req: Request, res: Response): Promise<Response> => {
  try {
    const deletedRowCount = await familyService.deleteFamily(Number(req.params.id));
    if (deletedRowCount === 0) {
      throw new NotFoundError('Family not found.');
    }
    return res.status(204).send();
  } catch (error: any) {
    throw error;
  }
};