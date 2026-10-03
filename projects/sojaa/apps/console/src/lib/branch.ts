import "server-only";
import { cookies } from "next/headers";
import { readSession } from "@/lib/session";

const COOKIE = "sojaa_branch";

/** Only someone who works across branches (owner, or a role with no branch) may choose one; a supervisor is confined to theirs by the API. */
export async function currentBranchId(): Promise<string | undefined> {
  const session = await readSession();
  if (!session || session.role === "supervisor") return undefined;
  return (await cookies()).get(COOKIE)?.value || undefined;
}

export async function setBranchCookie(id: string): Promise<void> {
  const store = await cookies();
  if (id) store.set(COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
  else store.delete(COOKIE);
}

/** "?branchId=…" or "&branchId=…" for a GET, empty when no choice has been made. */
export async function bq(joiner: "?" | "&" = "?"): Promise<string> {
  const id = await currentBranchId();
  return id ? `${joiner}branchId=${id}` : "";
}
