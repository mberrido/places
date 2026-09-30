import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { GoogleUnavailable, autocomplete, googleConfigured } from "@/lib/google";

export async function GET(req: NextRequest) {
  await requireSession();
  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? "").trim();
  const session = p.get("session") ?? "";
  if (q.length < 2) return Response.json({ suggestions: [] });
  if (!googleConfigured()) return Response.json({ suggestions: [], unavailable: "Google isn't configured" });

  const lat = Number(p.get("lat"));
  const lng = Number(p.get("lng"));
  const near = p.has("lat") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  try {
    return Response.json({ suggestions: await autocomplete(q.slice(0, 200), near, session) });
  } catch (e) {
    if (e instanceof GoogleUnavailable) {
      console.error(e.message);
      return Response.json({ suggestions: [], unavailable: "Google search is unavailable right now" });
    }
    throw e;
  }
}
