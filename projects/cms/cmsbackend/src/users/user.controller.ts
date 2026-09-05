import { NextFunction, Request, Response } from 'express';
import * as userService from './user.service';
import { paginationSchema } from '../common/pagination';
import { NotFoundError } from '../utils/errors';

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await userService.createUser(req.body));
  } catch (error) {
    next(error);
  }
};

export const getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json(await userService.getAllUsers(paginationSchema.parse(req.query)));
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userService.getUserById(Number(req.params.id));
    if (!user) {
      throw new NotFoundError('User not found.');
    }
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json(await userService.updateUser(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await userService.deleteUser(Number(req.params.id));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
