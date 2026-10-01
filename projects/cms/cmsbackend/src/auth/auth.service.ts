import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import db from '@models';
import { env } from '../config/env';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { CustomJwtPayload } from '../types/auth.types';
import { effectiveRole } from './permissions';
import { resolvePermissions, roleLabel } from '../modules/roles/roles.service';
import { isPostgres } from '../common/tenant-db';

const UserDbModel = db.User;
const ChurchDbModel = db.Church;

export interface Session {
  token: string;
  expiresInSeconds: number;
  churchId: number;
  role: string;
  roleLabel: string;
  /** What the signed-in role may do, so the console never needs its own copy of the matrix. */
  permissions: string[];
}

/**
 * Sign-in is the one place that has to find a user before it knows which church they belong to.
 * On Postgres the users table is protected by row-level security, so the lookup goes through a
 * narrow SECURITY DEFINER function that returns only that one account; it is granted to the
 * application role and nothing else can read users across churches.
 */
async function findLoginUser(email: string) {
  if (isPostgres(db.sequelize)) {
    const [rows] = (await db.sequelize.query('SELECT * FROM cms_login_lookup(:email)', {
      replacements: { email },
      transaction: null
    })) as [Array<Record<string, any>>, unknown];
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id as number,
      email: row.email as string,
      churchId: row.church_id as number,
      password_hash: row.password_hash as string,
      isAdmin: row.is_admin as boolean,
      role: row.role as string
    };
  }
  const user = await UserDbModel.findOne({ where: { email } });
  return user
    ? {
        id: user.id as number,
        email: user.email as string,
        churchId: user.churchId as number,
        password_hash: user.password_hash as string,
        isAdmin: user.isAdmin as boolean,
        role: user.role as string
      }
    : null;
}

/** True when an account already uses this e-mail, in any church (RLS hides other churches' rows). */
export async function emailExists(email: string): Promise<boolean> {
  return (await findLoginUser(email)) !== null;
}

export const loginUser = async (email: string, password: string): Promise<Session> => {
  const user = await findLoginUser(email);
  if (!user) {
    await bcrypt.compare(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    throw new UnauthorizedError('Invalid credentials');
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const church = await ChurchDbModel.findByPk(user.churchId);
  if (!church || !church.isActive) {
    throw new ForbiddenError('This church is not active.');
  }

  const role = effectiveRole(user.role, user.isAdmin);
  const payload = {
    id: user.id,
    email: user.email,
    churchId: user.churchId,
    isAdmin: role === 'ADMIN',
    role
  } satisfies Partial<CustomJwtPayload>;

  const expiresInSeconds = env.JWT_TTL_MINUTES * 60;
  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: expiresInSeconds });

  return {
    token,
    expiresInSeconds,
    churchId: user.churchId,
    role,
    roleLabel: await roleLabel(user.churchId, role),
    permissions: [...(await resolvePermissions(user.churchId, role))]
  };
};

export const getProfile = async (userId: number, churchId: number) => {
  const user = await UserDbModel.findOne({
    where: { id: userId, churchId },
    attributes: { exclude: ['password_hash'] }
  });
  if (!user) {
    throw new UnauthorizedError('User not found');
  }
  return user;
};
