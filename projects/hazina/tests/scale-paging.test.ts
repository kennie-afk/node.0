import { afterAll, describe, expect, it, vi } from 'vitest';
import { assertLedgerBalanced, boot, fullStaff, get, lendUntil, makeMember, makeProduct, newTenant, on, post, shutdown } from './helpers';
import { callback, confirmation, setPaybill } from './mpesa-helpers';
import { likeContains, numberSeq } from '../src/common/search';

vi.setConfig({ testTimeout: 180_000 });
afterAll(shutdown);

async function setCounter(orgId: string, name: 'member' | 'loan', value: number) {
  const { pool } = await boot();
  await pool.withOrg(orgId, (client) => client.query(
    `INSERT INTO org_counters (org_id, name, value) VALUES ($1, $2, $3) ON CONFLICT (org_id, name) DO UPDATE SET value = $3`, [orgId, name, value]
  ));
}

describe('search helpers (pure)', () => {
  it('escapes LIKE wildcards and reads the digits of a number', () => {
    expect(likeContains('50%_off\\')).toBe('%50\\%\\_off\\\\%');
    expect(numberSeq('M100000')).toBe(100000);
    expect(numberSeq('L00042')).toBe(42);
    expect(() => numberSeq('nonsense')).toThrow();
  });
});

