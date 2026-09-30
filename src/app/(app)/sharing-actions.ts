"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { dismissShare, saveShare, sharePlace } from "@/lib/shares";

const Send = z.object({
  placeId: z.number().int(),
  toAccountIds: z.array(z.number().int()).min(1, "Pick someone to share with"),
  note: z.string().max(1000).nullish(),
});

export async function sendShare(input: z.input<typeof Send>) {
  const session = await requireSession();
  const p = Send.parse(input);
  const result = sharePlace({
    fromAccountId: session.accountId,
    placeId: p.placeId,
    toAccountIds: p.toAccountIds,
    note: p.note ?? null,
    sharedBy: session.name,
  });
  refresh();
  return result;
}

export async function saveSharedPlace(id: number, category: string) {
  const session = await requireSession();
  const placeId = await saveShare(session.accountId, id, category, session.name);
  revalidatePath("/", "layout"); // the inbox badge
  redirect(`/places/${placeId}`);
}

export async function dismissSharedPlace(id: number) {
  const { accountId } = await requireSession();
  dismissShare(accountId, id);
  revalidatePath("/", "layout");
  redirect("/inbox");
}
