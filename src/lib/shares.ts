import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Share } from "@/db/schema";
import { getAccount } from "./accounts";
import { GoogleUnavailable, placeDetails } from "./google";
import { findByGoogleId, getCategories, getPlace, insertPlace } from "./places";

/**
 * Sends one of this household's places to other households. Each recipient
 * gets a copy of the details in their inbox; nothing is added to their list
 * until they save it.
 */
export function sharePlace(input: {
  fromAccountId: number;
  placeId: number;
  toAccountIds: number[];
  note: string | null;
  sharedBy: string;
}) {
  const place = getPlace(input.fromAccountId, input.placeId);
  if (!place) throw new Error("Place not found");
  const recipients = [...new Set(input.toAccountIds)].filter((id) => id !== input.fromAccountId && getAccount(id));
  if (!recipients.length) throw new Error("Pick someone to share with");

  // Don't stack duplicates: the same place already waiting in their inbox.
  const waiting = new Set(
    db()
      .select({ to: schema.shares.toAccountId })
      .from(schema.shares)
      .where(
        and(
          eq(schema.shares.fromPlaceId, place.id),
          eq(schema.shares.status, "pending"),
          inArray(schema.shares.toAccountId, recipients),
        ),
      )
      .all()
      .map((r) => r.to),
  );
  const fresh = recipients.filter((id) => !waiting.has(id));
  if (fresh.length) {
    db()
      .insert(schema.shares)
      .values(
        fresh.map((toAccountId) => ({
          fromAccountId: input.fromAccountId,
          toAccountId,
          fromPlaceId: place.id,
          sharedBy: input.sharedBy,
          note: input.note?.trim().slice(0, 1000) || null,
          name: place.name,
          category: place.category,
          googlePlaceId: place.googlePlaceId,
          address: place.address,
          city: place.city,
          country: place.country,
          lat: place.lat,
          lng: place.lng,
          rating: place.google?.rating ?? null,
          photoName: place.google?.photos?.[0]?.name ?? null,
          sourceUrl: place.sourceUrl,
        })),
      )
      .run();
  }
  return { sent: fresh.length, alreadyWaiting: recipients.length - fresh.length };
}

export type ShareWithSender = Share & { fromName: string };

function withSender(rows: Share[]): ShareWithSender[] {
  const names = new Map<number, string>();
  return rows.map((s) => {
    if (!names.has(s.fromAccountId)) names.set(s.fromAccountId, getAccount(s.fromAccountId)?.name ?? "Someone");
    return { ...s, fromName: names.get(s.fromAccountId)! };
  });
}

/** Places other households have shared with this one, waiting for a decision. */
export function pendingShares(accountId: number): ShareWithSender[] {
  return withSender(
    db()
      .select()
      .from(schema.shares)
      .where(and(eq(schema.shares.toAccountId, accountId), eq(schema.shares.status, "pending")))
      .orderBy(desc(schema.shares.createdAt))
      .all(),
  );
}

/** A share addressed to this household (null if missing or someone else's). */
export function getShare(accountId: number, id: number): ShareWithSender | null {
  const s = db()
    .select()
    .from(schema.shares)
    .where(and(eq(schema.shares.id, id), eq(schema.shares.toAccountId, accountId)))
    .get();
  return s ? withSender([s])[0] : null;
}

/** Who this place has been shared with, for the place page. */
export function sharesSentFor(accountId: number, placeId: number) {
  const rows = db()
    .select({ to: schema.shares.toAccountId, status: schema.shares.status, at: schema.shares.createdAt })
    .from(schema.shares)
    .where(and(eq(schema.shares.fromAccountId, accountId), eq(schema.shares.fromPlaceId, placeId)))
    .orderBy(desc(schema.shares.createdAt))
    .all();
  return rows.map((r) => ({ ...r, toName: getAccount(r.to)?.name ?? "Deleted account" }));
}

/** The sender's category if this household has it too, otherwise "other". */
export function suggestedCategory(accountId: number, share: Share) {
  const slugs = getCategories(accountId).map((c) => c.slug);
  return slugs.includes(share.category) ? share.category : slugs.includes("other") ? "other" : slugs[0];
}

/** Saves a shared place into this household's list; returns the place id. */
export async function saveShare(accountId: number, id: number, category: string, addedBy: string) {
  const share = getShare(accountId, id);
  if (!share || share.status !== "pending") throw new Error("That share isn't waiting any more");

  let placeId = share.googlePlaceId ? findByGoogleId(accountId, share.googlePlaceId)?.id : undefined;
  if (!placeId) {
    let details = null;
    if (share.googlePlaceId) {
      try {
        details = await placeDetails(share.googlePlaceId);
      } catch (e) {
        if (!(e instanceof GoogleUnavailable)) throw e;
        console.error(e.message);
      }
    }
    placeId = await insertPlace(
      {
        accountId,
        name: share.name,
        category,
        googlePlaceId: share.googlePlaceId,
        address: share.address,
        city: share.city,
        country: share.country,
        lat: share.lat,
        lng: share.lng,
        status: "want",
        source: "shared",
        sourceUrl: share.sourceUrl,
        notes: `Shared by ${share.sharedBy ?? share.fromName} (${share.fromName})${share.note ? `: ${share.note}` : ""}`,
        addedBy,
      },
      details,
    );
  }
  db().update(schema.shares).set({ status: "saved", savedPlaceId: placeId }).where(eq(schema.shares.id, id)).run();
  return placeId;
}

export function dismissShare(accountId: number, id: number) {
  db()
    .update(schema.shares)
    .set({ status: "dismissed" })
    .where(and(eq(schema.shares.id, id), eq(schema.shares.toAccountId, accountId)))
    .run();
}
