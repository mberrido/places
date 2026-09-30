"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { Icon } from "@/components/icons";
import { locationMessage, useDeviceLocation, type LatLng } from "@/lib/use-location";
import { loadMapLibre, mapStyleUrl, UK_VIEW } from "./map-utils";

/**
 * Full-screen "drop a pin": pan the map under a fixed crosshair, then confirm.
 * Easier one-handed than trying to tap an exact spot.
 */
export default function PinPicker({
  initial,
  onPick,
  onClose,
}: {
  initial: LatLng | null;
  onPick: (p: LatLng) => void;
  onClose: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [center, setCenter] = useState<LatLng | null>(initial);
  const [zoom, setZoom] = useState(initial ? 16 : UK_VIEW.zoom);
  const { loc, state, request } = useDeviceLocation();
  const centredOnMe = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadMapLibre().then((maplibregl) => {
      if (cancelled || !container.current) return;
      const m = new maplibregl.Map({
        container: container.current,
        style: mapStyleUrl(),
        center: initial ? [initial.lng, initial.lat] : UK_VIEW.center,
        zoom: initial ? 16 : UK_VIEW.zoom,
        attributionControl: { compact: true },
        dragRotate: false,
      });
      m.touchZoomRotate.disableRotation();
      const update = () => {
        const c = m.getCenter();
        setCenter({ lat: c.lat, lng: c.lng });
        setZoom(m.getZoom());
      };
      m.on("move", update);
      m.once("load", update);
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
    };
  }, [initial]);

  // Jump to the device location the first time it's known (unless editing an existing pin).
  useEffect(() => {
    if (loc && !initial && !centredOnMe.current && map.current) {
      centredOnMe.current = true;
      map.current.jumpTo({ center: [loc.lng, loc.lat], zoom: 16 });
    }
  }, [loc, initial]);

  const zoomedIn = zoom >= 13;
  const message = locationMessage(state);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <header
        className="flex items-center gap-2 border-b border-border bg-surface px-3 pb-2"
        style={{ paddingTop: "max(env(safe-area-inset-top), 10px)" }}
      >
        <button onClick={onClose} aria-label="Cancel" className="grid size-9 place-items-center rounded-full active:bg-surface-2">
          <Icon name="x" className="size-5" />
        </button>
        <h2 className="flex-1 font-semibold">Drop a pin</h2>
        <button
          onClick={() => {
            if (loc && map.current) map.current.flyTo({ center: [loc.lng, loc.lat], zoom: 16 });
            else request();
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium"
        >
          <Icon name="locate" className="size-4" /> Me
        </button>
      </header>
      <div className="relative flex-1">
        {/* MapLibre's CSS forces position: relative on its container, so size it from a wrapper. */}
        <div className="absolute inset-0">
          <div ref={container} className="size-full" />
        </div>
        {/* Crosshair pin: its tip marks the map centre. */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-accent drop-shadow-md">
          <svg viewBox="0 0 24 24" className="size-10" aria-hidden>
            <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" fill="currentColor" stroke="#fff" strokeWidth="1.5" />
            <circle cx="12" cy="10" r="2.6" fill="#fff" />
          </svg>
        </div>
        {message && (
          <p className="absolute inset-x-3 top-3 rounded-xl bg-surface/95 p-2.5 text-center text-sm shadow">{message}</p>
        )}
      </div>
      <footer
        className="border-t border-border bg-surface px-4 pt-3"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      >
        <p className="mb-2 text-center text-xs text-muted tabular-nums">
          {center ? `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}` : "…"}
          {!zoomedIn && " · zoom in to place it precisely"}
        </p>
        <button
          disabled={!center}
          onClick={() => center && onPick(center)}
          className="w-full rounded-xl bg-accent py-3 font-semibold text-on-accent disabled:opacity-60"
        >
          Use this spot
        </button>
      </footer>
    </div>
  );
}
