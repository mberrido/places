// "When" for the browse filter and hotel booking links. Pure date logic on the
// device's local calendar (no time zones: a day is a YYYY-MM-DD string).

export type When =
  | { kind: "today" }
  | { kind: "weekend" }
  | { kind: "nextweekend" }
  | { kind: "range"; from: string; to: string };

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseYmd(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function startOfToday(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Saturday of the coming weekend (today if it's Saturday; yesterday if it's Sunday). */
function thisSaturday(today: Date) {
  const dow = today.getDay();
  if (dow === 0) return addDays(today, -1);
  return addDays(today, 6 - dow);
}

export type ResolvedWhen = {
  days: Date[]; // the days to be open on (capped at 14)
  weekdays: Set<number>; // 0 = Sunday
  label: string;
  /** Suggested hotel stay for these dates. */
  checkin: string;
  checkout: string;
};

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function resolveWhen(when: When, now = new Date()): ResolvedWhen | null {
  const today = startOfToday(now);
  let from: Date;
  let to: Date;
  let label: string;
  let checkin: Date;
  let checkout: Date;

  switch (when.kind) {
    case "today":
      from = to = today;
      label = "Today";
      checkin = today;
      checkout = addDays(today, 1);
      break;
    case "weekend":
    case "nextweekend": {
      const sat = addDays(thisSaturday(today), when.kind === "nextweekend" ? 7 : 0);
      const sun = addDays(sat, 1);
      // On a Sunday, "this weekend" is what's left of it.
      from = when.kind === "weekend" && today > sat ? today : sat;
      to = sun;
      label = `${when.kind === "weekend" ? "This weekend" : "Next weekend"} (${fmt(from)}${from < to ? `–${fmt(to)}` : ""})`;
      // A weekend break: Friday and Saturday nights, unless Friday has passed.
      const fri = addDays(sat, -1);
      checkin = fri >= today ? fri : from;
      checkout = from < to ? sun : addDays(sun, 1);
      break;
    }
    case "range": {
      const a = parseYmd(when.from);
      const b = parseYmd(when.to) ?? a;
      if (!a || !b) return null;
      [from, to] = a <= b ? [a, b] : [b, a];
      label = from.getTime() === to.getTime() ? fmt(from) : `${fmt(from)}–${fmt(to)}`;
      checkin = from;
      checkout = from.getTime() === to.getTime() ? addDays(to, 1) : to;
      break;
    }
  }

  const days: Date[] = [];
  for (let d = from; d <= to && days.length < 14; d = addDays(d, 1)) days.push(d);
  return { days, weekdays: new Set(days.map((d) => d.getDay())), label, checkin: ymd(checkin), checkout: ymd(checkout) };
}

/** Booking.com search for a hotel on the given dates (2 adults, 1 room). */
export function bookingUrl(query: string, checkin: string, checkout: string) {
  const u = new URL("https://www.booking.com/searchresults.html");
  u.searchParams.set("ss", query);
  u.searchParams.set("checkin", checkin);
  u.searchParams.set("checkout", checkout);
  u.searchParams.set("group_adults", "2");
  u.searchParams.set("no_rooms", "1");
  u.searchParams.set("group_children", "0");
  return u.toString();
}

/**
 * Google Hotels for the hotel. Google encodes dates in an opaque token, so
 * checkin/checkout here are best effort; Booking.com reliably takes the dates.
 */
export function googleHotelsUrl(query: string, checkin: string, checkout: string) {
  const u = new URL("https://www.google.com/travel/search");
  u.searchParams.set("q", query);
  u.searchParams.set("checkin", checkin);
  u.searchParams.set("checkout", checkout);
  u.searchParams.set("adults", "2");
  return u.toString();
}
