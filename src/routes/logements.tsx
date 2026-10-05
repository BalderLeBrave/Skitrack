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
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { CarteEpingles } from "@/components/v7/CarteEpingles";
import { CarteLogement, ECART_VILLAGE_M, PAGE_LOGEMENTS } from "@/components/v7/CarteLogement";
import { epinglePrix, epingleRepere, ETAGE } from "@/components/v7/epingle";
import { useFermeture } from "@/components/v7/fermeture";
import { FicheEpingle } from "@/components/v7/FicheEpingle";
import { Pages } from "@/components/v7/Pages";
import { Fourchette } from "@/components/v7/Fourchette";
import { FourchetteRecherche } from "@/components/v7/FourchettesRecherche";
import { SensTri } from "@/components/v7/SensTri";
import { VoletAnnonce } from "@/components/v7/VoletAnnonce";
import { partagerParBornes, type Bornes } from "@/lib/carte";
import { grandDomaineDe } from "@/lib/grandsDomaines";
import { RATTACHEMENT_MAX_KM } from "@/lib/villages";
import { rangerParStation, stationDuLogement } from "@/lib/stay/parStation";
import { aTraduire, dire, langue, tr, trN } from "@/lib/i18n";
import { OngletsStation } from "@/components/v7/OngletsStation";
import { Vide } from "@/components/v7/Vide";
import { usePrixForfait } from "@/components/v7/usePrixForfait";
import { listingsForStay, type Listing } from "@/lib/listings";
import { eleKey, listingEleM, useElevations } from "@/lib/elevations";
import { getListingElevations } from "@/lib/snow/api";
import { completudeOf } from "@/lib/stay/completude";
import { enrichirListing } from "@/lib/stay/enrichir";
import {
  distFiltrableM,
  DIST_PALIERS_M,
  geoReasonFor,
  gpsPrecis,
  normalizedBedrooms,
  RAYON_DEFAUT_KM,
  RAYON_MAX_KM,
  RAYON_MIN_KM,
  RAYONS_KM,
} from "@/lib/stay/lodgingFilter";
import { fourchetteLbl } from "@/lib/filtres";
import { dansPlage, plageTexte, poserBorne, type Echelle, type Plage } from "@/lib/plage";
import { parMesure, type Sens } from "@/lib/tri";
import {
  datesCourtes,
  ECHELLES,
  eurCents,
  fmt,
  stationPhoto,
  stationPhotoAbsence,
  useParcours,
  useSejour,
} from "@/lib/parcours";
import { echecLbl, mentionForfait } from "@/lib/forfaits/prixSejour";
import { montantCents } from "@/lib/devises";
import { forfaitInclus } from "@/lib/stay/forfaitInclus";
import { agencesDe } from "@/lib/scrape/agences/couverture";
import { partyLabel } from "@/lib/stay/party";
import {
  searchStay,
  completerAnnonces,
  completerReleve,
  PAUSE_DELAI,
  SEARCH_PART_MS,
  DEVIS_MS,
  TARIF_MS,
} from "@/lib/searchStay";
import { airbnbComplet, plausible } from "@/lib/stay/priseFiche";
import { stationById, type Station } from "@/lib/stations";
import { useStay } from "@/lib/stay";
import { estPauseApi, estTimeout, withDeadline } from "@/lib/stay/deadline";
import { conserverDevisGites, estOffreGitesVerifiee } from "@/lib/stay/tarif";
import { regrouper, sourcesLbl, type Logement } from "@/lib/stay/regroupement";
import { jumelageGpsAirbnb } from "@/lib/stay/recopie";
import { photosDeResidence } from "@/lib/stay/photoResidence";
import { useFavoris, useIdsFavoris } from "@/lib/favoris/store";
import { useAltitudes } from "@/lib/altitude/store";
import { attachAccess } from "@/lib/access";
import { estFicheGitesIntrouvable } from "@/lib/stay/ficheGites";
import {
  altLbl,
  aStation,
  crumbDomaine,
  distanceOf,
  firmOf,
  kmLbl,
  liftsLbl,
  prixLbl,
  prixPin,
  villageM,
} from "@/lib/v7";

export const Route = createFileRoute("/logements")({ component: Logements });

type LodgeSort = "station" | "pp" | "total" | "cap" | "dist" | "alt" | "trous";

/** Les critères du tri ; le sens se choisit à côté. Chacun part dans son sens
 *  de départ : le moins cher, le plus grand, le plus près d'abord, et les
 *  fiches qui ont le plus de trous d'abord. */
const TRIS_LOGEMENT: { k: LodgeSort; label: string; sens: Sens }[] = [
  // Ceux qui dorment au niveau du village d'abord, puis du moins cher au plus
  // cher : « Logements à Val Thorens » ne commence plus par Orelle.
  { k: "station", label: aTraduire("Tri : dans la station d’abord"), sens: 1 },
  { k: "pp", label: aTraduire("Tri : prix par personne"), sens: 1 },
  { k: "total", label: aTraduire("Tri : prix total"), sens: 1 },
  { k: "dist", label: aTraduire("Tri : distance"), sens: 1 },
  // Le plus haut d'abord : la neige y tient mieux.
  { k: "alt", label: aTraduire("Tri : altitude"), sens: -1 },
  { k: "cap", label: aTraduire("Tri : capacité"), sens: -1 },
  { k: "trous", label: aTraduire("Tri : trous dans la fiche"), sens: -1 },
];

/** `lf` de la maquette : les filtres facultatifs de **cet écran**.
 *
 *  Le budget n'y est plus : c'est un critère de recherche, au même titre que
 *  les dates et les voyageurs. Il vit dans `useParcours.filters.budget`, d'où
 *  il survit à la navigation et s'écrit dans l'adresse ; les réglages
 *  ci-dessous, eux, ne valent que pour la liste des annonces. */
type LF = {
  /** Prix par personne (€). */
  pp: Plage;
  /** Capacité annoncée. */
  cap: Plage;
  /** Chambres annoncées, ou pièces moins une. */
  rooms: Plage;
  /** Distance à une remontée (m). */
  dist: Plage;
  src: Record<string, boolean>;
  /** Distance au centre de la station, en km : la borne haute est le rayon de
   *  recherche. Toujours posée, jamais retirable. */
  rayon: readonly [number, number];
  measured: boolean;
  link: boolean;
  photo: boolean;
  firm: boolean;
  pos: boolean;
  full: boolean;
  holes: boolean;
};
const LF0: LF = {
  pp: null,
  cap: null,
  rooms: null,
  dist: null,
  src: {},
  rayon: [0, RAYON_DEFAUT_KM],
  measured: false,
  link: false,
  photo: false,
  firm: false,
  pos: false,
  full: false,
  holes: false,
};

/** Le budget est à part : il est lu et écrit sur le magasin partagé. */
const BUDGET = { k: "budget" as const, label: aTraduire("Total du séjour"), ...ECHELLES.budget, unit: "€" };

/** Les fourchettes propres à cet écran. Chacune était un seuil — « au plus »
 *  pour le prix et la distance, « au moins » pour la capacité et les
 *  chambres — dont elle garde l'échelle ; la borne haute au bout veut dire
 *  « et plus ». */
const RANGES: { k: "pp" | "cap" | "rooms" | "dist"; label: string; b: Echelle; pas: number; unit: string }[] = [
  { k: "pp", label: aTraduire("Prix par personne"), b: [0, 800], pas: 25, unit: "€" },
  { k: "cap", label: aTraduire("Capacité annoncée"), b: [1, 16], pas: 1, unit: aTraduire("pers.") },
  { k: "rooms", label: aTraduire("Chambres annoncées"), b: [0, 7], pas: 1, unit: aTraduire("ch.") },
  { k: "dist", label: aTraduire("Distance à une remontée"), b: [0, 2000], pas: 100, unit: "m" },
];
const RANGE = Object.fromEntries(RANGES.map((r) => [r.k, r])) as Record<(typeof RANGES)[number]["k"], (typeof RANGES)[number]>;

