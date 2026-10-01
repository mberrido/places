"use client";

import { useState, useTransition } from "react";
import { leaveGroup, newJoinCode, removeMemberAction, renameGroupAction, type Result } from "./account-actions";

type Member = { id: number; name: string; email: string; picture: string | null };

/** Your group: its name, join code and members. Everyone in a group can manage it. */
export function GroupPanel({
  name,
  code,
  members,
  myId,
}: {
  name: string;
  code: string;
  members: Member[];
  myId: number;
}) {
  const [draft, setDraft] = useState(name);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-surface p-4 text-sm">
      <label className="block">
        <span className="mb-1 block font-medium">Group name</span>
        <span className="mb-1.5 block text-xs text-muted">What other groups see when you share a place with them.</span>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-full bg-surface-2 px-4 outline-none focus:ring-2 focus:ring-accent/40"
          />
          {draft.trim() !== name && (
            <button
              disabled={pending}
              onClick={() => start(async () => setResult(await renameGroupAction(draft)))}
              className="rounded-full bg-accent px-4 font-semibold text-on-accent disabled:opacity-60"
            >
              Save
            </button>
          )}
        </div>
        {result && <span className={`mt-1 block text-xs ${result.error ? "text-danger" : "text-accent"}`}>{result.error ?? result.ok}</span>}
      </label>

      <div className="border-t border-border pt-4">
        <span className="mb-1 block font-medium">Join code</span>
        <span className="mb-2 block text-xs text-muted">
          Anyone with this code can join the group and see everything in it. Only give it to people you trust.
        </span>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-2xl bg-surface-2 px-4 py-3 text-center font-mono text-xl tracking-[0.2em]">{code}</code>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {}
            }}
            className="h-12 rounded-full border border-border px-4 font-medium"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <button
          disabled={pending}
          onClick={() => {
            if (confirm("Make a new code? The old one will stop working (people already in the group stay in it)."))
              start(() => newJoinCode());
          }}
          className="mt-2 text-xs text-muted underline underline-offset-2"
        >
          Make a new code
        </button>
      </div>

      <div className="border-t border-border pt-4">
        <span className="mb-2 block font-medium">Members</span>
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              {m.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.picture} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full object-cover" />
              ) : (
                <span className="grid size-9 place-items-center rounded-full bg-surface-2 font-semibold">{m.name[0]}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {m.name} {m.id === myId && <span className="text-xs text-muted">(you)</span>}
                </span>
                <span className="block truncate text-xs text-muted">{m.email}</span>
              </span>
              {m.id !== myId && (
                <button
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Remove ${m.name} from the group?`)) start(() => removeMemberAction(m.id));
                  }}
                  className="text-xs font-medium text-danger"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <button
        disabled={pending}
        onClick={() => {
          if (confirm("Leave this group? You'll be asked to create or join one next.")) start(() => leaveGroup());
        }}
        className="self-start text-xs text-muted underline underline-offset-2"
      >
        Leave group
      </button>
    </div>
  );
}
