import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ExtractionUnavailable } from "./extract";

/**
 * A daily cap on Claude calls per group, so a stuck loop or a leaked Shortcut
 * token can't run up a bill. CLAUDE_DAILY_LIMIT overrides the default.
 * Counted in api_usage, keyed by day rather than month.
 */
const DAILY_LIMIT = Number(process.env.CLAUDE_DAILY_LIMIT) || 100;
/** Across all groups, so making new groups can't get around the per-group cap. */
const SERVER_DAILY_LIMIT = Number(process.env.CLAUDE_SERVER_DAILY_LIMIT) || 300;

function used(day: string, api: string) {
  return (
    db()
      .select({ count: schema.apiUsage.count })
      .from(schema.apiUsage)
      .where(and(eq(schema.apiUsage.month, day), eq(schema.apiUsage.api, api)))
      .get()?.count ?? 0
  );
}

function count(day: string, api: string) {
  db()
    .insert(schema.apiUsage)
    .values({ month: day, api, count: 1 })
    .onConflictDoUpdate({
      target: [schema.apiUsage.month, schema.apiUsage.api],
      set: { count: sql`${schema.apiUsage.count} + 1` },
    })
    .run();
}

/** Counts one Claude call for the group, or throws if today's allowance (the group's or the server's) is used up. */
export function spendClaudeCall(accountId: number) {
  const day = new Date().toISOString().slice(0, 10);
  if (used(day, `claude:${accountId}`) >= DAILY_LIMIT) {
    throw new ExtractionUnavailable(`You've used today's ${DAILY_LIMIT} Claude reads; try again tomorrow.`);
  }
  if (used(day, "claude:all") >= SERVER_DAILY_LIMIT) {
    throw new ExtractionUnavailable("Claude reads are paused for today on this server; try again tomorrow.");
  }
  count(day, `claude:${accountId}`);
  count(day, "claude:all");
}
