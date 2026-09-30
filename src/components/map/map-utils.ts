import type { LatLng } from "@/lib/use-location";

// OpenFreeMap: free vector tiles, no API key. Positron keeps coloured pins readable.
export function mapStyleUrl() {
  const dark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`;
}

export const UK_VIEW = { center: [-2.5, 54] as [number, number], zoom: 4.6 };

type MapLibre = typeof import("maplibre-gl");
let lib: Promise<MapLibre> | null = null;
/** MapLibre is large, so it's only loaded when a map is shown. */
export function loadMapLibre(): Promise<MapLibre> {
  // The UMD build arrives as `default` under some bundlers.
  lib ??= import("maplibre-gl").then((m) => {
    const maplibregl = "default" in m ? (m as { default: MapLibre }).default : m;
    // Copied into public/ by scripts/copy-maplibre-worker.mjs.
    maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
    return maplibregl;
  });
  return lib;
}

/** A circle of `km` around a point, as a GeoJSON polygon (for the distance filter). */
export function circlePolygon(center: LatLng, km: number, steps = 72) {
  const coords: [number, number][] = [];
  const latR = (center.lat * Math.PI) / 180;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const dLat = (km / 111.32) * Math.sin(a);
    const dLng = (km / (111.32 * Math.cos(latR))) * Math.cos(a);
    coords.push([center.lng + dLng, center.lat + dLat]);
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [coords] },
  };
}
