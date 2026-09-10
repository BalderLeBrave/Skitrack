import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { GpxPoint } from "@/lib/gpx";
import { useMapPrefs } from "@/lib/mapPrefs";
import { BASEMAPS, MAP_TILE_REV, resolvedBasemap, skiMapStyle } from "@/lib/mapStyle";

export type MapLine = {
  id: string;
  a: [number, number];
  b: [number, number];
};

export type MapPin = {
  id: string;
  lat: number;
  lon: number;
  title: string;
  hint?: string;
  kind?: "listing" | "lift" | "lift-top";
};

function esc(s: string): string {
  const amp = String.fromCharCode(38);
  return s.replace(/[&<>"']/g, (c) => {
    if (c === "&") return amp + "amp;";
    if (c === "<") return amp + "lt;";
    if (c === ">") return amp + "gt;";
    if (c === '"') return amp + "quot;";
    return amp + "#39;";
  });
}

export function MapPanel({
  lat,
  lon,
  zoom = 12,
  label,
  pins = [],
  track = [],
  lines = [],
}: {
  lat: number;
  lon: number;
  zoom?: number;
  label?: string;
  pins?: MapPin[];
  track?: Pick<GpxPoint, "lat" | "lon">[];
  lines?: MapLine[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const pinMarkers = useRef<maplibregl.Marker[]>([]);
  const is3D = useRef(false);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const basemap = useMapPrefs((s) => s.basemap);
  const pistes = useMapPrefs((s) => s.pistes);
  const threeD = useMapPrefs((s) => s.threeD);
  const setBasemap = useMapPrefs((s) => s.setBasemap);
  const togglePistes = useMapPrefs((s) => s.togglePistes);
  const toggle3D = useMapPrefs((s) => s.toggle3D);
  const active = resolvedBasemap(basemap);

  useEffect(() => {
    if (!container.current || map.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: skiMapStyle(active, pistes) as maplibregl.StyleSpecification,
      center: [lon, lat],
      zoom,
      maxPitch: 60,
      attributionControl: false,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.AttributionControl({ compact: true }));
    m.on("error", (e) => {
      if (e?.error && !/tile/i.test(String(e.error))) console.warn("[map]", e.error);
    });
    m.on("load", () => {
      m.addSource("dem", {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 14,
      });
      setReady(true);
      m.resize();
    });
    const host = container.current;
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(host);
    map.current = m;
    return () => {
      ro.disconnect();
      marker.current?.remove();
      marker.current = null;
      pinMarkers.current.forEach((p) => p.remove());
      pinMarkers.current = [];
      m.remove();
      map.current = null;
      setReady(false);
    };
    // MAP_TILE_REV force le remount si les tuiles changent (plus d’Esri / MapTiler).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [MAP_TILE_REV]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.easeTo({
      center: [lon, lat],
      zoom: threeD ? Math.max(zoom, 12.6) : zoom,
      duration: 600,
    });
    marker.current?.remove();
    const el = document.createElement("div");
    el.className = "map-pin";
    el.title = label ?? "";
    marker.current = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(m);
    pinMarkers.current.forEach((p) => p.remove());
    pinMarkers.current = pins
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .slice(0, 80)
      .map((p) => {
        const dot = document.createElement("div");
        dot.className =
          p.kind === "lift-top"
            ? "map-pin map-pin--lift-top"
            : p.kind === "lift"
              ? "map-pin map-pin--lift"
              : "map-pin map-pin--listing";
        dot.title = p.title;
        const mk = new maplibregl.Marker({ element: dot }).setLngLat([p.lon, p.lat]);
        if (p.hint) {
          mk.setPopup(
            new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
              `<p class="map-pop__title">${esc(p.title)}</p><p class="map-pop__hint">${esc(p.hint)}</p>`,
            ),
          );
        }
        return mk.addTo(m);
      });
  }, [lat, lon, zoom, label, ready, threeD, pins]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const coords = track
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => [p.lon, p.lat] as [number, number]);
    const data: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords.length >= 2 ? coords : [] },
    };
    const src = m.getSource("gpx") as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
    } else if (coords.length >= 2) {
      m.addSource("gpx", { type: "geojson", data });
      m.addLayer({
        id: "gpx-line",
        type: "line",
        source: "gpx",
        paint: {
          "line-color": "#ff5a3c",
          "line-width": 3.5,
          "line-opacity": 0.92,
        },
      });
    }
    if (coords.length >= 2) {
      const b = coords.reduce(
        (acc, [x, y]) => acc.extend([x, y]),
        new maplibregl.LngLatBounds(coords[0], coords[0]),
      );
      m.fitBounds(b, { padding: 48, maxZoom: 14, duration: 700 });
    }
  }, [track, ready]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = lines
      .filter(
        (l) =>
          Number.isFinite(l.a[0]) &&
          Number.isFinite(l.a[1]) &&
          Number.isFinite(l.b[0]) &&
          Number.isFinite(l.b[1]),
      )
      .slice(0, 80)
      .map((l) => ({
        type: "Feature",
        properties: { id: l.id },
        geometry: { type: "LineString", coordinates: [l.a, l.b] },
      }));
    const data: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: "FeatureCollection",
      features,
    };
    const src = m.getSource("lifts") as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
    } else if (features.length > 0) {
      m.addSource("lifts", { type: "geojson", data });
      m.addLayer({
        id: "lift-axes",
        type: "line",
        source: "lifts",
        paint: {
          "line-color": "#ff5a3c",
          "line-width": 2,
          "line-opacity": 0.7,
        },
      });
    }
  }, [lines, ready]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const b = BASEMAPS.find((x) => x.key === active) ?? BASEMAPS[0];
    const src = m.getSource("basemap") as maplibregl.RasterTileSource | undefined;
    if (src && typeof src.setTiles === "function") {
      src.setTiles([...b.tiles]);
    }
    if (m.getLayer("ov-pistes")) {
      m.setLayoutProperty("ov-pistes", "visibility", pistes ? "visible" : "none");
    }
  }, [active, pistes, ready]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !m.getSource("dem")) return;
    if (threeD && !is3D.current) {
      is3D.current = true;
      m.setTerrain({ source: "dem", exaggeration: 1.15 });
      m.easeTo({ center: [lon, lat], zoom: Math.max(zoom, 12.6), pitch: 54, bearing: -18, duration: 1100 });
    } else if (!threeD && is3D.current) {
      is3D.current = false;
      m.setTerrain(null);
      m.easeTo({ pitch: 0, bearing: 0, duration: 700 });
    }
  }, [threeD, lat, lon, zoom, ready]);

  const current = BASEMAPS.find((b) => b.key === active) ?? BASEMAPS[0];

  return (
    <div className="map-col" data-testid="map-panel">
      <div ref={container} className="map-col__canvas" />
      <div className="map-chrome">
        {pistes ? (
          <div className="map-chrome__card">
            <p className="map-chrome__title">Pistes OpenSnowMap / OSM</p>
            <p className="map-chrome__legend">
              <span className="map-swatch map-swatch--green" />
              verte
              <span className="map-swatch map-swatch--blue" />
              bleue
              <span className="map-swatch map-swatch--red" />
              rouge
              <span className="map-swatch map-swatch--black" />
              noire
            </p>
            <p className="piste__hint">IGN / OpenStreetMap — aucune clé, pas de filigrane.</p>
          </div>
        ) : (
          <div className="map-chrome__card">
            <p className="map-chrome__title">Fonds IGN / OpenStreetMap</p>
            <p className="piste__hint">Aucune clé cartographique.</p>
          </div>
        )}
        <button type="button" className="map-chrome__btn map-chrome__btn--ink" onClick={toggle3D}>
          {threeD ? "Vue 2D" : "Vue 3D · relief"}
        </button>
        <button
          type="button"
          className={`map-chrome__btn${pistes ? " map-chrome__btn--on" : ""}`}
          onClick={togglePistes}
        >
          {pistes ? "Pistes OSM · visibles" : "Pistes OSM · masquées"}
        </button>
        <div className="relative">
          <button
            type="button"
            className="map-chrome__btn map-chrome__btn--wide"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            Fond · {current.label}
          </button>
          {open ? (
            <div className="map-picker">
              {BASEMAPS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  className={`map-picker__row${active === b.key ? " map-picker__row--on" : ""}`}
                  onClick={() => {
                    setBasemap(b.key);
                    setOpen(false);
                  }}
                >
                  <span>{b.label}</span>
                  <span className="map-picker__sub">{b.sub}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
