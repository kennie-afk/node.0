import { Request, Response } from 'express';
import * as userService from './user.service';
import { NotFoundError, BadRequestError } from '../utils/errors';

export const createUser = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { username, email, password, isAdmin } = req.body;
    const newUser = await userService.createUser({ username, email, password, isAdmin });

    const userResponse = {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      isAdmin: newUser.isAdmin,
      createdAt: newUser.createdAt,
    };
    return res.status(201).json(userResponse);
  } catch (error: any) {
    throw error;
  }
};

export const getAllUsers = async (req: Request, res: Response): Promise<Response> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const { users, totalCount } = await userService.getAllUsers(limit, offset);
    return res.status(200).json({
      data: users,
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

export const getUserById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const user = await userService.getUserById(Number(id));

    if (!user) {
      throw new NotFoundError('User not found.');
    }

    return res.status(200).json(user);
  } catch (error: any) {
    throw error;
  }
};

export const updateUser = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const userData = req.body;

    if (!userData.password || userData.password.trim() === '') {
      delete userData.password;
    }

    const updatedUser = await userService.updateUser(Number(id), userData);

    if (!updatedUser) {
      const userExists = await userService.getUserById(Number(id));
      if (!userExists) {
        throw new NotFoundError('User not found.');
      }
      return res.status(200).json(userExists);
    }

    return res.status(200).json(updatedUser);
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ message: error.message });
    }
    console.error('Update user error:', error);
    return res.status(500).json({ message: 'Failed to update user' });
  }
};

export const deleteUser = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const deletedRowCount = await userService.deleteUser(Number(id));

    if (deletedRowCount === 0) {
      throw new NotFoundError('User not found.');
    }

    return res.status(204).send();
  } catch (error: any) {
    throw error;
  }
};
