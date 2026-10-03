import { redirect } from "next/navigation";
import { MobileBar, Rail, type RailItem } from "@/components/rail";
import { readSession } from "@/lib/session";
import { api } from "@/lib/api";
import { can, canSeeBilling, type Permission } from "@/lib/roles";
import { StatusBanner } from "@/components/status-banner";
import type { Settings } from "@/lib/types";
import { FlashProvider } from "@/components/flash";

const ALL: (RailItem & { permission?: Permission; saccoOnly?: boolean; billing?: boolean })[] = [
  { href: "/console", label: "Overview", icon: "home" },
  { href: "/console/members", label: "Members", icon: "members" },
  { href: "/console/savings", label: "Savings", icon: "savings", saccoOnly: true },
  { href: "/console/loans", label: "Loans", icon: "loans" },
  { href: "/console/mpesa", label: "M-Pesa", icon: "mpesa", permission: "recon" },
  { href: "/console/arrears", label: "Arrears", icon: "arrears", permission: "reports" },
  { href: "/console/ledger", label: "Ledger", icon: "ledger", permission: "reports" },
  { href: "/console/returns", label: "Returns", icon: "returns", permission: "returns" },
  { href: "/console/team", label: "Team", icon: "team", permission: "team_write" },
  { href: "/console/branches", label: "Branches", icon: "branches", permission: "branches_write" },
  { href: "/console/settings", label: "Settings", icon: "settings", permission: "settings" },
  { href: "/console/billing", label: "Billing", icon: "billing", billing: true },
  { href: "/console/get-started", label: "Start", icon: "start", permission: "team_write" }
];

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect("/login");
  const settings = await api.get<Settings>("/v1/settings").catch(() => null);
  const kind = settings?.organisation.kind ?? "sacco";

  const items: RailItem[] = ALL
    .filter((i) => (!i.permission || can(session.role, i.permission)) && (!i.saccoOnly || kind === "sacco") && (!i.billing || canSeeBilling(session.role)))
    .map(({ href, label, icon }) => ({ href: href, label: kind === "lender" && label === "Members" ? "Borrowers" : label, icon }));

  return (
    <div className="flex min-h-screen bg-[var(--color-canvas)]">
      <Rail items={items} displayName={session.displayName} role={session.role} />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-10 md:py-9 lg:px-14">
        <MobileBar items={items} displayName={session.displayName} />
        <div className="mx-auto max-w-6xl">
          <StatusBanner role={session.role} />
          <FlashProvider>{children}</FlashProvider>
        </div>
      </main>
    </div>
  );
}
