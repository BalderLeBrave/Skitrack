/**
 * La carte des écrans Comparer et Logements : Leaflet, tuiles OpenStreetMap,
 * des marqueurs dessinés en HTML par `epingle.ts` — la seule fabrique.
 *
 * `Carte.tsx` reste la carte des écrans de contrôle, avec ses fonds IGN et sa
 * surcouche de pistes. Celle-ci suit la maquette : fond OpenStreetMap, zoom en
 * bas à droite.
 *
 * Elle se manipule : molette, glisser, double-clic. Au doigt, en revanche, la
 * carte attend un premier appui avant de prendre le geste : sinon elle avale le
 * défilement de la page au milieu de la liste.
 *
 * **Deux fiches, deux comportements.** La fiche de survol est informative :
 * elle s'ouvre après un court délai, se ferme dès que le pointeur part, et ne
 * reçoit aucun clic. La fiche épinglée est une fenêtre : elle tient jusqu'à sa
 * croix ou Échap, porte ses actions, et survit au survol d'une autre pastille
 * comme au déplacement de la carte. Les deux peuvent donc coexister — et c'est
 * voulu : comparer deux stations d'un coup d'œil demande d'en tenir une pendant
 * qu'on lit l'autre.
 */

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { chargerLeaflet, pointeurGrossier, type Leaflet } from "@/lib/leaflet";
import type { Bornes } from "@/lib/carte";
import { EPINGLE, ETAGE, type Epingle } from "./epingle";

/**
 * La vue par défaut, **hors de la liste des paramètres**.
 *
 * Écrite en valeur par défaut de déstructuration, elle produisait un objet neuf
 * à chaque rendu ; figurant dans les dépendances de l'effet qui pose les
 * marqueurs, elle le faisait rejouer à chaque rendu. Les trois cent vingt
 * marqueurs étaient donc détruits et reconstruits à chaque frappe, ce qui
 * emportait au passage leur éclairage et le focus clavier posé dessus.
 */
const VUE_VIDE = { centre: [45.5, 3.5] as [number, number], zoom: 5 };

/** Ouverture de la fiche de survol : le temps qu'un pointeur qui traverse la
 *  carte ne fasse pas clignoter une fiche par pastille. */
const DELAI_OUVERTURE_MS = 120;
/** Fermeture : de quoi franchir les quelques pixels entre la pastille et la
 *  fiche sans qu'elle se dérobe. */
const DELAI_FERMETURE_MS = 80;

export type Marqueur = {
  id: string;
  lat: number;
  lon: number;
  /** Le marqueur, rendu par la fabrique `epingle.ts`. */
  epingle: Epingle;
  /** Nom accessible, annoncé par le lecteur d'écran et lu au focus clavier. */
  nom: string;
  zIndex?: number;
  /** Compte dans le cadrage. Vrai par défaut. */
  cadre?: boolean;
  /** Repère décoratif : ni fiche, ni survol, ni clic. */
  inerte?: boolean;
};

