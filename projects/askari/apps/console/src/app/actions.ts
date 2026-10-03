"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, describeError } from "@/lib/api";
import { clearSession, writeSession } from "@/lib/session";
import { toCents } from "@/lib/format";
import { currentBranchId, setBranchCookie } from "@/lib/branch";

export interface FormState {
  error: string | null;
  ok: string | null;
  /** something to show once, such as a new person's PIN */
  secret?: string | null;
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) => text(form, key) || undefined;
const refresh = () => revalidatePath("/console", "layout");
async function run(work: () => Promise<string | { ok: string; secret?: string }>): Promise<FormState> {
  try {
    const out = await work();
    refresh();
    return typeof out === "string" ? { error: null, ok: out } : { error: null, ok: out.ok, secret: out.secret ?? null };
  } catch (caught) {
    return { error: describeError(caught), ok: null };
  }
}

// ---- sign in and sign up ----

export interface LoginState { error: string | null }

export async function signIn(_previous: LoginState, form: FormData): Promise<LoginState> {
  const phone = text(form, "phone");
  const pin = text(form, "pin");
  if (!phone || !pin) return { error: "Enter both your phone number and PIN." };
  try {
    const result = await api.login({ phone, pin });
    await writeSession({ token: result.token, displayName: result.displayName, role: result.role }, result.expiresInSeconds);
  } catch (caught) {
    return { error: describeError(caught) };
  }
  redirect("/console");
}

export async function signOut(): Promise<void> {
  await clearSession();
  redirect("/login");
}

export interface SignupState { error: string | null; pending: { id: string; delivery: string; phone: string; expiresInMinutes: number } | null }
export interface VerifyState { error: string | null; notice: string | null }

export async function requestSignup(_previous: SignupState, form: FormData): Promise<SignupState> {
  const businessName = text(form, "businessName");
  const contactName = text(form, "contactName");
  const phone = text(form, "phone");
  if (!businessName || !contactName || !phone) return { error: "Business name, your name and phone number are required.", pending: null };
  const count = Number.parseInt(text(form, "expectedGuards"), 10);
  try {
    const result = await api.signup({
      businessName, contactName, phone,
      expectedGuards: Number.isFinite(count) && count >= 0 ? count : undefined,
      registrationNo: optional(form, "registrationNo"),
      sample: form.get("sample") === "on"
    });
    return { error: null, pending: { id: result.id, delivery: result.delivery, phone, expiresInMinutes: result.expiresInMinutes } };
  } catch (caught) {
    return { error: describeError(caught), pending: null };
  }
}

export async function verifySignup(_previous: VerifyState, form: FormData): Promise<VerifyState> {
  const pin = text(form, "pin");
  if (pin !== text(form, "confirm")) return { error: "The two PINs are not the same.", notice: null };
  if (!/^\d{6}$/.test(pin)) return { error: "Choose a PIN of exactly six digits.", notice: null };
  try {
    const result = await api.verifySignup({ id: text(form, "id"), code: text(form, "code"), pin });
    await writeSession({ token: result.token, displayName: result.displayName, role: result.role }, result.expiresInSeconds);
  } catch (caught) {
    return { error: describeError(caught), notice: null };
  }
  redirect("/console/get-started");
}

export async function resendSignupCode(_previous: VerifyState, form: FormData): Promise<VerifyState> {
  try {
    await api.resendCode(text(form, "id"));
    return { error: null, notice: "A new code is on its way." };
  } catch (caught) {
    return { error: describeError(caught), notice: null };
  }
}


