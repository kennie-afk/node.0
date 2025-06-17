import bcrypt from 'bcrypt';
import db from '@models';
import { User, UserAttributes } from './user.model';

const UserDbModel = db.User;

export const createUser = async (userData: { username: string; email: string; password: string; isAdmin?: boolean }): Promise<InstanceType<typeof User>> => {
  try {
    const { username, email, password, isAdmin } = userData;

    if (!username || !email || !password) {
      throw new Error('Username, email, and password are required.');
    }

    const password_hash = await bcrypt.hash(password, 10);

    const newUser = await UserDbModel.create({
      username,
      email,
      password_hash,
      isAdmin: isAdmin !== undefined ? isAdmin : true
    });

    return newUser;
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0].path;
      throw new Error(`Unique constraint error: ${field} already exists.`);
    }
    throw new Error(`Service error creating user: ${error.message}`);
  }
};

export const getAllUsers = async (): Promise<Array<InstanceType<typeof User>>> => {
  try {
    const users = await UserDbModel.findAll();
    return users;
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
}): Promise<InstanceType<typeof User> | null> => {
  try {
    const { password, ...rest } = userData;

    let updateData: Partial<UserAttributes> = { ...rest };

    if (password) {
      updateData.password_hash = await bcrypt.hash(password, 10);
    }

    const [updatedRowsCount] = await UserDbModel.update(updateData, {
      where: { id },
      individualHooks: true
    });

    if (updatedRowsCount === 0) {
      return null;
    }

    const updatedUser = await UserDbModel.findByPk(id);
    return updatedUser;
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0].path;
      throw new Error(`Unique constraint error: ${field} already exists.`);
    }
    throw new Error(`Service error updating user with ID ${id}: ${error.message}`);
  }
};

export const deleteUser = async (id: number): Promise<number> => {
  try {
    const deletedRowCount = await UserDbModel.destroy({
      where: { id },
    });
    return deletedRowCount;
  } catch (error: any) {
    throw new Error(`Service error deleting user with ID ${id}: ${error.message}`);
  }
};