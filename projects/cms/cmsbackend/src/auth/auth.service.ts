import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import db from '@models';
import { UnauthorizedError } from '../utils/errors';

const UserDbModel = db.User;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export const loginUser = async (email: string, password: string): Promise<string> => {
  const user = await UserDbModel.findOne({ where: { email } });
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) throw new UnauthorizedError('Invalid credentials');

  const payload = {
    id: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
  return token;
};

export const getProfile = async (userId: number) => {
  const user = await UserDbModel.findByPk(userId, {
    attributes: { exclude: ['password_hash'] },
  });
  if (!user) throw new UnauthorizedError('User not found');
  return user;
};

console.log("DB URL:", process.env.DATABASE_URL);