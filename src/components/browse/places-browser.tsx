"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Category } from "@/db/schema";
import {
  activeCount,
  applyFilters,
  DEFAULT_FILTERS,
  effectiveSort,
  parseFilters,
  serialiseFilters,
  type Filters,
  type PlaceSummary,
  KM_PER_MILE,
} from "@/lib/filters";
import { STATUS_LABELS } from "@/lib/categories";
import { resolveWhen } from "@/lib/when";
import { locationMessage, useDeviceLocation } from "@/lib/use-location";
import { Icon } from "../icons";
import { PlaceCard } from "../place-card";
import { FilterSheet } from "./filter-sheet";
import { SwipeToDelete } from "./swipe-to-delete";

const PlacesMap = dynamic(() => import("../map/places-map"), {
  ssr: false,
  loading: () => <div className="grid size-full place-items-center text-sm text-muted">Loading map…</div>,
});

const STATUS_TABS = ["want", "been", "all"] as const;

const HEADINGS: Record<Filters["status"], string> = {
  want: "Places to go",
  been: "Places we've been",
  all: "All our places",
};

/** Section headings for the default categories; custom ones use their label. */
const GROUP_TITLES: Record<string, string> = {
  hotel: "Somewhere to stay",
  restaurant: "Something to eat",
  cafe: "Coffee & cake",
  bar: "A drink",
  attraction: "Things to see",
  "day-out": "Days out",
  shop: "Shops",
  other: "Everything else",
};

