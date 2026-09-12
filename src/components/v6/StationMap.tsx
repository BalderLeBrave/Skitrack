/** Carte des stations (maquette l. 731–735, 512–527) et minicarte de la fiche
 *  (l. 634–635), sur Leaflet 1.9.4 comme la maquette : tuiles OpenStreetMap,
 *  attribution « © OpenStreetMap contributors », `divIcon` 12×12 ancré au
 *  centre, étiquette `divIcon` 0×0 non interactive, zoom en bas à droite,
 *  survol → sélection, clic → sélection avec vol, double clic → fiche. */

import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Station } from "@/lib/stations";

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = "© OpenStreetMap contributors";

/** Leaflet lit `window` dès son évaluation.
 *
 *  Importé au niveau du module, il faisait donc échouer le rendu serveur de
 *  toute page qui le touche — la fiche station et l'écran Comparer —, avec une
 *  exception « window is not defined » suivie d'une bascule en rendu client.
 *  Rien ne se voyait à l'écran, et chaque premier affichage payait le détour.
 *
 *  Il est donc chargé à la demande, depuis un effet, qui ne s'exécute que dans
 *  le navigateur. La promesse est mémorisée : deux cartes sur la même page ne
 *  chargent la bibliothèque qu'une fois. */
let leafletLoad: Promise<typeof Leaflet> | null = null;
function loadLeaflet(): Promise<typeof Leaflet> {
  leafletLoad ??= import("leaflet").then(
    (m) =>
      (m as unknown as { default?: typeof Leaflet }).default ?? (m as unknown as typeof Leaflet),
  );
  return leafletLoad;
}

export type FlyRequest = { lat: number; lon: number; nonce: number };

export function StationMap({
  stations,
  visible,
  cmp,
  active,
  activeLabel,
  fly,
  onHover,
  onClick,
  onDblClick,
}: {
  stations: Station[];
  visible: Set<string>;
  cmp: string[];
  active: string | null;
  /** Étiquette `.lbl` de la station active, l. 521. */
  activeLabel: string | null;
  fly: FlyRequest | null;
  onHover: (id: string) => void;
  onClick: (id: string) => void;
  onDblClick: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const lib = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const markers = useRef<Map<string, Leaflet.Marker>>(new Map());
  const labelLayer = useRef<Leaflet.LayerGroup | null>(null);
  const handlers = useRef({ onHover, onClick, onDblClick });
  handlers.current = { onHover, onClick, onDblClick };
  /** Incrémenté quand la carte existe. Les effets qui la peuplent en dépendent,
   *  sans quoi ils passeraient une fois, à vide, avant la fin du chargement. */
  const [ready, setReady] = useState(0);

  // l. 731–735 : carte, vue [45.4, 4.6] zoom 6, zoom en bas à droite,
  // `invalidateSize` à chaque changement de taille du conteneur.
  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | null = null;
    void loadLeaflet().then((Lf) => {
      if (cancelled || !host.current) return;
      lib.current = Lf;
      const m = Lf.map(host.current, { zoomControl: false, scrollWheelZoom: true }).setView(
        [45.4, 4.6],
        6,
      );
      Lf.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(m);
      Lf.control.zoom({ position: "bottomright" }).addTo(m);
      labelLayer.current = Lf.layerGroup().addTo(m);
      const ro = new ResizeObserver(() => m.invalidateSize({ pan: false }));
      ro.observe(host.current);
      setTimeout(() => m.invalidateSize(), 0);
      map.current = m;
      const pins = markers.current;
      teardown = () => {
        ro.disconnect();
        pins.clear();
        labelLayer.current = null;
        m.remove();
        map.current = null;
      };
      setReady((n) => n + 1);
    });
    return () => {
      cancelled = true;
      teardown?.();
    };
  }, []);

  // l. 740–744 : une épingle par station, survol / clic / double clic.
  useEffect(() => {
    const m = map.current;
    const Lf = lib.current;
    if (!m || !Lf) return;
    for (const s of stations) {
      if (markers.current.has(s.id)) continue;
      const marker = Lf.marker([s.lat, s.lon], {
        icon: Lf.divIcon({
          className: "",
          html: '<div class="pin"></div>',
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        }),
      }).addTo(m);
      marker.on("mouseover", () => handlers.current.onHover(s.id));
      marker.on("click", () => handlers.current.onClick(s.id));
      marker.on("dblclick", () => handlers.current.onDblClick(s.id));
      markers.current.set(s.id, marker);
    }
  }, [stations, ready]);

  // l. 553–554 : opacité hors filtre, classe `cmp` ; l. 514, 519 : `on`.
  useEffect(() => {
    markers.current.forEach((marker, id) => {
      const el = marker.getElement();
      if (!el) return;
      el.style.opacity = visible.has(id) || cmp.includes(id) ? "1" : ".18";
      const pin = el.querySelector(".pin");
      pin?.classList.toggle("cmp", cmp.includes(id));
      pin?.classList.toggle("on", id === active);
    });
  }, [visible, cmp, active, ready]);

  // l. 521 : étiquette de la station active, non interactive.
  useEffect(() => {
    const layer = labelLayer.current;
    const Lf = lib.current;
    if (!layer || !Lf) return;
    layer.clearLayers();
    if (!active || !activeLabel) return;
    const s = stations.find((x) => x.id === active);
    if (!s) return;
    Lf.marker([s.lat, s.lon], {
      icon: Lf.divIcon({
        className: "",
        html: `<span class="lbl">${activeLabel}</span>`,
        iconSize: [0, 0],
      }),
      interactive: false,
    }).addTo(layer);
  }, [active, activeLabel, stations, ready]);

  // l. 522 : `flyTo` sur clic de ligne, zoom ≥ 9, 0,6 s.
  useEffect(() => {
    const m = map.current;
    if (!m || !fly) return;
    m.flyTo([fly.lat, fly.lon], Math.max(m.getZoom(), 9), { duration: 0.6 });
  }, [fly, ready]);

  return <div className="lmap" id="map" ref={host} />;
}

/** Minicarte de la fiche (l. 634–635) : sans zoom, sans molette, sans
 *  glisser ; vue sur la station, zoom 11 ; épingle `.pin.on`. */
export function MiniMap({ lat, lon }: { lat: number; lon: number }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const marker = useRef<Leaflet.Marker | null>(null);

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | null = null;
    void loadLeaflet().then((Lf) => {
      if (cancelled || !host.current) return;
      const m = Lf.map(host.current, {
        zoomControl: false,
        scrollWheelZoom: false,
        dragging: false,
      });
      Lf.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(m);
      marker.current = Lf.marker([lat, lon], {
        icon: Lf.divIcon({
          className: "",
          html: '<div class="pin on"></div>',
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        }),
      }).addTo(m);
      setTimeout(() => {
        m.invalidateSize();
        m.setView([lat, lon], 11);
      }, 0);
      map.current = m;
      teardown = () => {
        marker.current = null;
        m.remove();
        map.current = null;
      };
    });
    return () => {
      cancelled = true;
      teardown?.();
    };
    // Vue initiale seulement ; les changements de station passent par l'effet suivant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    map.current?.setView([lat, lon], 11);
    marker.current?.setLatLng([lat, lon]);
  }, [lat, lon]);

  return <div className="minimap" id="minimap" ref={host} />;
}
