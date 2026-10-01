import "server-only";
import crypto from "node:crypto";

// "Sign in with Google" (OpenID Connect, authorization code + PKCE). Only asks
// for name, email and picture, which Google doesn't review.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function googleLoginConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * The address Google sends people back to. Google only accepts HTTPS (or
 * localhost), so on the NAS this is APP_URL (https://places.<name>.synology.me);
 * locally it's whatever address the app was opened on.
 */
export function publicOrigin(headers: Headers) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  return `${proto}://${host}`;
}

/**
 * ALLOWED_EMAILS (comma separated) limits who can sign in. Empty means anyone
 * with a Google account, so set it on any server reachable from the internet.
 */
export function emailAllowed(email: string) {
  const list = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !list.length || list.includes(email.trim().toLowerCase());
}

export const OAUTH_COOKIE = "places_oauth";

export function startLogin(origin: string) {
  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  // The cookie carries what the callback needs to check: state and the PKCE verifier.
  return { url: url.toString(), cookie: `${state}.${verifier}` };
}

export type GoogleProfile = {
  sub: string;
  email: string;
  name: string;
  givenName: string | null;
  picture: string | null;
};

export class LoginError extends Error {}

/** Swaps the code for an ID token. The token comes straight from Google over TLS, so its claims are trusted after the checks below. */
export async function finishLogin(origin: string, code: string, verifier: string): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("google token exchange", res.status, (await res.text()).slice(0, 300));
    throw new LoginError("Google didn't accept the sign-in. Try again.");
  }
  const { id_token } = (await res.json()) as { id_token?: string };
  const payload = id_token?.split(".")[1];
  if (!payload) throw new LoginError("Google didn't send an ID token.");
  const c = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
  if (c.aud !== process.env.GOOGLE_CLIENT_ID) throw new LoginError("That sign-in was for a different app.");
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") throw new LoginError("Unexpected issuer.");
  if (typeof c.exp !== "number" || c.exp * 1000 < Date.now()) throw new LoginError("That sign-in expired. Try again.");
  if (c.email_verified !== true || typeof c.email !== "string") throw new LoginError("Your Google email isn't verified.");
  return {
    sub: String(c.sub),
    email: c.email,
    name: typeof c.name === "string" ? c.name : c.email,
    givenName: typeof c.given_name === "string" ? c.given_name : null,
    picture: typeof c.picture === "string" ? c.picture : null,
  };
}
