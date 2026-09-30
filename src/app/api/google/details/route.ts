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
    if (e instanceof GoogleUnavailable) {
      console.error(e.message);
      return Response.json({ error: "Couldn't load details from Google", existing: existing ?? null }, { status: 502 });
    }
    throw e;
  }
}
