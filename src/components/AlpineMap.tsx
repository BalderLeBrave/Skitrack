import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { CARTE_CENTER, CARTE_ZOOM } from "@/lib/alpine";
import { useMapPrefs } from "@/lib/mapPrefs";
import { BASEMAPS, MAP_TILE_REV, resolvedBasemap, skiMapStyle } from "@/lib/mapStyle";
import { formatAlt, type Station } from "@/lib/stations";

/** Épingle DOM : 12 px, bleu marque, orange quand la station est active.
 *  Le point vit dans un conteneur parce que MapLibre écrit `opacity` en style
 *  en ligne sur l'élément du marqueur : l'estompage doit porter ailleurs. */
function pinElement(): HTMLElement {
  const root = document.createElement("div");
  const dot = document.createElement("div");
  dot.className = "pin";
  root.append(dot);
  return root;
}

function dotOf(marker: maplibregl.Marker): HTMLElement | null {
  return marker.getElement().querySelector(".pin");
}

export function AlpineMap({
  stations,
  visibleIds,
  activeId = null,
  flyNonce = 0,
  onHover,
  onSelect,
}: {
  /** Toutes les stations : celles hors filtre s'estompent au lieu de disparaître. */
  stations: Station[];
  /** Stations retenues par le massif et la recherche. */
  visibleIds: ReadonlySet<string>;
  /** Station survolée ou sélectionnée. */
  activeId?: string | null;
  /** Incrémenté à chaque clic : la carte recadre sur `activeId`. */
  flyNonce?: number;
  onHover?: (id: string) => void;
  onSelect?: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pins = useRef<Map<string, maplibregl.Marker>>(new Map());
  const label = useRef<maplibregl.Marker | null>(null);
  const onHoverRef = useRef(onHover);
  const onSelectRef = useRef(onSelect);
  onHoverRef.current = onHover;
  onSelectRef.current = onSelect;

  const basemap = useMapPrefs((s) => s.basemap);
  const pistes = useMapPrefs((s) => s.pistes);
  const setBasemap = useMapPrefs((s) => s.setBasemap);
  const togglePistes = useMapPrefs((s) => s.togglePistes);
  const active = resolvedBasemap(basemap);

  useEffect(() => {
    if (!container.current || map.current) return;
    const prefs = useMapPrefs.getState();
    const m = new maplibregl.Map({
      container: container.current,
      style: skiMapStyle(
        resolvedBasemap(prefs.basemap),
        prefs.pistes,
        false,
      ) as maplibregl.StyleSpecification,
      center: CARTE_CENTER,
      zoom: CARTE_ZOOM,
      attributionControl: false,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    m.addControl(new maplibregl.AttributionControl({ compact: true }));
    const host = container.current;
    const store = pins.current;
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(host);
    map.current = m;
    return () => {
      ro.disconnect();
      store.forEach((p) => p.remove());
      store.clear();
      label.current?.remove();
      label.current = null;
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [MAP_TILE_REV]);

  // Une épingle par station, posée une fois puis réutilisée.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const live = new Set(stations.map((s) => s.id));
    pins.current.forEach((marker, id) => {
      if (live.has(id)) return;
      marker.remove();
      pins.current.delete(id);
    });
    for (const s of stations) {
      if (pins.current.has(s.id)) continue;
      const el = pinElement();
      el.addEventListener("mouseenter", () => onHoverRef.current?.(s.id));
      el.addEventListener("click", () => onSelectRef.current?.(s.id));
      const marker = new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(m);
      pins.current.set(s.id, marker);
    }
  }, [stations]);

  // Estompage hors filtre, épingle active, étiquette flottante.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    pins.current.forEach((marker, id) => {
      const dot = dotOf(marker);
      if (!dot) return;
      dot.classList.toggle("pin--dim", !visibleIds.has(id));
      dot.classList.toggle("pin--on", id === activeId);
      marker.getElement().style.zIndex = id === activeId ? "3" : "";
    });
    label.current?.remove();
    label.current = null;
    const s = activeId ? stations.find((x) => x.id === activeId) : undefined;
    if (!s) return;
    const el = document.createElement("span");
    el.className = "lbl";
    el.append(`${s.name} · `);
    const alt = document.createElement("span");
    alt.className = "num";
    alt.textContent = formatAlt(s.villageM);
    el.append(alt);
    label.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([s.lon, s.lat])
      .addTo(m);
  }, [activeId, visibleIds, stations]);

  // Recadrage : au clic seulement, jamais au survol. Un nonce déjà honoré ne
  // rejoue pas, quel que soit l'ordre d'arrivée de `activeId` et de `flyNonce`.
  const flown = useRef(0);
  useEffect(() => {
    const m = map.current;
    if (!m || flyNonce === flown.current || !activeId) return;
    const s = stations.find((x) => x.id === activeId);
    if (!s) return;
    flown.current = flyNonce;
    m.flyTo({ center: [s.lon, s.lat], zoom: Math.max(m.getZoom(), 9), duration: 600 });
  }, [flyNonce, activeId, stations]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const b = BASEMAPS.find((x) => x.key === active) ?? BASEMAPS[0];
    const src = m.getSource("basemap") as maplibregl.RasterTileSource | undefined;
    if (src && typeof src.setTiles === "function") src.setTiles([...b.tiles]);
    if (m.getLayer("ov-pistes")) {
      m.setLayoutProperty("ov-pistes", "visibility", pistes ? "visible" : "none");
    }
  }, [active, pistes]);

  return (
    <div className="carte-map" data-testid="alpine-map">
      <div ref={container} className="carte-map__canvas" />
      <div className="maptools">
        {BASEMAPS.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`chip chip--sm${active === b.key ? " chip--on" : ""}`}
            aria-pressed={active === b.key}
            onClick={() => setBasemap(b.key)}
          >
            {active === b.key ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            ) : null}
            {b.label}
          </button>
        ))}
        <button
          type="button"
          className={`chip chip--sm${pistes ? " chip--on" : ""}`}
          aria-pressed={pistes}
          onClick={togglePistes}
        >
          Pistes OSM
        </button>
      </div>
      <div className="legend">
        <b>Épingles</b>
        <span>
          <i style={{ background: "var(--color-marque)" }} />
          Station ou village-station
        </span>
        <span>
          <i style={{ background: "var(--color-cta)" }} />
          Station survolée ou sélectionnée
        </span>
        <span className="text-texte-2">
          Coordonnées et altitudes : France Montagnes / OpenSkiMap.
        </span>
      </div>
    </div>
  );
}
