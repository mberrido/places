"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Category } from "@/db/schema";
import type { Suggestion } from "@/lib/google";
import { STATUS_LABELS } from "@/lib/categories";
import {
  DEFAULT_FILTERS,
  DISTANCE_PRESETS,
  effectiveSort,
  RATING_PRESETS,
  type Filters,
  type Sort,
} from "@/lib/filters";
import { locationMessage, newSessionToken, type LocationState } from "@/lib/use-location";
import { addDays, ymd, type When } from "@/lib/when";
import { Icon } from "../icons";

const SORTS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Recently added" },
  { value: "distance", label: "Distance" },
  { value: "rating", label: "Google rating" },
];

function toggle<T>(list: T[], v: T) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function FilterSheet({
  filters: f,
  update,
  categories,
  tags,
  resultCount,
  locationState,
  hasDeviceLocation,
  onClose,
}: {
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  categories: Category[];
  tags: string[];
  resultCount: number;
  locationState: LocationState;
  hasDeviceLocation: boolean;
  onClose: () => void;
}) {
  const [choosingPlace, setChoosingPlace] = useState(false);
  const [customKm, setCustomKm] = useState(
    f.km && !DISTANCE_PRESETS.includes(f.km) ? String(f.km) : "",
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const sort = effectiveSort(f);
  const locMsg = f.origin?.kind === "me" && !hasDeviceLocation ? locationMessage(locationState) : null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal aria-label="Filters">
      <button aria-label="Close filters" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex max-h-[88dvh] flex-col rounded-t-3xl bg-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <button
            onClick={() => update({ ...DEFAULT_FILTERS, view: f.view, q: f.q })}
            className="text-sm font-medium text-muted"
          >
            Reset
          </button>
          <h2 className="font-semibold">Filters</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full bg-surface-2">
            <Icon name="x" className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          <Section title="Distance">
            <div className="flex gap-2">
              <Pill
                active={f.origin?.kind === "me"}
                onClick={() => update({ origin: f.origin?.kind === "me" ? null : { kind: "me" } })}
              >
                <Icon name="locate" className="size-4" /> My location
              </Pill>
              <Pill active={f.origin?.kind === "point"} onClick={() => setChoosingPlace(true)}>
                <Icon name="pin" className="size-4" />
                <span className="max-w-36 truncate">{f.origin?.kind === "point" ? f.origin.label : "Choose a place…"}</span>
              </Pill>
            </div>
            {locMsg && <p className="mt-2 text-sm text-danger">{locMsg}</p>}
            {choosingPlace && (
              <OriginSearch
                onPick={(o) => {
                  update({ origin: { kind: "point", ...o } });
                  setChoosingPlace(false);
                }}
                onCancel={() => setChoosingPlace(false)}
              />
            )}
            {f.origin && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Pill active={!f.km} onClick={() => update({ km: null })}>
                  Any
                </Pill>
                {DISTANCE_PRESETS.map((km) => (
                  <Pill
                    key={km}
                    active={f.km === km}
                    onClick={() => {
                      setCustomKm("");
                      update({ km });
                    }}
                  >
                    {km} km
                  </Pill>
                ))}
                <label className="inline-flex items-center gap-1 rounded-full border border-border bg-surface py-1 pl-3 pr-2 text-sm">
                  <input
                    inputMode="numeric"
                    value={customKm}
                    placeholder="Custom"
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d.]/g, "");
                      setCustomKm(v);
                      const n = Number(v);
                      if (n > 0) update({ km: n });
                    }}
                    className="w-16 bg-transparent text-sm outline-none"
                    style={{ fontSize: 16 }}
                  />
                  km
                </label>
              </div>
            )}
          </Section>

          <WhenSection when={f.when} onChange={(when) => update({ when })} />

          <Section title="Category">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => {
                const on = f.categories.includes(c.slug);
                return (
                  <button
                    key={c.slug}
                    onClick={() => update({ categories: toggle(f.categories, c.slug) })}
                    aria-pressed={on}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium"
                    style={on ? { backgroundColor: `${c.color}24`, borderColor: c.color, color: c.color } : undefined}
                  >
                    <span aria-hidden>{c.emoji}</span>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Google rating">
            <div className="flex flex-wrap gap-1.5">
              <Pill active={!f.minRating} onClick={() => update({ minRating: null })}>
                Any
              </Pill>
              {RATING_PRESETS.map((r) => (
                <Pill key={r} active={f.minRating === r} onClick={() => update({ minRating: r })}>
                  ★ {r.toFixed(1)}+
                </Pill>
              ))}
            </div>
          </Section>

          <Section title="Price">
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4].map((p) => (
                <Pill key={p} active={f.prices.includes(p)} onClick={() => update({ prices: toggle(f.prices, p) })}>
                  {"£".repeat(p)}
                </Pill>
              ))}
            </div>
            {(f.minRating || f.prices.length > 0) && (
              <p className="mt-2 text-xs text-muted">Places without Google data are hidden by rating and price filters.</p>
            )}
          </Section>

          <Section title="Status">
            <div className="flex flex-wrap gap-1.5">
              {(["want", "been", "all"] as const).map((s) => (
                <Pill key={s} active={f.status === s} onClick={() => update({ status: s })}>
                  {s === "all" ? "Any" : STATUS_LABELS[s]}
                </Pill>
              ))}
            </div>
          </Section>

          {tags.length > 0 && (
            <Section title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Pill key={t} active={f.tags.includes(t)} onClick={() => update({ tags: toggle(f.tags, t) })}>
                    #{t}
                  </Pill>
                ))}
              </div>
              {f.tags.length > 1 && <p className="mt-2 text-xs text-muted">Showing places with all selected tags.</p>}
            </Section>
          )}

          <Section title="Sort by">
            <div className="flex flex-wrap gap-1.5">
              {SORTS.map((s) => (
                <Pill
                  key={s.value}
                  active={sort === s.value}
                  onClick={() =>
                    update(
                      s.value === "distance" && !f.origin
                        ? { sort: "distance", origin: { kind: "me" } }
                        : { sort: s.value },
                    )
                  }
                >
                  {s.label}
                </Pill>
              ))}
            </div>
          </Section>
        </div>

        <div className="border-t border-border px-4 pt-3" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
          <button onClick={onClose} className="w-full rounded-full bg-accent py-3 font-semibold text-on-accent">
            Show {resultCount} {resultCount === 1 ? "place" : "places"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-border py-4 last:border-0">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium ${
        active ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface"
      }`}
    >
      {children}
    </button>
  );
}

/** Pick a town or place from Google as the "distance from" point. */
function OriginSearch({
  onPick,
  onCancel,
}: {
  onPick: (o: { lat: number; lng: number; label: string }) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [token] = useState(newSessionToken);
  const visible = q.trim().length >= 2 ? results : [];

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/google/autocomplete?${new URLSearchParams({ q, session: token })}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => {
          setResults(d.suggestions ?? []);
          setError(d.unavailable ?? null);
        })
        .catch((e) => e.name !== "AbortError" && setError("Search failed"));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, token]);

  async function pick(s: Suggestion) {
    const res = await fetch(`/api/google/locate?${new URLSearchParams({ id: s.placeId, session: token })}`);
    const d = await res.json();
    if (!res.ok) return setError(d.error ?? "Couldn't look that up");
    onPick({ lat: d.lat, lng: d.lng, label: s.main });
  }

  return (
    <div className="mt-3 rounded-2xl border border-border bg-surface p-2">
      <div className="flex items-center gap-2 px-1">
        <Icon name="search" className="size-4 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Town, postcode or place"
          className="min-w-0 flex-1 bg-transparent py-1.5 outline-none"
        />
        <button onClick={onCancel} className="text-sm text-muted">
          Cancel
        </button>
      </div>
      {error && <p className="px-1 pt-1 text-sm text-danger">{error}</p>}
      {visible.length > 0 && (
        <ul className="mt-1 divide-y divide-border border-t border-border">
          {visible.map((s) => (
            <li key={s.placeId}>
              <button onClick={() => pick(s)} className="w-full px-1 py-2 text-left">
                <span className="block truncate text-sm font-medium">{s.main}</span>
                <span className="block truncate text-xs text-muted">{s.secondary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const WHEN_PRESETS: { kind: "today" | "weekend" | "nextweekend"; label: string }[] = [
  { kind: "today", label: "Today" },
  { kind: "weekend", label: "This weekend" },
  { kind: "nextweekend", label: "Next weekend" },
];

/** Open on these days (restaurants, attractions…); dates for booking links (hotels). */
function WhenSection({ when, onChange }: { when: When | null; onChange: (w: When | null) => void }) {
  const [today] = useState(() => ymd(new Date()));
  const range = when?.kind === "range" ? when : null;
  return (
    <Section title="When">
      <div className="flex flex-wrap gap-1.5">
        <Pill active={!when} onClick={() => onChange(null)}>
          Any time
        </Pill>
        {WHEN_PRESETS.map((p) => (
          <Pill key={p.kind} active={when?.kind === p.kind} onClick={() => onChange({ kind: p.kind })}>
            {p.label}
          </Pill>
        ))}
        <Pill
          active={!!range}
          onClick={() =>
            onChange(range ? null : { kind: "range", from: today, to: ymd(addDays(new Date(), 1)) })
          }
        >
          Pick dates
        </Pill>
      </div>
      {range && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">
            From
            <input
              type="date"
              value={range.from}
              min={today}
              onChange={(e) =>
                e.target.value &&
                onChange({ kind: "range", from: e.target.value, to: range.to < e.target.value ? e.target.value : range.to })
              }
              className="mt-1 block w-full rounded-xl border border-border bg-surface px-2 py-2 text-text"
            />
          </label>
          <label className="text-xs text-muted">
            To
            <input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => e.target.value && onChange({ ...range, to: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-border bg-surface px-2 py-2 text-text"
            />
          </label>
        </div>
      )}
      {when && (
        <p className="mt-2 text-xs text-muted">
          Hides places closed on those days (places with no hours on Google stay, marked &ldquo;Hours unknown&rdquo;).
          Hotels aren&apos;t filtered; their booking links use these dates.
        </p>
      )}
    </Section>
  );
}
