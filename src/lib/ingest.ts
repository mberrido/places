import "server-only";
import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { DATABASE_PATH, db, schema } from "@/db";
import type { ExtractedPlace, Ingest } from "@/db/schema";
import { claudeConfigured, extractPlaces, ExtractionUnavailable, type ExtractInput } from "./extract";
import { GoogleUnavailable, googleConfigured, placeDetails, textSearch } from "./google";
import { fetchInstagramPost, isProfileUrl, normaliseInstagramUrl } from "./instagram";
import { findByGoogleId, getCategories, insertPlace } from "./places";

/** A job stuck in "processing" this long was lost (e.g. the server restarted). */
const STUCK_AFTER_MS = 5 * 60 * 1000;

function patch(id: number, fields: Partial<typeof schema.ingests.$inferInsert>) {
  db()
    .update(schema.ingests)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(schema.ingests.id, id))
    .run();
}

/** Unscoped: for the background pipeline, which works on an id it created. */
function ingestById(id: number): Ingest | null {
  return db().select().from(schema.ingests).where(eq(schema.ingests.id, id)).get() ?? null;
}

/** An inbox item of this household's (null if missing or someone else's). */
export function getIngest(accountId: number, id: number): Ingest | null {
  const i = ingestById(id);
  return i && i.accountId === accountId ? i : null;
}

export function createIngest(input: {
  accountId: number;
  url?: string | null;
  caption?: string | null;
  via: Ingest["via"];
  addedBy?: string | null;
}) {
  return db()
    .insert(schema.ingests)
    .values({
      accountId: input.accountId,
      url: input.url ?? null,
      caption: input.caption ?? null,
      via: input.via,
      addedBy: input.addedBy ?? null,
    })
    .returning({ id: schema.ingests.id })
    .get().id;
}

export type SubmitResult = { id: number; existing: boolean } | { error: string };

/**
 * Starts an ingest from whatever was pasted or shared: an Instagram link is
 * fetched, anything else long enough is treated as a caption. A link that's
 * already waiting in the inbox returns that item instead of a duplicate.
 * The caller kicks off `processIngest` (after the response).
 */
export function submitIngest(
  accountId: number,
  input: string,
  via: Ingest["via"],
  addedBy: string | null,
): SubmitResult {
  input = input.trim();
  if (!input) return { error: "Paste an Instagram link or the post's caption." };

  const url = normaliseInstagramUrl(input)?.url ?? null;
  if (!url && /https?:\/\//.test(input) && input.length < 300) {
    return { error: "That isn't an Instagram link. Paste a post, reel or profile link, or the caption text." };
  }
  if (!url && input.length < 15) return { error: "That's too short to find a place in." };

  if (url) {
    const existing = db()
      .select({ id: schema.ingests.id })
      .from(schema.ingests)
      .where(
        and(
          eq(schema.ingests.accountId, accountId),
          eq(schema.ingests.url, url),
          notInArray(schema.ingests.status, ["dismissed", "done"]),
        ),
      )
      .get();
    if (existing) return { id: existing.id, existing: true };
  }

  const id = createIngest({
    accountId,
    url,
    caption: url ? null : input.slice(0, 10_000),
    via: !url && via === "link" ? "caption" : via,
    addedBy,
  });
  return { id, existing: false };
}

// ---------------------------------------------------------------- Screenshots

const UPLOADS = path.join(/*turbopackIgnore: true*/ path.dirname(DATABASE_PATH), "uploads");
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function screenshotPath(id: number) {
  return path.join(/*turbopackIgnore: true*/ UPLOADS, `ingest-${id}.jpg`);
}

/**
 * Stores a screenshot for an ingest, normalised for Claude: EXIF rotation
 * applied, long edge at most 1568px, JPEG. Kept only until the ingest is
 * saved or dismissed. Throws a user-facing message for bad files.
 */
export async function saveScreenshot(id: number, bytes: Buffer) {
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error("That image is too big (15 MB max).");
  let jpeg: Buffer;
  try {
    jpeg = await sharp(bytes)
      .rotate()
      .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new Error("That file isn't an image we can read.");
  }
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.writeFileSync(screenshotPath(id), jpeg);
}

