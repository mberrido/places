import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions } from "@/lib/session";
import { OAUTH_COOKIE, googleLoginConfigured, publicOrigin, startLogin } from "@/lib/google-auth";

// Step 1 of "Sign in with Google": off to Google's account picker.
export function GET(req: NextRequest) {
  if (!googleLoginConfigured()) return NextResponse.redirect(new URL("/login?error=config", req.url));
  const origin = publicOrigin(req.headers);
  // Google only returns people to the address registered for it (APP_URL on the
  // NAS). Opened some other way, e.g. by IP, go there first so the cookie matches.
  if (new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))) {
    return NextResponse.redirect(`${origin}/login`);
  }
  const { url, cookie } = startLogin(origin);
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, cookie, { ...cookieOptions(req.headers), maxAge: 600 });
  return res;
}
