import request from 'supertest';
import jwt from 'jsonwebtoken';
import db from '@models';
import { createApp } from '../src/app';
import { runAsTenant } from '../src/common/tenant-run';

export const app = createApp();
export const YEAR = new Date().getUTCFullYear();
export const d = (month: number, day = 15) => `${YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export type Auth = { Authorization: string };

export async function signUp(slug: string) {
  const owner = { username: 'admin', email: `${slug}@example.org`, password: `passphrase-${slug}` };
  const created = await request(app).post('/churches').send({ church: { name: `Church ${slug}`, slug }, owner });
  const login = await request(app).post('/auth/login').send({ email: owner.email, password: owner.password });
  return { churchId: created.body.church.id as number, admin: { Authorization: `Bearer ${login.body.token}` } as Auth, adminId: created.body.owner.id as number };
}

/**
 * Creates a user with a role and signs a token for them directly, skipping bcrypt (twelve rounds
 * per user would dominate the suite). The sign-in path itself is covered by other tests.
 */
export async function userWithRole(admin: Auth, name: string, role: string) {
  const claims = jwt.decode(admin.Authorization.replace('Bearer ', '')) as { churchId: number };
  const user = await runAsTenant(claims.churchId, () =>
    db.User.create({ churchId: claims.churchId, username: name, email: `${name}@${claims.churchId}.example.org`, password_hash: 'x'.repeat(60), isAdmin: role === 'ADMIN', role })
  );
  const token = jwt.sign({ id: user.id, email: user.email, churchId: claims.churchId, isAdmin: role === 'ADMIN', role }, process.env.JWT_SECRET as string, { expiresIn: 3600 });
  return { auth: { Authorization: `Bearer ${token}` } as Auth, id: user.id as number };
}

export interface Books {
  accounts: Record<string, number>;
  funds: Record<string, number>;
}

/** Account ids by chart code and fund ids by fund code, for the church the headers belong to. */
export async function books(admin: Auth): Promise<Books> {
  const accounts = await request(app).get('/finance/accounts').set(admin);
  const funds = await request(app).get('/finance/funds').set(admin);
  return {
    accounts: Object.fromEntries(accounts.body.map((a: any) => [a.code, a.id])),
    funds: Object.fromEntries(funds.body.map((f: any) => [f.code, f.id]))
  };
}

/** Posts a simple manual journal (Dr/Cr decimal strings) and returns the response. */
export function journal(admin: Auth, date: string, memo: string, lines: Array<{ accountId: number; fundId: number; debit?: string; credit?: string }>) {
  return request(app).post('/finance/journal').set(admin).send({ date, memo, lines });
}

export async function balanceOf(admin: Auth, code: string, asOf = `${YEAR}-12-31`, fundId?: number): Promise<{ debit: string; credit: string } | undefined> {
  const res = await request(app).get(`/finance/trial-balance?asOf=${asOf}${fundId ? `&fundId=${fundId}` : ''}`).set(admin);
  return res.body.lines.find((l: any) => l.code === code);
}
