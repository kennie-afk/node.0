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
let memberId: number;
let admin: any;
let pastor: any;
let pastor2: any;

beforeAll(async () => { await prepareDatabase(); });
afterAll(async () => { await db.sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  church = await makeChurch('care');
  memberId = await makeMember(church, { firstName: 'Mary' });
  admin = await makeUser(church, 'ADMIN', 'admin');
  pastor = await makeUser(church, 'PASTOR', 'pastor');
  pastor2 = await makeUser(church, 'PASTOR', 'pastor2');
});

const api = (h: any) => ({ get: (u: string) => request(app).get(u).set(h.headers), post: (u: string) => request(app).post(u).set(h.headers), put: (u: string) => request(app).put(u).set(h.headers), del: (u: string) => request(app).delete(u).set(h.headers) });
const audits = (action: string) => inChurch(church, async () => select<any>(await requestTx(), 'SELECT data FROM audit_events WHERE action = ?', [action]));

describe('confidential pastoral notes', () => {
  it('shows a confidential note only to its author and an administrator, redacting it for others', async () => {
    const secret = (await api(pastor).post('/care/notes').send({ memberId, body: 'Marriage counselling: details', isConfidential: true, kind: 'COUNSELING' }).expect(201)).body;
    const plain = (await api(pastor).post('/care/notes').send({ memberId, body: 'Visited, doing well' }).expect(201)).body;
    expect(secret.body).toContain('Marriage');

    const seenByOther = (await api(pastor2).get(`/care/notes?memberId=${memberId}`).expect(200)).body.data;
    const s = seenByOther.find((n: any) => n.id === secret.id);
    expect(s).toMatchObject({ body: null, redacted: true, isConfidential: true });
    expect(seenByOther.find((n: any) => n.id === plain.id).body).toBe('Visited, doing well');
    expect((await api(pastor2).get(`/care/notes/${secret.id}`).expect(200)).body.body).toBeNull();
    await api(pastor2).put(`/care/notes/${secret.id}`).send({ followUpDone: true }).expect(403);
    await api(pastor2).del(`/care/notes/${secret.id}`).expect(403);

    expect((await api(pastor).get(`/care/notes/${secret.id}`).expect(200)).body.body).toContain('Marriage');
    expect((await api(admin).get(`/care/notes/${secret.id}`).expect(200)).body.body).toContain('Marriage');
  });

  it('audits every reveal of a confidential note, and only reveals', async () => {
    const secret = (await api(pastor).post('/care/notes').send({ memberId, body: 'Private matter', isConfidential: true }).expect(201)).body;
    expect(await audits('care.confidential.read')).toHaveLength(0);
    await api(pastor2).get(`/care/notes/${secret.id}`).expect(200);
    expect(await audits('care.confidential.read')).toHaveLength(0);
    await api(pastor).get(`/care/notes/${secret.id}`).expect(200);
    await api(admin).get(`/care/notes?memberId=${memberId}`).expect(200);
    const log = await audits('care.confidential.read');
    expect(log).toHaveLength(2);
    expect(JSON.stringify(log)).not.toContain('Private matter');
  });

  it('lets only the author or an administrator edit the text of a note', async () => {
    const note = (await api(pastor).post('/care/notes').send({ memberId, body: 'Original text' }).expect(201)).body;
    await api(pastor2).put(`/care/notes/${note.id}`).send({ body: 'Rewritten' }).expect(403);
    await api(pastor2).put(`/care/notes/${note.id}`).send({ followUpOn: '2031-01-01' }).expect(200);
    expect((await api(pastor).put(`/care/notes/${note.id}`).send({ body: 'Corrected' }).expect(200)).body.body).toBe('Corrected');
    await api(pastor).del(`/care/notes/${note.id}`).expect(204);
    expect(await audits('care.note.delete')).toHaveLength(1);
  });
});

describe('access', () => {
  it('needs care permissions: a secretary reads but does not write, others get nothing', async () => {
    const sec = await makeUser(church, 'SECRETARY', 'sec');
    const treasurer = await makeUser(church, 'TREASURER', 'tess');
    const auditor = await makeUser(church, 'AUDITOR', 'audrey');
    const member = await makeUser(church, 'MEMBER', 'plain');
    await api(sec).get(`/care/notes?memberId=${memberId}`).expect(200);
    await api(sec).post('/care/notes').send({ memberId, body: 'Not allowed' }).expect(403);
    for (const who of [treasurer, auditor, member]) {
      await api(who).get(`/care/notes?memberId=${memberId}`).expect(403);
      await api(who).get('/care/prayer-requests').expect(403);
    }
    await request(app).get('/care/notes').expect(401);
  });

  it('never crosses churches', async () => {
    const note = (await api(pastor).post('/care/notes').send({ memberId, body: 'Mine' }).expect(201)).body;
    const other = await makeChurch('elsewhere');
    const outsider = await makeUser(other, 'ADMIN', 'out');
    await api(outsider).get(`/care/notes/${note.id}`).expect(404);
    await api(outsider).get(`/care/notes?memberId=${memberId}`).expect(404);
    await api(outsider).post('/care/notes').send({ memberId, body: 'Forged' }).expect(400);
  });
});

describe('prayer, visitation and follow-up', () => {
  it('tracks prayer requests through to answered', async () => {
    const pr = (await api(pastor).post('/care/prayer-requests').send({ memberId, body: 'Healing for my mother', isPrivate: true }).expect(201)).body;
    expect(pr.status).toBe('OPEN');
    const answered = (await api(pastor).put(`/care/prayer-requests/${pr.id}`).send({ status: 'ANSWERED', answeredNote: 'She is home' }).expect(200)).body;
    expect(answered).toMatchObject({ status: 'ANSWERED', answeredNote: 'She is home' });
    expect((await api(pastor).get('/care/prayer-requests?status=OPEN').expect(200)).body.data).toHaveLength(0);
  });

  it('logs visits and surfaces what is due, hiding confidential text in the digest', async () => {
    await api(pastor).post('/care/visitations').send({ memberId, kind: 'HOSPITAL', summary: 'At Kenyatta hospital', followUpOn: '2020-02-01' }).expect(201);
    await api(pastor).post('/care/notes').send({ memberId, body: 'Sensitive', isConfidential: true, followUpOn: '2020-02-02' }).expect(201);
    const digest = (await api(pastor2).get('/care/followups?within=90').expect(200)).body;
    expect(digest.visitations).toHaveLength(1);
    expect(digest.notes).toHaveLength(1);
    expect(JSON.stringify(digest)).not.toContain('Sensitive');
    expect(digest.notes[0]).toMatchObject({ confidential: true, member: 'Mary ' + (digest.notes[0].member.split(' ')[1]) });
    const v = digest.visitations[0];
    await api(pastor).post(`/care/visitations/${v.id}/follow-up-done`).expect(200);
    expect((await api(pastor).get('/care/followups?within=90').expect(200)).body.visitations).toHaveLength(0);
  });
});
