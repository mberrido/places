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

/** Counts one Claude call for the group, or throws if today's allowance is used up. */
export function spendClaudeCall(accountId: number) {
  const day = new Date().toISOString().slice(0, 10);
  const api = `claude:${accountId}`;
  const d = db();
  const used =
    d
      .select({ count: schema.apiUsage.count })
      .from(schema.apiUsage)
      .where(and(eq(schema.apiUsage.month, day), eq(schema.apiUsage.api, api)))
      .get()?.count ?? 0;
  if (used >= DAILY_LIMIT) {
    throw new ExtractionUnavailable(`You've used today's ${DAILY_LIMIT} Claude reads; try again tomorrow.`);
  }
  d.insert(schema.apiUsage)
    .values({ month: day, api, count: 1 })
    .onConflictDoUpdate({
      target: [schema.apiUsage.month, schema.apiUsage.api],
      set: { count: sql`${schema.apiUsage.count} + 1` },
    })
    .run();
}
