import { assertRoleDefined } from '../modules/roles/roles.service';
import bcrypt from 'bcrypt';
import { searchWhere } from '../common/search';
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
  role?: string;
}

/** isAdmin and role describe the same thing; keep the two columns from ever disagreeing. */
function reconcileRole<T extends { isAdmin?: boolean; role?: string }>(input: T): T {
  if (input.role === undefined && input.isAdmin === undefined) return input;
  if (input.role !== undefined) {
    return { ...input, isAdmin: input.role === 'ADMIN' };
  }
  return { ...input, role: input.isAdmin ? 'ADMIN' : 'MEMBER' };
}

export const createUser = async (input: CreateUserInput): Promise<InstanceType<typeof User>> => {
  try {
    const reconciled = reconcileRole({ isAdmin: input.isAdmin ?? false, role: input.role });
    if (reconciled.role) await assertRoleDefined(reconciled.role);
    const created = await users.create({
      username: input.username,
      email: input.email,
      password_hash: await bcrypt.hash(input.password, PASSWORD_ROUNDS),
      isAdmin: reconciled.isAdmin ?? false,
      role: reconciled.role ?? (reconciled.isAdmin ? 'ADMIN' : 'MEMBER')
    });
    return users.findByIdOrFail(created.id, { attributes: PUBLIC_ATTRIBUTES });
  } catch (error: any) {
    // The error handler turns a unique violation into a 409 naming the field.
    throw error;
  }
};

export const getAllUsers = async (pagination: Pagination, search?: unknown): Promise<Page<any>> => {
  return users.list({
    pagination,
    where: searchWhere(['username', 'email'], search),
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
  const reconciledChanges = reconcileRole(rest);
  if (reconciledChanges.role) await assertRoleDefined(reconciledChanges.role);
  const payload: Record<string, unknown> = { ...reconciledChanges };

  if (password) {
    payload.password_hash = await bcrypt.hash(password, PASSWORD_ROUNDS);
  }

  await users.update(id, payload as any);
  return users.findByIdOrFail(id, { attributes: PUBLIC_ATTRIBUTES });
};

export const deleteUser = async (id: number, actingUserId?: number): Promise<void> => {
  if (actingUserId !== undefined && id === actingUserId) {
    throw new BadRequestError('You cannot delete your own account.');
  }
  const target = await users.findByIdOrFail(id, { attributes: PUBLIC_ATTRIBUTES });
  if ((target as any).isAdmin && (await users.count({ isAdmin: true })) <= 1) {
    throw new BadRequestError('This is the last administrator; make someone else an administrator first.');
  }
  await users.destroy(id);
};
