/** Logements – maquette Airbnb (`Skitrack App.dc.html`, bloc Logements).
 *
 *  Le titre de la station et son séjour, la mise à jour des prix et le tri ;
 *  le bandeau collant des catégories et le bouton « Filtres » (fenêtre
 *  centrée) ; les critères posés ; puis la grille des cartes d'annonce, et en
 *  mode carte la carte aux pastilles de prix fixée à droite. La fiche de
 *  l'annonce s'ouvre dans une fenêtre flottante ; un pied fixe totalise le
 *  logement retenu et les forfaits.
 *
 *  Données : annonces relevées du dépôt (`listingsForStay`) et recherche en
 *  direct (`searchStay`), telles que la route existante les chargeait – le
 *  code de collecte n'est pas touché. « Relancer le relevé » relance cette
 *  recherche. */

import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { useGo } from "@/components/v6/go";
import { BasculeVue, ICONES, PuceCritere, RangeeCategories, Trace } from "@/components/maquette";
import {
  CATEGORIES_LOGEMENTS,
  EQUIPEMENTS_MAQUETTE,
  ICONE_EQUIPEMENT,
  TYPES_LOGEMENT,
  type CleCategorie,
} from "@/components/logements/categories";
import { ModaleFiltresLogements, type ModePrix } from "@/components/logements/ModaleFiltresLogements";
import { CarteEpingles } from "@/components/v7/CarteEpingles";
import { CarteLogement, ECART_VILLAGE_M } from "@/components/v7/CarteLogement";
import { epingleCentre, epinglePrix, ETAGE } from "@/components/v7/epingle";
import { FicheEpingle } from "@/components/v7/FicheEpingle";
import { Fourchette } from "@/components/v7/Fourchette";
import { FourchetteRecherche } from "@/components/v7/FourchettesRecherche";
import { VoletAnnonce } from "@/components/v7/VoletAnnonce";
import { partagerParBornes, type Bornes } from "@/lib/carte";
import { grandDomaineDe } from "@/lib/grandsDomaines";
import { RATTACHEMENT_MAX_KM } from "@/lib/villages";
import { rangerParStation, stationDuLogement } from "@/lib/stay/parStation";
import { aTraduire, dire, tr, trN } from "@/lib/i18n";
import { langueIntl } from "@/lib/i18n/langue";
import { usePrixForfait } from "@/components/v7/usePrixForfait";
import { listingsForStay, type Listing } from "@/lib/listings";
import { eleKey, listingEleM, useElevations } from "@/lib/elevations";
import { getListingElevations } from "@/lib/snow/api";
import { completudeOf } from "@/lib/stay/completude";
import { EQUIPEMENTS_FICHE } from "@/lib/stay/equipements";
import { aEquipement, noteAuMoins, noteSur5De } from "@/lib/stay/ficheEnrichie";
import type { TypeLogement } from "@/lib/stay/logement";
import { enrichirListing } from "@/lib/stay/enrichir";
import {
  DIST_PALIERS_M,
  geoReasonFor,
  gpsPrecis,
  normalizedBedrooms,
  RAYON_DEFAUT_KM,
} from "@/lib/stay/lodgingFilter";
import { fourchetteLbl } from "@/lib/filtres";
import { dansPlage, plageTexte, poserBorne, type Echelle, type Plage } from "@/lib/plage";
import { parMesure, type Sens } from "@/lib/tri";
import { dm, ECHELLES, eurCents, fmt, useParcours, useSejour } from "@/lib/parcours";
import { montantCents } from "@/lib/devises";
import { forfaitInclus } from "@/lib/stay/forfaitInclus";
import { agencesDuReleve } from "@/lib/scrape/domaine";
import {
  searchStay,
  completerAnnonces,
  lireSuiteAirbnb,
  lireSuiteBooking,
  lireSuiteGites,
  lireSuiteHomeToGo,
  completerReleve,
  PAUSE_DELAI,
  SEARCH_PART_MS,
  DEVIS_MS,
  TARIF_MS,
} from "@/lib/searchStay";
import { airbnbComplet, pointPublie } from "@/lib/stay/priseFiche";
import { stationById, type Station } from "@/lib/stations";
import { useStay } from "@/lib/stay";
import { estPauseApi, estTimeout, withDeadline } from "@/lib/stay/deadline";
import { conserverDevisGites, estOffreGitesVerifiee } from "@/lib/stay/tarif";
import { regrouper, sourcesLbl, type Logement } from "@/lib/stay/regroupement";
import { voisinDansListe } from "@/lib/stay/visionneuse";
import { jumelageGpsAirbnb } from "@/lib/stay/recopie";
import { distRemonteePublieeM, estPointPublie, placerSansPoint } from "@/lib/stay/situer";
import { photosDeResidence } from "@/lib/stay/photoResidence";
import { useFavoris, useIdsFavoris } from "@/lib/favoris/store";
import { useAltitudes } from "@/lib/altitude/store";
import { attachAccess } from "@/lib/access";
import { estFicheGitesIntrouvable } from "@/lib/stay/ficheGites";
import { distanceOf, firmOf, persLbl, prixLbl, prixPin, villageM } from "@/lib/v7";

export const Route = createFileRoute("/logements")({ component: Logements });

type LodgeSort = "station" | "pp" | "total" | "cap" | "dist" | "alt" | "note" | "trous";

/** Les critères du tri ; le sens se choisit à côté. Chacun part dans son sens
 *  de départ : le moins cher, le plus grand, le plus près d'abord, et les
 *  fiches qui ont le plus de trous d'abord. */
const TRIS_LOGEMENT: { k: LodgeSort; label: string; sens: Sens }[] = [
  // Ceux qui dorment au niveau du village d'abord, puis du moins cher au plus
  // cher : « Logements à Val Thorens » ne commence plus par Orelle.
  { k: "station", label: aTraduire("Tri : près du centre d’abord"), sens: 1 },
  { k: "pp", label: aTraduire("Tri : prix par personne"), sens: 1 },
  { k: "total", label: aTraduire("Tri : prix total"), sens: 1 },
  { k: "dist", label: aTraduire("Tri : distance"), sens: 1 },
  // Le plus haut d'abord : la neige y tient mieux.
  { k: "alt", label: aTraduire("Tri : altitude"), sens: -1 },
  { k: "cap", label: aTraduire("Tri : capacité"), sens: -1 },
  // La mieux notée d'abord ; une annonce sans note reste en queue.
  { k: "note", label: aTraduire("Tri : note des avis"), sens: -1 },
  { k: "trous", label: aTraduire("Tri : fiches incomplètes d’abord"), sens: -1 },
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
  /** Les équipements demandés, par clé normalisée (`stay/equipements.ts`) :
   *  seuls passent les logements qui les listent comme présents. */
  equip: readonly string[];
  /** La note des avis au moins égale à ce seuil, **sur 5**. */
  noteMin: number | null;
  /** Le type de logement (`lodgingType`), ou tous. */
  type: TypeLogement | null;
  /** Couchages annoncés, au moins ; 0 : tous. */
  beds: number;
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
  equip: [],
  noteMin: null,
  type: null,
  beds: 0,
};

