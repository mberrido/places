import { after, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { IngestError, MAX_REQUEST_BYTES, processIngest, submitScreenshot } from "@/lib/ingest";

// Screenshot upload from the app (the Shortcut uses /api/ingest).
// Form fields: image (file), ingestId (optional: add to an existing inbox item).
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (Number(req.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    return Response.json({ error: "That image is too big (15 MB max)." }, { status: 413 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "No image received" }, { status: 400 });
  const attachTo = Number(form?.get("ingestId")) || undefined;
  try {
    const id = await submitScreenshot(session.accountId, Buffer.from(await file.arrayBuffer()), session.name, attachTo);
    after(() => processIngest(id));
    return Response.json({ id });
  } catch (e) {
    if (e instanceof IngestError) return Response.json({ error: e.message }, { status: 400 });
    console.error("screenshot upload:", e);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
