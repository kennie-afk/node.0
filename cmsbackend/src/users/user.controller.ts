import { Request, Response } from 'express';
import * as userService from './user.service';

export const createUser = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { username, email, password, isAdmin } = req.body;

    const newUser = await userService.createUser({ username, email, password, isAdmin });

    return res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      isAdmin: newUser.isAdmin,
      createdAt: newUser.createdAt,
    });
  } catch (error: any) {
    console.error('Error in createUser controller:', error.message);

    if (error.message.includes('Unique constraint error')) {
        const field = error.message.split(': ')[1].replace(' already exists.', '');
        return res.status(409).json({ message: `${field} already exists.` });
    }
    if (error.message.includes('required.')) {
        return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: 'Failed to create user.' });
  }
};

export const getAllUsers = async (req: Request, res: Response): Promise<Response> => {
  try {
    const users = await userService.getAllUsers();
    return res.status(200).json(users);
  } catch (error: any) {
    console.error('Error in getAllUsers controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve users.' });
  }
};

export const getUserById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const user = await userService.getUserById(Number(id));

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json(user);
  } catch (error: any) {
    console.error('Error in getUserById controller:', error.message);
    return res.status(500).json({ message: 'Failed to retrieve user.' });
  }
};

export const updateUser = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const userData = req.body;

    const updatedUser = await userService.updateUser(Number(id), userData);

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found or no changes made.' });
    }

    return res.status(200).json(updatedUser);
  } catch (error: any) {
    console.error('Error in updateUser controller:', error.message);
    if (error.message.includes('Unique constraint error')) {
      const field = error.message.split(': ')[1].replace(' already exists.', '');
      return res.status(409).json({ message: `${field} already exists.` });
    }
    return res.status(500).json({ message: 'Failed to update user.' });
  }
};

export const deleteUser = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const deletedRowCount = await userService.deleteUser(Number(id));

    if (deletedRowCount === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error('Error in deleteUser controller:', error.message);
    return res.status(500).json({ message: 'Failed to delete user.' });
  }
};