const num = (form: FormData, key: string) => { const v = text(form, key); return v === "" ? undefined : Number(v); };
const int = (form: FormData, key: string) => { const v = num(form, key); return v === undefined ? undefined : Math.round(v); };
const bp = (form: FormData, key: string) => { const v = num(form, key); return v === undefined ? undefined : Math.round(v * 100); };
const fix = (form: FormData) => {
  const lat = Number(text(form, "lat"));
  const lng = Number(text(form, "lng"));
  if (!text(form, "lat") || !text(form, "lng") || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  const acc = Number(text(form, "acc"));
  return { lat, lng, ...(Number.isFinite(acc) && text(form, "acc") ? { accuracyM: acc } : {}) };
};
const inBranch = async <T extends object>(body: T): Promise<T & { branchId?: string }> => { const id = await currentBranchId(); return id ? { ...body, branchId: id } : body; };

export async function chooseBranch(form: FormData): Promise<void> {
  const id = String(form.get("branchId") ?? "");
  await setBranchCookie(id);
  refresh();
}

// ---- guards ----
export async function addGuard(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const g = await api.send<{ guardNo: string; fullName: string }>("POST", "/v1/guards", await inBranch({
      fullName: text(form, "fullName"), phone: optional(form, "phone") ?? null, nationalId: optional(form, "nationalId") ?? null, psraRegNo: optional(form, "psraRegNo") ?? null,
      psraExpiry: optional(form, "psraExpiry") ?? null, nssfNo: optional(form, "nssfNo") ?? null, shaNo: optional(form, "shaNo") ?? null, kraPin: optional(form, "kraPin") ?? null,
      restWeekday: text(form, "restWeekday") === "" ? null : Number(text(form, "restWeekday")), hiredOn: optional(form, "hiredOn")
    }));
    return `${g.fullName} added as ${g.guardNo}.`;
  });
}
export async function updateGuard(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("PATCH", `/v1/guards/${text(form, "id")}`, {
      fullName: text(form, "fullName"), phone: optional(form, "phone") ?? null, nationalId: optional(form, "nationalId") ?? null, psraRegNo: optional(form, "psraRegNo") ?? null,
      psraExpiry: optional(form, "psraExpiry") ?? null, nssfNo: optional(form, "nssfNo") ?? null, shaNo: optional(form, "shaNo") ?? null, kraPin: optional(form, "kraPin") ?? null,
      restWeekday: text(form, "restWeekday") === "" ? null : Number(text(form, "restWeekday")), hiredOn: optional(form, "hiredOn")
    });
    return "Saved.";
  });
}
export async function setGuardPay(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("PUT", `/v1/guards/${text(form, "id")}/pay`, { monthlyBasicCents: toCents(form.get("basic")), allowanceCents: toCents(form.get("allowance")) });
    return "Pay saved. The change is on the audit trail.";
  });
}
export async function resetGuardPin(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ pin: string; phone: string }>("POST", `/v1/guards/${text(form, "id")}/pin`, {});
    return { ok: `The guard signs in with ${out.phone} and this PIN. It is shown once:`, secret: out.pin };
  });
}
export async function exitGuard(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ shiftsOpened: number }>("POST", `/v1/guards/${text(form, "id")}/exit`, { exitedOn: text(form, "exitedOn") });
    return `Recorded as left. ${out.shiftsOpened} future shift(s) are open again.`;
  });
}
export async function reinstateGuard(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("POST", `/v1/guards/${text(form, "id")}/reinstate`, {}); return "Back on the active list."; });
}

