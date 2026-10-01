import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { prepareDatabase, truncateAll } from './harness';
import { runAsTenant } from '../src/common/tenant-run';

vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });

const app = createApp();
type Auth = { Authorization: string };
let admin: Auth;

async function signUp(slug: string): Promise<Auth> {
  const owner = { username: 'admin', email: `${slug}@example.org`, password: `passphrase-${slug}` };
  await request(app).post('/churches').send({ church: { name: `Church ${slug}`, slug }, owner });
  const login = await request(app).post('/auth/login').send({ email: owner.email, password: owner.password });
  return { Authorization: `Bearer ${login.body.token}` };
}
async function userWithRole(as: Auth, name: string, role: string) {
  const made = await request(app).post('/users').set(as).send({ username: name, email: `${name}@example.org`, password: `passphrase-${name}`, role });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const login = await request(app).post('/auth/login').send({ email: `${name}@example.org`, password: `passphrase-${name}` });
  return { auth: { Authorization: `Bearer ${login.body.token}` } as Auth, login: login.body, id: made.body.id as number };
}
const role = (key: string, permissions: string[], extra: object = {}) => ({ key, label: key.charAt(0) + key.slice(1).toLowerCase(), permissions, ...extra });

beforeAll(async () => {
  await prepareDatabase();
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  admin = await signUp('roles');
});

