import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { Icon } from "@/components/icons";
import { failStuckIngests, getIngest } from "@/lib/ingest";
import { isProfileUrl } from "@/lib/instagram";
import { requireSession } from "@/lib/auth";
import { getCategories, savedGoogleIds } from "@/lib/places";
import { ScreenshotButton } from "@/components/screenshot-button";
import { StatusBadge } from "../status-badge";
import { AutoRefresh, CaptionForm, ConfirmForm, DismissButton, ReopenButton, RetryButton } from "./ingest-controls";

export const metadata = { title: "Confirm places" };

export default async function IngestPage(props: PageProps<"/inbox/[id]">) {
  const { accountId } = await requireSession();
  const id = Number((await props.params).id);
  failStuckIngests();
  const ingest = Number.isInteger(id) ? getIngest(accountId, id) : null;
  if (!ingest) notFound();

  const categories = getCategories(accountId);
  const candidateIds = (ingest.places ?? []).flatMap((p) => p.candidates.map((c) => c.googlePlaceId));
  const alreadySaved = savedGoogleIds(accountId, candidateIds);
  const saved = ingest.savedPlaceIds?.length
    ? db()
        .select({ id: schema.places.id, name: schema.places.name })
        .from(schema.places)
        .where(and(eq(schema.places.accountId, accountId), inArray(schema.places.id, ingest.savedPlaceIds)))
        .all()
    : [];

  const working = ingest.status === "pending" || ingest.status === "processing";
  const profile = isProfileUrl(ingest.url);

  return (
    <main className="flex flex-col gap-4">
      <header className="flex items-center gap-2 pt-2">
        <Link href="/inbox" aria-label="Back to inbox" className="-ml-2 grid size-9 place-items-center rounded-full active:bg-surface-2">
          <Icon name="back" className="size-6" />
        </Link>
        <h1 className="flex-1 font-display text-[34px] leading-none">From Instagram</h1>
        <StatusBadge ingest={ingest} />
      </header>

      <section className="rounded-2xl border border-border bg-surface p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{ingest.account
              ? `@${ingest.account}`
              : profile
                ? "Instagram profile"
                : ingest.url
                  ? "Instagram post"
                  : ingest.via === "screenshot"
                    ? "Screenshot"
                    : "Pasted caption"}</span>
          {ingest.url && (
            <a href={ingest.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent">
              {profile ? "Open profile" : "Open post"} <Icon name="external" className="size-3.5" />
            </a>
          )}
        </div>
        {ingest.caption && (
          <details className="group mt-1">
            <summary className="cursor-pointer list-none text-muted">
              <span className="line-clamp-3 whitespace-pre-line group-open:line-clamp-none">{ingest.caption}</span>
            </summary>
          </details>
        )}
        {ingest.summary && <p className="mt-2 border-t border-border pt-2 text-muted">🤖 {ingest.summary}</p>}
      </section>

      {working && (
        <section className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="size-8 animate-spin rounded-full border-[3px] border-border border-t-accent" />
          <p className="font-medium">
            {ingest.caption || ingest.via === "screenshot"
              ? "Finding the places…"
              : profile
                ? "Reading the profile…"
                : "Reading the post…"}
          </p>
          <p className="text-sm text-muted">This usually takes 10–20 seconds. You can leave this page.</p>
          <AutoRefresh />
        </section>
      )}

      {ingest.status === "needs_text" && (
        <section className="flex flex-col gap-3">
          <p className="rounded-full bg-accent-soft p-3 text-sm">{ingest.error}</p>
          <ScreenshotButton ingestId={ingest.id} />
          <CaptionForm id={ingest.id} />
        </section>
      )}

      {ingest.status === "failed" && (
        <section className="flex flex-col gap-3">
          <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{ingest.error ?? "Something went wrong."}</p>
          <RetryButton id={ingest.id} />
          <ScreenshotButton ingestId={ingest.id} />
          <p className="text-sm text-muted">Or paste the caption yourself:</p>
          <CaptionForm id={ingest.id} />
        </section>
      )}

      {ingest.status === "ready" &&
        (ingest.places?.length ? (
          <ConfirmForm
            id={ingest.id}
            places={ingest.places}
            categories={categories}
            alreadySaved={alreadySaved}
          />
        ) : (
          <section className="flex flex-col gap-3">
            <p className="rounded-full bg-accent-soft p-3 text-sm">
              Claude couldn&apos;t find a specific named place in this {profile ? "profile" : "post"}. If you know it, search for it directly, or
              paste more of the caption.
            </p>
            <Link href="/add" className="rounded-xl border border-border bg-surface py-2.5 text-center font-medium">
              Search Google instead
            </Link>
            <ScreenshotButton ingestId={ingest.id} />
            <CaptionForm id={ingest.id} />
          </section>
        ))}

      {ingest.status === "done" && (
        <section className="flex flex-col gap-2">
          {saved.length > 0 ? (
            <p className="text-sm text-muted">Saved:</p>
          ) : (
            <p className="rounded-full bg-accent-soft p-3 text-sm">
              {ingest.savedPlaceIds?.length === 1
                ? "The place saved from this has since been deleted."
                : "The places saved from this have since been deleted."}
            </p>
          )}
          {saved.map((p) => (
            <Link key={p.id} href={`/places/${p.id}`} className="rounded-xl border border-border bg-surface p-3 font-medium">
              {p.name}
            </Link>
          ))}
          {ingest.places?.length ? <ReopenButton id={ingest.id} hasSaved={saved.length > 0} /> : null}
        </section>
      )}

      {ingest.status !== "done" && ingest.status !== "dismissed" && <DismissButton id={ingest.id} />}
    </main>
  );
}
