import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import db from '@models';
import { env } from '../src/config/env';
import { runAsTenant } from '../src/common/tenant-run';

/** A church created directly (no onboarding), so these suites do not depend on other modules' seeding. */
export async function makeChurch(slug: string): Promise<number> {
  const church = await db.Church.create({ name: `Church ${slug}`, slug });
  return church.id as number;
}

export async function makeMember(churchId: number, fields: Record<string, unknown> = {}): Promise<number> {
  const member = await runAsTenant(churchId, () =>
    db.Member.create({ churchId, firstName: 'Test', lastName: `Member${Math.random().toString(36).slice(2, 7)}`, status: 'Active', membershipDate: '2020-01-01', ...fields })
  );
  return member.id as number;
}

export async function makeUser(churchId: number, role: string, name: string, memberId?: number) {
  const user = await runAsTenant(churchId, () =>
    db.User.create({ churchId, username: name, email: `${name}-${churchId}@example.org`, password_hash: bcrypt.hashSync('unused-password', 4), isAdmin: role === 'ADMIN', role, memberId: memberId ?? null })
  );
  const token = jwt.sign({ id: user.id, email: user.email, churchId, isAdmin: role === 'ADMIN', role }, env.JWT_SECRET, { expiresIn: 3600 });
  return { id: user.id as number, headers: { Authorization: `Bearer ${token}` } };
}

export async function inChurch<T>(churchId: number, work: () => Promise<T>): Promise<T> {
  return runAsTenant(churchId, work);
}
