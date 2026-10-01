"use client";

import { useState, useTransition } from "react";
import type { Category } from "@/db/schema";
import { Icon } from "@/components/icons";
import { addCategory, deleteCategory, updateCategory } from "../actions";

export function CategoryEditor({ categories }: { categories: Category[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <ul className="divide-y divide-border">
        {categories.map((c) =>
          editing === c.slug ? (
            <li key={c.slug} className="p-3">
              <CategoryForm
                initial={c}
                others={categories.filter((o) => o.slug !== c.slug)}
                onDone={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={c.slug}>
              <button
                onClick={() => setEditing(c.slug)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface-2"
              >
                <span className="grid size-8 place-items-center rounded-lg text-lg" style={{ backgroundColor: `${c.color}24` }}>
                  {c.emoji}
                </span>
                <span className="flex-1 font-medium">{c.label}</span>
                <Icon name="edit" className="size-4 text-muted" />
              </button>
            </li>
          ),
        )}
        <li className="p-3">
          {editing === "__new" ? (
            <CategoryForm others={[]} onDone={() => setEditing(null)} />
          ) : (
            <button onClick={() => setEditing("__new")} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
              <Icon name="plus" className="size-4" /> Add category
            </button>
          )}
        </li>
      </ul>
    </div>
  );
}

function CategoryForm({
  initial,
  others,
  onDone,
}: {
  initial?: Category;
  others: Category[];
  onDone: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "📍");
  const [color, setColor] = useState(initial?.color ?? "#64748b");
  const [moveTo, setMoveTo] = useState(others.find((o) => o.slug === "other")?.slug ?? others[0]?.slug ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      try {
        await fn();
        onDone();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex gap-2">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          aria-label="Emoji"
          className="w-14 rounded-xl border border-border bg-bg px-2 py-2 text-center"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Name"
          placeholder="Name"
          autoFocus
          className="min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 py-2"
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          aria-label="Colour"
          className="h-10 w-12 rounded-xl border border-border bg-bg p-1"
        />
      </div>
      {error && <p className="text-danger">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onDone} className="rounded-xl border border-border px-3 py-2 font-medium">
          Cancel
        </button>
        <button
          disabled={pending || !label.trim()}
          onClick={() =>
            run(() => (initial ? updateCategory(initial.slug, { label, emoji, color }) : addCategory({ label, emoji, color })))
          }
          className="flex-1 rounded-full bg-accent py-2 font-semibold text-on-accent disabled:opacity-60"
        >
          Save
        </button>
      </div>
      {initial && others.length > 0 && (
        <div className="mt-1 border-t border-border pt-2">
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>Move its places to</span>
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="rounded-lg border border-border bg-bg px-2 py-1">
                {others.map((o) => (
                  <option key={o.slug} value={o.slug}>
                    {o.emoji} {o.label}
                  </option>
                ))}
              </select>
              <button
                disabled={pending}
                onClick={() => run(() => deleteCategory(initial.slug, moveTo))}
                className="font-medium text-danger"
              >
                Delete
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="font-medium text-danger">
              Delete category…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
