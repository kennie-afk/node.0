import "server-only";
import { cookies } from "next/headers";
import { readSession } from "@/lib/session";

const COOKIE = "dawa_branch";

/**
 * Only an owner works across branches, so only an owner's choice is honoured; everyone else is confined to their own
 * branch by the API and a stale cookie must never get in the way.
 */
export async function currentBranchId(): Promise<string | undefined> {
  const session = await readSession();
  if (!session || session.role !== "owner") return undefined;
  return (await cookies()).get(COOKIE)?.value || undefined;
}

export async function setBranchCookie(id: string): Promise<void> {
  (await cookies()).set(COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
}

/** "?branchId=…" or "&branchId=…" for a GET, empty when no choice has been made. */
export async function bq(joiner: "?" | "&" = "?"): Promise<string> {
  const id = await currentBranchId();
  return id ? `${joiner}branchId=${id}` : "";
}
