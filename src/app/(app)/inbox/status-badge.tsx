import type { Ingest } from "@/db/schema";

const LABELS: Record<Ingest["status"], [string, string]> = {
  pending: ["Queued", "bg-surface-2 text-muted"],
  processing: ["Reading…", "bg-surface-2 text-muted"],
  ready: ["Confirm", "bg-accent text-on-accent"],
  needs_text: ["Needs caption", "bg-accent-soft text-accent"],
  failed: ["Failed", "bg-danger/15 text-danger"],
  done: ["Saved", "bg-surface-2 text-muted"],
  dismissed: ["Dismissed", "bg-surface-2 text-muted"],
};

export function StatusBadge({ ingest }: { ingest: Ingest }) {
  const [label, cls] = LABELS[ingest.status];
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>;
}
