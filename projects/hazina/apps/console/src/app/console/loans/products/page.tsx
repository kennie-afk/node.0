import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can } from "@/lib/roles";
import { saveLoanProduct, setLoanProductActive } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { LoanProduct } from "@/lib/types";
import { Badge, Card, EmptyState, Field, PageHeader, Table, cell, inputClass, num, rowClass, secondaryButtonClass, selectClass } from "@/components/ui";
import { bp, ksh } from "@/lib/format";

export default async function Products() {
  const role = (await readSession())?.role ?? "";
  const products = await api.get<LoanProduct[]>("/v1/loan-products?all=true");
  const write = can(role, "products_write");
  return (
    <>
      <PageHeader title="Loan products" subtitle="A loan copies the terms of its product when it is applied for, so changing a product later never changes a loan already made." />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          {products.length === 0 ? <EmptyState message="No loan products yet." detail={write ? "Add the first one on the right." : "A manager or owner sets these up."} /> : (
            <Table head={["Product", "Rate", "Amount", "Term", "Fees", "Penalty", "Rules", ""]}>
              {products.map((p) => (
                <tr key={p.id} className={rowClass}>
                  <td className={cell}><div className="font-medium">{p.name}</div><div className="text-[0.6875rem] text-[var(--color-faint)]">{p.method === "flat" ? "Flat" : "Reducing balance"} {p.active ? "" : <Badge value="disabled" />}</div></td>
                  <td className={num}>{bp(p.annualRateBp)} a year</td>
                  <td className={num}>{ksh(p.minAmountCents)} – {ksh(p.maxAmountCents)}</td>
                  <td className={num}>{p.minTermMonths}–{p.maxTermMonths} mo</td>
                  <td className={num}>{bp(p.processingFeeBp)} + {bp(p.insuranceFeeBp)}</td>
                  <td className={num}>{bp(p.penaltyRateBp)} after {p.graceDays}d</td>
                  <td className={`${cell} text-[0.75rem] text-[var(--color-muted)]`}>{p.maxMultipleOfSavings ? `Up to ${p.maxMultipleOfSavings}× savings. ` : ""}{p.guarantorsRequired ? `${p.guarantorsRequired} guarantor(s).` : ""}</td>
                  <td className={cell}>{write ? <ActionForm action={setLoanProductActive} submit={p.active ? "Disable" : "Enable"} button={secondaryButtonClass} className="flex"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={p.active ? "false" : "true"} /></ActionForm> : null}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        {write ? (
          <Card title="Add a loan product" description="Percentages are entered as percentages: 18 means 18%.">
            <ActionForm action={saveLoanProduct} submit="Add product">
              <Field label="Name"><input name="name" required placeholder="Development loan" className={inputClass} /></Field>
              <Field label="Interest method"><select name="method" defaultValue="reducing" className={selectClass}><option value="reducing">Reducing balance</option><option value="flat">Flat</option></select></Field>
              <Field label="Interest per year (%)"><input name="annualRate" inputMode="decimal" required defaultValue="12" className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Smallest loan (KSh)"><input name="minAmount" inputMode="decimal" defaultValue="1000" className={inputClass} /></Field><Field label="Largest loan (KSh)"><input name="maxAmount" inputMode="decimal" required className={inputClass} /></Field></div>
              <div className="grid grid-cols-2 gap-2"><Field label="Shortest term (months)"><input name="minTerm" inputMode="numeric" defaultValue="1" className={inputClass} /></Field><Field label="Longest term (months)"><input name="maxTerm" inputMode="numeric" required defaultValue="12" className={inputClass} /></Field></div>
              <div className="grid grid-cols-2 gap-2"><Field label="Processing fee (%)"><input name="processingFee" inputMode="decimal" defaultValue="0" className={inputClass} /></Field><Field label="Insurance fee (%)"><input name="insuranceFee" inputMode="decimal" defaultValue="0" className={inputClass} /></Field></div>
              <div className="grid grid-cols-2 gap-2"><Field label="Penalty on overdue (% a month)"><input name="penaltyRate" inputMode="decimal" defaultValue="0" className={inputClass} /></Field><Field label="Grace days"><input name="graceDays" inputMode="numeric" defaultValue="0" className={inputClass} /></Field></div>
              <div className="grid grid-cols-2 gap-2"><Field label="Max × savings (0 = none)"><input name="maxMultiple" inputMode="numeric" defaultValue="0" className={inputClass} /></Field><Field label="Guarantors needed"><input name="guarantors" inputMode="numeric" defaultValue="0" className={inputClass} /></Field></div>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
