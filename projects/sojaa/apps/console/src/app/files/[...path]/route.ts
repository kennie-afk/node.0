import { NextRequest } from "next/server";
import { API } from "@/lib/api";
import { readSession } from "@/lib/session";

/** Downloads go through the console so the browser never holds the API token: the session cookie is exchanged for the bearer token here. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await readSession();
  if (!session) return new Response("Sign in first.", { status: 401 });
  const { path } = await params;
  if (!/^(exports|payslips|invoices)$/.test(path[0] ?? "")) return new Response("Not found", { status: 404 });
  const upstream = await fetch(`${API}/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`, { headers: { Authorization: `Bearer ${session.token}` }, cache: "no-store" });
  const headers = new Headers();
  for (const h of ["content-type", "content-disposition"]) { const v = upstream.headers.get(h); if (v) headers.set(h, v); }
  return new Response(upstream.body, { status: upstream.status, headers });
}
