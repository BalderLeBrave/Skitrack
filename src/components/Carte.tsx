/**
 * La carte de SKITRACK : une seule, sur Leaflet.
 *
 * L'application en portait trois, dans deux bibliothèques : `AlpineMap` et
 * `MapPanel` sur MapLibre, `StationMap` sur Leaflet. Leaflet l'emporte, comme
 * la maquette v6 l'avait déjà tranché, et MapLibre quitte le dépôt avec son
 * mégaoctet de bundle.
 *
 * Ce que la carte sait montrer :
 *   — des épingles, station, logement ou remontée, avec un survol qui remonte ;
 *   — les pistes et les remontées mécaniques, en surcouche OpenSnowMap ;
 *   — une trace GPX et les segments de remontées ;
 *   — trois fonds, plan IGN, relief et photo aérienne, sans clé.
 *
 * Ce qu'elle ne sait plus faire : la vue 3D en relief de MapLibre. Leaflet ne
 * dessine que du plan. C'était le coût annoncé du passage à une bibliothèque
 * unique.
 */

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { chargerLeaflet, type Leaflet } from "@/lib/leaflet";
import { BASEMAPS, PISTE_OVERLAY, resolvedBasemap } from "@/lib/mapStyle";
import { useMapPrefs } from "@/lib/mapPrefs";

export type SorteEpingle =
  "station" | "station-haute" | "logement" | "remontee" | "depart" | "prix";

export type Epingle = {
  id: string;
  lat: number;
  lon: number;
  titre: string;
  /** Ligne secondaire de l'infobulle. Jamais une valeur inventée. */
  detail?: string;
  /** Texte porté par le marqueur lui-même : un prix se lit sur la carte, pas
   *  au survol. Absent, le marqueur reste une pastille. */
  etiquette?: string;
  sorte?: SorteEpingle;
};

/** Une remontée : deux gares reliées par un trait. */
export type Segment = { id: string; a: [number, number]; b: [number, number] };

export type Trace = { lat: number; lon: number }[];

