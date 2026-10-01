"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { login, type LoginState } from "./actions";

const KEY = "places:login";
const noopSubscribe = () => () => {};
function readSaved(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Remembers the account and name used last on this device. */
export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const saved = useSyncExternalStore(noopSubscribe, readSaved, () => null);
  const remembered = (() => {
    try {
      return saved ? (JSON.parse(saved) as { account?: string; name?: string }) : {};
    } catch {
      return {};
    }
  })();
  const [account, setAccount] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const accountValue = account ?? remembered.account ?? "";
  const nameValue = name ?? remembered.name ?? "";

  return (
    <form
      action={action}
      onSubmit={() => {
        try {
          localStorage.setItem(KEY, JSON.stringify({ account: accountValue, name: nameValue }));
        } catch {}
      }}
      className="mt-8 flex flex-col gap-4"
    >
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Account</span>
        <input
          name="account"
          value={accountValue}
          onChange={(e) => setAccount(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Your name</span>
        <input
          name="name"
          value={nameValue}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          placeholder="So we know who added what"
          required
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <button disabled={pending} className="rounded-full bg-accent py-3 font-semibold text-on-accent disabled:opacity-60">
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
