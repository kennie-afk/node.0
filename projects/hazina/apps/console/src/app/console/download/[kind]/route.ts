import { api } from "@/lib/api";
import { readSession } from "@/lib/session";

/**
 * CSV downloads. The browser asks the console, the console asks the API with the session token, so the token never
 * reaches the page. Only the exports named here exist; the id and product are checked before they go into a path.
 */
const SIMPLE: Record<string, string> = {
  members: "members.csv", loans: "loans.csv", arrears: "arrears.csv", journal: "journal.csv", "mpesa-payments": "mpesa-payments.csv"
};
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }): Promise<Response> {
  if (!(await readSession())) return new Response("Sign in first.", { status: 401 });
  const { kind } = await params;
  const q = new URL(request.url).searchParams;
  let path: string | undefined = SIMPLE[kind] ? `/v1/exports/${SIMPLE[kind]}` : undefined;
  let name = SIMPLE[kind] ?? "";
  const id = q.get("id") ?? "";
  if (kind === "trial-balance") {
    const asOf = q.get("asOf") ?? "";
    if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return new Response("Bad date.", { status: 400 });
    path = `/v1/exports/trial-balance.csv${asOf ? `?asOf=${asOf}` : ""}`;
    name = `trial-balance${asOf ? `-${asOf}` : ""}.csv`;
  } else if (kind === "member-statement" && UUID.test(id)) {
    const product = ["savings", "shares", "deposits"].includes(q.get("product") ?? "") ? q.get("product") : "savings";
    path = `/v1/exports/member-statement/${id}.csv?product=${product}`;
    name = `member-${product}.csv`;
  } else if (kind === "loan-statement" && UUID.test(id)) {
    path = `/v1/exports/loan-statement/${id}.csv`;
    name = "loan-statement.csv";
  } else if (kind === "return" && UUID.test(id)) {
    path = `/v1/exports/return/${id}.csv`;
    name = "return.csv";
  }
  if (!path) return new Response("Unknown export.", { status: 404 });
  try {
    const csv = await api.get<string>(path);
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="hazina-${name}"` } });
  } catch {
    return new Response("That export is not available to you.", { status: 403 });
  }
}
