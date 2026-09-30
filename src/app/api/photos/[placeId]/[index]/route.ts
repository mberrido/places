import { after, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { fetchPhoto, googleConfigured } from "@/lib/google";
import { refreshPlace } from "@/lib/places";

// Server proxy for Google place photos: the API key never reaches the browser,
// and photos are only held briefly (browser cache + a small in-memory LRU),
// not re-hosted.
const MAX_ENTRIES = 150;
const TTL_MS = 24 * 3600 * 1000;
const memory = new Map<string, { at: number; bytes: Buffer; contentType: string }>();

const WIDTHS = [240, 480, 960, 1600];

export async function GET(req: NextRequest, ctx: RouteContext<"/api/photos/[placeId]/[index]">) {
  const { accountId } = await requireSession();
  const { placeId, index } = await ctx.params;
  const requested = Number(req.nextUrl.searchParams.get("w") ?? 480);
  const width = WIDTHS.find((w) => w >= requested) ?? WIDTHS.at(-1)!;

  const cache = db()
    .select({ photos: schema.googleCache.photos, refreshed: schema.googleCache.lastRefreshedAt })
    .from(schema.googleCache)
    // Only photos of this household's own places.
    .innerJoin(schema.places, eq(schema.places.id, schema.googleCache.placeId))
    .where(and(eq(schema.googleCache.placeId, Number(placeId)), eq(schema.places.accountId, accountId)))
    .get();
  const photo = cache?.photos?.[Number(index)];
  if (!photo || !googleConfigured()) return new Response("Not found", { status: 404 });

  const key = `${photo.name}@${width}`;
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return image(hit.bytes, hit.contentType);

  try {
    const { bytes, contentType } = await fetchPhoto(photo.name, width);
    memory.delete(key);
    memory.set(key, { at: Date.now(), bytes, contentType });
    while (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value!);
    return image(bytes, contentType);
  } catch (e) {
    console.error(`photo ${placeId}/${index}:`, (e as Error).message);
    // Photo names expire. If this cache entry is more than a day old, refresh it
    // (at most once a day per place) so the next view gets working photos.
    if (cache && Date.now() - cache.refreshed.getTime() > 24 * 3600 * 1000) {
      after(() => refreshPlace(Number(placeId), { force: true }));
    }
    return new Response("Photo unavailable", { status: 502 });
  }
}

function image(bytes: Buffer, contentType: string) {
  return new Response(new Uint8Array(bytes), {
    // Vary: Cookie so a browser shared by two households never reuses the other's cached photo.
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=86400", Vary: "Cookie" },
  });
}
