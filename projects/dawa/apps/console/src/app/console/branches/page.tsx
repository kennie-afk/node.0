import { api } from "@/lib/api";
import { addBranch, setTill } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { Branch } from "@/lib/types";
import { Badge, Card, Field, PageHeader, inputClass } from "@/components/ui";

export default async function Branches() {
  const branches = await api.get<Branch[]>("/v1/branches");
  return (
    <>
      <PageHeader title="Branches" subtitle="Each branch has its own stock, till and day close. Billing counts real branches only; the sample branch is free." />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4">
          {branches.map((b) => (
            <Card key={b.id}>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div><div className="text-[0.9375rem] font-semibold">{b.name} {b.isSample ? <Badge value="sample" /> : null}</div><div className="text-[0.75rem] text-[var(--color-faint)]">Sale numbers start with {b.code}</div></div>
                {b.isSample ? null : (
                  <ActionForm action={setTill} submit="Save" className="flex items-end gap-2"><input type="hidden" name="id" value={b.id} /><Field label="M-Pesa till or paybill number" hint="Customers' payments to this number match their sales."><input name="tillNumber" defaultValue={b.tillNumber ?? ""} inputMode="numeric" className={inputClass} /></Field></ActionForm>
                )}
              </div>
            </Card>
          ))}
        </div>
        <Card title="Add a branch" description="Adds to your monthly price from the next invoice.">
          <ActionForm action={addBranch} submit="Add branch"><Field label="Name"><input name="name" required className={inputClass} /></Field><Field label="M-Pesa till (optional)"><input name="tillNumber" inputMode="numeric" className={inputClass} /></Field></ActionForm>
        </Card>
      </div>
    </>
  );
}
