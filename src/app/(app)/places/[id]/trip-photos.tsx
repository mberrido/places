"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { shrinkImage } from "@/lib/shrink-image";
import { removeTripPhoto } from "../../actions";

type Photo = { id: number; width: number; height: number };

/** "Our photos": a grid of the household's own photos, an add button and a full-screen viewer. */
export function TripPhotos({ placeId, photos }: { placeId: number; photos: Photo[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null); // index in the viewer

  async function upload(files: File[]) {
    setError(null);
    setProgress({ done: 0, total: files.length });
    let failed = 0;
    for (const [i, file] of files.entries()) {
      try {
        const form = new FormData();
        form.set("photo", await shrinkImage(file, 2048), "photo.jpg");
        const res = await fetch(`/api/places/${placeId}/photos`, { method: "POST", body: form });
        if (!res.ok) {
          failed++;
          setError((await res.json().catch(() => null))?.error ?? "Upload failed");
        }
      } catch {
        failed++;
        setError("Upload failed. Check your connection.");
      }
      setProgress({ done: i + 1, total: files.length });
    }
    if (failed > 1) setError(`${failed} photos didn't upload.`);
    setProgress(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <section className="text-sm">
      <h2 className="mb-1.5 font-display text-[22px] italic">Our photos</h2>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => e.target.files?.length && upload([...e.target.files])}
      />
      <div className="grid grid-cols-3 gap-1.5">
        {photos.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setOpen(i)}
            className="aspect-square overflow-hidden rounded-xl bg-surface-2"
            aria-label={`Photo ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/trip-photos/${p.id}?size=thumb`} alt="" loading="lazy" className="size-full object-cover" />
          </button>
        ))}
        <button
          disabled={!!progress}
          onClick={() => input.current?.click()}
          className={`flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-muted active:bg-surface-2 ${
            photos.length ? "aspect-square" : "col-span-3 py-6"
          }`}
        >
          <Icon name={progress ? "refresh" : "plus"} className={`size-5 ${progress ? "animate-spin" : ""}`} />
          <span className="text-xs font-medium">
            {progress ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : "Add photos"}
          </span>
        </button>
      </div>
      {error && <p className="mt-1.5 text-danger">{error}</p>}
      {open !== null && photos.length > 0 && (
        <Viewer photos={photos} start={Math.min(open, photos.length - 1)} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}

function Viewer({ photos, start, onClose }: { photos: Photo[]; start: number; onClose: () => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  const [pending, run] = useTransition();

  // Open on the tapped photo, and stop the page behind from scrolling.
  useEffect(() => {
    const el = strip.current;
    if (el) el.scrollLeft = start * el.clientWidth;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [start, onClose]);

  const current = photos[Math.min(index, photos.length - 1)];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-label="Photos">
      <div className="flex items-center justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full bg-white/15">
          <Icon name="x" className="size-5" />
        </button>
        <span className="text-sm">
          {Math.min(index, photos.length - 1) + 1} of {photos.length}
        </span>
        <button
          disabled={pending}
          aria-label="Delete photo"
          onClick={() => {
            if (!confirm("Delete this photo?")) return;
            run(async () => {
              await removeTripPhoto(current.id);
              if (photos.length === 1) onClose();
            });
          }}
          className="grid size-10 place-items-center rounded-full bg-white/15 disabled:opacity-50"
        >
          <Icon name="trash" className="size-5" />
        </button>
      </div>
      <div
        ref={strip}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="scrollbar-none flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-contain"
      >
        {photos.map((p) => (
          <div key={p.id} className="flex h-full w-full shrink-0 snap-center items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/trip-photos/${p.id}`}
              alt=""
              width={p.width}
              height={p.height}
              draggable={false}
              className="max-h-full max-w-full select-none object-contain"
            />
          </div>
        ))}
      </div>
      <div className="pb-[env(safe-area-inset-bottom)]" />
    </div>
  );
}
