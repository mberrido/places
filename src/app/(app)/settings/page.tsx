import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatCode, getAccount, groupMembers } from "@/lib/accounts";
import { requireSession } from "@/lib/auth";
import { claudeConfigured } from "@/lib/extract";
import { FREE_MONTHLY, googleConfigured, type GoogleApi } from "@/lib/google";
import { publicOrigin } from "@/lib/google-auth";
import { getCategories } from "@/lib/places";
import { logout } from "../../login/actions";
import { headers } from "next/headers";
import { BACKUP_DIR, listBackups, nightlyStatus } from "@/lib/nightly";
import { GroupPanel } from "./group-panel";
import { BackupButton } from "./backup-button";
import { CategoryEditor } from "./category-editor";
import { ShareSetup } from "./share-setup";

export const metadata = { title: "Settings" };

const APIS: { api: GoogleApi; label: string }[] = [
  { api: "details", label: "Place Details (full, on save)" },
  { api: "details_basic", label: "Place Details (preview)" },
  { api: "details_location", label: "Place Details (location only)" },
  { api: "photo", label: "Place Photos" },
  { api: "autocomplete", label: "Autocomplete" },
  { api: "text_search", label: "Text Search" },
  { api: "nearby_search", label: "Nearby Search" },
];

export default async function SettingsPage() {
  const session = await requireSession();
  const me = getAccount(session.accountId)!;
  const h = await headers();
  // The address the app was reached on (behind DSM's proxy, its public HTTPS name).
  // APP_URL (the public HTTPS address) when set, so the Shortcut works away from home too.
  const origin = publicOrigin(h);
  // api_usage also holds the daily Claude counters (day keys); only monthly Google rows here.
  const usage = db()
    .select()
    .from(schema.apiUsage)
    .orderBy(desc(schema.apiUsage.month))
    .all()
    .filter((u) => /^\d{4}-\d{2}$/.test(u.month));
  const thisMonth = new Date().toISOString().slice(0, 7);
  const months = [...new Set([thisMonth, ...usage.map((u) => u.month)])].slice(0, 3);
  const count = (month: string, api: string) => usage.find((u) => u.month === month && u.api === api)?.count ?? 0;

  return (
    <main className="flex flex-col gap-6">
      <header className="pb-1 pt-6">
        <h1 className="font-display text-[44px] leading-none">Settings</h1>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">You</h2>
        <div className="flex items-center gap-3 rounded-3xl bg-surface p-4">
          {session.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.picture} alt="" referrerPolicy="no-referrer" className="size-11 rounded-full object-cover" />
          ) : null}
          <span className="min-w-0 flex-1">
            <strong className="block truncate">{session.fullName}</strong>
            <span className="block truncate text-sm text-muted">{session.email}</span>
          </span>
          <form action={logout}>
            <button className="rounded-full border border-border px-4 py-2 text-sm font-medium">Sign out</button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Your group</h2>
        <GroupPanel
          name={me.name}
          code={formatCode(me.joinCode)}
          members={groupMembers(session.accountId)}
          myId={session.userId}
        />
      </section>

      {session.isAdmin && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Google API usage (all households)
          </h2>
          {!googleConfigured() && (
            <p className="mb-2 rounded-full bg-accent-soft p-3 text-sm">
              <code>GOOGLE_PLACES_API_KEY</code> isn&apos;t set, so Google search and enrichment are off.
            </p>
          )}
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-3 py-2 font-medium">API</th>
                  {months.map((m) => (
                    <th key={m} className="px-3 py-2 text-right font-medium">
                      {new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {APIS.map(({ api, label }) => {
                  const free = FREE_MONTHLY[api];
                  const n = count(thisMonth, api);
                  const pct = Math.min(100, (n / free) * 100);
                  return (
                    <tr key={api} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        {label}
                        <div className="mt-1 h-1 w-full max-w-28 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={`h-full ${pct >= 80 ? "bg-danger" : "bg-accent"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      {months.map((m) => (
                        <td key={m} className="px-3 py-2 text-right align-top">
                          {count(m, api).toLocaleString("en-GB")}
                          {m === thisMonth && <span className="text-muted"> / {free.toLocaleString("en-GB")}</span>}
                        {m === thisMonth && count(m, api) >= free && (
                          <span className="block text-xs font-semibold text-danger">Paused</span>
                        )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            Calls this app has made, against the approximate free monthly allowance for each SKU. When one reaches its
            allowance the app stops using it until the 1st (set <code>GOOGLE_ALLOW_OVER_FREE=1</code> to lift this).
            Photos of saved places are cached on the server for 30 days, so each costs at most one call a month; suggestions only load a photo for the top match.
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Instagram</h2>
        <p className="rounded-2xl border border-border bg-surface p-3 text-sm">
          {claudeConfigured() ? (
            <>Claude is set up to read Instagram posts.</>
          ) : (
            <>
              <code>ANTHROPIC_API_KEY</code> isn&apos;t set, so posts can&apos;t be read yet. Links still go to the
              inbox.
            </>
          )}
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Share to Places</h2>
        <ShareSetup origin={origin} />
      </section>

      {session.isAdmin && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Backups</h2>
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3 text-sm">
            <p className="text-muted">
              A copy of the database is saved every night after 03:00 to <code className="break-all">{BACKUP_DIR}</code>{" "}
              (last 14 kept). Google data is refreshed when you open a place and it&apos;s over 30 days old.
            </p>
            {(() => {
              const backups = listBackups();
              return backups.length ? (
                <ul className="tabular-nums">
                  {backups.slice(0, 3).map((b) => (
                    <li key={b.name} className="flex justify-between">
                      <span>{b.name}</span>
                      <span className="text-muted">{(b.size / 1024).toFixed(0)} KB</span>
                    </li>
                  ))}
                  {backups.length > 3 && <li className="text-muted">+ {backups.length - 3} older</li>}
                </ul>
              ) : (
                <p>No backups yet.</p>
              );
            })()}
            {nightlyStatus.lastRun && (
              <p className="text-xs text-muted">
                Last nightly run {nightlyStatus.lastRun.toLocaleString("en-GB")}
                {nightlyStatus.lastError ? `. Problem: ${nightlyStatus.lastError}` : ""}
              </p>
            )}
            <BackupButton />
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Categories</h2>
        <CategoryEditor categories={getCategories(session.accountId)} />
      </section>
    </main>
  );
}
