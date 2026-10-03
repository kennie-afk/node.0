import { api } from "@/lib/api";
import { addSupplier } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { ReceiveForm } from "@/components/receive-form";
import type { Product, Supplier } from "@/lib/types";
import { Card, Field, PageHeader, inputClass } from "@/components/ui";

export default async function Receive() {
  const [suppliers, products] = await Promise.all([
    api.get<Supplier[]>("/v1/suppliers"),
    api.get<{ items: Product[] }>("/v1/products?limit=200")
  ]);
  return (
    <>
      <PageHeader title="Receive a delivery" subtitle="Enter each batch with its expiry date, or scan every pack. Controlled drugs need a second person to confirm." />
      {suppliers.length === 0 ? (
        <Card title="Add your first supplier" description="Deliveries and what you owe are tracked per supplier.">
          <ActionForm action={addSupplier} submit="Add supplier" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"><Field label="Name"><input name="name" required className={inputClass} /></Field><Field label="Phone"><input name="phone" className={inputClass} /></Field></ActionForm>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <ReceiveForm suppliers={suppliers} products={products.items} />
          <Card title="Add another supplier"><ActionForm action={addSupplier} submit="Add supplier" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"><Field label="Name"><input name="name" required className={inputClass} /></Field><Field label="Phone"><input name="phone" className={inputClass} /></Field></ActionForm></Card>
        </div>
      )}
    </>
  );
}
