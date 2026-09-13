/**
 * La carte des écrans Comparer et Logements : Leaflet, tuiles OpenStreetMap,
 * des épingles dessinées en HTML.
 *
 * La maquette v7 pose deux sortes de marqueurs : la station (un disque avec la
 * montagne et le nom en étiquette) et l'annonce (une pastille au prix). Ils
 * sont donnés ici tout faits, en HTML, par l'écran qui sait ce qu'ils
 * signifient ; la carte ne fait que les poser, les recadrer et remonter les
 * clics. Le cadrage suit la clé `cadrage` : il ne bouge que quand la liste
 * change, pas à chaque survol.
 *
 * `Carte.tsx` reste la carte des écrans de contrôle, avec ses fonds IGN et sa
 * surcouche de pistes. Celle-ci suit la maquette : fond OpenStreetMap, zoom en
 * bas à droite, pas de molette.
 */

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { chargerLeaflet, type Leaflet } from "@/lib/leaflet";

export type Marqueur = {
  id: string;
  lat: number;
  lon: number;
  /** Le marqueur, en HTML, centré sur son point par `transform`. */
  html: string;
  zIndex?: number;
  /** Compte dans le cadrage. Vrai par défaut. */
  cadre?: boolean;
};

export function CarteEpingles({
  marqueurs,
  cadrage,
  maxZoom = 11,
  vueVide = { centre: [45.5, 3.5] as [number, number], zoom: 5 },
  surClic,
  className,
  legende,
}: {
  marqueurs: readonly Marqueur[];
  /** Change quand il faut recadrer : la liste des identifiants, en pratique. */
  cadrage: string;
  maxZoom?: number;
  vueVide?: { centre: [number, number]; zoom: number };
  surClic?: (id: string) => void;
  className?: string;
  legende?: React.ReactNode;
}) {
  const hote = useRef<HTMLDivElement>(null);
  const lib = useRef<typeof Leaflet | null>(null);
  const carte = useRef<Leaflet.Map | null>(null);
  const couche = useRef<Leaflet.LayerGroup | null>(null);
  const rappel = useRef(surClic);
  rappel.current = surClic;
  const cadre = useRef("");
  const [prete, setPrete] = useState(false);

  useEffect(() => {
    let annule = false;
    let demonter: (() => void) | null = null;
    void chargerLeaflet().then((Lf) => {
      if (annule || !hote.current) return;
      lib.current = Lf;
      const m = Lf.map(hote.current, { zoomControl: false, scrollWheelZoom: false });
      Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 18,
      }).addTo(m);
      Lf.control.zoom({ position: "bottomright" }).addTo(m);
      couche.current = Lf.layerGroup().addTo(m);
      m.setView(vueVide.centre, vueVide.zoom);
      const redim = new ResizeObserver(() => m.invalidateSize({ pan: false }));
      redim.observe(hote.current);
      carte.current = m;
      setPrete(true);
      demonter = () => {
        redim.disconnect();
        couche.current = null;
        m.remove();
        carte.current = null;
      };
    });
    return () => {
      annule = true;
      demonter?.();
    };
    // Création une fois ; la vue vide initiale ne change pas ensuite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const Lf = lib.current,
      m = carte.current,
      c = couche.current;
    if (!prete || !Lf || !m || !c) return;
    c.clearLayers();
    const pts: [number, number][] = [];
    for (const mk of marqueurs) {
      if (!Number.isFinite(mk.lat) || !Number.isFinite(mk.lon)) continue;
      const marker = Lf.marker([mk.lat, mk.lon], {
        icon: Lf.divIcon({ className: "", iconSize: [0, 0], html: mk.html }),
        zIndexOffset: mk.zIndex ?? 0,
      });
      marker.on("click", () => rappel.current?.(mk.id));
      marker.addTo(c);
      if (mk.cadre !== false) pts.push([mk.lat, mk.lon]);
    }
    if (cadre.current !== cadrage) {
      cadre.current = cadrage;
      if (pts.length) m.fitBounds(Lf.latLngBounds(pts), { padding: [48, 48], maxZoom });
      else m.setView(vueVide.centre, vueVide.zoom);
    }
  }, [prete, marqueurs, cadrage, maxZoom, vueVide]);

  return (
    <div className={["carte7", className].filter(Boolean).join(" ")}>
      <div className="carte7__toile" ref={hote} />
      {legende ? <div className="carte7__legende">{legende}</div> : null}
    </div>
  );
}

/** Le marqueur de station de la maquette : disque, montagne, nom. */
export function htmlStation(nom: string, sombre: boolean): string {
  return `<div class="epingle-station${sombre ? " epingle-station--sombre" : ""}"><div class="epingle-station__disque"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19l6-11 4 7 2-3 6 7z"/></svg></div><span class="epingle-station__nom">${echappe(nom)}</span></div>`;
}

/** Le repère discret de la station retenue, sur la carte des logements. */
export function htmlRepere(nom: string): string {
  return `<div class="epingle-repere"><span class="epingle-repere__disque"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19l6-11 4 7 2-3 6 7z"/></svg></span><span class="epingle-repere__nom">${echappe(nom)}</span></div>`;
}

/** La pastille au prix d'une annonce : vive, retenue, ou déjà vue. */
export function htmlPrix(prix: string, etat: "vive" | "retenue" | "vue"): string {
  return `<div class="epingle-prix epingle-prix--${etat}">${echappe(prix)}</div>`;
}

function echappe(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}
