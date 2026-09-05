import bcrypt from 'bcrypt';
import db from '@models';
import { User } from './user.model';
import { TenantRepository } from '../common/tenant-repository';
import { Page, Pagination } from '../common/pagination';
import { BadRequestError } from '../utils/errors';

const users = new TenantRepository<any>(db.User, 'User');

const PUBLIC_ATTRIBUTES = { exclude: ['password_hash'] };
const PASSWORD_ROUNDS = 12;

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  isAdmin?: boolean;
}

export const createUser = async (input: CreateUserInput): Promise<InstanceType<typeof User>> => {
  try {
    const created = await users.create({
      username: input.username,
      email: input.email,
      password_hash: await bcrypt.hash(input.password, PASSWORD_ROUNDS),
      isAdmin: input.isAdmin ?? false
    });
    return users.findByIdOrFail(created.id, { attributes: PUBLIC_ATTRIBUTES });
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw new BadRequestError(`${error.errors?.[0]?.path ?? 'field'} already exists.`);
    }
    throw error;
  }
};

export const getAllUsers = async (pagination: Pagination): Promise<Page<any>> => {
  return users.list({
    pagination,
    order: [
      ['username', 'ASC'],
      ['id', 'ASC']
    ]
  });
};

export const getUserById = async (id: number) => {
  return users.findById(id, { attributes: PUBLIC_ATTRIBUTES });
};

export const updateUser = async (
  id: number,
  changes: Partial<CreateUserInput>
) => {
  const { password, ...rest } = changes;
  const payload: Record<string, unknown> = { ...rest };

  if (password) {
    payload.password_hash = await bcrypt.hash(password, PASSWORD_ROUNDS);
  }

  await users.update(id, payload as any);
  return users.findByIdOrFail(id, { attributes: PUBLIC_ATTRIBUTES });
};

export const deleteUser = async (id: number): Promise<void> => {
  await users.destroy(id);
};
