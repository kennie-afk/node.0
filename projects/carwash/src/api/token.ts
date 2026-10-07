import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface TokenSubject {
  userId: string;
  orgId: string;
  siteId: string | null;
  role: string;
  /** users.token_version at the moment of signing; a later bump (sign-out, PIN change) voids this token. */
  tokenVersion?: number;
}

/** One place that mints a session token, so sign-in and self-serve signup can never disagree about its shape. */
export function signToken(subject: TokenSubject): { token: string; expiresInSeconds: number } {
  const expiresInSeconds = env.JWT_TTL_MINUTES * 60;
  const token = jwt.sign(
    { sub: subject.userId, orgId: subject.orgId, siteId: subject.siteId, role: subject.role, tv: subject.tokenVersion ?? 0 },
    env.JWT_SECRET,
    { expiresIn: expiresInSeconds }
  );
  return { token, expiresInSeconds };
}