describe('per-church roles', () => {
  it('gives a new church the built-in roles as editable data', async () => {
    const list = await request(app).get('/roles').set(admin);
    expect(list.status).toBe(200);
    expect(list.body.map((r: any) => r.key)).toEqual(['ADMIN', 'TREASURER', 'APPROVER', 'AUDITOR', 'PASTOR', 'SECRETARY', 'MEMBER']);
    const treasurer = list.body.find((r: any) => r.key === 'TREASURER');
    expect(treasurer.permissions).toContain('finance:post');
    expect(treasurer.isSystem).toBe(true);
    expect(list.body.find((r: any) => r.key === 'ADMIN').permissions).toHaveLength(17);
  });

  it('lets a church invent a role and enforces exactly what it grants', async () => {
    const created = await request(app).post('/roles').set(admin).send(role('BOOKKEEPER', ['finance:read', 'finance:post']));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const { auth, login } = await userWithRole(admin, 'bea', 'BOOKKEEPER');
    expect(login.role).toBe('BOOKKEEPER');
    expect(login.roleLabel).toBe('Bookkeeper');
    expect(login.permissions.sort()).toEqual(['finance:post', 'finance:read']);
    expect((await request(app).get('/finance/accounts').set(auth)).status).toBe(200);
    expect((await request(app).get('/members').set(auth)).status).toBe(403);
    expect((await request(app).get('/roles').set(auth)).status).toBe(403);
  });

  it('applies an edit to the role on the next request, both ways', async () => {
    await request(app).post('/roles').set(admin).send(role('BOOKKEEPER', ['finance:read']));
    const { auth } = await userWithRole(admin, 'bea', 'BOOKKEEPER');
    expect((await request(app).get('/members').set(auth)).status).toBe(403);
    const widened = await request(app).put('/roles/BOOKKEEPER').set(admin).send({ permissions: ['finance:read', 'members:read'] });
    expect(widened.status).toBe(200);
    expect((await request(app).get('/members').set(auth)).status).toBe(200);
    await request(app).put('/roles/BOOKKEEPER').set(admin).send({ permissions: ['finance:read'] });
    expect((await request(app).get('/members').set(auth)).status).toBe(403);
  });

  it('lets a church reshape a built-in role without touching other churches', async () => {
    const other = await signUp('elsewhere');
    await request(app).put('/roles/SECRETARY').set(admin).send({ permissions: ['members:read'] });
    const mine = await userWithRole(admin, 'sam', 'SECRETARY');
    const theirs = await userWithRole(other, 'sue', 'SECRETARY');
    expect(mine.login.permissions).toEqual(['members:read']);
    expect(theirs.login.permissions.sort()).toEqual(['care:read', 'comms:send', 'members:read', 'members:write']);
    expect((await request(app).get('/roles').set(other)).body.find((r: any) => r.key === 'SECRETARY').permissions).toContain('members:write');
    expect((await request(app).put('/roles/SECRETARY').set(other).send({ label: 'Clerk' })).body.label).toBe('Clerk');
    expect((await request(app).get('/roles').set(admin)).body.find((r: any) => r.key === 'SECRETARY').label).toBe('Secretary');
  });

  it('never lets the Administrator role be weakened or removed', async () => {
    expect((await request(app).put('/roles/ADMIN').set(admin).send({ permissions: ['members:read'] })).status).toBe(403);
    expect((await request(app).delete('/roles/ADMIN').set(admin)).status).toBe(403);
    expect((await request(app).delete('/roles/MEMBER').set(admin)).status).toBe(403);
    expect((await request(app).put('/roles/ADMIN').set(admin).send({ label: 'Owner' })).status).toBe(200);
  });

  it('refuses to delete a role people still hold, and allows it once they move', async () => {
    await request(app).post('/roles').set(admin).send(role('USHER', ['members:read']));
    const { id } = await userWithRole(admin, 'uma', 'USHER');
    const blocked = await request(app).delete('/roles/USHER').set(admin);
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/1 user/);
    expect((await request(app).put(`/users/${id}`).set(admin).send({ role: 'MEMBER' })).status).toBe(200);
    expect((await request(app).delete('/roles/USHER').set(admin)).status).toBe(204);
    expect((await request(app).get('/roles').set(admin)).body.map((r: any) => r.key)).not.toContain('USHER');
  });

  it('stops a deleted role at once rather than falling back to a default', async () => {
    await request(app).post('/roles').set(admin).send(role('USHER', ['members:read']));
    const { auth } = await userWithRole(admin, 'uma', 'USHER');
    expect((await request(app).get('/members').set(auth)).status).toBe(200);
    // Remove the row out from under the user, as a replica that missed the cache clear would see it.
    const churchId = (await request(app).get('/auth/profile').set(admin)).body.churchId as number;
    await runAsTenant(churchId, async () => {
      await db.sequelize.query("DELETE FROM church_roles WHERE role_key = 'USHER'");
    });
    const { clearRoleCache } = await import('../src/modules/roles/roles.service');
    clearRoleCache();
    expect((await request(app).get('/members').set(auth)).status).toBe(403);
  });

  it('validates keys, permissions and assignment', async () => {
    expect((await request(app).post('/roles').set(admin).send(role('lower', []))).status).toBe(400);
    expect((await request(app).post('/roles').set(admin).send(role('GHOST', ['not:real']))).status).toBe(400);
    expect((await request(app).post('/roles').set(admin).send(role('TREASURER', []))).status).toBe(409);
    const bad = await request(app).post('/users').set(admin).send({ username: 'zed', email: 'zed@example.org', password: 'passphrase-zed', role: 'NOSUCH' });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/no role NOSUCH/);
  });

  it('stops anyone granting more than they hold', async () => {
    await request(app).post('/roles').set(admin).send(role('HR', ['users:manage', 'members:read']));
    const { auth } = await userWithRole(admin, 'hana', 'HR');
    const over = await request(app).post('/roles').set(auth).send(role('SUPER', ['members:read', 'finance:close']));
    expect(over.status).toBe(403);
    expect(over.body.message).toMatch(/finance:close/);
    expect((await request(app).post('/roles').set(auth).send(role('VIEWER', ['members:read']))).status).toBe(201);
    // Taking permissions away needs no such check; adding one she lacks to an existing role does.
    expect((await request(app).put('/roles/TREASURER').set(auth).send({ permissions: ['members:read'] })).status).toBe(200);
    expect((await request(app).put('/roles/VIEWER').set(auth).send({ permissions: ['members:read', 'payroll:run'] })).status).toBe(403);
  });

  it('serves role names to the sign-in picker by church slug, and nothing else', async () => {
    await request(app).post('/roles').set(admin).send(role('USHER', ['members:read']));
    const names = await request(app).get('/auth/roles?church=roles');
    expect(names.status).toBe(200);
    expect(names.body.map((r: any) => r.role)).toContain('USHER');
    expect(JSON.stringify(names.body)).not.toMatch(/permissions/);
    expect((await request(app).get('/auth/roles')).body).toEqual([]);
    expect((await request(app).get('/auth/roles?church=nowhere')).body).toEqual([]);
  });

  it('records role changes in the audit trail', async () => {
    await request(app).post('/roles').set(admin).send(role('USHER', ['members:read']));
    await request(app).put('/roles/USHER').set(admin).send({ permissions: ['members:read', 'members:write'] });
    const audit = await request(app).get('/finance/audit').set(admin);
    const actions = audit.body.data.map((a: any) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['role.create', 'role.update']));
  });
});
