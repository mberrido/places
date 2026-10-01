"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { endSessions } from "@/lib/accounts";
import { getUser } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";

/** Signs out everywhere: copies of the cookie on other devices stop working too. */
export async function logout() {
  const user = await getUser();
  if (user) endSessions(user.id);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
