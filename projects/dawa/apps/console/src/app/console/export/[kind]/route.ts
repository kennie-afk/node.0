import { api } from "@/lib/api";
import { bq } from "@/lib/branch";
import { readSession } from "@/lib/session";

const KINDS: Record<string, string> = { sales: "sales", stock: "stock", controlled: "controlled" };

/** Passes the API's CSV through, so the browser never needs the API token. */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }): Promise<Response> {
  if (!(await readSession())) return new Response("Sign in first.", { status: 401 });
  const { kind } = await params;
  const name = KINDS[kind];
  if (!name) return new Response("Unknown export.", { status: 404 });
  try {
    const csv = await api.get<string>(`/v1/export/${name}.csv${await bq()}`);
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="dawa-${name}.csv"` } });
  } catch {
    return new Response("That export is not available to you.", { status: 403 });
  }
}
