"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, describeError } from "@/lib/api";
import { clearSession, writeSession } from "@/lib/session";
import { ksh, toCents } from "@/lib/format";
import type { Customer, Page, Product, ScanResult, Supplier } from "@/lib/types";
import type { PickOption } from "@/components/picker";
import { bq, currentBranchId, setBranchCookie } from "@/lib/branch";

export interface FormState {
  error: string | null;
  ok: string | null;
  /** something to show once, such as a new person's PIN */
  secret?: string | null;
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) => text(form, key) || undefined;
const refresh = () => revalidatePath("/console", "layout");
async function inBranch<T extends object>(body: T): Promise<T & { branchId?: string }> {
  const id = await currentBranchId();
  return id ? { ...body, branchId: id } : body;
}

export async function chooseBranch(form: FormData): Promise<void> {
  const id = String(form.get("branchId") ?? "");
  if (id) await setBranchCookie(id);
  refresh();
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
  const count = Number.parseInt(text(form, "branchCount"), 10);
  try {
    const result = await api.signup({ businessName, contactName, phone, branchCount: Number.isFinite(count) ? count : undefined });
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

// ---- catalogue ----

export async function saveProduct(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const body = {
      name: text(form, "name"),
      genericName: optional(form, "genericName") ?? null,
      strength: optional(form, "strength") ?? null,
      form: optional(form, "form") ?? null,
      packSize: optional(form, "packSize") ?? null,
      gtin: optional(form, "gtin") ?? null,
      category: text(form, "category") || "otc",
      reorderLevel: Number.parseInt(text(form, "reorderLevel") || "0", 10),
      listPriceCents: toCents(form.get("price"))
    };
    const id = optional(form, "id");
    await api.send(id ? "PATCH" : "POST", id ? `/v1/products/${id}` : "/v1/products", body);
    return id ? "Saved." : `${body.name} added.`;
  });
}

export async function addSupplier(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", "/v1/suppliers", { name: text(form, "name"), phone: optional(form, "phone") ?? null });
    return "Supplier added.";
  });
}

// ---- stock ----

export interface ReceiveLine { productId: string; batchNo: string; expiryDate: string; qty: number; unitCostCents: number; serials?: string[] }
export async function receiveDelivery(input: { branchId?: string; supplierId: string; invoiceNumber: string; invoiceDate: string; dueDate?: string; lines: ReceiveLine[]; witness?: { phone: string; pin: string } }): Promise<FormState & { warnings?: string[] }> {
  try {
    const result = await api.send<{ totalCents: number; warnings: string[] }>("POST", "/v1/stock/receive", await inBranch(input));
    refresh();
    return { error: null, ok: `Received ${input.lines.length} line(s).`, warnings: result.warnings };
  } catch (caught) {
    return { error: describeError(caught), ok: null };
  }
}

export async function adjustBatch(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const witnessPhone = optional(form, "witnessPhone");
    await api.send("POST", "/v1/stock/adjust", await inBranch({
      batchId: text(form, "batchId"),
      kind: text(form, "kind"),
      qtyDelta: Number.parseInt(text(form, "qtyDelta"), 10),
      reason: text(form, "reason"),
      ...(witnessPhone ? { witness: { phone: witnessPhone, pin: text(form, "witnessPin") } } : {})
    }));
    return "Stock updated.";
  });
}

// ---- selling (called straight from the till screen) ----

export async function searchProducts(query: string): Promise<Product[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  const result = await api.get<{ items: Product[] }>(`/v1/products?search=${encodeURIComponent(q)}&limit=12`);
  return result.items;
}

export async function scanCode(input: string): Promise<{ error: string | null; result: ScanResult | null }> {
  try {
    return { error: null, result: await api.send<ScanResult>("POST", "/v1/scan", await inBranch({ input })) };
  } catch (caught) {
    return { error: describeError(caught), result: null };
  }
}

export interface SaleSubmission {
  customerId?: string;
  lines: { productId: string; qty?: number; serials?: string[]; dispensing?: Record<string, unknown> }[];
  payments: { method: "cash" | "mpesa" | "credit"; amountCents: number; externalRef?: string }[];
  discountCents?: number;
  discountReason?: string;
  witness?: { phone: string; pin: string };
}
export interface SaleOutcome { error: string | null; sale: { saleId: string; number: string; status: string; totalCents: number; paidCents: number; dueCents: number; changeCents: number } | null }

