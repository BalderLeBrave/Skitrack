/** Logements – maquette v7 (`SKITRACK v7 - App.dc.html`, bloc LOGEMENTS).
 *
 *  Le bandeau de la station retenue, les règles toujours appliquées, la barre
 *  des filtres et son panneau, puis deux colonnes : les cartes d'annonce et
 *  la carte aux pastilles de prix. Un volet détaille l'annonce ouverte ; un
 *  pied fixe totalise le logement retenu et les forfaits.
 *
 *  Données : annonces relevées du dépôt (`listingsForStay`) et recherche en
 *  direct (`searchStay`), telles que la route existante les chargeait – le
 *  code de collecte n'est pas touché. « Relancer le relevé » relance cette
 *  recherche. */

import { createFileRoute } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { GalerieAnnonce } from "@/components/LodgeSheet";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { CarteEpingles } from "@/components/v7/CarteEpingles";
import { epinglePrix, epingleRepere, ETAGE } from "@/components/v7/epingle";
import { useFermeturePanneau } from "@/components/v7/fermeture";
import { partagerParBornes, sansPositionLabel, type Bornes } from "@/lib/carte";
import { OngletsStation } from "@/components/v7/OngletsStation";
import { Vide } from "@/components/v7/Vide";
import { useForfait } from "@/components/v7/useForfait";
import { listingsForStay, type Listing } from "@/lib/listings";
import { eleKey, listingEleM, useElevations } from "@/lib/elevations";
import { getListingElevations } from "@/lib/snow/api";
import { completudeOf, galerieOf, trouLbl, trousPhrase } from "@/lib/stay/completude";
import { enrichirListing } from "@/lib/stay/enrichir";
import {
  clampRayonKm,
  distFiltrableM,
  DIST_PALIERS_M,
  droppedLabel,
  geoReasonFor,
  gpsPrecis,
  RAYON_DEFAUT_KM,
  RAYON_MAX_KM,
  RAYON_MIN_KM,
  type DropReason,
  type FilterOutcome,
  type FilterSubject,
} from "@/lib/stay/lodgingFilter";
import {
  datesLbl,
  eur,
  eurCents,
  fmt,
  groupLbl,
  stationPhoto,
  stationPhotoAbsence,
  useParcours,
  useSejour,
} from "@/lib/parcours";
import { searchStay, completerReleve, PAUSE_DELAI, SEARCH_PART_MS, DEVIS_MS, TARIF_MS } from "@/lib/searchStay";
import { stationById, type Station } from "@/lib/stations";
import { useStay } from "@/lib/stay";
import { availabilityLabel, availabilityOf } from "@/lib/stay/availability";
import { estPauseApi, estTimeout, withDeadline } from "@/lib/stay/deadline";
import { conserverDevisGites, estOffreGitesVerifiee } from "@/lib/stay/tarif";
import { estFicheGitesIntrouvable } from "@/lib/stay/ficheGites";
import { altLbl, aStation, bedLbl, capLbl, crumb, distanceOf, firmOf, kmLbl, liftsLbl, mediaTon, passLbl, prixLbl, prixPersLbl, prixPin } from "@/lib/v7";

export const Route = createFileRoute("/logements")({ component: Logements });

type LodgeSort = "pp" | "total" | "cap" | "dist" | "trous";

/** `lf` de la maquette : les filtres facultatifs de **cet écran**.
 *
 *  Le budget n'y est plus : c'est un critère de recherche, au même titre que
 *  les dates et les voyageurs. Il vit dans `useParcours.filters.budget`, d'où
 *  il survit à la navigation et s'écrit dans l'adresse ; les réglages
 *  ci-dessous, eux, ne valent que pour la liste des annonces. */
type LF = {
  pp: number;
  cap: number;
  rooms: number;
  dist: number;
  src: Record<string, boolean>;
  /** Rayon de recherche autour de la station, en km. Toujours appliqué. */
  rayon: number;
  measured: boolean;
  link: boolean;
  photo: boolean;
  firm: boolean;
  pos: boolean;
  full: boolean;
  holes: boolean;
};
const LF0: LF = {
  pp: 0,
  cap: 0,
  rooms: 0,
  dist: 0,
  src: {},
  rayon: RAYON_DEFAUT_KM,
  measured: false,
  link: false,
  photo: false,
  firm: false,
  pos: false,
  full: false,
  holes: false,
};

/** Le budget est à part : il est lu et écrit sur le magasin partagé. */
const BUDGET = { label: "Total du séjour, au plus", max: 6000, step: 250, unit: "€", sign: "≤ " };

const RANGES: { k: "pp" | "cap" | "rooms" | "dist"; label: string; max: number; step: number; unit: string; sign: string }[] = [
  { k: "pp", label: "Par personne, au plus", max: 800, step: 25, unit: "€", sign: "≤ " },
  { k: "cap", label: "Capacité annoncée, au moins", max: 16, step: 1, unit: "pers.", sign: "≥ " },
  { k: "rooms", label: "Chambres annoncées, au moins", max: 7, step: 1, unit: "ch.", sign: "≥ " },
  { k: "dist", label: "Distance, au plus", max: 2000, step: 100, unit: "m", sign: "≤ " },
];

function palierDistLbl(m: number): string {
  if (m <= 200) return "Pied des pistes";
  if (m >= 1000 && m % 1000 === 0) return `≤ ${m / 1000} km`;
  return `≤ ${m} m`;
}

