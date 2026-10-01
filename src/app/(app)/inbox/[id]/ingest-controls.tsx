"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Category, ExtractedPlace } from "@/db/schema";
import { Icon } from "@/components/icons";
import { GoogleRating } from "@/components/place-bits";
import { confirmPlaces, dismiss, reopenIngest, retryIngest, submitCaption } from "../actions";

/** Re-renders the page every 2s while the post is being processed. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

export function RetryButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(() => retryIngest(id))}
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 font-medium"
    >
      <Icon name="refresh" className={`size-4 ${pending ? "animate-spin" : ""}`} /> Try again
    </button>
  );
}

export function ReopenButton({ id, hasSaved }: { id: number; hasSaved: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(() => reopenIngest(id))}
      className="rounded-xl border border-border bg-surface py-2.5 font-medium"
    >
      {hasSaved ? "Save more from this" : "Choose places again"}
    </button>
  );
}

export function DismissButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(() => dismiss(id))}
      className="mt-2 self-center py-2 text-sm text-muted underline-offset-2 hover:underline"
    >
      Dismiss
    </button>
  );
}

export function CaptionForm({ id }: { id: number }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Paste the caption here (in Instagram, press and hold the caption, then Copy)"
        className="w-full rounded-xl border border-border bg-surface px-3 py-2.5"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        disabled={pending || text.trim().length < 5}
        onClick={() =>
          start(async () => {
            try {
              await submitCaption(id, text);
            } catch (e) {
              setError((e as Error).message);
            }
          })
        }
        className="rounded-full bg-accent py-2.5 font-semibold text-on-accent disabled:opacity-50"
      >
        {pending ? "Sending…" : "Find places in this caption"}
      </button>
    </div>
  );
}

/** `googlePlaceIds` empty = save without Google data. Several = e.g. more than one branch of a chain. */
type Choice = { include: boolean; googlePlaceIds: string[]; category: string };

export function ConfirmForm({
  id,
  places,
  categories,
  alreadySaved,
}: {
  id: number;
  places: ExtractedPlace[];
  categories: Category[];
  alreadySaved: Record<string, number>;
}) {
  const [choices, setChoices] = useState<Choice[]>(() =>
    places.map((p) => {
      // Pre-select the best match you haven't saved yet (falls back to the best match).
      const best = p.candidates.find((c) => !alreadySaved[c.googlePlaceId]) ?? p.candidates[0];
      return {
        // Pre-tick confident matches; a single-place post is always pre-ticked.
        include: places.length === 1 || (p.confidence !== "low" && p.candidates.length > 0),
        googlePlaceIds: best ? [best.googlePlaceId] : [],
        category: p.category,
      };
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<Choice>) =>
    setChoices((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const count = choices.reduce((n, c) => n + (c.include ? Math.max(1, c.googlePlaceIds.length) : 0), 0);

  return (
    <section className="flex flex-col gap-4">
      {places.length > 1 && <p className="text-sm text-muted">Found {places.length} places. Tick the ones to save.</p>}

      {places.map((p, i) => {
        const c = choices[i];
        return (
          <div
            key={i}
            className={`rounded-2xl border bg-surface p-3 ${c.include ? "border-accent" : "border-border opacity-75"}`}
          >
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={c.include}
                onChange={(e) => set(i, { include: e.target.checked })}
                className="mt-1 size-5 accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{p.name}</span>
                <span className="block text-sm text-muted">
                  {[p.area, p.country].filter(Boolean).join(", ") || "Location not stated"}
                  {p.confidence === "low" && " · not sure this is a venue"}
                </span>
              </span>
            </label>

            {c.include && (
              <div className="mt-3 flex flex-col gap-2">
                {p.candidates.length > 1 && (
                  <p className="text-xs text-muted">Tap the right match. Tap more than one to save several (e.g. branches of a chain).</p>
                )}
                {p.candidates.length > 0 ? (
                  p.candidates.map((cand) => {
                    const savedId = alreadySaved[cand.googlePlaceId];
                    const selected = c.googlePlaceIds.includes(cand.googlePlaceId);
                    return (
                      <button
                        key={cand.googlePlaceId}
                        type="button"
                        onClick={() =>
                          set(i, {
                            googlePlaceIds: selected
                              ? c.googlePlaceIds.filter((g) => g !== cand.googlePlaceId)
                              : [...c.googlePlaceIds, cand.googlePlaceId],
                          })
                        }
                        aria-pressed={selected}
                        className={`flex gap-3 rounded-xl border p-2 text-left ${
                          selected ? "border-accent bg-accent-soft" : "border-border"
                        }`}
                      >
                        <span className="size-14 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                          {cand.photoName && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/google/photo?name=${encodeURIComponent(cand.photoName)}`}
                              alt=""
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{cand.name}</span>
                          <span className="line-clamp-2 text-xs text-muted">{cand.address}</span>
                          <span className="mt-0.5 flex items-center gap-2">
                            <GoogleRating rating={cand.rating} count={cand.userRatingCount} />
                            {savedId && <span className="text-xs font-semibold text-accent">Already saved</span>}
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted">No Google match found.</p>
                )}
                <button
                  type="button"
                  onClick={() => set(i, { googlePlaceIds: [] })}
                  aria-pressed={c.googlePlaceIds.length === 0}
                  className={`rounded-xl border px-3 py-2 text-left text-sm ${
                    c.googlePlaceIds.length === 0 ? "border-accent bg-accent-soft font-medium" : "border-border text-muted"
                  }`}
                >
                  {p.candidates.length ? "None of these: save without Google data" : "Save without Google data"}
                </button>
                <div className="flex items-center gap-2">
                  <select
                    value={c.category}
                    onChange={(e) => set(i, { category: e.target.value })}
                    aria-label="Category"
                    className="flex-1 rounded-xl border border-border bg-bg px-3 py-2"
                  >
                    {categories.map((cat) => (
                      <option key={cat.slug} value={cat.slug}>
                        {cat.emoji} {cat.label}
                      </option>
                    ))}
                  </select>
                  <Link
                    href={`/add?q=${encodeURIComponent([p.name, p.area].filter(Boolean).join(" "))}`}
                    className="shrink-0 rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    Search myself
                  </Link>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        disabled={pending || count === 0}
        onClick={() =>
          start(async () => {
            try {
              await confirmPlaces(
                id,
                choices.flatMap((c, index): { index: number; googlePlaceId: string | null; category: string }[] =>
                  !c.include
                    ? []
                    : c.googlePlaceIds.length
                      ? c.googlePlaceIds.map((googlePlaceId) => ({ index, googlePlaceId, category: c.category }))
                      : [{ index, googlePlaceId: null, category: c.category }],
                ),
              );
            } catch (e) {
              setError((e as Error).message);
            }
          })
        }
        className="sticky bottom-24 rounded-full bg-accent py-3 font-semibold text-on-accent shadow-lg disabled:opacity-50"
      >
        {pending ? "Saving…" : count === 1 ? "Save place" : `Save ${count} places`}
      </button>
    </section>
  );
}
