import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { ksh } from "@/lib/format";
import type { SettingsView } from "@/lib/types";
import { saveSettings } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Card, Field, Notice, PageHeader, inputClass, selectClass } from "@/components/ui";

export default async function SettingsPage() {
  const session = (await readSession())!;
  if (!can(session.role, "settings")) redirect("/console");
  const view = await api.get<SettingsView>("/v1/settings");
  const s = view.settings;
  return (
    <>
      <PageHeader title="Settings" subtitle="Every wage and hours figure here is yours to set and to answer for." />
      <div className="mb-5"><Notice tone="warn"><strong>Not legal advice.</strong> The minimum wage starts at {ksh(3_000_000)}, the figure in the High Court ruling the research found (2025); the current Regulation of Wages order may differ and may change. The overtime, rest-day and holiday multipliers and the monthly-hours divisor are placeholders: Sojaa has not verified any of them. Roster hour and rest limits start switched off because Sojaa states no legal limit. Check each against the law and your contracts.</Notice></div>
      <ActionForm action={saveSettings} submit="Save settings" className="flex flex-col gap-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Wages (yours to confirm)">
            <div className="flex flex-col gap-3">
              <Field label="Monthly minimum wage (KES)"><input name="minWage" type="number" step="0.01" min={0} defaultValue={s.minWageCents / 100} className={inputClass} /></Field>
              <label className="flex items-center gap-2 text-[0.8125rem]"><input type="checkbox" name="allowancesCount" defaultChecked={s.allowancesCountTowardMin} /> Fixed allowances count toward the minimum (a legal question: off unless you know)</label>
              <Field label="Standard hours in a month" hint="Turns monthly pay into an hourly rate for overtime and premiums. Placeholder."><input name="standardMonthlyHours" type="number" min={50} max={400} defaultValue={s.standardMonthlyHours} className={inputClass} /></Field>
              <div className="grid grid-cols-3 gap-2"><Field label="Overtime ×"><input name="overtimeMultiplier" type="number" step="0.01" min={1} defaultValue={s.overtimeMultiplierBp / 10_000} className={inputClass} /></Field><Field label="Rest day ×"><input name="restDayMultiplier" type="number" step="0.01" min={1} defaultValue={s.restDayMultiplierBp / 10_000} className={inputClass} /></Field><Field label="Holiday ×"><input name="holidayMultiplier" type="number" step="0.01" min={1} defaultValue={s.holidayMultiplierBp / 10_000} className={inputClass} /></Field></div>
              <Field label="Your PSRA licence number" hint="Typed, not verified."><input name="psraLicenceNo" defaultValue={view.organisation.psraLicenceNo ?? ""} className={inputClass} /></Field>
            </div>
          </Card>
          <Card title="Attendance">
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2"><Field label="Check-in opens (min before)"><input name="checkinEarly" type="number" min={0} defaultValue={s.checkinEarlyMinutes} className={inputClass} /></Field><Field label="Late after (min)"><input name="lateGrace" type="number" min={0} defaultValue={s.lateGraceMinutes} className={inputClass} /></Field><Field label="Missed after (min)"><input name="missedAfter" type="number" min={5} defaultValue={s.missedAfterMinutes} className={inputClass} /></Field></div>
              <Field label="Default allowed distance from a site (m)"><input name="geofence" type="number" min={20} defaultValue={s.defaultGeofenceM} className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Maximum scheduled hours a week" hint="Blank = not enforced."><input name="maxHours" type="number" min={1} max={168} defaultValue={s.maxHoursPerWeek ?? ""} className={inputClass} /></Field><Field label="Minimum rest between shifts (h)" hint="Blank = not enforced."><input name="minRest" type="number" min={1} max={24} defaultValue={s.minRestHours ?? ""} className={inputClass} /></Field></div>
              <Field label="Invoices bill" hint="Scheduled: the whole scheduled shift when the guard was there for (nearly) all of it. Actual: only the minutes between check-in and check-out."><select name="billBasis" defaultValue={s.billBasis} className={selectClass}><option value="scheduled">Scheduled hours of verified shifts</option><option value="actual">Verified minutes only</option></select></Field>
            </div>
          </Card>
          <Card title="Leave and absence (your choice)">
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2"><Field label="Annual leave days a year" hint="Placeholder 21: check your contracts and the Employment Act."><input name="annualLeaveDays" type="number" min={0} max={366} defaultValue={s.annualLeaveDays} className={inputClass} /></Field><Field label="Sick leave days a year" hint="Blank = no limit."><input name="sickLeaveDays" type="number" min={0} max={366} defaultValue={s.sickLeaveDays ?? ""} className={inputClass} /></Field></div>
              <Field label="Absence deduction" hint="Off by default: leave is recorded but pay does not change. Deductions use calendar-day proration of basic pay and allowances. Sojaa does not say whether you may deduct; that is your contract and the law."><select name="absenceDeduction" defaultValue={s.absenceDeduction} className={selectClass}><option value="off">Off: never reduce pay for absence</option><option value="unpaid_leave">Deduct approved unpaid leave</option><option value="unpaid_leave_and_missed">Deduct unpaid leave and days with a missed shift</option></select></Field>
            </div>
          </Card>
        </div>
      </ActionForm>
    </>
  );
}
