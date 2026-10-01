"use client";

import { useRef, useState, useTransition } from "react";
import type { Category, Status } from "@/db/schema";
import { STATUS_LABELS } from "@/lib/categories";
import { Icon, Star } from "@/components/icons";
import { TagInput } from "@/components/tag-input";
import { deletePlace, refreshGoogleData, updatePlace } from "../../actions";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function StatusControl({
  id,
  status,
  ourRating,
  visitedAt,
}: {
  id: number;
  status: Status;
  ourRating: number | null;
  visitedAt: string | null;
}) {
  const [pending, start] = useTransition();
  const save = (patch: Parameters<typeof updatePlace>[1]) => start(() => updatePlace(id, patch));
  const [visited, setVisited] = useState(visitedAt ?? "");
  const saveDate = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dateInput = useRef<HTMLInputElement>(null);

  return (
    <section className={`rounded-2xl border border-border bg-surface p-3 ${pending ? "opacity-70" : ""}`}>
      <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
        {(["want", "been"] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              if (s === status) return;
              if (s === "been" && !visited) setVisited(today());
              save(s === "been" ? { status: s, visitedAt: visited || today() } : { status: s });
            }}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${
              s === status ? "bg-surface shadow-sm" : "text-muted"
            }`}
          >
            {s === "been" && status !== "been" ? "Mark as been" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {status === "been" && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <div>
            <span className="block text-xs text-muted">Our rating</span>
            <div className="flex text-accent">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  onClick={() => save({ ourRating: n === ourRating ? null : n })}
                  className="p-0.5"
                >
                  <Star filled={!!ourRating && n <= ourRating} className="size-7" />
                </button>
              ))}
            </div>
          </div>
          <div className="text-right">
            <span className="block text-xs text-muted">Visited</span>
            {/* The native picker sits invisibly over a readable button. Saving waits until the
                date stops changing: iOS fires a change for every turn of the wheel. */}
            <label className="relative mt-0.5 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-medium">
              <Icon name="calendar" className="size-4 text-accent" />
              {visited
                ? new Date(`${visited}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                : "Pick a date"}
              <input
                ref={dateInput}
                type="date"
                value={visited}
                max={today()}
                aria-label="Date visited"
                onClick={() => {
                  try {
                    dateInput.current?.showPicker();
                  } catch {}
                }}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setVisited(v);
                  clearTimeout(saveDate.current);
                  saveDate.current = setTimeout(() => save({ visitedAt: v }), 800);
                }}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>
      )}
    </section>
  );
}

export function NotesAndTags({
  id,
  notes,
  tags,
  suggestions,
}: {
  id: number;
  notes: string | null;
  tags: string[];
  suggestions: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  const [draftTags, setDraftTags] = useState(tags);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <section className="text-sm">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-[22px] italic">Notes &amp; tags</h2>
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-accent">
            <Icon name="edit" className="size-3.5" /> Edit
          </button>
        </div>
        {tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="rounded-full bg-surface-2 px-2.5 py-0.5">
                {t}
              </span>
            ))}
          </div>
        )}
        {notes ? (
          <p className="whitespace-pre-line">{notes}</p>
        ) : (
          !tags.length && <p className="text-muted">No notes yet.</p>
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 text-sm">
      <h2 className="font-display text-[22px] italic">Notes &amp; tags</h2>
      <TagInput value={draftTags} onChange={setDraftTags} suggestions={suggestions} />
      <textarea
        value={draftNotes}
        onChange={(e) => setDraftNotes(e.target.value)}
        rows={4}
        autoFocus
        className="w-full rounded-xl border border-border bg-surface px-3 py-2.5"
      />
      <div className="flex gap-2">
        <button
          onClick={() => {
            setDraftNotes(notes ?? "");
            setDraftTags(tags);
            setEditing(false);
          }}
          className="flex-1 rounded-xl border border-border py-2.5 font-medium"
        >
          Cancel
        </button>
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await updatePlace(id, { notes: draftNotes, tags: draftTags });
              setEditing(false);
            })
          }
          className="flex-1 rounded-full bg-accent py-2.5 font-semibold text-on-accent disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}

export function EditDetails({
  id,
  name,
  category,
  categories,
}: {
  id: number;
  name: string;
  category: string;
  categories: Category[];
}) {
  const [pending, start] = useTransition();
  return (
    <details className="group rounded-2xl border border-border bg-surface text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 font-semibold">
        Name &amp; category
        <Icon name="back" className="size-4 -rotate-90 text-muted transition group-open:rotate-90" />
      </summary>
      <form
        action={(form) =>
          start(() =>
            updatePlace(id, { name: String(form.get("name")), category: String(form.get("category")) }),
          )
        }
        className="flex flex-col gap-3 px-3 pb-3"
      >
        <input
          name="name"
          defaultValue={name}
          required
          className="w-full rounded-xl border border-border bg-bg px-3 py-2.5"
        />
        <select
          name="category"
          defaultValue={category}
          className="w-full rounded-xl border border-border bg-bg px-3 py-2.5"
        >
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
        <button disabled={pending} className="rounded-full bg-accent py-2.5 font-semibold text-on-accent disabled:opacity-60">
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </details>
  );
}

export function DangerZone({ id, canRefresh }: { id: number; canRefresh: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-2 flex gap-2">
      {canRefresh && (
        <button
          disabled={pending}
          onClick={() => start(() => refreshGoogleData(id))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium text-text"
        >
          <Icon name="refresh" className={`size-3.5 ${pending ? "animate-spin" : ""}`} /> Refresh Google data
        </button>
      )}
      <button
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this place? This can't be undone.")) start(() => deletePlace(id));
        }}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium text-danger"
      >
        <Icon name="trash" className="size-3.5" /> Delete
      </button>
    </div>
  );
}
