import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";
import { SESSION_COOKIE, readSessionValue } from "./session";

export type CurrentUser = {
  accountId: number;
  name: string; // the person, e.g. "Mal"
  accountName: string; // the household, e.g. "Mal & Sam"
  isAdmin: boolean;
};

/**
 * The logged-in household, or null. The cookie's signature is checked by
 * proxy.ts; here we also check the account still exists and its password
 * hasn't been changed since (session version). Cached per request.
 */
export const getSession = cache(async (): Promise<CurrentUser | null> => {
  const s = readSessionValue((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const account = db()
    .select({
      name: schema.accounts.name,
      isAdmin: schema.accounts.isAdmin,
      sessionVersion: schema.accounts.sessionVersion,
    })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, s.accountId))
    .get();
  if (!account || account.sessionVersion !== s.v) return null;
  return { accountId: s.accountId, name: s.name, accountName: account.name, isAdmin: account.isAdmin };
});

/**
 * For pages, server actions and route handlers; every data query is scoped to
 * `accountId`. A stale session (password changed, account removed) goes back
 * to the login page.
 */
export async function requireSession(): Promise<CurrentUser> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const s = await requireSession();
  if (!s.isAdmin) throw new Error("Only the admin account can do that");
  return s;
}
