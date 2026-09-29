import { redirect } from "next/navigation";
import { Rail, type RailItem } from "@/components/rail";
import { readSession } from "@/lib/session";

const ITEMS: RailItem[] = [
  { href: "/console", label: "Overview", icon: "home" },
  { href: "/console/flags", label: "Flags", icon: "flags" },
  { href: "/console/jobs", label: "Jobs", icon: "jobs" },
  { href: "/console/payments", label: "Payments", icon: "payments" },
  { href: "/console/telemetry", label: "Water", icon: "telemetry" },
  { href: "/console/sites", label: "Sites", icon: "sites" },
  { href: "/console/report", label: "Report", icon: "report" }
];

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-canvas)]">
      <Rail items={ITEMS} displayName={session.displayName} role={session.role} />
      <main className="flex-1 px-6 py-9 md:px-10 lg:px-14">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