function loadScreenshot(id: number): ExtractInput["image"] {
  try {
    return { data: fs.readFileSync(screenshotPath(id)).toString("base64"), mediaType: "image/jpeg" };
  } catch {
    return null;
  }
}

/**
 * A screenshot either starts a new ingest or is added to an existing one (e.g.
 * a link Instagram wouldn't give us text for). Returns the ingest id.
 */
export async function submitScreenshot(
  accountId: number,
  bytes: Buffer,
  addedBy: string | null,
  attachTo?: number,
) {
  const existing = attachTo ? getIngest(accountId, attachTo) : null;
  if (attachTo && (!existing || existing.status === "done" || existing.status === "dismissed")) {
    throw new Error("That inbox item isn't open any more.");
  }
  const id = existing?.id ?? createIngest({ accountId, via: "screenshot", addedBy });
  try {
    await saveScreenshot(id, bytes);
  } catch (e) {
    if (!existing) patch(id, { status: "dismissed" }); // don't leave an empty item behind
    throw e;
  }
  patch(id, { status: "pending", error: null });
  return id;
}

export function hasScreenshot(id: number) {
  return fs.existsSync(screenshotPath(id));
}

function deleteScreenshot(id: number) {
  fs.rmSync(screenshotPath(id), { force: true });
}

/** This household's ingests waiting for someone to look at them, newest first. */
export function inboxItems(accountId: number) {
  return db()
    .select()
    .from(schema.ingests)
    .where(
      and(
        eq(schema.ingests.accountId, accountId),
        inArray(schema.ingests.status, ["pending", "processing", "ready", "needs_text", "failed"]),
      ),
    )
    .orderBy(desc(schema.ingests.createdAt))
    .all();
}

/** For the Inbox badge: items needing a decision, plus places shared with this household. */
export function inboxCount(accountId: number) {
  const ingests =
    db()
      .select({ n: sql<number>`count(*)` })
      .from(schema.ingests)
      .where(
        and(eq(schema.ingests.accountId, accountId), inArray(schema.ingests.status, ["ready", "needs_text", "failed"])),
      )
      .get()?.n ?? 0;
  const shares =
    db()
      .select({ n: sql<number>`count(*)` })
      .from(schema.shares)
      .where(and(eq(schema.shares.toAccountId, accountId), eq(schema.shares.status, "pending")))
      .get()?.n ?? 0;
  return ingests + shares;
}

export function isStuck(i: Ingest) {
  return (i.status === "processing" || i.status === "pending") && Date.now() - i.updatedAt.getTime() > STUCK_AFTER_MS;
}

/** Marks lost jobs as failed so they can be retried. */
export function failStuckIngests() {
  db()
    .update(schema.ingests)
    .set({ status: "failed", error: "Processing was interrupted. Try again." })
    .where(
      and(
        inArray(schema.ingests.status, ["pending", "processing"]),
        lt(schema.ingests.updatedAt, new Date(Date.now() - STUCK_AFTER_MS)),
      ),
    )
    .run();
}

/**
 * Runs the pipeline for one ingest: fetch the post (if we don't have its text
 * yet) → Claude extracts places → Google Text Search finds matches. Never
 * throws; problems end up in `status` / `error` for the inbox to show.
 */
