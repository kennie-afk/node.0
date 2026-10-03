import { api } from "@/lib/api";
import { readSession } from "@/lib/session";

export async function GET(): Promise<Response> {
  if (!(await readSession())) return new Response("Sign in first.", { status: 401 });
  try {
    const csv = await api.get<string>("/v1/ntts/export.csv");
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="dawa-internal-activity-log.csv"' } });
  } catch {
    return new Response("The log could not be exported.", { status: 502 });
  }
}