/** Les seuils de note proposés, sur 5. */
const SEUILS_NOTE: readonly number[] = [3.5, 4, 4.5];

/** Le budget est à part : il est lu et écrit sur le magasin partagé. */
const BUDGET = { k: "budget" as const, label: aTraduire("Budget du séjour"), ...ECHELLES.budget, unit: "€" };

/** Les fourchettes propres à cet écran. Chacune était un seuil — « au plus »
 *  pour le prix et la distance, « au moins » pour la capacité et les
 *  chambres — dont elle garde l'échelle ; la borne haute au bout veut dire
 *  « et plus ». */
const RANGES: { k: "pp" | "cap" | "rooms" | "dist"; label: string; b: Echelle; pas: number; unit: string }[] = [
  { k: "pp", label: aTraduire("Prix par personne"), b: [0, 800], pas: 25, unit: "€" },
  { k: "cap", label: aTraduire("Capacité"), b: [1, 16], pas: 1, unit: aTraduire("pers.") },
  { k: "rooms", label: aTraduire("Chambres"), b: [0, 7], pas: 1, unit: aTraduire("ch.") },
  { k: "dist", label: aTraduire("Distance aux remontées"), b: [0, 2000], pas: 100, unit: "m" },
];
const RANGE = Object.fromEntries(RANGES.map((r) => [r.k, r])) as Record<(typeof RANGES)[number]["k"], (typeof RANGES)[number]>;

/** Une borne de fourchette en toutes lettres : « 6 pers. », « 2 ch. ». Zéro
 *  chambre se dit « Studio », jamais « 0 ch. », comme sur les cartes. */
function borneLbl(k: (typeof RANGES)[number]["k"]): (v: number) => string {
  return (v) => (k === "rooms" && v === 0 ? tr("Studio") : `${fmt(v)} ${tr(RANGE[k].unit)}`);
}

/** Les périmètres proposés, en km, comme la maquette (`rayonOpts`) :
 *  « Indifférent » garde le périmètre par défaut de la recherche. */
const RAYONS_PASTILLES_KM: readonly number[] = [1, 3, 5, 10];

/** Les paliers de distance aux remontées de la maquette (`palierOpts`). */
const PALIERS_M: readonly number[] = DIST_PALIERS_M.filter((m) => m <= 1000);

/** Un palier de distance posé depuis la barre : de 0 à `m`. */
function palierPose(pl: Plage, m: number): boolean {
  return pl != null && pl[0] === 0 && pl[1] === m;
}

/** Le critère posé par un palier, comme la maquette (`lPreds`) : « Pied des
 *  pistes », « Remontées à 500 m maximum ». */
function palierPuceLbl(m: number): string {
  if (m <= 200) return tr("Pied des pistes");
  return tr("Remontées à {distance} maximum", {
    distance: m >= 1000 && m % 1000 === 0 ? `${m / 1000} km` : `${m} m`,
  });
}

function palierDistLbl(m: number): string {
  if (m <= 200) return tr("Pied des pistes");
  if (m >= 1000 && m % 1000 === 0) return `≤ ${m / 1000} km`;
  return `≤ ${m} m`;
}

/** Le temps qu'on laisse aux critères pour se poser avant de relancer la recherche. */
const RELANCE_MS = 800;
/**
 * Les pages de liste encore à lire arrivent par `lireSuiteAirbnb` (aucun appel
 * à Airbnb : le cache du serveur). La relecture des fiches, elle, pose ce que
 * la mémoire a déjà, y compris une annonce complète à qui il manque encore sa
 * fiche. Elle ne relance pas un catalogue arrêté sur un refus.
 */
const RELECTURE_AIRBNB_MS = 15_000;
/** Au plus 45 min après la recherche, comme les 45 relectures d'une minute d'avant. */
const RELECTURES_AIRBNB_MAX = 180;
/** L'annonce ouverte se relit plus souvent, sans réseau, deux minutes au plus. */
const RELECTURE_OUVERTE_MS = 4_000;
const RELECTURES_OUVERTE_MAX = 30;
/** La suite de pages ajoute des annonces : on relit le cache, sans réseau. */
const SUITE_AIRBNB_MS = 8_000;
const SUITES_AIRBNB_MAX = 150;
/** Douze pages Booking à ~8 s, plus la requête : trois minutes couvrent la suite. */
const SUITE_BOOKING_MS = 8_000;
const SUITES_BOOKING_MAX = 24;
/** La suite ITEA lit une fiche toutes les ~2 s. Huit minutes de relecture. */
const SUITE_GITES_MS = 8_000;
const SUITES_GITES_MAX = 60;
/** La suite HomeToGo lit un lot de détails toutes les ~2 s. Huit minutes de relecture. */
const SUITE_HTG_MS = 8_000;
const SUITES_HTG_MAX = 60;

/**
 * Une annonce Airbnb à qui il manque GPS, capacité ou chambres, et que la
 * tâche de fond peut encore combler. Lue et à point (`pdpLue`), ce qui lui
 * manque, sa page ne le publie pas. Sans point, sa page se relit encore : elle
 * donne un point de repli que la mémoire des fiches ne garde pas. Un point
 * triangulé (`raw`, `placerSansPoint`) n'en est pas un : `pointPublie`.
 */
function aCombler(l: Listing): boolean {
  if (l.source === "Airbnb") return !airbnbComplet(l) && !(l.pdpLue === true && pointPublie(l));
  // Hors Airbnb : une fiche que la tâche de fond lit encore, à qui il manque
  // la capacité, ou les chambres sans pièces dont les tirer.
  return Boolean(l.url) && (l.capacity == null || (l.bedrooms == null && !(l.rooms != null && l.rooms > 0)));
}

