"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, describeError } from "@/lib/api";
import { clearSession, writeSession } from "@/lib/session";
import { toCents } from "@/lib/format";
import type { MemberPage, Preview } from "@/lib/types";

export interface FormState {
  error: string | null;
  ok: string | null;
  /** something to show once, such as a new person's PIN */
  secret?: string | null;
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) => text(form, key) || undefined;
const refresh = () => revalidatePath("/console", "layout");
async function fileBase64(form: FormData, key: string): Promise<{ name: string; base64: string }> {
  const file = form.get(key);
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file first.");
  return { name: file.name, base64: Buffer.from(await file.arrayBuffer()).toString("base64") };
}

/** A member is found by the number printed on their card and quoted on M-Pesa, never by an internal id typed by a person. */
async function memberByNo(memberNo: string): Promise<{ id: string; memberNo: string; fullName: string }> {
  const wanted = memberNo.trim().toUpperCase();
  if (!wanted) throw new Error("Enter the member number.");
  const found = await api.get<MemberPage>(`/v1/members?search=${encodeURIComponent(wanted)}&limit=10`);
  const hit = found.items.find((m) => m.memberNo.toUpperCase() === wanted);
  if (!hit) throw new Error(`No member ${wanted}.`);
  return hit;
}

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
  const count = Number.parseInt(text(form, "expectedMembers"), 10);
  const kind = text(form, "kind") === "lender" ? "lender" : "sacco";
  try {
    const result = await api.signup({
      businessName, contactName, phone, kind,
      expectedMembers: Number.isFinite(count) && count >= 0 ? count : undefined,
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

// ---- members and savings ----

export async function addMember(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const member = await api.send<{ memberNo: string; fullName: string }>("POST", "/v1/members", {
      fullName: text(form, "fullName"), idNumber: optional(form, "idNumber") ?? null, phone: optional(form, "phone") ?? null,
      kraPin: optional(form, "kraPin") ?? null, dateOfBirth: optional(form, "dateOfBirth") ?? null,
      gender: optional(form, "gender") ?? null, employer: optional(form, "employer") ?? null, occupation: optional(form, "occupation") ?? null,
      nextOfKin: { name: optional(form, "kinName"), phone: optional(form, "kinPhone"), relationship: optional(form, "kinRelationship") },
      branchId: optional(form, "branchId") ?? null
    });
    return `${member.fullName} registered as ${member.memberNo}. This is the account number they quote on M-Pesa.`;
  });
}

export async function setMemberStatus(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("PATCH", `/v1/members/${text(form, "id")}`, { status: text(form, "status") });
    return "Saved.";
  });
}

export async function importMembers(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const file = await fileBase64(form, "file");
    const out = await api.send<{ created: number; openingBalanceCents: number; note: string | null }>("POST", "/v1/members/import", { contentBase64: file.base64, branchId: optional(form, "branchId") ?? null });
    return `Imported ${out.created} member(s).${out.note ? ` ${out.note}` : ""}`;
  });
}

export async function postDeposit(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const member = await memberByNo(text(form, "memberNo"));
    await api.send("POST", "/v1/savings/deposit", {
      memberId: member.id, product: text(form, "product") || "savings", amountCents: toCents(form.get("amount")), channel: text(form, "channel") || "cash",
      reference: optional(form, "reference") ?? null
    });
    return `Deposit for ${member.fullName} (${member.memberNo}) recorded.`;
  });
}

export async function requestWithdrawal(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const member = await memberByNo(text(form, "memberNo"));
    const out = await api.send<{ status: string }>("POST", "/v1/savings/withdraw", {
      memberId: member.id, amountCents: toCents(form.get("amount")), channel: text(form, "channel") || "cash", reference: optional(form, "reference") ?? null
    });
    return out.status === "pending_approval" ? "That is above the approval limit. It is waiting for a manager or owner who did not request it." : `Withdrawal for ${member.fullName} paid out and recorded.`;
  });
}

export async function decideWithdrawal(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const approve = text(form, "decision") === "approve";
    await api.send("POST", `/v1/savings/${text(form, "id")}/decision`, { approve, note: optional(form, "note") });
    return approve ? "Approved and paid out." : "Rejected.";
  });
}

