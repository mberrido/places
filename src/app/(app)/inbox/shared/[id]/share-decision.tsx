"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Category } from "@/db/schema";
import { dismissSharedPlace, saveSharedPlace } from "../../../sharing-actions";

export function ShareDecision({
  id,
  existingId,
  categories,
  defaultCategory,
}: {
  id: number;
  existingId: number | null;
  categories: Category[];
  defaultCategory: string;
}) {
  const [category, setCategory] = useState(defaultCategory);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      try {
        setError(null);
        await fn();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  return (
    <section className="flex flex-col gap-3">
      {existingId ? (
        <Link
          href={`/places/${existingId}`}
          className="rounded-xl bg-accent-soft p-3 text-sm font-medium text-accent"
        >
          It&apos;s already in your list. Open it
        </Link>
      ) : (
        <label className="text-sm">
          <span className="mb-1.5 block font-medium">Save as</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5"
          >
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() => run(() => dismissSharedPlace(id))}
          className="rounded-xl border border-border px-4 py-3 font-medium"
        >
          {existingId ? "Done" : "Not for us"}
        </button>
        {!existingId && (
          <button
            disabled={pending}
            onClick={() => run(() => saveSharedPlace(id, category))}
            className="flex-1 rounded-xl bg-accent py-3 font-semibold text-on-accent disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save to our list"}
          </button>
        )}
      </div>
    </section>
  );
}
