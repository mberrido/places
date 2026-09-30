import crypto from "node:crypto";

// scrypt with a per-password salt. Format: scrypt$<salt b64url>$<hash b64url>
const KEYLEN = 32;

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined) {
  const [scheme, salt, hash] = (stored ?? "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) {
    // Same work as a real check, so timing doesn't reveal unknown accounts.
    crypto.scryptSync(password, "no-account", KEYLEN);
    return false;
  }
  const expected = Buffer.from(hash, "base64url");
  const given = crypto.scryptSync(password, Buffer.from(salt, "base64url"), expected.length);
  return crypto.timingSafeEqual(expected, given);
}

export function newIngestToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export const MIN_PASSWORD_LENGTH = 8;
