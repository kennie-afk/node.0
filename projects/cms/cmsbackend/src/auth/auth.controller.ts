import { NextFunction, Request, Response } from 'express';
import * as authService from './auth.service';
import { UnauthorizedError } from '../utils/errors';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const session = await authService.loginUser(email, password);
    res.status(200).json(session);
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Unauthorized');
    }
    const user = await authService.getProfile(req.user.id, req.user.churchId);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};
