import bcrypt from 'bcrypt';
import db from '@models';
import { User, UserAttributes } from './user.model';
import { BadRequestError, NotFoundError } from '../utils/errors';

const UserDbModel = db.User;

export const createUser = async (userData: { 
  username: string; 
  email: string; 
  password: string; 
  isAdmin?: boolean 
}): Promise<InstanceType<typeof User>> => {
  try {
    const { username, email, password, isAdmin } = userData;

    const password_hash = await bcrypt.hash(password, 10);

    const newUser = await UserDbModel.create({
      username,
      email,
      password_hash,
      isAdmin: isAdmin !== undefined ? isAdmin : false
    });

    return newUser;
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0].path;
      throw new BadRequestError(`Unique constraint error: ${field} already exists.`);
    }
    throw new Error(`Service error creating user: ${error.message}`);
  }
};

export const getAllUsers = async (limit: number, offset: number): Promise<{ 
  users: Array<InstanceType<typeof User>>, 
  totalCount: number 
}> => {
  try {
    const { count, rows } = await UserDbModel.findAndCountAll({
      limit,
      offset,
      order: [['username', 'ASC']],
    });
    return { users: rows, totalCount: count };
  } catch (error: any) {
    throw new Error(`Service error fetching all users: ${error.message}`);
  }
};

export const getUserById = async (id: number): Promise<InstanceType<typeof User> | null> => {
  try {
    const user = await UserDbModel.findByPk(id);
    return user;
  } catch (error: any) {
    throw new Error(`Service error fetching user by ID ${id}: ${error.message}`);
  }
};

export const updateUser = async (id: number, userData: {
  username?: string;
  email?: string;
  password?: string;
  isAdmin?: boolean;
}): Promise<InstanceType<typeof User>> => {
  try {
    const { password, ...rest } = userData;

    let updateData: Partial<UserAttributes> = { ...rest };

    // Only hash password if a new one was provided
    if (password && password.trim() !== '') {
      updateData.password_hash = await bcrypt.hash(password, 10);
    }

    const [updatedRowsCount] = await UserDbModel.update(updateData, {
      where: { id },
      individualHooks: true
    });

    // If no rows were updated, check if user exists and return it
    if (updatedRowsCount === 0) {
      const existingUser = await UserDbModel.findByPk(id);
      if (!existingUser) {
        throw new NotFoundError('User not found');
      }
      return existingUser;   // Return current user instead of throwing
    }

    const updatedUser = await UserDbModel.findByPk(id);
    if (!updatedUser) {
      throw new NotFoundError('User not found');
    }

    return updatedUser;
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0].path;
      throw new BadRequestError(`Unique constraint error: ${field} already exists.`);
    }
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new Error(`Service error updating user with ID ${id}: ${error.message}`);
  }
};

export const deleteUser = async (id: number): Promise<number> => {
  try {
    const deletedRowCount = await UserDbModel.destroy({
      where: { id },
    });
    if (deletedRowCount === 0) {
      throw new NotFoundError('User not found');
    }
    return deletedRowCount;
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new Error(`Service error deleting user with ID ${id}: ${error.message}`);
  }
};