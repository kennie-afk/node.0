/**
 * Giving analytics. Member-level figures (top givers, lapsed, retention, average gift) read the
 * `contribution` records, which carry the donor; fund-level figures read the ledger, which is the
 * authority on where money was earned. Voided and still-pending gifts are excluded wherever the
 * giving module's `status` column exists.
 */
import { Transaction } from 'sequelize';
import { select } from '../finance/sql';
import { fromMinor, roundHalfUp, toInt } from '../../common/money';
import { addDays, addMonths, columnExists, decimalToMinor, monthOf } from './db';
import { dateOnly } from '../finance/chain';
import { incomeStatement } from './statements.service';

async function posted(t: Transaction): Promise<string> {
  return (await columnExists(t, 'contribution', 'status')) ? `AND c.status = 'POSTED'` : '';
}

const span = (from: string, to: string) => ({ lower: from, upperExclusive: addDays(to, 1) });

export async function givingByType(t: Transaction, churchId: number, q: { from: string; to: string }) {
  const { lower, upperExclusive } = span(q.from, q.to);
  const rows = await select<any>(
    t,
    `SELECT c.contribution_type AS type, COUNT(*) AS gifts, SUM(c.amount) AS total, COUNT(DISTINCT c.member_id) AS donors
       FROM contribution c WHERE c.church_id = ? AND c.contribution_date >= ? AND c.contribution_date < ? ${await posted(t)}
      GROUP BY c.contribution_type ORDER BY SUM(c.amount) DESC`,
    [churchId, lower, upperExclusive]
  );
  const total = rows.reduce((s, r) => s + decimalToMinor(r.total), 0);
  return {
    from: q.from,
    to: q.to,
    source: 'contribution',
    total: fromMinor(total),
    types: rows.map((r) => ({
      type: r.type as string,
      gifts: toInt(r.gifts),
      donors: toInt(r.donors),
      total: fromMinor(decimalToMinor(r.total)),
      share: total === 0 ? '0.0' : ((decimalToMinor(r.total) * 1000) / total / 10).toFixed(1)
    }))
  };
}

export async function givingByMonth(t: Transaction, churchId: number, q: { from: string; to: string }) {
  const { lower, upperExclusive } = span(q.from, q.to);
  const rows = await select<any>(
    t,
    `SELECT ${monthOf('c.contribution_date')} AS month, COUNT(*) AS gifts, SUM(c.amount) AS total, COUNT(DISTINCT c.member_id) AS donors
       FROM contribution c WHERE c.church_id = ? AND c.contribution_date >= ? AND c.contribution_date < ? ${await posted(t)}
      GROUP BY ${monthOf('c.contribution_date')} ORDER BY month`,
    [churchId, lower, upperExclusive]
  );
  const byMonth = new Map(rows.map((r) => [r.month as string, r]));
  const months: Array<{ month: string; gifts: number; donors: number; total: string }> = [];
  for (let cursor = `${q.from.slice(0, 7)}-01`; cursor.slice(0, 7) <= q.to.slice(0, 7); cursor = addMonths(cursor, 1)) {
    const hit = byMonth.get(cursor.slice(0, 7));
    months.push({ month: cursor.slice(0, 7), gifts: hit ? toInt(hit.gifts) : 0, donors: hit ? toInt(hit.donors) : 0, total: fromMinor(hit ? decimalToMinor(hit.total) : 0) });
  }
  return { from: q.from, to: q.to, source: 'contribution', months };
}

/** Where giving landed, by fund, straight from the ledger's income accounts. */
export async function givingByFund(t: Transaction, churchId: number, q: { from: string; to: string }) {
  const statement = await incomeStatement(t, churchId, { ...q, compare: 'none', byFund: true });
  const funds = (statement.byFund ?? []).filter((f) => f.income !== '0.00');
  return { from: q.from, to: q.to, source: 'ledger', total: statement.totalIncome, funds: funds.map((f) => ({ fundId: f.fundId, code: f.code, name: f.name, restriction: f.restriction, income: f.income })) };
}

export async function topGivers(t: Transaction, churchId: number, q: { from: string; to: string; limit: number }) {
  const { lower, upperExclusive } = span(q.from, q.to);
  const rows = await select<any>(
    t,
    `SELECT c.member_id, m.first_name, m.last_name, COUNT(*) AS gifts, SUM(c.amount) AS total, MAX(c.contribution_date) AS last_gift
       FROM contribution c JOIN members m ON m.church_id = c.church_id AND m.id = c.member_id
      WHERE c.church_id = ? AND c.member_id IS NOT NULL AND c.contribution_date >= ? AND c.contribution_date < ? ${await posted(t)}
      GROUP BY c.member_id, m.first_name, m.last_name ORDER BY SUM(c.amount) DESC, c.member_id LIMIT ?`,
    [churchId, lower, upperExclusive, q.limit]
  );
  return {
    from: q.from,
    to: q.to,
    source: 'contribution',
    givers: rows.map((r, i) => ({ rank: i + 1, memberId: toInt(r.member_id), name: `${r.first_name} ${r.last_name}`, gifts: toInt(r.gifts), total: fromMinor(decimalToMinor(r.total)), lastGift: dateOnly(r.last_gift) }))
  };
}

