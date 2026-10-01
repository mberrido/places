import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { GoogleCache, Place, Status } from "@/db/schema";
import type { PlaceSummary } from "./filters";
import { openDays } from "./hours";
import { fetchPublic } from "./safe-fetch";
import { GoogleUnavailable, forgetDetails, placeDetails, type PlaceDetails } from "./google";

export const STALE_AFTER_MS = 30 * 24 * 3600 * 1000;
const MENU_CATEGORIES = new Set(["restaurant", "cafe", "bar"]);

export type PlaceWithExtras = Place & { google: GoogleCache | null; tags: string[] };

function tagsFor(ids: number[]) {
  const map = new Map<number, string[]>();
  if (!ids.length) return map;
  const rows = db()
    .select()
    .from(schema.placeTags)
    .where(inArray(schema.placeTags.placeId, ids))
    .orderBy(asc(schema.placeTags.tag))
    .all();
  for (const r of rows) map.set(r.placeId, [...(map.get(r.placeId) ?? []), r.tag]);
  return map;
}

// Every function that reads or writes a household's data takes its accountId.

export function listPlaces(accountId: number, opts: { status?: Status | "all" } = {}): PlaceWithExtras[] {
  const rows = db()
    .select()
    .from(schema.places)
    .leftJoin(schema.googleCache, eq(schema.googleCache.placeId, schema.places.id))
    .where(
      and(
        eq(schema.places.accountId, accountId),
        opts.status && opts.status !== "all" ? eq(schema.places.status, opts.status) : undefined,
      ),
    )
    .orderBy(desc(schema.places.createdAt))
    .all();
  const tags = tagsFor(rows.map((r) => r.places.id));
  return rows.map((r) => ({ ...r.places, google: r.google_cache, tags: tags.get(r.places.id) ?? [] }));
}

/** Everything the browse page filters on, for every place. */
export function listSummaries(accountId: number): PlaceSummary[] {
  return listPlaces(accountId, { status: "all" }).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    status: p.status,
    address: p.address,
    city: p.city,
    country: p.country,
    lat: p.lat,
    lng: p.lng,
    tags: p.tags,
    notes: p.notes,
    sourceCaption: p.sourceCaption,
    ourRating: p.ourRating,
    rating: p.google?.rating ?? null,
    ratingCount: p.google?.userRatingCount ?? null,
    priceLevel: p.google?.priceLevel ?? null,
    hasPhoto: !!p.google?.photos?.length,
    openDays: openDays(p.google?.openingHours),
    createdAt: p.createdAt.getTime(),
  }));
}

/** A place in this household's list (null if it's missing or someone else's). */
export function getPlace(accountId: number, id: number): PlaceWithExtras | null {
  const place = placeById(id);
  return place && place.accountId === accountId ? place : null;
}

/** Unscoped: only for internal jobs (refresh, nightly) that act on a known id. */
function placeById(id: number): PlaceWithExtras | null {
  const row = db()
    .select()
    .from(schema.places)
    .leftJoin(schema.googleCache, eq(schema.googleCache.placeId, schema.places.id))
    .where(eq(schema.places.id, id))
    .get();
  if (!row) return null;
  return { ...row.places, google: row.google_cache, tags: tagsFor([id]).get(id) ?? [] };
}

export function findByGoogleId(accountId: number, googlePlaceId: string) {
  return db()
    .select({ id: schema.places.id, name: schema.places.name })
    .from(schema.places)
    .where(and(eq(schema.places.accountId, accountId), eq(schema.places.googlePlaceId, googlePlaceId)))
    .get();
}

/** Of these Google ids, which are already in this household's list → their place ids. */
export function savedGoogleIds(accountId: number, googlePlaceIds: string[]): Record<string, number> {
  if (!googlePlaceIds.length) return {};
  const rows = db()
    .select({ id: schema.places.id, googlePlaceId: schema.places.googlePlaceId })
    .from(schema.places)
    .where(and(eq(schema.places.accountId, accountId), inArray(schema.places.googlePlaceId, googlePlaceIds)))
    .all();
  return Object.fromEntries(rows.map((r) => [r.googlePlaceId!, r.id]));
}

export function getCategories(accountId: number) {
  return db()
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.accountId, accountId))
    .orderBy(asc(schema.categories.sortOrder))
    .all();
}

export function allTags(accountId: number): string[] {
  return db()
    .selectDistinct({ tag: schema.placeTags.tag })
    .from(schema.placeTags)
    .innerJoin(schema.places, eq(schema.places.id, schema.placeTags.placeId))
    .where(eq(schema.places.accountId, accountId))
    .orderBy(asc(schema.placeTags.tag))
    .all()
    .map((r) => r.tag);
}

