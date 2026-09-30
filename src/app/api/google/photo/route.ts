import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchPhoto, googleConfigured } from "@/lib/google";

// Photo for a place that isn't saved yet (the add-place preview).
export async function GET(req: NextRequest) {
  await requireSession();
  const name = req.nextUrl.searchParams.get("name") ?? "";
  if (!/^places\/[\w-]+\/photos\/[\w-]+$/.test(name) || !googleConfigured()) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const { bytes, contentType } = await fetchPhoto(name, 480);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new Response("Photo unavailable", { status: 502 });
  }
}
