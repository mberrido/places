import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { GoogleUnavailable, googleConfigured } from "@/lib/google";
import { getPhoto } from "@/lib/photo-cache";

// Photo for a place that isn't saved yet (search previews, inbox matches, near me).
// Goes through the same disk cache as saved places' photos.
export async function GET(req: NextRequest) {
  await requireSession();
  const name = req.nextUrl.searchParams.get("name") ?? "";
  if (!/^places\/[\w-]+\/photos\/[\w-]+$/.test(name) || !googleConfigured()) {
    return new Response("Not found", { status: 404 });
  }
  try {
    return new Response(new Uint8Array(await getPhoto(name, 480)), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=604800" },
    });
  } catch (e) {
    if (!(e instanceof GoogleUnavailable)) throw e;
    return new Response("Photo unavailable", { status: 502 });
  }
}
