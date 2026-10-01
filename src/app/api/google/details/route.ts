import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { suggestCategory } from "@/lib/categories";
import { GoogleUnavailable, placeDetails } from "@/lib/google";
import { findByGoogleId, getCategories } from "@/lib/places";

export async function GET(req: NextRequest) {
  const { accountId } = await requireSession();
  const id = req.nextUrl.searchParams.get("id");
  const session = req.nextUrl.searchParams.get("session") ?? undefined;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const existing = findByGoogleId(accountId, id);
  try {
    const details = await placeDetails(id, session);
    const slugs = getCategories(accountId).map((c) => c.slug);
    return Response.json({
      details,
      suggestedCategory: suggestCategory(details.primaryType, details.types, slugs),
      existing: existing ?? null,
    });
  } catch (e) {
    // Anything else (e.g. data in a shape we didn't expect) still answers in
    // JSON, so the app shows a real message rather than "check your connection".
    console.error(`details ${id}:`, e);
    const message =
      e instanceof GoogleUnavailable ? "Couldn't load details from Google" : "Couldn't read Google's details for that place";
    return Response.json({ error: message, existing: existing ?? null }, { status: 502 });
  }
}
