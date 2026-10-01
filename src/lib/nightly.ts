import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DATABASE_PATH, db } from "@/db";
import { googleConfigured } from "./google";
import { failStuckIngests } from "./ingest";
import { prunePhotoCache } from "./photo-cache";
import { refreshPlace, stalePlaceIds } from "./places";

// Nightly housekeeping at ~03:00 (the container runs with TZ=Europe/London):
// a SQLite backup, a refresh of Google data older than 30 days, and clearing
// inbox items that got stuck. Runs in-process; no cron needed in the container.

export const BACKUP_DIR = path.resolve(
  /*turbopackIgnore: true*/ process.env.BACKUP_DIR ?? path.join(path.dirname(DATABASE_PATH), "backups"),
);
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);
const RUN_HOUR = 3;
const MAX_REFRESHES = 100; // per night, to bound Google spend

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type BackupFile = { name: string; size: number; at: Date };

export function listBackups(): BackupFile[] {
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => /^places-\d{4}-\d{2}-\d{2}\.db$/.test(f))
      .map((name) => {
        const st = fs.statSync(path.join(/*turbopackIgnore: true*/ BACKUP_DIR, name));
        return { name, size: st.size, at: st.mtime };
      })
      .sort((a, b) => b.name.localeCompare(a.name));
  } catch {
    return [];
  }
}

/** A consistent snapshot via SQLite's online backup API (safe while the app is writing). */
export async function backupNow() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = path.join(/*turbopackIgnore: true*/ BACKUP_DIR, `places-${today()}.db`);
  const tmp = `${dest}.partial`;
  await db().$client.backup(tmp);
  fs.renameSync(tmp, dest);
  for (const old of listBackups().slice(KEEP)) {
    fs.rmSync(path.join(/*turbopackIgnore: true*/ BACKUP_DIR, old.name), { force: true });
  }
  return dest;
}

export const nightlyStatus: { lastRun: Date | null; lastError: string | null; refreshed: number } = {
  lastRun: null,
  lastError: null,
  refreshed: 0,
};

export async function runNightly() {
  const errors: string[] = [];
  try {
    const dest = await backupNow();
    console.log(`nightly: backup written to ${dest}`);
  } catch (e) {
    errors.push(`backup: ${(e as Error).message}`);
  }
  try {
    failStuckIngests();
  } catch (e) {
    errors.push(`inbox: ${(e as Error).message}`);
  }
  try {
    prunePhotoCache();
  } catch (e) {
    errors.push(`photo cache: ${(e as Error).message}`);
  }
  let refreshed = 0;
  if (googleConfigured()) {
    for (const id of stalePlaceIds().slice(0, MAX_REFRESHES)) {
      await refreshPlace(id); // never throws; failures are recorded on the place
      refreshed++;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (refreshed) console.log(`nightly: refreshed Google data for ${refreshed} places`);
  }
  Object.assign(nightlyStatus, { lastRun: new Date(), lastError: errors.join("; ") || null, refreshed });
  if (errors.length) console.error("nightly:", errors.join("; "));
}

let running = false;
async function tick() {
  if (running) return;
  const now = new Date();
  // Due once it's past 03:00 and today's backup doesn't exist yet. This also
  // catches up after the NAS was off overnight.
  if (now.getHours() < RUN_HOUR) return;
  if (listBackups().some((b) => b.name === `places-${today()}.db`)) return;
  running = true;
  try {
    await runNightly();
  } finally {
    running = false;
  }
}

export function startNightly() {
  const g = globalThis as unknown as { __placesNightly?: NodeJS.Timeout };
  if (g.__placesNightly) return; // one timer, even across dev reloads
  g.__placesNightly = setInterval(() => void tick(), 10 * 60 * 1000);
  g.__placesNightly.unref();
  setTimeout(() => void tick(), 30_000).unref(); // shortly after start-up
}