// ---- clients, sites, posts, checkpoints, rates ----
export async function addClient(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", "/v1/clients", { name: text(form, "name"), contactName: optional(form, "contactName") ?? null, contactPhone: optional(form, "contactPhone") ?? null, contactEmail: optional(form, "contactEmail") ?? null, kraPin: optional(form, "kraPin") ?? null, paymentTermsDays: int(form, "paymentTermsDays") });
    return "Client added.";
  });
}
export async function updateClient(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("PATCH", `/v1/clients/${text(form, "id")}`, { name: text(form, "name"), contactName: optional(form, "contactName") ?? null, contactPhone: optional(form, "contactPhone") ?? null, contactEmail: optional(form, "contactEmail") ?? null, kraPin: optional(form, "kraPin") ?? null, paymentTermsDays: int(form, "paymentTermsDays"), ...(optional(form, "status") ? { status: text(form, "status") } : {}) });
    return "Saved.";
  });
}
export async function setPortalLink(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const enabled = text(form, "enabled") === "true";
    const out = await api.send<{ token: string | null }>("PUT", `/v1/clients/${text(form, "id")}/portal`, { enabled });
    return enabled ? { ok: "The client's private link (anyone with it can see the attendance summary; making a new one stops the old):", secret: `/portal/${out.token}` } : "Link switched off.";
  });
}
export async function addSite(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const lat = num(form, "siteLat");
    const lng = num(form, "siteLng");
    await api.send("POST", "/v1/sites", await inBranch({ clientId: text(form, "clientId"), name: text(form, "name"), address: optional(form, "address") ?? null, lat: lat ?? null, lng: lng ?? null, geofenceM: int(form, "geofenceM") ?? null, roundsPerShift: int(form, "roundsPerShift") ?? 0, checkpointsOrdered: form.get("ordered") === "on", postName: optional(form, "postName") }));
    return "Site added.";
  });
}
export async function updateSite(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const lat = num(form, "siteLat");
    const lng = num(form, "siteLng");
    await api.send("PATCH", `/v1/sites/${text(form, "id")}`, { name: text(form, "name"), address: optional(form, "address") ?? null, lat: lat ?? null, lng: lng ?? null, geofenceM: int(form, "geofenceM") ?? null, roundsPerShift: int(form, "roundsPerShift") ?? 0, checkpointsOrdered: form.get("ordered") === "on", ...(optional(form, "active") ? { active: text(form, "active") === "true" } : {}) });
    return "Saved.";
  });
}
export async function addPost(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("POST", `/v1/sites/${text(form, "siteId")}/posts`, { name: text(form, "name"), guardsRequired: int(form, "guardsRequired") }); return "Post added."; });
}
export async function addCheckpoint(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("POST", `/v1/sites/${text(form, "siteId")}/checkpoints`, { name: text(form, "name") }); return "Checkpoint added. Print its QR from the QR page."; });
}
export async function rotateCheckpoint(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("POST", `/v1/checkpoints/${text(form, "id")}/rotate`, {}); return "New QR made. The old one no longer works: reprint it."; });
}
export async function toggleCheckpoint(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("PATCH", `/v1/checkpoints/${text(form, "id")}`, { active: text(form, "active") === "true" }); return "Saved."; });
}
export async function addRate(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", `/v1/sites/${text(form, "siteId")}/rates`, { postId: optional(form, "postId") ?? null, basis: text(form, "basis"), amountCents: toCents(form.get("amount")), effectiveFrom: text(form, "effectiveFrom") });
    return "Rate added. Earlier rates stay for earlier days.";
  });
}

