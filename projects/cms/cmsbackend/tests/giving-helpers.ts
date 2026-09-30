import request from 'supertest';
import type { Express } from 'express';

export interface Church {
  id: number;
  slug: string;
  admin: { Authorization: string };
}

export async function signUp(app: Express, slug: string): Promise<Church> {
  const owner = { username: 'admin', email: `${slug}@example.org`, password: `passphrase-${slug}` };
  const created = await request(app).post('/churches').send({ church: { name: `Church ${slug}`, slug }, owner });
  const login = await request(app).post('/auth/login').send({ email: owner.email, password: owner.password });
  return { id: created.body.church.id, slug, admin: { Authorization: `Bearer ${login.body.token}` } };
}

export async function userWithRole(app: Express, admin: { Authorization: string }, name: string, role: string) {
  await request(app).post('/users').set(admin).send({ username: name, email: `${name}@example.org`, password: `passphrase-${name}`, role });
  const login = await request(app).post('/auth/login').send({ email: `${name}@example.org`, password: `passphrase-${name}` });
  return { Authorization: `Bearer ${login.body.token}` };
}

export async function member(app: Express, auth: { Authorization: string }, firstName: string, lastName: string, phoneNumber?: string) {
  const res = await request(app).post('/members').set(auth).send({ firstName, lastName, phoneNumber });
  if (res.status !== 201) throw new Error(`member create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id as number;
}

export async function books(app: Express, auth: { Authorization: string }) {
  const accounts = (await request(app).get('/finance/accounts').set(auth)).body as any[];
  const funds = (await request(app).get('/finance/funds').set(auth)).body as any[];
  const acct = (code: string) => accounts.find((a) => a.code === code).id as number;
  const fund = (code: string) => funds.find((f) => f.code === code).id as number;
  return { acct, fund };
}

/** Net credit (income-style) or debit balance of one account code from the trial balance. */
export async function balanceOf(app: Express, auth: { Authorization: string }, code: string): Promise<{ debit: string; credit: string } | null> {
  const tb = (await request(app).get('/finance/trial-balance').set(auth)).body;
  const line = tb.lines.find((l: any) => l.code === code);
  return line ? { debit: line.debit, credit: line.credit } : null;
}

export const year = new Date().getUTCFullYear();
export const day = (month: number, d = 10) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
