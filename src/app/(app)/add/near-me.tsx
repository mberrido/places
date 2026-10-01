"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TextSearchResult } from "@/lib/google";
import { formatKm, haversineKm } from "@/lib/filters";
import { locationMessage, useDeviceLocation } from "@/lib/use-location";
import { Icon } from "@/components/icons";
import { GoogleRating } from "@/components/place-bits";

const GROUPS = [
  ["all", "Everything"],
  ["food", "Food & drink"],
  ["stay", "Hotels"],
  ["do", "Things to do"],
] as const;

/**
 * "We just drove past something good": what's around the phone right now,
 * nearest first. Tapping one hands its Google id to the normal save form.
 */
export function NearMe({ onPick }: { onPick: (googlePlaceId: string) => Promise<void> }) {
  const { loc, state, request } = useDeviceLocation({ auto: true });
  const [group, setGroup] = useState<(typeof GROUPS)[number][0]>("all");
  const [radius, setRadius] = useState(500);
  const [data, setData] = useState<{ key: string; results: TextSearchResult[]; saved: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const key = loc ? `${loc.lat},${loc.lng},${group},${radius}` : null;

  useEffect(() => {
    if (!loc || !key) return;
    const ctrl = new AbortController();
    const params = new URLSearchParams({ lat: String(loc.lat), lng: String(loc.lng), type: group, radius: String(radius) });
    fetch(`/api/google/nearby?${params}`, { signal: ctrl.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Search failed");
        setData({ key, results: d.results, saved: d.saved });
        setError(null);
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message));
    return () => ctrl.abort();
  }, [loc, key, group, radius]);

  const loading = !!key && data?.key !== key && !error;
  const message = locationMessage(state);

  if (!loc) {
    return (
      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
          <Icon name="locate" className="size-7" />
        </span>
        <p className="text-sm text-muted">{message ?? "Finding where you are…"}</p>
        {(state === "denied" || state === "unavailable") && (
          <button onClick={request} className="rounded-full border border-border px-4 py-2 text-sm font-medium">
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {GROUPS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setGroup(value)}
            aria-pressed={group === value}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${
              group === value ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>Within {radius < 1000 ? `${radius} m` : `${radius / 1000} km`} of you, nearest first</span>
        <button onClick={() => setRadius(radius === 500 ? 2000 : 500)} className="font-medium text-accent">
          {radius === 500 ? "Look wider (2 km)" : "Just nearby (500 m)"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-full bg-accent-soft p-3 text-sm">{error}</p>}
      {loading && <p className="mt-6 text-center text-sm text-muted">Looking around…</p>}
      {!loading && data?.results.length === 0 && (
        <p className="mt-6 text-center text-sm text-muted">Nothing found here. Try looking wider.</p>
      )}

      {!loading && data && data.results.length > 0 && (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {data.results.map((r) => {
            const savedId = data.saved[r.googlePlaceId];
            const km = r.lat != null && r.lng != null ? haversineKm(loc, { lat: r.lat, lng: r.lng }) : null;
            const body = (
              <>
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                  <Icon name="pin" className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                    {km != null && <span className="shrink-0 text-xs text-muted tabular-nums">{formatKm(km)}</span>}
                  </span>
                  <span className="block truncate text-xs text-muted">{r.address}</span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <GoogleRating rating={r.rating} count={r.userRatingCount} />
                    {savedId && <span className="text-xs font-semibold text-accent">Saved</span>}
                  </span>
                </span>
                {picking === r.googlePlaceId && (
                  <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-accent" />
                )}
              </>
            );
            return (
              <li key={r.googlePlaceId}>
                {savedId ? (
                  <Link href={`/places/${savedId}`} className="flex items-center gap-3 p-2.5 active:bg-surface-2">
                    {body}
                  </Link>
                ) : (
                  <button
                    disabled={!!picking}
                    onClick={async () => {
                      setPicking(r.googlePlaceId);
                      try {
                        await onPick(r.googlePlaceId);
                      } finally {
                        setPicking(null);
                      }
                    }}
                    className="flex w-full items-center gap-3 p-2.5 text-left active:bg-surface-2"
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {data && data.results.length > 0 && <p className="mt-2 text-right text-xs text-muted">Results from Google</p>}
    </div>
  );
}