/** Une borne de fourchette en toutes lettres : « 6 pers. », « 2 ch. ». Zéro
 *  chambre se dit « Studio », jamais « 0 ch. », comme sur les cartes. */
function borneLbl(k: (typeof RANGES)[number]["k"]): (v: number) => string {
  return (v) => (k === "rooms" && v === 0 ? tr("Studio") : `${fmt(v)} ${tr(RANGE[k].unit)}`);
}

/** L'échelle du périmètre : du centre de la station à 50 km. */
const ECHELLE_RAYON: Echelle = [0, RAYON_MAX_KM];

/** « jusqu'à 12 km », « de 2 à 12 km » : le périmètre n'est jamais indifférent. */
function rayonLbl([lo, hi]: readonly [number, number]): string {
  return lo > 0 ? tr("de {min} à {max} km", { min: fmt(lo), max: fmt(hi) }) : tr("jusqu’à {max} km", { max: fmt(hi) });
}

/** Un palier de distance posé depuis la barre : de 0 à `m`. */
function palierPose(pl: Plage, m: number): boolean {
  return pl != null && pl[0] === 0 && pl[1] === m;
}

function palierDistLbl(m: number): string {
  if (m <= 200) return tr("Pied des pistes");
  if (m >= 1000 && m % 1000 === 0) return `≤ ${m / 1000} km`;
  return `≤ ${m} m`;
}

/** Le temps qu'on laisse aux critères pour se poser avant de relancer la recherche. */
const RELANCE_MS = 800;
/**
 * Les pages Airbnb se lisent en tâche de fond, une toutes les 5 s au moins
 * (`completerFiche.server.ts`), et la recherche ne les attend plus : tant
 * qu'une annonce Airbnb n'a pas ses trois champs, l'écran relit ses annonces
 * à cet intervalle, sans nouveau relevé et sans réseau (`completerAnnonces` :
 * le cache et la mémoire des fiches seuls, quelques dizaines de ms), au lieu
 * d'afficher « non renseigné » jusqu'à la recherche suivante. Chaque relecture
 * remet aussi en fin de file ce qui lui manque, et relance une suite arrêtée.
 */
const RELECTURE_AIRBNB_MS = 15_000;
/** Au plus 45 min après la recherche, comme les 45 relectures d'une minute d'avant. */
const RELECTURES_AIRBNB_MAX = 180;
/** L'annonce ouverte se relit plus souvent, sans réseau, deux minutes au plus. */
const RELECTURE_OUVERTE_MS = 4_000;
const RELECTURES_OUVERTE_MAX = 30;

/**
 * Une annonce Airbnb à qui il manque GPS, capacité ou chambres, et que la
 * tâche de fond peut encore combler. Lue et à point (`pdpLue`), ce qui lui
 * manque, sa page ne le publie pas. Sans point, sa page se relit encore : elle
 * donne un point de repli que la mémoire des fiches ne garde pas.
 */
