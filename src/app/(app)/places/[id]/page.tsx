import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Icon, type IconName } from "@/components/icons";
import { isOpenAt, placeLocalNow, weekRows } from "@/lib/hours";
import { allTags, daysSince, getCategories, getPlace, isStale, refreshPlace } from "@/lib/places";
import { googleConfigured } from "@/lib/google";
import { requireSession } from "@/lib/auth";
import { resolveWhen, ymd } from "@/lib/when";
import { otherAccounts } from "@/lib/accounts";
import { sharesSentFor } from "@/lib/shares";
import { HotelBooking } from "./hotel-booking";
import { SharePlace } from "./share-place";
import { DangerZone, EditDetails, NotesAndTags, StatusControl } from "./place-controls";

export async function generateMetadata(props: PageProps<"/places/[id]">) {
  const { accountId } = await requireSession();
  const place = getPlace(accountId, Number((await props.params).id));
  return { title: place?.name ?? "Place" };
}

export default async function PlacePage(props: PageProps<"/places/[id]">) {
  const id = Number((await props.params).id);
  const sp = await props.searchParams;
  const { accountId } = await requireSession();
  const place = Number.isInteger(id) ? getPlace(accountId, id) : null;
  if (!place) notFound();

  // Refresh Google data after the response if it's more than 30 days old.
  if (place.googlePlaceId && googleConfigured() && isStale(place.google)) {
    after(() => refreshPlace(place.id));
  }

  const categories = getCategories(accountId);
  const category = categories.find((c) => c.slug === place.category);
  const g = place.google;
  const photos = g?.photos ?? [];
  const hours = weekRows(g?.openingHours ?? null, g?.utcOffsetMinutes ?? null);
  const openNow = isOpenAt(g?.openingHours ?? null, placeLocalNow(g?.utcOffsetMinutes ?? null).minuteOfWeek);

  const query = [place.name, place.address ?? place.city].filter(Boolean).join(", ");
  const googleMaps =
    g?.googleMapsUrl ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${
      place.googlePlaceId ? `&query_place_id=${place.googlePlaceId}` : ""
    }`;
  const appleMaps =
    place.lat != null && place.lng != null
      ? `https://maps.apple.com/?q=${encodeURIComponent(place.name)}&ll=${place.lat},${place.lng}`
      : `https://maps.apple.com/?q=${encodeURIComponent(query)}`;

  const links: { href: string; label: string; icon: IconName }[] = [
    { href: googleMaps, label: "Google Maps", icon: "map" },
    { href: appleMaps, label: "Apple Maps", icon: "pin" },
    ...(g?.website ? [{ href: g.website, label: "Website", icon: "globe" as const }] : []),
    ...(g?.menuUrl ? [{ href: g.menuUrl, label: "Menu", icon: "menu" as const }] : []),
    ...(g?.phone ? [{ href: `tel:${g.phone.replace(/\s/g, "")}`, label: "Call", icon: "phone" as const }] : []),
    ...(place.sourceUrl
      ? [
          place.source === "instagram"
            ? { href: place.sourceUrl, label: "Instagram", icon: "camera" as const }
            : { href: place.sourceUrl, label: "Source", icon: "globe" as const },
        ]
      : []),
  ];

  const refreshedDaysAgo = g ? daysSince(g.lastRefreshedAt) : null;

  // Hotel booking dates: from the browse "when" filter if it passed them on, else the coming weekend.
  const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const weekend = resolveWhen({ kind: "weekend" })!;
  const stay =
    isDate(sp.checkin) && isDate(sp.checkout) && sp.checkout > sp.checkin
      ? { checkin: sp.checkin, checkout: sp.checkout }
      : { checkin: weekend.checkin, checkout: weekend.checkout };

  return (
    <main className="-mx-4">
      <div className="relative mx-4 mt-2 overflow-hidden rounded-[22px] bg-surface-2">
        {photos.length > 0 ? (
          <div className="scrollbar-none flex aspect-[4/3.4] snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain">
            {photos.map((p, i) => (
              <figure key={p.name} className="relative h-full w-full shrink-0 snap-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/photos/${place.id}/${i}?w=960`}
                  alt=""
                  loading={i === 0 ? "eager" : "lazy"}
                  draggable={false}
                  className="size-full select-none object-cover"
                />
                <figcaption className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-2.5 py-1 text-xs text-on-ink">
                  {i + 1} of {photos.length}
                  {p.attributions[0] && (
                    <>
                      {" · "}
                      {p.attributions[0].uri ? (
                        <a href={p.attributions[0].uri} target="_blank" rel="noreferrer" className="underline">
                          {p.attributions[0].displayName}
                        </a>
                      ) : (
                        p.attributions[0].displayName
                      )}
                    </>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="grid h-52 place-items-center text-6xl" aria-hidden>
            {category?.emoji ?? "📍"}
          </div>
        )}
        <Link
          href="/"
          aria-label="Back"
          className="absolute left-3 top-3 grid size-11 place-items-center rounded-full bg-bg text-text"
        >
          <Icon name="back" className="size-[19px]" />
        </Link>
      </div>

      <div className="flex flex-col gap-5 px-4 pt-4">
        <section className="flex flex-col gap-1.5 px-2">
          <span className="eyebrow">
            {[category?.label, place.city].filter(Boolean).join(" · ")}
            {openNow != null && <span className="text-muted"> · {openNow ? "open now" : "closed now"}</span>}
          </span>
          <h1 className="font-display text-[52px] leading-[0.95]">{place.name}</h1>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
            {g?.rating != null && (
              <span>
                ★ {g.rating.toFixed(1)} on Google
                {g.userRatingCount != null && ` · ${g.userRatingCount.toLocaleString("en-GB")} reviews`}
              </span>
            )}
            {g?.priceLevel ? <span>· {"£".repeat(g.priceLevel)}</span> : null}
          </div>
        </section>

        <StatusControl
          id={place.id}
          status={place.status}
          ourRating={place.ourRating}
          visitedAt={place.visitedAt}
        />

        <section className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target={l.href.startsWith("tel:") ? undefined : "_blank"}
              rel="noreferrer"
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm active:bg-surface-2"
            >
              <Icon name={l.icon} className="size-4 text-accent" />
              {l.label}
            </a>
          ))}
        </section>

        {place.category === "hotel" && (
          <HotelBooking
            query={[place.name, place.city].filter(Boolean).join(", ")}
            website={g?.website ?? null}
            checkin={stay.checkin}
            checkout={stay.checkout}
            today={ymd(new Date())}
          />
        )}

        {place.address && (
          <section className="text-sm">
            <h2 className="mb-1 font-display text-[22px] italic">Address</h2>
            <p className="text-muted">{place.address}</p>
          </section>
        )}

        {hours.length > 0 ? (
          <section className="text-sm">
            <h2 className="mb-1.5 font-display text-[22px] italic">Opening hours</h2>
            <dl className="overflow-hidden rounded-2xl bg-surface">
              {hours.map((h) => (
                <div
                  key={h.day}
                  className={`flex justify-between gap-4 px-3 py-1.5 ${h.isToday ? "bg-accent-soft font-semibold" : ""}`}
                >
                  <dt>{h.day}</dt>
                  <dd className="text-right">{h.times}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : (
          // Google doesn't publish regular hours for hotels, so don't flag them.
          g && place.category !== "hotel" && <p className="text-sm text-muted">Opening hours unknown.</p>
        )}

        <SharePlace
          placeId={place.id}
          households={otherAccounts(accountId)}
          sent={sharesSentFor(accountId, place.id)}
        />

        <NotesAndTags id={place.id} notes={place.notes} tags={place.tags} suggestions={allTags(accountId)} />

        {place.sourceCaption && (
          <section className="text-sm">
            <h2 className="mb-1 font-display text-[22px] italic">Original caption</h2>
            <p className="whitespace-pre-line text-muted">{place.sourceCaption}</p>
          </section>
        )}

        <EditDetails id={place.id} name={place.name} category={place.category} categories={categories} />

        <footer className="flex flex-col gap-1 border-t border-border pt-4 text-xs text-muted">
          <p>
            Added{place.addedBy ? ` by ${place.addedBy}` : ""} on{" "}
            {place.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </p>
          {g && (
            <p>
              Google data from {refreshedDaysAgo === 0 ? "today" : `${refreshedDaysAgo} days ago`}
              {g.lastError && " · last refresh failed, showing older data"}
            </p>
          )}
          <DangerZone id={place.id} canRefresh={!!place.googlePlaceId && googleConfigured()} />
        </footer>
      </div>
    </main>
  );
}
