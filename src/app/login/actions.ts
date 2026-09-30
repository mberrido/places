"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkLogin } from "@/lib/accounts";
import { SESSION_COOKIE, cookieOptions, createSessionValue } from "@/lib/session";
import { clearFailures, clientIp, isLockedOut, recordFailure } from "@/lib/rate-limit";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const ip = clientIp(await headers());
  if (isLockedOut(ip)) return { error: "Too many attempts. Try again in 15 minutes." };

  const account = String(form.get("account") ?? "");
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  if (!name) return { error: "Tell us who you are." };

  const found = checkLogin(account, password);
  if (!found) {
    recordFailure(ip);
    return { error: "Wrong account name or password." };
  }
  clearFailures(ip);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionValue({ accountId: found.id, name, v: found.sessionVersion }), cookieOptions);

  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
