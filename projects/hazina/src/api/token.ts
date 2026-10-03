import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface TokenSubject {
  userId: string;
  orgId: string;
  branchId: string | null;
  role: string;
}

/** One place that mints a session token, so sign-in and self-serve signup can never disagree about its shape. */
export function signToken(subject: TokenSubject): { token: string; expiresInSeconds: number } {
  const expiresInSeconds = env.JWT_TTL_MINUTES * 60;
  const token = jwt.sign(
    { sub: subject.userId, orgId: subject.orgId, branchId: subject.branchId, role: subject.role },
    env.JWT_SECRET,
    { expiresIn: expiresInSeconds }
  );
  return { token, expiresInSeconds };
}
