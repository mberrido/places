"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { backupNow } from "@/lib/nightly";

export async function backupNowAction() {
  await requireAdmin();
  await backupNow();
  refresh();
}
