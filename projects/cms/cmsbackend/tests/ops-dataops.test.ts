import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { prepareDatabase, truncateAll } from './harness';
import { inChurch, makeChurch, makeMember, makeUser } from './ops-helpers';
import { select } from '../src/modules/finance/sql';
import { requestTx } from '../src/common/http';
import { parseCsv } from '../src/modules/dataops/csv';

// A real Postgres under load truncates slowly; the defaults are tuned for in-memory SQLite.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const app = createApp();
let church: number;
let admin: any;
let sec: any;

beforeAll(async () => { await prepareDatabase(); });
afterAll(async () => { await db.sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  church = await makeChurch('data');
  admin = await makeUser(church, 'ADMIN', 'admin');
  sec = await makeUser(church, 'SECRETARY', 'sec');
});
const api = (h: any) => ({ get: (u: string) => request(app).get(u).set(h.headers), post: (u: string) => request(app).post(u).set(h.headers) });
const q = <T = any>(sql: string, params: unknown[] = []) => inChurch(church, async () => select<T>(await requestTx(), sql, params));

const CSV = [
  'First Name,Last Name,Gender,DOB,Email,Phone,City,Status',
  'Amina,Wanjiru,F,14/03/1990,Amina@Example.org,0712345678,Nairobi,Active',
  'Brian,Otieno,male,1985-07-01,,0722000111,Kisumu,',
  '"Carol, Jr.",Njeri,Female,,carol@example.org,,"Nakuru",Guest'
].join('\n');

describe('csv parsing', () => {
  it('handles quotes, commas in fields, doubled quotes, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x,y","say ""hi"""\r\n\r\nlast,row')).toEqual([['a', 'b'], ['x,y', 'say "hi"'], ['last', 'row']]);
    expect(() => parseCsv('a,"open')).toThrow(/quoted/);
  });
});

describe('member import', () => {
  it('validates in a dry run without writing, then applies, and a re-run changes nothing', async () => {
    const dry = (await api(sec).post('/dataops/imports/members').send({ csv: CSV, dryRun: true }).expect(200)).body;
    expect(dry).toMatchObject({ status: 'DRY_RUN', totalRows: 3, createdCount: 3, errorCount: 0 });
    expect(await q('SELECT id FROM members')).toHaveLength(0);

    const applied = (await api(sec).post('/dataops/imports/members').send({ csv: CSV }).expect(200)).body;
    expect(applied).toMatchObject({ status: 'APPLIED', createdCount: 3, replayed: false });
    const rows = await q('SELECT first_name, gender, email, phone_number, date_of_birth, status FROM members ORDER BY id');
    expect(rows.map((r) => r.first_name)).toEqual(['Amina', 'Brian', 'Carol, Jr.']);
    expect(rows[0]).toMatchObject({ gender: 'Female', email: 'amina@example.org', phone_number: '+254712345678' });
    expect(String(rows[0].date_of_birth)).toContain('1990');
    expect(rows[1].status).toBe('Active');

    const again = (await api(sec).post('/dataops/imports/members').send({ csv: CSV }).expect(200)).body;
    expect(again.replayed).toBe(true);
    expect(again.id).toBe(applied.id);
    expect(await q('SELECT id FROM members')).toHaveLength(3);
  });

  it('dedupes against existing members by phone or e-mail and only updates when asked', async () => {
    await makeMember(church, { firstName: 'Amina', lastName: 'Wanjiru', phoneNumber: '+254712345678', city: 'Old town' });
    const first = (await api(sec).post('/dataops/imports/members').send({ csv: CSV }).expect(200)).body;
    expect(first).toMatchObject({ createdCount: 2, skippedCount: 1, updatedCount: 0 });
    expect((await q('SELECT city FROM members WHERE phone_number = ?', ['+254712345678']))[0].city).toBe('Old town');

    const withUpdate = (await api(sec).post('/dataops/imports/members').send({ csv: CSV, updateExisting: true }).expect(200)).body;
    expect(withUpdate).toMatchObject({ createdCount: 0, updatedCount: 3 });
    expect((await q('SELECT city FROM members WHERE phone_number = ?', ['+254712345678']))[0].city).toBe('Nairobi');
    expect(await q('SELECT id FROM members')).toHaveLength(3);
  });

  it('reports row errors, refuses to apply a dirty file, and applies the clean rows on request', async () => {
    const dirty = [
      'first_name,last_name,email,phone,gender',
      'Good,Person,good@example.org,0711111111,Male',
      ',NoFirst,a@example.org,0711111112,Male',
      'Bad,Email,not-an-email,0711111113,Male',
      'Bad,Phone,b@example.org,123,Male',
      'Dup,Phone,c@example.org,0711111111,Male',
      'Odd,Gender,d@example.org,0711111114,Robot'
    ].join('\n');
    const dry = (await api(sec).post('/dataops/imports/members').send({ csv: dirty, dryRun: true }).expect(200)).body;
    expect(dry.errorCount).toBe(5);
    expect(dry.errors.map((e: any) => `${e.row}:${e.field}`)).toEqual(['3:firstName', '4:email', '5:phoneNumber', '6:phoneNumber', '7:gender']);
    await api(sec).post('/dataops/imports/members').send({ csv: dirty }).expect(400);
    expect(await q('SELECT id FROM members')).toHaveLength(0);
    const partial = (await api(sec).post('/dataops/imports/members').send({ csv: dirty, allowPartial: true }).expect(200)).body;
    expect(partial).toMatchObject({ createdCount: 1, errorCount: 5 });
    await api(sec).post('/dataops/imports/members').send({ csv: 'name\nx', dryRun: true }).expect(400);
  });

  it('is permissioned and church-scoped', async () => {
    const plain = await makeUser(church, 'MEMBER', 'plain');
    await api(plain).post('/dataops/imports/members').send({ csv: CSV }).expect(403);
    await api(sec).post('/dataops/imports/members').send({ csv: CSV }).expect(200);
    const other = await makeChurch('elsewhere');
    const outsider = await makeUser(other, 'ADMIN', 'out');
    expect((await api(outsider).get('/dataops/imports').expect(200)).body).toEqual([]);
    // The same file imported into another church is not treated as already applied there.
    expect((await api(outsider).post('/dataops/imports/members').send({ csv: CSV }).expect(200)).body.replayed).toBe(false);
  });
});

