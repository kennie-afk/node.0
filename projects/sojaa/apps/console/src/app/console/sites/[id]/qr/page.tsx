import { api } from "@/lib/api";
import type { Checkpoint, Site } from "@/lib/types";
import { Qr } from "@/components/qr";
import { PageHeader } from "@/components/ui";

/** Print this page and stick each plate at its checkpoint. The QR holds the secret code and nothing else. */
export default async function QrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [site, cps] = await Promise.all([api.get<Site>(`/v1/sites/${id}`), api.get<Checkpoint[]>(`/v1/sites/${id}/checkpoints`)]);
  return (
    <>
      <PageHeader title={`QR plates: ${site.name}`} subtitle="Print and fix each plate at its checkpoint. If one is photographed or lost, make a new code on the site page and reprint it." />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cps.filter((c) => c.active && c.token).map((c) => (
          <div key={c.id} className="flex flex-col items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white p-5 text-center">
            <Qr text={c.token!} size={180} />
            <div className="text-[1rem] font-semibold">{c.name}</div>
            <div className="text-[0.6875rem] text-[var(--color-muted)]">{site.client} · {site.name} · checkpoint {c.seq}</div>
            <div className="font-mono text-[0.625rem] text-[var(--color-faint)]">{c.token}</div>
          </div>
        ))}
      </div>
    </>
  );
}