export function CarteEpingles({
  marqueurs,
  cadrage,
  maxZoom = 11,
  vueVide = VUE_VIDE,
  surClic,
  className,
  legende,
  surBornes,
  ficheDe,
  actionsDe,
  actif = null,
  surActif,
}: {
  marqueurs: readonly Marqueur[];
  /** Change quand il faut recadrer : la liste des identifiants, en pratique. */
  cadrage: string;
  maxZoom?: number;
  vueVide?: { centre: [number, number]; zoom: number };
  /** Clic sur un marqueur, **quand aucune fiche n'est fournie**. Avec `ficheDe`,
   *  le clic épingle la fiche : les deux ne se cumulent pas. */
  surClic?: (id: string) => void;
  className?: string;
  legende?: React.ReactNode;
  /** Bornes du cadre, rendues en fin de déplacement ou de zoom, jamais pendant. */
  surBornes?: (b: Bornes) => void;
  /** Le contenu de la fiche, fourni par l'écran qui sait ce que l'épingle
   *  désigne. Sans lui, pas de fiche. */
  ficheDe?: (id: string) => ReactNode;
  /** Les actions de la fiche **épinglée** seulement. La fiche de survol n'en
   *  porte aucune : elle ne reçoit pas les clics. */
  actionsDe?: (id: string) => ReactNode;
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
  const cadre = useRef("");
  const [prete, setPrete] = useState(false);
  // Une seule lecture du dispositif de pointage : elle était refaite pour
  // chaque marqueur, soit plusieurs centaines de `matchMedia` par recadrage.
  const [tactile, setTactile] = useState(false);
  const tactileRef = useRef(false);
  const [engagee, setEngagee] = useState(false);
  const [survol, setSurvol] = useState<string | null>(null);
  const [fixe, setFixe] = useState<string | null>(null);
  const ouverture = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fermeture = useRef<ReturnType<typeof setTimeout> | null>(null);
  const marques = useRef(new Map<string, Leaflet.Marker>());
  const rappelActif = useRef(surActif);
  rappelActif.current = surActif;
  // `ficheDe` est une fonction écrite en ligne par l'écran : elle change à
  // chaque rendu. Lue par une référence, elle ne fait plus reconstruire les
  // marqueurs à chaque frappe, ce qui effaçait leur éclairage.
  const ficheRef = useRef(ficheDe);
  ficheRef.current = ficheDe;
  const avecFiche = !!ficheDe;

  // L'épingle désignée : le survol d'abord — c'est le geste en cours —, puis la
  // fiche épinglée, puis la ligne survolée dans la liste.
  const vif = survol ?? fixe ?? actif;

  const annuler = () => {
    if (ouverture.current) clearTimeout(ouverture.current);
    if (fermeture.current) clearTimeout(fermeture.current);
  };

  const survoler = useCallback((id: string | null, immediat = false) => {
    annuler();
    if (id == null) {
      fermeture.current = setTimeout(() => {
        setSurvol(null);
        rappelActif.current?.(null);
      }, DELAI_FERMETURE_MS);
      return;
    }
    const poser = () => {
      setSurvol(id);
      rappelActif.current?.(id);
    };
    if (immediat) return poser();
    ouverture.current = setTimeout(poser, DELAI_OUVERTURE_MS);
  }, []);

  useEffect(() => {
    let annule = false;
    let demonter: (() => void) | null = null;
    void chargerLeaflet()
      .then((Lf) => {
        if (annule || !hote.current) return;
        lib.current = Lf;
        // La molette zoome : c'est une carte de résultats, pas une vignette.
        const doigt = pointeurGrossier();
        setTactile(doigt);
        tactileRef.current = doigt;
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
        // à chaque image et la liste clignoterait sous les doigts. Un dernier
        // filet de 120 ms absorbe la rafale de `moveend` que produit l'inertie.
        let attente: ReturnType<typeof setTimeout> | null = null;
        const emettre = () => {
          if (attente) clearTimeout(attente);
          attente = setTimeout(() => {
            const b = m.getBounds();
            rappelBornes.current?.({
              sud: b.getSouth(),
              ouest: b.getWest(),
              nord: b.getNorth(),
              est: b.getEast(),
            });
          }, 120);
        };
        m.on("moveend", emettre);
        m.on("zoomend", emettre);
        m.setView(vueVide.centre, vueVide.zoom);
        // Le redimensionnement du panneau latéral change le cadre visible : la
        // liste et le compteur doivent le savoir, pas seulement la carte.
        const redim = new ResizeObserver(() => {
          m.invalidateSize({ pan: false });
          emettre();
        });
        redim.observe(hote.current);
        carte.current = m;
        setPrete(true);
        demonter = () => {
          if (attente) clearTimeout(attente);
          redim.disconnect();
          couche.current = null;
          m.remove();
          carte.current = null;
        };
      })
      // Sans ce filet, un chargement différé en échec — réseau coupé, fichiers
      // remplacés par un déploiement — partait en rejet non géré jusqu'à la
      // fenêtre, et la carte restait blanche sans rien dire.
      .catch((e: unknown) => {
        console.warn("[carte] Leaflet n'a pas pu être chargé", e);
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
        icon: Lf.divIcon({
          className: "epingle-hote",
          iconSize: mk.epingle.taille,
          iconAnchor: mk.epingle.ancre,
          html: mk.epingle.html,
        }),
        zIndexOffset: mk.zIndex ?? ETAGE.normale,
        keyboard: !mk.inerte,
        // Le premier plan au survol se règle côté Leaflet : un `z-index` CSS
        // posé sur l'enfant reste enfermé dans le contexte d'empilement que
        // Leaflet écrit en ligne sur le marqueur.
        riseOnHover: !mk.inerte,
        riseOffset: ETAGE.designee,
      });
      if (!mk.inerte)
        marker.on("click", () => {
          // Avec une fiche, le clic épingle ; sans fiche, il remonte à l'écran.
          // Les deux chemins ne coexistent jamais.
          if (ficheRef.current) setFixe(mk.id);
          else rappel.current?.(mk.id);
        });
      if (avecFiche && !mk.inerte && !tactileRef.current) {
        marker.on("mouseover", () => survoler(mk.id));
        marker.on("mouseout", () => survoler(null));
      }
      marker.addTo(c);
      const el = marker.getElement();
      if (el) {
        // Leaflet pose `role="button"` et `tabindex` ; le nom accessible, non.
        el.setAttribute("aria-label", mk.nom);
        if (!mk.inerte && avecFiche) {
          // 3.3 : le focus clavier montre la même fiche que le survol.
          el.addEventListener("focus", () => survoler(mk.id, true));
          el.addEventListener("blur", () => survoler(null));
        }
        if (mk.inerte) el.removeAttribute("tabindex");
      }
      marques.current.set(mk.id, marker);
      if (mk.cadre !== false) pts.push([mk.lat, mk.lon]);
    }
    // Le recadrage suit la clé `cadrage`, que l'écran calcule sur le **résultat
    // des filtres** et non sur ce qui tombe dans le cadre : sans quoi recadrer
    // changerait la liste, qui changerait la clé, qui recadrerait à nouveau.
    if (cadre.current !== cadrage) {
      cadre.current = cadrage;
      if (pts.length) m.fitBounds(Lf.latLngBounds(pts), { padding: [48, 48], maxZoom });
      else m.setView(vueVide.centre, vueVide.zoom);
    }
  }, [prete, marqueurs, cadrage, maxZoom, vueVide, avecFiche, survoler]);

  // Éclairage des épingles : une classe posée sur l'élément du marqueur.
  useEffect(() => {
    for (const [id, mk] of marques.current) {
      const el = mk.getElement();
      if (!el) continue;
      el.classList.toggle("epingle-hote--vive", id === vif);
      el.classList.toggle("epingle-hote--fixee", id === fixe);
    }
  }, [vif, fixe, marqueurs, prete]);

  // Échap ferme la fiche épinglée. C'est, avec sa croix, la seule sortie : ni
  // le clic sur le fond de carte, ni le déplacement, ni le survol d'une autre
  // pastille ne la referment.
  useEffect(() => {
    if (!fixe) return;
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFixe(null);
    };
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [fixe]);

  // Un marqueur disparu du jeu emporte la fiche qui le désignait — et le
  // minuteur qui s'apprêtait à l'ouvrir, sans quoi la fiche s'ouvrait sur une
  // épingle absente, faute de position, à l'écart de l'écran.
  useEffect(() => {
    const ids = new Set(marqueurs.map((m) => m.id));
    setFixe((f) => (f && !ids.has(f) ? null : f));
    setSurvol((s) => {
      if (s && !ids.has(s)) {
        annuler();
        rappelActif.current?.(null);
        return null;
      }
      return s;
    });
  }, [marqueurs]);

  useEffect(() => () => annuler(), []);

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
      {tactile && !engagee ? (
        <button type="button" className="carte7__voile" onClick={engager}>
          <span>Appuyez pour déplacer la carte</span>
        </button>
      ) : null}

      {/* La fiche de survol : informative, jamais cliquable. */}
      {survol && survol !== fixe && ficheDe ? (
        <FicheCarte
          key={`survol-${survol}`}
          id={survol}
          carte={carte.current}
          marque={marques.current.get(survol) ?? null}
          hote={hote.current}
          tactile={tactile}
          epinglee={false}
        >
          {ficheDe(survol)}
        </FicheCarte>
      ) : null}

      {/* La fiche épinglée : interactive, au-dessus de tout le reste. */}
      {fixe && ficheDe ? (
        <FicheCarte
          key={`fixe-${fixe}`}
          id={fixe}
          carte={carte.current}
          marque={marques.current.get(fixe) ?? null}
          hote={hote.current}
          tactile={tactile}
          epinglee
          surFermer={() => setFixe(null)}
          actions={actionsDe?.(fixe)}
        >
          {ficheDe(fixe)}
        </FicheCarte>
      ) : null}

      {legende ? <div className="carte7__legende">{legende}</div> : null}
    </div>
  );
}

