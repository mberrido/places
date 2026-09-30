import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { GoogleRating } from "@/components/place-bits";
import { requireSession } from "@/lib/auth";
import { findByGoogleId, getCategories } from "@/lib/places";
import { getShare, suggestedCategory } from "@/lib/shares";
import { ShareDecision } from "./share-decision";

export const metadata = { title: "Shared with you" };

export default async function SharedPlacePage(props: PageProps<"/inbox/shared/[id]">) {
  const { accountId } = await requireSession();
  const id = Number((await props.params).id);
  const share = Number.isInteger(id) ? getShare(accountId, id) : null;
  if (!share) notFound();
  const existing = share.googlePlaceId ? findByGoogleId(accountId, share.googlePlaceId) : null;

  return (
    <main className="flex flex-col gap-4">
      <header className="flex items-center gap-2 pt-2">
        <Link href="/inbox" aria-label="Back to inbox" className="-ml-2 grid size-9 place-items-center rounded-full active:bg-surface-2">
          <Icon name="back" className="size-6" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Shared with you</h1>
      </header>

      <p className="text-sm text-muted">
        <strong className="text-text">{share.sharedBy ?? share.fromName}</strong> ({share.fromName}) shared this on{" "}
        {share.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.
      </p>

      {share.note && (
        <blockquote className="rounded-2xl bg-accent-soft p-3 text-sm">&ldquo;{share.note}&rdquo;</blockquote>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        {share.photoName && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/google/photo?name=${encodeURIComponent(share.photoName)}`}
            alt=""
            className="h-48 w-full object-cover"
          />
        )}
        <div className="p-3">
          <p className="text-lg font-semibold">{share.name}</p>
          <p className="text-sm text-muted">{share.address ?? [share.city, share.country].filter(Boolean).join(", ")}</p>
          <div className="mt-1">
            <GoogleRating rating={share.rating} />
          </div>
          {share.sourceUrl && (
            <a href={share.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-accent">
              <Icon name="camera" className="size-4" /> Original post
            </a>
          )}
        </div>
      </section>

      {share.status !== "pending" ? (
        <p className="text-sm text-muted">
          {share.status === "saved" ? "You saved this." : "You dismissed this."}{" "}
          {share.savedPlaceId && (
            <Link href={`/places/${share.savedPlaceId}`} className="text-accent">
              Open it
            </Link>
          )}
        </p>
      ) : (
        <ShareDecision
          id={share.id}
          existingId={existing?.id ?? null}
          categories={getCategories(accountId)}
          defaultCategory={suggestedCategory(accountId, share)}
        />
      )}
    </main>
  );
}
