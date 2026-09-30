import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAccount, listAccounts } from "@/lib/accounts";
import { requireSession } from "@/lib/auth";
import { claudeConfigured } from "@/lib/extract";
import { googleConfigured, type GoogleApi } from "@/lib/google";
import { getCategories } from "@/lib/places";
import { logout } from "../../login/actions";
import { headers } from "next/headers";
import { BACKUP_DIR, listBackups, nightlyStatus } from "@/lib/nightly";
import { AccountsAdmin, MyHousehold } from "./account-panels";
import { BackupButton } from "./backup-button";
import { CategoryEditor } from "./category-editor";
import { ShareSetup } from "./share-setup";

export const metadata = { title: "Settings" };

// Approximate free monthly calls per SKU (Google Maps Platform, 2025 pricing).
// Informational only: check Google Cloud billing for the real numbers.
const APIS: { api: GoogleApi; label: string; free: number }[] = [
  { api: "details", label: "Place Details", free: 1000 },
  { api: "details_location", label: "Place Details (location only)", free: 10000 },
  { api: "photo", label: "Place Photos", free: 1000 },
  { api: "autocomplete", label: "Autocomplete", free: 10000 },
  { api: "text_search", label: "Text Search", free: 1000 },
  { api: "nearby_search", label: "Nearby Search", free: 1000 },
];

export default async function SettingsPage() {
  const session = await requireSession();
  const me = getAccount(session.accountId)!;
  const h = await headers();
  // The address the app was reached on (behind DSM's proxy, its public HTTPS name).
  const origin = `${h.get("x-forwarded-proto")?.split(",")[0] ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const usage = db().select().from(schema.apiUsage).orderBy(desc(schema.apiUsage.month)).all();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const months = [...new Set([thisMonth, ...usage.map((u) => u.month)])].slice(0, 3);
  const count = (month: string, api: string) => usage.find((u) => u.month === month && u.api === api)?.count ?? 0;

  return (
    <main className="flex flex-col gap-6">
      <header className="pb-1 pt-2">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">You</h2>
        <div className="flex items-center justify-between rounded-2xl border border-border bg-surface p-3">
          <span>
            <strong>{session.name}</strong>
            <span className="block text-sm text-muted">{session.accountName}</span>
          </span>
          <form action={logout}>
            <button className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium">Log out</button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Your household</h2>
        <MyHousehold name={me.name} login={me.login} members={me.members} />
      </section>

      {session.isAdmin && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Accounts</h2>
          <AccountsAdmin accounts={listAccounts()} myId={session.accountId} />
          <p className="mt-2 text-xs text-muted">
            Each household has its own list, categories, inbox and Shortcut. You can share places between them. All
            households use this server&apos;s Google and Claude keys.
          </p>
        </section>
      )}

      {session.isAdmin && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Google API usage (all households)
          </h2>
          {!googleConfigured() && (
            <p className="mb-2 rounded-xl bg-accent-soft p-3 text-sm">
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
                {APIS.map(({ api, label, free }) => {
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
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            Calls this app has made, against the approximate free monthly allowance for each SKU. Google Cloud billing
            is the source of truth.
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
              (last 14 kept). Google data older than 30 days is refreshed at the same time.
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
                Last nightly run {nightlyStatus.lastRun.toLocaleString("en-GB")}, refreshed {nightlyStatus.refreshed}{" "}
                places{nightlyStatus.lastError ? `. Problem: ${nightlyStatus.lastError}` : ""}
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
