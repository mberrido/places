"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { Category } from "@/db/schema";
import type { Filtered } from "@/lib/filters";
import type { LatLng } from "@/lib/use-location";
import { circlePolygon, loadMapLibre, mapStyleUrl, UK_VIEW } from "./map-utils";

type Props = {
  places: Filtered[];
  categories: Category[];
  origin: LatLng | null;
  radiusKm: number | null;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  /** Changes whenever the filters change, so the map refits to the results. */
  fitKey: string;
};

export default function PlacesMap({ places, categories, origin, radiusKm, selectedId, onSelect, fitKey }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const originMarker = useRef<Marker | null>(null);
  const ready = useRef<Promise<MapLibreMap> | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    ready.current = (async () => {
      const maplibregl = await loadMapLibre();
      if (cancelled || !container.current) throw new Error("unmounted");
      const m = new maplibregl.Map({
        container: container.current,
        style: mapStyleUrl(),
        center: UK_VIEW.center,
        zoom: UK_VIEW.zoom,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      m.touchZoomRotate.disableRotation();
      map.current = m;
      await new Promise<void>((resolve) => m.once("load", () => resolve()));

      m.addSource("places", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 13,
      });
      m.addSource("radius", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

      m.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": "#2563eb", "fill-opacity": 0.08 } });
      m.addLayer({
        id: "radius-line",
        type: "line",
        source: "radius",
        paint: { "line-color": "#2563eb", "line-width": 1.5, "line-dasharray": [2, 2] },
      });
      m.addLayer({
        id: "clusters",
        type: "circle",
        source: "places",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#c2410c",
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
          "circle-stroke-width": 3,
          "circle-stroke-color": "rgba(255,255,255,0.85)",
        },
      });
      m.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "places",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 13, "text-font": ["Noto Sans Bold"] },
        paint: { "text-color": "#ffffff" },
      });
      m.addLayer({
        id: "points",
        type: "circle",
        source: "places",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 11, 8],
          "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 4, 2.5],
          "circle-stroke-color": "#ffffff",
        },
      });

      m.on("click", "clusters", async (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const src = m.getSource("places") as GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id);
        m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
      });
      m.on("click", "points", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id != null) onSelectRef.current(Number(id));
      });
      m.on("click", (e) => {
        if (!m.queryRenderedFeatures(e.point, { layers: ["points", "clusters"] }).length) onSelectRef.current(null);
      });
      for (const layer of ["points", "clusters"]) {
        m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
      }
      return m;
    })();
    ready.current.catch(() => {});

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Data.
  useEffect(() => {
    const colors = new Map(categories.map((c) => [c.slug, c.color]));
    ready.current
      ?.then((m) => {
        (m.getSource("places") as GeoJSONSource).setData({
          type: "FeatureCollection",
          features: places
            .filter((p) => p.lat != null && p.lng != null)
            .map((p) => ({
              type: "Feature",
              id: p.id,
              geometry: { type: "Point", coordinates: [p.lng!, p.lat!] },
              properties: { id: p.id, color: colors.get(p.category) ?? "#64748b" },
            })),
        });
      })
      .catch(() => {});
  }, [places, categories]);

  // Origin marker and radius circle.
  useEffect(() => {
    ready.current
      ?.then(async (m) => {
        const maplibregl = await loadMapLibre();
        originMarker.current?.remove();
        originMarker.current = null;
        if (origin) {
          const el = document.createElement("div");
          el.className = "size-4 rounded-full border-[3px] border-white bg-blue-600 shadow-[0_0_0_6px_rgba(37,99,235,0.25)]";
          originMarker.current = new maplibregl.Marker({ element: el }).setLngLat([origin.lng, origin.lat]).addTo(m);
        }
        (m.getSource("radius") as GeoJSONSource).setData({
          type: "FeatureCollection",
          features: origin && radiusKm ? [circlePolygon(origin, radiusKm)] : [],
        });
      })
      .catch(() => {});
  }, [origin, radiusKm]);

  // Fit to the results (and the search circle) when filters change.
  useEffect(() => {
    ready.current
      ?.then(async (m) => {
        const maplibregl = await loadMapLibre();
        const bounds = new maplibregl.LngLatBounds();
        for (const p of places) if (p.lat != null && p.lng != null) bounds.extend([p.lng, p.lat]);
        if (origin) {
          bounds.extend([origin.lng, origin.lat]);
          if (radiusKm) {
            for (const [lng, lat] of circlePolygon(origin, radiusKm).geometry.coordinates[0]) bounds.extend([lng, lat]);
          }
        }
        if (bounds.isEmpty()) return;
        // Extra bottom padding keeps pins clear of the attribution and the preview card.
        m.fitBounds(bounds, { padding: { top: 48, left: 40, right: 40, bottom: 96 }, maxZoom: 14, duration: 400 });
      })
      .catch(() => {});
    // Only refit when the filters change, not when data merely re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, origin?.lat, origin?.lng]);

  // Selected pin highlight.
  useEffect(() => {
    ready.current
      ?.then((m) => {
        m.removeFeatureState({ source: "places" });
        if (selectedId != null) m.setFeatureState({ source: "places", id: selectedId }, { selected: true });
      })
      .catch(() => {});
  }, [selectedId, places]);

  return <div ref={container} className="size-full" />;
}
