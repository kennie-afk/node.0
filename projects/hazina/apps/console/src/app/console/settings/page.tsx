import { api } from "@/lib/api";
import { saveSettings } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { Settings } from "@/lib/types";
import { Card, EmptyState, Field, PageHeader, Table, cell, inputClass, rowClass, selectClass } from "@/components/ui";
import { dayTime, label } from "@/lib/format";

interface AuditEvent { id: number; action: string; entity: string; detail: unknown; at: string }
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function SettingsPage() {
  const [s, audit] = await Promise.all([api.get<Settings>("/v1/settings"), api.get<{ items: AuditEvent[] }>("/v1/audit?limit=40").then((p) => p.items).catch(() => [] as AuditEvent[])]);
  const sacco = s.organisation.kind === "sacco";
  return (
    <>
      <PageHeader title="Settings" subtitle={`${s.organisation.name} · ${sacco ? "SACCO" : "non-bank lender"}`} />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Rules" description="Owner only.">
          <ActionForm action={saveSettings} submit="Save settings">
            <Field label="Who may check their own work" hint="Strict: the person who applied for, appraised or requested something can never also approve it. Relaxed lets the owner do so, and the audit trail records that they did."><select name="makerChecker" defaultValue={s.settings.makerChecker} className={selectClass}><option value="strict">Strict</option><option value="relaxed">Relaxed (owner only)</option></select></Field>
            {sacco ? <Field label="Withdrawals needing approval from (KSh)" hint="At or above this amount, a withdrawal waits for a manager or owner who did not request it."><input name="withdrawalApproval" inputMode="decimal" defaultValue={s.settings.withdrawalApprovalCents / 100} className={inputClass} /></Field> : <input type="hidden" name="withdrawalApproval" value="0" />}
            <Field label="Instalment ceiling (% of average monthly inflow)" hint="Used only by the statement check, as arithmetic to compare an instalment with. It is not a lending rule."><input name="capacityShare" inputMode="decimal" defaultValue={s.settings.capacityShareBp / 100} className={inputClass} /></Field>
            <Field label="Loan loss provision (% of exposure, by days late)" hint="ILLUSTRATIVE placeholders, NOT regulatory guidance: set them with your accountant. Used by the month-end provision run under Ledger.">
              <div className="grid grid-cols-3 gap-2">{["current", "1-30", "31-60", "61-90", "91-180", "180+"].map((b) => <label key={b} className="flex flex-col gap-1 text-[0.6875rem] text-[var(--color-muted)]">{b === "current" ? "Not late" : `${b} days`}<input name={`prov_${b}`} inputMode="decimal" defaultValue={(s.settings.provisionRatesBp?.[b] ?? 0) / 100} className={inputClass} /></label>)}</div>
            </Field>
            <Field label="Financial year starts in"><select name="fyMonth" defaultValue={s.settings.financialYearStartMonth} className={selectClass}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
          </ActionForm>
        </Card>
        <Card title="Recent activity" description="Who did what, newest first. This log cannot be edited.">
          {audit.length === 0 ? <EmptyState message="Nothing yet." /> : (
            <Table head={["When", "Action", "On"]}>
              {audit.map((e) => <tr key={e.id} className={rowClass}><td className={`${cell} text-[var(--color-muted)]`}>{dayTime(e.at)}</td><td className={`${cell} font-mono text-[0.75rem]`}>{e.action}</td><td className={cell}>{label(e.entity)}</td></tr>)}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
