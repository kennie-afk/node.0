import { readSession } from "@/lib/session";

const API = process.env.FORECOURT_API_URL ?? "http://127.0.0.1:4000";
const KINDS = new Set(["jobs", "payments", "flags"]);
const FILTERS = ["state", "plate", "workerId", "siteId", "from", "to", "channel", "matched", "reference", "severity", "type"];

/**
 * Streams a CSV export from the API to the browser with the signed-in person's own token, so what they
 * can download is exactly what they can see. The body is passed through, never buffered.
 */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const session = await readSession();
  if (!session) return new Response("Sign in first.", { status: 401 });
  if (!KINDS.has(kind)) return new Response("Unknown export.", { status: 404 });

  const incoming = new URL(request.url).searchParams;
  const outgoing = new URLSearchParams();
  for (const name of FILTERS) {
    const value = incoming.get(name);
    if (value) outgoing.set(name, value);
  }

  const upstream = await fetch(`${API}/v1/export/${kind}.csv?${outgoing.toString()}`, {
    headers: { Authorization: `Bearer ${session.token}` },
    cache: "no-store"
  });
  if (!upstream.ok || !upstream.body) {
    return new Response(await upstream.text().catch(() => "Export failed."), { status: upstream.status === 200 ? 502 : upstream.status });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
