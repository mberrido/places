"use client";

import { useActionState, useTransition } from "react";
import { claimGroupAction, createGroupAction, joinGroupAction, type WelcomeState } from "./actions";

const input = "h-12 w-full rounded-full bg-surface-2 px-4 outline-none focus:ring-2 focus:ring-accent/40";
const button = "h-12 rounded-full bg-accent px-5 font-semibold text-on-accent disabled:opacity-60";

export function CreateGroupForm({ placeholder }: { placeholder: string }) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(createGroupAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <label className="sr-only" htmlFor="group-name">Group name</label>
      <input id="group-name" name="name" required maxLength={60} placeholder={placeholder} className={input} />
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className={button}>
        {pending ? "Creating…" : "Create group"}
      </button>
    </form>
  );
}

export function JoinGroupForm() {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(joinGroupAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <label className="sr-only" htmlFor="join-code">Group code</label>
      <input
        id="join-code"
        name="code"
        required
        placeholder="ABCD-2345"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        className={`${input} font-mono tracking-widest uppercase`}
      />
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="h-12 rounded-full border border-border px-5 font-semibold disabled:opacity-60">
        {pending ? "Joining…" : "Join group"}
      </button>
    </form>
  );
}

export function ClaimButton({ accountId }: { accountId: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(() => claimGroupAction(accountId))}
      className="h-12 rounded-full bg-accent px-5 font-semibold text-on-accent disabled:opacity-60"
    >
      {pending ? "Opening…" : "Continue with these places"}
    </button>
  );
}
