import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import db from '@models';
import { onPostgres, prepareDatabase, truncateAll } from './harness';
import { app, Auth, books, Books, d, journal, signUp, userWithRole } from './payables-helpers';
import { LocalObjectStore, setObjectStore } from '../src/common/object-store';
import { enqueueSystemJob } from '../src/modules/jobs/queue';
import { Worker } from '../src/modules/jobs/worker';
import { GENESIS_HASH, iso, dateOnly } from '../src/modules/finance/chain';
import { entryHash } from '../src/modules/finance/ledger.service';
import { auditHash } from '../src/modules/finance/audit.service';
import { exportHead, currentHead, loadExportedHead, checkHeadAgainstDatabase } from '../src/modules/finance/chain-head';
import { runAsTenant } from '../src/common/tenant-run';
import { requestTx } from '../src/common/http';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let admin: Auth;
let auditor: Auth;
let churchId: number;
let b: Books;

beforeAll(async () => {
  await prepareDatabase();
  setObjectStore(new LocalObjectStore(mkdtempSync(path.join(tmpdir(), 'cms-heads-'))));
});
afterAll(async () => {
  setObjectStore(null);
  await db.sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  const s = await signUp('heads');
  admin = s.admin;
  churchId = s.churchId;
  auditor = (await userWithRole(admin, 'audrey', 'AUDITOR')).auth;
  b = await books(admin);
});

const post = async (memo: string, amount = '100.00') => {
  const res = await journal(admin, d(1, 5), memo, [
    { accountId: b.accounts['1100'], fundId: b.funds.GEN, debit: amount },
    { accountId: b.accounts['4020'], fundId: b.funds.GEN, credit: amount }
  ]);
  expect(res.status).toBe(201);
};

/** What a database superuser can do: bypass the append-only triggers and write anything. */
async function asOwner<T = any>(sql: string, replacements: Record<string, unknown> = {}): Promise<T[]> {
  if (!onPostgres) {
    const [rows] = await db.sequelize.query(sql, { replacements, transaction: null });
    return rows as T[];
  }
  // Sequelize hands DATE columns back as plain strings; a bare pg client would build a local-time Date and shift the day.
  const types = { getTypeParser: (oid: number, format?: any) => (oid === 1082 ? (v: string) => v : pg.types.getTypeParser(oid, format)) } as any;
  const client = new pg.Client({ connectionString: process.env.TEST_OWNER_DATABASE_URL, types });
  await client.connect();
  try {
    await client.query('SET session_replication_role = replica');
    let i = 0;
    const values: unknown[] = [];
    const text = sql.replace(/:(\w+)/g, (_m, name) => { values.push(replacements[name]); return `$${++i}`; });
    return (await client.query(text, values)).rows;
  } finally {
    await client.end();
  }
}

/** Rewrites ledger entry 1's memo and then recomputes every later hash and the head row, as a careful attacker would. */
async function rewriteLedgerAndRecompute() {
  await asOwner(`UPDATE journal_entries SET memo = 'edited by attacker' WHERE church_id = :c AND entry_no = 1`, { c: churchId });
  const entries = await asOwner(`SELECT * FROM journal_entries WHERE church_id = :c ORDER BY entry_no`, { c: churchId });
  let prev = GENESIS_HASH;
  for (const e of entries) {
    const lines = await asOwner(`SELECT * FROM journal_lines WHERE church_id = :c AND entry_id = :id ORDER BY line_no`, { c: churchId, id: e.id });
    const hash = entryHash(prev, {
      churchId, entryNo: Number(e.entry_no), entryDate: dateOnly(e.entry_date), sourceType: e.source_type, sourceId: e.source_id, memo: e.memo,
      createdBy: e.created_by === null ? null : Number(e.created_by), postedAt: iso(e.posted_at), reverses: e.reverses_entry_id === null ? null : Number(e.reverses_entry_id),
      lines: lines.map((l: any) => ({ lineNo: Number(l.line_no), accountId: Number(l.account_id), fundId: Number(l.fund_id), debit: Number(l.debit_minor), credit: Number(l.credit_minor), memberId: l.member_id === null ? null : Number(l.member_id), ministryId: l.ministry_id === null ? null : Number(l.ministry_id) }))
    });
    await asOwner(`UPDATE journal_entries SET prev_hash = :prev, hash = :hash WHERE id = :id`, { prev, hash, id: e.id });
    prev = hash;
  }
  await asOwner(`UPDATE finance_chain SET last_entry_hash = :h WHERE church_id = :c`, { h: prev, c: churchId });
}

async function rewriteAuditAndRecompute() {
  const events = await asOwner(`SELECT * FROM audit_events WHERE church_id = :c ORDER BY seq`, { c: churchId });
  let prev = GENESIS_HASH;
  for (const e of events) {
    const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (Number(e.seq) === 1) data.attacker = true;
    const hash = auditHash(prev, { churchId, seq: Number(e.seq), actorId: e.actor_id === null ? null : Number(e.actor_id), action: e.action, entityType: e.entity_type, entityId: e.entity_id, data, occurredAt: iso(e.occurred_at) });
    await asOwner(`UPDATE audit_events SET data = :data, prev_hash = :prev, hash = :hash WHERE church_id = :c AND seq = :seq`, { data: JSON.stringify(data), prev, hash, c: churchId, seq: Number(e.seq) });
    prev = hash;
  }
  await asOwner(`UPDATE finance_chain SET last_audit_hash = :h WHERE church_id = :c`, { h: prev, c: churchId });
}

