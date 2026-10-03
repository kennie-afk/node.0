import { api } from "@/lib/api";
import { bq } from "@/lib/branch";
import { closeDayAction } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { CloseRow, ClosePreview } from "@/lib/types";
import { Card, EmptyState, Field, PageHeader, Stat, Table, inputClass, rowClass } from "@/components/ui";
import { day, ksh } from "@/lib/format";

export default async function Close() {
  const q = await bq();
  const [preview, history] = await Promise.all([api.get<ClosePreview>(`/v1/close/preview${q}`), api.get<CloseRow[]>(`/v1/close${q}`)]);
  return (
    <>
      <PageHeader title="Close the day" subtitle={`Count each person's cash and compare it with what the system expects. ${day(preview.day)}.`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sales" value={String(preview.salesCount)} hint={preview.voidsCount ? `${preview.voidsCount} voided` : undefined} tone="accent" />
        <Stat label="Cash expected" value={ksh(preview.expectedCashCents)} tone="accent" />
        <Stat label="M-Pesa" value={ksh(preview.mpesaCents)} tone="accent" />
        <Stat label="Waiting for payment" value={ksh(preview.pendingCents)} tone={preview.pendingCents ? "warn" : "good"} hint="goods released, money not yet in" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title={preview.closed ? "This day is closed" : "Count the cash"}>
          {preview.closed ? (() => {
            const done = history.find((h) => h.day === preview.day);
            return (
              <div className="text-[0.8125rem]">
                <p className="text-[var(--color-muted)]">Nothing more can be added to this day. Tomorrow starts a new one.</p>
                {done ? (
                  <p className="mt-3">Closed by {done.closedBy}: expected {ksh(done.expectedCashCents)}, counted {ksh(done.countedCashCents)} —{" "}
                    <strong className={done.cashVarianceCents === 0 ? "text-[var(--color-good)]" : done.cashVarianceCents < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-warn)]"}>
                      {done.cashVarianceCents === 0 ? "the cash matches." : `${done.cashVarianceCents < 0 ? "short" : "over"} by ${ksh(Math.abs(done.cashVarianceCents))}.`}
                    </strong></p>
                ) : null}
              </div>
            );
          })() : preview.cashiers.length === 0 ? <EmptyState message="No cash was taken today." detail="You can still close the day." /> : null}
          {!preview.closed ? (
            <ActionForm action={closeDayAction} submit="Close the day">
              <input type="hidden" name="day" value={preview.day} />
              {preview.cashiers.map((c) => (
                <Field key={c.cashierId} label={`${c.name}: expected ${ksh(c.expectedCashCents)}`} hint={c.refundedCents ? `took ${ksh(c.takenCents)}, paid back ${ksh(c.refundedCents)}` : undefined}>
                  <input name={`count:${c.cashierId}`} inputMode="decimal" required placeholder="Cash counted (KES)" className={inputClass} />
                </Field>
              ))}
              <Field label="Note (optional)"><input name="note" className={inputClass} /></Field>
            </ActionForm>
          ) : null}
        </Card>
        <Card title="Recent closes">
          {history.length === 0 ? <EmptyState message="No days closed yet." /> : (
            <Table head={["Day", "Sales", "Expected", "Counted", "Difference"]}>
              {history.map((h) => (
                <tr key={h.id} className={rowClass}>
                  <td className="px-3.5 py-2.5">{day(h.day)}</td><td className="px-3.5 py-2.5 tabular-nums">{h.salesCount}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{ksh(h.expectedCashCents)}</td><td className="px-3.5 py-2.5 tabular-nums">{ksh(h.countedCashCents)}</td>
                  <td className={`px-3.5 py-2.5 tabular-nums ${h.cashVarianceCents < 0 ? "font-medium text-[var(--color-danger)]" : h.cashVarianceCents > 0 ? "text-[var(--color-warn)]" : "text-[var(--color-good)]"}`}>{h.cashVarianceCents === 0 ? "matches" : ksh(h.cashVarianceCents)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