/** Trous de fiche, ou annonce Airbnb dont la fiche enrichie n'est pas encore posée. */
function aRelire(l: Listing): boolean {
  return aCombler(l) || (l.source === "Airbnb" && l.fiche == null);
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
  const ajouterLive = useStay((s) => s.ajouterLive);
  const setSearching = useStay((s) => s.setSearching);
  const setLive = useStay((s) => s.setLive);
  // La première recherche part tout de suite ; les suivantes attendent que les
  // critères se posent (voir plus bas).
  const premiere = useRef(true);
  const dernierNonce = useRef(searchNonce);

  useEffect(() => {
    if (!station) return;
    let cancelled = false;
    // Une par part lancée : `run` compte, `finish` décompte. Un nombre écrit à
    // la main restait à 6 quand HomeToGo a fait la septième part, et
    // `searching` retombait avant la plus lente — l'écran se disait fini, et
    // le relevé Prix (`attendreLogements`) repartait sur des hôtes encore
    // interrogés par Logements.
    let pending = 0;
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
    let suiteTimer: ReturnType<typeof setTimeout> | null = null;
    let toursSuite = 0;
    let bookingTimer: ReturnType<typeof setTimeout> | null = null;
    let toursBooking = 0;
    let gitesTimer: ReturnType<typeof setTimeout> | null = null;
    let toursGites = 0;
    let htgTimer: ReturnType<typeof setTimeout> | null = null;
    let toursHtg = 0;
    // Trous, et annonces Airbnb sans fiche : la mémoire se pose sans réseau.
    const aRelireMaintenant = (rows: readonly Listing[]) => rows.filter(aRelire);
    const planifierRelecture = (rows: readonly Listing[]) => {
      if (cancelled || relectures >= RELECTURES_AIRBNB_MAX || aRelireMaintenant(rows).length === 0) return;
      relecture = setTimeout(relireAirbnb, RELECTURE_AIRBNB_MS);
    };
    const relireAirbnb = () => {
      if (cancelled) return;
      relectures += 1;
      const actuelles = aRelireMaintenant(useStay.getState().liveListings ?? []);
      if (actuelles.length === 0) return;
      void completerAnnonces({ data: { listings: actuelles } })
        .then((rows) => {
          if (cancelled) return;
          patchLive(rows);
          planifierRelecture(useStay.getState().liveListings ?? rows);
        })
        .catch(() => {
          // Réseau ou pause Airbnb : on réessaie à l'intervalle suivant.
          planifierRelecture(actuelles);
        });
    };
    const relireSuite = () => {
      if (cancelled || !station) return;
      toursSuite += 1;
      void lireSuiteAirbnb({
        data: {
          stationId: station.id,
          stationName: station.name,
          lat: station.lat,
          lon: station.lon,
          checkIn,
          checkOut,
          guests,
          bedrooms,
        },
      })
        .then((rows) => {
          if (cancelled || rows.length === 0) return;
          ajouterLive(rows);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled && toursSuite < SUITES_AIRBNB_MAX) suiteTimer = setTimeout(relireSuite, SUITE_AIRBNB_MS);
        });
    };
    const relireBooking = () => {
      if (cancelled || !station) return;
      toursBooking += 1;
      void lireSuiteBooking({
        data: {
          stationId: station.id,
          stationName: station.name,
          lat: station.lat,
          lon: station.lon,
          checkIn,
          checkOut,
          guests,
          bedrooms,
        },
      })
        .then((rows) => {
          if (cancelled || rows.length === 0) return;
          ajouterLive(rows);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled && toursBooking < SUITES_BOOKING_MAX) bookingTimer = setTimeout(relireBooking, SUITE_BOOKING_MS);
        });
    };
    const relireGites = () => {
      if (cancelled || !station) return;
      toursGites += 1;
      void lireSuiteGites({
        data: {
          stationId: station.id,
          stationName: station.name,
          lat: station.lat,
          lon: station.lon,
          checkIn,
          checkOut,
          guests,
          bedrooms,
        },
      })
        .then((rows) => {
          if (cancelled || rows.length === 0) return;
          // La fiche remplace sa tuile ; celle dont la tuile n'avait pas de
          // devis, et n'était donc pas rendue, s'ajoute.
          patchLive(rows);
          ajouterLive(rows);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled && toursGites < SUITES_GITES_MAX) gitesTimer = setTimeout(relireGites, SUITE_GITES_MS);
        });
    };
    const relireHomeToGo = () => {
      if (cancelled || !station) return;
      toursHtg += 1;
      void lireSuiteHomeToGo({
        data: {
          stationId: station.id,
          stationName: station.name,
          lat: station.lat,
          lon: station.lon,
          checkIn,
          checkOut,
          guests,
          bedrooms,
        },
      })
        .then((rows) => {
          if (cancelled || rows.length === 0) return;
          // Déjà à l'écran : le détail remplace. Un squelette qui gagne un titre s'ajoute.
          patchLive(rows);
          ajouterLive(rows);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled && toursHtg < SUITES_HTG_MAX) htgTimer = setTimeout(relireHomeToGo, SUITE_HTG_MS);
        });
    };
    const run = (part: "airbnb" | "gites" | "cozy" | "centrales" | "greengo" | "hometogo" | "agences") => {
      pending += 1;
      const wait =
        part === "gites"
          ? SEARCH_PART_MS + DEVIS_MS + 6_000
          : part === "centrales"
            ? SEARCH_PART_MS + TARIF_MS + 6_000
            : SEARCH_PART_MS + 6_000;
      void withDeadline(searchStay({ data: { ...payload, part } }), wait, part)
        .then((res) => {
          if (cancelled) return;
          if (part === "airbnb" && toursSuite === 0) relireSuite();
          if (part === "cozy" && toursBooking === 0 && res.sources.some((s) => s.source === "Booking" && s.ok && s.count > 0)) {
            relireBooking();
          }
          // Le relevé retire les tuiles sans devis : on ne peut pas les y
          // chercher. Le rapport de la source suffit, et la relecture ne fait
          // que lire la mémoire du serveur.
          if (
            part === "gites" &&
            toursGites === 0 &&
            res.sources.some((s) => s.source === "Gîtes de France" && s.ok && s.count > 0)
          ) {
            relireGites();
          }
          if (
            part === "hometogo" &&
            toursHtg === 0 &&
            (res.sources.some((s) => /détail en suite/.test(s.note ?? "")) ||
              res.listings.some((l) => /détail HomeToGo non lu/.test(l.proven)))
          ) {
            relireHomeToGo();
          }
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
                    : part === "hometogo"
                      ? dump.filter((l) => l.source === "HomeToGo")
                      : dump.filter((l) => l.source === "Abritel" || l.source === "Booking");
          if (fallback.length || part === "hometogo") mergeLive(fallback, res.sources);
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
          } else if (part === "hometogo") {
            mergeLive(
              frozenRef.current.filter((l) => l.source === "HomeToGo"),
              [{ source: "HomeToGo", ok: false, count: 0, ms: 0, error }],
            );
          } else if (part === "agences") {
            mergeLive(
              [],
              // Celles de la station et de ses stations reliées : l'écran
              // relève tout le grand domaine (`scrape/domaine.ts`).
              [...agencesDuReleve({ ...payload, domaine: true }).keys()].map((source) => ({
                source,
                ok: false,
                count: 0,
                ms: 0,
                error,
              })),
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
      // HomeToGo : le comparateur, paginé jusqu'au compteur qu'il publie.
      run("hometogo");
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
      if (suiteTimer) clearTimeout(suiteTimer);
      if (bookingTimer) clearTimeout(bookingTimer);
      if (gitesTimer) clearTimeout(gitesTimer);
      if (htgTimer) clearTimeout(htgTimer);
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

type Pred = {
  id: string;
  label: string;
  fn: (l: Listing) => boolean;
  fixed?: boolean;
  remove?: () => void;
  /** Une catégorie du bandeau : elle ne compte pas dans la pastille « Filtres ». */
  cat?: boolean;
};

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
        <main className="lg-main" id="s-lodging" data-screen-label="2 Logements" />
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

/** La ligne d'état du relevé, sous le titre, à la place du compteur. */
function LigneReleve({ trouves = 0 }: { trouves?: number }) {
  return (
    <span className="lg-releve" aria-busy="true">
      <span className="lg-releve__points" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span role="status" aria-live="polite" data-testid="lodging-search-status">
        {trouves > 0
          ? trN(trouves, "{n} logement, recherche en cours…", "{n} logements, recherche en cours…")
          : tr("Recherche de logements disponibles…")}
      </span>
    </span>
  );
}

/**
 * Des squelettes de carte : la photo et trois lignes, à la taille des cartes
 * qu'ils annoncent, pour que la page ne saute pas à l'arrivée des résultats.
 */
function Squelettes({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={`sk-${i}`} className="lg-squelette" aria-hidden="true">
          <span className="lg-squelette__photo" />
          <span className="lg-squelette__barre lg-squelette__barre--titre" />
          <span className="lg-squelette__barre" />
          <span className="lg-squelette__barre lg-squelette__barre--court" />
        </div>
      ))}
    </>
  );
}

/** Logements ajoutés par « Afficher plus », comme dans la maquette. */
const PAS_LOGEMENTS = 24;

/** La hauteur de la barre du haut de la coquille, collée en haut de page :
 *  le bandeau des catégories se colle juste dessous. */
function useHauteurEntete(): number {
  const [h, setH] = useState(68);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".v7haut");
    if (!el) return;
    const lire = () => setH(el.getBoundingClientRect().height);
    lire();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(lire);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return h;
}

