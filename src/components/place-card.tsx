import Link from "next/link";
import type { Category } from "@/db/schema";
import { formatKm, type Filtered } from "@/lib/filters";
import { Icon } from "./icons";
import { CategoryChip, GoogleRating, OurRating, PriceLevel } from "./place-bits";

export function PlaceCard({
  place,
  category,
  stay,
  className = "",
}: {
  place: Filtered;
  category: Category | undefined;
  /** Dates from the "when" filter, passed on to a hotel's booking links. */
  stay?: { checkin: string; checkout: string } | null;
  className?: string;
}) {
  const href =
    stay && place.category === "hotel"
      ? `/places/${place.id}?checkin=${stay.checkin}&checkout=${stay.checkout}`
      : `/places/${place.id}`;
  return (
    <Link
      href={href}
      className={`flex gap-3 rounded-2xl border border-border bg-surface p-2.5 active:bg-surface-2 ${className}`}
    >
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface-2">
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
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-baseline gap-2">
          <h2 className="min-w-0 flex-1 truncate font-semibold leading-tight">{place.name}</h2>
          {place.distanceKm != null && (
            <span className="shrink-0 text-xs font-medium text-muted tabular-nums">{formatKm(place.distanceKm)}</span>
          )}
        </div>
        <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted">
          <Icon name="pin" className="size-3.5 shrink-0" />
          <span className="truncate">{[place.city, place.country].filter(Boolean).join(", ") || "No location"}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <CategoryChip category={category} />
          <GoogleRating rating={place.rating} />
          <PriceLevel level={place.priceLevel} />
          {place.status === "been" && <OurRating value={place.ourRating} />}
          {place.hours && "unknown" in place.hours && (
            <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted">
              Hours unknown
            </span>
          )}
          {place.hours && "openOn" in place.hours && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium">
              {place.hours.openOn.join(" & ")} only
            </span>
          )}
          {place.hours && "closedOn" in place.hours && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium">
              Closed {place.hours.closedOn.join(" & ")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
