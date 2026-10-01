"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { sendShare } from "../../sharing-actions";

type Sent = { toName: string; status: "pending" | "saved" | "dismissed"; at: Date };

/** "Send this to my mate": pick households, add a note, and it lands in their inbox. */
export function SharePlace({
  placeId,
  households,
  sent,
}: {
  placeId: number;
  households: { id: number; name: string }[];
  sent: Sent[];
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<number[]>(households.length === 1 ? [households[0].id] : []);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!households.length) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-3 text-sm">
      {!open ? (
        <button onClick={() => setOpen(true)} className="flex w-full items-center justify-between font-semibold">
          <span className="inline-flex items-center gap-2">
            <Icon name="share" className="size-4 text-accent" /> Share with{" "}
            {households.length === 1 ? households[0].name : "another household"}
          </span>
          <Icon name="back" className="size-4 rotate-180 text-muted" />
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold">Share this place</h2>
          <div className="flex flex-wrap gap-1.5">
            {households.map((h) => {
              const on = to.includes(h.id);
              return (
                <button
                  key={h.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTo(on ? to.filter((x) => x !== h.id) : [...to, h.id])}
                  className={`rounded-full border px-3 py-1.5 font-medium ${
                    on ? "border-accent bg-accent-soft text-accent" : "border-border"
                  }`}
                >
                  {on && "✓ "}
                  {h.name}
                </button>
              );
            })}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Add a note (optional): why you'd love it"
            className="w-full rounded-xl border border-border bg-bg px-3 py-2.5"
          />
          {error && <p className="text-danger">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="rounded-xl border border-border px-4 py-2.5 font-medium">
              Cancel
            </button>
            <button
              disabled={pending || !to.length}
              onClick={() =>
                start(async () => {
                  try {
                    setError(null);
                    const r = await sendShare({ placeId, toAccountIds: to, note });
                    setMessage(
                      r.sent
                        ? `Sent. It's in their inbox.${r.alreadyWaiting ? " (Some already had it waiting.)" : ""}`
                        : "They already have this waiting in their inbox.",
                    );
                    setOpen(false);
                    setNote("");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                })
              }
              className="flex-1 rounded-full bg-accent py-2.5 font-semibold text-on-accent disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
      {message && <p className="mt-2 text-accent">{message}</p>}
      {sent.length > 0 && (
        <ul className="mt-2 border-t border-border pt-2 text-xs text-muted">
          {sent.map((s, i) => (
            <li key={i}>
              Shared with {s.toName} on {new Date(s.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              {s.status === "saved" ? ", saved it ✓" : s.status === "dismissed" ? ", passed" : ", waiting in their inbox"}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
