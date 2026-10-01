import { after, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { GoogleUnavailable, googleConfigured } from "@/lib/google";
import { getPhoto } from "@/lib/photo-cache";
import { refreshPlace } from "@/lib/places";

// Photos of a saved place, through the server (the API key never reaches the
// browser) and the on-disk photo cache (one Google call per photo per 30 days).
const WIDTHS = [240, 480, 960, 1600];

export async function GET(req: NextRequest, ctx: RouteContext<"/api/photos/[placeId]/[index]">) {
  const { accountId } = await requireSession();
  const { placeId, index } = await ctx.params;
  const requested = Number(req.nextUrl.searchParams.get("w") ?? 480);
  const width = WIDTHS.find((w) => w >= requested) ?? WIDTHS.at(-1)!;

  const cache = db()
    .select({
      photos: schema.googleCache.photos,
      refreshed: schema.googleCache.lastRefreshedAt,
      googlePlaceId: schema.places.googlePlaceId,
    })
    .from(schema.googleCache)
    // Only photos of this household's own places.
    .innerJoin(schema.places, eq(schema.places.id, schema.googleCache.placeId))
    .where(and(eq(schema.googleCache.placeId, Number(placeId)), eq(schema.places.accountId, accountId)))
    .get();
  const photo = cache?.photos?.[Number(index)];
  if (!photo || !googleConfigured()) return new Response("Not found", { status: 404 });

  try {
    return image(await getPhoto(photo.name, width, `place:${cache!.googlePlaceId}:${index}`));
  } catch (e) {
    if (!(e instanceof GoogleUnavailable)) throw e;
    console.error(`photo ${placeId}/${index}:`, e.message);
    // Photo names expire. If this place's Google data is more than a day old,
    // refresh it (at most once a day) so the next view gets working photos.
    if (cache && Date.now() - cache.refreshed.getTime() > 24 * 3600 * 1000) {
      after(() => refreshPlace(Number(placeId), { force: true }));
    }
    return new Response("Photo unavailable", { status: 502 });
  }
}

function image(bytes: Buffer) {
  return new Response(new Uint8Array(bytes), {
    // Vary: Cookie so a browser shared by two households never reuses the other's cached photo.
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=604800", Vary: "Cookie" },
  });
}
