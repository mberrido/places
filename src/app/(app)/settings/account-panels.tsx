"use client";

import { useState, useTransition, type ReactNode } from "react";
import { addAccount, changeMyPassword, resetPassword, updateMyHousehold, type Result } from "./account-actions";

const input = "w-full rounded-xl border border-border bg-bg px-3 py-2";

function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const run = (fn: () => Promise<Result>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) onOk?.();
    });
  return { pending, result, run };
}

function Feedback({ result }: { result: Result | null }) {
  if (!result) return null;
  return <p className={`text-sm ${result.error ? "text-danger" : "text-accent"}`}>{result.error ?? result.ok}</p>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const splitMembers = (s: string) => s.split(",").map((m) => m.trim()).filter(Boolean);

/** Your household: its name, login and members, and your password. */
export function MyHousehold({ name, login, members }: { name: string; login: string; members: string[] }) {
  const details = useAction();
  const password = useAction();
  const [form, setForm] = useState({ name, login, members: members.join(", ") });
  const [pw, setPw] = useState({ current: "", next: "" });

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-3">
      <div className="flex flex-col gap-3">
        <Field label="Household name" hint="What other households see when you share with them.">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
        </Field>
        <Field label="Login" hint="Typed on the login screen.">
          <input
            value={form.login}
            onChange={(e) => setForm({ ...form, login: e.target.value })}
            autoCapitalize="none"
            className={input}
          />
        </Field>
        <Field label="Who's in it" hint="Comma-separated, e.g. Mal, Sam">
          <input value={form.members} onChange={(e) => setForm({ ...form, members: e.target.value })} className={input} />
        </Field>
        <Feedback result={details.result} />
        <button
          disabled={details.pending}
          onClick={() =>
            details.run(() => updateMyHousehold({ name: form.name, login: form.login, members: splitMembers(form.members) }))
          }
          className="self-start rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-60"
        >
          Save
        </button>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-3">
        <p className="text-sm font-semibold">Change password</p>
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Current password"
          value={pw.current}
          onChange={(e) => setPw({ ...pw, current: e.target.value })}
          className={input}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="New password (8+ characters)"
          value={pw.next}
          onChange={(e) => setPw({ ...pw, next: e.target.value })}
          className={input}
        />
        <Feedback result={password.result} />
        <button
          disabled={password.pending || !pw.current || !pw.next}
          onClick={() => password.run(() => changeMyPassword(pw.current, pw.next), () => setPw({ current: "", next: "" }))}
          className="self-start rounded-lg border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
        >
          Change password
        </button>
      </div>
    </div>
  );
}

type AccountRow = { id: number; name: string; login: string; members: string[]; isAdmin: boolean; places: number };

/** Admin only: add households and reset their passwords. */
export function AccountsAdmin({ accounts, myId }: { accounts: AccountRow[]; myId: number }) {
  const add = useAction();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", login: "", password: "", members: "" });

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <ul className="divide-y divide-border">
        {accounts.map((a) => (
          <AccountItem key={a.id} account={a} isMe={a.id === myId} />
        ))}
      </ul>
      <div className="border-t border-border p-3">
        {adding ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold">Add a household</p>
            <Field label="Name" hint="e.g. Dave & Jo">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
            </Field>
            <Field label="Login" hint="What they type to log in, e.g. dave">
              <input
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
                autoCapitalize="none"
                className={input}
              />
            </Field>
            <Field label="Password" hint="8+ characters. They can change it in their Settings.">
              <input
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
                className={input}
              />
            </Field>
            <Field label="Who's in it (optional)" hint="Comma-separated">
              <input value={form.members} onChange={(e) => setForm({ ...form, members: e.target.value })} className={input} />
            </Field>
            <Feedback result={add.result} />
            <div className="flex gap-2">
              <button onClick={() => setAdding(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium">
                Cancel
              </button>
              <button
                disabled={add.pending}
                onClick={() =>
                  add.run(
                    () => addAccount({ ...form, members: splitMembers(form.members) }),
                    () => setForm({ name: "", login: "", password: "", members: "" }),
                  )
                }
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-60"
              >
                Add household
              </button>
            </div>
          </div>
        ) : (
          <>
            <Feedback result={add.result} />
            <button onClick={() => setAdding(true)} className="text-sm font-medium text-accent">
              + Add a household
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AccountItem({ account: a, isMe }: { account: AccountRow; isMe: boolean }) {
  const reset = useAction();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  return (
    <li className="p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {a.name} {isMe && <span className="text-xs text-muted">(you)</span>}
          </p>
          <p className="truncate text-xs text-muted">
            login <code>{a.login}</code> · {a.places} place{a.places === 1 ? "" : "s"}
            {a.members.length ? ` · ${a.members.join(", ")}` : ""}
          </p>
        </div>
        {!isMe && !open && (
          <button onClick={() => setOpen(true)} className="shrink-0 text-xs font-medium text-accent">
            Reset password
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              className={`${input} flex-1`}
            />
            <button
              disabled={reset.pending || !pw}
              onClick={() => reset.run(() => resetPassword(a.id, pw), () => setPw(""))}
              className="rounded-lg bg-accent px-3 text-sm font-semibold text-on-accent disabled:opacity-60"
            >
              Set
            </button>
          </div>
          <Feedback result={reset.result} />
          <button onClick={() => setOpen(false)} className="self-start text-xs text-muted">
            Close
          </button>
        </div>
      )}
    </li>
  );
}
