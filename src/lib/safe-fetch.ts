import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

// Fetching a URL that came from outside (e.g. a venue's website on Google):
// only public addresses, so a listing can't point the server at the NAS admin
// page or anything else on the home network.

const PRIVATE = new net.BlockList();
for (const [addr, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 3],
] as const) {
  PRIVATE.addSubnet(addr, bits, "ipv4");
}
for (const [addr, bits] of [
  ["::", 127], // :: and ::1
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  PRIVATE.addSubnet(addr, bits, "ipv6");
}

function isPrivate(ip: string) {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1]; // IPv4 written as IPv6
  if (mapped) return PRIVATE.check(mapped, "ipv4");
  return PRIVATE.check(ip, net.isIPv6(ip) ? "ipv6" : "ipv4");
}

async function isPublicUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.port && url.port !== "80" && url.port !== "443") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  return addresses.length > 0 && !addresses.some(isPrivate);
}

/**
 * GET a public http(s) URL, following up to 3 redirects (each checked), and
 * read at most `maxBytes` of the body. Returns null for anything refused.
 */
export async function fetchPublic(
  input: string | URL,
  { maxBytes, timeoutMs = 5000, headers }: { maxBytes: number; timeoutMs?: number; headers?: HeadersInit },
): Promise<{ url: string; status: number; contentType: string; text: string } | null> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = new URL(input);
  for (let hop = 0; hop <= 3; hop++) {
    if (!(await isPublicUrl(url))) return null;
    const res = await fetch(url, { headers, redirect: "manual", signal, cache: "no-store" });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      url = new URL(location, url);
      continue;
    }
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    await reader.cancel().catch(() => {});
    const text = Buffer.concat(chunks).subarray(0, maxBytes).toString("utf8");
    return { url: url.toString(), status: res.status, contentType: res.headers.get("content-type") ?? "", text };
  }
  return null;
}
