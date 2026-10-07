import Link from "next/link";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { addAccount, closePeriod, postJournal, reopenPeriod, reverseJournal, runAccrual, runDividend, runPenalties, runProvisioning, setAccountActive } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { Account, BalanceSheet, DividendRun, IncomeStatement, JournalPage, Line, PeriodStatus, Provisioning, Settings, TrialBalance } from "@/lib/types";
import { Badge, Card, Download, EmptyState, Field, Notice, PageHeader, Pager, Stat, Table, cell, inputClass, num, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";
import { day, ksh, label, today } from "@/lib/format";

const VIEWS = [["journal", "Journal"], ["trial", "Trial balance"], ["income", "Income statement"], ["balance", "Balance sheet"], ["accounts", "Chart of accounts"], ["closing", "Month end"]] as const;

export default async function Ledger({ searchParams }: { searchParams: Promise<{ view?: string; before?: string; from?: string; to?: string; asOf?: string; source?: string }> }) {
  const sp = await searchParams;
  const view = VIEWS.some(([v]) => v === sp.view) ? sp.view! : "journal";
  const role = (await readSession())?.role ?? "";

  return (
    <>
      <PageHeader title="Ledger" subtitle="Every deposit, payout and repayment posts a balanced entry. These statements are built from those entries and nothing else." actions={<Download href="/console/download/journal">Journal CSV</Download>} />
      <nav className="mb-5 flex flex-wrap gap-1">
        {VIEWS.map(([v, t]) => <Link key={v} href={`/console/ledger?view=${v}`} className={v === view ? "rounded-md bg-[var(--color-ink)] px-3 py-1.5 text-[0.8125rem] font-medium text-white" : "rounded-md px-3 py-1.5 text-[0.8125rem] font-medium text-[var(--color-muted)]"}>{t}</Link>)}
      </nav>
      {view === "journal" ? <Journal sp={sp} role={role} /> : null}
      {view === "trial" ? <Trial asOf={sp.asOf} /> : null}
      {view === "income" ? <Income from={sp.from} to={sp.to} /> : null}
      {view === "balance" ? <Balance asOf={sp.asOf} /> : null}
      {view === "accounts" ? <Accounts role={role} /> : null}
      {view === "closing" ? <Closing role={role} /> : null}
    </>
  );
}

async function Journal({ sp, role }: { sp: { before?: string; source?: string }; role: string }) {
  const q = new URLSearchParams({ limit: "25" });
  if (sp.before) q.set("before", sp.before);
  if (sp.source) q.set("source", sp.source);
  const [page, accounts] = await Promise.all([api.get<JournalPage>(`/v1/journal?${q}`), api.get<Account[]>("/v1/accounts")]);
  const open = accounts.filter((a) => a.active);
  return (
    <div className="grid gap-5 lg:grid-cols-[1.8fr_1fr]">
      <Card>
        {page.items.length === 0 ? <EmptyState message="No journal entries yet." /> : (
          <div className="flex flex-col divide-y divide-[var(--color-line)]">
            {page.items.map((e) => (
              <div key={e.id} className="py-3 text-[0.8125rem]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><span className="font-mono text-[0.75rem]">#{e.seq}</span> · {day(e.date)} · {e.memo} {e.reverses ? <Badge value="reversal" /> : null}</div>
                  <div className="flex items-center gap-2"><Badge value={e.sourceType} /><span className="tabular-nums font-medium">{ksh(e.totalCents)}</span></div>
                </div>
                <table className="mt-1.5 w-full text-[0.75rem] text-[var(--color-muted)]"><tbody>
                  {e.lines.map((l) => <tr key={l.lineNo}><td className="w-16 py-0.5 font-mono">{l.code}</td><td>{l.account}</td><td className="w-28 text-right tabular-nums">{l.debitCents ? ksh(l.debitCents) : ""}</td><td className="w-28 text-right tabular-nums">{l.creditCents ? ksh(l.creditCents) : ""}</td></tr>)}
                </tbody></table>
                {e.sourceType === "manual" && !e.reverses && can(role, "journal_post") ? (
                  <ActionForm action={reverseJournal} submit="Reverse" button={secondaryButtonClass} className="mt-2 flex items-end gap-2"><input type="hidden" name="id" value={e.id} /><input name="memo" required minLength={3} placeholder="Why it is reversed" className={`${inputClass} !mt-0 max-w-xs`} /></ActionForm>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <Pager href={page.nextBefore ? `/console/ledger?view=journal&before=${page.nextBefore}` : null} label="Older entries" />
      </Card>
      {can(role, "journal_post") ? (
        <Card title="Post a manual entry" description="Debits must equal credits. An entry made by deposits, loans or repayments cannot be reversed here: correct it through the feature that made it.">
          <ActionForm action={postJournal} submit="Post entry">
            <Field label="Date"><input name="entryDate" type="date" required defaultValue={today()} max={today()} className={inputClass} /></Field>
            <Field label="Memo"><input name="memo" required minLength={3} className={inputClass} /></Field>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
                <select name={`code${i}`} className={selectClass} defaultValue=""><option value="">Account {i}</option>{open.map((a) => <option key={a.id} value={a.code}>{a.code} {a.name}</option>)}</select>
                <input name={`debit${i}`} inputMode="decimal" placeholder="Debit" className={inputClass} />
                <input name={`credit${i}`} inputMode="decimal" placeholder="Credit" className={inputClass} />
              </div>
            ))}
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}

async function Trial({ asOf }: { asOf?: string }) {
  const tb = await api.get<TrialBalance>(`/v1/reports/trial-balance${asOf ? `?asOf=${asOf}` : ""}`);
  return (
    <Card title={`Trial balance as at ${day(tb.asOf)}`} actions={<div className="flex items-end gap-2"><DateForm name="asOf" value={tb.asOf} view="trial" /><Download href={`/console/download/trial-balance?asOf=${tb.asOf}`}>CSV</Download></div>}>
      <Table head={["Code", "Account", "Type", "Debit", "Credit"]}>
        {tb.rows.map((r) => <tr key={r.code} className={rowClass}><td className={`${cell} font-mono text-[0.75rem]`}>{r.code}</td><td className={cell}>{r.name}</td><td className={`${cell} text-[var(--color-muted)]`}>{label(r.type)}</td><td className={num}>{r.debitCents ? ksh(r.debitCents) : ""}</td><td className={num}>{r.creditCents ? ksh(r.creditCents) : ""}</td></tr>)}
        <tr className="border-t border-[var(--color-ink)] font-semibold"><td className={cell} colSpan={3}>Total</td><td className={num}>{ksh(tb.totalDebitCents)}</td><td className={num}>{ksh(tb.totalCreditCents)}</td></tr>
      </Table>
      <p className="mt-3 text-[0.75rem]">{tb.totalDebitCents === tb.totalCreditCents ? <span className="text-[var(--color-good)]">Debits equal credits.</span> : <span className="text-[var(--color-danger)]">Debits and credits differ: this should never happen. Report it.</span>}</p>
    </Card>
  );
}

function DateForm({ name, value, view }: { name: string; value: string; view: string }) {
  return <form action="/console/ledger" className="flex items-end gap-2"><input type="hidden" name="view" value={view} /><input name={name} type="date" defaultValue={value} className={`${inputClass} !mt-0`} /><button type="submit" className={secondaryButtonClass}>Go</button></form>;
}

function Section({ title, lines, total }: { title: string; lines: Line[]; total: number }) {
  return (
    <>
      <tr><td colSpan={3} className="px-3.5 pb-1 pt-4 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-muted)]">{title}</td></tr>
      {lines.filter((l) => l.amountCents !== 0).map((l) => <tr key={l.code} className={rowClass}><td className={`${cell} w-20 font-mono text-[0.75rem]`}>{l.code}</td><td className={cell}>{l.name}</td><td className={num}>{ksh(l.amountCents)}</td></tr>)}
      <tr className="border-t border-[var(--color-line)] font-semibold"><td className={cell} colSpan={2}>Total {title.toLowerCase()}</td><td className={num}>{ksh(total)}</td></tr>
    </>
  );
}

async function Income({ from, to }: { from?: string; to?: string }) {
  const q = new URLSearchParams(); if (from) q.set("from", from); if (to) q.set("to", to);
  const s = await api.get<IncomeStatement>(`/v1/reports/income-statement${q.size ? `?${q}` : ""}`);
  return (
    <Card title={`Income statement, ${day(s.from)} to ${day(s.to)}`} actions={<form action="/console/ledger" className="flex items-end gap-2"><input type="hidden" name="view" value="income" /><input name="from" type="date" defaultValue={s.from} className={`${inputClass} !mt-0`} /><input name="to" type="date" defaultValue={s.to} className={`${inputClass} !mt-0`} /><button type="submit" className={secondaryButtonClass}>Go</button></form>}>
      <div className="mb-4 grid grid-cols-3 gap-3"><Stat label="Income" value={ksh(s.totalIncomeCents)} tone="accent" /><Stat label="Expenses" value={ksh(s.totalExpensesCents)} tone="warn" /><Stat label="Surplus" value={ksh(s.surplusCents)} tone={s.surplusCents >= 0 ? "good" : "danger"} /></div>
      <table className="w-full text-sm"><tbody><Section title="Income" lines={s.income} total={s.totalIncomeCents} /><Section title="Expenses" lines={s.expenses} total={s.totalExpensesCents} /></tbody></table>
      <p className="mt-3 text-[0.75rem] text-[var(--color-muted)]">Interest income is recognised when received; penalties when charged.</p>
    </Card>
  );
}

async function Balance({ asOf }: { asOf?: string }) {
  const b = await api.get<BalanceSheet>(`/v1/reports/balance-sheet${asOf ? `?asOf=${asOf}` : ""}`);
  return (
    <Card title={`Balance sheet as at ${day(b.asOf)}`} actions={<DateForm name="asOf" value={b.asOf} view="balance" />}>
      <div className="mb-4">{b.balanced ? <Notice tone="good">Assets equal liabilities plus equity.</Notice> : <Notice tone="danger">Assets do not equal liabilities plus equity. This should never happen. Report it.</Notice>}</div>
      <table className="w-full text-sm"><tbody>
        <Section title="Assets" lines={b.assets} total={b.totalAssetsCents} />
        <Section title="Liabilities" lines={b.liabilities} total={b.totalLiabilitiesCents} />
        <Section title="Equity" lines={[...b.equity, { code: "", name: "Surplus to date (not yet closed to reserves)", amountCents: b.surplusToDateCents }]} total={b.totalEquityCents} />
      </tbody></table>
    </Card>
  );
}

async function Accounts({ role }: { role: string }) {
  const accounts = await api.get<Account[]>("/v1/accounts");
  const write = can(role, "accounts_write");
  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <Card>
        <Table head={["Code", "Account", "Type", "", ""]}>
          {accounts.map((a) => (
            <tr key={a.id} className={rowClass}>
              <td className={`${cell} font-mono text-[0.75rem]`}>{a.code}</td><td className={cell}>{a.name}</td><td className={`${cell} text-[var(--color-muted)]`}>{label(a.type)}</td>
              <td className={cell}>{a.isSystem ? <Badge value="system" /> : null} {a.active ? null : <Badge value="disabled" />}</td>
              <td className={cell}>{write && !a.isSystem ? <ActionForm action={setAccountActive} submit={a.active ? "Disable" : "Enable"} button={secondaryButtonClass} className="flex"><input type="hidden" name="id" value={a.id} /><input type="hidden" name="active" value={a.active ? "false" : "true"} /></ActionForm> : null}</td>
            </tr>
          ))}
        </Table>
      </Card>
      {write ? (
        <Card title="Add an account" description="System accounts are the ones loans, savings and M-Pesa post to; they cannot be switched off.">
          <ActionForm action={addAccount} submit="Add account">
            <Field label="Code (4 to 8 digits)"><input name="code" required pattern="[0-9]{4,8}" className={inputClass} /></Field>
            <Field label="Name"><input name="name" required className={inputClass} /></Field>
            <Field label="Type"><select name="type" className={selectClass}><option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option><option value="income">Income</option><option value="expense">Expense</option></select></Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}

async function Closing({ role }: { role: string }) {
  const post = can(role, "journal_post");
  const [period, prov, settings] = await Promise.all([api.get<PeriodStatus>("/v1/periods"), api.get<Provisioning>("/v1/provisioning"), api.get<Settings>("/v1/settings")]);
  const sacco = settings.organisation.kind === "sacco";
  const dividends = sacco ? await api.get<DividendRun[]>("/v1/dividends") : [];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-5">
        <Card title="Daily runs" description="These run by themselves every night (Nairobi time). Run them here to see the effect now; a repeat adds nothing.">
          <div className="flex flex-wrap gap-4">
            {can(role, "penalties_run") ? (<>
              <ActionForm action={runAccrual} submit="Accrue interest due" button={secondaryButtonClass} className="flex"><span className="sr-only">Accrue interest</span></ActionForm>
              <ActionForm action={runPenalties} submit="Charge penalties" button={secondaryButtonClass} className="flex"><span className="sr-only">Charge penalties</span></ActionForm>
            </>) : <span className="text-[0.8125rem] text-[var(--color-muted)]">Your role cannot run these.</span>}
          </div>
          <p className="mt-3 text-[0.75rem] text-[var(--color-muted)]">Interest on an instalment is booked as income, against accrued interest receivable, on the day it falls due. A penalty is charged once per overdue instalment per month.</p>
        </Card>
        <Card title="Close the books" description="After closing, nothing can be posted on or before the closing day. Money that arrives for a closed day is booked on the first open day.">
          <p className="mb-3 text-[0.8125rem]">{period.lockedThrough ? <>Closed through <strong>{day(period.lockedThrough)}</strong>.</> : "No period is closed."}</p>
          {post ? (
            <ActionForm action={closePeriod} submit="Close through this day">
              <Field label="Close through"><input name="through" type="date" required max={today()} className={inputClass} /></Field>
              <Field label="Note"><input name="note" placeholder="e.g. September accounts agreed" className={inputClass} /></Field>
            </ActionForm>
          ) : null}
          {role === "owner" && period.lockedThrough ? (
            <div className="mt-4 border-t border-[var(--color-line)] pt-4">
              <ActionForm action={reopenPeriod} submit="Reopen" button={secondaryButtonClass}>
                <Field label="Reopen back to" hint="Leave empty to reopen everything. A reason is required and is recorded."><input name="through" type="date" className={inputClass} /></Field>
                <Field label="Why"><input name="note" required minLength={3} className={inputClass} /></Field>
              </ActionForm>
            </div>
          ) : null}
        </Card>
      </div>
      <div className="flex flex-col gap-5">
        <Card title="Loan loss provision" description="Required provision by days late, as at today.">
          <Notice tone="warn">Illustrative percentages, <strong>not regulatory guidance</strong>. Set them under Settings with your accountant.</Notice>
          <div className="mt-3"><Table head={["Days late", "Loans", "Exposure", "Rate", "Required"]}>
            {prov.preview.buckets.map((b) => <tr key={b.bucket} className={rowClass}><td className={cell}>{b.bucket === "current" ? "Not late" : b.bucket}</td><td className={num}>{b.loans}</td><td className={num}>{ksh(b.exposureCents)}</td><td className={num}>{b.rateBp / 100}%</td><td className={num}>{ksh(b.requiredCents)}</td></tr>)}
            <tr className={rowClass}><td className={`${cell} font-medium`} colSpan={4}>Required</td><td className={`${num} font-medium`}>{ksh(prov.preview.requiredCents)}</td></tr>
          </Table></div>
          {post ? <div className="mt-3"><ActionForm action={runProvisioning} submit="Post the provision" button={secondaryButtonClass} className="flex"><span className="sr-only">Post provision</span></ActionForm></div> : null}
        </Card>
        {sacco ? (
          <Card title="Savings interest and share dividends" description="A rate on each member's balance at the period end (not an average). One run per kind per period.">
            {post ? (
              <ActionForm action={runDividend} submit="Run">
                <Field label="Kind"><select name="kind" className={selectClass}><option value="savings_interest">Interest on savings</option><option value="share_dividend">Dividend on shares (credited to savings)</option></select></Field>
                <div className="grid grid-cols-2 gap-2"><Field label="Period end"><input name="periodEnd" type="date" required max={today()} className={inputClass} /></Field><Field label="Rate (% a year)"><input name="rate" inputMode="decimal" required className={inputClass} /></Field></div>
              </ActionForm>
            ) : null}
            {dividends.length > 0 ? <div className="mt-4"><Table head={["Period end", "Kind", "Rate", "Members", "Total"]}>{dividends.map((d) => <tr key={d.id} className={rowClass}><td className={cell}>{day(d.periodEnd)}</td><td className={cell}>{label(d.kind)}</td><td className={num}>{d.rateBp / 100}%</td><td className={num}>{d.members}</td><td className={num}>{ksh(d.totalCents)}</td></tr>)}</Table></div> : null}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
