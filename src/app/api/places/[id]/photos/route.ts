import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { boundedBody } from "@/lib/bounded-body";
import { MAX_REQUEST_BYTES } from "@/lib/ingest";
import { PhotoError, addTripPhoto } from "@/lib/trip-photos";

// Upload one trip photo (form field "photo"); the app sends several one at a time.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/places/[id]/photos">) {
  const session = await requireSession();
  const body = await boundedBody(req, MAX_REQUEST_BYTES).catch(() => null);
  if (!body) return Response.json({ error: "That photo is too big (15 MB max)." }, { status: 413 });
  const form = await body.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "No photo received" }, { status: 400 });
  if (file.size > MAX_REQUEST_BYTES) return Response.json({ error: "That photo is too big (15 MB max)." }, { status: 413 });
  try {
    const id = await addTripPhoto(
      session.accountId,
      Number((await ctx.params).id),
      Buffer.from(await file.arrayBuffer()),
      session.name,
    );
    return Response.json({ id });
  } catch (e) {
    if (e instanceof PhotoError) return Response.json({ error: e.message }, { status: 400 });
    console.error("trip photo upload:", e);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
