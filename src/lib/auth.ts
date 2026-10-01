import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { SESSION_COOKIE, readSessionValue } from "./session";

export type CurrentUser = {
  userId: number;
  accountId: number; // their group
  name: string; // first name, recorded as "added by"
  fullName: string;
  email: string;
  picture: string | null;
  accountName: string; // the group, e.g. "Mal & Sam"
  isAdmin: boolean; // the server's first group: sees Google usage and backups
};

/** The signed-in person (with or without a group), or null. Cached per request. */
export const getUser = cache(async (): Promise<User | null> => {
  const s = readSessionValue((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  return db().select().from(schema.users).where(eq(schema.users.id, s.userId)).get() ?? null;
});

/** The signed-in person and their group, or null if either is missing. */
export const getSession = cache(async (): Promise<CurrentUser | null> => {
  const user = await getUser();
  if (!user?.accountId) return null;
  const account = db()
    .select({ name: schema.accounts.name, isAdmin: schema.accounts.isAdmin })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, user.accountId))
    .get();
  if (!account) return null;
  return {
    userId: user.id,
    accountId: user.accountId,
    name: user.givenName ?? user.name,
    fullName: user.name,
    email: user.email,
    picture: user.picture,
    accountName: account.name,
    isAdmin: account.isAdmin,
  };
});

/**
 * For pages, server actions and route handlers; every data query is scoped to
 * `accountId`. Not signed in goes to the login page; signed in without a
 * group goes to the welcome page to create or join one.
 */
export async function requireSession(): Promise<CurrentUser> {
  const s = await getSession();
  if (s) return s;
  redirect((await getUser()) ? "/welcome" : "/login");
}

export async function requireAdmin(): Promise<CurrentUser> {
  const s = await requireSession();
  if (!s.isAdmin) throw new Error("Only the server's main group can do that");
  return s;
}
