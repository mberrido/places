import type { OpeningHours } from "@/db/schema";

const WEEK = 7 * 24 * 60;

/** Current time at the place: minutes since Sunday 00:00 and the weekday (0 = Sunday). */
export function placeLocalNow(utcOffsetMinutes: number | null, now = new Date()) {
  // Without an offset, assume the server's zone (Europe/London on the NAS).
  const offset = utcOffsetMinutes ?? -now.getTimezoneOffset();
  const local = new Date(now.getTime() + offset * 60_000);
  const day = local.getUTCDay();
  return { day, minuteOfWeek: day * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/** Whether the place is open at a given minute of the week. null = hours unknown. */
export function isOpenAt(hours: OpeningHours | null, minuteOfWeek: number): boolean | null {
  if (!hours?.periods?.length) return null;
  for (const p of hours.periods) {
    // A single period with no close means open 24/7.
    if (!p.close) return true;
    const start = p.open.day * 1440 + p.open.hour * 60 + p.open.minute;
    let end = p.close.day * 1440 + p.close.hour * 60 + p.close.minute;
    if (end <= start) end += WEEK; // wraps past Saturday night
    const m = minuteOfWeek < start ? minuteOfWeek + WEEK : minuteOfWeek;
    if (m >= start && m < end) return true;
  }
  return false;
}

/** Google's weekdayDescriptions run Monday→Sunday; returns them with today's row flagged. */
export function weekRows(hours: OpeningHours | null, utcOffsetMinutes: number | null) {
  if (!hours?.weekdayDescriptions?.length) return [];
  const todayIdx = (placeLocalNow(utcOffsetMinutes).day + 6) % 7;
  return hours.weekdayDescriptions.map((line, i) => {
    const [day, ...rest] = line.split(": ");
    return { day, times: rest.join(": ") || "—", isToday: i === todayIdx };
  });
}

/** Weekdays (0 = Sunday) the place opens on at all. null = hours unknown. */
export function openDays(hours: OpeningHours | null | undefined): number[] | null {
  if (!hours?.periods?.length) return null;
  if (hours.periods.some((p) => !p.close)) return [0, 1, 2, 3, 4, 5, 6]; // 24/7
  return [...new Set(hours.periods.map((p) => p.open.day))].sort();
}
