import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { hashPassword, newIngestToken } from "@/lib/passwords";
import * as schema from "./schema";

export const DATABASE_PATH = path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH ?? "./data/places.db");

const DEFAULT_CATEGORIES: Omit<typeof schema.categories.$inferInsert, "accountId">[] = [
  { slug: "hotel", label: "Hotel", emoji: "🛏️", color: "#7c3aed", sortOrder: 0 },
  { slug: "restaurant", label: "Restaurant", emoji: "🍽️", color: "#dc2626", sortOrder: 1 },
  { slug: "cafe", label: "Café", emoji: "☕", color: "#92400e", sortOrder: 2 },
  { slug: "bar", label: "Bar", emoji: "🍸", color: "#db2777", sortOrder: 3 },
  { slug: "attraction", label: "Attraction", emoji: "🏛️", color: "#2563eb", sortOrder: 4 },
  { slug: "day-out", label: "Day out", emoji: "🌳", color: "#16a34a", sortOrder: 5 },
  { slug: "shop", label: "Shop", emoji: "🛍️", color: "#ea580c", sortOrder: 6 },
  { slug: "other", label: "Other", emoji: "📍", color: "#64748b", sortOrder: 7 },
];

type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/** Gives a new account the default category list. */
export function seedCategories(d: DB, accountId: number) {
  d.insert(schema.categories)
    .values(DEFAULT_CATEGORIES.map((c) => ({ ...c, accountId })))
    .onConflictDoNothing()
    .run();
}

/**
 * Account 1 is created by the accounts migration (it owns everything from
 * before accounts existed) or here on a fresh install. Until it has a
 * password, it takes APP_PASSWORD, HOUSEHOLD_MEMBERS and INGEST_TOKEN from
 * the environment, so an existing install keeps the same login and Shortcut.
 */
function ensureFirstAccount(d: DB) {
  const members = (process.env.HOUSEHOLD_MEMBERS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  let first = d.select().from(schema.accounts).where(eq(schema.accounts.id, 1)).get();
  if (!first) {
    d.insert(schema.accounts).values({ id: 1, name: "Home", login: "home", isAdmin: true }).run();
    first = d.select().from(schema.accounts).where(eq(schema.accounts.id, 1)).get()!;
  }
  if (!first.passwordHash && process.env.APP_PASSWORD) {
    d.update(schema.accounts)
      .set({
        passwordHash: hashPassword(process.env.APP_PASSWORD),
        members: first.members.length ? first.members : members,
        name: first.name === "Home" && members.length ? members.join(" & ") : first.name,
        ingestToken: first.ingestToken ?? process.env.INGEST_TOKEN ?? newIngestToken(),
      })
      .where(eq(schema.accounts.id, 1))
      .run();
  }
  for (const { id } of d.select({ id: schema.accounts.id }).from(schema.accounts).all()) {
    if (!d.select().from(schema.categories).where(eq(schema.categories.accountId, id)).limit(1).get()) {
      seedCategories(d, id);
    }
  }
}

function open(): DB {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
  const sqlite = new Database(DATABASE_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  // Migrations rebuild tables (SQLite can't alter constraints in place). With
  // foreign keys on, dropping the old table would cascade-delete rows that
  // point at it, and PRAGMA foreign_keys can't be changed inside the
  // migrator's transaction, so switch them off around it and check afterwards.
  sqlite.pragma("foreign_keys = OFF");
  migrate(db, { migrationsFolder: path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle") });
  const broken = sqlite.pragma("foreign_key_check") as unknown[];
  if (broken.length) throw new Error(`Database migration left ${broken.length} broken references`);
  sqlite.pragma("foreign_keys = ON");
  ensureFirstAccount(db);
  return db;
}

// Opened on first use (not at import, so `next build` never touches the file),
// and reused across dev hot reloads.
const g = globalThis as unknown as { __placesDb?: DB };
export function db(): DB {
  return (g.__placesDb ??= open());
}

export { schema };
