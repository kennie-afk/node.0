import { Request, Response } from 'express';
import * as authService from './auth.service';
import { AuthenticatedRequest } from '../types/express';

export const login = async (req: Request, res: Response): Promise<Response> => {
  const { email, password } = req.body;
  try {
    const token = await authService.loginUser(email, password);
    return res.status(200).json({ token });
  } catch (error: any) {
    return res.status(401).json({ message: error.message || 'Invalid credentials' });
  }
};

export const getProfile = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const user = await authService.getProfile(userId);
    return res.status(200).json(user);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to retrieve user profile' });
  }
};