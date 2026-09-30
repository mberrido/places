"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { shrinkImage } from "@/lib/shrink-image";
import { Icon } from "./icons";

/** Upload a screenshot of a post: starts a new inbox item, or adds to `ingestId`. */
export function ScreenshotButton({ ingestId, className = "" }: { ingestId?: number; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("image", await shrinkImage(file), "screenshot.jpg");
      if (ingestId) form.set("ingestId", String(ingestId));
      const res = await fetch("/api/screenshots", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      if (ingestId) router.refresh();
      else router.push(`/inbox/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={className}>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 text-sm font-medium disabled:opacity-60"
      >
        <Icon name="camera" className="size-4" />
        {busy ? "Uploading…" : ingestId ? "Add a screenshot instead" : "Upload a screenshot"}
      </button>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
