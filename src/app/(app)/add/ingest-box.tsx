"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/icons";
import { startIngest, type IngestFormState } from "../inbox/actions";

/** Paste a link (Instagram or any web page), or a caption, to start. */
export function IngestBox({ initial = "" }: { initial?: string }) {
  const [state, action, pending] = useActionState<IngestFormState, FormData>(startIngest, {});
  const [value, setValue] = useState(initial);

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="rounded-2xl border border-border bg-surface p-2 focus-within:border-accent">
        <textarea
          name="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={value.length > 80 ? 5 : 2}
          placeholder="Paste a link (Instagram, a website, an article) or a caption"
          className="w-full resize-none bg-transparent px-1 py-1 outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={async () => {
              // Clipboard reads need permission (iOS shows a "Paste" bubble); ignore refusals.
              try {
                setValue(await navigator.clipboard.readText());
              } catch {}
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-accent"
          >
            <Icon name="edit" className="size-4" /> Paste
          </button>
          <button
            disabled={pending || !value.trim()}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
          >
            {pending ? "Starting…" : "Find places"}
          </button>
        </div>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
