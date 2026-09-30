import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { prepareDatabase, truncateAll } from './harness';
import { inChurch, makeChurch, makeMember, makeUser } from './ops-helpers';
import { select } from '../src/modules/finance/sql';
import { requestTx } from '../src/common/http';

// A real Postgres under load truncates slowly; the defaults are tuned for in-memory SQLite.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const app = createApp();
let church: number;
let staff: { headers: { Authorization: string } };

beforeAll(async () => { await prepareDatabase(); });
afterAll(async () => { await db.sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  church = await makeChurch('guests');
  staff = await makeUser(church, 'SECRETARY', 'sec');
});

const api = (h = staff.headers) => ({ get: (u: string) => request(app).get(u).set(h), post: (u: string) => request(app).post(u).set(h), put: (u: string) => request(app).put(u).set(h) });
const visitor = async (extra: Record<string, unknown> = {}) => (await api().post('/visitors').send({ firstName: 'Grace', lastName: 'Achieng', phone: '0700111222', email: 'Grace@Example.org', source: 'Invited by a friend', ...extra }).expect(201)).body;

describe('the guest pipeline', () => {
  it('records a first-time guest with an automatic welcome task and moves them along', async () => {
    const follower = await makeMember(church, { firstName: 'Sam' });
    const v = await visitor({ assignedMemberId: follower, firstVisitDate: '2031-03-02' });
    expect(v).toMatchObject({ stage: 'NEW', status: 'OPEN', phone: '+254700111222', email: 'grace@example.org', assignedMemberId: follower });
    expect(v.tasks).toHaveLength(1);
    expect(v.tasks[0]).toMatchObject({ title: 'Welcome call or visit', dueDate: '2031-03-04', assigneeMemberId: follower });

    const logged = (await api().post(`/visitors/${v.id}/interactions`).send({ type: 'CALL', summary: 'Spoke for 10 minutes, coming back Sunday' }).expect(201)).body;
    expect(logged.stage).toBe('CONTACTED');
    const moved = (await api().post(`/visitors/${v.id}/stage`).send({ stage: 'VISITED_AGAIN', note: 'Came with her sister' }).expect(200)).body;
    expect(moved.history.map((h: any) => h.toStage)).toEqual(['NEW', 'CONTACTED', 'VISITED_AGAIN']);
    await api().post(`/visitors/${v.id}/stage`).send({ stage: 'VISITED_AGAIN' }).expect(409);
    await api().post(`/visitors/${v.id}/stage`).send({ stage: 'JOINED' }).expect(400);

    const done = (await api().post(`/visitors/tasks/${v.tasks[0].id}/complete`).expect(200)).body;
    expect(done.tasks[0].status).toBe('DONE');
    const pipeline = (await api().get('/visitors/pipeline').expect(200)).body;
    expect(pipeline.stages.VISITED_AGAIN).toBe(1);
    expect(pipeline.total).toBe(1);
  });

  it('lists due and overdue follow-ups for a follower', async () => {
    const follower = await makeMember(church);
    await visitor({ assignedMemberId: follower, firstVisitDate: '2020-01-01' });
    const due = (await api().get(`/visitors/tasks?assigneeMemberId=${follower}`).expect(200)).body;
    expect(due).toHaveLength(1);
    expect(due[0].overdue).toBe(true);
    expect((await api().get('/visitors?overdue=true').expect(200)).body.data).toHaveLength(1);
  });

  it('converts to a member while keeping the whole story, and refuses a duplicate person', async () => {
    const v = await visitor();
    await api().post(`/visitors/${v.id}/interactions`).send({ type: 'VISIT', summary: 'Home visit' }).expect(201);
    const converted = (await api().post(`/visitors/${v.id}/convert`).send({}).expect(201)).body;
    expect(converted.visitor).toMatchObject({ stage: 'JOINED', status: 'CONVERTED', convertedMemberId: converted.memberId });
    expect(converted.visitor.interactions).toHaveLength(1);
    expect(converted.visitor.history.at(-1).toStage).toBe('JOINED');
    const member = (await inChurch(church, async () => select<any>(await requestTx(), 'SELECT first_name, status, phone_number FROM members WHERE id = ?', [converted.memberId])))[0];
    expect(member).toMatchObject({ first_name: 'Grace', status: 'New Convert', phone_number: '+254700111222' });
    await api().post(`/visitors/${v.id}/convert`).send({}).expect(409);
    await api().put(`/visitors/${v.id}`).send({ notes: 'late edit' }).expect(409);

    const twin = await visitor({ firstName: 'Grace', lastName: 'Again' });
    const clash = await api().post(`/visitors/${twin.id}/convert`).send({});
    expect(clash.status).toBe(409);
    expect(clash.body.message).toMatch(/already exists/);
    const linked = (await api().post(`/visitors/${twin.id}/convert`).send({ linkExistingMemberId: converted.memberId }).expect(201)).body;
    expect(linked.memberId).toBe(converted.memberId);
  });

  it('validates input, filters by stage, and keeps churches apart', async () => {
    await api().post('/visitors').send({ firstName: 'X', lastName: 'Y', phone: '12' }).expect(400);
    const lost = await visitor({ phone: '0700999888', email: 'l@x.org' });
    await api().post(`/visitors/${lost.id}/stage`).send({ stage: 'LOST' }).expect(200);
    await visitor({ phone: '0700555444', email: 'k@x.org' });
    expect((await api().get('/visitors?stage=LOST').expect(200)).body.data).toHaveLength(1);
    expect((await api().get('/visitors?q=ach').expect(200)).body.data).toHaveLength(2);

    const other = await makeChurch('elsewhere');
    const outsider = await makeUser(other, 'ADMIN', 'out');
    await request(app).get(`/visitors/${lost.id}`).set(outsider.headers).expect(404);
    expect((await request(app).get('/visitors').set(outsider.headers)).body.data).toEqual([]);
    const treasurer = await makeUser(church, 'TREASURER', 'tess');
    await request(app).post('/visitors').set(treasurer.headers).send({ firstName: 'A', lastName: 'B' }).expect(403);
  });
});
