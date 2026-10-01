// Filter state for the browse page. Lives in the URL so views can be bookmarked,
// and is applied in the browser (a household's list is small, and "near me"
// needs the device's location anyway).

import type { Status } from "@/db/schema";
import { resolveWhen, WEEKDAY_SHORT, type When } from "./when";

/** What the browse page needs about each place (a slim, serialisable row). */
export type PlaceSummary = {
  id: number;
  name: string;
  category: string;
  status: Status;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  tags: string[];
  notes: string | null;
  sourceCaption: string | null;
  ourRating: number | null;
  rating: number | null;
  ratingCount: number | null;
  priceLevel: number | null;
  hasPhoto: boolean;
  /** Weekdays it opens (0 = Sunday); null = hours unknown. */
  openDays: number[] | null;
  createdAt: number;
};

export type Origin = { kind: "me" } | { kind: "point"; lat: number; lng: number; label: string };
export type Sort = "recent" | "distance" | "rating";
export type View = "list" | "map";

export type Filters = {
  q: string;
  status: "want" | "been" | "all";
  categories: string[];
  origin: Origin | null;
  km: number | null;
  minRating: number | null;
  prices: number[];
  tags: string[];
  when: When | null;
  sort: Sort | null; // null = default (distance when there's an origin, else recent)
  view: View;
};

export const DISTANCE_PRESETS = [5, 10, 25, 50, 100];
export const RATING_PRESETS = [3.5, 4, 4.5];

const STATUS_VALUES = ["want", "been", "all"] as const;

function list(v: string | null) {
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function num(v: string | null) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseFilters(sp: URLSearchParams): Filters {
  const status = sp.get("status");
  const sort = sp.get("sort");
  let origin: Origin | null = null;
  const near = sp.get("near");
  if (near === "me") origin = { kind: "me" };
  else if (near) {
    const [lat, lng] = near.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      origin = { kind: "point", lat, lng, label: sp.get("nearName") || "chosen place" };
    }
  }
  return {
    q: sp.get("q") ?? "",
    status: (STATUS_VALUES as readonly string[]).includes(status ?? "") ? (status as Filters["status"]) : "want",
    categories: list(sp.get("cat")),
    origin,
    km: num(sp.get("km")),
    minRating: num(sp.get("rating")),
    prices: list(sp.get("price")).map(Number).filter((n) => n >= 0 && n <= 4),
    tags: list(sp.get("tags")),
    when: parseWhen(sp),
    sort: sort === "recent" || sort === "distance" || sort === "rating" ? sort : null,
    view: sp.get("view") === "map" ? "map" : "list",
  };
}

function parseWhen(sp: URLSearchParams): When | null {
  const w = sp.get("when");
  if (w === "today" || w === "weekend" || w === "nextweekend") return { kind: w };
  const from = sp.get("from");
  if (w === "dates" && from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    const to = sp.get("to");
    return { kind: "range", from, to: to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : from };
  }
  return null;
}

