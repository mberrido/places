"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import type { Category, Status } from "@/db/schema";
import type { PlaceDetails, Suggestion } from "@/lib/google";
import { STATUS_LABELS } from "@/lib/categories";
import { Icon } from "@/components/icons";
import { GoogleRating, PriceLevel } from "@/components/place-bits";
import { TagInput } from "@/components/tag-input";
import { locationMessage, newSessionToken, useDeviceLocation, type LatLng } from "@/lib/use-location";
import { createPlace, type NewPlaceInput } from "../actions";
import { ScreenshotButton } from "@/components/screenshot-button";
import { IngestBox } from "./ingest-box";
import { NearMe } from "./near-me";

const PinPicker = dynamic(() => import("@/components/map/pin-picker"), { ssr: false });

type Preview = {
  details: PlaceDetails;
  suggestedCategory: string;
  existing: { id: number; name: string } | null;
};

export function AddPlace({
  categories,
  tags,
  googleEnabled,
  initialQuery = "",
  initialTab = "search",
  initialLink = "",
}: {
  categories: Category[];
  tags: string[];
  googleEnabled: boolean;
  initialQuery?: string;
  initialTab?: "search" | "nearby" | "link";
  initialLink?: string;
}) {
  const [tab, setTab] = useState(initialTab);
  const [mode, setMode] = useState<"search" | "manual">(googleEnabled ? "search" : "manual");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [token] = useState(newSessionToken);
  const [nearbyError, setNearbyError] = useState<string | null>(null);

  return (
    <main>
      <header className="flex items-center gap-2 pb-4 pt-6">
        {preview && (
          <button
            onClick={() => setPreview(null)}
            aria-label="Back to search"
            className="-ml-2 grid size-9 place-items-center rounded-full active:bg-surface-2"
          >
            <Icon name="back" className="size-6" />
          </button>
        )}
        <h1 className="font-display text-[44px] leading-none">Add a place</h1>
      </header>

      {!preview && (
        <div role="tablist" className="mb-4 flex gap-1 rounded-xl bg-surface-2 p-1">
          {(
            [
              ["search", "Search", "search"],
              ["nearby", "Near me", "locate"],
              ["link", "Link", "globe"],
            ] as const
          ).map(([value, label, icon]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium ${
                tab === value ? "bg-surface shadow-sm" : "text-muted"
              }`}
            >
              <Icon name={icon} className="size-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "nearby" && !preview ? (
        <>
          <NearMe
            onPick={async (id) => {
              setNearbyError(null);
              try {
                const res = await fetch(`/api/google/details?${new URLSearchParams({ id })}`);
                const data = await res.json();
                if (res.ok) setPreview(data);
                else setNearbyError(data.error ?? "Couldn't load that place");
              } catch {
                setNearbyError("Couldn't load that place. Check your connection.");
              }
            }}
          />
          {nearbyError && <p className="mt-2 text-sm text-danger">{nearbyError}</p>}
        </>
      ) : tab === "link" && !preview ? (
        <>
          <IngestBox initial={initialLink} />
          <ScreenshotButton className="mt-2" />
          <p className="mt-3 text-sm text-muted">
            Paste an Instagram post or profile, a hotel or restaurant&apos;s website, or an article like &ldquo;best
            pubs in the Cotswolds&rdquo;. Claude reads it and finds the places for you to confirm. If a link
            doesn&apos;t work, a screenshot does.
          </p>
        </>
      ) : preview ? (
        <PlaceForm
          categories={categories}
          tags={tags}
          preview={preview}
          sessionToken={token}
        />
      ) : mode === "search" ? (
        <>
          <SearchGoogle sessionToken={token} initialQuery={initialQuery} onPick={(p) => setPreview(p)} />
          <button
            onClick={() => setMode("manual")}
            className="mt-6 w-full rounded-xl border border-dashed border-border py-3 text-sm text-muted"
          >
            Can&apos;t find it? Add it manually
          </button>
        </>
      ) : (
        <>
          {!googleEnabled && (
            <p className="mb-4 rounded-full bg-accent-soft p-3 text-sm">
              Google search isn&apos;t set up (no <code>GOOGLE_PLACES_API_KEY</code>), so places are added manually for
              now.
            </p>
          )}
          <PlaceForm categories={categories} tags={tags} preview={null} />
          {googleEnabled && (
            <button onClick={() => setMode("search")} className="mt-4 w-full py-2 text-sm text-muted">
              Back to Google search
            </button>
          )}
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- Search

function SearchGoogle({
  sessionToken,
  initialQuery,
  onPick,
}: {
  sessionToken: string;
  initialQuery: string;
  onPick: (p: Preview) => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const { loc, state: locState, request } = useDeviceLocation();
  const visible = q.trim().length >= 2 ? results : [];

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ q, session: sessionToken });
      if (loc) {
        params.set("lat", String(loc.lat));
        params.set("lng", String(loc.lng));
      }
      try {
        const res = await fetch(`/api/google/autocomplete?${params}`, { signal: ctrl.signal });
        const data = await res.json();
        setResults(data.suggestions ?? []);
        setNotice(data.unavailable ?? null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setNotice("Search failed. Check your connection.");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, loc, sessionToken]);

  async function pick(s: Suggestion) {
    setPicking(s.placeId);
    try {
      const res = await fetch(`/api/google/details?${new URLSearchParams({ id: s.placeId, session: sessionToken })}`);
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? "Couldn't load that place");
        return;
      }
      onPick(data);
    } catch {
      setNotice("Couldn't load that place. Check your connection.");
    } finally {
      setPicking(null);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-accent">
        <Icon name="search" className="size-5 shrink-0 text-muted" />
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Google for a place"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent py-3 outline-none"
        />
        {loading && <span className="size-4 animate-spin rounded-full border-2 border-border border-t-accent" />}
      </div>

      <button
        type="button"
        onClick={request}
        disabled={!!loc || locState === "asking"}
        className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted disabled:opacity-100"
      >
        <Icon name="locate" className={`size-4 ${loc ? "text-accent" : ""}`} />
        {loc ? "Showing results near you" : (locationMessage(locState) ?? "Prefer results near me")}
      </button>

      {notice && <p className="mt-3 rounded-full bg-accent-soft p-3 text-sm">{notice}</p>}

      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface empty:hidden">
        {visible.map((s) => (
          <li key={s.placeId}>
            <button
              onClick={() => pick(s)}
              disabled={!!picking}
              className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-surface-2"
            >
              <Icon name="pin" className="size-5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.main}</span>
                <span className="block truncate text-sm text-muted">{s.secondary}</span>
              </span>
              {picking === s.placeId && (
                <span className="size-4 animate-spin rounded-full border-2 border-border border-t-accent" />
              )}
            </button>
          </li>
        ))}
      </ul>
      {visible.length > 0 && <p className="mt-2 text-right text-xs text-muted">Results from Google</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Save form

function PlaceForm({
  categories,
  tags: tagSuggestions,
  preview,
  sessionToken,
}: {
  categories: Category[];
  tags: string[];
  preview: Preview | null;
  sessionToken?: string;
}) {
  const d = preview?.details;
  const [name, setName] = useState(d?.name ?? "");
  const [category, setCategory] = useState(preview?.suggestedCategory ?? "other");
  const [status, setStatus] = useState<Status>("want");
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [pos, setPos] = useState<LatLng | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<number | null>(preview?.existing?.id ?? null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    const input: NewPlaceInput = {
      name,
      category,
      status,
      tags,
      notes,
      ...(d
        ? { googlePlaceId: d.googlePlaceId, sessionToken }
        : { address, city, country, lat: pos?.lat, lng: pos?.lng }),
    };
    start(async () => {
      const res = await createPlace(input);
      if (res?.error) {
        setError(res.error);
        if (res.existingId) setExistingId(res.existingId);
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-5"
    >
      {d && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {d.photos.length > 0 && (
            <div className="scrollbar-none flex h-44 snap-x snap-mandatory gap-0.5 overflow-x-auto">
              {d.photos.slice(0, 4).map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.name}
                  src={`/api/google/photo?name=${encodeURIComponent(p.name)}`}
                  alt=""
                  className="h-full w-4/5 shrink-0 snap-start object-cover"
                />
              ))}
            </div>
          )}
          <div className="p-3">
            <p className="font-semibold">{d.name}</p>
            <p className="text-sm text-muted">{d.address}</p>
            <div className="mt-1 flex items-center gap-3">
              <GoogleRating rating={d.rating} count={d.userRatingCount} />
              <PriceLevel level={d.priceLevel} />
            </div>
          </div>
        </div>
      )}

      {existingId && (
        <Link
          href={`/places/${existingId}`}
          className="flex items-center justify-between rounded-full bg-accent-soft p-3 text-sm font-medium text-accent"
        >
          Already saved. Open it
          <Icon name="back" className="size-4 rotate-180" />
        </Link>
      )}

      {!d && (
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5"
          />
        </Field>
      )}

      <Field label="Category">
        <div className="grid grid-cols-4 gap-1.5">
          {categories.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => setCategory(c.slug)}
              aria-pressed={category === c.slug}
              className="flex flex-col items-center gap-0.5 rounded-xl border border-border bg-surface px-1 py-2 text-xs font-medium aria-pressed:border-transparent"
              style={category === c.slug ? { backgroundColor: `${c.color}24`, color: c.color, borderColor: c.color } : undefined}
            >
              <span className="text-xl" aria-hidden>
                {c.emoji}
              </span>
              <span className="truncate">{c.label}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Status">
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {(["want", "been"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${status === s ? "bg-surface shadow-sm" : "text-muted"}`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Tags">
        <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
      </Field>

      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Who recommended it, what to order…"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5"
        />
      </Field>

      {!d && (
        <>
          <Field label="Address">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoComplete="street-address"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Town / city">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5"
              />
            </Field>
            <Field label="Country">
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                autoComplete="country-name"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5"
              />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2.5 text-sm">
            <span className={pos ? "" : "text-muted"}>
              {pos ? `Pinned at ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : "No map pin"}
            </span>
            <button type="button" onClick={() => setPicking(true)} className="inline-flex items-center gap-1 font-medium text-accent">
              <Icon name="pin" className="size-4" /> {pos ? "Move pin" : "Drop a pin"}
            </button>
          </div>
          {picking && (
            <PinPicker
              initial={pos}
              onClose={() => setPicking(false)}
              onPick={(p) => {
                setPos(p);
                setPicking(false);
              }}
            />
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        disabled={pending || !!existingId}
        className="sticky bottom-24 rounded-full bg-accent py-3 font-semibold text-on-accent shadow-lg disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save place"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}