/**
 * La place de la carte fixée à droite : son haut suit le bas du bandeau des
 * catégories, sous lui au départ, puis sous la barre du haut quand le bandeau
 * s'y colle ; son bas laisse la place du pied du logement retenu.
 */
function usePlaceCarte(
  actif: boolean,
  bandeau: RefObject<HTMLDivElement | null>,
  avecPied: boolean,
): { top: number; bottom: number } {
  const [place, setPlace] = useState({ top: 160, bottom: 24 });
  useEffect(() => {
    if (!actif) return;
    let image = 0;
    const lire = () => {
      image = 0;
      // Comme la maquette (`onScroll`) : 15 px sous le bandeau au départ, la
      // carte remonte avec la page puis s'arrête 14 px sous le bandeau collé (160 px, `onScroll`).
      const el = bandeau.current;
      const avant = el?.previousElementSibling?.getBoundingClientRect().bottom ?? 0;
      const h = el?.offsetHeight ?? 0;
      const colle = el ? parseFloat(getComputedStyle(el).top) || 0 : 0;
      const pied = avecPied ? (document.querySelector<HTMLElement>(".pied7")?.getBoundingClientRect().height ?? 0) : 0;
      const top = Math.max(Math.round(colle + h + 14), Math.floor(avant + h + 15));
      const bottom = Math.round(pied + 24);
      setPlace((p) => (p.top === top && p.bottom === bottom ? p : { top, bottom }));
    };
    const demander = () => {
      if (!image) image = requestAnimationFrame(lire);
    };
    lire();
    window.addEventListener("scroll", demander, { passive: true });
    window.addEventListener("resize", demander);
    return () => {
      if (image) cancelAnimationFrame(image);
      window.removeEventListener("scroll", demander);
      window.removeEventListener("resize", demander);
    };
  }, [actif, bandeau, avecPied]);
  return place;
}

/** « 4 », « 4,5 » : un seuil de note sur 5, sans décimale inutile. */
function seuilLbl(n: number): string {
  return new Intl.NumberFormat(langueIntl(), { maximumFractionDigits: 1 }).format(n);
}