describe.runIf(on)('paging, search and exports at size (real Postgres)', () => {
  it('pages members and loans in numeric order across the 99,999 -> 100,000 boundary', async () => {
    const t = await newTenant('Boundary');
    const s = await fullStaff(t);
    await setCounter(t.orgId, 'member', 99_996);
    await setCounter(t.orgId, 'loan', 99_996);
    const members: Array<{ id: string; memberNo: string }> = [];
    for (let i = 0; i < 6; i += 1) members.push(await makeMember(t.owner.auth));
    expect(members.map((m) => m.memberNo)).toEqual(['M99997', 'M99998', 'M99999', 'M100000', 'M100001', 'M100002']);

    const seen: string[] = [];
    let after: string | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = (await get(t.owner.auth, `/v1/members?limit=2${after ? `&after=${after}` : ''}`)).body;
      seen.push(...page.items.map((m: { memberNo: string }) => m.memberNo));
      if (!page.nextCursor) break;
      after = page.nextCursor;
    }
    // as text, M100000 sorts before M99999; paged on the number it must come after
    expect(seen).toEqual(members.map((m) => m.memberNo));

    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200 });
    const loanIds: string[] = [];
    for (const m of members) loanIds.push(await lendUntil(s, m.id, p, 100_000, 3, 'applied'));
    const loanNos = (await Promise.all(loanIds.map(async (id) => (await get(t.owner.auth, `/v1/loans/${id}`)).body.loanNo as string)));
    expect(loanNos).toEqual(['L99997', 'L99998', 'L99999', 'L100000', 'L100001', 'L100002']);
    const got: string[] = [];
    after = undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = (await get(t.owner.auth, `/v1/loans?limit=2${after ? `&after=${after}` : ''}`)).body;
      got.push(...page.items.map((l: { loanNo: string }) => l.loanNo));
      if (!page.nextCursor) break;
      after = page.nextCursor;
    }
    expect(got).toEqual([...loanNos].reverse());
  });

  it('treats % and _ in a search literally, and has trigram indexes behind the contains-search', async () => {
    const t = await newTenant('Search');
    const { pool } = await boot();
    const a = await get(t.owner.auth, '/v1/members');
    expect(a.body.items).toHaveLength(0);
    for (const name of ['Ann%Smith', 'Annie Smith', 'Ann_Jones', 'AnnXJones']) {
      expect((await post(t.owner.auth, '/v1/members', { fullName: name })).status).toBe(201);
    }
    const names = async (q: string) => (await get(t.owner.auth, `/v1/members?search=${encodeURIComponent(q)}`)).body.items.map((m: { fullName: string }) => m.fullName).sort();
    expect(await names('n%S')).toEqual(['Ann%Smith']);
    expect(await names('n_J')).toEqual(['Ann_Jones']);
    expect(await names('smith')).toEqual(['Ann%Smith', 'Annie Smith']);
    const idx = await pool.withMigrator(async (c) => (await c.query(`SELECT indexname FROM pg_indexes WHERE indexdef ILIKE '%gin_trgm_ops%'`)).rows.map((r) => r.indexname as string));
    expect(idx).toEqual(expect.arrayContaining(['members_name_trgm_idx', 'members_no_trgm_idx', 'members_phone_trgm_idx', 'loans_no_trgm_idx', 'mpesa_payments_ref_trgm_idx']));
  });

  it('exports every arrears row (no 5,000 cap) and aggregates the portfolio in the database', async () => {
    const t = await newTenant('Big Arrears');
    const { pool } = await boot();
    const productId = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200 });
    const N = 5_200;
    await pool.withMigrator(async (c) => {
      await c.query(`INSERT INTO members (org_id, branch_id, member_no, full_name) SELECT $1, $2, 'M' || lpad(g::text, 5, '0'), 'Bulk ' || g FROM generate_series(1, $3::int) g`, [t.orgId, t.branchId, N]);
      await c.query(
        `INSERT INTO loans (org_id, loan_no, member_id, product_id, method, annual_rate_bp, principal_cents, term_months, status, disbursed_on, first_due_date, penalty_rate_bp)
         SELECT $1, 'L' || substr(member_no, 2), id, $2, 'flat', 1200, 100000, 3, 'disbursed', current_date - 90, current_date - 60, 0 FROM members WHERE org_id = $1`, [t.orgId, productId]
      );
      await c.query(`INSERT INTO loan_schedule (org_id, loan_id, installment_no, due_date, principal_cents, interest_cents) SELECT $1, id, 1, current_date - 60, 100000, 3000 FROM loans WHERE org_id = $1`, [t.orgId]);
      // freshly bulk-loaded tables have no statistics yet (autovacuum has not run); a real database would
      await c.query('ANALYZE members; ANALYZE loans; ANALYZE loan_schedule');
    });
    const csv = await get(t.accountant?.auth ?? t.owner.auth, '/v1/exports/arrears.csv');
    expect(csv.status).toBe(200);
    const lines = csv.text.trim().split('\n');
    expect(lines).toHaveLength(N + 1);
    expect(new Set(lines.slice(1).map((l) => l.split(',')[0])).size).toBe(N);
    const portfolio = (await get(t.owner.auth, '/v1/portfolio')).body;
    expect(portfolio.loansBeingRepaid).toBe(N);
    expect(portfolio.outstandingPrincipalCents).toBe(N * 100_000);
    expect(portfolio.buckets.find((b: { bucket: string }) => b.bucket === '31-60')).toMatchObject({ loans: N });
    const page = (await get(t.owner.auth, '/v1/arrears?limit=50&offset=5150')).body;
    expect(page.total).toBe(N);
    expect(page.items).toHaveLength(50);
    expect((await get(t.owner.auth, '/v1/exports/members.csv')).text.trim().split('\n')).toHaveLength(N + 1);
  });

  it('pages the M-Pesa payment list by keyset and searches it by transaction code', async () => {
    const t = await newTenant('Payment Pages');
    const code = await setPaybill(t);
    const ids: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const c = confirmation(code, 'NOBODY', 100 + i, { TransID: `PAGE${i}X${Date.now() % 100000}` });
      ids.push(c.TransID);
      expect((await callback(c)).status).toBe(200);
    }
    const seen: string[] = [];
    let after: string | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = (await get(t.owner.auth, `/v1/mpesa/payments?limit=3${after ? `&after=${after}` : ''}`)).body;
      seen.push(...page.items.map((p: { externalRef: string }) => p.externalRef));
      if (!page.nextCursor) break;
      after = page.nextCursor;
    }
    expect(seen.sort()).toEqual([...ids].sort());
    expect(new Set(seen).size).toBe(7);
    const found = (await get(t.owner.auth, `/v1/mpesa/payments?search=${ids[3]!.toLowerCase().slice(0, 7)}`)).body.items;
    expect(found.map((p: { externalRef: string }) => p.externalRef)).toEqual([ids[3]]);
    expect((await get(t.owner.auth, '/v1/mpesa/payments?search=%25')).body.items).toHaveLength(0);
    expect((await get(t.owner.auth, '/v1/mpesa/payments?after=garbage')).status).toBe(400);
    await assertLedgerBalanced(t);
  });

  it('pages and searches the savings list', async () => {
    const t = await newTenant('Savings Pages');
    const m = await makeMember(t.owner.auth, 'Wanjiru Saver');
    const other = await makeMember(t.owner.auth, 'Otieno Other');
    for (let i = 1; i <= 5; i += 1) expect((await post(t.owner.auth, '/v1/savings/deposit', { memberId: m.id, product: 'savings', amountCents: i * 1000, channel: 'cash', reference: `REF${i}` })).status).toBe(201);
    expect((await post(t.owner.auth, '/v1/savings/deposit', { memberId: other.id, product: 'savings', amountCents: 500, channel: 'cash' })).status).toBe(201);
    const seen: number[] = [];
    let after: string | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = (await get(t.owner.auth, `/v1/savings?limit=2${after ? `&after=${after}` : ''}`)).body;
      seen.push(...page.items.map((x: { amountCents: number }) => x.amountCents));
      if (!page.nextCursor) break;
      after = page.nextCursor;
    }
    expect(seen.sort((a, b) => a - b)).toEqual([500, 1000, 2000, 3000, 4000, 5000]);
    expect((await get(t.owner.auth, '/v1/savings?search=wanjiru')).body.items).toHaveLength(5);
    expect((await get(t.owner.auth, '/v1/savings?search=ref3')).body.items).toHaveLength(1);
  });
});