/** Recherche en direct, telle que la route précédente la lançait. */
function useLiveSearch(station: Station | undefined, frozen: Listing[]) {
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const checkIn = useStay((s) => s.checkIn);
  const checkOut = useStay((s) => s.checkOut);
  const guests = useStay((s) => s.guests);
  const bedrooms = useStay((s) => s.bedrooms);
  const searchNonce = useStay((s) => s.searchNonce);
  const mergeLive = useStay((s) => s.mergeLive);
  const setSearching = useStay((s) => s.setSearching);
  const setLive = useStay((s) => s.setLive);

  useEffect(() => {
    if (!station) return;
    let cancelled = false;
    let pending = 4;
    setSearching(true);
    setLive(null, [], true);
    const payload = {
      // L'identifiant vient de la station qu'on affiche, pas du magasin de
      // séjour. Les deux devraient dire la même chose et le disent presque
      // toujours ; quand ils divergent, le serveur mesurait l'accès depuis une
      // autre station — vu en recette : une recherche « Les 2 Alpes » rendue
      // avec le repère de Brides les Bains, à 60 km, donc 92 annonces sur 96
      // classées « autre domaine ».
      stationId: station.id,
      stationName: station.name,
      lat: station.lat,
      lon: station.lon,
      checkIn,
      checkOut,
      guests,
      bedrooms,
    };
    const finish = () => {
      pending -= 1;
      if (!cancelled && pending <= 0) setSearching(false);
    };
    const run = (part: "airbnb" | "gites" | "cozy" | "centrales") => {
      const wait =
        part === "gites"
          ? SEARCH_PART_MS + DEVIS_MS + 6_000
          : part === "centrales"
            ? SEARCH_PART_MS + TARIF_MS + 6_000
            : SEARCH_PART_MS + 6_000;
      void withDeadline(searchStay({ data: { ...payload, part } }), wait, part)
        .then((res) => {
          if (cancelled) return;
          if (res.listings.length > 0) {
            mergeLive(res.listings, res.sources);
            return;
          }
          const dump = frozenRef.current;
          const fallback =
            part === "airbnb"
              ? dump.filter((l) => l.source === "Airbnb")
              : part === "gites"
                ? dump.filter((l) => l.source === "Gîtes de France")
                : part === "centrales"
                  ? dump.filter((l) => l.source === "Centrale")
                  : dump.filter((l) => l.source === "Abritel" || l.source === "Booking");
          if (fallback.length) mergeLive(fallback, res.sources);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const raw = err instanceof Error ? err.message : String(err);
          const error = estTimeout(err) || estPauseApi(raw) ? PAUSE_DELAI : raw;
          if (part === "airbnb") {
            mergeLive(
              frozenRef.current.filter((l) => l.source === "Airbnb"),
              [{ source: "Airbnb", ok: false, count: 0, ms: 0, error }],
            );
          } else if (part === "gites") {
            mergeLive(
              frozenRef.current.filter((l) => l.source === "Gîtes de France"),
              [{ source: "Gîtes de France", ok: false, count: 0, ms: 0, error }],
            );
          } else if (part === "centrales") {
            mergeLive(
              frozenRef.current.filter((l) => l.source === "Centrale"),
              [{ source: "Centrale", ok: false, count: 0, ms: 0, error }],
            );
          } else {
            mergeLive(
              frozenRef.current.filter((l) => l.source === "Abritel" || l.source === "Booking"),
              [
                { source: "Abritel", ok: false, count: 0, ms: 0, error },
                { source: "Booking", ok: false, count: 0, ms: 0, error },
              ],
            );
          }
        })
        .finally(finish);
    };
    run("airbnb");
    run("gites");
    run("cozy");
    // La centrale officielle de la station. Elle part en même temps que les
    // plateformes et n'attend rien d'elles : une centrale lente ne doit pas
    // retarder la liste, et une centrale muette ne doit pas la vider.
    run("centrales");
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station?.id, checkIn, checkOut, guests, bedrooms, searchNonce]);
}

/** GPS Gîtes, devis ITEA daté, et lien Airbnb du relevé figé, sans attendre le relevé en direct. */
function useDumpComplet(
  stationId: string | undefined,
  checkIn: string,
  checkOut: string,
  guests: number,
) {
  const [filled, setFilled] = useState<Listing[] | null>(null);
  useEffect(() => {
    if (!stationId) return;
    let cancelled = false;
    setFilled(null);
    void completerReleve({ data: { stationId, checkIn, checkOut, guests } })
      .then((rows) => {
        if (!cancelled) setFilled(rows);
      })
      .catch(() => {
        /* le relevé figé reste, les trous restent nommés */
      });
    return () => {
      cancelled = true;
    };
  }, [stationId, checkIn, checkOut, guests]);
  return filled;
}

type Pred = { id: string; label: string; fn: (l: Listing) => boolean; fixed?: boolean; remove?: () => void };

/** Les motifs du module, tous à zéro : l'écran nomme les siens par `extra`.
 *  `droppedLabel` additionne les deux, on ne lui donne donc que les seconds. */
const AUCUN_ECART: FilterOutcome<FilterSubject>["dropped"] = {
  total: 0,
  byReason: {
    groupe: 0,
    "autre-domaine": 0,
    "hors-zone": 0,
    capacite: 0,
    "capacite-muette": 0,
    prix: 0,
    source: 0,
    disponibilite: 0,
  } as Record<DropReason, number>,
  rows: [],
};

/**
 * Une annonce dans la liste.
 *
 * Défini dans le corps du rendu, il changeait d'identité à chaque rendu : React
 * démontait puis remontait toute la liste, les photos repartaient au
 * chargement et le focus tombait. Ce qu'il lisait par fermeture arrive
 * désormais en propriétés, et `memo` lui évite de se redessiner quand rien de
 * ce qui le concerne n'a bougé.
 */
