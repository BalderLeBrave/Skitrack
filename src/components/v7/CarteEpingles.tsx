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
 * bas à droite.
 *
 * Elle se manipule : molette, glisser, double-clic. Elle ne le faisait pas —
 * `scrollWheelZoom` était coupé et rien ne le disait, si bien que la molette
 * passée sur la carte faisait défiler la page derrière elle. Au doigt, en
 * revanche, la carte attend un premier appui avant de prendre le geste : sinon
 * elle avale le défilement de la page, ce qui est le même défaut à l'envers.
 */

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { chargerLeaflet, pointeurGrossier, type Leaflet } from "@/lib/leaflet";
import type { Bornes } from "@/lib/carte";

export type Marqueur = {
  id: string;
  lat: number;
  lon: number;
  /** Le marqueur, en HTML, centré sur son point par `transform`. */
  html: string;
  zIndex?: number;
  /** Compte dans le cadrage. Vrai par défaut. */
  cadre?: boolean;
  /** Repère décoratif : ni fenêtre, ni survol, ni clic. */
  inerte?: boolean;
};

export function CarteEpingles({
  marqueurs,
  cadrage,
  maxZoom = 11,
  vueVide = { centre: [45.5, 3.5] as [number, number], zoom: 5 },
  surClic,
  className,
  legende,
  suivi = false,
  surSuivi,
  surBornes,
  ficheDe,
  actif = null,
  surActif,
}: {
  marqueurs: readonly Marqueur[];
  /** Change quand il faut recadrer : la liste des identifiants, en pratique. */
  cadrage: string;
  maxZoom?: number;
  vueVide?: { centre: [number, number]; zoom: number };
  surClic?: (id: string) => void;
  className?: string;
  legende?: React.ReactNode;
  /** La liste suit-elle le cadre ? Quand oui, la carte cesse de se recadrer
   *  sur les résultats : c'est l'utilisateur qui la conduit. */
  suivi?: boolean;
  surSuivi?: (v: boolean) => void;
  /** Bornes du cadre, rendues en fin de déplacement ou de zoom, jamais pendant. */
  surBornes?: (b: Bornes) => void;
  /** Le contenu de la fenêtre flottante, fourni par l'écran qui sait ce que
   *  l'épingle désigne. Sans lui, pas de fenêtre. */
  ficheDe?: (id: string) => ReactNode;
  /** Épingle à éclairer depuis l'extérieur : la ligne survolée dans la liste. */
  actif?: string | null;
  /** Remonte l'épingle vive, pour que la liste éclaire la même. */
  surActif?: (id: string | null) => void;
}) {
  const hote = useRef<HTMLDivElement>(null);
  const lib = useRef<typeof Leaflet | null>(null);
  const carte = useRef<Leaflet.Map | null>(null);
  const couche = useRef<Leaflet.LayerGroup | null>(null);
  const rappel = useRef(surClic);
  rappel.current = surClic;
  const rappelBornes = useRef(surBornes);
  rappelBornes.current = surBornes;
  // Lu dans les écouteurs Leaflet, qui vivent plus longtemps qu'un rendu.
  const suitRef = useRef(suivi);
  suitRef.current = suivi;
  const cadre = useRef("");
  const [prete, setPrete] = useState(false);
  // Au doigt, la carte n'attrape le geste qu'après un premier appui : sans
  // cela elle avale le défilement de la page au milieu de la liste.
  const [tactile, setTactile] = useState(false);
  const [engagee, setEngagee] = useState(false);
  // Survol et clic ne se comportent pas pareil : le survol s'efface quand le
  // pointeur part, le clic tient jusqu'à fermeture explicite.
  const [survol, setSurvol] = useState<string | null>(null);
  const [fixe, setFixe] = useState<string | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const marques = useRef(new Map<string, Leaflet.Marker>());
  const rappelActif = useRef(surActif);
  rappelActif.current = surActif;
  // `ficheDe` est une fonction écrite en ligne par l'écran : elle change à
  // chaque rendu. Lue par une référence, elle ne fait plus reconstruire les
  // quarante marqueurs à chaque frappe, ce qui effaçait leur éclairage.
  const ficheRef = useRef(ficheDe);
  ficheRef.current = ficheDe;
  const avecFiche = !!ficheDe;

  // L'épingle vive : le clic d'abord, le survol ensuite, la liste en dernier.
  const vif = fixe ?? survol ?? actif;
  // La fenêtre ne s'ouvre que sur un geste porté à la carte.
  const montre = avecFiche ? (fixe ?? survol) : null;

  const survoler = (id: string | null) => {
    if (minuteur.current) clearTimeout(minuteur.current);
    if (id == null) {
      setSurvol(null);
      rappelActif.current?.(null);
      return;
    }
    // 300 ms : le temps qu'un pointeur qui traverse la carte ne déclenche rien.
    minuteur.current = setTimeout(() => {
      setSurvol(id);
      rappelActif.current?.(id);
    }, 300);
  };

  useEffect(() => {
    let annule = false;
    let demonter: (() => void) | null = null;
    void chargerLeaflet().then((Lf) => {
      if (annule || !hote.current) return;
      lib.current = Lf;
      // La molette zoome : c'est une carte de résultats, pas une vignette.
      const doigt = pointeurGrossier();
      setTactile(doigt);
      const m = Lf.map(hote.current, {
        zoomControl: false,
        scrollWheelZoom: !doigt,
        dragging: !doigt,
        touchZoom: !doigt,
        doubleClickZoom: true,
      });
      Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 18,
      }).addTo(m);
      Lf.control.zoom({ position: "bottomright" }).addTo(m);
      couche.current = Lf.layerGroup().addTo(m);
      // Les bornes ne sortent qu'à la fin du geste. Pendant, elles changeraient
      // à chaque image et la liste clignoterait sous les doigts.
      const emettre = () => {
        const b = m.getBounds();
        rappelBornes.current?.({
          sud: b.getSouth(),
          ouest: b.getWest(),
          nord: b.getNorth(),
          est: b.getEast(),
        });
      };
      m.on("moveend", emettre);
      m.on("zoomend", emettre);
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
    marques.current.clear();
    const pts: [number, number][] = [];
    for (const mk of marqueurs) {
      if (!Number.isFinite(mk.lat) || !Number.isFinite(mk.lon)) continue;
      const marker = Lf.marker([mk.lat, mk.lon], {
        icon: Lf.divIcon({ className: "", iconSize: [0, 0], html: mk.html }),
        zIndexOffset: mk.zIndex ?? 0,
      });
      if (!mk.inerte)
        marker.on("click", () => {
          if (ficheRef.current) setFixe((f) => (f === mk.id ? null : mk.id));
          else rappel.current?.(mk.id);
        });
      if (avecFiche && !mk.inerte && !pointeurGrossier()) {
        marker.on("mouseover", () => survoler(mk.id));
        marker.on("mouseout", () => survoler(null));
      }
      marker.addTo(c);
      marques.current.set(mk.id, marker);
      if (mk.cadre !== false) pts.push([mk.lat, mk.lon]);
    }
    if (cadre.current !== cadrage) {
      cadre.current = cadrage;
      // Quand la liste suit la carte, la carte ne se recadre plus sur la liste :
      // les deux se poursuivraient sans fin.
      if (!suitRef.current) {
        if (pts.length) m.fitBounds(Lf.latLngBounds(pts), { padding: [48, 48], maxZoom });
        else m.setView(vueVide.centre, vueVide.zoom);
      }
    }
  }, [prete, marqueurs, cadrage, maxZoom, vueVide, avecFiche]);

  // Éclairage de l'épingle vive : une classe posée sur l'élément du marqueur.
  useEffect(() => {
    for (const [id, mk] of marques.current) {
      const el = mk.getElement();
      if (el) el.classList.toggle("epingle--vive", id === vif);
    }
  }, [vif, marqueurs, prete]);

  // La fenêtre suit son épingle pendant le déplacement : une fenêtre restée
  // sur place pendant qu'on glisse la carte désignerait autre chose.
  useEffect(() => {
    const m = carte.current;
    if (!prete || !m || !montre) {
      setPos(null);
      return;
    }
    const mk = marques.current.get(montre);
    if (!mk) {
      setPos(null);
      return;
    }
    const situer = () => {
      const p = m.latLngToContainerPoint(mk.getLatLng());
      setPos({ x: p.x, y: p.y });
    };
    situer();
    m.on("move", situer);
    m.on("zoom", situer);
    return () => {
      m.off("move", situer);
      m.off("zoom", situer);
    };
  }, [prete, montre, marqueurs]);

  // Échap ferme la fenêtre épinglée, comme partout ailleurs.
  useEffect(() => {
    if (!fixe) return;
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFixe(null);
    };
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [fixe]);

  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    [],
  );

  const engager = () => {
    const m = carte.current;
    if (!m) return;
    m.dragging.enable();
    m.touchZoom.enable();
    setEngagee(true);
  };

  return (
    <div className={["carte7", className].filter(Boolean).join(" ")}>
      <div className="carte7__toile" ref={hote} />
      {surSuivi ? (
        <label className="carte7__suivi">
          <input type="checkbox" checked={suivi} onChange={(e) => surSuivi(e.target.checked)} />
          Rechercher quand je déplace la carte
        </label>
      ) : null}
      {tactile && !engagee ? (
        <button type="button" className="carte7__voile" onClick={engager}>
          <span>Appuyez pour déplacer la carte</span>
        </button>
      ) : null}
      {montre && ficheDe ? (
        <div
          className={`fcarte${tactile ? " fcarte--bas" : ""}`}
          style={tactile || !pos ? undefined : placer(pos, hote.current)}
          onMouseEnter={() => {
            if (minuteur.current) clearTimeout(minuteur.current);
          }}
          onMouseLeave={() => {
            if (!fixe) survoler(null);
          }}
        >
          <button
            type="button"
            className="fcarte__fermer"
            aria-label="Fermer"
            onClick={() => {
              setFixe(null);
              survoler(null);
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
            >
              <path d="M7 7l10 10M17 7L7 17" />
            </svg>
          </button>
          <div className="fcarte__corps">{ficheDe(montre)}</div>
        </div>
      ) : null}
      {legende ? <div className="carte7__legende">{legende}</div> : null}
    </div>
  );
}

/** Cotes de la fenêtre, relevées sur le kit de référence. */
const FICHE_L = 327;
const FICHE_H = 289;

/**
 * La fenêtre se pose au-dessus de l'épingle, et reste dans la carte.
 *
 * Au-dessus par défaut, parce que c'est là que le regard va. En dessous quand
 * il n'y a plus la place au-dessus : une fenêtre à moitié hors du cadre ne se
 * lit pas.
 */
function placer(pos: { x: number; y: number }, hote: HTMLElement | null) {
  const L = hote?.clientWidth ?? FICHE_L;
  const H = hote?.clientHeight ?? FICHE_H;
  const gauche = Math.max(8, Math.min(pos.x - FICHE_L / 2, L - FICHE_L - 8));
  const haut = pos.y - FICHE_H - 18;
  return {
    left: gauche,
    top: haut >= 8 ? haut : Math.max(8, Math.min(pos.y + 18, H - FICHE_H - 8)),
  };
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
