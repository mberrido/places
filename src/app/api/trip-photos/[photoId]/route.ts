import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { readTripPhoto } from "@/lib/trip-photos";

// One of the household's own photos: ?size=thumb for the grid, full otherwise.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/trip-photos/[photoId]">) {
  const { accountId } = await requireSession();
  const size = req.nextUrl.searchParams.get("size") === "thumb" ? "thumb" : "full";
  const bytes = readTripPhoto(accountId, Number((await ctx.params).photoId), size);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    // A photo never changes (a new upload gets a new id). Vary: Cookie so households never share a cached copy.
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable", Vary: "Cookie" },
  });
}
