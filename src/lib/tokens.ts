import "server-only";
import crypto from "node:crypto";

/** Google Autocomplete session token for server-side lookups. */
export function newServerSessionToken() {
  return crypto.randomUUID();
}
