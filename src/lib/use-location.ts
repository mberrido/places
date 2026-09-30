"use client";

import { useCallback, useEffect, useState } from "react";

export type LatLng = { lat: number; lng: number };
export type LocationState = "idle" | "asking" | "ok" | "denied" | "unavailable";

const CACHE_KEY = "places:last-location";
const CACHE_MS = 5 * 60 * 1000;

function cached(): LatLng | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, lat, lng } = JSON.parse(raw);
    return Date.now() - at < CACHE_MS ? { lat, lng } : null;
  } catch {
    return null;
  }
}

function locate(): Promise<{ loc: LatLng | null; state: LocationState }> {
  return new Promise((resolve) => {
    const hit = cached();
    if (hit) return resolve({ loc: hit, state: "ok" });
    // Geolocation only exists on HTTPS (or localhost).
    if (!window.isSecureContext || !navigator.geolocation) return resolve({ loc: null, state: "unavailable" });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude };
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...loc, at: Date.now() }));
        } catch {}
        resolve({ loc, state: "ok" });
      },
      (err) => resolve({ loc: null, state: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: CACHE_MS },
    );
  });
}

/**
 * The device's location. Asks for permission only when `request()` is called,
 * or straight away when `auto` is set (e.g. a bookmarked "near me" filter).
 * If permission was granted before, it's fetched silently.
 */
export function useDeviceLocation({ auto = false }: { auto?: boolean } = {}) {
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [state, setState] = useState<LocationState>("idle");

  const apply = useCallback((r: { loc: LatLng | null; state: LocationState }) => {
    if (r.loc) setLoc(r.loc);
    setState(r.state);
  }, []);

  const request = useCallback(() => {
    setState("asking");
    locate().then(apply);
  }, [apply]);

  useEffect(() => {
    if (auto) {
      locate().then(apply);
      return;
    }
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => (p.state === "granted" ? locate().then(apply) : undefined))
      .catch(() => {});
  }, [auto, apply]);

  return { loc, state, request };
}

export function locationMessage(state: LocationState) {
  switch (state) {
    case "asking":
      return "Finding you…";
    case "denied":
      return "Location permission is off for this site";
    case "unavailable":
      return "Location isn't available here (it needs HTTPS)";
    default:
      return null;
  }
}

/** Google Autocomplete session token. randomUUID needs a secure context, so fall back on plain http. */
export function newSessionToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}
