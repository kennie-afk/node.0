import { api } from "@/lib/api";
import { bq } from "@/lib/branch";
import { claimPayment } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Pager } from "@/components/pager";
import type { Unmatched } from "@/lib/types";
import { Card, EmptyState, Field, Notice, PageHeader, Table, inputClass, rowClass } from "@/components/ui";
import { dayTime, ksh } from "@/lib/format";
import { PAGE, href, whole } from "@/lib/paging";

export default async function MpesaUnmatched({ searchParams }: { searchParams: Promise<{ offset?: string }> }) {
  const { offset: rawOffset } = await searchParams;
  const offset = whole(rawOffset);
  const branch = await bq();
  const page = await api.get<Unmatched>(`/v1/mpesa/unmatched${branch}${branch ? "&" : "?"}limit=${PAGE}&offset=${offset}`);
  return (
    <>
      <PageHeader title="M-Pesa payments waiting" subtitle="Money that reached your till and could not be matched to a sale on its own: the customer typed a different reference, or the amount did not fit one sale." />
      {page.total > 0 ? <div className="mb-4"><Notice tone="warn">{page.total} payment{page.total === 1 ? " is" : "s are"} waiting. The money reached your till but is on no sale yet, so the day's M-Pesa total is short until you match it.</Notice></div> : null}
      <Card title={`${page.total} waiting`} description="Type the number of the sale the customer was paying for. The amount and the payer come from the till's own record.">
        {page.items.length === 0 ? <EmptyState message="Nothing is waiting." detail="Every payment that reached the till is on a sale." /> : (
          <>
            <Table head={["Received", "Code", "Amount", "From", "Reference typed", "Put against sale"]}>
              {page.items.map((u) => (
                <tr key={u.externalRef} className={`${rowClass} align-top`}>
                  <td className="px-3.5 py-2.5 text-[var(--color-muted)]">{dayTime(u.receivedAt)}</td>
                  <td className="px-3.5 py-2.5 font-mono text-[0.75rem]">{u.externalRef}</td>
                  <td className="px-3.5 py-2.5 font-medium tabular-nums">{ksh(u.amountCents)}</td>
                  <td className="px-3.5 py-2.5">{u.payerMsisdn ?? "—"}</td>
                  <td className="px-3.5 py-2.5">{u.reference || "—"}</td>
                  <td className="px-3.5 py-2.5">
                    <ActionForm action={claimPayment} submit="Apply" className="flex items-end gap-2">
                      <input type="hidden" name="ref" value={u.externalRef} />
                      <Field label="Sale number"><input name="saleNumber" required placeholder="e.g. NBI-261004-0007" className={`${inputClass} !mt-1 w-44`} /></Field>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </Table>
            <Pager from={offset} count={page.items.length} noun="payments" prev={offset > 0 ? href("/console/mpesa", { offset: Math.max(0, offset - PAGE) }) : null} next={page.hasMore ? href("/console/mpesa", { offset: offset + PAGE }) : null} />
          </>
        )}
      </Card>
    </>
  );
}
