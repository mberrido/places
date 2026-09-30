import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { OpeningHours, PhotoRef } from "@/db/schema";

const BASE = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 8000;

export class GoogleUnavailable extends Error {}

function apiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new GoogleUnavailable("GOOGLE_PLACES_API_KEY isn't set");
  return key;
}

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

/** SKUs we count. Keys are what Settings shows. */
export type GoogleApi = "autocomplete" | "details" | "details_location" | "photo" | "text_search" | "nearby_search";

export function countUsage(api: GoogleApi) {
  const month = new Date().toISOString().slice(0, 7);
  try {
    db()
      .insert(schema.apiUsage)
      .values({ month, api, count: 1 })
      .onConflictDoUpdate({
        target: [schema.apiUsage.month, schema.apiUsage.api],
        set: { count: sql`${schema.apiUsage.count} + 1` },
      })
      .run();
  } catch (e) {
    console.error("usage counter failed", e);
  }
}

async function call<T>(api: GoogleApi, url: string, init: RequestInit & { fieldMask?: string }) {
  const headers = new Headers(init.headers);
  headers.set("X-Goog-Api-Key", apiKey());
  if (init.fieldMask) headers.set("X-Goog-FieldMask", init.fieldMask);
  if (init.body) headers.set("Content-Type", "application/json");
  countUsage(api);
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (e) {
    throw new GoogleUnavailable(`Google ${api} request failed: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GoogleUnavailable(`Google ${api} ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export type LatLng = { lat: number; lng: number };

// ---------------------------------------------------------------- Autocomplete

export type Suggestion = { placeId: string; main: string; secondary: string; types: string[] };

type AutocompleteResponse = {
  suggestions?: {
    placePrediction?: {
      placeId: string;
      text?: { text: string };
      structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
      types?: string[];
    };
  }[];
};

/**
 * Autocomplete (New). With a session token that ends in a Details call, the
 * autocomplete requests in that session are billed as part of the session.
 */
export async function autocomplete(input: string, near: LatLng | null, sessionToken: string) {
  const body: Record<string, unknown> = { input, sessionToken, languageCode: "en-GB" };
  if (near) {
    body.locationBias = {
      circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000 },
    };
    body.origin = { latitude: near.lat, longitude: near.lng };
  }
  const data = await call<AutocompleteResponse>("autocomplete", `${BASE}/places:autocomplete`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return (data.suggestions ?? []).flatMap((s): Suggestion[] => {
    const p = s.placePrediction;
    if (!p) return [];
    return [
      {
        placeId: p.placeId,
        main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondary: p.structuredFormat?.secondaryText?.text ?? "",
        types: p.types ?? [],
      },
    ];
  });
}

// ---------------------------------------------------------------- Details

const DETAILS_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "location",
  "rating",
  "userRatingCount",
  "priceLevel",
  "types",
  "primaryType",
  "websiteUri",
  "googleMapsUri",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "regularOpeningHours",
  "utcOffsetMinutes",
  "photos",
].join(",");

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

type RawPlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  addressComponents?: { longText: string; shortText: string; types: string[] }[];
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  types?: string[];
  primaryType?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  regularOpeningHours?: {
    periods?: OpeningHours["periods"];
    weekdayDescriptions?: string[];
  };
  utcOffsetMinutes?: number;
  photos?: {
    name: string;
    widthPx?: number;
    heightPx?: number;
    authorAttributions?: { displayName: string; uri?: string }[];
  }[];
};

export type PlaceDetails = {
  googlePlaceId: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: number | null;
  types: string[];
  primaryType: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  phone: string | null;
  openingHours: OpeningHours | null;
  utcOffsetMinutes: number | null;
  photos: PhotoRef[];
};

function component(p: RawPlace, ...types: string[]) {
  for (const t of types) {
    const c = p.addressComponents?.find((c) => c.types.includes(t));
    if (c) return c.longText;
  }
  return null;
}

function normalise(p: RawPlace): PlaceDetails {
  return {
    googlePlaceId: p.id,
    name: p.displayName?.text ?? "Unnamed place",
    address: p.formattedAddress ?? null,
    // UK addresses use postal_town rather than locality for the town.
    city: component(p, "postal_town", "locality", "administrative_area_level_2"),
    country: component(p, "country"),
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? null,
    priceLevel: p.priceLevel ? (PRICE_LEVELS[p.priceLevel] ?? null) : null,
    types: p.types ?? [],
    primaryType: p.primaryType ?? null,
    website: p.websiteUri ?? null,
    googleMapsUrl: p.googleMapsUri ?? null,
    phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
    openingHours: p.regularOpeningHours?.periods
      ? {
          periods: p.regularOpeningHours.periods,
          weekdayDescriptions: p.regularOpeningHours.weekdayDescriptions ?? [],
        }
      : null,
    utcOffsetMinutes: p.utcOffsetMinutes ?? null,
    photos: (p.photos ?? []).slice(0, 6).map((ph) => ({
      name: ph.name,
      widthPx: ph.widthPx,
      heightPx: ph.heightPx,
      attributions: (ph.authorAttributions ?? []).map((a) => ({ displayName: a.displayName, uri: a.uri })),
    })),
  };
}

// Short-lived memo so "preview then save" costs one Details call, not two.
const detailsMemo = new Map<string, { at: number; details: PlaceDetails }>();
const MEMO_MS = 10 * 60 * 1000;

export async function placeDetails(googlePlaceId: string, sessionToken?: string) {
  const memo = detailsMemo.get(googlePlaceId);
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.details;

  const url = new URL(`${BASE}/places/${encodeURIComponent(googlePlaceId)}`);
  url.searchParams.set("languageCode", "en-GB");
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const raw = await call<RawPlace>("details", url.toString(), { fieldMask: DETAILS_FIELDS });
  const details = normalise(raw);

  detailsMemo.set(googlePlaceId, { at: Date.now(), details });
  if (detailsMemo.size > 200) detailsMemo.delete(detailsMemo.keys().next().value!);
  return details;
}

export function forgetDetails(googlePlaceId: string) {
  detailsMemo.delete(googlePlaceId);
}

/**
 * Just the coordinates of a place or town (for "distance from…"). Only
 * location fields, so it bills at the cheaper Essentials rate.
 */
export async function placeLocation(googlePlaceId: string, sessionToken?: string) {
  const url = new URL(`${BASE}/places/${encodeURIComponent(googlePlaceId)}`);
  url.searchParams.set("languageCode", "en-GB");
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const raw = await call<RawPlace>("details_location", url.toString(), { fieldMask: "id,displayName,location" });
  if (!raw.location) throw new GoogleUnavailable("Place has no location");
  return { name: raw.displayName?.text ?? "", lat: raw.location.latitude, lng: raw.location.longitude };
}

// ---------------------------------------------------------------- Text search

export type TextSearchResult = {
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

/** "Name + town" → the top few Google matches, for one-tap confirmation. */
export async function textSearch(query: string, max = 3): Promise<TextSearchResult[]> {
  const data = await call<{ places?: RawPlace[] }>("text_search", `${BASE}/places:searchText`, {
    method: "POST",
    body: JSON.stringify({ textQuery: query, pageSize: max, languageCode: "en-GB", regionCode: "GB" }),
    fieldMask: [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.rating",
      "places.userRatingCount",
      "places.primaryType",
      "places.photos",
    ].join(","),
  });
  return (data.places ?? []).map((p) => ({
    googlePlaceId: p.id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? null,
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? null,
    photoName: p.photos?.[0]?.name ?? null,
    primaryType: p.primaryType ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
  }));
}

// ---------------------------------------------------------------- Nearby search

export const NEARBY_GROUPS = {
  food: ["restaurant", "cafe", "bar", "pub", "bakery", "coffee_shop", "wine_bar"],
  stay: ["hotel", "resort_hotel", "bed_and_breakfast", "guest_house", "inn", "motel"],
  do: ["tourist_attraction", "museum", "art_gallery", "park", "historical_landmark", "zoo", "aquarium", "amusement_park"],
} as const;
export type NearbyGroup = keyof typeof NEARBY_GROUPS | "all";

/** "We just drove past something good": what's within `radius` metres, nearest first. */
export async function nearbySearch(center: LatLng, radius: number, group: NearbyGroup) {
  const types =
    group === "all" ? [...NEARBY_GROUPS.food, ...NEARBY_GROUPS.stay, ...NEARBY_GROUPS.do] : [...NEARBY_GROUPS[group]];
  const data = await call<{ places?: RawPlace[] }>("nearby_search", `${BASE}/places:searchNearby`, {
    method: "POST",
    body: JSON.stringify({
      includedTypes: types,
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      languageCode: "en-GB",
      locationRestriction: {
        circle: { center: { latitude: center.lat, longitude: center.lng }, radius: Math.min(Math.max(radius, 50), 5000) },
      },
    }),
    fieldMask: [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.rating",
      "places.userRatingCount",
      "places.primaryType",
      "places.photos",
    ].join(","),
  });
  return (data.places ?? []).map((p) => ({
    googlePlaceId: p.id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? null,
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? null,
    photoName: p.photos?.[0]?.name ?? null,
    primaryType: p.primaryType ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
  })) satisfies TextSearchResult[];
}

// ---------------------------------------------------------------- Photos

/** Fetches photo bytes from the Places Photo endpoint (follows Google's redirect to the image). */
export async function fetchPhoto(photoName: string, maxWidthPx: number) {
  const url = new URL(`${BASE}/${photoName}/media`);
  url.searchParams.set("maxWidthPx", String(maxWidthPx));
  url.searchParams.set("key", apiKey());
  countUsage("photo");
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new GoogleUnavailable(`Google photo ${res.status}`);
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") ?? "image/jpeg",
  };
}