export function serialiseFilters(f: Filters): string {
  const sp = new URLSearchParams();
  if (f.view === "map") sp.set("view", "map");
  if (f.q.trim()) sp.set("q", f.q);
  if (f.status !== "want") sp.set("status", f.status);
  if (f.categories.length) sp.set("cat", f.categories.join(","));
  if (f.origin?.kind === "me") sp.set("near", "me");
  if (f.origin?.kind === "point") {
    sp.set("near", `${f.origin.lat.toFixed(5)},${f.origin.lng.toFixed(5)}`);
    sp.set("nearName", f.origin.label);
  }
  if (f.km && f.origin) sp.set("km", String(f.km));
  if (f.minRating) sp.set("rating", String(f.minRating));
  if (f.prices.length) sp.set("price", f.prices.join(","));
  if (f.tags.length) sp.set("tags", f.tags.join(","));
  if (f.when?.kind === "range") {
    sp.set("when", "dates");
    sp.set("from", f.when.from);
    sp.set("to", f.when.to);
  } else if (f.when) sp.set("when", f.when.kind);
  if (f.sort) sp.set("sort", f.sort);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const DEFAULT_FILTERS: Filters = parseFilters(new URLSearchParams());

/** Number of filters that narrow the list (for the badge on the Filters button). */
export function activeCount(f: Filters) {
  return (
    (f.status !== "want" ? 1 : 0) +
    (f.categories.length ? 1 : 0) +
    (f.origin ? 1 : 0) +
    (f.minRating ? 1 : 0) +
    (f.prices.length ? 1 : 0) +
    (f.tags.length ? 1 : 0) +
    (f.when ? 1 : 0)
  );
}

export function effectiveSort(f: Filters): Sort {
  return f.sort ?? (f.origin ? "distance" : "recent");
}

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * `hours` is set when a "when" filter is on: "unknown" (no hours from Google;
 * kept but flagged), or the days in range it's open if that's only some of them.
 * Hotels are never filtered by hours; for them the dates feed booking links.
 */
export type Filtered = PlaceSummary & {
  distanceKm: number | null;
  hours: { unknown: true } | { openOn: string[] } | { closedOn: string[] } | null;
};

/**
 * Applies filters and sorting. `originPoint` is the resolved origin (for "me",
 * the device location once known). Places without coordinates can't be
 * distance-filtered, so they're counted in `noLocation` rather than silently lost.
 */
export function applyFilters(places: PlaceSummary[], f: Filters, originPoint: { lat: number; lng: number } | null) {
  const q = f.q.trim().toLowerCase();
  const cats = new Set(f.categories);
  const when = f.when ? resolveWhen(f.when) : null;
  // The weekdays in range, in calendar order (e.g. Fri, Sat, Sun).
  const rangeDays = when ? [...new Set(when.days.map((d) => d.getDay()))] : [];
  const prices = new Set(f.prices);
  let noLocation = 0;

  const out: Filtered[] = [];
  for (const p of places) {
    if (f.status !== "all" && p.status !== f.status) continue;
    if (cats.size && !cats.has(p.category)) continue;
    if (f.minRating && (p.rating == null || p.rating < f.minRating)) continue;
    if (prices.size && (p.priceLevel == null || !prices.has(p.priceLevel))) continue;
    if (f.tags.length && !f.tags.every((t) => p.tags.includes(t))) continue;
    if (q) {
      const hay = [p.name, p.city, p.country, p.address, p.notes, p.sourceCaption, ...p.tags]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
      if (!q.split(/\s+/).every((word) => hay.includes(word))) continue;
    }
    const distanceKm =
      originPoint && p.lat != null && p.lng != null ? haversineKm(originPoint, { lat: p.lat, lng: p.lng }) : null;
    if (f.km && originPoint) {
      if (distanceKm == null) {
        noLocation++;
        continue;
      }
      if (distanceKm > f.km) continue;
    }
    let hours: Filtered["hours"] = null;
    if (when && p.category !== "hotel") {
      if (!p.openDays) hours = { unknown: true };
      else {
        const open = rangeDays.filter((d) => p.openDays!.includes(d));
        const closed = rangeDays.filter((d) => !p.openDays!.includes(d));
        if (!open.length) continue;
        // Say whichever is shorter: "Sat only" or "Closed Sat & Sun".
        if (closed.length) {
          hours =
            open.length <= closed.length
              ? { openOn: open.map((d) => WEEKDAY_SHORT[d]) }
              : { closedOn: closed.map((d) => WEEKDAY_SHORT[d]) };
        }
      }
    }
    out.push({ ...p, distanceKm, hours });
  }

  const sort = effectiveSort(f);
  out.sort((a, b) => {
    if (sort === "distance") return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    if (sort === "rating") return (b.rating ?? -1) - (a.rating ?? -1) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
    return b.createdAt - a.createdAt;
  });

  return { places: out, noLocation };
}

export function formatKm(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