/** Le marqueur est du HTML : ce qui vient d'une annonce est échappé. */
function echapper(t: string): string {
  return t.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export function Carte({
  epingles = [],
  segments = [],
  trace = [],
  centre,
  zoom = 11,
  selectionne = null,
  survole = null,
  surSurvol,
  surClic,
  surDoubleClic,
  ajuster = false,
  statique = false,
  outils = true,
  legende,
  className,
}: {
  epingles?: readonly Epingle[];
  segments?: readonly Segment[];
  trace?: Trace;
  centre?: [number, number];
  zoom?: number;
  /** Épingle retenue : anneau d'accent, et la carte s'y recentre. */
  selectionne?: string | null;
  /** Épingle survolée ailleurs dans la page, à éclairer ici. */
  survole?: string | null;
  surSurvol?: (id: string | null) => void;
  surClic?: (id: string) => void;
  surDoubleClic?: (id: string) => void;
  /** Cadre la vue sur tout ce qui est posé, au lieu de `centre` et `zoom`. */
  ajuster?: boolean;
  /** Ni glisser, ni molette, ni zoom : une vignette de situation. */
  statique?: boolean;
  outils?: boolean;
  legende?: React.ReactNode;
  className?: string;
}) {
  const hote = useRef<HTMLDivElement>(null);
  const lib = useRef<typeof Leaflet | null>(null);
  const carte = useRef<Leaflet.Map | null>(null);
  const fond = useRef<Leaflet.TileLayer | null>(null);
  const surcouche = useRef<Leaflet.TileLayer | null>(null);
  const marques = useRef(new Map<string, Leaflet.Marker>());
  const traits = useRef<Leaflet.LayerGroup | null>(null);
  const ligne = useRef<Leaflet.Polyline | null>(null);
  const rappels = useRef({ surSurvol, surClic, surDoubleClic });
  rappels.current = { surSurvol, surClic, surDoubleClic };
  const [prete, setPrete] = useState(0);
  const [ouvert, setOuvert] = useState(false);

  const basemap = useMapPrefs((s) => s.basemap);
  const pistes = useMapPrefs((s) => s.pistes);
  const setBasemap = useMapPrefs((s) => s.setBasemap);
  const togglePistes = useMapPrefs((s) => s.togglePistes);
  const actif = resolvedBasemap(basemap);
  const fondActif = BASEMAPS.find((b) => b.key === actif) ?? BASEMAPS[0];

  // ── Création, une fois ────────────────────────────────────────────────
  useEffect(() => {
    let annule = false;
    let demonter: (() => void) | null = null;
    void chargerLeaflet().then((Lf) => {
      if (annule || !hote.current) return;
      lib.current = Lf;
      const m = Lf.map(hote.current, {
        zoomControl: !statique,
        scrollWheelZoom: !statique,
        dragging: !statique,
        doubleClickZoom: !statique,
        attributionControl: true,
      });
      m.setView(centre ?? [45.4, 4.6], zoom);
      if (!statique) m.zoomControl?.setPosition("bottomright");
      traits.current = Lf.layerGroup().addTo(m);
      const redimension = new ResizeObserver(() => m.invalidateSize());
      redimension.observe(hote.current);
      setTimeout(() => m.invalidateSize(), 0);
      carte.current = m;
      setPrete((n) => n + 1);
      demonter = () => {
        redimension.disconnect();
        marques.current.clear();
        traits.current = null;
        ligne.current = null;
        fond.current = null;
        surcouche.current = null;
        m.remove();
        carte.current = null;
      };
    });
    return () => {
      annule = true;
      demonter?.();
    };
    // Vue initiale seulement : les changements passent par les effets suivants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statique]);

  // ── Fond de carte et surcouche des pistes ─────────────────────────────
  useEffect(() => {
    const Lf = lib.current,
      m = carte.current;
    if (!prete || !Lf || !m) return;
    fond.current?.remove();
    fond.current = Lf.tileLayer([...fondActif.tiles][0], {
      attribution: fondActif.attribution,
      maxZoom: fondActif.maxzoom,
    }).addTo(m);
    fond.current.bringToBack();
  }, [prete, fondActif]);

  useEffect(() => {
    const Lf = lib.current,
      m = carte.current;
    if (!prete || !Lf || !m) return;
    surcouche.current?.remove();
    surcouche.current = null;
    if (!pistes) return;
    // Cette couche porte les pistes ET les remontées mécaniques.
    surcouche.current = Lf.tileLayer([...PISTE_OVERLAY.tiles][0], {
      attribution: PISTE_OVERLAY.attribution,
      maxZoom: PISTE_OVERLAY.maxzoom,
      opacity: 0.9,
    }).addTo(m);
  }, [prete, pistes]);

  // ── Épingles ──────────────────────────────────────────────────────────
  useEffect(() => {
    const Lf = lib.current,
      m = carte.current;
    if (!prete || !Lf || !m) return;
    for (const [, mk] of marques.current) mk.remove();
    marques.current.clear();
    for (const e of epingles) {
      if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue;
      const sorte = e.sorte ?? "station";
      const mk = Lf.marker([e.lat, e.lon], {
        title: e.titre,
        // `className` porte sur l'élément que Leaflet insère : c'est lui que
        // `getElement()` rend, et donc lui qui doit porter l'anneau de survol.
        icon: e.etiquette
          ? Lf.divIcon({
              className: `pin-etiquette pin-etiquette--${sorte}`,
              html: echapper(e.etiquette),
              iconSize: [1, 1],
              iconAnchor: [0, 0],
            })
          : Lf.divIcon({
              className: `pin pin--${sorte}`,
              html: "",
              iconSize: [12, 12],
              iconAnchor: [6, 6],
            }),
      });
      mk.on("mouseover", () => rappels.current.surSurvol?.(e.id));
      mk.on("mouseout", () => rappels.current.surSurvol?.(null));
      mk.on("click", () => rappels.current.surClic?.(e.id));
      mk.on("dblclick", () => rappels.current.surDoubleClic?.(e.id));
      if (e.detail) mk.bindTooltip(`${e.titre} · ${e.detail}`, { direction: "top" });
      mk.addTo(m);
      marques.current.set(e.id, mk);
    }
  }, [prete, epingles]);

  // ── Éclairage de l'épingle retenue ou survolée ────────────────────────
  useEffect(() => {
    if (!prete) return;
    const vif = selectionne ?? survole;
    for (const [id, mk] of marques.current) {
      const el = mk.getElement();
      if (el) el.classList.toggle("pin--vif", id === vif);
    }
    const m = carte.current;
    if (!m || !selectionne) return;
    const cible = epingles.find((e) => e.id === selectionne);
    if (cible) m.setView([cible.lat, cible.lon], Math.max(m.getZoom(), 10), { animate: true });
  }, [prete, selectionne, survole, epingles]);

  // ── Segments de remontées ─────────────────────────────────────────────
  useEffect(() => {
    const Lf = lib.current;
    if (!prete || !Lf || !traits.current) return;
    traits.current.clearLayers();
    for (const sg of segments) {
      Lf.polyline([sg.a, sg.b], { className: "trait-remontee", weight: 2 }).addTo(traits.current);
    }
  }, [prete, segments]);

  // ── Trace GPX ─────────────────────────────────────────────────────────
  useEffect(() => {
    const Lf = lib.current,
      m = carte.current;
    if (!prete || !Lf || !m) return;
    ligne.current?.remove();
    ligne.current = null;
    const pts = trace
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => [p.lat, p.lon] as [number, number]);
    if (pts.length < 2) return;
    ligne.current = Lf.polyline(pts, { className: "trait-trace", weight: 3.5 }).addTo(m);
    m.fitBounds(ligne.current.getBounds(), { padding: [40, 40], maxZoom: 15 });
  }, [prete, trace]);

  // ── Cadrage sur l'ensemble ────────────────────────────────────────────
  useEffect(() => {
    const Lf = lib.current,
      m = carte.current;
    if (!prete || !Lf || !m || !ajuster || trace.length >= 2) return;
    const pts = epingles
      .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon))
      .map((e) => [e.lat, e.lon] as [number, number]);
    if (!pts.length) return;
    m.fitBounds(Lf.latLngBounds(pts), { padding: [40, 40], maxZoom: 12 });
  }, [prete, ajuster, epingles, trace.length]);

  // ── Recentrage demandé par la page ────────────────────────────────────
  useEffect(() => {
    if (!prete || !centre || ajuster) return;
    carte.current?.setView(centre, zoom);
  }, [prete, centre, zoom, ajuster]);

  return (
    <div
      className={["carte", statique ? "carte--statique" : null, className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="carte__toile" ref={hote} />
      {outils && !statique ? (
        <div className="carte__outils">
          <button
            type="button"
            className={`chip${pistes ? " chip--on" : ""}`}
            aria-pressed={pistes}
            onClick={togglePistes}
          >
            Pistes et remontées
          </button>
          <div className="carte__fonds">
            <button
              type="button"
              className="chip"
              aria-expanded={ouvert}
              onClick={() => setOuvert((v) => !v)}
            >
              Fond : {fondActif.label}
            </button>
            {ouvert ? (
              <div className="carte__choix" role="listbox">
                {BASEMAPS.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    role="option"
                    aria-selected={b.key === actif}
                    className={`carte__choix-ligne${b.key === actif ? " carte__choix-ligne--on" : ""}`}
                    onClick={() => {
                      setBasemap(b.key);
                      setOuvert(false);
                    }}
                  >
                    <span>{b.label}</span>
                    <span className="carte__choix-sub">{b.sub}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {legende ? <div className="carte__legende">{legende}</div> : null}
    </div>
  );
}
