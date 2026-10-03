import { api } from "@/lib/api";
import { bq } from "@/lib/branch";
import { readSession } from "@/lib/session";
import { approveStocktake, cancelStocktake, startStocktake } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { CountsForm } from "@/components/counts-form";
import type { Stocktake } from "@/lib/types";
import { Card, Field, PageHeader, dangerButtonClass, inputClass } from "@/components/ui";

export default async function StocktakePage() {
  const [take, session] = await Promise.all([api.get<Stocktake>(`/v1/stocktake${await bq()}`), readSession()]);
  const manager = session?.role === "owner" || session?.role === "manager";
  const open = take.status === "open";
  const controlled = take.lines?.some((l) => l.category === "controlled" && l.countedQty !== null && l.countedQty !== l.expectedQty);
  return (
    <>
      <PageHeader title="Stock count" subtitle="Count the shelves, enter what you find, and a manager approves. Only the difference posts, and every difference is on record." />
      {!open ? (
        <Card title="Start a count" description="One count at a time per branch. It lists every batch the system thinks you hold.">
          <ActionForm action={startStocktake} submit="Start a stock-take"><Field label="Note (optional)"><input name="note" className={inputClass} placeholder="Monthly count" /></Field></ActionForm>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <CountsForm take={take} />
          {manager ? (
            <Card title="Approve the count" description="Posts the differences as stock movements. Counts that are missing must be entered first, unless you choose to skip them.">
              <ActionForm action={approveStocktake} submit="Approve and post">
                <input type="hidden" name="id" value={take.id} />
                <label className="flex items-center gap-2 text-[0.8125rem]"><input type="checkbox" name="skipUncounted" /> Skip batches I have not counted</label>
                {controlled ? <div className="grid gap-3 sm:grid-cols-2"><input name="witnessPhone" placeholder="Witness phone (controlled drug differs)" className={inputClass} /><input name="witnessPin" type="password" placeholder="Witness PIN" className={inputClass} /></div> : null}
              </ActionForm>
              <div className="mt-3"><ActionForm action={cancelStocktake} submit="Cancel this count" button={dangerButtonClass}><input type="hidden" name="id" value={take.id} /></ActionForm></div>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
