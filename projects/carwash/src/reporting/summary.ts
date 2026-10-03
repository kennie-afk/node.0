/**
 * "What this found": a plain summary an owner can read in a minute, copy, or screenshot. Every figure
 * comes from days that were actually reconciled (the `day_closes` rows the engine wrote) and from the
 * flags it raised for those days; nothing is estimated here and nothing is invented. Sample data is
 * summarised separately and labelled as sample, and is never mixed into a real account's figures.
 */
import { withOrg } from '../persistence/pool';
import { FLAG_LABELS, renderSummaryText, Summary, SummaryFlag, SummarySite } from './summary-text';

export { renderSummaryText };
export type { Summary, SummaryFlag, SummarySite };

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function buildSummary(orgId: string, windowDays: number, now: Date = new Date()): Promise<Summary> {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const from = new Date(to.getTime() - (windowDays - 1) * 86_400_000);

  return withOrg(orgId, async (client) => {
    const organisation = (await client.query('SELECT name FROM organisations WHERE id = $1', [orgId])).rows[0]?.name ?? 'Your business';

    const scopes = await client.query(
      `SELECT s.is_demo, count(*)::int AS n
         FROM day_closes d JOIN sites s ON s.id = d.site_id
        WHERE d.business_day BETWEEN $1 AND $2 GROUP BY s.is_demo`,
      [day(from), day(to)]
    );
    const realDays = scopes.rows.find((row) => row.is_demo === false)?.n ?? 0;
    const sampleDays = scopes.rows.find((row) => row.is_demo === true)?.n ?? 0;
    const scope: Summary['scope'] = realDays > 0 ? 'real' : sampleDays > 0 ? 'sample' : 'none';

    const base = { windowDays, from: day(from), to: day(to) };
    if (scope === 'none') {
      const empty = { ...base, scope, daysChecked: 0, carsDetected: 0, jobsRecorded: 0, expectedCents: 0, receivedCents: 0, gapCents: 0, flagsRaised: 0, openFlags: 0, flaggedCents: 0, sites: [], topFlags: [] };
      return { ...empty, text: renderSummaryText(empty, organisation) };
    }

    const demo = scope === 'sample';
    const perSite = await client.query(
      `SELECT s.name, count(*)::int AS days, sum(d.cars_detected)::int AS cars, sum(d.jobs_recorded)::int AS jobs,
              sum(d.expected_cents)::bigint AS expected, sum(d.received_cents)::bigint AS received,
              sum(d.gap_cents)::bigint AS gap, sum(d.flags)::int AS flags
         FROM day_closes d JOIN sites s ON s.id = d.site_id
        WHERE s.is_demo = $3 AND d.business_day BETWEEN $1 AND $2
        GROUP BY s.id, s.name ORDER BY s.name`,
      [day(from), day(to), demo]
    );
    const flagRows = await client.query(
      `SELECT x.type, count(*)::int AS n, COALESCE(sum(x.est_value_cents), 0)::bigint AS value
         FROM discrepancies x JOIN sites s ON s.id = x.site_id
        WHERE s.is_demo = $3 AND x.business_day BETWEEN $1 AND $2
        GROUP BY x.type ORDER BY sum(x.est_value_cents) DESC, count(*) DESC LIMIT 6`,
      [day(from), day(to), demo]
    );
    const open = await client.query(
      `SELECT count(*)::int AS n, COALESCE(sum(x.est_value_cents), 0)::bigint AS value
         FROM discrepancies x JOIN sites s ON s.id = x.site_id
        WHERE s.is_demo = $3 AND x.state = 'open' AND x.business_day BETWEEN $1 AND $2`,
      [day(from), day(to), demo]
    );

    const sites: SummarySite[] = perSite.rows.map((row) => ({
      name: row.name,
      daysChecked: row.days,
      expectedCents: Number(row.expected),
      receivedCents: Number(row.received),
      gapCents: Number(row.gap),
      flags: row.flags
    }));
    const topFlags: SummaryFlag[] = flagRows.rows.map((row) => ({
      type: row.type,
      label: FLAG_LABELS[row.type] ?? row.type,
      count: row.n,
      estimatedCents: Number(row.value)
    }));
    const sum = (pick: (row: Record<string, any>) => number) => perSite.rows.reduce((total, row) => total + pick(row), 0);

    const result = {
      ...base,
      scope,
      daysChecked: sum((row) => row.days),
      carsDetected: sum((row) => row.cars),
      jobsRecorded: sum((row) => row.jobs),
      expectedCents: sum((row) => Number(row.expected)),
      receivedCents: sum((row) => Number(row.received)),
      gapCents: sum((row) => Number(row.gap)),
      flagsRaised: sum((row) => row.flags),
      openFlags: open.rows[0].n as number,
      flaggedCents: Number(open.rows[0].value),
      sites,
      topFlags
    };
    return { ...result, text: renderSummaryText(result, organisation) };
  });
}
