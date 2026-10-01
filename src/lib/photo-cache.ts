import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DATABASE_PATH } from "@/db";
import { fetchPhoto } from "./google";

// Google place photos, cached on disk so each photo costs one Places Photo call
// per 30 days no matter how many times or at how many sizes it's shown. The
// original is fetched once at 1600px; smaller sizes are made from it locally.
// Kept for 30 days (the same as the rest of the Google data), then re-fetched.

const DIR = path.join(/*turbopackIgnore: true*/ path.dirname(DATABASE_PATH), "photo-cache");
const ORIGINAL_WIDTH = 1600;
export const PHOTO_MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // 1 GB, oldest removed first

const file = (name: string) => path.join(/*turbopackIgnore: true*/ DIR, name);

function fresh(p: string) {
  try {
    return Date.now() - fs.statSync(p).mtimeMs < PHOTO_MAX_AGE_MS;
  } catch {
    return false;
  }
}

// One Google fetch per photo even if several requests arrive at once.
const inFlight = new Map<string, Promise<Buffer>>();

async function original(photoName: string, key: string): Promise<Buffer> {
  const p = file(`${key}.jpg`);
  if (fresh(p)) return fs.readFileSync(p);
  let pending = inFlight.get(key);
  if (!pending) {
    pending = (async () => {
      const { bytes } = await fetchPhoto(photoName, ORIGINAL_WIDTH);
      const jpeg = await sharp(bytes).jpeg({ quality: 85 }).toBuffer();
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(p, jpeg);
      return jpeg;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}

/** A Google photo at (at most) `width` px wide, as JPEG. Throws GoogleUnavailable on a miss that fails. */
export async function getPhoto(photoName: string, width: number): Promise<Buffer> {
  const key = crypto.createHash("sha256").update(photoName).digest("hex").slice(0, 32);
  const variant = file(`${key}-w${width}.jpg`);
  if (fresh(variant)) return fs.readFileSync(variant);
  const orig = await original(photoName, key);
  if (width >= ORIGINAL_WIDTH) return orig;
  const small = await sharp(orig).resize({ width, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  fs.writeFileSync(variant, small);
  return small;
}

/** Nightly: drop photos older than 30 days, then the oldest until under 1 GB. */
export function prunePhotoCache() {
  let files: { p: string; size: number; mtime: number }[];
  try {
    files = fs.readdirSync(DIR).map((f) => {
      const p = file(f);
      const st = fs.statSync(p);
      return { p, size: st.size, mtime: st.mtimeMs };
    });
  } catch {
    return { removed: 0 };
  }
  let removed = 0;
  let total = 0;
  const keep: typeof files = [];
  for (const f of files) {
    if (Date.now() - f.mtime > PHOTO_MAX_AGE_MS) {
      fs.rmSync(f.p, { force: true });
      removed++;
    } else {
      keep.push(f);
      total += f.size;
    }
  }
  keep.sort((a, b) => a.mtime - b.mtime);
  for (const f of keep) {
    if (total <= MAX_TOTAL_BYTES) break;
    fs.rmSync(f.p, { force: true });
    total -= f.size;
    removed++;
  }
  return { removed };
}