export function normaliseTags(input: string[] | string): string[] {
  const list = Array.isArray(input) ? input : input.split(",");
  return [...new Set(list.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

export function setTags(placeId: number, tags: string[]) {
  const d = db();
  d.transaction((tx) => {
    tx.delete(schema.placeTags).where(eq(schema.placeTags.placeId, placeId)).run();
    if (tags.length) tx.insert(schema.placeTags).values(tags.map((tag) => ({ placeId, tag }))).run();
  });
}

type NewPlace = typeof schema.places.$inferInsert;

/**
 * Saves a place. Location fields fall back to Google's when not given, and the
 * Google data (if any) is cached alongside it.
 */
export async function insertPlace(fields: NewPlace, details: PlaceDetails | null, tags: string[] = []) {
  const id = db()
    .insert(schema.places)
    .values({
      ...fields,
      address: fields.address ?? details?.address ?? null,
      city: fields.city ?? details?.city ?? null,
      country: fields.country ?? details?.country ?? null,
      lat: fields.lat ?? details?.lat ?? null,
      lng: fields.lng ?? details?.lng ?? null,
    })
    .returning({ id: schema.places.id })
    .get().id;
  setTags(id, tags);
  if (details) {
    const menuUrl = MENU_CATEGORIES.has(fields.category) ? await detectMenuUrl(details.website) : null;
    writeCache(id, details, menuUrl);
  }
  return id;
}

// ---------------------------------------------------------------- Google cache

export function writeCache(placeId: number, d: PlaceDetails, menuUrl: string | null) {
  const values = {
    placeId,
    rating: d.rating,
    userRatingCount: d.userRatingCount,
    priceLevel: d.priceLevel,
    types: d.types,
    primaryType: d.primaryType,
    website: d.website,
    menuUrl,
    googleMapsUrl: d.googleMapsUrl,
    phone: d.phone,
    openingHours: d.openingHours,
    utcOffsetMinutes: d.utcOffsetMinutes,
    photos: d.photos,
    lastRefreshedAt: new Date(),
    lastError: null,
  };
  db()
    .insert(schema.googleCache)
    .values(values)
    .onConflictDoUpdate({ target: schema.googleCache.placeId, set: values })
    .run();
}

export function daysSince(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

export function isStale(cache: GoogleCache | null) {
  return !cache || Date.now() - cache.lastRefreshedAt.getTime() > STALE_AFTER_MS;
}

/**
 * Re-fetch Google data for a place. On failure the old cache is kept and the
 * error recorded, so the app keeps working when Google is down.
 */
export async function refreshPlace(placeId: number, { force = false } = {}) {
  const place = placeById(placeId);
  if (!place?.googlePlaceId) return;
  if (!force && !isStale(place.google)) return;
  if (force) forgetDetails(place.googlePlaceId);
  try {
    const d = await placeDetails(place.googlePlaceId);
    const menuUrl = MENU_CATEGORIES.has(place.category) ? await detectMenuUrl(d.website) : null;
    writeCache(placeId, d, menuUrl ?? place.google?.menuUrl ?? null);
    // Fill in location fields that were blank (e.g. manual entries later linked).
    db()
      .update(schema.places)
      .set({
        address: place.address ?? d.address,
        city: place.city ?? d.city,
        country: place.country ?? d.country,
        lat: place.lat ?? d.lat,
        lng: place.lng ?? d.lng,
      })
      .where(eq(schema.places.id, placeId))
      .run();
  } catch (e) {
    const message = e instanceof GoogleUnavailable ? e.message : String(e);
    console.error(`refresh place ${placeId} failed:`, message);
    if (place.google) {
      db()
        .update(schema.googleCache)
        .set({ lastError: message.slice(0, 500) })
        .where(eq(schema.googleCache.placeId, placeId))
        .run();
    }
  }
}


// ---------------------------------------------------------------- Menu link

/**
 * Best effort: look for an obvious "menu" link on the restaurant's homepage.
 * Returns null on anything unexpected; never throws.
 */
export async function detectMenuUrl(website: string | null): Promise<string | null> {
  if (!website) return null;
  try {
    const base = new URL(website);
    if (!/^https?:$/.test(base.protocol)) return null;
    if (/menu/i.test(base.pathname)) return base.toString();
    const res = await fetchPublic(base, {
      maxBytes: 1_000_000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PlacesApp/1.0)", Accept: "text/html" },
    });
    if (!res?.contentType.includes("html")) return null;
    const html = res.text;
    const links = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const candidates = links
      .map(([, href, text]) => ({ href, text: text.replace(/<[^>]+>/g, " ").trim() }))
      .filter(({ href, text }) => /\bmenus?\b/i.test(text) || /menu/i.test(href))
      .map(({ href }) => {
        try {
          return new URL(href, res.url);
        } catch {
          return null;
        }
      })
      .filter((u): u is URL => !!u && /^https?:$/.test(u.protocol));
    // Prefer same-site links, then PDFs/other hosts (menus are often on a PDF or a booking site).
    const sameHost = candidates.find((u) => u.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, ""));
    return (sameHost ?? candidates[0])?.toString() ?? null;
  } catch {
    return null;
  }
}
