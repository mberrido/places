"use client";

import { useState } from "react";
import type { PhotoRef } from "@/db/schema";

/**
 * The place's Google photos. Each photo is a paid Google call (then cached), so
 * a photo only loads once you've swiped to the one before it.
 */
export function PlaceGallery({ placeId, photos }: { placeId: number; photos: PhotoRef[] }) {
  const [seen, setSeen] = useState(0); // furthest photo reached

  return (
    <div
      onScroll={(e) => {
        const i = Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth);
        if (i > seen) setSeen(i);
      }}
      className="scrollbar-none flex aspect-[4/3.4] snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
    >
      {photos.map((p, i) => (
        <figure key={p.name} className="relative h-full w-full shrink-0 snap-center">
          {i <= seen + 1 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/photos/${placeId}/${i}?w=960`}
              alt=""
              draggable={false}
              className="size-full select-none object-cover"
            />
          )}
          <figcaption className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-2.5 py-1 text-xs text-on-ink">
            {i + 1} of {photos.length}
            {p.attributions[0] && (
              <>
                {" · "}
                {p.attributions[0].uri ? (
                  <a href={p.attributions[0].uri} target="_blank" rel="noreferrer" className="underline">
                    {p.attributions[0].displayName}
                  </a>
                ) : (
                  p.attributions[0].displayName
                )}
              </>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