describe('export', () => {
  it('exports members as CSV and neutralises spreadsheet formulas', async () => {
    await makeMember(church, { firstName: '=HYPERLINK("http://evil")', lastName: 'Safe', phoneNumber: '+254700000001' });
    const res = await api(sec).get('/dataops/exports/members.csv').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.split('\r\n')[0]).toBe('id,first_name,middle_name,last_name,gender,date_of_birth,email,phone_number,address,city,county,postal_code,status,baptism_date,membership_date');
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    const plain = await makeUser(church, 'MEMBER', 'plain');
    await api(plain).get('/dataops/exports/members.csv').expect(403);
  });
});

describe('consent', () => {
  it('keeps an append-only history where the latest record wins', async () => {
    const m = await makeMember(church);
    await api(sec).post(`/dataops/members/${m}/consents`).send({ purpose: 'COMMUNICATIONS', channel: 'SMS', granted: true, source: 'PAPER' }).expect(201);
    const after = (await api(sec).post(`/dataops/members/${m}/consents`).send({ purpose: 'COMMUNICATIONS', channel: 'SMS', granted: false }).expect(201)).body;
    expect(after.map((c: any) => c.granted)).toEqual([false, true]);
    await api(sec).post('/dataops/members/99999/consents').send({ purpose: 'PHOTOS', granted: true }).expect(400);
  });
});

