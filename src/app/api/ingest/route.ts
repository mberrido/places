import { after, type NextRequest } from "next/server";
import { accountByIngestToken } from "@/lib/accounts";
import { clientIp, isLockedOut, recordFailure } from "@/lib/rate-limit";
import { boundedBody } from "@/lib/bounded-body";
import { IngestError, MAX_REQUEST_BYTES, processIngest, submitIngest, submitScreenshot } from "@/lib/ingest";

/**
 * Endpoint for the iOS Shortcut (and anything else with a household's token).
 * Queues the item and answers straight away; processing happens afterwards and
 * the result waits in the inbox.
 *
 *   Authorization: Bearer <the household's token, from Settings>
 *   Body, any of:
 *     multipart/form-data   input=<link or caption>  |  image=<file>   [by=<name>]
 *     application/json      {"input": "...", "by": "..."}   ("url" / "text" also accepted)
 *     text/plain            the link or caption
 */
export async function POST(req: NextRequest) {
  const ip = `ingest:${clientIp(req.headers)}`;
  if (isLockedOut(ip)) return reply(429, "Too many bad tokens. Try again in 15 minutes.");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  // Each household has its own token (Settings → Share to Places); it decides whose inbox this goes to.
  const account = accountByIngestToken(token);
  if (!account) {
    recordFailure(ip);
    return reply(401, "Wrong token. Check the Authorization header in the Shortcut.");
  }

  const body = await boundedBody(req, MAX_REQUEST_BYTES).catch(() => null);
  if (!body) return reply(413, "That's too big (15 MB max).");

  let input = "";
  let by: string | null = null;
  let image: File | null = null;
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
      const form = await body.formData();
      const field = form.get("image") ?? form.get("input");
      if (field instanceof File && field.size > 0) image = field;
      else input = String(form.get("input") ?? form.get("url") ?? form.get("text") ?? "");
      by = form.get("by") ? String(form.get("by")) : null;
    } else if (type.includes("application/json")) {
      const json = (await body.json()) as Record<string, unknown>;
      input = String(json.input ?? json.url ?? json.text ?? "");
      by = typeof json.by === "string" ? json.by : null;
    } else {
      input = await body.text();
    }
  } catch {
    return reply(400, "Couldn't read the request body.");
  }
  by = by?.trim().slice(0, 40) || "Shortcut";

  try {
    if (image) {
      const id = await submitScreenshot(account.id, Buffer.from(await image.arrayBuffer()), by);
      after(() => processIngest(id));
      return reply(202, "Screenshot sent to the Places inbox", id);
    }
    const result = submitIngest(account.id, input, "shortcut", by);
    if ("error" in result) return reply(400, result.error);
    if (!result.existing) after(() => processIngest(result.id));
    return reply(202, result.existing ? "Already in the Places inbox" : "Sent to the Places inbox", result.id);
  } catch (e) {
    if (e instanceof IngestError) return reply(400, e.message);
    console.error("ingest:", e);
    return reply(500, "Something went wrong. Try again.");
  }
}

function reply(status: number, message: string, id?: number) {
  return Response.json({ ok: status < 300, message, id }, { status });
}
