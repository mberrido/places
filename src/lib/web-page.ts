import "server-only";
import { decodeEntities, metaTags, normaliseInstagramUrl } from "./instagram";
import { fetchPublic } from "./safe-fetch";

// Any web page that isn't Instagram: a hotel's own site, a "best restaurants in
// Bristol" article, a Booking.com or Tripadvisor listing. We read its text and
// Claude finds the places, as for an Instagram post.

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|igshid$|ref$|ref_src$)/i;

/**
 * A clean http(s) link if the input is a web link (not Instagram), else null.
 * Allows a few words around it, as share sheets add ("The Pig at Combe https://…"),
 * but a caption that merely contains a link stays a caption.
 */
export function normaliseWebUrl(input: string): string | null {
  const text = input.trim();
  const match = text.match(/https?:\/\/\S+/i);
  if (!match || text.replace(match[0], "").trim().length > 80 || normaliseInstagramUrl(match[0])) return null;
  try {
    const u = new URL(match[0]);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

export function isWebUrl(url: string | null | undefined) {
  return !!url && !normaliseInstagramUrl(url);
}

/** "www.thepighotel.com/at-combe" → "thepighotel.com". */
export function siteName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export type WebPage = { title: string | null; description: string | null; text: string };

const MAX_TEXT = 30_000;

/** The page's title, description, structured data and readable text, or null if it couldn't be fetched. */
export async function fetchWebPage(url: string): Promise<WebPage | null> {
  const res = await fetchPublic(url, {
    maxBytes: 2_000_000,
    timeoutMs: 10_000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-GB,en;q=0.9",
    },
  }).catch(() => null);
  // Only a real 200: bot checks (Booking.com answers 202) return a challenge page, not the content.
  if (!res || res.status !== 200 || !/html/i.test(res.contentType)) return null;
  const html = res.text;

  const meta = metaTags(html);
  const title =
    meta.get("og:title") ?? decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "") ?? null;
  const description = meta.get("og:description") ?? meta.get("description") ?? null;

  // schema.org data names hotels and restaurants precisely (name, address), so keep it.
  const structured = [...html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1].trim())
    .join("\n")
    .slice(0, 8000);

  const body = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

  const text = [
    meta.get("og:site_name") && `Site: ${meta.get("og:site_name")}`,
    title && `Title: ${title}`,
    description && `Description: ${description}`,
    structured && `Structured data:\n${structured}`,
    body && `Text:\n${body}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_TEXT);
  if (!title && !body) return null;
  return { title: title || null, description, text };
}

/** What an inbox item came from, for its title: "@thepighotel", "thepighotel.com", "Instagram post"… */
export function ingestSource(i: { url: string | null; account: string | null; via: string }) {
  if (i.url && isWebUrl(i.url)) return siteName(i.url);
  if (i.account) return `@${i.account}`;
  if (i.url) return normaliseInstagramUrl(i.url)?.kind === "profile" ? "Instagram profile" : "Instagram post";
  return i.via === "screenshot" ? "Screenshot" : "Pasted caption";
}
