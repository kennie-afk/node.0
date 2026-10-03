import { redirect } from "next/navigation";
import { MobileBar, Rail, type RailItem } from "@/components/rail";
import { readSession } from "@/lib/session";
import { currentBranchId } from "@/lib/branch";
import { api } from "@/lib/api";
import { StatusBanner } from "@/components/status-banner";
import { chooseBranch } from "@/app/actions";
import type { Branch } from "@/lib/types";

const ALL: (RailItem & { roles: string[] })[] = [
  { href: "/console", label: "Overview", icon: "home", roles: ["owner", "manager", "pharmacist"] },
  { href: "/console/sell", label: "Sell", icon: "sell", roles: ["owner", "manager", "pharmacist", "cashier"] },
  { href: "/console/sales", label: "Sales", icon: "sales", roles: ["owner", "manager", "pharmacist", "cashier"] },
  { href: "/console/products", label: "Products", icon: "products", roles: ["owner", "manager", "pharmacist"] },
  { href: "/console/stock", label: "Stock", icon: "stock", roles: ["owner", "manager", "pharmacist"] },
  { href: "/console/receive", label: "Receive", icon: "receive", roles: ["owner", "manager", "pharmacist"] },
  { href: "/console/dispensing", label: "Dispensed", icon: "dispensing", roles: ["owner", "manager", "pharmacist"] },
  { href: "/console/controlled", label: "Controlled", icon: "controlled", roles: ["owner", "manager", "pharmacist"] },
  { href: "/console/stocktake", label: "Count", icon: "stocktake", roles: ["owner", "manager", "pharmacist"] },
  { href: "/console/close", label: "Close day", icon: "close", roles: ["owner", "manager"] },
  { href: "/console/customers", label: "Customers", icon: "customers", roles: ["owner", "manager", "pharmacist", "cashier"] },
  { href: "/console/payables", label: "Suppliers", icon: "payables", roles: ["owner", "manager"] },
  { href: "/console/reports", label: "Reports", icon: "reports", roles: ["owner", "manager"] },
  { href: "/console/trace", label: "Trace log", icon: "trace", roles: ["owner", "manager", "pharmacist"] },
  { href: "/console/team", label: "Team", icon: "team", roles: ["owner", "manager"] },
  { href: "/console/branches", label: "Branches", icon: "branches", roles: ["owner"] },
  { href: "/console/billing", label: "Billing", icon: "billing", roles: ["owner", "manager"] },
  { href: "/console/get-started", label: "Start", icon: "start", roles: ["owner", "manager"] }
];

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect("/login");

  const items: RailItem[] = ALL.filter((i) => i.roles.includes(session.role)).map(({ href, label, icon }) => ({ href, label, icon }));
  const branches = session.role === "owner" ? await api.get<Branch[]>("/v1/branches").catch(() => []) : [];
  const chosen = await currentBranchId();

  return (
    <div className="flex min-h-screen bg-[var(--color-canvas)]">
      <Rail items={items} displayName={session.displayName} role={session.role} />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-10 md:py-9 lg:px-14">
        <MobileBar items={items} displayName={session.displayName} />
        <div className="mx-auto max-w-6xl">
          {branches.length > 1 ? (
            <form action={chooseBranch} className="mb-4 flex items-center gap-2 text-[0.8125rem]">
              <span className="text-[var(--color-muted)]">Branch</span>
              <select name="branchId" defaultValue={chosen ?? branches.find((b) => !b.isSample)?.id} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button type="submit" className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 font-medium hover:bg-[var(--color-raised)]">Switch</button>
            </form>
          ) : null}
          <StatusBanner role={session.role} />
          {children}
        </div>
      </main>
    </div>
  );
}