describe('data-subject access and erasure', () => {
  const gift = (memberId: number) => inChurch(church, () => db.Contribution.create({ churchId: church, memberId, amount: 500, date: new Date(), contributionType: 'Tithe' }));

  it('bundles everything held about a member, withholding confidential pastoral notes', async () => {
    const m = await makeMember(church, { firstName: 'Mary', phoneNumber: '+254700123456' });
    await gift(m);
    const pastor = await makeUser(church, 'PASTOR', 'pastor');
    await request(app).post('/care/notes').set(pastor.headers).send({ memberId: m, body: 'Open note' }).expect(201);
    await request(app).post('/care/notes').set(pastor.headers).send({ memberId: m, body: 'Secret note', isConfidential: true }).expect(201);
    await api(sec).post(`/dataops/members/${m}/consents`).send({ purpose: 'PHOTOS', granted: true }).expect(201);
    const bundle = (await api(admin).get(`/dataops/members/${m}/data-export`).expect(200)).body;
    expect(bundle.member).toMatchObject({ firstName: 'Mary', phoneNumber: '+254700123456' });
    expect(bundle.giving).toHaveLength(1);
    expect(bundle.consents).toHaveLength(1);
    expect(bundle.careNotes).toHaveLength(1);
    expect(bundle.careNotesWithheld).toBe(1);
    expect(JSON.stringify(bundle)).not.toContain('Secret note');
    await api(sec).get(`/dataops/members/${m}/data-export`).expect(403);
    expect(await q("SELECT seq FROM audit_events WHERE action = 'dsar.export'")).toHaveLength(1);
  });

  it('anonymises rather than deletes a member with giving records, keeping the money', async () => {
    const m = await makeMember(church, { firstName: 'Mary', lastName: 'Kamau', phoneNumber: '+254700123456', email: 'mary@example.org', notes: 'allergic' });
    await gift(m);
    const pastor = await makeUser(church, 'PASTOR', 'pastor');
    await request(app).post('/care/notes').set(pastor.headers).send({ memberId: m, body: 'Counselling detail' }).expect(201);
    const req = (await api(admin).post('/dataops/erasure-requests').send({ memberId: m, reason: 'Member asked to be forgotten' }).expect(201)).body;
    await api(admin).post('/dataops/erasure-requests').send({ memberId: m, reason: 'duplicate request' }).expect(409);
    const done = (await api(admin).post(`/dataops/erasure-requests/${req.id}/execute`).expect(200)).body;
    expect(done).toMatchObject({ status: 'COMPLETED', outcome: 'ANONYMISED' });
    expect(done.legalHoldReason).toMatch(/giving records/);

    const row = (await q('SELECT first_name, last_name, email, phone_number, notes, status FROM members WHERE id = ?', [m]))[0];
    expect(row).toMatchObject({ first_name: 'Erased', last_name: `Member ${m}`, email: null, phone_number: null, notes: null, status: 'Inactive' });
    expect(await q('SELECT id FROM contribution WHERE member_id = ?', [m])).toHaveLength(1);
    expect(await q('SELECT id FROM care_notes WHERE member_id = ?', [m])).toHaveLength(0);
    await api(admin).post(`/dataops/erasure-requests/${req.id}/execute`).expect(409);
    const audit = await q("SELECT data FROM audit_events WHERE action = 'erasure.executed'");
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain('Kamau');
  });

  it('deletes a member with no financial footprint outright', async () => {
    const m = await makeMember(church, { firstName: 'Temp', phoneNumber: '+254700999000' });
    const ministry = await inChurch(church, () => db.Ministry.create({ churchId: church, name: 'Ushers' }));
    await inChurch(church, () => db.MinistryMember.create({ churchId: church, ministryId: ministry.id, memberId: m }));
    const req = (await api(admin).post('/dataops/erasure-requests').send({ memberId: m, reason: 'Left the area, asked for removal' }).expect(201)).body;
    const done = (await api(admin).post(`/dataops/erasure-requests/${req.id}/execute`).expect(200)).body;
    expect(done.outcome).toBe('DELETED');
    expect(await q('SELECT id FROM members WHERE id = ?', [m])).toHaveLength(0);
    expect(await q('SELECT member_id FROM ministry_members WHERE member_id = ?', [m])).toHaveLength(0);
  });

  it('can refuse a request with a recorded reason, and is administrator-only and church-scoped', async () => {
    const m = await makeMember(church);
    const req = (await api(admin).post('/dataops/erasure-requests').send({ memberId: m, reason: 'Please erase my data' }).expect(201)).body;
    await api(sec).post('/dataops/erasure-requests').send({ memberId: m, reason: 'Sneaky request' }).expect(403);
    await api(sec).post(`/dataops/erasure-requests/${req.id}/execute`).expect(403);
    await api(admin).post(`/dataops/erasure-requests/${req.id}/refuse`).send({ reason: 'x' }).expect(400);
    const refused = (await api(admin).post(`/dataops/erasure-requests/${req.id}/refuse`).send({ reason: 'Member is subject to a legal claim' }).expect(200)).body;
    expect(refused).toMatchObject({ status: 'REFUSED', outcome: 'REFUSED' });
    expect(await q('SELECT id FROM members WHERE id = ?', [m])).toHaveLength(1);
    const other = await makeChurch('elsewhere');
    const outsider = await makeUser(other, 'ADMIN', 'out');
    await api(outsider).post('/dataops/erasure-requests').send({ memberId: m, reason: 'Not my member' }).expect(404);
    await api(outsider).post(`/dataops/erasure-requests/${req.id}/execute`).expect(404);
  });
});
