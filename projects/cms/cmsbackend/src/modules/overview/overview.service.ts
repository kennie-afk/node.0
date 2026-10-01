import { Transaction } from 'sequelize';
import { select, selectOne } from '../finance/sql';
import { fromMinor } from '../../common/money';
import { addDays, addMonths, decimalToMinor, tableExists } from '../reports/db';
import { dashboard as financeDashboard } from '../reports/dashboard.service';
import { cached } from '../../common/cache';

/**
 * What the landing screen shows, shaped by what the signed-in role may see. Every section is
 * decided by a permission the caller holds, never by a role name, so a church's own custom role
 * gets the right panels with no code change. A section the caller may not see is simply absent.
 */
export interface AttentionItem {
  key: string;
  label: string;
  count: number;
  href: string;
}

const n = (row: Record<string, any> | null | undefined, field = 'n') => Number(row?.[field] ?? 0);

async function count(t: Transaction, table: string, sql: string, params: unknown[]): Promise<number> {
  // Optional modules may not be installed in every deployment; their tiles just stay out.
  if (!(await tableExists(t, table))) return 0;
  return n(await selectOne(t, sql, params as any));
}

export async function overview(t: Transaction, churchId: number, today: string, held: ReadonlySet<string>) {
  const out: Record<string, unknown> = { asOf: today };
  const attention: AttentionItem[] = [];
  const monthStart = `${today.slice(0, 7)}-01`;

  if (held.has('members:read')) {
    const from30 = addDays(today, -30);
    const from60 = addDays(today, -60);
    const [total, recent, prior] = await Promise.all([
      selectOne(t, 'SELECT COUNT(*) AS n FROM members WHERE church_id = ?', [churchId]),
      selectOne(t, 'SELECT COUNT(*) AS n FROM members WHERE church_id = ? AND created_at >= ?', [churchId, from30]),
      selectOne(t, 'SELECT COUNT(*) AS n FROM members WHERE church_id = ? AND created_at >= ? AND created_at < ?', [churchId, from60, from30])
    ]);
    const recentMembers = await select<any>(t, 'SELECT id, first_name, last_name, created_at FROM members WHERE church_id = ? ORDER BY created_at DESC, id DESC LIMIT 5', [churchId]);
    const events = await select<any>(t, 'SELECT id, name, location, start_time FROM events WHERE church_id = ? AND start_time >= ? ORDER BY start_time ASC LIMIT 5', [churchId, today]);
    out.people = {
      members: { total: n(total), joinedLast30Days: n(recent), joinedPrevious30Days: n(prior) },
      recentMembers: recentMembers.map((m) => ({ id: Number(m.id), name: `${m.first_name} ${m.last_name}`, joinedAt: m.created_at })),
      upcomingEvents: events.map((e) => ({ id: Number(e.id), name: e.name, location: e.location ?? null, startsAt: e.start_time }))
    };

    const weekEnd = addDays(today, 7);
    const unconfirmed = await count(t, 'roster_assignments', `SELECT COUNT(*) AS n FROM roster_assignments WHERE church_id = ? AND status = 'PENDING' AND starts_at >= ? AND starts_at < ?`, [churchId, today, weekEnd]);
    if (unconfirmed) attention.push({ key: 'volunteers', label: 'Volunteers yet to confirm this week', count: unconfirmed, href: '/volunteers' });
    const bookings = await count(t, 'facility_bookings', `SELECT COUNT(*) AS n FROM facility_bookings WHERE church_id = ? AND status = 'PENDING'`, [churchId]);
    if (bookings) attention.push({ key: 'bookings', label: 'Room bookings awaiting approval', count: bookings, href: '/facilities' });
    const visitors = await count(t, 'visitor_tasks', `SELECT COUNT(*) AS n FROM visitor_tasks WHERE church_id = ? AND status = 'OPEN' AND due_date < ?`, [churchId, today]);
    if (visitors) attention.push({ key: 'visitors', label: 'Visitor follow-ups overdue', count: visitors, href: '/visitors' });
  }

  if (held.has('care:read')) {
    const weekEnd = addDays(today, 7);
    const care = await count(t, 'care_notes', `SELECT COUNT(*) AS n FROM care_notes WHERE church_id = ? AND follow_up_done = ? AND follow_up_on IS NOT NULL AND follow_up_on <= ?`, [churchId, false, weekEnd]);
    const visits = await count(t, 'visitations', `SELECT COUNT(*) AS n FROM visitations WHERE church_id = ? AND follow_up_done = ? AND follow_up_on IS NOT NULL AND follow_up_on <= ?`, [churchId, false, weekEnd]);
    if (care + visits) attention.push({ key: 'care', label: 'Pastoral follow-ups due this week', count: care + visits, href: '/care' });
  }

  if (held.has('giving:read') || held.has('finance:read')) {
    // The finance summary is already computed (and cached) for the Finance overview; reuse it.
    const fin = await cached(churchId, 'dashboard', { today }, () => financeDashboard(t, churchId, today));
    if (held.has('giving:read')) {
      const lastMonthStart = addMonths(monthStart, -1);
      // Amounts are decimals in this table; sum them as text and convert, never through a float.
      const sumGifts = async (from: string, to: string) =>
        decimalToMinor((await selectOne<any>(t, `SELECT COALESCE(SUM(amount), 0) AS total FROM contribution WHERE church_id = ? AND status = 'POSTED' AND contribution_date >= ? AND contribution_date < ?`, [churchId, from, to]))?.total ?? 0);
      const nextMonthStart = addMonths(monthStart, 1);
      const [thisMonth, lastMonth, giftCount] = await Promise.all([
        sumGifts(monthStart, nextMonthStart),
        sumGifts(lastMonthStart, monthStart),
        selectOne(t, `SELECT COUNT(*) AS n FROM contribution WHERE church_id = ? AND status = 'POSTED' AND contribution_date >= ? AND contribution_date < ?`, [churchId, monthStart, nextMonthStart])
      ]);
      const recent = await select<any>(
        t,
        `SELECT c.id, c.contribution_date, c.amount, c.receipt_no, c.contribution_type, c.contributor_name, c.is_anonymous, m.first_name, m.last_name
           FROM contribution c LEFT JOIN members m ON m.church_id = c.church_id AND m.id = c.member_id
          WHERE c.church_id = ? AND c.status = 'POSTED' ORDER BY c.contribution_date DESC, c.id DESC LIMIT 5`,
        [churchId]
      );
      out.giving = {
        thisMonth: fromMinor(thisMonth),
        lastMonth: fromMinor(lastMonth),
        gifts: n(giftCount),
        trend: fin.givingTrend.slice(-6),
        recent: recent.map((g) => ({
          id: Number(g.id),
          date: g.contribution_date,
          amount: fromMinor(decimalToMinor(g.amount)),
          receiptNo: g.receipt_no ?? null,
          type: g.contribution_type,
          donor: g.is_anonymous === true || g.is_anonymous === 1 ? 'Anonymous' : g.first_name ? `${g.first_name} ${g.last_name}` : g.contributor_name ?? 'Unnamed'
        }))
      };
      if (held.has('giving:write')) {
        const open = await count(t, 'giving_batches', `SELECT COUNT(*) AS n FROM giving_batches WHERE church_id = ? AND status IN ('OPEN','COUNTED')`, [churchId]);
        if (open) attention.push({ key: 'batches', label: 'Counting batches not yet posted', count: open, href: '/giving/batches' });
      }
    }
    if (held.has('finance:read')) {
      out.finance = {
        cash: fin.cash.total,
        month: fin.month,
        yearToDate: fin.yearToDate,
        bills: fin.bills,
        accountsPayable: fin.accountsPayable
      };
      if (fin.bills && fin.bills.overdueCount > 0) attention.push({ key: 'overdue-bills', label: 'Bills overdue', count: fin.bills.overdueCount, href: '/payables/bills' });
      if (held.has('finance:approve')) {
        const waiting = await count(t, 'bills', `SELECT COUNT(*) AS n FROM bills WHERE church_id = ? AND status = 'SUBMITTED'`, [churchId]);
        if (waiting) attention.push({ key: 'bills-approval', label: 'Bills waiting for your approval', count: waiting, href: '/payables/bills' });
      }
    }
  }

  if (held.has('comms:send')) {
    const failed = await count(t, 'outbox_messages', `SELECT COUNT(*) AS n FROM outbox_messages WHERE church_id = ? AND status = 'FAILED'`, [churchId]);
    if (failed) attention.push({ key: 'messages', label: 'Messages that failed to send', count: failed, href: '/comms' });
  }

  out.attention = attention;
  return out;
}
