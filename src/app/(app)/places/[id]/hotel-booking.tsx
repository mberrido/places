"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { addDays, bookingUrl, googleHotelsUrl, parseYmd, ymd } from "@/lib/when";

/** Dates → deep links to Booking.com and Google Hotels. Live availability is out of scope. */
export function HotelBooking({
  query,
  website,
  checkin: initialIn,
  checkout: initialOut,
  today,
}: {
  query: string;
  website: string | null;
  checkin: string;
  checkout: string;
  today: string;
}) {
  const [checkin, setCheckin] = useState(initialIn);
  const [checkout, setCheckout] = useState(initialOut);
  const nights = Math.round(((parseYmd(checkout)?.getTime() ?? 0) - (parseYmd(checkin)?.getTime() ?? 0)) / 86_400_000);

  return (
    <section className="rounded-3xl bg-ink p-4 text-sm text-on-ink">
      <h2 className="mb-2 font-display text-[22px]">Check prices</h2>
      <div className="grid grid-cols-2 gap-2">
        <label className="min-w-0 text-xs text-on-ink-muted">
          Check in
          <input
            type="date"
            value={checkin}
            min={today}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              setCheckin(v);
              if (checkout <= v) setCheckout(ymd(addDays(parseYmd(v)!, 1)));
            }}
            className="mt-1 block w-full min-w-0 appearance-none rounded-xl border border-on-ink-muted/40 bg-transparent px-2 py-2 text-left text-on-ink [color-scheme:dark]"
          />
        </label>
        <label className="min-w-0 text-xs text-on-ink-muted">
          Check out
          <input
            type="date"
            value={checkout}
            min={ymd(addDays(parseYmd(checkin) ?? new Date(), 1))}
            onChange={(e) => e.target.value && setCheckout(e.target.value)}
            className="mt-1 block w-full min-w-0 appearance-none rounded-xl border border-on-ink-muted/40 bg-transparent px-2 py-2 text-left text-on-ink [color-scheme:dark]"
          />
        </label>
      </div>
      <p className="mt-1.5 text-xs text-on-ink-muted">
        {nights > 0 ? `${nights} night${nights > 1 ? "s" : ""}, 2 adults` : "Pick a check-out after check-in"}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <a
          href={bookingUrl(query, checkin, checkout)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-accent py-3 font-semibold text-on-accent"
        >
          Booking.com <Icon name="external" className="size-3.5" />
        </a>
        <a
          href={googleHotelsUrl(query, checkin, checkout)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-on-ink-muted/40 py-3 font-semibold"
        >
          Google Hotels <Icon name="external" className="size-3.5" />
        </a>
      </div>
      {website && (
        <a
          href={website}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex items-center justify-center gap-1.5 rounded-full border border-on-ink-muted/40 py-3 font-semibold"
        >
          Book direct on their website <Icon name="external" className="size-3.5" />
        </a>
      )}
      <p className="mt-2 text-xs text-on-ink-muted">
        Not every hotel is on Booking.com (some, like The Pig, only take direct bookings); if it isn&apos;t, Booking.com
        opens its home page. Google Hotels may ask for the dates again.
      </p>
    </section>
  );
}
