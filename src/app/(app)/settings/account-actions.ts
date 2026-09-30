"use server";

import { cookies, headers } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import {
  AccountError,
  createAccount,
  getAccount,
  regenerateIngestToken,
  setPassword,
  updateAccount,
} from "@/lib/accounts";
import { requireAdmin, requireSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/passwords";
import { SESSION_COOKIE, cookieOptions, createSessionValue } from "@/lib/session";

export type Result = { error?: string; ok?: string };

/** AccountErrors are for the user; anything else is a bug and should surface. */
async function attempt(fn: () => void | Promise<void>, ok: string): Promise<Result> {
  try {
    await fn();
    refresh();
    return { ok };
  } catch (e) {
    if (e instanceof AccountError) return { error: e.message };
    throw e;
  }
}

const Details = z.object({ name: z.string(), login: z.string(), members: z.array(z.string()) });

export async function updateMyHousehold(input: z.input<typeof Details>): Promise<Result> {
  const { accountId } = await requireSession();
  return attempt(() => updateAccount(accountId, Details.parse(input)), "Saved");
}

export async function changeMyPassword(current: string, next: string): Promise<Result> {
  const session = await requireSession();
  const account = getAccount(session.accountId)!;
  if (!verifyPassword(current, account.passwordHash)) return { error: "Your current password isn't right." };
  return attempt(async () => {
    setPassword(session.accountId, next); // logs out every other device
    // …but keep this one logged in.
    (await cookies()).set(
      SESSION_COOKIE,
      createSessionValue({ accountId: session.accountId, name: session.name, v: account.sessionVersion + 1 }),
      cookieOptions(await headers()),
    );
  }, "Password changed. Other devices will need to log in again.");
}

export async function revealIngestToken() {
  const { accountId } = await requireSession();
  return getAccount(accountId)?.ingestToken ?? "";
}

export async function newIngestToken() {
  const { accountId } = await requireSession();
  return regenerateIngestToken(accountId);
}

// ---------------------------------------------------------------- Admin

const NewAccount = z.object({
  name: z.string(),
  login: z.string(),
  password: z.string(),
  members: z.array(z.string()),
});

export async function addAccount(input: z.input<typeof NewAccount>): Promise<Result> {
  await requireAdmin();
  const p = NewAccount.parse(input);
  return attempt(() => {
    createAccount(p);
  }, `Added ${p.name.trim()}. Send them the address, their login "${p.login.trim().toLowerCase()}" and the password.`);
}

export async function resetPassword(accountId: number, password: string): Promise<Result> {
  const admin = await requireAdmin();
  if (accountId === admin.accountId) return { error: "Use “Change password” for your own account." };
  if (!getAccount(accountId)) return { error: "No such account." };
  return attempt(() => setPassword(accountId, password), "Password reset. They'll need to log in again.");
}
