"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AccountError,
  getAccount,
  regenerateIngestToken,
  regenerateJoinCode,
  removeMember,
  renameGroup,
} from "@/lib/accounts";
import { requireSession } from "@/lib/auth";

export type Result = { error?: string; ok?: string };

export async function renameGroupAction(name: string): Promise<Result> {
  const { accountId } = await requireSession();
  try {
    renameGroup(accountId, name);
  } catch (e) {
    if (e instanceof AccountError) return { error: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

/** A new join code; the old one stops working. */
export async function newJoinCode() {
  const { accountId } = await requireSession();
  regenerateJoinCode(accountId);
  refresh();
}

export async function removeMemberAction(userId: number) {
  const s = await requireSession();
  if (userId === s.userId) throw new Error("Use Leave group to remove yourself");
  removeMember(s.accountId, userId);
  // They've seen the join code and Shortcut token; replace both so they can't get back in.
  regenerateJoinCode(s.accountId);
  regenerateIngestToken(s.accountId);
  refresh();
}

export async function leaveGroup() {
  const s = await requireSession();
  removeMember(s.accountId, s.userId);
  redirect("/welcome");
}

export async function revealIngestToken() {
  const { accountId } = await requireSession();
  return getAccount(accountId)?.ingestToken ?? "";
}

export async function newIngestToken() {
  const { accountId } = await requireSession();
  return regenerateIngestToken(accountId);
}