function aCombler(l: Listing): boolean {
  if (l.source === "Airbnb") return !airbnbComplet(l) && !(l.pdpLue === true && plausible(l.lat, l.lon));
  // Hors Airbnb : une fiche que la tâche de fond lit encore, à qui il manque
  // la capacité, ou les chambres sans pièces dont les tirer.
  return Boolean(l.url) && (l.capacity == null || (l.bedrooms == null && !(l.rooms != null && l.rooms > 0)));
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
  const patchLive = useStay((s) => s.patchLive);
  const setSearching = useStay((s) => s.setSearching);
  const setLive = useStay((s) => s.setLive);
  // La première recherche part tout de suite ; les suivantes attendent que les
  // critères se posent (voir plus bas).
  const premiere = useRef(true);
  const dernierNonce = useRef(searchNonce);

  useEffect(() => {
    if (!station) return;
    let cancelled = false;
    let pending = 6;
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
      // « Relancer le relevé » : le serveur ne ressert pas un relevé Airbnb
      // de plus de 90 s, alors qu'une recherche ordinaire le garde 15 min.
      relance: searchNonce !== dernierNonce.current,
    };
    dernierNonce.current = searchNonce;
    const finish = () => {
      pending -= 1;
      if (!cancelled && pending <= 0) setSearching(false);
    };
    // Relecture des annonces Airbnb incomplètes, pendant que leurs pages se
    // lisent en tâche de fond. Les annonces partent telles que l'écran les
    // tient ; elles reviennent comblées de ce que le cache des fiches sait.
    let relecture: ReturnType<typeof setTimeout> | null = null;
    let relectures = 0;
    // Seules partent les annonces que la tâche de fond peut encore combler :
    // une requête légère, et les autres ne se redessinent pas pour rien.
    const incompletes = (rows: readonly Listing[]) => rows.filter(aCombler);
    const planifierRelecture = (rows: readonly Listing[]) => {
      if (cancelled || relectures >= RELECTURES_AIRBNB_MAX || incompletes(rows).length === 0) return;
      relecture = setTimeout(relireAirbnb, RELECTURE_AIRBNB_MS);
    };
    const relireAirbnb = () => {
      if (cancelled) return;
      relectures += 1;
      const actuelles = incompletes(useStay.getState().liveListings ?? []);
      if (actuelles.length === 0) return;
      void completerAnnonces({ data: { listings: actuelles } })
        .then((rows) => {
          if (cancelled) return;
          patchLive(rows);
          planifierRelecture(rows);
        })
        .catch(() => {
          // Réseau ou pause Airbnb : on réessaie à l'intervalle suivant.
          planifierRelecture(actuelles);
        });
    };
    const run = (part: "airbnb" | "gites" | "cozy" | "centrales" | "greengo" | "agences") => {
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
            if (part === "airbnb") planifierRelecture(res.listings);
            return;
          }
          // Les agences n'ont pas de relevé figé : leurs rapports disent ce
          // qui a été interrogé, même sans annonce.
          if (part === "agences") {
            if (res.sources.length) mergeLive([], res.sources);
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
                  : part === "greengo"
                    ? dump.filter((l) => l.source === "GreenGo")
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
          } else if (part === "greengo") {
            mergeLive(
              frozenRef.current.filter((l) => l.source === "GreenGo"),
              [{ source: "GreenGo", ok: false, count: 0, ms: 0, error }],
            );
          } else if (part === "agences") {
            mergeLive(
              [],
              agencesDe(station.id).map((source) => ({ source, ok: false, count: 0, ms: 0, error })),
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
    const lancer = () => {
      run("airbnb");
      run("gites");
      run("cozy");
      // La centrale officielle de la station. Elle part en même temps que les
      // plateformes et n'attend rien d'elles : une centrale lente ne doit pas
      // retarder la liste, et une centrale muette ne doit pas la vider.
      run("centrales");
      // GreenGo : ses propres hébergements écoresponsables, qu'aucune autre
      // source ne rapporte.
      run("greengo");
      // Les agences et loueurs de montagne qui couvrent la station (Ovo
      // Network, Travelski…). Pour une station qu'aucun ne couvre, le serveur
      // répond tout de suite, sans rien demander à personne.
      run("agences");
    };
    // Trois clics sur « Voyageurs » lançaient trois relevés Airbnb complets,
    // qui partaient tous jusqu'au bout côté serveur : jusqu'à 36 requêtes à
    // Airbnb pour une seule recherche voulue. On attend que les critères se
    // posent ; un changement dans l'intervalle annule le départ.
    const delai = premiere.current ? 0 : RELANCE_MS;
    premiere.current = false;
    const depart = setTimeout(lancer, delai);
    return () => {
      cancelled = true;
      clearTimeout(depart);
      if (relecture) clearTimeout(relecture);
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
      P.say(dire("nav.lodgingLocked"));
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

/**
 * Vrai quand le relevé dure assez longtemps pour valoir un écran d'attente.
 *
 * En deçà de 200 ms l'état apparaît et repart aussitôt : on voit un
 * clignotement, pas une information. Le compte à rebours repart à zéro à
 * chaque relevé.
 */
function useReleveVisible(searching: boolean): boolean {
  const [assezLong, setAssezLong] = useState(false);
  useEffect(() => {
    if (!searching) {
      setAssezLong(false);
      return;
    }
    const t = setTimeout(() => setAssezLong(true), 200);
    return () => clearTimeout(t);
  }, [searching]);
  return searching && assezLong;
}

/** La ligne d'état du bloc collant, à la place du compteur. */
function LigneReleve({ trouves = 0 }: { trouves?: number }) {
  return (
    <div className="rech7" aria-busy="true">
      <span className="rech7__points" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="rech7__texte" role="status" aria-live="polite" data-testid="lodging-search-status">
        {trouves > 0
          ? trN(trouves, "{n} logement, recherche en cours…", "{n} logements, recherche en cours…")
          : tr("Recherche de logements disponibles…")}
      </span>
    </div>
  );
}

/**
 * Quatre squelettes d'annonce : ce que la grille montre sans pousser la page.
 *
 * Ils reprennent `.lodge7` et `.lodge7__corps` tels quels — mêmes rayon, fond,
 * rembourrage et gouttières — pour occuper la boîte des cartes qu'ils
 * annoncent. Une boîte plus courte ferait sauter la page à l'arrivée des
 * résultats.
 */
function SquelettesLogements() {
  return (
    <div className="grille7-2" aria-hidden="true">
      <Squelettes n={4} />
    </div>
  );
}

/** Les squelettes seuls, pour fermer une grille déjà en partie remplie. */
function Squelettes({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={`sk-${i}`} className="lodge7 sk7" aria-hidden="true">
          <div className="sk7__media" />
          <div className="lodge7__corps">
            <span className="sk7__barre sk7__barre--titre" />
            <span className="sk7__barre sk7__barre--sous" />
            <span className="sk7__barre sk7__barre--meta" />
            <span className="sk7__barre sk7__barre--dist" />
            <div className="sk7__pied">
              <span className="sk7__prix" />
              <span className="sk7__bouton" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function LogementsStation({ s }: { s: Station }) {
  const go = useGo();
  const P = useParcours();
  const { checkIn, checkOut, trav, enfants, rooms, nights } = useSejour();
  const prix = usePrixForfait(s);
  const liveListings = useStay((x) => x.liveListings);
  const liveSources = useStay((x) => x.liveSources);
  const searching = useStay((x) => x.searching);
  const enReleve = useReleveVisible(searching);
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
    const lignes = rows.map(enrichirListing).filter((l) => !estFicheGitesIntrouvable(l) && estOffreGitesVerifiee(l));
    // Airbnb dont la page a été lue sans point : celui du même logement relevé
    // sur une autre source, repris tel quel (`jumelageGpsAirbnb`), et son
    // accès aux pistes mesuré depuis ce point.
    const jumeles = jumelageGpsAirbnb(lignes);
    const placees =
      jumeles.size === 0
        ? lignes
        : lignes.map((l) => {
            const p = jumeles.get(l.id);
            return p ? attachAccess({ ...l, lat: p.lat, lon: p.lon, gpsSource: "jumelage" as const }, s) : l;
          });
    // Ski-Planet sans photo : celle de la même résidence publiée par une autre
    // source du relevé (`photosDeResidence`), dite dans la provenance.
    const photos = photosDeResidence(placees);
    if (photos.size === 0) return placees;
    return placees.map((l) => {
      const r = photos.get(l.id);
      return r ? { ...l, photo: r.photo, proven: `${l.proven} · ${r.proven}` } : l;
    });
  }, [liveListings, liveSources, frozen, dumpGps, s]);
  // Un logement enregistré qui repasse dans le relevé : sa copie dans les
  // favoris prend la photo, le point et, pour le même séjour, le prix d'aujourd'hui.
  useEffect(() => {
    if (raw.length > 0) useFavoris.getState().rafraichir(raw, { checkIn, checkOut, trav });
  }, [raw, checkIn, checkOut, trav]);
  // L'altitude de chaque annonce à point, pour la carte et le tri.
  const altDe = useAltitudes(raw);

  const [lf, setLf] = useState<LF>(LF0);
  const [lsort, setLsort] = useState<LodgeSort>("station");
  const [lsens, setLsens] = useState<Sens>(1);
  /** Un autre critère part dans son sens de départ. */
  const choisirTri = (k: LodgeSort) => {
    setLsort(k);
    setLsens(TRIS_LOGEMENT.find((t) => t.k === k)?.sens ?? 1);
  };
  const [lfOpen, setLfOpen] = useState(false);
  const [sheetId, setSheetId] = useState<string | null>(null);
  // Le panneau de filtres se ferme au clic dehors et à Échap ; le volet
  // d'annonce tient lui-même sa sortie par Échap (`VoletAnnonce`).
  const fermerFiltres = useCallback(() => setLfOpen(false), []);
  const fermerVolet = useCallback(() => setSheetId(null), []);
  const panneauFiltres = useRef<HTMLDivElement>(null);
  useFermeture(lfOpen, fermerFiltres, panneauFiltres, '[data-panel-btn="filtres"]');
  // Le cadre de la carte, et s'il compte. Décoché par défaut : sinon un simple
  // coup d'œil ailleurs efface la liste qu'on venait de constituer.
  // Le cadre visible compte toujours : liste, compteur et pastilles rendues
  // disent la même chose. Même correction que sur Comparer.
  const [bornes, setBornes] = useState<Bornes | null>(null);
  const [pageL, setPageL] = useState(0);
  const listeRef = useRef<HTMLDivElement>(null);
  /** La fiche épinglée sur la carte, remontée par elle. */
  const [epinglee, setEpinglee] = useState<string | null>(null);
  // Rendre les annonces que le cadre a laissées dehors. Relâcher les bornes ne
  // suffit pas : la carte ne recadre que si la clé `cadrage` change, et cette
  // clé suit le résultat des filtres, qui n'a pas bougé. Même compteur que sur
  // Comparer, pour la même raison.
  const [recadrages, setRecadrages] = useState(0);
  const revoirTout = useCallback(() => {
    setBornes(null);
    setRecadrages((n) => n + 1);
  }, []);
  // L'annonce que la carte désigne, et que la liste éclaire en retour.
  const [actifCarte, setActifCarte] = useState<string | null>(null);
  const patchLf = (p: Partial<LF>) => setLf((x) => ({ ...x, ...p }));
  /** Pose une borne d'une fourchette de l'écran, depuis l'état courant. */
  const poserLf = (k: (typeof RANGES)[number]["k"], which: 0 | 1, v: number, exact: boolean) =>
    setLf((x) => ({ ...x, [k]: poserBorne(x[k], RANGE[k].b, RANGE[k].pas, which, v, exact) }));
  /** Le périmètre ne se retire pas : couvrir toute l'échelle, c'est 50 km, et
   *  sa borne haute ne descend pas sous le kilomètre. */
  const poserRayon = (which: 0 | 1, v: number, exact: boolean) =>
    setLf((x) => {
      const r = poserBorne(x.rayon, ECHELLE_RAYON, 1, which, v, exact) ?? ECHELLE_RAYON;
      return { ...x, rayon: r[1] < RAYON_MIN_KM ? [0, RAYON_MIN_KM] : r };
    });
  // Le budget du séjour : critère partagé, pas un réglage de cet écran.
  const budget = P.filters.budget;
  /** « Tout réinitialiser » relâche les réglages de l'écran **et** le budget,
   *  qui n'est plus rangé avec eux. */
  const reinitialiser = () => {
    setLf(LF0);
    P.setFilters({ budget: null });
  };

  const stay = useMemo(() => ({ checkIn, checkOut }), [checkIn, checkOut]);

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
  /* ---------- Prédicats ---------- */
  const lp: Pred[] = [];
  lp.push({ id: "cap", label: tr("Capacité ≥ {n}", { n: trav }), fn: (l) => l.capacity == null || l.capacity >= trav, fixed: true });
  // Les pièces comptent, comme dans `lodgingFilter`. Les deux règles de
  // chambres ne lisaient que `bedrooms` : une annonce de centrale publiant
  // « 2 pièces » sans chambres traversait en silence « Chambres ≥ 4 » — elle en
  // a une —, et un « 6 pièces » était écarté par « Chambres annoncées ≥ 3 »
  // alors qu'il en a cinq. La conversion était écrite, documentée et testée
  // (`normalizedBedrooms`) ; l'écran ne l'appelait pas. `bedLbl` continue
  // d'afficher le mot de la source : la conversion n'a lieu qu'à la comparaison.
  if (rooms)
    lp.push({
      id: "rooms",
      label: tr("Chambres ≥ {n}", { n: rooms }),
      fn: (l) => {
        const n = normalizedBedrooms(l);
        return n == null || n >= rooms;
      },
      fixed: true,
    });
  // La zone est toujours appliquée : une recherche de logements a toujours un
  // périmètre. Son rayon se règle dans le panneau, il ne se retire pas. Une
  // borne basse écarte aussi ce qui est trop près du centre, et ce dont la
  // distance au centre n'est pas mesurée.
  const [rayonMin, rayonMax] = lf.rayon;
  lp.push({
    id: "zone",
    label:
      rayonMin > 0
        ? tr("Entre {min} et {max} km", { min: fmt(rayonMin), max: fmt(rayonMax) })
        : tr("Rayon de {max} km", { max: fmt(rayonMax) }),
    fn: (l) =>
      geoReasonFor(l, rayonMax, s.dept) == null &&
      (rayonMin <= 0 || (l.distToSlopesM != null && l.distToSlopesM >= rayonMin * 1000)),
    fixed: true,
  });
  lp.push({
    id: "gps",
    label: tr("Position GPS"),
    fn: (l) => gpsPrecis(l),
    fixed: true,
  });
  lp.push({
    id: "dispo",
    label: tr("Disponible à ces dates"),
    fn: (l) => firmOf(l, stay),
    fixed: true,
  });
  // Règle 2 de `lodgingFilter` : l'absence de tarif dispense des filtres de
  // prix, pas des autres. `total` vaut 0 quand la source n'a pas publié de
  // prix, et `0 <= budget` faisait passer ces annonces pour gratuites — en tête
  // de liste, et dans tous les budgets.
  const sansPrix = (l: Listing) => !(l.total > 0);
  if (budget != null)
    lp.push({
      id: "budget",
      label: tr("Total : {plage}", { plage: fourchetteLbl(BUDGET, budget) }),
      fn: (l) => sansPrix(l) || dansPlage(l.total, budget, BUDGET.b),
      remove: () => P.setFilters({ budget: null }),
    });
  const lfLbl = (k: (typeof RANGES)[number]["k"], pl: Plage) =>
    tr("{critere} : {plage}", { critere: tr(RANGE[k].label), plage: plageTexte(pl, RANGE[k].b, borneLbl(k)) });
  const { pp, cap: lcap, rooms: lrooms, dist } = lf;
  if (pp != null)
    lp.push({
      id: "pp",
      label: lfLbl("pp", pp),
      fn: (l) => sansPrix(l) || dansPlage(l.total / trav, pp, RANGE.pp.b),
      remove: () => patchLf({ pp: null }),
    });
  if (lcap != null)
    lp.push({
      id: "lcap",
      label: lfLbl("cap", lcap),
      fn: (l) => dansPlage(l.capacity, lcap, RANGE.cap.b),
      remove: () => patchLf({ cap: null }),
    });
  if (lrooms != null)
    lp.push({
      id: "lrooms",
      label: lfLbl("rooms", lrooms),
      fn: (l) => dansPlage(normalizedBedrooms(l), lrooms, RANGE.rooms.b),
      remove: () => patchLf({ rooms: null }),
    });
  if (dist != null)
    lp.push({
      id: "dist",
      // Un palier de la barre garde son nom : « Pied des pistes », « ≤ 500 m ».
      label: DIST_PALIERS_M.some((m) => palierPose(dist, m)) ? palierDistLbl(dist[1]) : lfLbl("dist", dist),
      fn: (l) => dansPlage(distFiltrableM(l), dist, RANGE.dist.b),
      remove: () => patchLf({ dist: null }),
    });
  const srcOn = Object.keys(lf.src).filter((k) => lf.src[k]);
  if (srcOn.length) lp.push({ id: "src", label: srcOn.join(" · "), fn: (l) => srcOn.includes(l.source), remove: () => patchLf({ src: {} }) });
  if (lf.measured) lp.push({ id: "measured", label: tr("Distance mesurée"), fn: (l) => distanceOf(l).kind === "measured", remove: () => patchLf({ measured: false }) });
  if (lf.link) lp.push({ id: "link", label: tr("Lien de réservation"), fn: (l) => !!l.url, remove: () => patchLf({ link: false }) });
  if (lf.photo) lp.push({ id: "photo", label: tr("Avec photo"), fn: (l) => !!l.photo, remove: () => patchLf({ photo: false }) });
  if (lf.firm) lp.push({ id: "firm", label: tr("Prix relevé pour ces dates"), fn: (l) => firmOf(l, stay), remove: () => patchLf({ firm: false }) });
  if (lf.pos) lp.push({ id: "pos", label: tr("Position connue"), fn: (l) => l.lat != null, remove: () => patchLf({ pos: false }) });
  if (lf.full)
    lp.push({
      id: "full",
      label: tr("Fiche complète"),
      fn: (l) => completudeOf(l).ok,
      remove: () => patchLf({ full: false }),
    });
  if (lf.holes)
    lp.push({
      id: "holes",
      label: tr("Fiche incomplète"),
      fn: (l) => !completudeOf(l).ok,
      remove: () => patchLf({ holes: false }),
    });

  const lapply = (ps: Pred[]) => raw.filter((l) => ps.every((p) => p.fn(l)));
  /** Ce que la source n'a pas publié se range **après** ce qu'elle a publié,
   *  jamais au rang de zéro : `?? 0` classait une capacité non annoncée comme
   *  la plus petite de toutes, et un prix non annoncé comme le moins cher. */
  const apres = (v: number | null | undefined) => (v == null || !(v > 0) ? null : v);
  // Dans les deux sens, ce que la source n'a pas publié reste en queue.
  const village = villageM(s);
  /** 0 au niveau du village (ou plus haut), 1 altitude inconnue, 2 en contrebas. */
  const rangStation = (l: Listing) => {
    const a = altDe(l)?.m;
    if (a == null || village == null) return 1;
    return village - a >= ECART_VILLAGE_M ? 2 : 0;
  };
  const tri: Record<LodgeSort, (a: Listing, b: Listing) => number> = {
    station: (a, b) =>
      lsens * (rangStation(a) - rangStation(b)) || parMesure(apres(a.total), apres(b.total), 1),
    pp: (a, b) => parMesure(apres(a.total), apres(b.total), lsens),
    total: (a, b) => parMesure(apres(a.total), apres(b.total), lsens),
    cap: (a, b) => parMesure(a.capacity ?? null, b.capacity ?? null, lsens),
    dist: (a, b) => parMesure(distFiltrableM(a), distFiltrableM(b), lsens),
    alt: (a, b) => parMesure(altDe(a)?.m, altDe(b)?.m, lsens),
    trous: (a, b) => {
      const d = lsens * (completudeOf(a).trous.length - completudeOf(b).trous.length);
      return d !== 0 ? d : parMesure(apres(a.total), apres(b.total), 1);
    },
  };
  const lvis = lapply(lp).sort(tri[lsort]);
  // Un logement par bien : ses offres des autres plateformes se rangent
  // derrière la moins chère (voir `regroupement.ts`). L'identité se calcule
  // une fois, sur tout le relevé : calculée après les filtres, elle changeait
  // avec eux — un filtre qui écartait l'une des deux annonces d'un titre
  // ambigu faisait réunir les autres. Les filtres ne font ensuite que retirer
  // des offres à l'intérieur de chaque logement, et la moins chère de celles
  // qui restent se montre. Le tri porte sur elle, puisque c'est elle qu'on voit.
  const groupesBruts = useMemo(() => regrouper(raw), [raw]);
  const lvisCle = lvis.map((l) => l.id).join(",");
  const logements = useMemo(() => {
    const passe = new Set(lvisCle.split(","));
    const out: Logement[] = [];
    for (const g of groupesBruts) {
      const offres = g.offres.filter((o) => passe.has(o.id));
      if (offres.length) out.push({ principale: offres[0], offres });
    }
    return out.sort((a, b) => tri[lsort](a.principale, b.principale));
    // `tri` est reconstruit à chaque rendu ; son contenu ne dépend que de
    // `lsort` et `lsens`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupesBruts, lvisCle, lsort, lsens, lsort === "alt" || lsort === "station" ? altDe : null]);
  const logementDe = useMemo(() => {
    const m = new Map<string, Logement>();
    for (const g of logements) for (const o of g.offres) m.set(o.id, g);
    return m;
  }, [logements]);
  const principales = useMemo(() => logements.map((g) => g.principale), [logements]);
  // Ce que le cadre de la carte retient. Les logements sans coordonnées
  // restent : ils n'ont pas de cadre, la carte ne peut ni les montrer ni les
  // cacher.
  const parCadre = partagerParBornes(principales, bornes);
  // Sur un grand domaine relié, les logements se rangent par station : la
  // station cherchée d'abord, puis ses voisines (`parStation.ts`).
  const domaineRelie = grandDomaineDe(s.id);
  const nomStation = (id: string) => stationById(id)?.name ?? id;
  const affichees = domaineRelie ? rangerParStation(parCadre.visibles, s.id, nomStation) : parCadre.visibles;
  // Les logements rattachés à aucune station, et pourquoi (`rattachement.ts`).
  // Ils ne sont pas dans la liste : rien ne prouve qu'ils soient ici.
  const nonRattaches = raw.filter((l) => l.domainFit === "unknown" && l.nonRattache);
  const nTropLoin = nonRattaches.filter((l) => l.nonRattache === "trop-loin").length;
  const nSansLieu = nonRattaches.length - nTropLoin;
  const motifsNonRattaches = [
    nTropLoin
      ? trN(nTropLoin, "{n} à plus de {km} km de toute station", "{n} à plus de {km} km de toute station", {
          km: RATTACHEMENT_MAX_KM,
        })
      : null,
    nSansLieu ? trN(nSansLieu, "{n} sans position ni lieu reconnu", "{n} sans position ni lieu reconnu") : null,
  ]
    .filter(Boolean)
    .join(", ");
  // La page en cours. On revient à la première quand le cadre, les filtres ou
  // le tri changent : la page 7 d'une autre liste ne désigne rien.
  const nPages = Math.max(1, Math.ceil(affichees.length / PAGE_LOGEMENTS));
  const page = Math.min(pageL, nPages - 1);
  const pageItems = affichees.slice(page * PAGE_LOGEMENTS, (page + 1) * PAGE_LOGEMENTS);
  // Pendant le relevé, les annonces des sources qui ont déjà répondu se
  // montrent tout de suite ; le relevé figé des autres attend leur réponse.
  const reportees = new Set(liveSources.map((x) => x.source));
  const dejaLus = enReleve ? affichees.filter((l) => reportees.has(l.source)).slice(0, PAGE_LOGEMENTS) : [];
  const sigListe = `${affichees.length}|${affichees[0]?.id ?? ""}|${affichees[affichees.length - 1]?.id ?? ""}|${lsort}|${lsens}`;
  useEffect(() => setPageL(0), [sigListe]);
  // Au changement de page, le focus passe à la liste — la flèche qu'on vient
  // d'utiliser peut se désactiver sous le doigt — et la liste remonte sous le
  // bloc collant, sans animation quand le mouvement est réduit.
  const versListe = useRef(false);
  const allerPage = useCallback((p: number) => {
    versListe.current = true;
    setPageL(p);
  }, []);
  useEffect(() => {
    if (!versListe.current) return;
    versListe.current = false;
    const el = listeRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const bloc = document.querySelector(".bloc7")?.getBoundingClientRect().bottom ?? 0;
    const haut = el.getBoundingClientRect().top;
    if (haut < bloc) {
      const reduit = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: window.scrollY + haut - bloc - 12, behavior: reduit ? "auto" : "smooth" });
    }
  }, [page]);
  const lfree = lp.filter((p) => !p.fixed);
  const kept = raw.find((l) => l.id === P.lodgeId) ?? null;
  // Même calcul qu'ailleurs : le forfait du séjour, résolu pour ses dates,
  // les enfants à leur tarif quand le forfait le publie.
  const pass = prix.budget;
  const adulteForfait = prix.forfaits?.adulte ?? null;
  // Un séjour vendu forfaits compris les porte déjà dans son prix.
  const forfaitsCompris = kept ? forfaitInclus(kept) : false;
  const passGroupN = forfaitsCompris ? 0 : (pass?.total ?? 0);
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
    const capacites = raw.map((l) => l.capacity).filter((g): g is number => g != null);
    const plusGrande = capacites.length ? Math.max(...capacites) : null;
    const muettes = raw.length - capacites.length;
    // Les règles verrouillées ne se retirent pas : chacune dit où elle se règle.
    // Seul le rayon est dans le panneau ; capacité, chambres et dates viennent
    // du séjour, et la position GPS ne se règle nulle part.
    const reglage: Record<string, string> = {
      zone: tr("Élargissez le rayon dans les filtres."),
      cap: tr("Réduisez le nombre de voyageurs du séjour."),
      rooms: tr("Réduisez le nombre de chambres du séjour."),
      dispo: tr("Relancez le relevé ou changez les dates du séjour."),
      gps: tr("Les annonces sans position GPS sont toujours écartées."),
    };
    const annonces = trN(raw.length, "{n} annonce", "{n} annonces");
    const personnes = trN(trav, "{n} personne", "{n} personnes");
    lempty =
      best && best.n > 0
        ? {
            title: tr("Le filtre « {filtre} » ne laisse aucune annonce", { filtre: best.p.label }),
            hint: `${
              raw.length > 1
                ? trN(
                    best.n,
                    "Sans lui, {n} annonce reste sur les {total} du relevé.",
                    "Sans lui, {n} annonces restent sur les {total} du relevé.",
                    { total: raw.length },
                  )
                : tr("Sans lui, l’annonce du relevé reste.")
            }${best.p.remove || !reglage[best.p.id] ? "" : ` ${reglage[best.p.id]}`}`,
            fix: best.p.remove ?? null,
          }
        : {
            title: rooms
              ? tr("Aucune annonce pour {personnes} et {chambres}", {
                  personnes,
                  chambres: trN(rooms, "{n} chambre", "{n} chambres"),
                })
              : tr("Aucune annonce pour {personnes}", { personnes }),
            hint:
              plusGrande != null
                ? tr(
                    "Le relevé compte {annonces} ; la plus grande de celles qui publient leur capacité annonce {capacite}{muettes}. Réduisez le groupe ou attendez un nouveau relevé.",
                    {
                      annonces,
                      capacite: trN(plusGrande, "{n} personne", "{n} personnes"),
                      muettes: muettes
                        ? trN(muettes, ", et {n} n’en publie aucune", ", et {n} n’en publient aucune")
                        : "",
                    },
                  )
                : tr(
                    "Le relevé compte {annonces} et aucune ne publie sa capacité. Réinitialisez les filtres ou attendez un nouveau relevé.",
                    { annonces },
                  ),
            fix: null,
          };
  }

  const sources = [...new Set(raw.map((l) => l.source))];
  const bySrc = (src: string) => raw.filter((l) => l.source === src).length;
  const nCompletes = raw.filter((l) => completudeOf(l).ok).length;
  const nIncompletes = raw.length - nCompletes;
  const toggles: { k: "measured" | "pos" | "link" | "photo" | "firm" | "full" | "holes"; label: string; n: number }[] = [
    { k: "measured", label: tr("Distance mesurée"), n: raw.filter((l) => distanceOf(l).kind === "measured").length },
    { k: "pos", label: tr("Position connue"), n: raw.filter((l) => l.lat != null).length },
    { k: "link", label: tr("Lien de réservation"), n: raw.filter((l) => l.url).length },
    { k: "photo", label: tr("Avec photo"), n: raw.filter((l) => l.photo).length },
    { k: "firm", label: tr("Prix relevé pour ces dates"), n: raw.filter((l) => firmOf(l, stay)).length },
    { k: "full", label: tr("Fiche complète"), n: nCompletes },
    { k: "holes", label: tr("Fiche incomplète"), n: nIncompletes },
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
  const sheetGroupe = sheet ? (logementDe.get(sheet.id) ?? null) : null;
  // L'annonce Airbnb qu'on ouvre et à qui il manque capacité, chambres ou
  // position : elle passe en tête de la lecture (`completerAnnonces`, `lireMaintenant`),
  // puis l'écran la relit sans réseau toutes les `RELECTURE_OUVERTE_MS`, tant
  // que le volet est ouvert et qu'elle reste trouée. La réponse remplace
  // l'annonce affichée (`patchLive`).
  const patchLive = useStay((x) => x.patchLive);
  const lectureOuverte = useRef(new Set<string>());
  const sheetIncomplete = sheet != null && sheet.url != null && aCombler(sheet);
  useEffect(() => {
    if (!sheet || !sheetIncomplete) return;
    const id = sheet.id;
    let fini = false;
    let essais = 0;
    let minuterie: ReturnType<typeof setTimeout> | null = null;
    const tour = () => {
      if (fini) return;
      const brute = (useStay.getState().liveListings ?? []).find((l) => l.id === id);
      if (!brute) return;
      const lire = !lectureOuverte.current.has(id);
      lectureOuverte.current.add(id);
      essais += 1;
      void completerAnnonces({ data: { listings: [brute], lireMaintenant: lire } })
        .then((rows) => {
          if (fini) return;
          patchLive(rows);
          const r = rows.find((x) => x.id === id);
          if (r && aCombler(r) && essais < RELECTURES_OUVERTE_MAX) minuterie = setTimeout(tour, RELECTURE_OUVERTE_MS);
        })
        .catch(() => {
          if (!fini && essais < RELECTURES_OUVERTE_MAX) minuterie = setTimeout(tour, RELECTURE_OUVERTE_MS);
        });
    };
    tour();
    return () => {
      fini = true;
      if (minuterie) clearTimeout(minuterie);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet?.id, sheetIncomplete]);
  /** L'étiquette de sources d'un logement désigné par son offre principale. */
  const groupeLbl = (l: Listing) => {
    const g = logementDe.get(l.id);
    return g ? sourcesLbl(g) : l.source;
  };
  /** Les autres plateformes du logement et leurs prix, pour l'infobulle. */
  const autresLbl = (l: Listing) => {
    const g = logementDe.get(l.id);
    if (!g || g.offres.length < 2) return null;
    return tr("Aussi sur {offres}", {
      offres: g.offres
        .filter((o) => o.id !== l.id)
        .map((o) => `${o.source} (${prixLbl(o)})`)
        .join(", "),
    });
  };

  // Sur la carte, comme sur Airbnb : les logements de la page en cours, et eux
  // seuls. Le cadrage, lui, couvre tout le résultat des filtres : recadrer sur
  // les seules épingles posées reconduisait sans fin le premier cadre (le
  // repère de la station, avant l'arrivée du relevé), et les logements arrivés
  // ensuite hors de lui ne s'affichaient jamais — 515 sur 3 268 à Avoriaz,
  // relevé du 23 septembre 2026.
  // La fiche épinglée sur la carte, la fiche ouverte et le logement retenu
  // gardent leur épingle hors de leur page : sans quoi déplacer la carte (qui
  // ramène en page 1) refermait la fiche épinglée, et le logement retenu
  // disparaissait de la carte dès qu'on changeait de page.
  const designes = [epinglee, sheetId, P.lodgeId]
    .map((id) => (id ? logementDe.get(id)?.principale : undefined))
    .filter((l): l is Listing => !!l && !pageItems.includes(l));
  const situees = [...pageItems, ...new Set(designes)].filter((l) => l.lat != null && l.lon != null);
  const pointsResultat = useMemo(
    () => [
      [s.lat, s.lon] as [number, number],
      ...principales
        .filter((l) => l.lat != null && l.lon != null)
        .map((l) => [l.lat as number, l.lon as number] as [number, number]),
    ],
    [principales, s.lat, s.lon],
  );
  /**
   * L'offre du logement que désigne cet identifiant, ou `null`. Le logement se
   * dit « retenu » quand l'une de ses offres l'est, et l'action porte sur cette
   * offre-là : comparer à la seule principale faisait passer le choix, en
   * silence, d'une plateforme à l'autre au lieu de le retirer.
   */
  const offreDe = (l: Listing, id: string | null | undefined): Listing | null => {
    if (!id) return null;
    return logementDe.get(l.id)?.offres.find((o) => o.id === id) ?? (l.id === id ? l : null);
  };
  const favoris = useIdsFavoris();
  const marqueurs = useMemo(
    () => [
      {
        id: "__station",
        lat: s.lat,
        lon: s.lon,
        nom: tr("{station}, repère de la station", { station: s.name }),
        epingle: epingleRepere(s.name),
        zIndex: ETAGE.repere,
        inerte: true,
      },
      ...situees.map((l) => {
        const sel = offreDe(l, sheetId) != null || offreDe(l, P.lodgeId) != null;
        const vue = logementDe.get(l.id)?.offres.some((o) => P.seen[o.id]) ?? !!P.seen[l.id];
        const etat = sel ? "retenue" : vue ? "vue" : "normale";
        const favori = logementDe.get(l.id)?.offres.some((o) => favoris.has(o.id)) ?? favoris.has(l.id);
        return {
          id: l.id,
          lat: l.lat as number,
          lon: l.lon as number,
          nom: l.title,
          epingle: epinglePrix(prixPin(l), l.title, etat, favori),
          zIndex: sel ? ETAGE.designee : ETAGE.normale,
        };
      }),
    ],
    // Le contenu change avec les annonces situées, leurs offres, la sélection
    // et les vues. `logements` suit le relevé : un prix qui change sans changer
    // d'identifiant se redessine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.id, s.lat, s.lon, s.name, situees.map((l) => l.id).join(","), logements, sheetId, P.lodgeId, P.seen, favoris],
  );
  /** La clé de recadrage suit le **résultat des filtres**, pas le contenu du
   *  cadre : calculée sur le cadre, recadrer changerait la liste, qui changerait
   *  la clé, qui recadrerait — sans fin. Même règle que sur Comparer. */
  const cadrage = useMemo(
    () =>
      `${recadrages}|${s.id}|${lvis.filter((l) => l.lat != null).map((l) => l.id).join(",")}`,
    [s.id, lvis, recadrages],
  );
  const altVillage = villageM(s);
  const carte = (l: Listing) => (
    <CarteLogement
      key={l.id}
      l={l}
      sources={groupeLbl(l)}
      autres={autresLbl(l)}
      retenu={offreDe(l, P.lodgeId)?.id ?? null}
      retenuSource={(() => {
        const r = offreDe(l, P.lodgeId);
        return r && r.id !== l.id ? r.source : null;
      })()}
      vue={logementDe.get(l.id)?.offres.some((o) => P.seen[o.id]) ?? !!P.seen[l.id]}
      vif={actifCarte === l.id}
      stay={stay}
      trav={trav}
      nights={nights}
      ouvrir={openSheet}
      retenir={keep}
      designer={setActifCarte}
      altitude={altDe(l)}
      avecAltitude
      altVillage={altVillage}
      forfaitsGroupe={pass && !pass.manque ? pass.total : null}
    />
  );

  return (
    <Coquille>
      <main className="v7main v7main--serre v7main--pied" id="s-lodging" data-screen-label="2 Logements">
        <OngletsStation s={s} actif="logements" />

        {/* Un seul bloc collant : en-tête, ruban de station et ligne Filtres +
            tri glissent ensemble, et le panneau de filtres s'y ancre. */}
        <div className="bloc7">
          {/* En-tête sur une ligne : le titre à gauche, la pilule de séjour à
              droite. La barre du haut n'en porte pas sur cet écran. */}
          <header className="bloc7__tete">
            <div className="v7tete v7tete--titre">
              <span className="v7surtitre">{tr("Étape 2")}</span>
              <h1>{tr("Logements {lieu}", { lieu: langue() === "en" ? s.name : aStation(s.name) })}</h1>
            </div>
            <div className="sejour7">
              <button
                type="button"
                className="sejour7__pilule"
                data-sejour-ouvre
                title={tr("Changer la station, les dates ou le nombre de voyageurs")}
                aria-expanded={P.stayOpen}
                onClick={() => P.setStayOpen(!P.stayOpen)}
              >
                <span className="sejour7__station">{s.name}</span>
                <span className="sejour7__dates">{datesCourtes(checkIn, checkOut)}</span>
                <span className="sejour7__groupe">{partyLabel(trav, enfants)}</span>
              </button>
              {/* La loupe relance le relevé pour les dates affichées. C'est la
                  seule commande de relance : « Relancer le relevé » doublait
                  l'action. */}
              <button
                type="button"
                className="sejour7__loupe"
                title={tr("Relancer le relevé pour ces dates")}
                aria-label={tr("Relancer le relevé pour ces dates")}
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
              <span className="ruban7__crumb">{crumbDomaine(s)}</span>
              <div className="ruban7__faits">
                <span>
                  <span>{tr("Altitude des pistes")}</span>
                  <b className={altLbl(s) ? undefined : "absent"}>{altLbl(s) ?? tr("non relevée")}</b>
                </span>
                <span>
                  <span>{tr("Pistes, domaine")}</span>
                  <b className={kmLbl(s) ? undefined : "absent"}>{kmLbl(s) ?? tr("km non publié")}</b>
                </span>
                <span>
                  <span>{tr("Remontées, domaine")}</span>
                  <b className={liftsLbl(s) ? undefined : "absent"}>{liftsLbl(s) ?? tr("non relevées")}</b>
                </span>
                <span>
                  <span>{tr("Forfait {n} j", { n: prix.jours ?? 6 })}</span>
                  {adulteForfait?.statut === "resolu" ? (
                    <b title={mentionForfait(adulteForfait)}>
                      {montantCents(adulteForfait.prix, adulteForfait.devise)}
                    </b>
                  ) : (
                    <b className="absent">{adulteForfait ? echecLbl(adulteForfait) : tr("non relevé")}</b>
                  )}
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
              <Icon name="chevron-gauche" taille={14} />
              {tr("Fiche station")}
            </a>
          </section>

          {raw.length ? (
            <>
              <div className="filtres7__barre">
                <button
                  type="button"
                  className={`puce puce--encre${lfOpen ? " puce--on" : ""}`}
                  data-panel-btn="filtres"
                  aria-expanded={lfOpen}
                  onClick={() => setLfOpen((v) => !v)}
                >
                  <Icon name="filtres" taille={14} />
                  {tr("Filtres")}
                  {lfree.length ? <span className="puce__badge">{lfree.length}</span> : null}
                </button>
                {DIST_PALIERS_M.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`puce${palierPose(lf.dist, m) ? " puce--on" : ""}`}
                    onClick={() => patchLf({ dist: palierPose(lf.dist, m) ? null : [0, m] })}
                  >
                    {palierDistLbl(m)}
                  </button>
                ))}
                {lfree.map((p) => {
                  const bloque = lempty?.fix != null && lempty.fix === p.remove;
                  return (
                    <span key={p.id} className={`jeton${bloque ? " jeton--bloque" : ""}`}>
                      {p.label}
                      <button
                        type="button"
                        aria-label={tr("Retirer le critère {critere}", { critere: p.label })}
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
                    {tr("Tout réinitialiser")}
                  </a>
                ) : null}
                <span className="filtres7__espace" />
                {enReleve ? (
                  <LigneReleve trouves={dejaLus.length} />
                ) : (
                <span className="filtres7__compte">
                  {logements.length === 0
                    ? tr("Aucun logement disponible")
                    : `${trN(logements.length, "{n} logement disponible", "{n} logements disponibles")}${
                        lvis.length > logements.length ? ` · ${trN(lvis.length, "{n} offre", "{n} offres")}` : ""
                      }`}
                  {nonRattaches.length
                    ? ` · ${trN(nonRattaches.length, "{n} non rattaché ({motifs})", "{n} non rattachés ({motifs})", {
                        motifs: motifsNonRattaches,
                      })}`
                    : ""}
                </span>
                )}
                <select className="select7" value={lsort} onChange={(e) => choisirTri(e.target.value as LodgeSort)}>
                  {TRIS_LOGEMENT.map((t) => (
                    <option key={t.k} value={t.k}>
                      {tr(t.label)}
                    </option>
                  ))}
                </select>
                <SensTri sens={lsens} onChange={setLsens} />
              </div>

              {lfOpen ? (
                <div className="bloc7__ancre">
                  <div className="pop7 pop7--filtres pop7--large" ref={panneauFiltres}>
                    <div className="pop7__tete pop7__tete--ligne">
                      <strong>{tr("Filtres")}</strong>
                      <button type="button" className="v7fermer" aria-label={tr("Fermer")} onClick={() => setLfOpen(false)}>
                        <Icon name="croix" taille={14} />
                      </button>
                    </div>
                    <div className="pop7__bloc pop7__bloc--premier">
                      <span className="v7surtitre">{tr("Périmètre de recherche")}</span>
                      <span className="pop7__note">
                        {tr("Distance au centre de la station. Une annonce sans position GPS est écartée.")}
                      </span>
                      <div className="pop7__puces">
                        {RAYONS_KM.map((km) => (
                          <button
                            key={km}
                            type="button"
                            className={`puce puce--rayon${rayonMax === km ? " puce--on" : ""}`}
                            onClick={() => patchLf({ rayon: [Math.min(rayonMin, km - 1), km] })}
                          >
                            {km} km
                          </button>
                        ))}
                      </div>
                      <Fourchette
                        lbl={tr("Distance au centre")}
                        bornes={ECHELLE_RAYON}
                        valeur={lf.rayon}
                        pas={1}
                        unite="km"
                        resume={rayonLbl(lf.rayon)}
                        onPoser={poserRayon}
                      />
                    </div>
                    <div className="pop7__bloc pop7__bloc--serre">
                      <span className="v7surtitre">{tr("Prix et taille")}</span>
                      <span className="pop7__note">
                        {tr(
                          "Le filtre « Capacité ≥ {n} » est toujours appliqué ; ces fourchettes s’y ajoutent. Hors prix, elles écartent les annonces qui ne publient pas la valeur. Chaque borne se tape.",
                          { n: trav },
                        )}
                      </span>
                    </div>
                    <div className="fourchettes7 fourchettes7--deux">
                      <FourchetteRecherche r={BUDGET} />
                      {RANGES.map((r) => (
                        <Fourchette
                          key={r.k}
                          lbl={tr(r.label)}
                          bornes={r.b}
                          valeur={lf[r.k]}
                          pas={r.pas}
                          unite={r.unit}
                          resume={plageTexte(lf[r.k], r.b, borneLbl(r.k))}
                          onPoser={(which, v, exact) => poserLf(r.k, which, v, exact)}
                        />
                      ))}
                    </div>
                    <div className="pop7__bloc">
                      <span className="v7surtitre">{tr("Source")}</span>
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
                      <span className="v7surtitre">{tr("Qualité du relevé")}</span>
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
                            <span className="pop7__n">
                              {trN(tg.n, "{n} annonce", "{n} annonces")}
                            </span>
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
                        {tr("Réinitialiser")}
                      </a>
                      <button type="button" className="btn7" onClick={() => setLfOpen(false)}>
                        {trN(affichees.length, "Voir {n} logement", "Voir {n} logements")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : enReleve ? (
            /* Premier relevé : pas encore de barre de filtres, mais l'écran
               doit dire qu'il travaille. */
            <div className="filtres7__barre">
              <LigneReleve />
            </div>
          ) : null}
          {enReleve ? <span className="rech7__jauge" aria-hidden="true" /> : null}
        </div>

        {raw.length || enReleve ? (
          <div className="v7deux">
            <div className="v7deux__liste" ref={listeRef} tabIndex={-1} aria-label={tr("Logements de la page")}>
              {enReleve && !dejaLus.length ? (
                <SquelettesLogements />
              ) : enReleve ? (
                <div className="grille7-2" data-testid="lodging-progressive-grid">
                  {dejaLus.map(carte)}
                  <Squelettes n={dejaLus.length % 2 ? 1 : 2} />
                </div>
              ) : affichees.length ? (
                <>
                <div className="grille7-2">
                  {domaineRelie
                    ? pageItems.map((l, i) => {
                        const st = stationDuLogement(l, s.id);
                        const avant = i > 0 ? stationDuLogement(pageItems[i - 1]!, s.id) : null;
                        const n = affichees.filter((x) => stationDuLogement(x, s.id) === st).length;
                        return (
                          <Fragment key={l.id}>
                            {st !== avant ? (
                              <h3 className="grille7-2__station">
                                {nomStation(st)}
                                <span>{trN(n, "{n} logement", "{n} logements")}</span>
                              </h3>
                            ) : null}
                            {carte(l)}
                          </Fragment>
                        );
                      })
                    : pageItems.map(carte)}
                </div>
                {nPages > 1 ? <Pages page={page} n={nPages} aller={allerPage} /> : null}
                </>
              ) : lvis.length ? (
                <Vide
                  titre={tr("Aucune annonce dans ce cadrage")}
                  actions={
                    <button type="button" className="btn7" onClick={revoirTout}>
                      {tr("Revoir toutes les annonces")}
                    </button>
                  }
                >
                  {tr("La liste suit la carte. Déplacez-la, dézoomez ou revenez au cadrage des résultats.")}
                </Vide>
              ) : lempty ? (
                <Vide
                  titre={lempty.title}
                  actions={
                    <>
                      {lempty.fix ? (
                        <button type="button" className="btn7" onClick={lempty.fix}>
                          {tr("Retirer ce filtre")}
                        </button>
                      ) : null}
                      <button type="button" className="btn7 btn7--fantome" onClick={reinitialiser}>
                        {tr("Tout réinitialiser")}
                      </button>
                    </>
                  }
                >
                  {lempty.hint}
                </Vide>
              ) : null}
            </div>
            <div
              className={`v7deux__carte v7deux__carte--bas${enReleve ? " rech7-carte" : ""}`}
            >
              <CarteEpingles
                marqueurs={marqueurs}
                cadrage={cadrage}
                cadrerSur={pointsResultat}
                surFixe={setEpinglee}
                maxZoom={14}
                surBornes={setBornes}
                actif={actifCarte}
                surActif={setActifCarte}
                ficheDe={(id) => {
                  const l = raw.find((x) => x.id === id);
                  if (!l) return null;
                  return (
                    <FicheEpingle
                      l={l}
                      sources={groupeLbl(l)}
                      stay={stay}
                      trav={trav}
                      nights={nights}
                    />
                  );
                }}
                actionsDe={(id) => {
                  const l = lvis.find((x) => x.id === id);
                  if (!l) return null;
                  const r = offreDe(l, P.lodgeId);
                  return (
                    <>
                      <button type="button" className="btn7" onClick={() => openSheet(id)}>
                        {tr("Voir l’annonce")}
                      </button>
                      <button
                        type="button"
                        className="btn7 btn7--fantome"
                        aria-pressed={r != null}
                        onClick={() => keep(r?.id ?? l.id)}
                      >
                        {r ? tr("Retenu") : tr("Retenir")}
                      </button>
                    </>
                  );
                }}
                legende={
                  enReleve ? (
                    /* La légende garde sa place et dit ce qui se passe, plutôt
                       que d'annoncer un compte encore faux. */
                    <b>{tr("Les épingles se posent au fil du relevé.")}</b>
                  ) : (
                    <>
                      <b>
                        {nPages > 1 ? `${tr("Page {page} sur {n}", { page: page + 1, n: nPages })} · ` : ""}
                        {trN(affichees.length, "{n} logement dans le cadre", "{n} logements dans le cadre")}
                      </b>
                      {parCadre.horsCadre.length ? (
                        <button type="button" className="carte7__revoir" onClick={revoirTout}>
                          {logements.length > 1 ? tr("Revoir les {n} logements", { n: logements.length }) : tr("Revoir le logement")}
                          <Icon name="fleche-droite" taille={14} />
                        </button>
                      ) : null}
                    </>
                  )
                }
              />
              {enReleve && !dejaLus.length ? <span className="rech7__voile" aria-hidden="true" /> : null}
            </div>
          </div>
        ) : (
          <Vide
            titre={tr("Aucune annonce relevée pour {station}", { station: s.name })}
            actions={
              <>
                <button type="button" className="btn7" onClick={relancer} disabled={searching}>
                  {searching ? tr("Relevé en cours…") : tr("Lancer le relevé")}
                </button>
              </>
            }
          >
            {tr("Aucune plateforme n’a renvoyé d’annonce pour ces dates. Relancez le relevé ou changez de dates.")}
          </Vide>
        )}
      </main>

      {kept ? (
        <div className="pied7">
          <div className="pied7__retenu">
            <span className="v7surtitre">{tr("Logement retenu")}</span>
            <strong>
              {kept.title} · {kept.source}
            </strong>
          </div>
          <dl className="pied7__postes">
            <div>
              <dt>{tr("Logement")}</dt>
              <dd className={kept.total > 0 ? undefined : "absent"}>
                {kept.total > 0 ? eurCents(kept.total) : tr("non publié")}
              </dd>
            </div>
            <div>
              <dt
                title={
                  forfaitsCompris
                    ? tr("compris dans le prix du logement")
                    : pass?.periode
                      ? `${pass.detail} ; ${pass.periode}`
                      : pass?.detail
                }
              >
                {forfaitsCompris ? tr("Forfaits") : (pass?.libelle ?? tr("Forfaits"))}
              </dt>
              <dd className={forfaitsCompris || pass?.total != null ? undefined : "absent"}>
                {forfaitsCompris
                  ? tr("compris")
                  : pass?.total != null
                    ? montantCents(passGroupN, pass.devise)
                    : (pass?.manque ?? tr("non relevés"))}
                {/* La période du forfait compté : le total en dépend. */}
                {!forfaitsCompris && pass?.periodeCourte ? (
                  <span className="pied7__periode">{pass.periodeCourte}</span>
                ) : null}
                {/* Le total monte quand les enfants sont comptés au tarif
                    adulte, faute de tarif enfant relevé : la fiche et la
                    réservation le disent, le pied aussi, et pas seulement dans
                    l'infobulle du libellé. Deux lignes courtes, pour ne pas
                    élargir le pied au détriment du logement retenu. */}
                {!forfaitsCompris && pass?.enfantsAuTarifAdulte ? (
                  <span className="pied7__alerte">
                    <span>{tr("enfants au tarif adulte,")}</span> <span>{tr("tarif enfant non communiqué")}</span>
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>{tr("Trajet")}</dt>
              <dd className="absent">{tr("non calculé")}</dd>
            </div>
          </dl>
          <div className="pied7__total">
            <span>{tr("Total du séjour")}</span>
            <b>{kept.total > 0 ? eurCents(totalN) : tr("logement non tarifé")}</b>
            <span>
              {kept.total > 0
                ? tr("{prix} par personne", { prix: eurCents(Math.round((totalN / trav) * 100) / 100) ?? "" })
                : tr("total incomplet")}
            </span>
          </div>
          <button type="button" className="btn7 btn7--grand" onClick={() => void go("booking")}>
            {tr("Passer à la réservation")}
            <Icon name="fleche-droite" taille={16} />
          </button>
        </div>
      ) : null}

      {sheet ? (
        <VoletAnnonce
          l={sheet}
          stay={stay}
          trav={trav}
          nights={nights}
          groupe={sheetGroupe}
          retenu={P.lodgeId === sheet.id}
          onRetenir={() => keep(sheet.id)}
          onFermer={fermerVolet}
          onVoirOffre={openSheet}
        />
      ) : null}
    </Coquille>
  );
}