// ---- loans ----

export async function saveLoanProduct(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const rate = (key: string) => Math.round(Number(text(form, key) || "0") * 100);
    const int = (key: string) => Number.parseInt(text(form, key) || "0", 10);
    await api.send("POST", "/v1/loan-products", {
      name: text(form, "name"), method: text(form, "method") || "reducing", annualRateBp: rate("annualRate"),
      minAmountCents: toCents(form.get("minAmount")), maxAmountCents: toCents(form.get("maxAmount")),
      minTermMonths: int("minTerm") || 1, maxTermMonths: int("maxTerm") || 12,
      processingFeeBp: rate("processingFee"), insuranceFeeBp: rate("insuranceFee"), penaltyRateBp: rate("penaltyRate"),
      graceDays: int("graceDays"), maxMultipleOfSavings: int("maxMultiple"), guarantorsRequired: int("guarantors")
    });
    return "Loan product added. Loans copy its terms when they are applied for.";
  });
}

export async function setLoanProductActive(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("PATCH", `/v1/loan-products/${text(form, "id")}`, { active: text(form, "active") === "true" });
    return "Saved.";
  });
}

export async function previewLoan(input: { productId: string; principalCents: number; termMonths: number }): Promise<{ error: string | null; preview: Preview | null }> {
  try {
    return { error: null, preview: await api.send<Preview>("POST", "/v1/loans/preview", input) };
  } catch (caught) {
    return { error: describeError(caught), preview: null };
  }
}

export async function applyForLoan(_previous: FormState, form: FormData): Promise<FormState> {
  let loanId: string;
  try {
    const member = await memberByNo(text(form, "memberNo"));
    const guarantors: { memberId: string; guaranteedCents: number }[] = [];
    for (let i = 1; i <= 3; i += 1) {
      const no = text(form, `guarantorNo${i}`);
      if (!no) continue;
      guarantors.push({ memberId: (await memberByNo(no)).id, guaranteedCents: toCents(form.get(`guarantorAmount${i}`)) });
    }
    const out = await api.send<{ id: string }>("POST", "/v1/loans", {
      memberId: member.id, productId: text(form, "productId"), principalCents: toCents(form.get("principal")),
      termMonths: Number.parseInt(text(form, "termMonths"), 10), purpose: optional(form, "purpose") ?? null, guarantors
    });
    loanId = out.id;
  } catch (caught) {
    return { error: describeError(caught), ok: null };
  }
  refresh();
  redirect(`/console/loans/${loanId}`);
}

export async function appraiseLoan(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const recommended = toCents(form.get("recommended"));
    await api.send("POST", `/v1/loans/${text(form, "id")}/appraise`, {
      monthlyIncomeCents: toCents(form.get("income")), monthlyExpensesCents: toCents(form.get("expenses")), otherDebtServiceCents: toCents(form.get("debt")),
      recommendation: text(form, "recommendation"), ...(recommended > 0 ? { recommendedCents: recommended } : {}), notes: optional(form, "notes")
    });
    return "Appraisal recorded. A manager or owner who did not apply for or appraise this loan can now decide it.";
  });
}

export async function decideLoan(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const approve = text(form, "decision") === "approve";
    await api.send("POST", `/v1/loans/${text(form, "id")}/decision`, { approve, note: optional(form, "note") });
    return approve ? "Approved. It can now be paid out." : "Declined.";
  });
}

export async function disburseLoan(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", `/v1/loans/${text(form, "id")}/disburse`, {
      channel: text(form, "channel") || "cash", reference: optional(form, "reference") ?? null, firstDueDate: optional(form, "firstDueDate")
    });
    return "Paid out. The repayment schedule is now fixed.";
  });
}

