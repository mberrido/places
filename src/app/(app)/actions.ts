"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { STATUSES } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { GoogleUnavailable, placeDetails } from "@/lib/google";
import { findByGoogleId, getPlace, insertPlace, normaliseTags, refreshPlace, setTags } from "@/lib/places";
import { deleteTripPhoto, deleteTripPhotoFiles } from "@/lib/trip-photos";

const optionalText = z
  .string()
  .trim()
  .max(5000)
  .transform((s) => s || null)
  .nullish();
const optionalNumber = z.coerce.number().finite().nullish();

const NewPlace = z.object({
  googlePlaceId: z.string().trim().min(1).nullish(),
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.string().min(1),
  status: z.enum(STATUSES).default("want"),
  notes: optionalText,
  tags: z.array(z.string()).default([]),
  address: optionalText,
  city: optionalText,
  country: optionalText,
  lat: optionalNumber,
  lng: optionalNumber,
  sessionToken: z.string().nullish(),
});

export type NewPlaceInput = z.input<typeof NewPlace>;
export type SaveResult = { error: string; existingId?: number } | undefined;

export async function createPlace(input: NewPlaceInput): Promise<SaveResult> {
  const session = await requireSession();
  const parsed = NewPlace.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid place" };
  const p = parsed.data;

  if (p.googlePlaceId) {
    const existing = findByGoogleId(session.accountId, p.googlePlaceId);
    if (existing) return { error: `${existing.name} is already saved.`, existingId: existing.id };
  }

  // Google data is optional: if it fails we still save what we have.
  let details = null;
  if (p.googlePlaceId) {
    try {
      // Full details only now, on save (the preview used the cheaper fields, which ended the search session).
      details = await placeDetails(p.googlePlaceId);
    } catch (e) {
      if (!(e instanceof GoogleUnavailable)) throw e;
      console.error(e.message);
    }
  }

  const id = await insertPlace(
    {
      accountId: session.accountId,
      name: p.name,
      category: p.category,
      googlePlaceId: p.googlePlaceId ?? null,
      status: p.status,
      notes: p.notes,
      source: "manual",
      address: p.address,
      city: p.city,
      country: p.country,
      lat: p.lat,
      lng: p.lng,
      addedBy: session.name,
    },
    details,
    normaliseTags(p.tags),
  );
  redirect(`/places/${id}`);
}

const PlacePatch = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  category: z.string().min(1).optional(),
  status: z.enum(STATUSES).optional(),
  notes: optionalText,
  tags: z.array(z.string()).optional(),
  ourRating: z.number().int().min(1).max(5).nullish(),
  visitedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
});

/** Throws unless the place is in this household's list. */
function assertOwn(accountId: number, id: number) {
  if (!getPlace(accountId, id)) throw new Error("Place not found");
}

export async function updatePlace(id: number, patch: z.input<typeof PlacePatch>) {
  const { accountId } = await requireSession();
  assertOwn(accountId, id);
  const p = PlacePatch.parse(patch);
  const { tags, ...fields } = p;
  // Our own rating and visit date only make sense once we've been.
  if (fields.status && fields.status !== "been") {
    fields.ourRating = null;
    fields.visitedAt = null;
  }
  db()
    .update(schema.places)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(schema.places.id, id), eq(schema.places.accountId, accountId)))
    .run();
  if (tags) setTags(id, normaliseTags(tags));
  refresh();
}

export async function deletePlace(id: number) {
  const { accountId } = await requireSession();
  if (getPlace(accountId, id)) deleteTripPhotoFiles([id]);
  db()
    .delete(schema.places)
    .where(and(eq(schema.places.id, id), eq(schema.places.accountId, accountId)))
    .run();
  redirect("/");
}

/** Delete from the list (swipe), staying on the page. */
export async function removePlace(id: number) {
  const { accountId } = await requireSession();
  if (getPlace(accountId, id)) deleteTripPhotoFiles([id]);
  db()
    .delete(schema.places)
    .where(and(eq(schema.places.id, id), eq(schema.places.accountId, accountId)))
    .run();
  refresh();
}

export async function removeTripPhoto(photoId: number) {
  const { accountId } = await requireSession();
  deleteTripPhoto(accountId, z.number().int().parse(photoId));
  refresh();
}

export async function refreshGoogleData(id: number) {
  const { accountId } = await requireSession();
  assertOwn(accountId, id);
  await refreshPlace(id, { force: true });
  refresh();
}

// ---------------------------------------------------------------- Categories

const CategoryInput = z.object({
  label: z.string().trim().min(1).max(40),
  emoji: z.string().trim().min(1).max(8),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});

function slugify(s: string) {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "category"
  );
}

const ownCategory = (accountId: number, slug: string) =>
  and(eq(schema.categories.accountId, accountId), eq(schema.categories.slug, slug));

export async function addCategory(input: z.input<typeof CategoryInput>) {
  const { accountId } = await requireSession();
  const c = CategoryInput.parse(input);
  let slug = slugify(c.label);
  const taken = new Set(
    db()
      .select({ slug: schema.categories.slug })
      .from(schema.categories)
      .where(eq(schema.categories.accountId, accountId))
      .all()
      .map((r) => r.slug),
  );
  for (let i = 2; taken.has(slug); i++) slug = `${slugify(c.label)}-${i}`;
  const max = db()
    .select({ m: sql<number>`coalesce(max(${schema.categories.sortOrder}), 0)` })
    .from(schema.categories)
    .where(eq(schema.categories.accountId, accountId))
    .get()!.m;
  db().insert(schema.categories).values({ accountId, slug, ...c, sortOrder: max + 1 }).run();
  refresh();
}

export async function updateCategory(slug: string, input: z.input<typeof CategoryInput>) {
  const { accountId } = await requireSession();
  db().update(schema.categories).set(CategoryInput.parse(input)).where(ownCategory(accountId, slug)).run();
  refresh();
}

/** Deletes a category, moving its places to `moveTo`. */
export async function deleteCategory(slug: string, moveTo: string) {
  const { accountId } = await requireSession();
  if (slug === moveTo) throw new Error("Pick a different category to move places into");
  const d = db();
  d.transaction((tx) => {
    tx.update(schema.places)
      .set({ category: moveTo })
      .where(and(eq(schema.places.accountId, accountId), eq(schema.places.category, slug)))
      .run();
    tx.delete(schema.categories).where(ownCategory(accountId, slug)).run();
  });
  refresh();
}

