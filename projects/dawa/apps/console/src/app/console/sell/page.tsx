import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import type { Customer } from "@/lib/types";
import { PageHeader } from "@/components/ui";
import { Pos } from "@/components/pos";

export default async function Sell() {
  const session = await readSession();
  const customers = await api.get<Customer[]>("/v1/customers").catch(() => [] as Customer[]);
  return (
    <>
      <PageHeader title="Sell" subtitle="Scan or search, take payment, and the stock comes off the soonest-expiring batch." />
      <Pos customers={customers} canDiscount={session?.role === "owner" || session?.role === "manager"} />
    </>
  );
}
