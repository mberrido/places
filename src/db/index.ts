import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
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
 * Every group needs its default categories, a join code and a Shortcut token.
 * Groups from before Google sign-in get the code and token here on first start.
 */
function ensureGroups(d: DB) {
  for (const a of d.select().from(schema.accounts).all()) {
    if (!d.select().from(schema.categories).where(eq(schema.categories.accountId, a.id)).limit(1).get()) {
      seedCategories(d, a.id);
    }
    const patch: Partial<typeof schema.accounts.$inferInsert> = {};
    if (!a.joinCode) {
      patch.joinCode = Array.from(crypto.randomBytes(8), (b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]).join("");
    }
    if (!a.ingestToken) patch.ingestToken = process.env.INGEST_TOKEN || crypto.randomBytes(24).toString("base64url");
    if (Object.keys(patch).length) d.update(schema.accounts).set(patch).where(eq(schema.accounts.id, a.id)).run();
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
  ensureGroups(db);
  return db;
}

// Opened on first use (not at import, so `next build` never touches the file),
// and reused across dev hot reloads.
const g = globalThis as unknown as { __placesDb?: DB };
export function db(): DB {
  return (g.__placesDb ??= open());
}

export { schema };
