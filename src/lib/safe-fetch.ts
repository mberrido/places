import "server-only";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";

// Fetching a URL that came from outside (a pasted web link, a venue's website
// on Google): only public addresses, so a page can't point the server at the
// NAS admin page or anything else on the home network.
//
// The address is checked inside the connection itself (a custom DNS lookup),
// so a hostname can't pass the check and then resolve somewhere private when
// the request is made (DNS rebinding).

const PRIVATE = new net.BlockList();
for (const [addr, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const) {
  PRIVATE.addSubnet(addr, bits, "ipv4");
}
for (const [addr, bits] of [
  ["::", 96], // ::, ::1 and the old IPv4-compatible form ::a.b.c.d
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48],
  ["2002::", 16], // 6to4
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  PRIVATE.addSubnet(addr, bits, "ipv6");
}

function isPrivate(ip: string) {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1]; // IPv4 written as IPv6
  if (mapped) return PRIVATE.check(mapped, "ipv4");
  return PRIVATE.check(ip, net.isIPv6(ip) ? "ipv6" : "ipv4");
}

class Blocked extends Error {}

/** DNS lookup that refuses private addresses; used for the actual connection. */
const publicLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, family: options.family }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    if (!addresses.length || addresses.some((a) => isPrivate(a.address))) {
      return callback(new Blocked(`${hostname} resolves to a private address`), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

function allowedUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.port && url.port !== "80" && url.port !== "443") return false;
  // An IP address in the URL never goes through DNS, so check it here.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  return !net.isIP(host) || !isPrivate(host);
}

function request(url: URL, headers: Record<string, string>, signal: AbortSignal) {
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(url, { method: "GET", headers, lookup: publicLookup, signal }, resolve);
    req.on("error", reject);
    req.end();
  });
}

function decoded(res: http.IncomingMessage): Readable {
  switch ((res.headers["content-encoding"] ?? "").toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return res.pipe(zlib.createGunzip());
    case "deflate":
      return res.pipe(zlib.createInflate());
    case "br":
      return res.pipe(zlib.createBrotliDecompress());
    default:
      return res;
  }
}

/** Reads at most `maxBytes` (after decompression), then stops the download. */
async function readCapped(res: http.IncomingMessage, maxBytes: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  const body = decoded(res);
  try {
    for await (const chunk of body) {
      chunks.push(chunk as Buffer);
      size += (chunk as Buffer).length;
      if (size >= maxBytes) break;
    }
  } finally {
    res.destroy();
    body.destroy();
  }
  return Buffer.concat(chunks).subarray(0, maxBytes).toString("utf8");
}

/**
 * GET a public http(s) URL, following up to 3 redirects (each checked), and
 * read at most `maxBytes` of the body. Returns null for anything refused.
 */
export async function fetchPublic(
  input: string | URL,
  { maxBytes, timeoutMs = 5000, headers = {} }: { maxBytes: number; timeoutMs?: number; headers?: Record<string, string> },
): Promise<{ url: string; status: number; contentType: string; text: string } | null> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = new URL(input);
  try {
    for (let hop = 0; hop <= 3; hop++) {
      if (!allowedUrl(url)) return null;
      const res = await request(url, { "Accept-Encoding": "gzip, deflate, br", ...headers }, signal);
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.destroy();
        url = new URL(location, url);
        continue;
      }
      if (status < 200 || status >= 300) {
        res.destroy();
        return null;
      }
      const text = await readCapped(res, maxBytes);
      return { url: url.toString(), status, contentType: String(res.headers["content-type"] ?? ""), text };
    }
    return null;
  } catch (e) {
    if (e instanceof Blocked) console.error("fetchPublic refused:", e.message);
    return null;
  }
}
