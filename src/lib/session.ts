import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Shared by proxy.ts and server code, so no "server-only" / next imports here.

export const SESSION_COOKIE = "places_session";
export const SESSION_MAX_AGE_S = 365 * 24 * 3600;
const RENEW_AFTER_MS = 7 * 24 * 3600 * 1000;

/** Who's logged in: the household account, the person's name, and the account's session version. */
export type Session = { accountId: number; name: string; v: number; iat: number };

let cachedSecret: Buffer | undefined;

/**
 * Signing key: SESSION_SECRET if set, otherwise a random key generated once and
 * kept next to the database. (Per-account logouts use the account's session
 * version instead, checked in lib/auth.)
 */
function key(): Buffer {
  if (!cachedSecret) {
    let secret = process.env.SESSION_SECRET;
    if (!secret) {
      const dbPath = path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH ?? "./data/places.db");
      const file = path.join(/*turbopackIgnore: true*/ path.dirname(dbPath), ".session-secret");
      try {
        secret = fs.readFileSync(file, "utf8").trim();
      } catch {
        secret = crypto.randomBytes(48).toString("base64url");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, secret, { mode: 0o600 });
      }
    }
    cachedSecret = crypto.createHmac("sha256", secret).update("places-session:v2").digest();
  }
  return cachedSecret;
}

function sign(data: string) {
  return crypto.createHmac("sha256", key()).update(data).digest("base64url");
}

export function createSessionValue(s: Omit<Session, "iat">): string {
  const payload = Buffer.from(JSON.stringify({ ...s, iat: Date.now() } satisfies Session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionValue(value: string | undefined): Session | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if (typeof s.name !== "string" || typeof s.iat !== "number" || typeof s.accountId !== "number") return null;
    if (Date.now() - s.iat > SESSION_MAX_AGE_S * 1000) return null;
    return s;
  } catch {
    return null;
  }
}

export function shouldRenew(s: Session) {
  return Date.now() - s.iat > RENEW_AFTER_MS;
}

/** Constant-time string comparison (via hashes, so lengths don't leak). */
export function safeEqual(a: string, b: string) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Cookie settings for this request. The cookie is Secure when the request came
 * over HTTPS (DSM's reverse proxy sends X-Forwarded-Proto: https), and a normal
 * cookie on plain http, e.g. http://<nas-ip>:8421 on the home network.
 */
export function cookieOptions(headers: Headers) {
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return {
    httpOnly: true,
    secure: proto === "https",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  };
}