export async function repayLoan(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ penaltyCents: number; interestCents: number; principalCents: number; unappliedCents: number }>("POST", `/v1/loans/${text(form, "id")}/repay`, {
      amountCents: toCents(form.get("amount")), channel: text(form, "channel") || "cash", reference: optional(form, "reference") ?? null
    });
    const k = (c: number) => `KSh ${(c / 100).toLocaleString("en-KE")}`;
    return `Recorded: penalty ${k(out.penaltyCents)}, interest ${k(out.interestCents)}, principal ${k(out.principalCents)}${out.unappliedCents ? `, ${k(out.unappliedCents)} held unapplied` : ""}.`;
  });
}

export async function writeOffLoan(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", `/v1/loans/${text(form, "id")}/write-off`, { note: text(form, "note") });
    return "Written off. It stays on record, and any later recovery is recorded against it.";
  });
}

export async function restructureLoan(_previous: FormState, form: FormData): Promise<FormState> {
  let newId: string;
  try {
    const rate = text(form, "newRate");
    const out = await api.send<{ id: string }>("POST", `/v1/loans/${text(form, "id")}/restructure`, {
      newTermMonths: Number.parseInt(text(form, "newTerm"), 10), ...(rate ? { newAnnualRateBp: Math.round(Number(rate) * 100) } : {}),
      ...(text(form, "newMethod") ? { newMethod: text(form, "newMethod") } : {}), note: text(form, "note")
    });
    newId = out.id;
  } catch (caught) {
    return { error: describeError(caught), ok: null };
  }
  refresh();
  redirect(`/console/loans/${newId}`);
}

export async function runPenalties(_previous: FormState, _form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ charged: number; totalCents: number }>("POST", "/v1/penalties/run", {});
    return out.charged === 0 ? "Nothing new to charge today (a second run in the same month adds nothing)." : `${out.charged} instalment(s) charged, KSh ${(out.totalCents / 100).toLocaleString("en-KE")} in penalties.`;
  });
}

// ---- M-Pesa ----

export async function assignPayment(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const target = text(form, "target").toUpperCase().replace(/\s+/g, "");
    if (!target) throw new Error("Enter a loan number (L00001) or a member number (M00001).");
    const body = target.startsWith("L") ? { type: "loan", loanNo: target } : { type: text(form, "product") || "savings", memberNo: target };
    await api.send("POST", `/v1/mpesa/payments/${text(form, "id")}/assign`, { target: body, note: optional(form, "note") });
    return "Assigned and posted.";
  });
}

export async function ignorePayment(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", `/v1/mpesa/payments/${text(form, "id")}/ignore`, { note: text(form, "note") });
    return "Set aside, with your note on record.";
  });
}

export async function simulateMpesa(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ outcome: { status: string; note: string | null } | null }>("POST", "/v1/mpesa/simulate", {
      billRef: text(form, "billRef"), amountCents: toCents(form.get("amount"))
    });
    return out.outcome?.status === "applied" ? "Simulated payment arrived and was matched." : `Simulated payment arrived but was not matched${out.outcome?.note ? `: ${out.outcome.note}` : "."}`;
  });
}

// ---- ledger ----

export async function addAccount(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", "/v1/accounts", { code: text(form, "code"), name: text(form, "name"), type: text(form, "type") });
    return "Account added.";
  });
}

export async function setAccountActive(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("PATCH", `/v1/accounts/${text(form, "id")}`, { active: text(form, "active") === "true" });
    return "Saved.";
  });
}

export async function postJournal(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const lines: { accountCode: string; debitCents?: number; creditCents?: number }[] = [];
    for (let i = 1; i <= 4; i += 1) {
      const code = text(form, `code${i}`);
      if (!code) continue;
      const debitCents = toCents(form.get(`debit${i}`));
      const creditCents = toCents(form.get(`credit${i}`));
      lines.push({ accountCode: code, ...(debitCents ? { debitCents } : {}), ...(creditCents ? { creditCents } : {}) });
    }
    const out = await api.send<{ seq: number }>("POST", "/v1/journal", { entryDate: text(form, "entryDate"), memo: text(form, "memo"), lines });
    return `Journal entry ${out.seq} posted.`;
  });
}

export async function reverseJournal(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ seq: number }>("POST", `/v1/journal/${text(form, "id")}/reverse`, { memo: text(form, "memo") });
    return `Reversed by entry ${out.seq}.`;
  });
}