function LogementsStation({ s }: { s: Station }) {
  const go = useGo();
  const P = useParcours();
  const { checkIn, checkOut, trav, rooms, nights } = useSejour();
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
  const fusionnes = useMemo(() => {
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
  // Toutes sources : un GPS publié reste. Sans coordonnées, barycentre du
  // lieu, repère, ou station. Ce n'est pas la porte (`placerSansPoint`).
  // Le favori garde le relevé, pas cette position d'affichage.
  const raw = useMemo(() => placerSansPoint(fusionnes, s), [fusionnes, s]);
  // Un logement enregistré qui repasse dans le relevé : sa copie dans les
  // favoris prend la photo, le point publié et, pour le même séjour, le prix
  // d'aujourd'hui. Pas la position triangulée, qui n'est pas la porte.
  useEffect(() => {
    if (fusionnes.length > 0) useFavoris.getState().rafraichir(fusionnes, { checkIn, checkOut, trav });
  }, [fusionnes, checkIn, checkOut, trav]);
  // L'altitude de chaque annonce à point, pour la carte et le tri.
  const altDe = useAltitudes(raw);

  const [lf, setLf] = useState<LF>(LF0);
  /** Les catégories du bandeau posées : plusieurs à la fois, comme des puces. */
  const [cats, setCats] = useState<readonly CleCategorie[]>([]);
  const [lsort, setLsort] = useState<LodgeSort>("station");
  const [lsens, setLsens] = useState<Sens>(1);
  /** Un autre critère part dans son sens de départ. */
  const choisirTri = (k: LodgeSort) => {
    setLsort(k);
    setLsens(TRIS_LOGEMENT.find((t) => t.k === k)?.sens ?? 1);
  };
  const [lfOpen, setLfOpen] = useState(false);
  /** Le mode de prix de la fenêtre Filtres : budget du séjour ou par personne. */
  const [modePrix, setModePrix] = useState<ModePrix>("budget");
  const [sheetId, setSheetId] = useState<string | null>(null);
  const fermerFiltres = useCallback(() => setLfOpen(false), []);
  const fermerVolet = useCallback(() => setSheetId(null), []);
  /** La vue : la carte d'abord, à la demande. */
  const [vue, setVue] = useState<"liste" | "carte">("carte");
  // Le cadre visible de la carte compte toujours : liste, compteur et
  // pastilles rendues disent la même chose. En liste, il n'y a pas de cadre.
  const [bornes, setBornes] = useState<Bornes | null>(null);
  const [nAffiches, setNAffiches] = useState(PAS_LOGEMENTS);
  /** La fiche épinglée sur la carte, remontée par elle. */
  const [epinglee, setEpinglee] = useState<string | null>(null);
  // Rendre les annonces que le cadre a laissées dehors. Relâcher les bornes ne
  // suffit pas : la carte ne recadre que si la clé `cadrage` change.
  const [recadrages, setRecadrages] = useState(0);
  const revoirTout = useCallback(() => {
    setBornes(null);
    setRecadrages((n) => n + 1);
  }, []);
  const basculerVue = () => {
    setBornes(null);
    setEpinglee(null);
    setVue((v) => (v === "liste" ? "carte" : "liste"));
  };
  // L'annonce que la carte désigne, et que la liste éclaire en retour.
  const [actifCarte, setActifCarte] = useState<string | null>(null);
  const patchLf = (p: Partial<LF>) => setLf((x) => ({ ...x, ...p }));
  /** Pose une borne d'une fourchette de l'écran, depuis l'état courant. */
  const poserLf = (k: (typeof RANGES)[number]["k"], which: 0 | 1, v: number, exact: boolean) =>
    setLf((x) => ({ ...x, [k]: poserBorne(x[k], RANGE[k].b, RANGE[k].pas, which, v, exact) }));
  // Le budget du séjour : critère partagé, pas un réglage de cet écran.
  const budget = P.filters.budget;
  /** « Tout réinitialiser » relâche les réglages de l'écran, les catégories
   *  **et** le budget, qui n'est plus rangé avec eux. */
  const reinitialiser = () => {
    setLf(LF0);
    setCats([]);
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
  // Les pièces comptent, comme dans `lodgingFilter` (`normalizedBedrooms`) :
  // un « 6 pièces » a cinq chambres. Le libellé de la carte garde le mot de la
  // source ; la conversion n'a lieu qu'à la comparaison.
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
  // périmètre. Son rayon se règle dans la fenêtre Filtres, il ne se retire
  // pas. Une borne basse écarte aussi ce qui est trop près du centre, et ce
  // dont la distance au centre n'est pas mesurée.
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
  // Les catégories du bandeau, chacune sur un champ publié de l'annonce.
  for (const k of cats) {
    const c = CATEGORIES_LOGEMENTS.find((x) => x.key === k);
    if (!c) continue;
    lp.push({
      id: `cat:${k}`,
      label: tr(c.label),
      fn: c.fn,
      remove: () => setCats((xs) => xs.filter((x) => x !== k)),
      cat: true,
    });
  }
  // Règle 2 de `lodgingFilter` : l'absence de tarif dispense des filtres de
  // prix, pas des autres. `total` vaut 0 quand la source n'a pas publié de
  // prix, et `0 <= budget` faisait passer ces annonces pour gratuites.
  const sansPrix = (l: Listing) => !(l.total > 0);
  if (budget != null)
    lp.push({
      id: "budget",
      label: tr("Budget : {plage}", { plage: fourchetteLbl(BUDGET, budget) }),
      fn: (l) => sansPrix(l) || dansPlage(l.total, budget, BUDGET.b),
      remove: () => P.setFilters({ budget: null }),
    });
  const lfLbl = (k: (typeof RANGES)[number]["k"], pl: Plage) =>
    tr("{critere} : {plage}", { critere: tr(RANGE[k].label), plage: plageTexte(pl, RANGE[k].b, borneLbl(k)) });
  const { pp, cap: lcap, rooms: lrooms, dist } = lf;
  if (pp != null)
    lp.push({
      id: "pp",
      label: tr("Par personne : {plage}", { plage: plageTexte(pp, RANGE.pp.b, borneLbl("pp")) }),
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
      // Un palier garde son nom : « Pied des pistes », « ≤ 500 m ».
      label: DIST_PALIERS_M.some((m) => palierPose(dist, m)) ? palierPuceLbl(dist[1]) : lfLbl("dist", dist),
      // Un point triangulé ne mesure rien (`distanceOf` le dit) : il ne passe
      // pas un palier de distance, comme une annonce sans point.
      fn: (l) => dansPlage(distRemonteePublieeM(l), dist, RANGE.dist.b),
      remove: () => patchLf({ dist: null }),
    });
  if (lf.type != null) {
    const t = lf.type;
    const def = TYPES_LOGEMENT.find((x) => x.key === t);
    lp.push({
      id: "type",
      label: def ? tr(def.label) : t,
      fn: (l) => l.lodgingType === t,
      remove: () => patchLf({ type: null }),
    });
  }
  if (lf.beds > 0) {
    const b = lf.beds;
    lp.push({
      id: "beds",
      label: trN(b, "{n} lit et plus", "{n} lits et plus"),
      // Les couchages que la source ne compte pas à part ne passent pas.
      fn: (l) => l.beds != null && l.beds >= b,
      remove: () => patchLf({ beds: 0 }),
    });
  }
  const srcOn = Object.keys(lf.src).filter((k) => lf.src[k]);
  if (srcOn.length) lp.push({ id: "src", label: tr("Sources : {liste}", { liste: srcOn.join(", ") }), fn: (l) => srcOn.includes(l.source), remove: () => patchLf({ src: {} }) });
  if (lf.measured) lp.push({ id: "measured", label: tr("Distance mesurée"), fn: (l) => distanceOf(l).kind === "measured", remove: () => patchLf({ measured: false }) });
  if (lf.link) lp.push({ id: "link", label: tr("Lien de réservation"), fn: (l) => !!l.url, remove: () => patchLf({ link: false }) });
  if (lf.photo) lp.push({ id: "photo", label: tr("Avec photo"), fn: (l) => !!l.photo, remove: () => patchLf({ photo: false }) });
  if (lf.firm) lp.push({ id: "firm", label: tr("Prix confirmé pour vos dates"), fn: (l) => firmOf(l, stay), remove: () => patchLf({ firm: false }) });
  if (lf.pos) lp.push({ id: "pos", label: tr("Adresse précise"), fn: (l) => estPointPublie(l), remove: () => patchLf({ pos: false }) });
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

  // Un équipement demandé : listé comme présent par la source. Une annonce
  // dont les équipements n'ont pas été lus ne passe pas (`aEquipement`).
  for (const id of lf.equip)
    lp.push({
      id: `equip:${id}`,
      label: (() => {
        const m = EQUIPEMENTS_MAQUETTE.find((e) => e.id === id);
        return m ? tr(m.label) : EQUIPEMENTS_FICHE[id] ? tr(EQUIPEMENTS_FICHE[id].libelle) : id;
      })(),
      fn: (l) => aEquipement(l, id),
      remove: () => patchLf({ equip: lf.equip.filter((x) => x !== id) }),
    });
  // La note, sur 5 seulement ; sans note, une annonce ne passe pas.
  if (lf.noteMin != null) {
    const seuil = lf.noteMin;
    lp.push({
      id: "note",
      label: tr("Note ≥ {note}", { note: seuilLbl(seuil) }),
      fn: (l) => noteAuMoins(l, seuil),
      remove: () => patchLf({ noteMin: null }),
    });
  }

  const lapply = (ps: Pred[]) => raw.filter((l) => ps.every((p) => p.fn(l)));
  /** Ce que la source n'a pas publié se range **après** ce qu'elle a publié,
   *  jamais au rang de zéro. */
  const apres = (v: number | null | undefined) => (v == null || !(v > 0) ? null : v);
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
    dist: (a, b) => parMesure(distRemonteePublieeM(a), distRemonteePublieeM(b), lsens),
    alt: (a, b) => parMesure(altDe(a)?.m, altDe(b)?.m, lsens),
    note: (a, b) => parMesure(noteSur5De(a), noteSur5De(b), lsens),
    trous: (a, b) => {
      const d = lsens * (completudeOf(a).trous.length - completudeOf(b).trous.length);
      return d !== 0 ? d : parMesure(apres(a.total), apres(b.total), 1);
    },
  };
  const lvis = lapply(lp).sort(tri[lsort]);
  // Un logement par bien : ses offres des autres plateformes se rangent
  // derrière la moins chère (voir `regroupement.ts`). L'identité se calcule
  // une fois, sur tout le relevé ; les filtres ne font ensuite que retirer
  // des offres à l'intérieur de chaque logement.
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
  // restent : la carte ne peut ni les montrer ni les cacher.
  const parCadre = partagerParBornes(principales, vue === "carte" ? bornes : null);
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
  // « Afficher plus » : on revient à la première tranche quand le cadre, les
  // filtres ou le tri changent.
  const pageItems = affichees.slice(0, nAffiches);
  const reste = affichees.length - pageItems.length;
  // Pendant le relevé, les annonces des sources qui ont déjà répondu se
  // montrent tout de suite ; le relevé figé des autres attend leur réponse.
  const reportees = new Set(liveSources.map((x) => x.source));
  const dejaLus = enReleve ? affichees.filter((l) => reportees.has(l.source)).slice(0, PAS_LOGEMENTS) : [];
  const sigListe = `${affichees.length}|${affichees[0]?.id ?? ""}|${affichees[affichees.length - 1]?.id ?? ""}|${lsort}|${lsens}`;
  useEffect(() => setNAffiches(PAS_LOGEMENTS), [sigListe]);
  const lfree = lp.filter((p) => !p.fixed);
  const nFiltres = lfree.filter((p) => !p.cat).length;
  const verrous = lp.filter((p) => p.fixed && (p.id === "cap" || p.id === "rooms"));
  const kept = raw.find((l) => l.id === P.lodgeId) ?? null;
  // Même calcul qu'ailleurs : le forfait du séjour, résolu pour ses dates,
  // les enfants à leur tarif quand le forfait le publie.
  const pass = prix.budget;
  // Un séjour vendu forfaits compris les porte déjà dans son prix.
  const forfaitsCompris = kept ? forfaitInclus(kept) : false;
  const passGroupN = forfaitsCompris ? 0 : (pass?.total ?? 0);
  const totalN = (kept?.total ?? 0) + passGroupN;

  /**
   * Le filtre qui vide la liste, règles verrouillées comprises : l'état vide
   * le nomme, et propose de le retirer quand il se retire.
   */
  let lempty: { title: string; fix: (() => void) | null } | null = null;
  if (raw.length && !lvis.length) {
    let best: { p: Pred; n: number } | null = null;
    for (const p of lp) {
      const n = lapply(lp.filter((x) => x !== p)).length;
      if (!best || n > best.n) best = { p, n };
    }
    lempty =
      best && best.n > 0
        ? {
            title: tr("Le filtre « {filtre} » ne laisse aucune annonce", { filtre: best.p.label }),
            fix: best.p.remove ?? null,
          }
        : {
            title: rooms
              ? tr("Aucune annonce pour {personnes} et {chambres}", {
                  personnes: trN(trav, "{n} personne", "{n} personnes"),
                  chambres: trN(rooms, "{n} chambre", "{n} chambres"),
                })
              : tr("Aucune annonce pour {personnes}", { personnes: trN(trav, "{n} personne", "{n} personnes") }),
            fix: null,
          };
  }

  // Stables d'un rendu à l'autre : sans cela `memo` sur la carte d'annonce ne
  // servirait à rien. Les actions se lisent sur le magasin.
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
  /** Le logement voisin de celui de la fiche, parmi ceux affichés (pendant
   *  un relevé, les annonces déjà reçues) : la fiche passe de l'un à l'autre. */
  const ficheVoisine = (sens: 1 | -1) => {
    if (!sheet) return null;
    const liste = (enReleve ? dejaLus : pageItems).map((l) => l.id);
    const id = voisinDansListe(liste, [sheet.id, ...(sheetGroupe?.offres.map((o) => o.id) ?? [])], sens);
    return id ? () => openSheet(id) : null;
  };
  // L'annonce Airbnb qu'on ouvre et à qui il manque capacité, chambres ou
  // position : elle passe en tête de la lecture (`completerAnnonces`,
  // `lireMaintenant`), puis l'écran la relit sans réseau toutes les
  // `RELECTURE_OUVERTE_MS`, tant que la fiche est ouverte et qu'elle reste trouée.
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
  /** Le badge de la carte : « 3 offres » quand le logement est sur plusieurs
   *  plateformes, sinon sa source. */
  const badgeLbl = (l: Listing) => {
    const g = logementDe.get(l.id);
    return g && g.offres.length > 1 ? trN(g.offres.length, "{n} offre", "{n} offres") : l.source;
  };
  /** Les autres plateformes du logement et leurs prix. */
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

  // Sur la carte, comme sur Airbnb : les logements affichés, et eux seuls. Le
  // cadrage, lui, couvre tout le résultat des filtres. La fiche épinglée, la
  // fiche ouverte et le logement retenu gardent leur épingle.
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
   * offre-là.
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
        nom: tr("Centre de la station"),
        epingle: epingleCentre(tr("Centre de la station")),
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
   *  la clé, qui recadrerait, sans fin. */
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
      sources={badgeLbl(l)}
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
      altVillage={altVillage}
      forfaitsGroupe={pass && !pass.manque ? pass.total : null}
    />
  );

  /* ---------- Mise en page ---------- */
  const haut = useHauteurEntete();
  const bandeau = useRef<HTMLDivElement>(null);
  const modeCarte = vue === "carte" && (raw.length > 0 || enReleve);
  const placeCarte = usePlaceCarte(modeCarte, bandeau, kept != null);

  const titreTri = tr(TRIS_LOGEMENT.find((t) => t.k === lsort)?.label ?? TRIS_LOGEMENT[0].label);
  const sensTitre = lsens === 1 ? tr("Ordre croissant") : tr("Ordre décroissant");
  const compte =
    logements.length === 0
      ? tr("Aucun logement disponible")
      : trN(logements.length, "{n} logement", "{n} logements");
  const nonRattachesLbl = nonRattaches.length
    ? trN(nonRattaches.length, "{n} non rattaché ({motifs})", "{n} non rattachés ({motifs})", {
        motifs: motifsNonRattaches,
      })
    : undefined;

  const categories = CATEGORIES_LOGEMENTS.map((c) => {
    const on = cats.includes(c.key);
    return {
      key: c.key,
      label: tr(c.label),
      iconPath: c.icone,
      on,
      onToggle: () => setCats((xs) => (on ? xs.filter((x) => x !== c.key) : [...xs, c.key])),
    };
  });

  /* ---------- Fenêtre Filtres ---------- */
  const modale = (() => {
    if (!lfOpen) return null;
    // Les comptes des réglages portent sur le relevé entier, comme avant ;
    // l'histogramme, sur ce que les autres filtres laissent.
    const sansPrixFiltres = lapply(lp.filter((p) => p.id !== "budget" && p.id !== "pp"));
    const prixValeurs = sansPrixFiltres
      .filter((l) => l.total > 0)
      .map((l) => (modePrix === "pp" ? l.total / trav : l.total));
    const sources = [...new Set(raw.map((l) => l.source))];
    const bySrc = (src: string) => raw.filter((l) => l.source === src).length;
    const nCompletes = raw.filter((l) => completudeOf(l).ok).length;
    // Les neuf équipements de la maquette, toujours ; puis ceux que des
    // annonces de ce relevé listent comme présents.
    const maquette = new Set(EQUIPEMENTS_MAQUETTE.map((e) => e.id));
    const equipDispo = [
      ...EQUIPEMENTS_MAQUETTE.map((e) => ({ id: e.id, label: tr(e.label), icone: e.icone })),
      ...Object.keys(EQUIPEMENTS_FICHE)
        .filter((id) => !maquette.has(id) && (lf.equip.includes(id) || raw.some((l) => aEquipement(l, id))))
        .map((id) => ({ id, label: tr(EQUIPEMENTS_FICHE[id].libelle), icone: ICONE_EQUIPEMENT[id] ?? ICONES.check })),
    ];
    // Chalet, appartement et studio toujours, comme la maquette ; les autres
    // types quand le relevé en compte.
    const types = TYPES_LOGEMENT.filter(
      (t) =>
        t.key === "chalet" ||
        t.key === "appartement" ||
        t.key === "studio" ||
        lf.type === t.key ||
        raw.some((l) => l.lodgingType === t.key),
    );
    const toggles: { k: "measured" | "pos" | "link" | "photo" | "firm" | "full" | "holes"; label: string; n: number }[] = [
      { k: "measured", label: tr("Distance mesurée"), n: raw.filter((l) => distanceOf(l).kind === "measured").length },
      { k: "pos", label: tr("Adresse précise"), n: raw.filter((l) => estPointPublie(l)).length },
      { k: "firm", label: tr("Prix confirmé pour vos dates"), n: raw.filter((l) => firmOf(l, stay)).length },
      { k: "link", label: tr("Lien de réservation"), n: raw.filter((l) => l.url).length },
      { k: "photo", label: tr("Avec photo"), n: raw.filter((l) => l.photo).length },
      { k: "full", label: tr("Fiche complète"), n: nCompletes },
      { k: "holes", label: tr("Fiche incomplète"), n: raw.length - nCompletes },
    ];
    const regle = (k: (typeof RANGES)[number]["k"]) => ({
      lbl: tr(RANGE[k].label),
      bornes: RANGE[k].b,
      valeur: lf[k],
      pas: RANGE[k].pas,
      unite: RANGE[k].unit,
      resume: plageTexte(lf[k], RANGE[k].b, borneLbl(k)),
      onPoser: (which: 0 | 1, v: number, exact: boolean) => poserLf(k, which, v, exact),
    });
    const pp = regle("pp");
    return (
      <ModaleFiltresLogements
        onFermer={fermerFiltres}
        onEffacer={reinitialiser}
        nResultat={affichees.length}
        types={[
          { key: "", label: tr("Tous"), icone: ICONES.list, on: lf.type == null },
          ...types.map((t) => ({ key: t.key, label: tr(t.label), icone: t.icone, on: lf.type === t.key })),
        ]}
        onType={(k) => patchLf({ type: (k || null) as TypeLogement | null })}
        modePrix={modePrix}
        onModePrix={setModePrix}
        prixValeurs={prixValeurs}
        prixEchelle={modePrix === "pp" ? RANGE.pp.b : BUDGET.b}
        prixPlage={modePrix === "pp" ? lf.pp : budget}
        fourchettePrix={
          modePrix === "pp" ? (
            <Fourchette
              lbl={pp.lbl}
              bornes={pp.bornes}
              valeur={pp.valeur}
              pas={pp.pas}
              unite={pp.unite}
              resume={pp.resume}
              onPoser={pp.onPoser}
            />
          ) : (
            <FourchetteRecherche r={BUDGET} />
          )
        }
        fourchettesTaille={[regle("cap"), regle("rooms")]}
        lits={[0, 1, 2, 3, 4, 5, 6, 7, 8].map((b) => ({
          key: b,
          label: b === 0 ? tr("Tout") : b === 8 ? "8+" : String(b),
          on: lf.beds === b,
        }))}
        onLits={(b) => patchLf({ beds: b })}
        paliers={[
          { key: null, label: tr("Toutes"), on: lf.dist == null },
          ...PALIERS_M.map((m) => ({ key: m as number | null, label: palierDistLbl(m), on: palierPose(lf.dist, m) })),
        ]}
        onPalier={(m) => patchLf({ dist: m == null ? null : [0, m] })}
        fourchetteDist={regle("dist")}
        rayons={[
          { key: RAYON_DEFAUT_KM, label: tr("Indifférent"), on: rayonMin <= 0 && rayonMax === RAYON_DEFAUT_KM },
          ...RAYONS_PASTILLES_KM.map((km) => ({ key: km, label: `${km} km`, on: rayonMin <= 0 && rayonMax === km })),
        ]}
        onRayon={(km) => patchLf({ rayon: [0, km] })}
        aideRayon={tr(
          "Distance au centre de la station. Sans GPS publié, la position est triangulée et l'annonce reste listée : ce n'est pas la porte.",
        )}
        equipements={equipDispo.map(({ id, label, icone }) => ({ key: id, label, icone, on: lf.equip.includes(id) }))}
        onEquipement={(id) =>
          patchLf({ equip: lf.equip.includes(id) ? lf.equip.filter((x) => x !== id) : [...lf.equip, id] })
        }
        // Comme la maquette, toutes les sources sont allumées tant qu'aucune
        // n'est choisie ; éteindre l'une garde les autres. Le filtre reste la
        // liste des sources retenues (`lf.src`).
        sources={sources.map((src) => ({ key: src, label: src, n: bySrc(src), on: srcOn.length === 0 || !!lf.src[src] }))}
        onSource={(src) => {
          const avant = srcOn.length === 0 ? sources : srcOn;
          const apres = avant.includes(src) ? avant.filter((x) => x !== src) : [...avant, src];
          patchLf({
            src: apres.length === 0 || apres.length === sources.length ? {} : Object.fromEntries(apres.map((x) => [x, true])),
          });
        }}
        notes={[
          { key: null, label: tr("Toutes"), on: lf.noteMin == null },
          ...SEUILS_NOTE.map((seuil) => ({
            key: seuil as number | null,
            label: tr("{min} et plus", { min: seuilLbl(seuil) }),
            on: lf.noteMin === seuil,
          })),
        ]}
        onNote={(seuil) => patchLf({ noteMin: seuil })}
        fiabilite={toggles.map((t) => ({ key: t.k, label: t.label, n: t.n, on: lf[t.k] }))}
        onFiabilite={(k) => {
          if (k === "full") patchLf({ full: !lf.full, holes: false });
          else if (k === "holes") patchLf({ holes: !lf.holes, full: false });
          else {
            const t = k as "measured" | "pos" | "link" | "photo" | "firm";
            patchLf({ [t]: !lf[t] });
          }
        }}
      />
    );
  })();

  /* ---------- Grille ---------- */
  const grille = enReleve ? (
    <div className="lg-grille" data-testid="lodging-progressive-grid">
      {dejaLus.map(carte)}
      <Squelettes n={dejaLus.length ? 4 - (dejaLus.length % 4) : 8} />
    </div>
  ) : affichees.length ? (
    <>
      <div className="lg-grille">
        {domaineRelie
          ? pageItems.map((l, i) => {
              const st = stationDuLogement(l, s.id);
              const avant = i > 0 ? stationDuLogement(pageItems[i - 1]!, s.id) : null;
              const n = affichees.filter((x) => stationDuLogement(x, s.id) === st).length;
              return (
                <Fragment key={l.id}>
                  {st !== avant ? (
                    <h3 className="lg-grille__station">
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
      {reste > 0 ? (
        <div className="lg-plus">
          <button type="button" className="lg-bouton" onClick={() => setNAffiches((n) => n + PAS_LOGEMENTS)}>
            {tr("Afficher {n} de plus", { n: Math.min(PAS_LOGEMENTS, reste) })}
          </button>
        </div>
      ) : null}
    </>
  ) : lvis.length ? (
    <div className="lg-vide">
      <b>{tr("Aucune annonce dans ce cadrage")}</b>
      <div className="lg-vide__actions">
        <button type="button" className="lg-bouton" onClick={revoirTout}>
          {tr("Revoir toutes les annonces")}
        </button>
      </div>
    </div>
  ) : lempty ? (
    <div className="lg-vide">
      <b>{tr("Aucun logement ne correspond")}</b>
      <div className="lg-vide__actions">
        {lempty.fix ? (
          <button type="button" className="lg-bouton" title={lempty.title} onClick={lempty.fix}>
            {tr("Retirer ce filtre")}
          </button>
        ) : null}
        <button type="button" className="lg-bouton" onClick={reinitialiser}>
          {tr("Tout réinitialiser")}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <Coquille>
      <main
        className={`lg-main${modeCarte ? " lg-main--carte" : ""}${kept ? " lg-main--pied" : ""}`}
        id="s-lodging"
        data-screen-label="2 Logements"
      >
        <div className="lg-enveloppe lg-tete">
          <div className="lg-tete__titre">
            <h1>{s.name}</h1>
            <span className="lg-tete__sous">
              {enReleve ? (
                <LigneReleve trouves={dejaLus.length} />
              ) : (
                <span title={nonRattachesLbl}>{compte}</span>
              )}
              <span aria-hidden="true"> · </span>
              <button
                type="button"
                className="lg-tete__sejour"
                data-sejour-ouvre
                title={tr("Changer la station, les dates ou le nombre de voyageurs")}
                aria-expanded={P.stayOpen}
                onClick={() => P.setStayOpen(!P.stayOpen)}
              >
                {dm(checkIn)} → {dm(checkOut)} · {persLbl(trav)}
              </button>
            </span>
          </div>
          <button
            type="button"
            className={`lg-maj${searching ? " lg-maj--encours" : ""}`}
            title={tr("Mettre à jour les prix")}
            aria-label={tr("Mettre à jour les prix")}
            onClick={relancer}
            disabled={searching}
          >
            <Trace d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" taille={15} epaisseur={2} />
            {searching ? <span>{tr("Mise à jour en cours")}</span> : null}
          </button>
          <label className="lg-tri">
            {titreTri}
            <select
              value={lsort}
              aria-label={tr("Tri des logements")}
              onChange={(e) => choisirTri(e.target.value as LodgeSort)}
            >
              {TRIS_LOGEMENT.map((t) => (
                <option key={t.k} value={t.k}>
                  {tr(t.label)}
                </option>
              ))}
            </select>
            <Trace d="m6 9 6 6 6-6" taille={12} epaisseur={2.4} />
          </label>
          <button
            type="button"
            className="lg-sens"
            title={sensTitre}
            aria-label={sensTitre}
            onClick={() => setLsens(lsens === 1 ? -1 : 1)}
          >
            <Trace
              d={lsens === 1 ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M19 12l-7 7-7-7"}
              taille={15}
              epaisseur={2.2}
            />
          </button>
        </div>

        <div className="lg-bandeau" ref={bandeau} style={{ top: haut - 1 }}>
          <div className="lg-enveloppe lg-bandeau__in">
            <RangeeCategories
              items={categories}
              variante="clair"
              nFiltres={nFiltres}
              onFiltres={() => setLfOpen(true)}
              ariaLabel={tr("Catégories de logements")}
            />
          </div>
          {enReleve ? <span className="lg-jauge" aria-hidden="true" /> : null}
        </div>

        <div className="lg-enveloppe lg-corps">
          <div className="lg-colonne">
            {verrous.length || lfree.length ? (
              <div className="lg-criteres">
                {verrous.map((p) => (
                  <PuceCritere key={p.id} label={p.label} verrou />
                ))}
                {lfree.map((p) => (
                  <PuceCritere key={p.id} label={p.label} onRetirer={p.remove} />
                ))}
                {lfree.length ? (
                  <button type="button" className="lg-reinit" onClick={reinitialiser}>
                    {tr("Tout réinitialiser")}
                  </button>
                ) : null}
              </div>
            ) : null}

            {raw.length || enReleve ? (
              grille
            ) : (
              <div className="lg-vide">
                <b>{tr("Aucune annonce relevée pour {station}", { station: s.name })}</b>
                <div className="lg-vide__actions">
                  <button type="button" className="lg-bouton" onClick={relancer} disabled={searching}>
                    {searching ? tr("Relevé en cours…") : tr("Lancer le relevé")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {modeCarte ? (
          <div
            className={`lg-carte-fixe${enReleve ? " rech7-carte" : ""}`}
            style={{ top: placeCarte.top, bottom: placeCarte.bottom }}
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
                return <FicheEpingle l={l} sources={groupeLbl(l)} stay={stay} trav={trav} nights={nights} />;
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
                enReleve ? null : parCadre.horsCadre.length ? (
                  <button type="button" className="carte7__revoir" onClick={revoirTout}>
                    {logements.length > 1
                      ? tr("Revoir les {n} logements", { n: logements.length })
                      : tr("Revoir le logement")}
                    <Icon name="fleche-droite" taille={14} />
                  </button>
                ) : null
              }
            />
            {enReleve && !dejaLus.length ? <span className="rech7__voile" aria-hidden="true" /> : null}
          </div>
        ) : null}

        {raw.length || enReleve ? <BasculeVue vue={vue} onBasculer={basculerVue} surelevee={kept != null} /> : null}
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

      {modale}

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
          onPrecedent={ficheVoisine(-1)}
          onSuivant={ficheVoisine(1)}
          forfaits={prix.pret ? pass : undefined}
        />
      ) : null}
    </Coquille>
  );
}
