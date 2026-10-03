import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { ksh, localToday, clock, WEEKDAYS } from "@/lib/format";
import type { Guard, Page, Shift } from "@/lib/types";
import { exitGuard, reinstateGuard, resetGuardPin, setGuardPay, updateGuard } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, EmptyState, Field, KeyValue, PageHeader, Table, cell, dangerButtonClass, inputClass, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";

export default async function GuardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = (await readSession())!;
  let g: Guard;
  try { g = await api.get<Guard>(`/v1/guards/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const from = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const shifts = await api.get<Page<Shift>>(`/v1/shifts?from=${from}&to=${to}&guardId=${id}&pageSize=60`);
  const write = can(session.role, "guards_write");
  return (
    <>
      <PageHeader title={g.fullName} subtitle={`${g.guardNo} · ${g.branch} · ${g.status === "active" ? `employed since ${g.hiredOn}` : `left on ${g.exitedOn}`}`} />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card title="Details" description="Typed by your firm. Sojaa does not check any of these numbers against PSRA, NSSF, SHA or KRA.">
            {write ? (
              <ActionForm action={updateGuard} submit="Save">
                <input type="hidden" name="id" value={g.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Full name"><input name="fullName" defaultValue={g.fullName} required className={inputClass} /></Field>
                  <Field label="Phone"><input name="phone" defaultValue={g.phone ?? ""} className={inputClass} /></Field>
                  <Field label="National ID"><input name="nationalId" defaultValue={g.nationalId ?? ""} className={inputClass} /></Field>
                  <Field label="PSRA registration"><input name="psraRegNo" defaultValue={g.psraRegNo ?? ""} className={inputClass} /></Field>
                  <Field label="PSRA expiry"><input name="psraExpiry" type="date" defaultValue={g.psraExpiry ?? ""} className={inputClass} /></Field>
                  <Field label="NSSF no."><input name="nssfNo" defaultValue={g.nssfNo ?? ""} className={inputClass} /></Field>
                  <Field label="SHA no."><input name="shaNo" defaultValue={g.shaNo ?? ""} className={inputClass} /></Field>
                  <Field label="KRA PIN"><input name="kraPin" defaultValue={g.kraPin ?? ""} className={inputClass} /></Field>
                  <Field label="Rest day"><select name="restWeekday" defaultValue={g.restWeekday ?? ""} className={selectClass}><option value="">None recorded</option>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>
                  <Field label="Hired on"><input name="hiredOn" type="date" defaultValue={g.hiredOn} className={inputClass} /></Field>
                </div>
              </ActionForm>
            ) : <KeyValue items={[["National ID", g.nationalId ?? "–"], ["PSRA registration", g.psraRegNo ?? "–"], ["PSRA expiry", g.psraExpiry ?? "–"], ["NSSF", g.nssfNo ?? "–"], ["SHA", g.shaNo ?? "–"], ["KRA PIN", g.kraPin ?? "–"]]} />}
          </Card>
          <Card title="Shifts, two weeks either side">
            {shifts.items.length === 0 ? <EmptyState message="No shifts in this window." /> : (
              <Table head={["Day", "Time", "Site and post", ""]}>{shifts.items.map((s) => (<tr key={s.id} className={rowClass}><td className={cell}>{s.day}</td><td className={cell}>{clock(s.startAt)}–{clock(s.endAt)}</td><td className={cell}>{s.site} · {s.post}</td><td className={cell}>{s.day > localToday() ? <Badge value="upcoming" /> : null}</td></tr>))}</Table>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-5">
          {can(session.role, "salary_view") ? (
            <Card title="Pay" description="Monthly basic and fixed allowances. Every change goes on the audit trail.">
              <p className="mb-3 text-[0.875rem]">Basic {g.monthlyBasicCents ? ksh(g.monthlyBasicCents) : "not set"} · allowance {ksh(g.allowanceCents ?? 0)}</p>
              {can(session.role, "rates_write") ? (
                <ActionForm action={setGuardPay} submit="Save pay">
                  <input type="hidden" name="id" value={g.id} />
                  <Field label="Monthly basic (KES)"><input name="basic" type="number" min={0} step="0.01" defaultValue={(g.monthlyBasicCents ?? 0) / 100} className={inputClass} /></Field>
                  <Field label="Fixed allowances (KES)"><input name="allowance" type="number" min={0} step="0.01" defaultValue={(g.allowanceCents ?? 0) / 100} className={inputClass} /></Field>
                </ActionForm>
              ) : null}
            </Card>
          ) : null}
          {write ? (
            <Card title="Check-in PIN" description={g.hasPin ? "This guard can check in alone at /guard." : "No PIN yet."}>
              <ActionForm action={resetGuardPin} submit={g.hasPin ? "Make a new PIN" : "Make a PIN"} button={secondaryButtonClass}><input type="hidden" name="id" value={g.id} /></ActionForm>
            </Card>
          ) : null}
          {write ? (
            <Card title={g.status === "active" ? "Leaving" : "Left"}>
              {g.status === "active" ? (
                <ActionForm action={exitGuard} submit="Record as left" button={dangerButtonClass}><input type="hidden" name="id" value={g.id} /><Field label="Last day"><input name="exitedOn" type="date" defaultValue={localToday()} required className={inputClass} /></Field><p className="text-[0.75rem] text-[var(--color-muted)]">Future shifts become open; past records stay.</p></ActionForm>
              ) : <ActionForm action={reinstateGuard} submit="Reinstate" button={secondaryButtonClass}><input type="hidden" name="id" value={g.id} /></ActionForm>}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
