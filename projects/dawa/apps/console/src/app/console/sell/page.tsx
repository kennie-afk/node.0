import { readSession } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { Pos } from "@/components/pos";

export default async function Sell() {
  const session = await readSession();
  return (
    <>
      <PageHeader title="Sell" subtitle="Scan or search, take payment, and the stock comes off the soonest-expiring batch." />
      <Pos canDiscount={session?.role === "owner" || session?.role === "manager"} />
    </>
  );
}
