import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import db from '@models';
import { env } from '../config/env';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { CustomJwtPayload } from '../types/auth.types';

const UserDbModel = db.User;
const ChurchDbModel = db.Church;

export interface Session {
  token: string;
  expiresInSeconds: number;
  churchId: number;
}

export const loginUser = async (email: string, password: string): Promise<Session> => {
  const user = await UserDbModel.findOne({ where: { email } });
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

  const payload: Omit<CustomJwtPayload, keyof jwt.JwtPayload> = {
    id: user.id,
    email: user.email,
    churchId: user.churchId,
    isAdmin: user.isAdmin
  };

  const expiresInSeconds = env.JWT_TTL_MINUTES * 60;
  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: expiresInSeconds });

  return { token, expiresInSeconds, churchId: user.churchId };
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
