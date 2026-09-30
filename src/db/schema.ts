import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const STATUSES = ["want", "been", "not_interested"] as const;
export type Status = (typeof STATUSES)[number];

export const SOURCES = ["instagram", "manual", "shared", "other"] as const;
export type Source = (typeof SOURCES)[number];

const now = sql`(unixepoch() * 1000)`;

/**
 * A household: its own login, places, categories, inbox and Shortcut token.
 * Account 1 is created by a migration and gets its password from APP_PASSWORD
 * on first start; it's the admin that can add the others.
 */
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // shown to others, e.g. "Mal & Sam"
  login: text("login").notNull().unique(), // typed at login, lowercase
  passwordHash: text("password_hash"), // scrypt; null only before first start
  members: text("members", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  ingestToken: text("ingest_token").unique(), // for this household's iOS Shortcut
  sessionVersion: integer("session_version").notNull().default(1), // bump to log everyone out
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
});

/** Editable category list, per account. `slug` is what places reference. */
export const categories = sqliteTable(
  "categories",
  {
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    emoji: text("emoji").notNull().default("📍"),
    color: text("color").notNull().default("#64748b"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.slug] })],
);

export const places = sqliteTable(
  "places",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    // Stored permanently; everything else from Google lives in google_cache.
    googlePlaceId: text("google_place_id"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    lat: real("lat"),
    lng: real("lng"),
    status: text("status", { enum: STATUSES }).notNull().default("want"),
    notes: text("notes"),
    source: text("source", { enum: SOURCES }).notNull().default("manual"),
    sourceUrl: text("source_url"),
    sourceCaption: text("source_caption"),
    ourRating: integer("our_rating"),
    visitedAt: text("visited_at"), // YYYY-MM-DD
    addedBy: text("added_by"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    foreignKey({
      columns: [t.accountId, t.category],
      foreignColumns: [categories.accountId, categories.slug],
    }).onUpdate("cascade"),
    uniqueIndex("places_account_google_idx").on(t.accountId, t.googlePlaceId),
    index("places_account_status_idx").on(t.accountId, t.status),
    index("places_category_idx").on(t.category),
  ],
);

export const placeTags = sqliteTable(
  "place_tags",
  {
    placeId: integer("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.tag] }), index("place_tags_tag_idx").on(t.tag)],
);

export type OpeningPeriod = {
  open: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
};
export type OpeningHours = { periods: OpeningPeriod[]; weekdayDescriptions: string[] };
export type PhotoRef = {
  name: string;
  widthPx?: number;
  heightPx?: number;
  attributions: { displayName: string; uri?: string }[];
};

/**
 * Google Places content. Refreshable cache, not a permanent copy: Google's terms
 * allow keeping place_id indefinitely but the rest should be refreshed.
 */
export const googleCache = sqliteTable("google_cache", {
  placeId: integer("place_id")
    .primaryKey()
    .references(() => places.id, { onDelete: "cascade" }),
  rating: real("rating"),
  userRatingCount: integer("user_rating_count"),
  priceLevel: integer("price_level"), // 0 (free) – 4 (very expensive)
  types: text("types", { mode: "json" }).$type<string[]>(),
  primaryType: text("primary_type"),
  website: text("website"),
  menuUrl: text("menu_url"),
  googleMapsUrl: text("google_maps_url"),
  phone: text("phone"),
  openingHours: text("opening_hours", { mode: "json" }).$type<OpeningHours | null>(),
  utcOffsetMinutes: integer("utc_offset_minutes"),
  photos: text("photos", { mode: "json" }).$type<PhotoRef[]>(),
  lastRefreshedAt: integer("last_refreshed_at", { mode: "timestamp_ms" }).notNull(),
  lastError: text("last_error"),
});

/** Monthly count of Google API calls per SKU, shown in Settings. */
export const apiUsage = sqliteTable(
  "api_usage",
  {
    month: text("month").notNull(), // YYYY-MM
    api: text("api").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.month, t.api] })],
);

export const INGEST_STATUSES = ["pending", "processing", "ready", "needs_text", "failed", "done", "dismissed"] as const;
export type IngestStatus = (typeof INGEST_STATUSES)[number];

/** A Google match offered for confirmation. */
export type Candidate = {
  googlePlaceId: string;
  name: string;
  address: string | null;
  rating: number | null;
  userRatingCount: number | null;
  photoName: string | null;
  primaryType: string | null;
  lat: number | null;
  lng: number | null;
};

/** One place Claude found in a post, with its Google matches. */
export type ExtractedPlace = {
  name: string;
  area: string | null;
  country: string | null;
  category: string;
  confidence: "high" | "medium" | "low";
  query: string;
  candidates: Candidate[];
};

/**
 * An Instagram post (or pasted caption) on its way to becoming saved places:
 * fetched → extracted by Claude → matched on Google → confirmed in the inbox.
 */
export const ingests = sqliteTable(
  "ingests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    url: text("url"),
    via: text("via", { enum: ["link", "caption", "shortcut", "bookmarklet", "screenshot"] }).notNull(),
    status: text("status", { enum: INGEST_STATUSES }).notNull().default("pending"),
    account: text("account"), // the Instagram handle, not a Places account
    caption: text("caption"),
    fetchedWith: text("fetched_with"), // which method got the text, for debugging
    places: text("places", { mode: "json" }).$type<ExtractedPlace[]>(),
    summary: text("summary"), // Claude's one-line read of the post
    error: text("error"),
    savedPlaceIds: text("saved_place_ids", { mode: "json" }).$type<number[]>(),
    addedBy: text("added_by"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("ingests_account_status_idx").on(t.accountId, t.status)],
);

export const SHARE_STATUSES = ["pending", "saved", "dismissed"] as const;

/**
 * A place one household sent to another. The recipient gets a copy of the
 * details (not a link to the sender's row), sees it in their inbox, and saves
 * it into their own list or dismisses it.
 */
export const shares = sqliteTable(
  "shares",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fromAccountId: integer("from_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    toAccountId: integer("to_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    fromPlaceId: integer("from_place_id").references(() => places.id, { onDelete: "set null" }),
    sharedBy: text("shared_by"), // the member's name, e.g. "Mal"
    note: text("note"),
    name: text("name").notNull(),
    category: text("category").notNull(), // the sender's slug; mapped on save
    googlePlaceId: text("google_place_id"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    lat: real("lat"),
    lng: real("lng"),
    rating: real("rating"),
    photoName: text("photo_name"), // for the inbox card; fetched through the photo proxy
    sourceUrl: text("source_url"),
    status: text("status", { enum: SHARE_STATUSES }).notNull().default("pending"),
    savedPlaceId: integer("saved_place_id").references(() => places.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("shares_to_status_idx").on(t.toAccountId, t.status)],
);

export type Account = typeof accounts.$inferSelect;
export type Share = typeof shares.$inferSelect;
export type Place = typeof places.$inferSelect;
export type Ingest = typeof ingests.$inferSelect;
export type GoogleCache = typeof googleCache.$inferSelect;
export type Category = typeof categories.$inferSelect;