// ---- roster ----
export async function addTemplate(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("POST", "/v1/shift-templates", { name: text(form, "name"), startTime: text(form, "startTime"), endTime: text(form, "endTime") }); return "Shift pattern added."; });
}
export async function addShift(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const guard = optional(form, "guard") ? await guardByQuery(text(form, "guard")) : null;
    await api.send("POST", "/v1/shifts", { siteId: text(form, "siteId"), postId: text(form, "postId"), guardId: guard?.id ?? null, date: text(form, "date"), templateId: optional(form, "templateId") });
    return "Shift added.";
  });
}
export async function bulkShifts(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const days = form.getAll("weekdays").map((d) => Number(d));
    const guard = optional(form, "guard") ? await guardByQuery(text(form, "guard")) : null;
    const out = await api.send<{ created: number; skipped: { date: string; reason: string }[] }>("POST", "/v1/shifts/bulk", { siteId: text(form, "siteId"), postId: text(form, "postId"), templateId: text(form, "templateId"), from: text(form, "from"), to: text(form, "to"), guardId: guard?.id ?? null, ...(days.length ? { weekdays: days } : {}) });
    return `Created ${out.created} shift(s).${out.skipped.length ? ` Skipped ${out.skipped.length}: ${out.skipped.slice(0, 3).map((s) => `${s.date} (${s.reason})`).join("; ")}` : ""}`;
  });
}
/** A guard is picked by number or name typed in; exactly one active guard must match, so nobody is put on a shift by accident. */
async function guardByQuery(query: string): Promise<{ id: string; fullName: string }> {
  const found = await api.get<{ items: { id: string; fullName: string; guardNo: string }[] }>(`/v1/guards?status=active&pageSize=5&q=${encodeURIComponent(query)}`);
  const exact = found.items.filter((g) => g.guardNo.toLowerCase() === query.toLowerCase());
  const hit = exact.length === 1 ? exact[0]! : found.items.length === 1 ? found.items[0]! : null;
  if (!hit) throw new Error(found.items.length === 0 ? `No active guard matches "${query}".` : `More than one guard matches "${query}". Use the guard number (like G0012).`);
  return hit;
}
export async function assignGuard(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const who = text(form, "guard");
    const guard = who ? await guardByQuery(who) : null;
    await api.send("PUT", `/v1/shifts/${text(form, "shiftId")}/guard`, { guardId: guard?.id ?? null });
    return guard ? `Assigned ${guard.fullName}.` : "Shift opened up.";
  });
}
export async function cancelShift(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("POST", `/v1/shifts/${text(form, "shiftId")}/cancel`, { reason: text(form, "reason") }); return "Shift cancelled."; });
}
export async function publishRoster(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { const out = await api.send<{ published: number }>("POST", "/v1/roster/publish", await inBranch({ from: text(form, "from"), to: text(form, "to") })); return `Published ${out.published} shift(s).`; });
}
export async function requestSwap(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { const to = await guardByQuery(text(form, "guard")); await api.send("POST", "/v1/swaps", { shiftId: text(form, "shiftId"), toGuardId: to.id, reason: optional(form, "reason") }); return "Swap requested. Someone else must approve it."; });
}
export async function decideSwap(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("POST", `/v1/swaps/${text(form, "id")}/decision`, { decision: text(form, "decision"), note: optional(form, "note") }); return "Decision recorded."; });
}
export async function approveOvertime(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("PUT", `/v1/shifts/${text(form, "shiftId")}/overtime`, { minutes: int(form, "minutes") ?? 0, note: optional(form, "note") }); return "Overtime recorded."; });
}

// ---- attendance and patrol ----
export async function checkShift(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ geofence: string; distanceM: number | null }>("POST", `/v1/shifts/${text(form, "shiftId")}/check`, { kind: text(form, "kind"), fix: fix(form) ?? null });
    const where = out.geofence === "within" ? "on site" : out.geofence === "outside" ? `FLAGGED: ${out.distanceM} m from the site` : "location not available";
    return `${text(form, "kind") === "in" ? "Checked in" : "Checked out"} (${where}).`;
  });
}
export async function overrideAttendance(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    // the person types a local (Nairobi) time; the API wants an absolute instant
    const when = new Date(`${text(form, "when")}:00+03:00`).toISOString();
    const out = await api.send<{ note: string | null }>("POST", `/v1/shifts/${text(form, "shiftId")}/override`, { kind: text(form, "kind"), effectiveAt: when, reason: text(form, "reason") });
    return `Correction recorded; the original stays on record.${out.note ? ` ${out.note}` : ""}`;
  });
}
export async function scanCheckpoint(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ checkpoint: string; geofence: string }>("POST", "/v1/patrol/scan", { token: text(form, "token"), shiftId: text(form, "shiftId"), fix: fix(form) ?? null });
    return `Scanned ${out.checkpoint}${out.geofence === "outside" ? " (FLAGGED: outside the site)" : ""}.`;
  });
}

// ---- a guard on their own phone: no session, their phone number and PIN are the credential ----
export async function guardSelf(_p: FormState, form: FormData): Promise<FormState> {
  try {
    const body = { phone: text(form, "phone"), pin: text(form, "pin"), fix: fix(form) ?? null };
    const mode = text(form, "mode");
    if (mode === "scan") {
      const out = await api.publicPost<{ checkpoint: string; geofence: string }>("/v1/guard/scan", { ...body, token: text(form, "token") });
      return { error: null, ok: `Scanned ${out.checkpoint}${out.geofence === "outside" ? " (you appear to be away from the site)" : ""}.` };
    }
    const out = await api.publicPost<{ kind: string; site: string; geofence: string }>("/v1/guard/check", { ...body, kind: mode === "out" ? "out" : "in" });
    return { error: null, ok: `${out.kind === "in" ? "Checked in" : "Checked out"} at ${out.site}${out.geofence === "outside" ? ". You appear to be away from the site: your supervisor will see that." : "."}` };
  } catch (caught) {
    return { error: describeError(caught), ok: null };
  }
}