const CarteLogement = memo(function CarteLogement({
  l,
  retenu,
  vue,
  vif,
  stay,
  trav,
  nights,
  ouvrir,
  retenir,
  designer,
}: {
  l: Listing;
  retenu: boolean;
  vue: boolean;
  vif: boolean;
  stay: { checkIn: string; checkOut: string };
  trav: number;
  nights: number;
  ouvrir: (id: string) => void;
  retenir: (id: string) => void;
  designer: (id: string | null) => void;
}) {
  const isKept = retenu;
  const seen = vue && !isKept;
  const d = distanceOf(l);
  const firm = firmOf(l, stay);
  const complet = completudeOf(l);
  const pers = prixPersLbl(l, trav);
  return (
    <article
      className={`lodge7${isKept ? " lodge7--kept" : ""}${vif ? " lodge7--vif" : ""}`}
      onClick={() => ouvrir(l.id)}
      onMouseEnter={() => designer(l.id)}
      onMouseLeave={() => designer(null)}
      data-l={l.id}
    >
      <div className={`lodge7__media lodge7__media--${mediaTon(l)}`}>
        {l.photo ? (
          <ImageSlot shape="rect" id={`v7app-l-${l.id}`} placeholder="Photo de l'annonce" className="lodge7__slot" src={l.photo} />
        ) : (
          <span className="lodge7__sansphoto">Pas de photo dans l'annonce {l.source}</span>
        )}
        <span className="lodge7__source">{l.source}</span>
        {l.priceIndicative ? <span className="lodge7__indic">à partir de</span> : null}
        {isKept ? <span className="lodge7__retenu">Retenu</span> : null}
        {seen ? <span className="lodge7__vue">déjà vue</span> : null}
      </div>
      <div className="lodge7__corps">
        <strong className="lodge7__titre">{l.title}</strong>
        <div className="lodge7__meta">
          <span className={l.guests == null ? "absent" : undefined}>{capLbl(l)}</span>
          <span>{bedLbl(l)}</span>
        </div>
        {complet.trous.length ? (
          <span className="lodge7__trous">{complet.trous.map(trouLbl).join(" · ")}</span>
        ) : null}
        <span className={`lodge7__dist${d.kind === "measured" ? "" : " absent"}`}>
          <Icon name="epingle" taille={13} />
          {d.text}
        </span>
        <div className="lodge7__pied">
          <div className={`lodge7__prix${l.total > 0 ? "" : " lodge7__prix--muet"}`}>
            <b>{prixLbl(l)}</b>
            <span>
              {nights} nuits{pers ? ` · ${pers} / pers.` : ""}
            </span>
            <span className={`lodge7__ferme${firm ? " lodge7__ferme--oui" : ""}`}>
              <i />
              {firm ? "Prix relevé aux dates" : "Disponibilité non confirmée"}
            </span>
          </div>
          <button
            type="button"
            className={`lodge7__retenir${isKept ? " lodge7__retenir--on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              retenir(l.id);
            }}
          >
            {isKept ? "Retenu" : "Retenir"}
          </button>
        </div>
      </div>
    </article>
  );
});

/**
 * La garde, et elle seule.
 *
 * L'écran vivait dans un composant unique dont la sortie anticipée « pas de
 * station » précédait des `useMemo` : le nombre de crochets changeait d'un
 * rendu à l'autre, ce que React interdit. Séparer la garde du corps rend les
 * crochets inconditionnels sans déplacer une ligne de rendu.
 */
function Logements() {
  const go = useGo();
  const P = useParcours();
  const s = P.stationId ? stationById(P.stationId) : undefined;

  // Sans station retenue : la maquette renvoie vers Comparer avec le bandeau.
  // L'état est relu dans le magasin : au premier rendu du navigateur, le
  // sélecteur sert encore l'instantané du serveur, où rien n'est retenu.
  useEffect(() => {
    if (!useParcours.getState().stationId) {
      P.say("Retenez d’abord une station.");
      void go("compare");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.id]);

  if (!s) {
    return (
      <Coquille>
        <main className="v7main" id="s-lodging" data-screen-label="2 Logements" />
      </Coquille>
    );
  }
  return <LogementsStation s={s} />;
}

function LogementsStation({ s }: { s: Station }) {
  const go = useGo();
  const P = useParcours();
  // Le panneau « Votre séjour » de la coquille, ouvert depuis la pilule du
  // bandeau : la barre du haut n'en porte plus sur cet écran.
  const stayOpen = P.stayOpen;
  const setStayOpen = P.setStayOpen;
  const { checkIn, checkOut, trav, rooms, nights } = useSejour();
  const forfait = useForfait(s);
  const liveListings = useStay((x) => x.liveListings);
  const liveSources = useStay((x) => x.liveSources);
  const searching = useStay((x) => x.searching);
  const setStay = useStay((x) => x.setStay);
  // Le relevé entier de la station : la capacité s'applique plus bas, en
  // toutes lettres, pour que l'état vide puisse dire ce qu'elle a écarté.
  const frozen = useMemo(
    () => (P.stationId ? listingsForStay(P.stationId, 1, 0) : []).map(enrichirListing),
    [P.stationId],
  );
  const dumpGps = useDumpComplet(P.stationId ?? undefined, checkIn, checkOut, trav);
  useLiveSearch(s, dumpGps ?? frozen);
  const raw = useMemo(() => {
    const dump = dumpGps ?? frozen;
    let rows = dump;
    if (liveListings != null) {
      const reported = new Set(liveSources.map((x) => x.source));
      rows = [...dump.filter((l) => !reported.has(l.source)), ...liveListings];
      if (reported.has("Gîtes de France")) rows = conserverDevisGites(dump, rows);
    }
    return rows.map(enrichirListing).filter((l) => !estFicheGitesIntrouvable(l) && estOffreGitesVerifiee(l));
  }, [liveListings, liveSources, frozen, dumpGps]);

  const [lf, setLf] = useState<LF>(LF0);
  const [lsort, setLsort] = useState<LodgeSort>("pp");
  const [lfOpen, setLfOpen] = useState(false);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [photoI, setPhotoI] = useState(0);
  // Le cadre de la carte, et s'il compte. Décoché par défaut : sinon un simple
  // coup d'œil ailleurs efface la liste qu'on venait de constituer.
  // Le cadre visible compte toujours : liste, compteur et pastilles rendues
  // disent la même chose. Même correction que sur Comparer.
  const [bornes, setBornes] = useState<Bornes | null>(null);
  // Un compteur de recadrages : il entre dans la clé `cadrage`, donc le lien
  // « Revoir les N annonces » oublie le cadre **et** redemande à la carte de se
  // poser sur l'ensemble. Sans lui, la liste revenait mais la carte restait où
  // l'utilisateur l'avait laissée. Même mécanique que sur Comparer.
  const [recadrages, setRecadrages] = useState(0);
  const revoirTout = () => {
    setBornes(null);
    setRecadrages((n) => n + 1);
  };
  // L'annonce que la carte désigne, et que la liste éclaire en retour.
  const [actifCarte, setActifCarte] = useState<string | null>(null);
  // Le bandeau figé, et l'ancre du panneau Filtres qu'il porte : le panneau
  // s'ouvre sous la barre quel que soit le défilement, et un clic dehors le
  // ferme. Posé plus bas, il restait accroché au haut du document.
  const bandeau = useRef<HTMLDivElement>(null);
  const ancreLf = useRef<HTMLDivElement>(null);
  useFermeturePanneau(lfOpen, () => setLfOpen(false), ancreLf);
  // La hauteur du bandeau, mesurée et publiée en variable CSS : la carte se
  // cale exactement dessous. Une valeur écrite en dur se décalait dès que les
  // jetons actifs passaient à la ligne, et la carte débordait de l'écran.
  useEffect(() => {
    const el = bandeau.current;
    // Sur le `main` et non sur le bandeau : une variable CSS descend, elle ne
    // traverse pas vers un frère, et la carte est un frère du bandeau.
    const cible = el?.closest("main");
    if (!el || !cible) return;
    const mesurer = () =>
      cible.style.setProperty("--bandeau-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const patchLf = (p: Partial<LF>) => setLf((x) => ({ ...x, ...p }));
  // Le budget du séjour : critère partagé, pas un réglage de cet écran.
  const budget = P.filters.budget;
  /** « Tout réinitialiser » relâche les réglages de l'écran **et** le budget,
   *  qui n'est plus rangé avec eux. */
  const reinitialiser = () => {
    setLf(LF0);
    P.setFilters({ budget: 0 });
  };

  const stay = useMemo(() => ({ checkIn, checkOut }), [checkIn, checkOut]);
  useEffect(() => {
    setPhotoI(0);
  }, [sheetId]);

  useEffect(() => {
    const byKey = useElevations.getState().byKey;
    const points: { lat: number; lon: number }[] = [];
    const seen = new Set<string>();
    for (const l of raw) {
      if (l.lat == null || l.lon == null) continue;
      const k = eleKey(l.lat, l.lon);
      if (seen.has(k) || listingEleM(byKey, l.lat, l.lon) !== undefined) continue;
      seen.add(k);
      points.push({ lat: l.lat, lon: l.lon });
      if (points.length >= 160) break;
    }
    if (!points.length) return;
    let cancelled = false;
    void getListingElevations({ data: { points } })
      .then((rows) => {
        if (!cancelled) useElevations.getState().put(rows);
      })
      .catch(() => {
        /* modèle injoignable : les fiches diront « non mesurée » */
      });
    return () => {
      cancelled = true;
    };
  }, [raw]);

  const relancer = () => setStay({ searchNonce: Date.now() });
  const importer = () => P.say("Import d’annonce par son lien : hors de cet écran pour l’instant.");

  /* ---------- Prédicats ---------- */
  const lp: Pred[] = [];
  lp.push({ id: "cap", label: `Capacité ≥ ${trav}`, fn: (l) => l.guests == null || l.guests >= trav, fixed: true });
  if (rooms)
    lp.push({ id: "rooms", label: `Chambres ≥ ${rooms}`, fn: (l) => l.bedrooms == null || l.bedrooms >= rooms, fixed: true });
  // La zone est toujours appliquée : une recherche de logements a toujours un
  // périmètre. Son rayon se règle dans le panneau, il ne se retire pas.
  lp.push({
    id: "zone",
    label: `Dans ${lf.rayon} km`,
    fn: (l) => geoReasonFor(l, lf.rayon, s.dept) == null,
    fixed: true,
  });
  lp.push({
    id: "gps",
    label: "Position GPS",
    fn: (l) => gpsPrecis(l),
    fixed: true,
  });
  lp.push({
    id: "dispo",
    label: "Disponible à ces dates",
    fn: (l) => firmOf(l, stay),
    fixed: true,
  });
  // Règle 2 de `lodgingFilter` : l'absence de tarif dispense des filtres de
  // prix, pas des autres. `total` vaut 0 quand la source n'a pas publié de
  // prix, et `0 <= budget` faisait passer ces annonces pour gratuites — en tête
  // de liste, et dans tous les budgets.
  const sansPrix = (l: Listing) => !(l.total > 0);
  if (budget)
    lp.push({
      id: "budget",
      label: `Total ≤ ${fmt(budget)} €`,
      fn: (l) => sansPrix(l) || l.total <= budget,
      remove: () => P.setFilters({ budget: 0 }),
    });
  if (lf.pp)
    lp.push({
      id: "pp",
      label: `≤ ${fmt(lf.pp)} € / pers.`,
      fn: (l) => sansPrix(l) || l.total / trav <= lf.pp,
      remove: () => patchLf({ pp: 0 }),
    });
  if (lf.cap) lp.push({ id: "lcap", label: `Capacité annoncée ≥ ${lf.cap}`, fn: (l) => l.guests != null && l.guests >= lf.cap, remove: () => patchLf({ cap: 0 }) });
  if (lf.rooms) lp.push({ id: "lrooms", label: `Chambres annoncées ≥ ${lf.rooms}`, fn: (l) => l.bedrooms != null && l.bedrooms >= lf.rooms, remove: () => patchLf({ rooms: 0 }) });
  if (lf.dist)
    lp.push({
      id: "dist",
      label: palierDistLbl(lf.dist),
      fn: (l) => {
        const m = distFiltrableM(l);
        return m != null && m <= lf.dist;
      },
      remove: () => patchLf({ dist: 0 }),
    });
  const srcOn = Object.keys(lf.src).filter((k) => lf.src[k]);
  if (srcOn.length) lp.push({ id: "src", label: srcOn.join(" · "), fn: (l) => srcOn.includes(l.source), remove: () => patchLf({ src: {} }) });
  if (lf.measured) lp.push({ id: "measured", label: "Distance mesurée", fn: (l) => distanceOf(l).kind === "measured", remove: () => patchLf({ measured: false }) });
  if (lf.link) lp.push({ id: "link", label: "Lien de réservation", fn: (l) => !!l.url, remove: () => patchLf({ link: false }) });
  if (lf.photo) lp.push({ id: "photo", label: "Avec photo", fn: (l) => !!l.photo, remove: () => patchLf({ photo: false }) });
  if (lf.firm) lp.push({ id: "firm", label: "Prix relevé aux dates", fn: (l) => firmOf(l, stay), remove: () => patchLf({ firm: false }) });
  if (lf.pos) lp.push({ id: "pos", label: "Position connue", fn: (l) => l.lat != null, remove: () => patchLf({ pos: false }) });
  if (lf.full)
    lp.push({
      id: "full",
      label: "Fiche complète",
      fn: (l) => completudeOf(l).ok,
      remove: () => patchLf({ full: false }),
    });
  if (lf.holes)
    lp.push({
      id: "holes",
      label: "Incomplètes",
      fn: (l) => !completudeOf(l).ok,
      remove: () => patchLf({ holes: false }),
    });

  const lapply = (ps: Pred[]) => raw.filter((l) => ps.every((p) => p.fn(l)));
  /** Ce que la source n'a pas publié se range **après** ce qu'elle a publié,
   *  jamais au rang de zéro : `?? 0` classait une capacité non annoncée comme
   *  la plus petite de toutes, et un prix non annoncé comme le moins cher. */
  const apres = (v: number | null | undefined) => (v == null || !(v > 0) ? null : v);
  const parNombre = (a: number | null, b: number | null, desc = false) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return desc ? b - a : a - b;
  };
  const tri: Record<LodgeSort, (a: Listing, b: Listing) => number> = {
    pp: (a, b) => parNombre(apres(a.total), apres(b.total)),
    total: (a, b) => parNombre(apres(a.total), apres(b.total)),
    cap: (a, b) => parNombre(a.guests ?? null, b.guests ?? null, true),
    dist: (a, b) => parNombre(distFiltrableM(a), distFiltrableM(b)),
    trous: (a, b) => {
      const d = completudeOf(b).trous.length - completudeOf(a).trous.length;
      return d !== 0 ? d : parNombre(apres(a.total), apres(b.total));
    },
  };
  const lvis = lapply(lp).sort(tri[lsort]);
  // Ce que la carte montre. Les annonces sans coordonnées restent : elles n'ont
  // pas de cadre, la carte ne peut ni les montrer ni les cacher.
  const parCadre = partagerParBornes(lvis, bornes);
  const affichees = parCadre.visibles;
  /** Les annonces réellement posées sur la carte : la légende les compte. */
  const positionnees = affichees.filter((l) => l.lat != null);
  const sansPos = sansPositionLabel(parCadre.sansPosition.length);
  const lfree = lp.filter((p) => !p.fixed);
  // Ce que la zone seule a écarté, nommé par motif : une liste courte sans
  // explication se lit comme un relevé pauvre, pas comme un filtre qui a joué.
  const horsZone = raw.filter((l) => geoReasonFor(l, lf.rayon, s.dept) === "hors-zone").length;
  const autreDomaine = raw.filter((l) => geoReasonFor(l, lf.rayon, s.dept) === "autre-domaine").length;
  const zoneLbl = [
    horsZone ? `${horsZone} hors de la zone` : null,
    autreDomaine ? `${autreDomaine} sur ${autreDomaine > 1 ? "d’autres domaines" : "un autre domaine"}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  // Ce que la centrale officielle a répondu quand elle n'a rien rendu. Le
  // serveur envoie la phrase toute faite : station sans centrale relevée,
  // centrale sans connecteur, connecteur qui sait déjà qu'il ne peut pas, ou
  // appel échoué. Un zéro sans motif se lirait comme « rien de disponible ».
  const centrale = liveSources.find((x) => x.source === "Centrale");
  const centraleLbl =
    centrale && centrale.count === 0 && !estPauseApi(centrale.error) ? (centrale.error ?? null) : null;
  const pauses = liveSources.filter((x) => estPauseApi(x.error));
  const kept = raw.find((l) => l.id === P.lodgeId) ?? null;
  const passGroupN = forfait?.j6 != null ? forfait.j6 * trav : 0;
  const totalN = (kept?.total ?? 0) + passGroupN;

  /**
   * Ce que chaque règle a écarté, règles verrouillées comprises.
   *
   * L'état vide ne regardait que les filtres **retirables** : quand la zone ou
   * la capacité du séjour vidait la liste, il n'avait rien à nommer et se
   * rabattait sur « Aucune annonce pour N personnes », imputant à la taille du
   * groupe ce que la distance avait écarté. Il fabriquait de surcroît une
   * capacité maximale avec `Math.max(… ?? 0)` : un relevé où aucune annonce ne
   * publie sa capacité annonçait « la plus grande annonce sa capacité à 0
   * personnes », un chiffre que personne n'a écrit.
   */
  const ecarts = lp
    .map((p) => ({ p, n: raw.filter((l) => !p.fn(l)).length }))
    .filter((x) => x.n > 0);
  /** Le libellé des masqués, par le formateur déjà éprouvé de `lodgingFilter`.
   *  Les motifs de l'écran ne sont pas ceux du module : ils passent donc par
   *  `extra`, qui existe pour cela. */
  const masquesLbl = droppedLabel(AUCUN_ECART, [
    ...ecarts.map((x) => ({ singulier: x.p.label, pluriel: x.p.label, n: x.n })),
  ]);

  let lempty: { title: string; hint: string; fix: (() => void) | null } | null = null;
  if (raw.length && !lvis.length) {
    // Le filtre le plus coûteux, verrouillé ou non : c'est lui qu'il faut
    // nommer, même quand on ne peut pas l'enlever d'un clic.
    let best: { p: Pred; n: number } | null = null;
    for (const p of lp) {
      const n = lapply(lp.filter((x) => x !== p)).length;
      if (!best || n > best.n) best = { p, n };
    }
    // La capacité publiée la plus grande du relevé — `null` si **aucune**
    // annonce n'en publie. On ne dit un chiffre que si quelqu'un l'a écrit.
    const capacites = raw.map((l) => l.guests).filter((g): g is number => g != null);
    const plusGrande = capacites.length ? Math.max(...capacites) : null;
    const muettes = raw.length - capacites.length;
    lempty =
      best && best.n > 0
        ? {
            title: `Le filtre « ${best.p.label} » ne laisse aucune annonce`,
            hint: `Sans lui, ${best.n} annonce${best.n > 1 ? "s" : ""} rest${best.n > 1 ? "ent" : "e"} sur les ${raw.length} du relevé.${best.p.remove ? "" : " Ce filtre se règle dans le panneau."}`,
            fix: best.p.remove ?? null,
          }
        : {
            title: `Aucune annonce pour ${trav} personnes${rooms ? ` et ${rooms} chambres` : ""}`,
            hint:
              plusGrande != null
                ? `Le relevé compte ${raw.length} annonce${raw.length > 1 ? "s" : ""} ; la plus grande de celles qui publient leur capacité annonce ${plusGrande} personnes${muettes ? `, et ${muettes} n'en publient aucune` : ""}. Réduisez le groupe ou attendez un nouveau relevé.`
                : `Le relevé compte ${raw.length} annonce${raw.length > 1 ? "s" : ""}, et aucune ne publie sa capacité : rien ici ne permet de dire si elles conviennent. Réduisez le groupe ou attendez un nouveau relevé.`,
            fix: null,
          };
  }

  const sources = [...new Set(raw.map((l) => l.source))];
  const bySrc = (src: string) => raw.filter((l) => l.source === src).length;
  const nCompletes = raw.filter((l) => completudeOf(l).ok).length;
  const nIncompletes = raw.length - nCompletes;
  const trous = trousPhrase(raw);
  const toggles: { k: "measured" | "pos" | "link" | "photo" | "firm" | "full" | "holes"; label: string; n: number }[] = [
    { k: "measured", label: "Distance mesurée", n: raw.filter((l) => distanceOf(l).kind === "measured").length },
    { k: "pos", label: "Position connue", n: raw.filter((l) => l.lat != null).length },
    { k: "link", label: "Lien de réservation", n: raw.filter((l) => l.url).length },
    { k: "photo", label: "Avec photo", n: raw.filter((l) => l.photo).length },
    { k: "firm", label: "Prix relevé aux dates", n: raw.filter((l) => firmOf(l, stay)).length },
    { k: "full", label: "Fiche complète", n: nCompletes },
    { k: "holes", label: "Incomplètes", n: nIncompletes },
  ];

  // Stables d'un rendu à l'autre : sans cela `memo` sur la carte d'annonce ne
  // servirait à rien, chaque rendu lui passant de nouvelles fonctions. Les
  // actions se lisent sur le magasin, qui les garde, et non sur l'instantané.
  const openSheet = useCallback((id: string) => {
    useParcours.getState().markSeen(id);
    setSheetId(id);
  }, []);
  const keep = useCallback((id: string) => {
    const p = useParcours.getState();
    p.chooseLodge(p.lodgeId === id ? null : id);
  }, []);
  const sheet = sheetId ? (raw.find((l) => l.id === sheetId) ?? null) : null;

  const situees = affichees.filter((l) => l.lat != null && l.lon != null);
  const marqueurs = useMemo(
    () => [
      {
        id: "__station",
        lat: s.lat,
        lon: s.lon,
        nom: `Repère de ${s.name}`,
        epingle: epingleRepere(s.name),
        zIndex: ETAGE.repere,
        inerte: true,
      },
      ...situees.map((l) => {
        const sel = sheetId === l.id || P.lodgeId === l.id;
        const etat = sel ? "retenue" : P.seen[l.id] ? "vue" : "normale";
        return {
          id: l.id,
          lat: l.lat as number,
          lon: l.lon as number,
          nom: l.title,
          epingle: epinglePrix(prixPin(l), l.title, etat),
          zIndex: sel ? ETAGE.designee : ETAGE.normale,
        };
      }),
    ],
    // Le contenu change avec les annonces situées, la sélection et les vues.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.id, s.lat, s.lon, s.name, situees.map((l) => l.id).join(","), sheetId, P.lodgeId, P.seen],
  );
  /** La clé de recadrage suit le **résultat des filtres**, pas le contenu du
   *  cadre : calculée sur le cadre, recadrer changerait la liste, qui changerait
   *  la clé, qui recadrerait — sans fin. Même règle que sur Comparer. */
  const cadrage = useMemo(
    () => `${recadrages}#${s.id}|${lvis.filter((l) => l.lat != null).map((l) => l.id).join(",")}`,
    [s.id, lvis, recadrages],
  );

  /** Le compte des annonces, dans la ligne des filtres. Il remplace la phrase
   *  qui tenait sous le titre : elle disait la même chose une ligne plus haut,
   *  et le bandeau figé n'a pas la place de le dire deux fois. */
  const compteLbl = (() => {
    const n = lvis.length;
    if (searching && n === 0) return "Relevé en cours…";
    if (n === 0) return "Aucun logement disponible";
    return `${n} logement${n > 1 ? "s" : ""} disponible${n > 1 ? "s" : ""}`;
  })();

  return (
    <Coquille>
      <main className="v7main v7main--pied" id="s-lodging" data-screen-label="2 Logements">
        <OngletsStation s={s} actif="logements" />
        {/* Un seul bloc figé sous la barre : titre et séjour, fiche station,
            puis Filtres et tri. Ils étaient dans trois conteneurs, chacun à sa
            propre hauteur, donc aucun ne pouvait glisser sous les deux autres
            et ils se recouvraient au défilement. */}
        <div className="bandeau7" ref={bandeau}>
        <header className="bandeau7__ligne">
          <div className="v7tete v7tete--compacte">
            <span className="v7surtitre">Étape 2</span>
            <h1>Logements {aStation(s.name)}</h1>
          </div>
          <span className="bandeau7__espace" />
          {/* Le séjour est passé ici, à droite du titre : la barre du haut n'en
              porte plus sur cet écran, et le bandeau garde la hauteur de celui
              de Comparer. */}
          <div className="sejour7">
            <button
              type="button"
              className="sejour7__resume"
              title="Changer la station, les dates ou le nombre de voyageurs"
              aria-expanded={stayOpen}
              onClick={() => setStayOpen(!stayOpen)}
            >
              <span className="sejour7__station">{s.name}</span>
              <span className="sejour7__dates">{datesLbl(checkIn, checkOut, nights)}</span>
              <span className="sejour7__groupe">{groupLbl(trav, rooms)}</span>
            </button>
            {/* La loupe est un bouton à part : elle relance le relevé pour les
                dates affichées. Elle était décorative, et « Relancer le relevé »
                doublait l'action à côté — ce bouton-là est donc parti. */}
            <button
              type="button"
              className="sejour7__loupe"
              title="Relancer le relevé pour ces dates"
              aria-label="Relancer le relevé pour ces dates"
              onClick={relancer}
              disabled={searching}
            >
              <Icon name="loupe" taille={14} />
            </button>
          </div>
        </header>

        <section className="ruban7">
          <div className="ruban7__media">
            <ImageSlot shape="rect" id={`v7app-ribbon-${s.id}`} placeholder={stationPhotoAbsence(s)} className="ruban7__slot" src={stationPhoto(s)} />
          </div>
          <div className="ruban7__corps">
            <span className="ruban7__crumb">{crumb(s)}{s.domain ? ` · ${s.domain}` : ""}</span>
            <div className="ruban7__faits">
              <span>
                <span>Pistes</span>
                <b className={altLbl(s) ? undefined : "absent"}>{altLbl(s) ?? "non relevées"}</b>
              </span>
              <span>
                <span>Km, domaine</span>
                <b className={kmLbl(s) ? undefined : "absent"}>{kmLbl(s) ?? "km non publié"}</b>
              </span>
              <span>
                <span>Remontées, domaine</span>
                <b className={liftsLbl(s) ? undefined : "absent"}>{liftsLbl(s) ?? "non relevé"}</b>
              </span>
              <span>
                <span>Forfait 6 j</span>
                <b className={passLbl(s) ? undefined : "absent"}>{passLbl(s) ?? "non relevé"}</b>
              </span>
            </div>
          </div>
          <a
            href={`/stations/${s.id}`}
            className="ruban7__lien"
            onClick={(e) => {
              e.preventDefault();
              void go("fiche", { id: s.id });
            }}
          >
            ← Fiche station
          </a>
        </section>

        {raw.length ? (
          <section className="filtres7">
            <div className="bandeau7__ligne filtres7__ancre" ref={ancreLf}>
                <button
                  type="button"
                  data-panel-btn="lf"
                  className={`puce puce--encre${lfOpen ? " puce--on" : ""}`}
                  aria-expanded={lfOpen}
                  onClick={() => setLfOpen((v) => !v)}
                >
                  <Icon name="filtres" taille={14} />
                  Filtres
                  {lfree.length ? <span className="puce__badge">{lfree.length}</span> : null}
                </button>
                {lfree.map((p) => {
                  const bloque = lempty?.fix != null && lempty.fix === p.remove;
                  return (
                    <span key={p.id} className={`jeton${bloque ? " jeton--bloque" : ""}`}>
                      {p.label}
                      <button
                        type="button"
                        aria-label={`Retirer le critère ${p.label}`}
                        onClick={p.remove}
                      >
                        <Icon name="croix" taille={11} />
                      </button>
                    </span>
                  );
                })}
                {lfree.length ? (
                  <a
                    href="#"
                    className="lien-doux"
                    onClick={(e) => {
                      e.preventDefault();
                      reinitialiser();
                    }}
                  >
                    Tout réinitialiser
                  </a>
                ) : null}
                <span className="filtres7__espace" />
                <span className="filtres7__compte" aria-live="polite">
                  {compteLbl}
                  {masquesLbl ? ` · ${masquesLbl}` : ""}
                </span>
                <select className="select7" value={lsort} onChange={(e) => setLsort(e.target.value as LodgeSort)}>
                  <option value="pp">Tri : prix par personne</option>
                  <option value="total">Tri : prix total</option>
                  <option value="dist">Tri : distance</option>
                  <option value="cap">Tri : capacité</option>
                  <option value="trous">Tri : incomplètes d'abord</option>
                </select>

              {lfOpen ? (
                <div className="pop7 pop7--filtres pop7--large" data-panel="lf">
                  <div className="pop7__tete pop7__tete--ligne">
                    <strong>Filtres</strong>
                    <button type="button" className="v7fermer" aria-label="Fermer" onClick={() => setLfOpen(false)}>
                      <Icon name="croix" taille={14} />
                    </button>
                  </div>
                  <div className="pop7__bloc pop7__bloc--sans">
                    <span className="v7surtitre">Zone de recherche</span>
                    <span className="pop7__note">
                      Autour du repère de {s.name}. Dix kilomètres par défaut,
                      trente au plus. Un logement hors de la station n’apparaît
                      que s’il est sur le même domaine skiable
                      {s.domain ? ` (${s.domain})` : ""}. Un autre domaine sort,
                      même tout près.
                    </span>
                    {/* Ce que les règles verrouillées ont écarté, et pourquoi.
                        La ligne « Toujours appliqué » qui portait ces motifs
                        au-dessus de la liste est retirée ; les motifs, eux,
                        restent — une liste courte sans explication se lit comme
                        un relevé pauvre, pas comme un filtre qui a joué. */}
                    {zoneLbl ? <span className="pop7__ecarte">{zoneLbl}</span> : null}
                    {centraleLbl ? <span className="pop7__ecarte">{centraleLbl}</span> : null}
                    {pauses.map((p) => (
                      <span key={p.source} className="pop7__ecarte">
                        {p.error && p.error.startsWith(p.source) ? p.error : `${p.source} : ${p.error}`}
                      </span>
                    ))}
                    {sansPos ? <span className="pop7__ecarte">{sansPos}</span> : null}
                  </div>
                  <label className="curseur">
                    <span className="curseur__lab">
                      <span>Rayon autour de la station</span>
                      <span className="curseur__val">{lf.rayon} km</span>
                    </span>
                    <input
                      type="range"
                      min={RAYON_MIN_KM}
                      max={RAYON_MAX_KM}
                      step={1}
                      value={lf.rayon}
                      onChange={(e) => patchLf({ rayon: clampRayonKm(+e.target.value) })}
                    />
                  </label>
                  {/* Les paliers de distance aux remontées ont rejoint le
                      panneau : sur la ligne, ils repoussaient le tri hors de
                      l'écran et doublaient un critère que « Filtres » porte. */}
                  <div className="pop7__bloc pop7__bloc--sans">
                    <span className="pop7__stitre">Distance à une remontée</span>
                    <div className="pop7__presets">
                      {DIST_PALIERS_M.map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={`puce${lf.dist === m ? " puce--on" : ""}`}
                          aria-pressed={lf.dist === m}
                          onClick={() => patchLf({ dist: lf.dist === m ? 0 : m })}
                        >
                          {palierDistLbl(m)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pop7__bloc">
                    <span className="v7surtitre">Prix et taille</span>
                    <span className="pop7__note">
                      Capacité ≥ {trav} est toujours appliquée ; ces seuils s'y ajoutent et écartent les
                      annonces sans valeur.
                    </span>
                  </div>
                  <label className="curseur">
                    <span className="curseur__lab">
                      <span>{BUDGET.label}</span>
                      <span className="curseur__val">
                        {budget ? `${BUDGET.sign}${fmt(budget)} ${BUDGET.unit}` : "Indifférent"}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={BUDGET.max}
                      step={BUDGET.step}
                      value={budget}
                      onChange={(e) => P.setFilters({ budget: +e.target.value })}
                    />
                  </label>
                  {RANGES.map((r) => (
                    <label key={r.k} className="curseur">
                      <span className="curseur__lab">
                        <span>{r.label}</span>
                        <span className="curseur__val">
                          {lf[r.k] ? `${r.sign}${fmt(lf[r.k])} ${r.unit}` : "Indifférent"}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={r.max}
                        step={r.step}
                        value={lf[r.k]}
                        onChange={(e) => patchLf({ [r.k]: +e.target.value })}
                      />
                    </label>
                  ))}
                  <div className="pop7__bloc">
                    <span className="v7surtitre">Source</span>
                    <div className="pop7__sources">
                      {sources.map((src) => (
                        <label key={src} className={`puce puce--case${lf.src[src] ? " puce--on" : ""}`}>
                          <input
                            type="checkbox"
                            checked={!!lf.src[src]}
                            onChange={() => patchLf({ src: { ...lf.src, [src]: !lf.src[src] } })}
                          />
                          {src}
                          <span className="puce__n">{bySrc(src)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="pop7__bloc">
                    <span className="v7surtitre">Qualité du relevé</span>
                    {/* Ce qui manque au relevé, en une phrase. Elle tenait sous
                        le titre de l'écran, qui n'a plus la place ; elle se lit
                        ici, au-dessus des cases qui s'en servent. */}
                    {trous ? <span className="pop7__note">{trous}</span> : null}
                    <div className="pop7__toggles">
                      {toggles.map((tg) => (
                        <label key={tg.k}>
                          <span>
                            <input
                            type="checkbox"
                            checked={lf[tg.k]}
                            onChange={() => {
                              if (tg.k === "full") patchLf({ full: !lf.full, holes: false });
                              else if (tg.k === "holes") patchLf({ holes: !lf.holes, full: false });
                              else patchLf({ [tg.k]: !lf[tg.k] });
                            }}
                          />
                            {tg.label}
                          </span>
                          <span className="pop7__n">{tg.n} annonces</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="pop7__pied pop7__pied--trait">
                    <a
                      href="#"
                      className="lien-doux"
                      onClick={(e) => {
                        e.preventDefault();
                        reinitialiser();
                      }}
                    >
                      Réinitialiser
                    </a>
                    <button type="button" className="btn7" onClick={() => setLfOpen(false)}>
                      Voir {affichees.length} annonce{affichees.length > 1 ? "s" : ""}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
        </div>

        {raw.length ? (
          <>
            <div className="v7deux">
              <div className="v7deux__liste">
                {affichees.length ? (
                  <div className="grille7-2">
                    {affichees.map((l) => (
                      <CarteLogement
                        key={l.id}
                        l={l}
                        retenu={P.lodgeId === l.id}
                        vue={!!P.seen[l.id]}
                        vif={actifCarte === l.id}
                        stay={stay}
                        trav={trav}
                        nights={nights}
                        ouvrir={openSheet}
                        retenir={keep}
                        designer={setActifCarte}
                      />
                    ))}
                  </div>
                ) : lvis.length ? (
                  <Vide titre="Aucune annonce dans ce cadre">
                    La liste suit la carte : {lvis.length} annonce{lvis.length > 1 ? "s" : ""}{" "}
                    correspond{lvis.length > 1 ? "ent" : ""} au relevé, hors du cadre visible.
                    Dézoomez ou déplacez la carte pour les retrouver.
                  </Vide>
                ) : lempty ? (
                  <Vide
                    titre={lempty.title}
                    actions={
                      <>
                        {lempty.fix ? (
                          <button type="button" className="btn7" onClick={lempty.fix}>
                            Retirer ce filtre
                          </button>
                        ) : null}
                        <button type="button" className="btn7 btn7--fantome" onClick={reinitialiser}>
                          Tout réinitialiser
                        </button>
                      </>
                    }
                  >
                    {lempty.hint}
                  </Vide>
                ) : null}
              </div>
              <div className="v7deux__carte">
                <CarteEpingles
                  marqueurs={marqueurs}
                  cadrage={cadrage}
                  maxZoom={14}
                  surBornes={setBornes}
                  actif={actifCarte}
                  surActif={setActifCarte}
                  ficheDe={(id) => {
                    const l = raw.find((x) => x.id === id);
                    if (!l) return null;
                    const d = distanceOf(l);
                    const ferme = firmOf(l, stay);
                    const pers = prixPersLbl(l, trav);
                    return (
                      <>
                        {l.photo ? (
                          <div className="fc__media">
                            <ImageSlot
                              shape="rect"
                              id={`v7app-fc-${l.id}`}
                              placeholder="Photo de l'annonce"
                              className="fc__slot"
                              src={l.photo}
                            />
                            <span className="fc__source">{l.source}</span>
                            {l.priceIndicative ? <span className="lodge7__indic">à partir de</span> : null}
                          </div>
                        ) : null}
                        <div className="fc__texte">
                          {!l.photo ? (
                            <span className="toujours7__regle">{l.source}</span>
                          ) : null}
                          <strong className="fc__titre">{l.title}</strong>
                          <span className="fc__ligne">
                            <span className={l.guests == null ? "absent" : undefined}>
                              {capLbl(l)}
                            </span>
                            <span>{bedLbl(l)}</span>
                          </span>
                          <span className={`fc__ligne${d.kind === "measured" ? "" : " absent"}`}>
                            {d.text}
                          </span>
                          <span className="fc__prix">
                            <b>{prixLbl(l)}</b>
                            <span>
                              {nights} nuits{pers ? ` · ${pers} / pers.` : ""}
                            </span>
                          </span>
                          <span className={`fc__verdict${ferme ? " fc__verdict--ok" : ""}`}>
                            <i />
                            {ferme
                              ? "Prix relevé aux dates"
                              : availabilityLabel(availabilityOf(l, stay))}
                          </span>
                        </div>
                      </>
                    );
                  }}
                  actionsDe={(id) => {
                    const l = lvis.find((x) => x.id === id);
                    if (!l) return null;
                    const retenu = P.lodgeId === l.id;
                    return (
                      <>
                        <button type="button" className="btn7" onClick={() => openSheet(id)}>
                          Voir l'annonce
                        </button>
                        <button
                          type="button"
                          className="btn7 btn7--fantome"
                          aria-pressed={retenu}
                          onClick={() => keep(l.id)}
                        >
                          {retenu ? "Retenu" : "Retenir"}
                        </button>
                      </>
                    );
                  }}
                  /* Le compte, et le retour au cadrage des résultats. La ligne
                     sur les annonces sans coordonnées et le rappel du contour
                     pointillé sont retirés : le premier se lit dans le panneau
                     Filtres, le second se voit. */
                  legende={
                    <>
                      <b>
                        {positionnees.length} annonce{positionnees.length > 1 ? "s" : ""} positionnée
                        {positionnees.length > 1 ? "s" : ""}
                      </b>
                      {positionnees.length < lvis.filter((l) => l.lat != null).length ? (
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            revoirTout();
                          }}
                        >
                          Revoir les {lvis.filter((l) => l.lat != null).length} annonces →
                        </a>
                      ) : null}
                    </>
                  }
                />
              </div>
            </div>
          </>
        ) : (
          <Vide
            titre={`Aucune annonce relevée pour ${s.name}`}
            actions={
              <>
                <button type="button" className="btn7" onClick={relancer} disabled={searching}>
                  {searching ? "Relevé en cours…" : "Lancer le relevé"}
                </button>
                <button type="button" className="btn7 btn7--fantome" onClick={importer}>
                  Importer une annonce par son lien
                </button>
              </>
            }
          >
            Rien n'est affiché à la place : ni estimation, ni annonce d'une autre station.
          </Vide>
        )}
      </main>

      {kept ? (
        <div className="pied7">
          <div className="pied7__retenu">
            <span className="v7surtitre">Logement retenu</span>
            <strong>
              {kept.title} · {kept.source}
            </strong>
          </div>
          <dl className="pied7__postes">
            <div>
              <dt>Logement</dt>
              <dd className={kept.total > 0 ? undefined : "absent"}>
                {kept.total > 0 ? eurCents(kept.total) : "non publié"}
              </dd>
            </div>
            <div>
              <dt>Forfaits {trav} × 6 j</dt>
              <dd className={forfait?.j6 != null ? undefined : "absent"}>{forfait?.j6 != null ? eur(passGroupN) : "non relevés"}</dd>
            </div>
            <div>
              <dt>Trajet</dt>
              <dd className="absent">non calculé</dd>
            </div>
          </dl>
          <div className="pied7__total">
            <span>Total du séjour</span>
            <b>{kept.total > 0 ? eurCents(totalN) : "logement non tarifé"}</b>
            <span>
              {kept.total > 0
                ? `${eurCents(Math.round((totalN / trav) * 100) / 100)} par personne`
                : "total incomplet"}
            </span>
          </div>
          <button type="button" className="btn7 btn7--grand" onClick={() => void go("booking")}>
            Passer à la réservation
            <Icon name="fleche-droite" taille={16} />
          </button>
        </div>
      ) : null}

      {sheet ? (
        <>
          <div className="volet7__fond" onClick={() => setSheetId(null)} />
          <aside className="volet7" role="dialog" aria-modal="true" aria-label={sheet.title}>
            <div className={`volet7__media lodge7__media--${mediaTon(sheet)}`}>
              {galerieOf(sheet)[photoI] ?? sheet.photo ? (
                <ImageSlot
                  shape="rect"
                  id={`v7app-sheet-${sheet.id}`}
                  placeholder="Photo de l'annonce"
                  className="lodge7__slot"
                  src={galerieOf(sheet)[photoI] ?? sheet.photo}
                />
              ) : (
                <span>Pas de photo dans l'annonce {sheet.source}</span>
              )}
              <button type="button" className="volet7__fermer" aria-label="Fermer" onClick={() => setSheetId(null)}>
                <Icon name="croix" taille={14} />
              </button>
            </div>
            <div className="volet7__corps">
              <div>
                <span className="volet7__ref">
                  {sheet.source} · réf. {sheet.id}
                  {sheet.priceIndicative ? " · à partir de" : ""}
                </span>
                <h2>{sheet.title}</h2>
              </div>
              <GalerieAnnonce urls={galerieOf(sheet)} index={photoI} onIndex={setPhotoI} />
              <div className="volet7__faits">
                <div>
                  <span>Capacité</span>
                  <b>{capLbl(sheet)}</b>
                </div>
                <div>
                  <span>Chambres</span>
                  <b>{bedLbl(sheet)}</b>
                </div>
                <div className="volet7__large">
                  <span>Distance aux remontées</span>
                  <b className="volet7__doux">{distanceOf(sheet).text}</b>
                </div>
              </div>
              {completudeOf(sheet).trous.length ? (
                <p className="lodge7__trous">{completudeOf(sheet).trous.map(trouLbl).join(" · ")}</p>
              ) : null}
              <div className="volet7__prix">
                <div>
                  <span>
                    Total du séjour · {nights} nuits · {trav} pers.
                  </span>
                  <b>{prixLbl(sheet)}</b>
                </div>
                <div>
                  <span>Par personne</span>
                  <b className="volet7__pp">{prixPersLbl(sheet, trav) ?? "—"}</b>
                </div>
                {firmOf(sheet, stay) ? (
                  <div className="volet7__ok">
                    <Icon name="coche" taille={16} />
                    <span>
                      <b>Prix relevé aux dates.</b> La source a tarifé cette annonce pour ce séjour ; il
                      sera revérifié à la réservation.
                    </span>
                  </div>
                ) : (
                  <div className="volet7__alerte">
                    <Icon name="alerte" taille={16} />
                    <span>
                      <b>Disponibilité non confirmée.</b> {availabilityLabel(availabilityOf(sheet, stay))}.
                      Il sera revérifié à la réservation.
                    </span>
                  </div>
                )}
              </div>
              {/* Le bloc « Provenance » est retiré : la source et la date du
                  relevé se lisent déjà en tête du volet et dans la mention de
                  disponibilité juste au-dessus. */}
              <div className="volet7__actions">
                <button
                  type="button"
                  className={`btn7 btn7--grand btn7--pleine${P.lodgeId === sheet.id ? " btn7--tenu" : " btn7--encre"}`}
                  onClick={() => keep(sheet.id)}
                >
                  {P.lodgeId === sheet.id ? "Retenu" : "Retenir"}
                </button>
                {sheet.url ? (
                  <a href={sheet.url} target="_blank" rel="noopener" className="btn7 btn7--fantome btn7--pleine btn7--lien">
                    Ouvrir sur {sheet.source} ↗
                  </a>
                ) : (
                  <span className="volet7__sanslien">
                    L'annonce n'a pas de lien dans le relevé : la réservation se fera à la main.
                  </span>
                )}
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </Coquille>
  );
}
