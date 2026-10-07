/**
 * Instalment and arrears reminders by SMS, to the phone number on the member's record.
 *
 *   upcoming   an instalment falls due in `upcomingDays` days, or today
 *   arrears    an instalment is exactly 1, 7, 14 or 30 days overdue (a fixed ladder, so a borrower is not texted every day)
 *
 * One reminder per instalment per kind per day (sms_reminders is unique on it). A reminder is CLAIMED before it is sent, so two
 * runs at once cannot both send it, and a crash between claim and send means it is skipped, not sent twice. Messages go through
 * the configured provider (see provider.ts: Africa's Talking is UNVERIFIED against the real service).
 */
import { withOrg } from '../persistence/pool';
import { moneyText } from '../domain/money';
import { provider, sendMessage } from './provider';

export const ARREARS_LADDER = [1, 7, 14, 30];

export interface ReminderResult {
  asOf: string;
  considered: number;
  sent: number;
  failed: number;
  alreadySent: number;
}

interface Due {
  loan_id: string;
  loan_no: string;
  loan_seq: string;
  phone: string;
  installment_no: number;
  due: string;
  owed: string;
  days_late: number;
  paybill: string | null;
}

export async function sendReminders(orgId: string, asOf: string, opts: { upcomingDays: number; orgName?: string; pageSize?: number }): Promise<ReminderResult> {
  const size = opts.pageSize ?? 200;
  const result: ReminderResult = { asOf, considered: 0, sent: 0, failed: 0, alreadySent: 0 };
  let afterSeq = 0;
  let afterNo = 0;
  for (;;) {
    const claimed = await withOrg(orgId, async (client) => {
      const name = opts.orgName ?? (await client.query('SELECT name FROM organisations LIMIT 1')).rows[0]?.name ?? 'Your lender';
      const rows = (await client.query(
        `SELECT l.id AS loan_id, l.loan_no, l.loan_seq, m.phone, s.installment_no, to_char(s.due_date, 'YYYY-MM-DD') AS due,
                ((s.principal_cents - s.paid_principal_cents) + (s.interest_cents - s.paid_interest_cents) + (s.penalty_cents - s.paid_penalty_cents))::bigint AS owed,
                ($1::date - s.due_date)::int AS days_late, b.paybill_number AS paybill
           FROM loan_schedule s JOIN loans l ON l.id = s.loan_id JOIN members m ON m.id = l.member_id LEFT JOIN branches b ON b.id = l.branch_id
          WHERE l.status = 'disbursed' AND m.phone IS NOT NULL
            AND (s.principal_cents - s.paid_principal_cents) + (s.interest_cents - s.paid_interest_cents) + (s.penalty_cents - s.paid_penalty_cents) > 0
            AND ((s.due_date - $1::date) IN (0, $2::int) OR ($1::date - s.due_date) = ANY($3::int[]))
            AND (l.loan_seq, s.installment_no) > ($4::bigint, $5::int)
          ORDER BY l.loan_seq, s.installment_no LIMIT $6`,
        [asOf, opts.upcomingDays, ARREARS_LADDER, afterSeq, afterNo, size]
      )).rows as Due[];
      const out: Array<{ id: string; phone: string; body: string }> = [];
      for (const r of rows) {
        const kind = r.days_late > 0 ? 'arrears' : 'upcoming';
        const owed = `KSh ${moneyText(Number(r.owed))}`;
        const how = r.paybill ? ` Pay to paybill ${r.paybill}, account ${r.loan_no}.` : '';
        const body = kind === 'arrears'
          ? `${name}: loan ${r.loan_no} instalment ${r.installment_no} (${owed}) is ${r.days_late} day${r.days_late === 1 ? '' : 's'} overdue.${how}`
          : `${name}: loan ${r.loan_no} instalment ${r.installment_no} (${owed}) is due on ${r.due}.${how}`;
        const claim = await client.query(
          `INSERT INTO sms_reminders (org_id, loan_id, installment_no, kind, sent_on, to_phone, body, provider, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'queued')
           ON CONFLICT (loan_id, installment_no, kind, sent_on) DO NOTHING RETURNING id`,
          [orgId, r.loan_id, r.installment_no, kind, asOf, r.phone, body]
        );
        if (claim.rows[0]) out.push({ id: claim.rows[0].id as string, phone: r.phone, body });
        else result.alreadySent += 1;
      }
      const last = rows[rows.length - 1];
      return { out, count: rows.length, last: last ? { seq: Number(last.loan_seq), no: last.installment_no } : null };
    });
    result.considered += claimed.count;
    for (const message of claimed.out) {
      const sent = await sendMessage({ to: message.phone, purpose: 'loan-reminder', body: message.body });
      const ok = sent.status !== 'failed';
      if (ok) result.sent += 1;
      else result.failed += 1;
      await withOrg(orgId, (client) => client.query(`UPDATE sms_reminders SET status = $2, provider = $3 WHERE id = $1`, [message.id, sent.status, provider().name]));
    }
    if (!claimed.last || claimed.count < size) return result;
    afterSeq = claimed.last.seq;
    afterNo = claimed.last.no;
  }
}
