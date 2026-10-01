import "server-only";

// Getting text (and a picture) out of an Instagram post. Instagram is hostile to
// scraping, so this is a best-effort chain: Open Graph tags from the post page,
// then the official oEmbed endpoint if a Meta token is configured. Callers must
// cope with getting nothing back (the inbox then asks for the caption).

const TIMEOUT_MS = 10_000;
const MAX_HTML = 2_000_000;
const MAX_IMAGE = 4_000_000;

export type PostText = {
  caption: string | null;
  account: string | null;
  /** Everything we found (titles, descriptions), for Claude to read. */
  rawText: string;
  image: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" } | null;
  fetchedWith: string;
};

export type InstagramLink = { url: string; kind: "post" | "profile" };

// First path segments that are Instagram pages, not usernames.
const NOT_PROFILES = new Set([
  "p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about", "legal",
  "developer", "web", "challenge", "emails", "session", "privacy", "terms", "api", "graphql",
]);

/**
 * Accepts instagram.com post, reel and profile links (with or without tracking
 * params) and returns a clean URL, or null for anything else.
 */
export function normaliseInstagramUrl(input: string): InstagramLink | null {
  const match = input.match(/https?:\/\/[^\s]+/);
  if (!match) return null;
  try {
    const u = new URL(match[0]);
    const host = u.hostname.replace(/^(www\.|m\.)/, "");
    if (host !== "instagram.com" && host !== "instagr.am") return null;
    const post = u.pathname.match(/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/);
    if (post) return { url: `https://www.instagram.com/${post[1] === "reels" ? "reel" : post[1]}/${post[2]}/`, kind: "post" };
    const profile = u.pathname.match(/^\/([\w.]{1,30})\/?$/);
    if (profile && !NOT_PROFILES.has(profile[1].toLowerCase())) {
      return { url: `https://www.instagram.com/${profile[1]}/`, kind: "profile" };
    }
    return null;
  } catch {
    return null;
  }
}

export function isProfileUrl(url: string | null | undefined) {
  return !!url && normaliseInstagramUrl(url)?.kind === "profile";
}

export function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function metaTags(html: string) {
  const out = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
    if (key && content != null && !out.has(key)) out.set(key, decodeEntities(content));
  }
  return out;
}

/**
 * Instagram's descriptions look like
 *   `12K likes, 80 comments - somehotel on June 3, 2025: "Caption text…"`
 * and titles like `Some Hotel on Instagram: "Caption text…"`.
 */
function parseCaption(text: string | undefined) {
  if (!text) return { caption: null, account: null };
  const quoted = text.match(/:\s*[“"]([\s\S]*)[”"]\s*\.?\s*$/);
  const account =
    // Profiles: "The Pig Hotel (@the_pig_hotels) • Instagram photos and videos"
    text.match(/\(@([\w.]+)\)/)?.[1] ??
    text.match(/-\s*([\w.]+)\s+on\s+[A-Z][a-z]+ \d/)?.[1] ??
    text.match(/^(.+?)\s+on Instagram:/)?.[1] ??
    null;
  return { caption: quoted?.[1]?.trim() || null, account };
}

async function fetchImage(url: string | undefined): Promise<PostText["image"]> {
  if (!url) return null;
  try {
    const u = new URL(url);
    // Only Instagram's own CDNs.
    if (!/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname)) return null;
    const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0];
    if (type !== "image/jpeg" && type !== "image/png" && type !== "image/webp") return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE) return null;
    return { data: buf.toString("base64"), mediaType: type };
  } catch {
    return null;
  }
}

async function viaOpenGraph(url: string): Promise<PostText | null> {
  // Instagram serves full Open Graph tags to link-preview crawlers.
  const res = await fetch(url, {
    headers: {
      "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      Accept: "text/html",
      "Accept-Language": "en-GB,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return null;
  // A redirect to the login page means we got nothing about the post.
  if (/\/accounts\/login/.test(res.url)) return null;
  const meta = metaTags((await res.text()).slice(0, MAX_HTML));
  const title = meta.get("og:title");
  const description = meta.get("og:description") ?? meta.get("description");
  if (!title && !description) return null;
  // The generic site description isn't about the post.
  if (!description && /^Instagram$/i.test(title ?? "")) return null;

  const fromDesc = parseCaption(description);
  const fromTitle = parseCaption(title);
  return {
    caption: fromDesc.caption ?? fromTitle.caption,
    account: fromDesc.account ?? fromTitle.account,
    rawText: [title && `Title: ${title}`, description && `Description: ${description}`].filter(Boolean).join("\n"),
    image: await fetchImage(meta.get("og:image")),
    fetchedWith: "open-graph",
  };
}

async function viaOEmbed(url: string): Promise<PostText | null> {
  const token = process.env.META_OEMBED_TOKEN;
  if (!token) return null;
  const api = new URL("https://graph.facebook.com/v21.0/instagram_oembed");
  api.searchParams.set("url", url);
  api.searchParams.set("access_token", token);
  api.searchParams.set("omitscript", "true");
  const res = await fetch(api, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) {
    console.error(`oEmbed ${res.status}`);
    return null;
  }
  const d = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
  if (!d.title && !d.author_name) return null;
  return {
    caption: d.title?.trim() || null,
    account: d.author_name ?? null,
    rawText: [d.author_name && `Account: ${d.author_name}`, d.title && `Caption: ${d.title}`].filter(Boolean).join("\n"),
    image: await fetchImage(d.thumbnail_url),
    fetchedWith: "oembed",
  };
}

/**
 * Tries each method in turn; returns the first that yields a caption, else the
 * best partial result. Profiles have no caption (at most a bio), and oEmbed
 * only covers posts.
 */
export async function fetchInstagramPost(url: string): Promise<PostText | null> {
  const methods = isProfileUrl(url) ? [viaOpenGraph] : [viaOpenGraph, viaOEmbed];
  let partial: PostText | null = null;
  for (const method of methods) {
    try {
      const got = await method(url);
      if (got?.caption) return got;
      partial ??= got;
    } catch (e) {
      console.error(`${method.name} failed for ${url}:`, (e as Error).message);
    }
  }
  return partial;
}
