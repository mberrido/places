"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AccountError, claimGroup, createGroup, joinGroup } from "@/lib/accounts";
import { getUser } from "@/lib/auth";
import { clearFailures, clientIp, isLockedOut, recordFailure } from "@/lib/rate-limit";

export type WelcomeState = { error?: string };

async function signedIn() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

function done(): never {
  revalidatePath("/", "layout");
  redirect("/");
}

export async function createGroupAction(_prev: WelcomeState, form: FormData): Promise<WelcomeState> {
  const user = await signedIn();
  try {
    createGroup(user.id, String(form.get("name") ?? ""));
  } catch (e) {
    if (e instanceof AccountError) return { error: e.message };
    throw e;
  }
  done();
}

export async function joinGroupAction(_prev: WelcomeState, form: FormData): Promise<WelcomeState> {
  const user = await signedIn();
  // Codes are the only lock on a group, so slow down guessing.
  const ip = `join:${clientIp(await headers())}`;
  if (isLockedOut(ip)) return { error: "Too many wrong codes. Try again in 15 minutes." };
  try {
    joinGroup(user.id, String(form.get("code") ?? ""));
  } catch (e) {
    if (e instanceof AccountError) {
      recordFailure(ip);
      return { error: e.message };
    }
    throw e;
  }
  clearFailures(ip);
  done();
}

export async function claimGroupAction(accountId: number) {
  const user = await signedIn();
  claimGroup(user.id, accountId);
  done();
}
