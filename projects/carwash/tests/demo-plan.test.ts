import { describe, expect, it } from 'vitest';
import { DEMO_PIN, SCENARIOS, dayKey, generatePlan, toReconciliationInput } from '../src/demo/plan';
import { reconcile } from '../src/reconciliation/engine';

// A fixed "now" mid-afternoon Nairobi time, so every trading day is complete and the plan is stable.
const NOW = new Date('2026-09-30T12:00:00Z');

describe('the demo plan', () => {
  const plan = generatePlan({ now: NOW });

  it('is deterministic: the same inputs give the same world', () => {
    const again = generatePlan({ now: NOW });
    expect(again.jobs.map((job) => job.key + job.plate + job.quotedCents)).toEqual(
      plan.jobs.map((job) => job.key + job.plate + job.quotedCents)
    );
  });

  it('has three sites, a team with every role, and fourteen days of real volume', () => {
    expect(plan.sites.map((site) => site.key)).toEqual(['westlands', 'kilimani', 'thika']);
    expect(new Set(plan.people.map((person) => person.role))).toEqual(new Set(['owner', 'manager', 'supervisor', 'worker']));
    expect(plan.jobs.length).toBeGreaterThan(800);
    expect(new Set(plan.people.map((person) => person.phone)).size).toBe(plan.people.length);
    expect(DEMO_PIN.length).toBeGreaterThanOrEqual(4);
  });

  it('never lets two jobs occupy the same bay at once (telemetry is unique per device and minute)', () => {
    const byBay = new Map<string, Array<[number, number]>>();
    for (const job of plan.jobs.filter((candidate) => candidate.state === 'closed')) {
      const key = `${job.siteKey}|${job.bay}`;
      byBay.set(key, [...(byBay.get(key) ?? []), [job.startedAt.getTime(), job.finishedAt.getTime()]]);
    }
    for (const spans of byBay.values()) {
      spans.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < spans.length; i += 1) {
        expect(spans[i]![0]).toBeGreaterThanOrEqual(spans[i - 1]![1]);
      }
    }
  });

  it('gives a live demo something in flight right now', () => {
    const open = plan.jobs.filter((job) => job.state === 'in_progress' || job.state === 'awaiting_payment');
    expect(open.length).toBeGreaterThanOrEqual(4);
  });
});

describe('the planted frauds are caught by the real reconciliation engine', () => {
  const plan = generatePlan({ now: NOW });
  const flagged = (site: string, daysAgo: number) =>
    reconcile(toReconciliationInput(plan, site, dayKey(new Date(plan.today.getTime() - daysAgo * 86_400_000)))).discrepancies.map(
      (item) => item.type
    );

  for (const scenario of SCENARIOS) {
    it(`${scenario.kind} at ${scenario.site}, ${scenario.daysAgo} day(s) ago, raises ${scenario.expects.join(', ')}`, () => {
      const found = flagged(scenario.site, scenario.daysAgo);
      for (const expected of scenario.expects) {
        expect(found).toContain(expected);
      }
    });
  }

  it('raises nothing on the ordinary days, so every flag in the demo is one we meant', () => {
    const planted = new Set(SCENARIOS.map((scenario) => `${scenario.site}|${scenario.daysAgo}`));
    const noisy: string[] = [];
    for (const site of plan.sites) {
      for (let back = 14; back >= 1; back -= 1) {
        if (planted.has(`${site.key}|${back}`)) continue;
        const found = flagged(site.key, back);
        if (found.length > 0) noisy.push(`${site.key} ${back}d ago: ${found.join(',')}`);
      }
    }
    expect(noisy).toEqual([]);
  });
});
