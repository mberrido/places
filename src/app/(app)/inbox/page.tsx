import Link from "next/link";
import { Icon } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { failStuckIngests, inboxItems } from "@/lib/ingest";
import { isProfileUrl } from "@/lib/instagram";
import { pendingShares } from "@/lib/shares";
import { ScreenshotButton } from "@/components/screenshot-button";
import { IngestBox } from "./ingest-box";
import { StatusBadge } from "./status-badge";

export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const { accountId } = await requireSession();
  failStuckIngests();
  const items = inboxItems(accountId);
  const shares = pendingShares(accountId);
  return (
    <main className="flex flex-col gap-4">
      <header className="pb-1 pt-6">
        <h1 className="font-display text-[44px] leading-none">Inbox</h1>
        <p className="mt-1 text-sm text-muted">Instagram posts to turn into places, and places shared with you.</p>
      </header>

      <IngestBox />
      <ScreenshotButton />

      {shares.length > 0 && (
        <ul className="flex flex-col gap-2">
          {shares.map((s) => (
            <li key={`share-${s.id}`}>
              <Link
                href={`/inbox/shared/${s.id}`}
                className="flex items-center gap-3 rounded-2xl border border-accent bg-surface p-3 active:bg-surface-2"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
                  <Icon name="share" className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {s.sharedBy ?? s.fromName} shared this{s.note ? `: "${s.note}"` : ""}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent">
                  Shared
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && shares.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted">Nothing waiting. Paste a link above to get started.</p>
      ) : items.length === 0 ? null : (
        <ul className="flex flex-col gap-2">
          {items.map((i) => {
            const names = i.places?.map((p) => p.name).join(", ");
            return (
              <li key={i.id}>
                <Link
                  href={`/inbox/${i.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 active:bg-surface-2"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                    <Icon name="camera" className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {names ||
                        (i.account
                          ? `@${i.account}`
                          : isProfileUrl(i.url)
                            ? "Instagram profile"
                            : i.url
                              ? "Instagram post"
                              : i.via === "screenshot"
                                ? "Screenshot"
                                : "Pasted caption")}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {i.summary ?? i.caption ?? i.url ?? ""}
                    </span>
                  </span>
                  <StatusBadge ingest={i} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
