import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ALPINE_CENTER,
  ALPINE_ZOOM,
  alpineFeatureCollection,
  mapView,
  type MapFilter,
} from "@/lib/alpine";
import { useMapPrefs } from "@/lib/mapPrefs";
import { BASEMAPS, MAP_TILE_REV, resolvedBasemap, skiMapStyle } from "@/lib/mapStyle";
import { formatAlt, type Station } from "@/lib/stations";

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

function popupHtml(p: GeoJSON.GeoJsonProperties): string {
  const name = esc(String(p?.name ?? ""));
  const massif = esc(String(p?.massif ?? ""));
  const id = esc(String(p?.id ?? ""));
  const vil = Number(p?.villageM);
  const dem = Number(p?.demM);
  const min = Number(p?.minM);
  const max = Number(p?.maxM);
  const pin = String(p?.pinKind ?? "");
  const pinNote = pin === "sommet" ? "pin au sommet" : pin === "base" ? "pin au village" : "pin IGN";
  const photo = typeof p?.photo === "string" ? p.photo : "";
  const img = photo
    ? `<img src="${esc(photo)}" alt="${name}" width="280" height="160" style="display:block;width:16.5rem;height:9.2rem;object-fit:cover;border-radius:0.7rem;margin:0 0 0.45rem" />`
    : "";
  return `${img}<p class="map-pop__title">${name}</p>
<p class="map-pop__hint">${massif} · ${pinNote}</p>
<p class="map-pop__hint">Village ${formatAlt(vil)} · IGN ${Number.isFinite(dem) ? formatAlt(dem) : "—"}</p>
<p class="map-pop__hint">Base ${formatAlt(min)} · sommet ${formatAlt(max)}</p>
<p class="map-pop__hint"><a href="/stations/${id}">Fiche station</a></p>`;
}

