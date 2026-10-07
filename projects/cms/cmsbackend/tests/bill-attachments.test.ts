import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import db from '@models';
import { prepareDatabase, truncateAll } from './harness';
import { app, Auth, books, Books, d, signUp, userWithRole } from './payables-helpers';
import { LocalObjectStore, setObjectStore, sha256 } from '../src/common/object-store';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let dir: string;
let store: LocalObjectStore;
beforeAll(async () => {
  await prepareDatabase();
  dir = mkdtempSync(path.join(tmpdir(), 'cms-attach-'));
  store = new LocalObjectStore(dir);
  setObjectStore(store);
});
afterAll(async () => {
  setObjectStore(null);
  await db.sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  // Ids restart from 1 on Postgres, so every test needs its own empty object directory.
  dir = mkdtempSync(path.join(tmpdir(), 'cms-attach-'));
  setObjectStore(new LocalObjectStore(dir));
});

async function churchWithBill(slug: string) {
  const s = await signUp(slug);
  const treasurer = (await userWithRole(s.admin, `tess${slug}`, 'TREASURER')).auth;
  const auditor = (await userWithRole(s.admin, `aud${slug}`, 'AUDITOR')).auth;
  const b: Books = await books(s.admin);
  const vendor = (await request(app).post('/payables/vendors').set(treasurer).send({ name: 'Kenya Power' })).body.id;
  const bill = await request(app).post('/payables/bills').set(treasurer).send({ vendorId: vendor, billDate: d(2, 1), dueDate: d(2, 28), reference: 'INV-1', lines: [{ accountId: b.accounts['5110'], fundId: b.funds.GEN, amount: '100.00' }] });
  expect(bill.status).toBe(201);
  return { ...s, treasurer, auditor, billId: bill.body.id as number };
}
const upload = (billId: number, as: Auth, bytes: Buffer, type = 'application/pdf', name = 'invoice.pdf') =>
  request(app).post(`/payables/bills/${billId}/attachments?fileName=${encodeURIComponent(name)}`).set(as).set('Content-Type', type).send(bytes);
const pdf = Buffer.from('%PDF-1.4 a real-looking invoice');

describe('bill attachments are real files', () => {
  it('stores the bytes under a tenant-prefixed key, records the checksum, and serves them back through a signed link', async () => {
    const c = await churchWithBill('att1');
    const res = await upload(c.billId, c.treasurer, pdf);
    expect(res.status).toBe(201);
    const [a] = res.body.attachments;
    expect(a).toMatchObject({ fileName: 'invoice.pdf', contentType: 'application/pdf', sizeBytes: pdf.length, sha256: sha256(pdf) });
    expect(a.storageKey).toBeUndefined();
    const stored = readdirSync(path.join(dir, 'tenants', String(c.churchId), 'bills', String(c.billId))).filter((f) => !f.endsWith('.type'));
    expect(stored).toHaveLength(1);

    const link = await request(app).get(`/payables/bills/${c.billId}/attachments/${a.id}/link`).set(c.auditor);
    expect(link.status).toBe(200);
    const file = await request(app).get(link.body.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toContain('attachment');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(file.body).equals(pdf)).toBe(true);
    // A tampered token is refused.
    expect((await request(app).get(`${link.body.url}x`)).status).toBe(403);
  });

  it('refuses a mismatched type, a bad checksum, an oversize file, an unlisted type and a role that cannot post', async () => {
    const c = await churchWithBill('att2');
    expect((await upload(c.billId, c.treasurer, Buffer.from('not a pdf at all'))).status).toBe(400);
    expect((await upload(c.billId, c.treasurer, Buffer.from('<html></html>'), 'text/html', 'x.html')).status).toBe(400);
    const bad = await request(app).post(`/payables/bills/${c.billId}/attachments?fileName=a.pdf`).set(c.treasurer).set('Content-Type', 'application/pdf').set('X-Content-SHA256', 'a'.repeat(64)).send(pdf);
    expect(bad.status).toBe(400);
    const good = await request(app).post(`/payables/bills/${c.billId}/attachments?fileName=a.pdf`).set(c.treasurer).set('Content-Type', 'application/pdf').set('X-Content-SHA256', sha256(pdf)).send(pdf);
    expect(good.status).toBe(201);
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(10 * 1024 * 1024 + 10)]);
    expect((await upload(c.billId, c.treasurer, big)).status).toBe(413);
    expect((await upload(c.billId, c.auditor, pdf)).status).toBe(403);
  });

  it('never lets another church read, download or delete an attachment, and ignores a caller-supplied key', async () => {
    const a = await churchWithBill('atta');
    const b = await churchWithBill('attb');
    const up = await upload(a.billId, a.treasurer, pdf);
    const attId = up.body.attachments[0].id;
    // Church B asks for A's bill and attachment: both are invisible to it.
    expect((await request(app).get(`/payables/bills/${a.billId}/attachments/${attId}/link`).set(b.auditor)).status).toBe(404);
    expect((await request(app).delete(`/payables/bills/${a.billId}/attachments/${attId}`).set(b.treasurer)).status).toBe(404);
    // B's own bill: A's attachment id is not found on it either.
    expect((await request(app).get(`/payables/bills/${b.billId}/attachments/${attId}/link`).set(b.auditor)).status).toBe(404);
    // The old way of recording a metadata row with a chosen key is gone.
    const forged = await request(app).post(`/payables/bills/${b.billId}/attachments`).set(b.treasurer).send({ fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 5, storageKey: `tenants/${a.churchId}/bills/${a.billId}/secret.pdf` });
    expect(forged.status).toBe(400);
    expect((await request(app).get(`/payables/bills/${b.billId}`).set(b.auditor)).body.attachments).toHaveLength(0);
  });

  it('deleting an attachment removes the stored object too', async () => {
    const c = await churchWithBill('att3');
    const up = await upload(c.billId, c.treasurer, pdf);
    const attId = up.body.attachments[0].id;
    const folder = path.join(dir, 'tenants', String(c.churchId), 'bills', String(c.billId));
    expect(readdirSync(folder).filter((f) => !f.endsWith('.type'))).toHaveLength(1);
    const del = await request(app).delete(`/payables/bills/${c.billId}/attachments/${attId}`).set(c.treasurer);
    expect(del.body.attachments).toHaveLength(0);
    expect(readdirSync(folder)).toHaveLength(0);
  });
});
