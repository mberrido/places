import { NextResponse, type NextRequest } from "next/server";
import { upsertUser } from "@/lib/accounts";
import { LoginError, OAUTH_COOKIE, finishLogin, publicOrigin } from "@/lib/google-auth";
import { SESSION_COOKIE, cookieOptions, createSessionValue, safeEqual } from "@/lib/session";

// Step 2: Google sends people back here with a code.
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req.headers);
  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  };

  const p = req.nextUrl.searchParams;
  if (p.get("error")) return fail(p.get("error") === "access_denied" ? "cancelled" : "google");
  const [state, verifier] = (req.cookies.get(OAUTH_COOKIE)?.value ?? "").split(".");
  const code = p.get("code");
  if (!code || !state || !verifier || !safeEqual(state, p.get("state") ?? "")) return fail("expired");

  try {
    const profile = await finishLogin(origin, code, verifier);
    const userId = upsertUser(profile);
    const res = NextResponse.redirect(`${origin}/`);
    res.cookies.set(SESSION_COOKIE, createSessionValue(userId), cookieOptions(req.headers));
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  } catch (e) {
    if (e instanceof LoginError) {
      console.error("google login:", e.message);
      return fail("google");
    }
    throw e;
  }
}
