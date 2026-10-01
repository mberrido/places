import "server-only";
import crypto from "node:crypto";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { db, schema, seedCategories } from "@/db";
import type { Account } from "@/db/schema";
import type { GoogleProfile } from "./google-auth";
import { safeEqual } from "./session";

// Groups ("accounts" in the database) and the people in them.

export class AccountError extends Error {}

// ---------------------------------------------------------------- People

/** Creates or updates the user for a Google sign-in. */
export function upsertUser(p: GoogleProfile) {
  const fields = { email: p.email, name: p.name, givenName: p.givenName, picture: p.picture, lastLoginAt: new Date() };
  const d = db();
  const existing = d.select().from(schema.users).where(eq(schema.users.googleSub, p.sub)).get();
  if (existing) {
    d.update(schema.users).set(fields).where(eq(schema.users.id, existing.id)).run();
    return { id: existing.id, sessionVersion: existing.sessionVersion };
  }
  return d
    .insert(schema.users)
    .values({ googleSub: p.sub, ...fields })
    .returning({ id: schema.users.id, sessionVersion: schema.users.sessionVersion })
    .get();
}

/** Ends every session this person has, on every device. */
export function endSessions(userId: number) {
  db()
    .update(schema.users)
    .set({ sessionVersion: sql`${schema.users.sessionVersion} + 1` })
    .where(eq(schema.users.id, userId))
    .run();
}

export function groupMembers(accountId: number) {
  return db()
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, picture: schema.users.picture })
    .from(schema.users)
    .where(eq(schema.users.accountId, accountId))
    .orderBy(asc(schema.users.createdAt))
    .all();
}

/** Takes someone out of the group (they're asked to create or join one next time). */
export function removeMember(accountId: number, userId: number) {
  db()
    .update(schema.users)
    .set({ accountId: null })
    .where(and(eq(schema.users.id, userId), eq(schema.users.accountId, accountId)))
    .run();
}

// ---------------------------------------------------------------- Join codes

// No 0/O, 1/I/L, so codes survive being read out or typed from a message.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newCode() {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** "pig7 k4qx" / "PIG7-K4QX" → "PIG7K4QX". */
export function normaliseCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatCode(code: string | null) {
  return code ? `${code.slice(0, 4)}-${code.slice(4)}` : "";
}

export function regenerateJoinCode(accountId: number) {
  const code = newCode();
  db().update(schema.accounts).set({ joinCode: code }).where(eq(schema.accounts.id, accountId)).run();
  return code;
}

// ---------------------------------------------------------------- Groups

export function getAccount(id: number) {
  return db().select().from(schema.accounts).where(eq(schema.accounts.id, id)).get() ?? null;
}

/** A new group with its creator as the first member. The server's first group is the admin one. */
export function createGroup(userId: number, rawName: string) {
  const name = rawName.trim().slice(0, 60);
  if (!name) throw new AccountError("Give your group a name.");
  const d = db();
  return d.transaction((tx) => {
    const first = !tx.select({ id: schema.accounts.id }).from(schema.accounts).limit(1).get();
    const id = tx
      .insert(schema.accounts)
      .values({
        name,
        login: `group-${crypto.randomBytes(6).toString("hex")}`, // legacy column, must be unique
        isAdmin: first,
        joinCode: newCode(),
        ingestToken: crypto.randomBytes(24).toString("base64url"),
      })
      .returning({ id: schema.accounts.id })
      .get().id;
    seedCategories(tx as unknown as Parameters<typeof seedCategories>[0], id);
    tx.update(schema.users).set({ accountId: id }).where(eq(schema.users.id, userId)).run();
    return id;
  });
}

export function joinGroup(userId: number, rawCode: string) {
  const code = normaliseCode(rawCode);
  const account = code.length === 8
    ? db().select().from(schema.accounts).where(eq(schema.accounts.joinCode, code)).get()
    : undefined;
  if (!account) throw new AccountError("That code doesn't match a group. Check it and try again.");
  db().update(schema.users).set({ accountId: account.id }).where(eq(schema.users.id, userId)).run();
  return account;
}

/**
 * Groups nobody has signed in to yet: those from before Google sign-in (with
 * your existing places). Offered only to the very first person to sign in.
 */
export function claimableGroups(userId: number) {
  const others = db()
    .select({ n: sql<number>`count(*)` })
    .from(schema.users)
    .where(ne(schema.users.id, userId))
    .get()!.n;
  if (others > 0) return [];
  return db()
    .select({
      id: schema.accounts.id,
      name: schema.accounts.name,
      places: sql<number>`(select count(*) from ${schema.places} where ${schema.places.accountId} = ${schema.accounts.id})`,
    })
    .from(schema.accounts)
    .leftJoin(schema.users, eq(schema.users.accountId, schema.accounts.id))
    .where(isNull(schema.users.id))
    .orderBy(asc(schema.accounts.id))
    .all();
}

export function claimGroup(userId: number, accountId: number) {
  if (!claimableGroups(userId).some((g) => g.id === accountId)) throw new AccountError("That group can't be claimed.");
  db().update(schema.users).set({ accountId }).where(eq(schema.users.id, userId)).run();
}

export function renameGroup(accountId: number, rawName: string) {
  const name = rawName.trim().slice(0, 60);
  if (!name) throw new AccountError("Give your group a name.");
  db().update(schema.accounts).set({ name }).where(eq(schema.accounts.id, accountId)).run();
}

/** The groups you can share a place with. */
export function otherAccounts(accountId: number) {
  return db()
    .select({ id: schema.accounts.id, name: schema.accounts.name })
    .from(schema.accounts)
    .where(ne(schema.accounts.id, accountId))
    .orderBy(asc(schema.accounts.name))
    .all();
}

// ---------------------------------------------------------------- Shortcut

/** Which group a Shortcut token belongs to. Compares against every token in constant time. */
export function accountByIngestToken(token: string | null | undefined): Account | null {
  if (!token) return null;
  let match: Account | null = null;
  for (const a of db().select().from(schema.accounts).all()) {
    if (a.ingestToken && safeEqual(a.ingestToken, token)) match = a;
  }
  return match;
}

export function regenerateIngestToken(id: number) {
  const token = crypto.randomBytes(24).toString("base64url");
  db().update(schema.accounts).set({ ingestToken: token }).where(eq(schema.accounts.id, id)).run();
  return token;
}
