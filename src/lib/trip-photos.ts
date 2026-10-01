import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import sharp, { type OutputInfo } from "sharp";
import { DATABASE_PATH, db, schema } from "@/db";

// The household's own photos of a place: stored as a full-size JPEG (long edge
// 2048px) and a square thumbnail, next to the database so backups of the data
// folder include them.

const DIR = path.join(/*turbopackIgnore: true*/ path.dirname(DATABASE_PATH), "trip-photos");
const MAX_PER_PLACE = 200;

/** A problem to show the person as is. */
export class PhotoError extends Error {}

function filePath(file: string, size: "full" | "thumb") {
  return path.join(DIR, size === "thumb" ? `${file}-t.jpg` : `${file}.jpg`);
}

function ownsPlace(accountId: number, placeId: number) {
  return !!db()
    .select({ id: schema.places.id })
    .from(schema.places)
    .where(and(eq(schema.places.id, placeId), eq(schema.places.accountId, accountId)))
    .get();
}

export function listTripPhotos(placeId: number) {
  return db()
    .select({ id: schema.tripPhotos.id, width: schema.tripPhotos.width, height: schema.tripPhotos.height })
    .from(schema.tripPhotos)
    .where(eq(schema.tripPhotos.placeId, placeId))
    .orderBy(asc(schema.tripPhotos.createdAt), asc(schema.tripPhotos.id))
    .all();
}

export async function addTripPhoto(accountId: number, placeId: number, bytes: Buffer, addedBy: string) {
  if (!ownsPlace(accountId, placeId)) throw new PhotoError("Place not found.");
  if (listTripPhotos(placeId).length >= MAX_PER_PLACE) throw new PhotoError(`That's the limit of ${MAX_PER_PLACE} photos for one place.`);

  let full: { data: Buffer; info: OutputInfo };
  let thumb: Buffer;
  try {
    // limitInputPixels: refuse absurdly large images rather than run out of memory.
    const base = sharp(bytes, { limitInputPixels: 60_000_000 }).rotate();
    full = await base
      .clone()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    thumb = await base.clone().resize({ width: 480, height: 480, fit: "cover" }).jpeg({ quality: 78 }).toBuffer();
  } catch {
    throw new PhotoError("That file isn't a photo we can read.");
  }

  const file = crypto.randomBytes(16).toString("hex");
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(filePath(file, "full"), full.data);
  fs.writeFileSync(filePath(file, "thumb"), thumb);
  return db()
    .insert(schema.tripPhotos)
    .values({ placeId, file, width: full.info.width, height: full.info.height, addedBy })
    .returning({ id: schema.tripPhotos.id })
    .get().id;
}

/** The JPEG for one of this household's photos, or null. */
export function readTripPhoto(accountId: number, photoId: number, size: "full" | "thumb") {
  const row = db()
    .select({ file: schema.tripPhotos.file })
    .from(schema.tripPhotos)
    .innerJoin(schema.places, eq(schema.places.id, schema.tripPhotos.placeId))
    .where(and(eq(schema.tripPhotos.id, photoId), eq(schema.places.accountId, accountId)))
    .get();
  if (!row) return null;
  try {
    return fs.readFileSync(filePath(row.file, size));
  } catch {
    return null;
  }
}

function removeFiles(files: string[]) {
  for (const f of files) {
    for (const size of ["full", "thumb"] as const) fs.rmSync(filePath(f, size), { force: true });
  }
}

export function deleteTripPhoto(accountId: number, photoId: number) {
  const row = db()
    .select({ id: schema.tripPhotos.id, file: schema.tripPhotos.file })
    .from(schema.tripPhotos)
    .innerJoin(schema.places, eq(schema.places.id, schema.tripPhotos.placeId))
    .where(and(eq(schema.tripPhotos.id, photoId), eq(schema.places.accountId, accountId)))
    .get();
  if (!row) return;
  db().delete(schema.tripPhotos).where(eq(schema.tripPhotos.id, row.id)).run();
  removeFiles([row.file]);
}

/** Call before deleting a place: its rows go with it (cascade), this removes the files. */
export function deleteTripPhotoFiles(placeIds: number[]) {
  if (!placeIds.length) return;
  const rows = db()
    .select({ file: schema.tripPhotos.file })
    .from(schema.tripPhotos)
    .where(inArray(schema.tripPhotos.placeId, placeIds))
    .all();
  removeFiles(rows.map((r) => r.file));
}