export async function submitSale(input: SaleSubmission): Promise<SaleOutcome> {
  try {
    const sale = await api.send<NonNullable<SaleOutcome["sale"]>>("POST", "/v1/sales", await inBranch(input));
    refresh();
    return { error: null, sale };
  } catch (caught) {
    return { error: describeError(caught), sale: null };
  }
}

export async function addSalePayment(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const method = text(form, "method");
    await api.send("POST", `/v1/sales/${text(form, "saleId")}/payments`, { method, amountCents: toCents(form.get("amount")), ...(method === "mpesa" ? { externalRef: text(form, "ref") } : {}) });
    return "Payment recorded.";
  });
}

export async function voidSaleAction(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", `/v1/sales/${text(form, "saleId")}/void`, { reason: text(form, "reason") });
    return "Sale voided and the stock put back.";
  });
}

export async function returnLine(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ refundCents: number; restocked: boolean }>("POST", `/v1/sales/${text(form, "saleId")}/returns`, {
      lineId: text(form, "lineId"), qty: Number.parseInt(text(form, "qty"), 10), reason: text(form, "reason"), refundMethod: text(form, "refundMethod") || "cash", restock: form.get("restock") === "on"
    });
    return `Refund KSh ${(out.refundCents / 100).toLocaleString("en-KE")} ${out.restocked ? "- put back on the shelf." : "- not restocked."}`;
  });
}

// ---- stock-take, day close, payables ----

export async function startStocktake(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", "/v1/stocktake", await inBranch({ note: optional(form, "note") }));
    return "Stock-take started.";
  });
}
export async function saveCounts(id: string, counts: { batchId: string; countedQty: number }[]): Promise<FormState> {
  return run(async () => {
    await api.send("PUT", `/v1/stocktake/${id}/counts`, { counts });
    return `Saved ${counts.length} count(s).`;
  });
}
export async function approveStocktake(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const witnessPhone = optional(form, "witnessPhone");
    const out = await api.send<{ batchesAdjusted: number; netUnits: number }>("POST", `/v1/stocktake/${text(form, "id")}/approve`, {
      skipUncounted: form.get("skipUncounted") === "on",
      ...(witnessPhone ? { witness: { phone: witnessPhone, pin: text(form, "witnessPin") } } : {})
    });
    return `Approved: ${out.batchesAdjusted} batch(es) adjusted, net ${out.netUnits} unit(s).`;
  });
}
export async function cancelStocktake(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", `/v1/stocktake/${text(form, "id")}/cancel`, {});
    return "Stock-take cancelled.";
  });
}

export async function closeDayAction(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const counts: { cashierId: string; countedCashCents: number }[] = [];
    for (const [key, value] of form.entries()) if (key.startsWith("count:")) counts.push({ cashierId: key.slice(6), countedCashCents: toCents(value) });
    const out = await api.send<{ cashVarianceCents: number }>("POST", "/v1/close", await inBranch({ day: text(form, "day"), counts, note: optional(form, "note") }));
    const v = out.cashVarianceCents;
    return v === 0 ? "Day closed. The cash matches." : `Day closed. Cash is ${v < 0 ? "short" : "over"} by KSh ${(Math.abs(v) / 100).toLocaleString("en-KE")}.`;
  });
}

export async function paySupplier(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", `/v1/payables/${text(form, "id")}/payments`, { amountCents: toCents(form.get("amount")), method: text(form, "method") || "cash", reference: optional(form, "reference") });
    return "Payment recorded.";
  });
}

// ---- customers ----

export async function addCustomer(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", "/v1/customers", { name: text(form, "name"), phone: optional(form, "phone") ?? null, creditLimitCents: toCents(form.get("limit")) });
    return "Customer added.";
  });
}
export async function customerPayment(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", `/v1/customers/${text(form, "id")}/payments`, { amountCents: toCents(form.get("amount")), method: text(form, "method") || "cash", reference: optional(form, "reference") });
    return "Payment recorded.";
  });
}

// ---- team and branches ----

