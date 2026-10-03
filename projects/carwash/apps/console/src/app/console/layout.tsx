import { redirect } from "next/navigation";
import { MobileBar, Rail, type RailItem } from "@/components/rail";
import { readSession } from "@/lib/session";
import { StatusBanner } from "@/components/status-banner";

const WORKER_ITEMS: RailItem[] = [{ href: "/console/work", label: "Work", icon: "jobs" }];

const ITEMS: RailItem[] = [
  { href: "/console", label: "Overview", icon: "home" },
  { href: "/console/get-started", label: "Start", icon: "start" },
  { href: "/console/work", label: "Work", icon: "jobs" },
  { href: "/console/flags", label: "Flags", icon: "flags" },
  { href: "/console/jobs", label: "Jobs", icon: "jobs" },
  { href: "/console/payments", label: "Payments", icon: "payments" },
  { href: "/console/telemetry", label: "Water", icon: "telemetry" },
  { href: "/console/sites", label: "Sites", icon: "sites" },
  { href: "/console/services", label: "Prices", icon: "services" },
  { href: "/console/team", label: "Team", icon: "team" },
  { href: "/console/devices", label: "Devices", icon: "devices" },
  { href: "/console/found", label: "Found", icon: "report" },
  { href: "/console/report", label: "Report", icon: "report" },
  { href: "/console/billing", label: "Billing", icon: "billing" }
];

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();

  if (!session) {
    redirect("/login");
  }

  // An attendant sees one thing: the work screen. Everything else needs the owner or a manager.
  const items = session.role === "worker" || session.role === "supervisor" ? WORKER_ITEMS : ITEMS;

  return (
    <div className="flex min-h-screen bg-[var(--color-canvas)]">
      <Rail items={items} displayName={session.displayName} role={session.role} />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-10 md:py-9 lg:px-14">
        <MobileBar items={items} displayName={session.displayName} />
        <div className="mx-auto max-w-5xl">
          <StatusBanner role={session.role} />
          {children}
        </div>
      </main>
    </div>
  );
}
