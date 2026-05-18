import { Request, Response } from 'express';
import { FieldService } from '../services/FieldService';

const fieldService = new FieldService();

export const getDashboard = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const data = await fieldService.getDashboardData(user.id, user.role);
    res.status(200).json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};