// ---- incidents ----
export async function reportIncident(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ incidentNo: string }>("POST", "/v1/incidents", { siteId: text(form, "siteId"), guardId: optional(form, "guardId") ?? null, severity: text(form, "severity"), category: text(form, "category"), narrative: text(form, "narrative") });
    return `Filed as ${out.incidentNo}. It cannot be edited; add notes to follow up.`;
  });
}
export async function incidentNote(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("POST", `/v1/incidents/${text(form, "id")}/notes`, { kind: text(form, "kind") || "note", body: text(form, "body") }); return "Noted."; });
}

// ---- payroll ----
export async function saveTable(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const kind = text(form, "kind");
    const money = (k: string) => (text(form, k) === "" ? null : toCents(form.get(k)));
    let config: Record<string, unknown>;
    if (kind === "nssf") config = { employeeRateBp: bp(form, "employeeRate") ?? 0, employerRateBp: bp(form, "employerRate") ?? 0, upperLimitCents: money("upperLimit") };
    else if (kind === "sha") config = { employeeRateBp: bp(form, "employeeRate") ?? 0, employerRateBp: bp(form, "employerRate") ?? 0, minCents: money("min") ?? 0, maxCents: money("max") };
    else if (kind === "housing") config = { employeeRateBp: bp(form, "employeeRate") ?? 0, employerRateBp: bp(form, "employerRate") ?? 0 };
    else {
      const bands = text(form, "bands").split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
        const [upTo, rate] = line.split(",").map((x) => x.trim());
        if (!rate || Number.isNaN(Number(rate))) throw new Error(`Each band is "upper limit in KES, rate in %" such as "24000,10". Check: ${line}`);
        return { upToCents: /^(rest|\*|)$/i.test(upTo ?? "") ? null : Math.round(Number(upTo!.replace(/,/g, "")) * 100), rateBp: Math.round(Number(rate) * 100) };
      });
      config = { bands, personalReliefCents: toCents(form.get("relief")), taxableDeducts: form.getAll("taxable").map(String) };
    }
    await api.send("PUT", `/v1/payroll/tables/${kind}`, { config });
    return "Saved as your own figures. Confirm them once you have checked them against the official schedule.";
  });
}
export async function loadIllustrative(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("POST", `/v1/payroll/tables/${text(form, "kind")}/illustrative`, {}); return "Illustrative figures loaded. They are UNVERIFIED: check and confirm before they are used."; });
}
export async function confirmTable(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("POST", `/v1/payroll/tables/${text(form, "kind")}/${text(form, "mode") === "na" ? "not-applicable" : "confirm"}`, { note: text(form, "note") }); return "Recorded with your name."; });
}
export async function runPayroll(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ summary: { guards: number; belowMinimum: number }; unresolvedShifts: number }>("POST", `/v1/payroll/periods/${text(form, "month")}/run`, {});
    return `Computed ${out.summary.guards} payslip(s). ${out.summary.belowMinimum} below the minimum. ${out.unresolvedShifts} shift(s) have no check-out.`;
  });
}
export async function closePayroll(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("POST", `/v1/payroll/periods/${text(form, "month")}/close`, optional(form, "acknowledge") ? { acknowledge: text(form, "acknowledge") } : {}); return "Month closed for good."; });
}
export async function addAdjustment(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const sign = text(form, "direction") === "minus" ? -1 : 1;
    await api.send("POST", "/v1/payroll/adjustments", { guardId: text(form, "guardId"), effectiveMonth: text(form, "effectiveMonth"), amountCents: sign * toCents(form.get("amount")), kind: text(form, "kind"), reason: text(form, "reason"), ...(optional(form, "relatedMonth") ? { relatedMonth: text(form, "relatedMonth") } : {}) });
    return "Adjustment recorded. It is paid in the month you chose.";
  });
}
export async function addHoliday(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("POST", "/v1/holidays", { day: text(form, "day"), name: text(form, "name") }); return "Holiday added."; });
}
export async function removeHoliday(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("DELETE", `/v1/holidays/${text(form, "day")}`); return "Holiday removed."; });
}