// ---- returns ----

export async function generateReturn(_previous: FormState, form: FormData): Promise<FormState> {
  let id: string;
  try {
    const out = await api.send<{ id: string }>("POST", "/v1/returns", { templateId: text(form, "templateId"), from: text(form, "from"), to: text(form, "to") });
    id = out.id;
  } catch (caught) {
    return { error: describeError(caught), ok: null };
  }
  refresh();
  redirect(`/console/returns/${id}`);
}

export async function addReturnTemplate(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    let definition: unknown;
    try {
      definition = JSON.parse(text(form, "definition"));
    } catch {
      throw new Error("The definition is not valid JSON.");
    }
    const out = await api.send<{ code: string; version: number }>("POST", "/v1/returns/templates", { code: text(form, "code"), name: text(form, "name"), definition });
    return `Template ${out.code} saved as version ${out.version}. Earlier versions stay for the returns already made with them.`;
  });
}

// ---- intake (heuristic flags for a person to read) ----

export async function uploadStatement(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const file = await fileBase64(form, "file");
    const out = await api.send<{ rows: number; flags: unknown[] }>("POST", "/v1/intake/statement", { memberId: text(form, "memberId"), filename: file.name, contentBase64: file.base64 });
    return `Read ${out.rows} transaction(s) and raised ${out.flags.length} flag(s) for you to look at. This is arithmetic on the file, not a verification of it.`;
  });
}

export async function payslipCheck(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const deductions: { name: string; amountCents: number }[] = [];
    for (let i = 1; i <= 4; i += 1) {
      const name = text(form, `dName${i}`);
      if (name) deductions.push({ name, amountCents: toCents(form.get(`dAmount${i}`)) });
    }
    const out = await api.send<{ flags: unknown[] }>("POST", "/v1/intake/payslip", {
      memberId: text(form, "memberId"), grossCents: toCents(form.get("gross")), netCents: toCents(form.get("net")), deductions, month: optional(form, "month") ?? null
    });
    return out.flags.length ? `${out.flags.length} flag(s) for you to look at (below).` : "The payslip adds up. That does not make it genuine.";
  });
}

export async function idCheck(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ flags: unknown[] }>("POST", "/v1/intake/national-id", { memberId: text(form, "memberId"), idNumber: text(form, "idNumber") });
    return out.flags.length ? `${out.flags.length} flag(s) for you to look at (below).` : "No format flags. That does not verify the ID.";
  });
}

export async function capacityCheck(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ fits: boolean; indicativeCapacityCents: number; note: string }>("POST", "/v1/intake/capacity", { uploadId: text(form, "uploadId"), instalmentCents: toCents(form.get("instalment")) });
    return `${out.fits ? "Within" : "Above"} the indicative ceiling of KSh ${(out.indicativeCapacityCents / 100).toLocaleString("en-KE")} a month. ${out.note}`;
  });
}

// ---- settings, team and branches ----

export async function saveSettings(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("PATCH", "/v1/settings", {
      makerChecker: text(form, "makerChecker") || undefined, withdrawalApprovalCents: toCents(form.get("withdrawalApproval")),
      capacityShareBp: Math.round(Number(text(form, "capacityShare") || "30") * 100), financialYearStartMonth: Number.parseInt(text(form, "fyMonth") || "1", 10)
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
    await api.send("POST", "/v1/branches", { name: text(form, "name"), paybillNumber: optional(form, "paybillNumber") ?? null });
    return "Branch added.";
  });
}
export async function setPaybill(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("PATCH", `/v1/branches/${text(form, "id")}`, { paybillNumber: optional(form, "paybillNumber") ?? null });
    return "Saved.";
  });
}

// ---- billing ----

export async function simulatePayment(): Promise<void> {
  await api.send("POST", "/v1/billing/mock-payment", {});
  refresh();
}
export async function changePin(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    if (text(form, "newPin") !== text(form, "confirm")) throw new Error("The two PINs are not the same.");
    await api.send("POST", "/v1/auth/pin", { currentPin: text(form, "currentPin"), newPin: text(form, "newPin") });
    return "PIN changed.";
  });
}
