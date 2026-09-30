import { Transaction } from 'sequelize';
import { select, selectOne } from '../finance/sql';
import { loadSettings } from '../finance/setup.service';
import { fromMinor, toInt } from '../../common/money';
import { NotFoundError } from '../../utils/errors';
import { bool, dateOnly, minorOf } from './shared';

/** A member's giving for one calendar year: every posted gift, totals by type and fund, and the deductible amount. */
export async function memberStatement(t: Transaction, churchId: number, memberId: number, year: number) {
  const member = await selectOne<any>(
    t,
    `SELECT id, first_name, last_name, email, phone_number, address, city FROM members WHERE church_id = :churchId AND id = :memberId`,
    { churchId, memberId }
  );
  if (!member) throw new NotFoundError(`member ${memberId} was not found`);
  const settings = await loadSettings(t, churchId);
  const rows = await select<any>(
    t,
    `SELECT c.id, c.contribution_date, c.receipt_no, c.contribution_type, c.amount, c.payment_method, c.tax_deductible, f.code AS fund_code, f.name AS fund_name
       FROM contribution c LEFT JOIN funds f ON f.church_id = c.church_id AND f.id = c.fund_id
      WHERE c.church_id = :churchId AND c.member_id = :memberId AND c.status = 'POSTED'
        AND c.contribution_date >= :from AND c.contribution_date <= :to
      ORDER BY c.contribution_date, c.id`,
    { churchId, memberId, from: `${year}-01-01`, to: `${year}-12-31` }
  );
  const byType = new Map<string, number>();
  const byFund = new Map<string, number>();
  let total = 0;
  let deductible = 0;
  const gifts = rows.map((r) => {
    const minor = minorOf(r.amount);
    total += minor;
    if (bool(r.tax_deductible)) deductible += minor;
    byType.set(r.contribution_type, (byType.get(r.contribution_type) ?? 0) + minor);
    const fund = r.fund_name ?? 'Unassigned';
    byFund.set(fund, (byFund.get(fund) ?? 0) + minor);
    return {
      id: toInt(r.id),
      date: dateOnly(r.contribution_date),
      receiptNo: r.receipt_no,
      type: r.contribution_type,
      fund: r.fund_name ?? null,
      method: r.payment_method,
      amount: fromMinor(minor),
      taxDeductible: bool(r.tax_deductible)
    };
  });
  return {
    year,
    currency: settings.baseCurrency,
    member: {
      id: toInt(member.id),
      name: `${member.first_name} ${member.last_name}`,
      email: member.email,
      phone: member.phone_number,
      address: [member.address, member.city].filter(Boolean).join(', ') || null
    },
    gifts,
    giftCount: gifts.length,
    total: fromMinor(total),
    taxDeductibleTotal: fromMinor(deductible),
    byType: [...byType].map(([type, amount]) => ({ type, amount: fromMinor(amount) })),
    byFund: [...byFund].map(([fund, amount]) => ({ fund, amount: fromMinor(amount) })),
    generatedAt: new Date().toISOString()
  };
}