/**
 * Une fiche posée sur la carte, ancrée à son épingle.
 *
 * Elle se mesure au lieu de se deviner : les cotes étaient écrites en dur
 * (327 × 289) alors que la feuille laisse la hauteur varier, si bien qu'une
 * fiche courte flottait loin de son point et qu'une fiche longue dépassait du
 * cadre. Elle bascule de côté **et** de haut en bas quand la place manque, et
 * ne sort jamais du cadre.
 */
function FicheCarte({
  id,
  carte,
  marque,
  hote,
  tactile,
  epinglee,
  surFermer,
  actions,
  children,
}: {
  id: string;
  carte: Leaflet.Map | null;
  marque: Leaflet.Marker | null;
  hote: HTMLElement | null;
  tactile: boolean;
  epinglee: boolean;
  surFermer?: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!carte || !marque || tactile) return;
    const situer = () => {
      const el = boite.current;
      if (!el) return;
      const p = carte.latLngToContainerPoint(marque.getLatLng());
      const L = hote?.clientWidth ?? 0;
      const H = hote?.clientHeight ?? 0;
      const l = el.offsetWidth;
      const h = el.offsetHeight;
      const marge = 8;
      const demi = EPINGLE.taille / 2 + 10;
      // Au-dessus par défaut : c'est là que le regard va. En dessous quand la
      // place manque, et sans jamais sortir du cadre.
      let top = p.y - h - demi;
      if (top < marge) top = Math.min(p.y + demi, Math.max(marge, H - h - marge));
      // Centrée, puis basculée du côté où il reste de la place.
      let left = p.x - l / 2;
      if (left < marge) left = marge;
      if (left + l > L - marge) left = Math.max(marge, L - l - marge);
      setPos({ left, top });
    };
    situer();
    // La fiche suit son épingle pendant le déplacement : restée sur place, elle
    // désignerait autre chose.
    carte.on("move", situer);
    carte.on("zoom", situer);
    const ro = new ResizeObserver(situer);
    if (boite.current) ro.observe(boite.current);
    return () => {
      carte.off("move", situer);
      carte.off("zoom", situer);
      ro.disconnect();
    };
  }, [carte, marque, hote, tactile, id]);

  return (
    <div
      ref={boite}
      className={`fcarte${tactile ? " fcarte--bas" : ""}${epinglee ? " fcarte--epinglee" : ""}`}
      style={tactile ? undefined : { left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      role={epinglee ? "dialog" : undefined}
      aria-live={epinglee ? undefined : "polite"}
    >
      {epinglee && surFermer ? (
        <button type="button" className="fcarte__fermer" aria-label="Fermer" onClick={surFermer}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M7 7l10 10M17 7L7 17" />
          </svg>
        </button>
      ) : null}
      <div className="fcarte__corps">{children}</div>
      {epinglee && actions ? <div className="fcarte__actions">{actions}</div> : null}
    </div>
  );
}