export async function addPerson(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ phone: string; pin: string }>("POST", "/v1/team", { displayName: text(form, "displayName"), phone: text(form, "phone"), role: text(form, "role"), branchId: optional(form, "branchId") ?? null, licenceNo: optional(form, "licenceNo") ?? null });
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
    await api.send("POST", "/v1/branches", { name: text(form, "name"), tillNumber: optional(form, "tillNumber") ?? null });
    return "Branch added. Your next invoice will include it.";
  });
}
export async function setTill(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("PATCH", `/v1/branches/${text(form, "id")}`, { tillNumber: optional(form, "tillNumber") ?? null });
    return "Saved.";
  });
}

// ---- billing and first hour ----

export async function simulatePayment(): Promise<void> {
  await api.send("POST", "/v1/billing/mock-payment", {});
  refresh();
}
export async function loadSample(): Promise<void> {
  await api.send("POST", "/v1/onboarding/sample-data", {});
  refresh();
}
export async function removeSample(): Promise<void> {
  await api.send("POST", "/v1/onboarding/sample-data/hide", {});
  refresh();
}
export async function changePin(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    if (text(form, "newPin") !== text(form, "confirm")) throw new Error("The two PINs are not the same.");
    await api.send("POST", "/v1/auth/pin", { currentPin: text(form, "currentPin"), newPin: text(form, "newPin") });
    return "PIN changed.";
  });
}

// ---- pickers: search as you type, never a list of everything ----

export async function pickProducts(query: string): Promise<PickOption[]> {
  const q = query.trim();
  if (!q) return [];
  const found = await api.get<Page<Product>>(`/v1/products?search=${encodeURIComponent(q)}&limit=12`);
  return found.items.map((p) => ({ id: p.id, label: p.name, hint: [p.strength, p.form].filter(Boolean).join(" "), meta: p.category }));
}
export async function pickSuppliers(query: string): Promise<PickOption[]> {
  const q = query.trim();
  if (!q) return [];
  const found = await api.get<Page<Supplier>>(`/v1/suppliers?search=${encodeURIComponent(q)}&limit=12`);
  return found.items.map((s) => ({ id: s.id, label: s.name }));
}
export async function pickCustomers(query: string): Promise<PickOption[]> {
  const q = query.trim();
  if (!q) return [];
  const found = await api.get<Page<Customer>>(`/v1/customers?search=${encodeURIComponent(q)}&limit=8`);
  return found.items.map((c) => ({ id: c.id, label: c.name, hint: c.creditLimitCents ? `owes ${ksh(c.balanceCents)} of ${ksh(c.creditLimitCents)}` : c.phone ?? "" }));
}

// ---- unmatched M-Pesa ----

/** The manager types the number of the sale the money belongs to; the till's own record supplies the amount. */
export async function claimPayment(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const number = text(form, "saleNumber");
    const found = await api.get<Page<{ id: string; number: string; status: string }>>(`/v1/sales${await bq()}${(await bq()) ? "&" : "?"}q=${encodeURIComponent(number)}&limit=5`);
    const sale = found.items.find((s) => s.number.toLowerCase() === number.toLowerCase());
    if (!sale) throw new Error(`No sale numbered ${number} at this branch.`);
    const out = await api.send<{ paidCents: number; dueCents: number }>("POST", `/v1/mpesa/unmatched/${encodeURIComponent(text(form, "ref"))}/claim`, { saleId: sale.id });
    return out.dueCents > 0 ? `Applied to ${sale.number}. KSh ${(out.dueCents / 100).toLocaleString("en-KE")} is still due on it.` : `Applied to ${sale.number}. It is paid in full.`;
  });
}

// ---- customers' terms, price lists ----

export async function saveCustomerTerms(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("PATCH", `/v1/customers/${text(form, "id")}`, {
      creditLimitCents: toCents(form.get("limit")),
      priceListId: optional(form, "priceListId") ?? null,
      active: form.get("active") === "on"
    });
    return "Terms saved.";
  });
}
export async function createPriceList(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", "/v1/price-lists", { name: text(form, "name") });
    return "Price list created.";
  });
}
export async function setPriceItem(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const product = text(form, "productId");
    if (!product) throw new Error("Search for the product first.");
    await api.send("PUT", `/v1/price-lists/${text(form, "listId")}/items`, { productId: product, priceCents: toCents(form.get("price")) });
    return "Price saved.";
  });
}
export async function removePriceItem(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("DELETE", `/v1/price-lists/${text(form, "listId")}/items/${text(form, "productId")}`);
    return "Removed from the list.";
  });
}

