import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { GoogleUnavailable, placeLocation } from "@/lib/google";

// Coordinates for a picked place or town, used as the "distance from" origin.
export async function GET(req: NextRequest) {
  await requireSession();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  try {
    return Response.json(await placeLocation(id, req.nextUrl.searchParams.get("session") ?? undefined));
  } catch (e) {
    if (e instanceof GoogleUnavailable) {
      console.error(e.message);
      return Response.json({ error: "Couldn't look that place up" }, { status: 502 });
    }
    throw e;
  }
}
