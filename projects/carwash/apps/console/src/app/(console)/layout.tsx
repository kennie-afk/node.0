import { redirect } from "next/navigation";
import { Rail, type RailItem } from "@/components/rail";
import { readSession } from "@/lib/session";

const ITEMS: RailItem[] = [
  { href: "/", label: "Overview", icon: "home" },
  { href: "/flags", label: "Flags", icon: "flags" },
  { href: "/jobs", label: "Jobs", icon: "jobs" },
  { href: "/payments", label: "Payments", icon: "payments" },
  { href: "/telemetry", label: "Water", icon: "telemetry" },
  { href: "/sites", label: "Sites", icon: "sites" },
  { href: "/report", label: "Report", icon: "report" }
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
