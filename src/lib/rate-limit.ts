import "server-only";

// In-memory login lockout: 5 failures per IP per 15 minutes. Cleared on restart.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

function recent(ip: string) {
  const cutoff = Date.now() - WINDOW_MS;
  const list = (failures.get(ip) ?? []).filter((t) => t > cutoff);
  failures.set(ip, list);
  return list;
}

export function isLockedOut(ip: string) {
  return recent(ip).length >= MAX_FAILURES;
}

export function recordFailure(ip: string) {
  recent(ip).push(Date.now());
}

export function clearFailures(ip: string) {
  failures.delete(ip);
}

/**
 * Client IP. DSM's reverse proxy appends the real client to X-Forwarded-For,
 * so the rightmost entry is the one it saw; anything to the left is client-supplied.
 */
export function clientIp(headers: Headers) {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",").at(-1)!.trim();
  return headers.get("x-real-ip") ?? "local";
}
