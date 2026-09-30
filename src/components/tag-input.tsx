"use client";

import { useId, useState } from "react";
import { Icon } from "./icons";

export function TagInput({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function add(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  }

  const quick = suggestions.filter((s) => !value.includes(s)).slice(0, 8);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-surface p-2">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-2.5 pr-1 text-sm">
            {t}
            <button
              type="button"
              aria-label={`Remove ${t}`}
              onClick={() => onChange(value.filter((v) => v !== t))}
              className="grid size-5 place-items-center rounded-full text-muted hover:bg-border"
            >
              <Icon name="x" className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          list={listId}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) add(v.slice(0, -1));
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft && add(draft)}
          enterKeyHint="done"
          placeholder={value.length ? "" : "date night, dog friendly…"}
          className="min-w-24 flex-1 bg-transparent px-1 py-1 outline-none"
        />
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      {quick.length > 0 && (
        <div className="scrollbar-none mt-2 flex gap-1.5 overflow-x-auto">
          {quick.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="shrink-0 rounded-full border border-dashed border-border px-2.5 py-1 text-sm text-muted"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
