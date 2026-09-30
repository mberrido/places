import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { GoogleUnavailable, googleConfigured, nearbySearch, NEARBY_GROUPS, type NearbyGroup } from "@/lib/google";
import { savedGoogleIds } from "@/lib/places";

export async function GET(req: NextRequest) {
  const { accountId } = await requireSession();
  const p = req.nextUrl.searchParams;
  const lat = Number(p.get("lat"));
  const lng = Number(p.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Response.json({ error: "Missing location" }, { status: 400 });
  if (!googleConfigured()) return Response.json({ error: "Google isn't set up" }, { status: 503 });
  const g = p.get("type");
  const group: NearbyGroup = g && (g === "all" || g in NEARBY_GROUPS) ? (g as NearbyGroup) : "all";
  const radius = Number(p.get("radius")) || 500;
  try {
    const results = await nearbySearch({ lat, lng }, radius, group);
    const saved = savedGoogleIds(accountId, results.map((r) => r.googlePlaceId));
    return Response.json({ results, saved });
  } catch (e) {
    if (e instanceof GoogleUnavailable) {
      console.error(e.message);
      return Response.json({ error: "Google search is unavailable right now" }, { status: 502 });
    }
    throw e;
  }
}
