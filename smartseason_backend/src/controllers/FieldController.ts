import { Request, Response } from 'express';
import { FieldService } from '../services/FieldService';
import { FieldRepository } from '../repositories/FieldRepository';

const fieldService = new FieldService();
const fieldRepo = new FieldRepository();

export const createField = async (req: Request, res: Response) => {
  try {
    const field = await fieldRepo.create(req.body);
    res.status(201).json({ success: true, data: field });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getAllFields = async (req: Request, res: Response) => {
  try {
    const fields = await fieldRepo.findAll();
    res.status(200).json({ success: true, data: fields });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAgentFields = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const fields = await fieldRepo.findByAgentId(user.id);
    res.status(200).json({ success: true, data: fields });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateFieldStage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { stage, notes } = req.body;
    const user = (req as any).user;
    const updatedField = await fieldService.updateStageAndCalculate(Number(id), stage, notes, user.id);
    res.status(200).json({ success: true, data: updatedField });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};