/** Regular givers who have gone quiet: gave within the look-back window, nothing since the cutoff. */
export async function lapsedGivers(t: Transaction, churchId: number, q: { asOf: string; quietMonths: number; lookbackMonths: number; limit: number }) {
  const cutoff = addMonths(q.asOf, -q.quietMonths);
  const start = addMonths(q.asOf, -q.lookbackMonths);
  const rows = await select<any>(
    t,
    `SELECT c.member_id, m.first_name, m.last_name, m.email, m.phone_number, COUNT(*) AS gifts, SUM(c.amount) AS total, MAX(c.contribution_date) AS last_gift
       FROM contribution c JOIN members m ON m.church_id = c.church_id AND m.id = c.member_id
      WHERE c.church_id = ? AND c.member_id IS NOT NULL AND c.contribution_date >= ? AND c.contribution_date < ? ${await posted(t)}
      GROUP BY c.member_id, m.first_name, m.last_name, m.email, m.phone_number
     HAVING MAX(c.contribution_date) < ?
      ORDER BY SUM(c.amount) DESC, c.member_id LIMIT ?`,
    [churchId, start, addDays(q.asOf, 1), cutoff, q.limit]
  );
  return {
    asOf: q.asOf,
    quietSince: cutoff,
    lookbackFrom: start,
    source: 'contribution',
    givers: rows.map((r) => ({
      memberId: toInt(r.member_id),
      name: `${r.first_name} ${r.last_name}`,
      email: (r.email as string) ?? null,
      phone: (r.phone_number as string) ?? null,
      gifts: toInt(r.gifts),
      total: fromMinor(decimalToMinor(r.total)),
      lastGift: dateOnly(r.last_gift)
    }))
  };
}

/** Of the people who gave last year, how many gave this year; and how many are new. */
export async function donorRetention(t: Transaction, churchId: number, q: { year: number }) {
  const status = await posted(t);
  const range = (y: number) => [`${y}-01-01`, `${y + 1}-01-01`];
  const [pFrom, pTo] = range(q.year - 1);
  const [cFrom, cTo] = range(q.year);
  const one = async (sql: string, params: unknown[]) => toInt((await select<any>(t, sql, params))[0]?.n);

  const prior = await one(`SELECT COUNT(DISTINCT c.member_id) AS n FROM contribution c WHERE c.church_id = ? AND c.member_id IS NOT NULL AND c.contribution_date >= ? AND c.contribution_date < ? ${status}`, [churchId, pFrom, pTo]);
  const current = await one(`SELECT COUNT(DISTINCT c.member_id) AS n FROM contribution c WHERE c.church_id = ? AND c.member_id IS NOT NULL AND c.contribution_date >= ? AND c.contribution_date < ? ${status}`, [churchId, cFrom, cTo]);
  const retained = await one(
    `SELECT COUNT(DISTINCT c.member_id) AS n FROM contribution c
      WHERE c.church_id = ? AND c.member_id IS NOT NULL AND c.contribution_date >= ? AND c.contribution_date < ? ${status}
        AND EXISTS (SELECT 1 FROM contribution p WHERE p.church_id = c.church_id AND p.member_id = c.member_id AND p.contribution_date >= ? AND p.contribution_date < ? ${status.replace(/c\./g, 'p.')})`,
    [churchId, cFrom, cTo, pFrom, pTo]
  );
  return {
    year: q.year,
    source: 'contribution',
    priorYearDonors: prior,
    currentYearDonors: current,
    retained,
    lost: prior - retained,
    newDonors: current - retained,
    retentionRate: prior === 0 ? null : ((retained * 1000) / prior / 10).toFixed(1)
  };
}

export async function averageGift(t: Transaction, churchId: number, q: { from: string; to: string }) {
  const { lower, upperExclusive } = span(q.from, q.to);
  const row = (
    await select<any>(
      t,
      `SELECT COUNT(*) AS gifts, COALESCE(SUM(c.amount), 0) AS total, COUNT(DISTINCT c.member_id) AS donors
         FROM contribution c WHERE c.church_id = ? AND c.contribution_date >= ? AND c.contribution_date < ? ${await posted(t)}`,
      [churchId, lower, upperExclusive]
    )
  )[0];
  const gifts = toInt(row.gifts);
  const donors = toInt(row.donors);
  const total = decimalToMinor(row.total);
  return {
    from: q.from,
    to: q.to,
    source: 'contribution',
    gifts,
    identifiedDonors: donors,
    total: fromMinor(total),
    averageGift: fromMinor(gifts === 0 ? 0 : roundHalfUp(total / gifts)),
    averagePerDonor: fromMinor(donors === 0 ? 0 : roundHalfUp(total / donors))
  };
}