const worker = () => new Worker({ concurrency: 4, schedulerEveryMs: 0 });
const integrity = async () => (await request(app).get('/finance/integrity').set(auditor)).body;
const headReport = async () => (await request(app).get('/finance/audit/head').set(auditor)).body;

describe('exported chain heads', () => {
  it('the nightly job writes the head per church, and the endpoint reports it as matching', async () => {
    await post('Offering one');
    await post('Offering two');
    const before = await headReport();
    expect(before.lastExport).toBeNull();
    expect(before.head.ledger.entries).toBe(2);

    await enqueueSystemJob({ type: 'chain.head-export-all', payload: { day: '2026-01-01' } });
    const w = worker();
    await w.drain();
    await w.drain();

    const after = await headReport();
    expect(after.lastExport).toMatchObject({ churchId, ledger: { entries: 2 } });
    expect(after.exportCheck).toEqual({ ok: true, issues: [] });
    // Normal growth after an export is not a mismatch.
    await post('Offering three');
    expect((await headReport()).exportCheck.ok).toBe(true);
    expect((await request(app).get('/finance/audit/head').set((await userWithRole(admin, 'mike', 'MEMBER')).auth)).status).toBe(403);
  });

  it('detects a ledger rewrite even though the attacker recomputed every hash and the head row', async () => {
    await post('Offering one');
    await post('Offering two');
    await runAsTenant(churchId, async () => exportHead(await currentHead(await requestTx(), churchId)));

    await rewriteLedgerAndRecompute();
    // The attack is perfect as far as the database can tell: the chain is internally consistent.
    expect((await integrity()).ledger.issues).toEqual([]);

    const report = await headReport();
    expect(report.exportCheck.ok).toBe(false);
    expect(report.exportCheck.issues.join(' ')).toMatch(/ledger entry 2 no longer has the hash exported/);
  });

  it('detects a rewritten audit chain whose hashes were all recomputed', async () => {
    await post('Offering one');
    await runAsTenant(churchId, async () => exportHead(await currentHead(await requestTx(), churchId)));
    expect((await headReport()).exportCheck.ok).toBe(true);

    await rewriteAuditAndRecompute();
    expect((await integrity()).audit.ok).toBe(true);
    expect((await headReport()).exportCheck.issues.join(' ')).toMatch(/audit event \d+ no longer has the hash/);
  });

  it('detects removed history (the exported position no longer exists)', async () => {
    await post('Offering one');
    const exported = await runAsTenant(churchId, async () => currentHead(await requestTx(), churchId));
    await runAsTenant(churchId, async () => exportHead(exported));
    await asOwner(`DELETE FROM audit_events WHERE church_id = :c AND seq = :n`, { c: churchId, n: exported.audit.events });
    const issues = (await headReport()).exportCheck.issues.join(' ');
    expect(issues).toMatch(/is missing: history was removed/);
  });

  it('refuses a head file that was edited, or that belongs to another church', async () => {
    await post('Offering one');
    const head = await runAsTenant(churchId, async () => currentHead(await requestTx(), churchId));
    const check = (h: typeof head, id = churchId) => runAsTenant(churchId, async () => checkHeadAgainstDatabase(await requestTx(), id, h));
    expect((await check(head)).ok).toBe(true);
    expect((await check({ ...head, ledger: { ...head.ledger, hash: 'f'.repeat(64) } })).issues[0]).toMatch(/altered \(its digest/);
    expect((await check(head, churchId + 1)).issues[0]).toMatch(/belongs to church/);
    expect(await runAsTenant(churchId, async () => loadExportedHead(churchId + 1))).toBeNull();
  });

  it('POSTs the head to the configured witness URL, and fails (so the job retries) when it refuses', async () => {
    await post('Offering one');
    const head = await runAsTenant(churchId, async () => currentHead(await requestTx(), churchId));
    const { env } = await import('../src/config/env');
    env.CHAIN_HEAD_WEBHOOK = 'https://witness.example/heads';
    try {
      const sent: Array<{ url: string; body: string }> = [];
      const ok = (async (url: string, init: RequestInit) => { sent.push({ url, body: String(init.body) }); return new Response('ok', { status: 200 }); }) as unknown as typeof fetch;
      expect((await exportHead(head, ok)).webhook).toBe('sent');
      expect(JSON.parse(sent[0].body)).toMatchObject({ churchId, digest: head.digest });
      const refuse = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
      await expect(exportHead(head, refuse)).rejects.toThrow(/answered 500/);
    } finally {
      env.CHAIN_HEAD_WEBHOOK = undefined;
    }
  });
});
