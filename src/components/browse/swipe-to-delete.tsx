"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { removePlace } from "@/app/(app)/actions";
import { Icon } from "../icons";

const OPEN = 76; // how far the row slides to show the delete button

/** Swipe a row right to show a delete button; tap it to delete. */
export function SwipeToDelete({ id, name, children }: { id: number; name: string; children: ReactNode }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [gone, setGone] = useState(false);
  const [, start] = useTransition();
  const touch = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  const swiped = useRef(false);

  if (gone) return null;

  return (
    <div className="relative overflow-hidden">
      <button
        aria-label={`Delete ${name}`}
        tabIndex={offset ? 0 : -1}
        onClick={() => {
          setGone(true);
          start(() => removePlace(id));
        }}
        className="absolute inset-y-0 left-0 grid place-items-center"
        style={{ width: OPEN }}
      >
        <span className="grid size-11 place-items-center rounded-full bg-danger text-white">
          <Icon name="x" className="size-5" />
        </span>
      </button>
      <div
        className={`relative bg-bg ${dragging ? "" : "transition-transform duration-200"}`}
        style={{ transform: `translateX(${offset}px)`, touchAction: "pan-y" }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = { x: t.clientX, y: t.clientY, base: offset, horizontal: null };
          swiped.current = false;
        }}
        onTouchMove={(e) => {
          const s = touch.current;
          if (!s) return;
          const t = e.touches[0];
          const dx = t.clientX - s.x;
          const dy = t.clientY - s.y;
          if (s.horizontal === null && Math.abs(dx) + Math.abs(dy) > 8) s.horizontal = Math.abs(dx) > Math.abs(dy);
          if (!s.horizontal) return;
          swiped.current = true;
          setDragging(true);
          setOffset(Math.max(0, Math.min(OPEN + 24, s.base + dx)));
        }}
        onTouchEnd={() => {
          if (!touch.current?.horizontal) return;
          touch.current = null;
          setDragging(false);
          setOffset((o) => (o > OPEN / 2 ? OPEN : 0));
        }}
        onClickCapture={(e) => {
          // A swipe, or a tap while open, shouldn't open the place.
          if (swiped.current || offset) {
            e.preventDefault();
            e.stopPropagation();
            swiped.current = false;
            setOffset(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
