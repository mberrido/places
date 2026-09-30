import "server-only";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db, schema, seedCategories } from "@/db";
import type { Account } from "@/db/schema";
import { hashPassword, MIN_PASSWORD_LENGTH, newIngestToken, verifyPassword } from "./passwords";
import { safeEqual } from "./session";

export function normaliseLogin(login: string) {
  return login.trim().toLowerCase();
}

/** Returns the account if the login and password match (constant work either way). */
export function checkLogin(login: string, password: string): Account | null {
  const account = db()
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.login, normaliseLogin(login)))
    .get();
  return verifyPassword(password, account?.passwordHash) ? account! : null;
}

/** Which household a Shortcut token belongs to. Compares against every token in constant time. */
export function accountByIngestToken(token: string | null | undefined): Account | null {
  if (!token) return null;
  let match: Account | null = null;
  for (const a of db().select().from(schema.accounts).all()) {
    if (a.ingestToken && safeEqual(a.ingestToken, token)) match = a;
  }
  return match;
}

export function getAccount(id: number) {
  return db().select().from(schema.accounts).where(eq(schema.accounts.id, id)).get() ?? null;
}

export function listAccounts() {
  return db()
    .select({
      id: schema.accounts.id,
      name: schema.accounts.name,
      login: schema.accounts.login,
      members: schema.accounts.members,
      isAdmin: schema.accounts.isAdmin,
      createdAt: schema.accounts.createdAt,
      places: sql<number>`(select count(*) from ${schema.places} where ${schema.places.accountId} = ${schema.accounts.id})`,
    })
    .from(schema.accounts)
    .orderBy(asc(schema.accounts.id))
    .all();
}

/** The households you can share a place with. */
export function otherAccounts(accountId: number) {
  return db()
    .select({ id: schema.accounts.id, name: schema.accounts.name })
    .from(schema.accounts)
    .where(ne(schema.accounts.id, accountId))
    .orderBy(asc(schema.accounts.name))
    .all();
}

export class AccountError extends Error {}

function validLogin(login: string) {
  if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(login)) {
    throw new AccountError("Login names are 2–30 letters, numbers, dots, dashes or underscores.");
  }
}

function validPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AccountError(`Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

function loginTaken(login: string, exceptId?: number) {
  return !!db()
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.login, login), exceptId ? ne(schema.accounts.id, exceptId) : undefined))
    .get();
}

export function cleanMembers(members: string[]) {
  return [...new Set(members.map((m) => m.trim()).filter(Boolean))].slice(0, 8).map((m) => m.slice(0, 40));
}

export function createAccount(input: { name: string; login: string; password: string; members: string[] }) {
  const login = normaliseLogin(input.login);
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new AccountError("Give the household a name.");
  validLogin(login);
  validPassword(input.password);
  if (loginTaken(login)) throw new AccountError(`The login "${login}" is already used.`);
  const d = db();
  return d.transaction((tx) => {
    const id = tx
      .insert(schema.accounts)
      .values({
        name,
        login,
        passwordHash: hashPassword(input.password),
        members: cleanMembers(input.members),
        ingestToken: newIngestToken(),
      })
      .returning({ id: schema.accounts.id })
      .get().id;
    seedCategories(tx as unknown as Parameters<typeof seedCategories>[0], id);
    return id;
  });
}

export function updateAccount(id: number, input: { name: string; login: string; members: string[] }) {
  const login = normaliseLogin(input.login);
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new AccountError("Give the household a name.");
  validLogin(login);
  if (loginTaken(login, id)) throw new AccountError(`The login "${login}" is already used.`);
  db()
    .update(schema.accounts)
    .set({ name, login, members: cleanMembers(input.members) })
    .where(eq(schema.accounts.id, id))
    .run();
}

/** New password; also logs that household out everywhere (session version bump). */
export function setPassword(id: number, password: string) {
  validPassword(password);
  db()
    .update(schema.accounts)
    .set({ passwordHash: hashPassword(password), sessionVersion: sql`${schema.accounts.sessionVersion} + 1` })
    .where(eq(schema.accounts.id, id))
    .run();
}

export function regenerateIngestToken(id: number) {
  const token = newIngestToken();
  db().update(schema.accounts).set({ ingestToken: token }).where(eq(schema.accounts.id, id)).run();
  return token;
}
