"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import {
  confirmIngest,
  dismissIngest,
  getIngest,
  processIngest,
  submitIngest,
  reopenIngest as reopen,
  setIngestCaption,
} from "@/lib/ingest";

export type IngestFormState = { error?: string };

/**
 * One box for both: an Instagram link is fetched; anything else long enough is
 * treated as a pasted caption. Processing happens after the response, and the
 * inbox page shows progress.
 */
export async function startIngest(_prev: IngestFormState, form: FormData): Promise<IngestFormState> {
  const session = await requireSession();
  const result = submitIngest(session.accountId, String(form.get("input") ?? ""), "link", session.name);
  if ("error" in result) return { error: result.error };
  if (!result.existing) after(() => processIngest(result.id));
  revalidatePath("/", "layout");
  redirect(`/inbox/${result.id}`);
}

export async function retryIngest(id: number) {
  const { accountId } = await requireSession();
  const ingest = getIngest(accountId, id);
  if (!ingest) throw new Error("Inbox item not found");
  // Only failed items; retrying anything else would just spend another Claude call.
  if (ingest.status !== "failed") return refresh();
  after(() => processIngest(id));
  refresh();
}

export async function submitCaption(id: number, caption: string) {
  const { accountId } = await requireSession();
  if (caption.trim().length < 5) throw new Error("Paste a bit more of the caption");
  // Only where the inbox offers a caption box: nothing read yet, or nothing found.
  const ingest = getIngest(accountId, id);
  const open = ingest && (ingest.status === "needs_text" || ingest.status === "failed" || (ingest.status === "ready" && !ingest.places?.length));
  if (!open) throw new Error("This post has already been read");
  setIngestCaption(accountId, id, caption);
  after(() => processIngest(id));
  refresh();
}

const Picks = z.array(
  z.object({
    index: z.number().int().min(0),
    googlePlaceId: z.string().min(1).nullable(),
    category: z.string().min(1),
  }),
);

export async function confirmPlaces(id: number, picks: z.input<typeof Picks>) {
  const session = await requireSession();
  const parsed = Picks.parse(picks);
  if (!parsed.length) throw new Error("Tick at least one place");
  const ids = await confirmIngest(session.accountId, id, parsed, session.name);
  revalidatePath("/", "layout"); // the inbox badge lives in the shared layout
  redirect(ids.length === 1 ? `/places/${ids[0]}` : "/?sort=recent");
}

/** Back to the confirm step, e.g. after the places saved from it were deleted. */
export async function reopenIngest(id: number) {
  const { accountId } = await requireSession();
  reopen(accountId, id);
  revalidatePath("/", "layout");
}

export async function dismiss(id: number) {
  const { accountId } = await requireSession();
  dismissIngest(accountId, id);
  revalidatePath("/", "layout"); // the inbox badge lives in the shared layout
  redirect("/inbox");
}