// ---- invoices and money ----
export async function generateInvoice(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ number: string; totalCents: number; notVerified: number; noRate: number }>("POST", "/v1/invoices", { clientId: text(form, "clientId"), month: text(form, "month") });
    return `Invoice ${out.number} issued. ${out.notVerified} shift(s) without verified attendance and ${out.noRate} without a rate were left off.`;
  });
}
export async function creditNote(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("POST", `/v1/invoices/${text(form, "id")}/credit`, { amountCents: toCents(form.get("amount")), reason: text(form, "reason") }); return "Credit note issued."; });
}
export async function invoiceEvent(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => { await api.send("POST", `/v1/invoices/${text(form, "id")}/events`, { kind: text(form, "kind"), body: text(form, "body") }); return "Recorded."; });
}
export async function recordPayment(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ allocatedCents: number; onAccountCents: number }>("POST", "/v1/payments", { clientId: text(form, "clientId"), amountCents: toCents(form.get("amount")), receivedOn: text(form, "receivedOn"), method: text(form, "method"), reference: optional(form, "reference") ?? null });
    return `Payment recorded.${out.onAccountCents > 0 ? ` KSh ${out.onAccountCents / 100} is held on account and will go to the next invoice.` : ""}`;
  });
}

// ---- settings ----
export async function saveSettings(_p: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const orNull = (k: string) => (text(form, k) === "" ? null : int(form, k));
    await api.send("PATCH", "/v1/settings", {
      minWageCents: toCents(form.get("minWage")), allowancesCountTowardMin: form.get("allowancesCount") === "on", standardMonthlyHours: int(form, "standardMonthlyHours"),
      overtimeMultiplierBp: bp(form, "overtimeMultiplier") !== undefined ? Math.round(Number(text(form, "overtimeMultiplier")) * 10_000) : undefined,
      restDayMultiplierBp: Math.round(Number(text(form, "restDayMultiplier")) * 10_000), holidayMultiplierBp: Math.round(Number(text(form, "holidayMultiplier")) * 10_000),
      checkinEarlyMinutes: int(form, "checkinEarly"), lateGraceMinutes: int(form, "lateGrace"), missedAfterMinutes: int(form, "missedAfter"), defaultGeofenceM: int(form, "geofence"),
      maxHoursPerWeek: orNull("maxHours"), minRestHours: orNull("minRest"), billBasis: text(form, "billBasis") || undefined, psraLicenceNo: optional(form, "psraLicenceNo") ?? null
    });
    return "Settings saved.";
  });
}

export async function addPerson(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ phone: string; pin: string }>("POST", "/v1/team", { displayName: text(form, "displayName"), phone: text(form, "phone"), role: text(form, "role"), branchId: optional(form, "branchId") ?? null, staffNo: optional(form, "staffNo") ?? null });
    return { ok: `Added. Give ${out.phone} this PIN now - it is shown once:`, secret: out.pin };
  });
}
export async function resetPersonPin(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ pin: string }>("POST", `/v1/team/${text(form, "id")}/reset-pin`, {});
    return { ok: "New PIN - it is shown once:", secret: out.pin };
  });
}
export async function setPersonStatus(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("PATCH", `/v1/team/${text(form, "id")}`, { status: text(form, "status") });
    return text(form, "status") === "disabled" ? "Access removed." : "Access restored.";
  });
}
export async function addBranch(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", "/v1/branches", { name: text(form, "name") });
    return "Branch added.";
  });
}
export async function changePin(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    if (text(form, "newPin") !== text(form, "confirm")) throw new Error("The two PINs are not the same.");
    await api.send("POST", "/v1/auth/pin", { currentPin: text(form, "currentPin"), newPin: text(form, "newPin") });
    return "PIN changed.";
  });
}
export async function simulatePayment(_previous: FormState, _form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", "/v1/billing/mock-payment", {});
    return "Payment recorded (simulated).";
  });
}
