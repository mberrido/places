import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  cookieOptions,
  createSessionValue,
  readSessionValue,
  shouldRenew,
} from "@/lib/session";

// Reachable without a session cookie.
const PUBLIC = [/^\/login$/, /^\/api\/health$/, /^\/api\/ingest$/];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  const session = readSessionValue(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  // Sliding renewal so daily use never logs you out.
  if (shouldRenew(session)) {
    res.cookies.set(
      SESSION_COOKIE,
      createSessionValue({ accountId: session.accountId, name: session.name, v: session.v }),
      cookieOptions(request.headers),
    );
  }
  return res;
}

export const config = {
  matcher: [
    // Everything except Next internals and the PWA/icon files iOS fetches without cookies.
    "/((?!_next/static|_next/image|vendor/|favicon.ico|icon|apple-icon|manifest.webmanifest).*)",
  ],
};
