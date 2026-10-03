import { api } from "@/lib/api";
import { bq } from "@/lib/branch";
import { readSession } from "@/lib/session";

/** Streams the API's CSV through, so the browser never needs the API token. */
export async function GET(): Promise<Response> {
  if (!(await readSession())) return new Response("Sign in first.", { status: 401 });
  try {
    const csv = await api.get<string>(`/v1/dispensing/export.csv${await bq()}`);
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="dawa-dispensing-log.csv"' } });
  } catch {
    return new Response("The log could not be exported.", { status: 502 });
  }
}
