import { api } from "@/lib/api";
import { addBranch, setPaybill } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import type { Branch } from "@/lib/types";
import { Badge, Card, Field, PageHeader, inputClass } from "@/components/ui";

export default async function Branches() {
  const branches = await api.get<Branch[]>("/v1/branches");
  return (
    <>
      <PageHeader title="Branches" subtitle="A branch is an office. Members and staff belong to one; the ledger and billing are for the whole organisation." />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4">
          {branches.map((b) => (
            <Card key={b.id}>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div><div className="text-[0.9375rem] font-semibold">{b.name} {b.isSample ? <Badge value="sample" /> : null}</div><div className="text-[0.75rem] text-[var(--color-faint)]">Code {b.code}</div></div>
                {b.isSample ? null : (
                  <ActionForm action={setPaybill} submit="Save" className="flex items-end gap-2"><input type="hidden" name="id" value={b.id} /><Field label="M-Pesa paybill number" hint="Payments to this number are matched to members and loans by account number."><input name="paybillNumber" defaultValue={b.paybillNumber ?? ""} inputMode="numeric" className={inputClass} /></Field></ActionForm>
                )}
              </div>
            </Card>
          ))}
        </div>
        <Card title="Add a branch">
          <ActionForm action={addBranch} submit="Add branch"><Field label="Name"><input name="name" required className={inputClass} /></Field><Field label="M-Pesa paybill (optional)"><input name="paybillNumber" inputMode="numeric" className={inputClass} /></Field></ActionForm>
        </Card>
      </div>
    </>
  );
}