export function AlpineMap({ stations, filter }: { stations: Station[]; filter: MapFilter }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [pentes, setPentes] = useState(true);
  const basemap = useMapPrefs((s) => s.basemap);
  const pistes = useMapPrefs((s) => s.pistes);
  const setBasemap = useMapPrefs((s) => s.setBasemap);
  const togglePistes = useMapPrefs((s) => s.togglePistes);
  const active = resolvedBasemap(basemap);
  const data = useMemo(() => alpineFeatureCollection(stations), [stations]);
  const view = mapView(filter);

  useEffect(() => {
    if (!container.current || map.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: skiMapStyle(active, pistes, true) as maplibregl.StyleSpecification,
      center: ALPINE_CENTER,
      zoom: ALPINE_ZOOM,
      maxPitch: 60,
      attributionControl: false,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.AttributionControl({ compact: true }));
    m.on("load", () => {
      m.addSource("stations", {
        type: "geojson",
        data,
        cluster: true,
        clusterMaxZoom: 9,
        clusterRadius: 42,
      });
      m.addLayer({
        id: "clusters",
        type: "circle",
        source: "stations",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#1f4f86",
          "circle-radius": ["step", ["get", "point_count"], 14, 8, 18, 20, 24],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
      m.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "stations",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Open Sans Regular"],
          "text-size": 11,
        },
        paint: { "text-color": "#fff" },
      });
      m.addLayer({
        id: "station-pt",
        type: "circle",
        source: "stations",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "massif"],
            "Alpes du Nord",
            "#1f4f86",
            "Alpes du Sud",
            "#c45c26",
            "Pyrénées",
            "#2d6a4f",
            "#4a5568",
          ],
          "circle-radius": ["case", ["==", ["get", "haut"], 1], 8, 6],
          "circle-stroke-width": ["case", ["==", ["get", "pinKind"], "sommet"], 3, 2],
          "circle-stroke-color": ["case", ["==", ["get", "haut"], 1], "#f4d35e", "#fff"],
        },
      });
      m.addLayer({
        id: "station-label",
        type: "symbol",
        source: "stations",
        filter: ["!", ["has", "point_count"]],
        minzoom: 8,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 1.15],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#0b1f33",
          "text-halo-color": "#fff",
          "text-halo-width": 1.2,
        },
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
      m.remove();
      map.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [MAP_TILE_REV]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const src = m.getSource("stations") as maplibregl.GeoJSONSource | undefined;
    src?.setData(data);
    if (stations.length === 0) return;
    const b = stations.reduce(
      (acc, s) => acc.extend([s.lon, s.lat]),
      new maplibregl.LngLatBounds([stations[0].lon, stations[0].lat], [stations[0].lon, stations[0].lat]),
    );
    m.fitBounds(b, { padding: 56, maxZoom: view.maxFit, duration: 700 });
  }, [data, ready, stations, view.maxFit]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const onPoint = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      new maplibregl.Popup({ offset: 14, closeButton: false })
        .setLngLat(e.lngLat)
        .setHTML(popupHtml(f.properties))
        .addTo(m);
    };
    const onEnter = () => {
      m.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      m.getCanvas().style.cursor = "";
    };
    const onCluster = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      const src = m.getSource("stations") as maplibregl.GeoJSONSource;
      const cid = f.properties?.cluster_id;
      if (cid == null) return;
      void src.getClusterExpansionZoom(cid).then((zoom) => {
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        m.easeTo({ center: coords, zoom });
      });
    };
    m.on("click", "station-pt", onPoint);
    m.on("click", "clusters", onCluster);
    m.on("mouseenter", "station-pt", onEnter);
    m.on("mouseleave", "station-pt", onLeave);
    m.on("mouseenter", "clusters", onEnter);
    m.on("mouseleave", "clusters", onLeave);
    return () => {
      m.off("click", "station-pt", onPoint);
      m.off("click", "clusters", onCluster);
      m.off("mouseenter", "station-pt", onEnter);
      m.off("mouseleave", "station-pt", onLeave);
      m.off("mouseenter", "clusters", onEnter);
      m.off("mouseleave", "clusters", onLeave);
    };
  }, [ready]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const b = BASEMAPS.find((x) => x.key === active) ?? BASEMAPS[0];
    const src = m.getSource("basemap") as maplibregl.RasterTileSource | undefined;
    if (src && typeof src.setTiles === "function") src.setTiles([...b.tiles]);
    if (m.getLayer("ov-pistes")) m.setLayoutProperty("ov-pistes", "visibility", pistes ? "visible" : "none");
    if (m.getLayer("ov-pentes")) m.setLayoutProperty("ov-pentes", "visibility", pentes ? "visible" : "none");
  }, [active, pistes, pentes, ready]);

  const current = BASEMAPS.find((b) => b.key === active) ?? BASEMAPS[0];

  return (
    <div className="map-col" data-testid="alpine-map">
      <div ref={container} className="map-col__canvas" />
      <div className="map-chrome">
        <div className="map-chrome__card">
          <p className="map-chrome__title">
            {stations.length} station{stations.length > 1 ? "s" : ""}
          </p>
          <p className="map-chrome__legend">
            <span className="map-swatch" style={{ background: "#1f4f86" }} />
            Nord
            <span className="map-swatch" style={{ background: "#c45c26" }} />
            Sud
            <span className="map-swatch" style={{ background: "#2d6a4f" }} />
            Pyrénées
            <span className="map-swatch" style={{ background: "#4a5568" }} />
            autres
            <span className="map-swatch" style={{ background: "#f4d35e" }} />
            ≥ 3000 m
          </p>
          <p className="piste__hint">Plan IGN · pentes · IGN RGE ALTI au pin. Clic = altitudes de cette station.</p>
        </div>
        <button
          type="button"
          className={`map-chrome__btn${pentes ? " map-chrome__btn--on" : ""}`}
          onClick={() => setPentes((v) => !v)}
        >
          {pentes ? "Pentes IGN · visibles" : "Pentes IGN · masquées"}
        </button>
        <button type="button" className={`map-chrome__btn${pistes ? " map-chrome__btn--on" : ""}`} onClick={togglePistes}>
          {pistes ? "Pistes OSM · visibles" : "Pistes OSM · masquées"}
        </button>
        <div className="relative">
          <button type="button" className="map-chrome__btn map-chrome__btn--wide" onClick={() => setOpen((v) => !v)}>
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
