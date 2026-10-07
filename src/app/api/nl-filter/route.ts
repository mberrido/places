import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { spendClaudeCall } from "@/lib/claude-usage";
import { ExtractionUnavailable } from "@/lib/extract";
import { parseNaturalFilter } from "@/lib/nl-filter";
import { allTags, getCategories } from "@/lib/places";

// "hotel within 30 miles this weekend" → filter settings for the browse page to apply (visibly).
export async function POST(req: NextRequest) {
  const { accountId } = await requireSession();
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const q = String(text ?? "").trim().slice(0, 300);
  if (q.length < 3) return Response.json({ error: "Type a bit more" }, { status: 400 });
  try {
    spendClaudeCall(accountId);
    const categories = getCategories(accountId).map((c) => ({ slug: c.slug, label: c.label }));
    return Response.json(await parseNaturalFilter(q, categories, allTags(accountId)));
  } catch (e) {
    if (e instanceof ExtractionUnavailable) return Response.json({ error: e.message }, { status: 502 });
    throw e;
  }
}