// ---- suppliers, purchase orders, returns, credit, voids ----

export async function updateSupplierAction(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("PATCH", `/v1/suppliers/${text(form, "id")}`, { name: text(form, "name"), phone: optional(form, "phone") ?? null, active: form.get("active") === "on" });
    return "Supplier saved.";
  });
}

export interface OrderLineInput { productId: string; qty: number; unitCostCents: number }
export async function createOrder(input: { supplierId: string; expectedDate?: string; note?: string; lines: OrderLineInput[] }): Promise<FormState & { id?: string }> {
  try {
    const out = await api.send<{ id: string; number: string }>("POST", "/v1/purchase-orders", await inBranch(input));
    refresh();
    return { error: null, ok: `Order ${out.number} raised.`, id: out.id };
  } catch (caught) {
    return { error: describeError(caught), ok: null };
  }
}
export async function receiveOrder(input: { orderId: string; invoiceNumber: string; invoiceDate: string; dueDate?: string; lines: { lineId: string; batchNo: string; expiryDate: string; qty: number; unitCostCents?: number }[]; witness?: { phone: string; pin: string } }): Promise<FormState> {
  try {
    const { orderId, ...body } = input;
    const out = await api.send<{ purchaseOrderStatus: string; warnings: string[] }>("POST", `/v1/purchase-orders/${orderId}/receive`, await inBranch(body));
    refresh();
    return { error: null, ok: `Delivery booked. The order is ${out.purchaseOrderStatus}.${out.warnings.length ? ` Watch: ${out.warnings.join(" ")}` : ""}` };
  } catch (caught) {
    return { error: describeError(caught), ok: null };
  }
}
export async function cancelOrder(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", `/v1/purchase-orders/${text(form, "id")}/cancel`, { reason: text(form, "reason") });
    return "Order cancelled.";
  });
}
export async function creditNoteAction(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ balanceCents: number }>("POST", "/v1/credit-notes", { invoiceId: text(form, "id"), amountCents: toCents(form.get("amount")), noteNumber: optional(form, "noteNumber") ?? null, reason: text(form, "reason") });
    return `Credit recorded. KSh ${(out.balanceCents / 100).toLocaleString("en-KE")} is still owed on the invoice.`;
  });
}
export async function voidInvoiceAction(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("POST", `/v1/payables/${text(form, "id")}/void`, { reason: text(form, "reason") });
    return "Invoice voided and its stock taken back out. Enter the corrected invoice under the same number.";
  });
}
export async function setBatchStatusAction(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await api.send("PATCH", `/v1/stock/batches/${text(form, "batchId")}/status`, await inBranch({ status: text(form, "status"), reason: text(form, "reason") }));
    return text(form, "status") === "available" ? "Back on sale." : "Held: it will not be sold.";
  });
}
export async function returnToSupplierAction(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const invoiceId = optional(form, "invoiceId");
    const credit = toCents(form.get("credit"));
    const witnessPhone = optional(form, "witnessPhone");
    await api.send("POST", "/v1/supplier-returns", await inBranch({
      batchId: text(form, "batchId"), qty: Number.parseInt(text(form, "qty"), 10), reason: text(form, "reason"),
      ...(invoiceId && credit > 0 ? { credit: { invoiceId, amountCents: credit, noteNumber: optional(form, "noteNumber") ?? null } } : {}),
      ...(witnessPhone ? { witness: { phone: witnessPhone, pin: text(form, "witnessPin") } } : {})
    }));
    return "Returned to the supplier.";
  });
}
export async function writeOffExpiredAction(_previous: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const out = await api.send<{ batches: number; units: number; valueCents: number; skippedControlled: unknown[] }>("POST", "/v1/stock/writeoff-expired", await inBranch({ reason: optional(form, "reason") ?? "Expired stock written off" }));
    const skipped = out.skippedControlled.length;
    return `Wrote off ${out.units} unit(s) in ${out.batches} batch(es), KSh ${(out.valueCents / 100).toLocaleString("en-KE")} at cost.${skipped ? ` ${skipped} controlled batch(es) need a witnessed write-off one by one.` : ""}`;
  });
}
