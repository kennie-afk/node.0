import { afterAll, describe, expect, it } from 'vitest';
import { addStaff, get, makeGuard, newTenant, on, setPay, shutdown } from './helpers';

describe.runIf(on)('what the audit trail shows each role (real Postgres, RLS on)', () => {
  afterAll(shutdown);

  it('tells an operations manager that pay changed, but not what it changed from or to', async () => {
    const t = await newTenant('Audit Visibility Firm');
    const ops = await addStaff(t, 'ops_manager');
    const payroll = await addStaff(t, 'payroll');
    const g = await makeGuard(t.owner.auth);
    await setPay(payroll.auth, g.id, 48_250, 3_100);

    const seenByOps = JSON.stringify((await get(ops.auth, '/v1/audit')).body);
    const seenByPayroll = JSON.stringify((await get(payroll.auth, '/v1/audit')).body);

    expect(seenByOps).toContain('guard.pay_change');
    expect(seenByOps).not.toContain('4825000');
    expect(seenByOps).not.toContain('fromBasic');
    expect(seenByOps).toContain('redacted');
    expect(seenByPayroll).toContain('4825000');
  });

  it('pages by a cursor, so the oldest entries stay reachable without an OFFSET scan', async () => {
    const t = await newTenant('Audit Paging Firm');
    for (let i = 0; i < 6; i += 1) await makeGuard(t.owner.auth);

    const first = (await get(t.owner.auth, '/v1/audit?limit=3')).body;
    const second = (await get(t.owner.auth, `/v1/audit?limit=3&before=${first.next}`)).body;

    expect(first.items).toHaveLength(3);
    expect(first.next).toBe(first.items[2].id);
    expect(second.items.length).toBeGreaterThan(0);
    expect(Math.max(...second.items.map((i: { id: number }) => i.id))).toBeLessThan(first.next);
  });
});
