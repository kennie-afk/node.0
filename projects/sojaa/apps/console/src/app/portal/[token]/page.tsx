import Image from "next/image";
import { API } from "@/lib/api";
import type { Portal } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The client's private attendance link: no sign-in, the link is the credential. It shows verification counts and nothing else. */
export default async function PortalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ month?: string }> }) {
  const { token } = await params;
  const { month } = await searchParams;
  const res = await fetch(`${API}/v1/portal/${encodeURIComponent(token)}${month ? `?month=${encodeURIComponent(month)}` : ""}`, { cache: "no-store" });
  if (!res.ok) {
    return <main className="flex min-h-screen items-center justify-center px-5"><p className="text-[0.9rem] text-[var(--color-muted)]">This link is not valid any more. Ask your security firm for a new one.</p></main>;
  }
  const p = (await res.json()) as Portal;
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <div className="mb-6 flex items-center gap-3"><Image src="/mark.svg" alt="" width={256} height={256} className="h-7 w-7" /><div><h1 className="text-[1.25rem] font-semibold">Attendance summary for {p.client}</h1><p className="text-[0.8125rem] text-[var(--color-muted)]">{p.month}</p></div></div>
      {p.sites.length === 0 ? <p className="text-[0.875rem] text-[var(--color-muted)]">No shifts recorded for this month.</p> : p.sites.map((s) => (
        <section key={s.site} className="mb-6 rounded-xl border border-[var(--color-line)] bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold">{s.site}</h2>
          <p className="mt-1 text-[0.8125rem] text-[var(--color-muted)]">{s.totals.verified} of {s.totals.scheduled} shifts verified present · {s.totals.late} late · {s.totals.missed} missed</p>
          <table className="mt-3 w-full text-[0.8125rem]"><thead><tr className="text-left text-[0.6875rem] uppercase tracking-wide text-[var(--color-faint)]"><th className="py-1">Day</th><th>Scheduled</th><th>Verified</th><th>Late</th><th>Missed</th></tr></thead><tbody>{s.days.map((d) => <tr key={d.day} className="border-t border-[var(--color-line)]"><td className="py-1.5">{d.day}</td><td>{d.scheduled}</td><td>{d.verified}</td><td>{d.late}</td><td>{d.missed}</td></tr>)}</tbody></table>
        </section>
      ))}
      <p className="text-[0.75rem] text-[var(--color-faint)]">{p.notice}</p>
    </main>
  );
}