export async function processIngest(id: number, extra: { image?: ExtractInput["image"] } = {}) {
  const ingest = ingestById(id);
  if (!ingest) return;
  patch(id, { status: "processing", error: null });

  try {
    let { caption, account, fetchedWith } = ingest;
    let rawText: string | null = null;
    const screenshot = loadScreenshot(id);
    let image = extra.image ?? screenshot;

    if (ingest.url && !caption) {
      const post = await fetchInstagramPost(ingest.url);
      if (post) {
        caption = post.caption;
        account = post.account;
        rawText = post.rawText;
        fetchedWith = post.fetchedWith;
        image ??= post.image;
      }
      patch(id, { caption, account, fetchedWith });
    }

    if (!caption && !rawText && !image) {
      patch(id, {
        status: "needs_text",
        error: "Instagram didn't give us the post's text. Paste the caption or add a screenshot to carry on.",
      });
      return;
    }

    if (!claudeConfigured()) {
      patch(id, { status: "failed", error: "Claude isn't set up (ANTHROPIC_API_KEY is empty), so the post can't be read." });
      return;
    }

    const profile = isProfileUrl(ingest.url);
    const extraction = await extractPlaces({
      kind: profile ? "profile" : "post",
      screenshot: !!screenshot,
      url: ingest.url,
      account,
      caption,
      rawText,
      image,
      categories: getCategories(ingest.accountId).map((c) => ({ slug: c.slug, label: c.label })),
    });

    const places: ExtractedPlace[] = [];
    for (const p of extraction.places) {
      let candidates: ExtractedPlace["candidates"] = [];
      if (googleConfigured()) {
        try {
          // A profile is often a group (e.g. several hotels), so offer more branches.
          candidates = await textSearch(p.searchQuery, profile ? 5 : 3);
        } catch (e) {
          if (!(e instanceof GoogleUnavailable)) throw e;
          console.error(e.message);
        }
      }
      places.push({
        name: p.name,
        area: p.area,
        country: p.country,
        category: p.category,
        confidence: p.confidence,
        query: p.searchQuery,
        candidates,
      });
    }

    patch(id, { status: "ready", places, summary: extraction.summary });
  } catch (e) {
    const message = e instanceof ExtractionUnavailable ? e.message : `Something went wrong: ${(e as Error).message}`;
    console.error(`ingest ${id}:`, e);
    patch(id, { status: "failed", error: message });
  }
}

export type Pick = {
  index: number; // which extracted place
  googlePlaceId: string | null; // null = save without Google data
  category: string;
};

/** Saves the ticked places and closes the ingest. Returns the new (or already-saved) place ids. */
export async function confirmIngest(accountId: number, id: number, picks: Pick[], addedBy: string) {
  const ingest = getIngest(accountId, id);
  if (!ingest?.places) throw new Error("Nothing to confirm");
  const ids: number[] = [];

  for (const pick of picks) {
    const extracted = ingest.places[pick.index];
    if (!extracted) continue;

    if (pick.googlePlaceId) {
      const existing = findByGoogleId(accountId, pick.googlePlaceId);
      if (existing) {
        ids.push(existing.id);
        continue;
      }
    }

    let details = null;
    if (pick.googlePlaceId) {
      try {
        details = await placeDetails(pick.googlePlaceId);
      } catch (e) {
        if (!(e instanceof GoogleUnavailable)) throw e;
        console.error(e.message);
      }
    }
    const candidate = extracted.candidates.find((c) => c.googlePlaceId === pick.googlePlaceId);

    ids.push(
      await insertPlace(
        {
          accountId,
          name: details?.name ?? candidate?.name ?? extracted.name,
          category: pick.category,
          googlePlaceId: pick.googlePlaceId,
          status: "want",
          source: "instagram",
          sourceUrl: ingest.url,
          sourceCaption: ingest.caption,
          city: details ? null : extracted.area,
          country: details ? null : extracted.country,
          lat: candidate?.lat ?? null,
          lng: candidate?.lng ?? null,
          addedBy: ingest.addedBy ?? addedBy,
        },
        details,
      ),
    );
  }

  patch(id, { status: "done", savedPlaceIds: ids });
  deleteScreenshot(id);
  return ids;
}

function assertOwn(accountId: number, id: number) {
  if (!getIngest(accountId, id)) throw new Error("Inbox item not found");
}

export function setIngestCaption(accountId: number, id: number, caption: string) {
  assertOwn(accountId, id);
  patch(id, { caption: caption.trim().slice(0, 10_000), status: "pending", error: null });
}

export function reopenIngest(accountId: number, id: number) {
  assertOwn(accountId, id);
  patch(id, { status: "ready", savedPlaceIds: null });
}

export function dismissIngest(accountId: number, id: number) {
  assertOwn(accountId, id);
  patch(id, { status: "dismissed" });
  deleteScreenshot(id);
}
