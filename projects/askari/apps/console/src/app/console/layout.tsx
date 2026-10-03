import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { can, ROLE_LABEL } from "@/lib/roles";
import { currentBranchId } from "@/lib/branch";
import type { Branch } from "@/lib/types";
import { MobileBar, Rail, type RailItem } from "@/components/rail";
import { StatusBanner } from "@/components/status-banner";
import { FlashProvider } from "@/components/flash";
import { chooseBranch } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect("/login");
  const role = session.role;
  const branches = await api.get<Branch[]>("/v1/branches").catch(() => [] as Branch[]);
  const chosen = await currentBranchId();
  const items: RailItem[] = [
    { href: "/console", label: "Overview", icon: "home" as const },
    { href: "/console/attendance", label: "Attendance", icon: "attendance" as const },
    ...(can(role, "attendance_record") ? [{ href: "/console/check", label: "Check in", icon: "patrol" as const }] : []),
    { href: "/console/roster", label: "Roster", icon: "roster" as const },
    { href: "/console/guards", label: "Guards", icon: "guards" as const },
    { href: "/console/sites", label: "Sites", icon: "sites" as const },
    { href: "/console/patrols", label: "Patrols", icon: "patrol" as const },
    { href: "/console/incidents", label: "Incidents", icon: "incidents" as const },
    ...(can(role, "salary_view") ? [{ href: "/console/payroll", label: "Payroll", icon: "payroll" as const }] : []),
    ...(can(role, "reports") ? [{ href: "/console/invoices", label: "Invoices", icon: "invoices" as const }, { href: "/console/debtors", label: "Debtors", icon: "debtors" as const }] : []),
    { href: "/console/team", label: "Team", icon: "team" as const },
    ...(can(role, "settings") ? [{ href: "/console/settings", label: "Settings", icon: "settings" as const }] : []),
    ...(can(role, "billing") ? [{ href: "/console/billing", label: "Billing", icon: "billing" as const }] : []),
    { href: "/console/get-started", label: "Start", icon: "start" as const }
  ];
  const real = branches.filter((b) => !b.isSample);
  return (
    <FlashProvider>
      <div className="flex min-h-screen">
        <Rail items={items} displayName={session.displayName} role={ROLE_LABEL[role] ?? role} />
        <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7">
          <MobileBar items={items} displayName={session.displayName} />
          {role !== "supervisor" && real.length > 1 ? (
            <form action={chooseBranch} className="mb-4 flex items-center justify-end gap-2 text-[0.75rem] text-[var(--color-muted)]">
              <label htmlFor="branch">Branch</label>
              <select id="branch" name="branchId" defaultValue={chosen ?? ""} className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-[0.75rem]">
                <option value="">All branches</option>
                {real.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button className="rounded-md border border-[var(--color-line)] px-2 py-1 text-[0.75rem]" type="submit">Show</button>
            </form>
          ) : null}
          <StatusBanner role={role} />
          <div className="mx-auto max-w-[1180px]">{children}</div>
        </main>
      </div>
    </FlashProvider>
  );
}
