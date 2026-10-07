import { api } from "@/lib/api";
import { addSupplier } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { ReceiveForm } from "@/components/receive-form";
import type { Page, Supplier } from "@/lib/types";
import { Card, Field, PageHeader, inputClass } from "@/components/ui";

export default async function Receive() {
  // only the first supplier is needed to know whether to show the "add your first supplier" prompt; the form searches the rest
  const suppliers = await api.get<Page<Supplier>>("/v1/suppliers?limit=1");
  return (
    <>
      <PageHeader title="Receive a delivery" subtitle="Enter each batch with its expiry date, or scan every pack. Controlled drugs need a second person to confirm." />
      {suppliers.items.length === 0 ? (
        <Card title="Add your first supplier" description="Deliveries and what you owe are tracked per supplier.">
          <ActionForm action={addSupplier} submit="Add supplier" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"><Field label="Name"><input name="name" required className={inputClass} /></Field><Field label="Phone"><input name="phone" className={inputClass} /></Field></ActionForm>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <ReceiveForm />
          <Card title="Add another supplier"><ActionForm action={addSupplier} submit="Add supplier" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"><Field label="Name"><input name="name" required className={inputClass} /></Field><Field label="Phone"><input name="phone" className={inputClass} /></Field></ActionForm></Card>
        </div>
      )}
    </>
  );
}
