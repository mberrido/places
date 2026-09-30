"use client";

import { useState, useTransition } from "react";
import { backupNowAction } from "./backup-actions";

export function BackupButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              setError(null);
              await backupNowAction();
            } catch (e) {
              setError((e as Error).message);
            }
          })
        }
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "Backing up…" : "Back up now"}
      </button>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
