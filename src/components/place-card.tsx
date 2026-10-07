import Link from "next/link";
import type { Category } from "@/db/schema";
import { formatDistance, type Filtered } from "@/lib/filters";
import { OurRating } from "./place-bits";

/** A place in the list: rounded photo, serif name, place and a short accent line. */
export function PlaceCard({
  place,
  category,
  stay,
  framed = false,
  className = "",
}: {
  place: Filtered;
  category: Category | undefined;
  /** Dates from the "when" filter, passed on to a hotel's booking links. */
  stay?: { checkin: string; checkout: string } | null;
  /** On a card background (e.g. floating over the map) rather than straight on the page. */
  framed?: boolean;
  className?: string;
}) {
  const href =
    stay && place.category === "hotel"
      ? `/places/${place.id}?checkin=${stay.checkin}&checkout=${stay.checkout}`
      : `/places/${place.id}`;
  const facts = [
    place.rating != null ? `★ ${place.rating.toFixed(1)}` : null,
    place.priceLevel ? "£".repeat(place.priceLevel) : null,
    place.distanceKm != null ? `${formatDistance(place.distanceKm)} away` : null,
  ].filter(Boolean);
  return (
    <Link
      href={href}
      className={`flex items-center gap-3.5 py-2.5 active:opacity-70 ${
        framed ? "rounded-2xl bg-surface px-2.5" : ""
      } ${className}`}
    >
      <div className="relative size-[84px] shrink-0 overflow-hidden rounded-2xl bg-surface-2">
        {place.hasPhoto ? (
          // Plain <img>: the photo proxy already sizes and caches images.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/photos/${place.id}/0?w=240`} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-3xl" aria-hidden>
            {category?.emoji ?? "📍"}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="truncate font-display text-2xl leading-[1.05]">{place.name}</h2>
        <p className="truncate text-sm text-muted">
          {[place.city, place.country].filter(Boolean).join(", ") || category?.label || "No location"}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {facts.length > 0 && <span className="font-medium text-accent">{facts.join(" · ")}</span>}
          {place.status === "been" && <OurRating value={place.ourRating} />}
          {place.hours && "unknown" in place.hours && <span className="text-xs text-muted">· hours unknown</span>}
          {place.hours && "openOn" in place.hours && (
            <span className="text-xs text-muted">· {place.hours.openOn.join(" & ")} only</span>
          )}
          {place.hours && "closedOn" in place.hours && (
            <span className="text-xs text-muted">· closed {place.hours.closedOn.join(" & ")}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
