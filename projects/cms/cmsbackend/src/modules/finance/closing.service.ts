import { Transaction } from 'sequelize';
import { exec, select, selectOne } from './sql';
import { toInt } from '../../common/money';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { CLOSING_PERIOD_NUMBER, ensureFiscalYearFor } from './periods.service';
import { postEntry, PostLine } from './ledger.service';
import { recordAudit } from './audit.service';
import { accountIdByKey } from './setup.service';

/**
 * Year-end close. Income and expense balances for each fund are zeroed into Net Assets by one
 * closing entry posted in the year's dedicated closing period (so the year's activity reports stay
 * intact), then every period of the year is locked for good and the next year is opened.
 */
export async function closeFiscalYear(t: Transaction, churchId: number, yearId: number, actorId: number) {
  const year = await selectOne<any>(t, `SELECT * FROM fiscal_years WHERE church_id = :churchId AND id = :yearId`, { churchId, yearId });
  if (!year) throw new NotFoundError(`fiscal year ${yearId} was not found`);
  if (year.status === 'CLOSED') throw new ConflictError(`${year.name} is already closed`);

  const periods = await select<any>(t, `SELECT id, number, name, status FROM fiscal_periods WHERE church_id = :churchId AND fiscal_year_id = :yearId ORDER BY number`, { churchId, yearId });
  const open = periods.filter((p) => toInt(p.number) <= 12 && p.status !== 'CLOSED');
  if (open.length > 0) {
    throw new BadRequestError(`close every month first; still open: ${open.map((p) => p.name).join(', ')}`);
  }
  const closing = periods.find((p) => toInt(p.number) === CLOSING_PERIOD_NUMBER);
  if (!closing) throw new Error('fiscal year has no closing period');

  const regular = periods.filter((p) => toInt(p.number) <= 12).map((p) => toInt(p.id));
  const rows = await select<any>(
    t,
    `SELECT b.account_id, b.fund_id, SUM(b.credit_minor - b.debit_minor) AS net
       FROM ledger_balances b JOIN accounts a ON a.church_id = b.church_id AND a.id = b.account_id
      WHERE b.church_id = ? AND b.period_id IN (${regular.map(() => '?').join(',')}) AND a.type IN ('INCOME','EXPENSE')
      GROUP BY b.account_id, b.fund_id HAVING SUM(b.credit_minor - b.debit_minor) <> 0
      ORDER BY b.fund_id, b.account_id`,
    [churchId, ...regular]
  );

  let closingEntryId: number | null = null;
  let surplusByFund: Record<string, number> = {};
  if (rows.length > 0) {
    const netAssets = await accountIdByKey(t, churchId, 'NET_ASSETS');
    const lines: PostLine[] = [];
    const perFund = new Map<number, number>();
    for (const row of rows) {
      const net = toInt(row.net);
      const fundId = toInt(row.fund_id);
      lines.push(net > 0 ? { accountId: toInt(row.account_id), fundId, debit: net } : { accountId: toInt(row.account_id), fundId, credit: -net });
      perFund.set(fundId, (perFund.get(fundId) ?? 0) + net);
    }
    for (const [fundId, surplus] of perFund) {
      if (surplus === 0) continue;
      lines.push(surplus > 0 ? { accountId: netAssets, fundId, credit: surplus, memo: 'Surplus to net assets' } : { accountId: netAssets, fundId, debit: -surplus, memo: 'Deficit to net assets' });
    }
    surplusByFund = Object.fromEntries([...perFund].map(([fund, value]) => [String(fund), value]));
    const posted = await postEntry(
      {
        entryDate: String(year.end_date).slice(0, 10),
        periodId: toInt(closing.id),
        memo: `Year-end close ${year.name}`,
        sourceType: 'CLOSING',
        sourceId: yearId,
        lines,
        actorId
      },
      t,
      churchId
    );
    closingEntryId = posted.id;
  }

  const now = new Date();
  await exec(t, `UPDATE fiscal_periods SET status = 'LOCKED', closed_at = COALESCE(closed_at, :now), closed_by = COALESCE(closed_by, :actorId), updated_at = :now WHERE church_id = :churchId AND fiscal_year_id = :yearId`, { now, actorId, churchId, yearId });
  await exec(t, `UPDATE fiscal_years SET status = 'CLOSED', closed_at = :now, closed_by = :actorId, closing_entry_id = :entry, updated_at = :now WHERE church_id = :churchId AND id = :yearId`, { now, actorId, entry: closingEntryId, churchId, yearId });

  const nextStart = new Date(`${String(year.end_date).slice(0, 10)}T00:00:00Z`);
  nextStart.setUTCDate(nextStart.getUTCDate() + 1);
  const nextYearId = await ensureFiscalYearFor(t, churchId, nextStart.toISOString().slice(0, 10));

  await recordAudit(t, churchId, { action: 'fiscal_year.close', entityType: 'fiscal_year', entityId: yearId, actorId, data: { name: year.name, closingEntryId, surplusByFund } });
  return { yearId, name: year.name, closingEntryId, surplusByFund, nextYearId };
}