export function PlacesBrowser({
  places,
  categories,
  tags,
  accountName,
}: {
  places: PlaceSummary[];
  categories: Category[];
  tags: string[];
  accountName: string;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(sp.toString())), [sp]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [asked, setAsked] = useState<{ explanation: string; warning?: string; error?: string; undo?: string } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Filters live in the URL. history.replaceState keeps useSearchParams in sync
  // without a server round trip (filtering happens here in the browser).
  function update(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    window.history.replaceState(null, "", pathname + serialiseFilters(next));
  }

  /** Natural language → filters, applied visibly (they show as chips) with an undo. */
  async function ask() {
    const text = filters.q.trim();
    if (text.length < 3 || asking) return;
    setAsking(true);
    const before = window.location.search;
    try {
      const res = await fetch("/api/nl-filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't work that out");
      update({ ...DEFAULT_FILTERS, ...data.filters, view: filters.view });
      setAsked({ explanation: data.explanation, warning: data.warning, undo: before });
    } catch (e) {
      setAsked({ explanation: "", error: (e as Error).message });
    } finally {
      setAsking(false);
    }
  }

  const { loc, state: locState, request: requestLocation } = useDeviceLocation({
    auto: filters.origin?.kind === "me",
  });
  const originPoint = filters.origin?.kind === "point" ? filters.origin : filters.origin?.kind === "me" ? loc : null;

  const result = useMemo(() => applyFilters(places, filters, originPoint), [places, filters, originPoint]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.slug, c])), [categories]);
  const count = activeCount(filters);
  const fitKey = serialiseFilters({ ...filters, view: "list", sort: null });
  const selected = result.places.find((p) => p.id === selectedId) ?? null;

  // Sorted by most recent: group under friendly category headings, in the
  // household's category order. Sorted by distance or rating: one flat list.
  const groups =
    effectiveSort(filters) === "recent"
      ? categories
          .map((c) => ({
            key: c.slug,
            title: GROUP_TITLES[c.slug] ?? c.label,
            places: result.places.filter((p) => p.category === c.slug),
          }))
          .filter((g) => g.places.length)
      : [{ key: "all", title: null, places: result.places }];
  const when = filters.when ? resolveWhen(filters.when) : null;
  const stay = when ? { checkin: when.checkin, checkout: when.checkout } : null;

  const originLabel = filters.origin?.kind === "me" ? "you" : filters.origin?.label;
  const chips: { key: string; label: string; clear: Partial<Filters> }[] = [
    ...filters.categories.map((slug) => ({
      key: `cat-${slug}`,
      label: `${categoryMap.get(slug)?.emoji ?? ""} ${categoryMap.get(slug)?.label ?? slug}`,
      clear: { categories: filters.categories.filter((c) => c !== slug) },
    })),
    ...(filters.origin
      ? [
          {
            key: "origin",
            label: filters.miles ? `Within ${filters.miles} mi of ${originLabel}` : `Near ${originLabel}`,
            clear: { origin: null, miles: null },
          },
        ]
      : []),
    ...(filters.minRating ? [{ key: "rating", label: `★ ${filters.minRating.toFixed(1)}+`, clear: { minRating: null } }] : []),
    ...(filters.prices.length
      ? [{ key: "price", label: filters.prices.map((p) => "£".repeat(p) || "Free").join(" / "), clear: { prices: [] } }]
      : []),
    ...(when ? [{ key: "when", label: `🗓 ${when.label}`, clear: { when: null } }] : []),
    ...filters.tags.map((t) => ({ key: `tag-${t}`, label: `#${t}`, clear: { tags: filters.tags.filter((x) => x !== t) } })),
  ];

  const locNote = filters.origin?.kind === "me" && !loc ? locationMessage(locState) : null;

  return (
    <main>
      <header className="flex items-end justify-between gap-3 pb-4 pt-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="eyebrow truncate">{accountName}&apos;s list</span>
          <h1 className="font-display text-[50px] leading-none">{HEADINGS[filters.status]}</h1>
        </div>
        <button
          onClick={() => update({ view: filters.view === "map" ? "list" : "map" })}
          aria-label={filters.view === "map" ? "Show list" : "Show map"}
          className="grid size-11 shrink-0 place-items-center rounded-full border border-border"
        >
          <Icon name={filters.view === "map" ? "list" : "map"} className="size-[19px]" />
        </button>
      </header>

      <div className="flex gap-2">
        <label className="flex h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-full bg-surface-2 px-4 focus-within:ring-2 focus-within:ring-accent/40">
          <Icon name="search" className="size-4 shrink-0 text-muted" />
          <input
            type="search"
            value={filters.q}
            onChange={(e) => {
              update({ q: e.target.value });
              setAsked(null);
            }}
            onKeyDown={(e) => {
              // Enter on a sentence-like query asks Claude; short words just search.
              if (e.key === "Enter" && filters.q.trim().split(/\s+/).length >= 3) ask();
            }}
            placeholder="Search, or ask: hotel near me this weekend"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
          />
          {filters.q.trim().length >= 3 && (
            <button
              type="button"
              onClick={ask}
              disabled={asking}
              title="Turn this into filters"
              className="-mr-1.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent disabled:opacity-60"
            >
              <Icon name="sparkles" className={`size-3.5 ${asking ? "animate-pulse" : ""}`} />
              {asking ? "Thinking…" : "Ask"}
            </button>
          )}
        </label>
      </div>

      {asked && (
        <div
          className={`mt-2 flex items-start gap-2 rounded-2xl px-4 py-2.5 text-sm ${
            asked.error ? "bg-danger/10 text-danger" : "bg-accent-soft"
          }`}
        >
          <Icon name="sparkles" className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">
            {asked.error ?? asked.explanation}
            {asked.warning && <span className="block text-xs text-muted">{asked.warning}</span>}
          </span>
          {asked.undo !== undefined && (
            <button
              onClick={() => {
                window.history.replaceState(null, "", pathname + asked.undo);
                setAsked(null);
              }}
              className="shrink-0 font-medium text-accent"
            >
              Undo
            </button>
          )}
        </div>
      )}

      <div className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        <div role="tablist" aria-label="Status" className="flex gap-2">
          {STATUS_TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={t === filters.status}
              onClick={() => update({ status: t })}
              className={`h-[34px] shrink-0 rounded-full px-3.5 text-sm ${
                t === filters.status ? "bg-text font-medium text-bg" : "border border-border"
              }`}
            >
              {t === "all" ? "All" : STATUS_LABELS[t]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSheetOpen(true)}
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm"
        >
          Filters
          {count > 0 && (
            <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] font-bold text-on-accent">
              {count}
            </span>
          )}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="scrollbar-none -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => update(c.clear)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft py-1 pl-3 pr-2 text-sm font-medium text-accent"
            >
              {c.label}
              <Icon name="x" className="size-3.5" />
            </button>
          ))}
          {count > 1 && (
            <button
              onClick={() => update({ ...DEFAULT_FILTERS, view: filters.view, q: filters.q })}
              className="shrink-0 px-2 text-sm text-muted"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span className="tabular-nums">
          {result.places.length} {result.places.length === 1 ? "place" : "places"}
          {result.noLocation > 0 && ` · ${result.noLocation} without a location hidden`}
        </span>
        {locNote && (
          <button onClick={requestLocation} className="font-medium text-accent">
            {locNote}
          </button>
        )}
      </div>

      {filters.view === "map" ? (
        <MapPane>
          <PlacesMap
            places={result.places}
            categories={categories}
            origin={originPoint}
            radiusKm={filters.miles ? filters.miles * KM_PER_MILE : null}
            selectedId={selectedId}
            onSelect={setSelectedId}
            fitKey={fitKey}
          />
          {selected && (
            <div className="absolute inset-x-3 bottom-9">
              <PlaceCard
                place={selected}
                category={categoryMap.get(selected.category)}
                stay={stay}
                framed
                className="shadow-lg"
              />
            </div>
          )}
        </MapPane>
      ) : places.length === 0 ? (
        <Empty
          title="Nothing here yet"
          body="Save somewhere you want to go."
          action={<Link href="/add" className="rounded-full bg-accent px-5 py-2.5 font-medium text-on-accent">Add a place</Link>}
        />
      ) : result.places.length === 0 ? (
        <Empty
          title="No places match"
          body="Try widening the distance or removing a filter."
          action={
            <button
              onClick={() => update({ ...DEFAULT_FILTERS, view: filters.view })}
              className="rounded-full border border-border px-5 py-2.5 font-medium"
            >
              Reset filters
            </button>
          }
        />
      ) : (
        <div className="mt-1 flex flex-col">
          {groups.map((g) => (
            <section key={g.key}>
              {g.title && (
                <div className="flex items-center gap-3 pb-1 pt-5">
                  <h2 className="font-display text-[26px] italic">{g.title}</h2>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <ul className="flex flex-col">
                {g.places.map((p) => (
                  <li key={p.id}>
                    <SwipeToDelete id={p.id} name={p.name}>
                      <PlaceCard place={p} category={categoryMap.get(p.category)} stay={stay} />
                    </SwipeToDelete>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {sheetOpen && (
        <FilterSheet
          filters={filters}
          update={update}
          categories={categories}
          tags={tags}
          resultCount={result.places.length}
          locationState={locState}
          hasDeviceLocation={!!loc}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </main>
  );
}

/** Fills the space between the controls and the bottom nav. */
function MapPane({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(260);
  useLayoutEffect(() => {
    const measure = () => ref.current && setTop(ref.current.getBoundingClientRect().top + window.scrollY);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return (
    <div
      ref={ref}
      className="relative -mx-4 mt-2 overflow-hidden border-y border-border sm:mx-0 sm:rounded-2xl sm:border"
      style={{ height: `calc(100dvh - ${top}px - 66px - env(safe-area-inset-bottom))`, minHeight: 320 }}
    >
      {children}
    </div>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <div className="mt-16 flex flex-col items-center text-center">
      <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
        <Icon name="pin" className="size-7" />
      </span>
      <p className="mt-3 font-display text-3xl">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
      <div className="mt-4">{action}</div>
    </div>
  );
}

