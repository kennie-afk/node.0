import { readSession } from "@/lib/session";

const API = process.env.FORECOURT_API_URL ?? "http://127.0.0.1:4000";

/** The commission report as a download, fetched with the signed-in person's own token. */
export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return new Response("Sign in first.", { status: 401 });
  const incoming = new URL(request.url).searchParams;
  const outgoing = new URLSearchParams({ format: "csv" });
  for (const name of ["from", "to"]) {
    const value = incoming.get(name);
    if (value) outgoing.set(name, value);
  }
  const upstream = await fetch(`${API}/v1/reports/commissions?${outgoing.toString()}`, {
    headers: { Authorization: `Bearer ${session.token}` },
    cache: "no-store"
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="earnings.csv"',
      "Cache-Control": "no-store"
    }
  });
}
