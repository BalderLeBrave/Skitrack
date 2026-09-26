/** L'écran « Prix » (maquette v7), la partie qui se calcule.
 *
 *  Période, médiane d'un relevé, annonces qu'il retient, filtres à deux
 *  bornes, tri, libellés des deux onglets et file des relevés : tout ce qui se
 *  vérifie sans interface vit ici, pur, et `calcul.test.ts` en couvre les cas
 *  limites. Le magasin et la boucle de relevé (`releve.ts`) ne font qu'appeler
 *  ces fonctions.
 *
 *  Chargé tel quel par `node --experimental-strip-types` : imports relatifs
 *  avec leur extension, types en `import type`, aucun alias `@/`. */

import { attachAccess } from "../access.ts";
import { domaineNomme } from "../classeur.ts";
import type { Listing } from "../listings.ts";
import type { ArretFiches } from "../scrape/airbnbFiches.ts";
import type { SourceReport } from "../scrape/types.ts";
import type { Station } from "../stations.ts";
import { dm, eur, fmt, nuitsLbl, travLbl } from "../parcours.ts";
import { availabilityOf } from "../stay/availability.ts";
import { addDaysIso, formatDayIso } from "../stay/calendar.ts";
import { enrichirListing } from "../stay/enrichir.ts";
import { estFicheGitesIntrouvable } from "../stay/ficheGites.ts";
import { ficheDementieParLeTitre } from "../stay/occupancy.ts";
import { motifHorsSujet } from "./horsSujet.ts";
import {
  DIST_PALIERS_M,
  distFiltrableM,
  geoReasonFor,
  gpsPrecis,
  normalizedBedrooms,
  partyVerdict,
  RAYON_DEFAUT_KM,
} from "../stay/lodgingFilter.ts";
import { metresBetween, nearestAnyLift, nearestStationLift } from "../remontees.ts";
import { gareRetiree, remonteeHorsService } from "../remonteeEnService.ts";

/** Au-delà, une gare n'est plus la remontée d'un logement (`nearestLift`). */
const GARE_LOINTAINE_M = 40_000;
import { stationById } from "../stations.ts";
import { cleListing } from "../stay/poserReleve.ts";
import { urlPropre, urlsPartagees } from "../stay/priseFiche.ts";
import { recopierSoeurs } from "../stay/recopie.ts";
import { parPrix as parPrixOffre, regrouper, type Logement } from "../stay/regroupement.ts";
import { estOffreGitesVerifiee } from "../stay/tarif.ts";
import { maxM, prixLbl, villageM } from "../v7.ts";

export const MIN_ANNONCES = 5;
/** `STAY_BOUNDS.nights` de `parcours.ts`, recopié pour garder le module pur. */
export const NUITS_MIN = 1;
export const NUITS_MAX = 21;
export const PAGE = 40;
/** Au-delà, les résultats les plus anciens partent : le stockage du
 *  navigateur n'est pas extensible, et chaque période multiplie les clés. */
export const MAX_RESULTATS = 4000;

const NUITS_DEFAUT = 7;

/* ---------- Période ---------- */

/** `from` en ISO `AAAA-MM-JJ`. */
export type Periode = { from: string; nights: number };
/** `rooms` à 0 : studio accepté. */
export type Groupe = { trav: number; rooms: number };

export function perKey(p: Periode): string {
  return `${p.from}|${p.nights}`;
}

export function memePeriode(a: Periode, b: Periode): boolean {
  return perKey(a) === perKey(b);
}

export function grpKey(g: Groupe): string {
  return `${g.trav}|${g.rooms}`;
}

/** Le groupe entre dans la clé : une médiane pour huit voyageurs ne vaut
 *  rien pour dix, et la maquette l'oubliait. */
export function cleResultat(p: Periode, g: Groupe, stationId: string): string {
  return `${perKey(p)}|${grpKey(g)}|${stationId}`;
}

/** La station d'une clé de résultat : ce qui suit le quatrième « | ». */
export function stationDeCle(cle: string): string {
  return cle.split("|").slice(4).join("|");
}

export function bornerNuits(n: number): number {
  if (!Number.isFinite(n)) return NUITS_DEFAUT;
  return Math.min(NUITS_MAX, Math.max(NUITS_MIN, Math.round(n)));
}

/** Un séjour sans nuits (plage inversée) se lit comme la semaine par défaut. */
export function periodeDuSejour(checkIn: string, nights: number): Periode {
  return { from: checkIn, nights: bornerNuits(nights > 0 ? nights : NUITS_DEFAUT) };
}

export function decaler(p: Periode, jours: number): Periode {
  return { ...p, from: addDaysIso(p.from, jours) };
}

export function avecNuits(p: Periode, nights: number): Periode {
  return { ...p, nights: bornerNuits(nights) };
}

export function departIso(p: Periode): string {
  return addDaysIso(p.from, p.nights);
}

/** « du 6 févr. au 13 févr. » */
export function perLbl(p: Periode): string {
  return `du ${dm(p.from)} au ${dm(departIso(p))}`;
}

/** « 13 févr. 2027 » */
export function departLbl(p: Periode): string {
  return formatDayIso(departIso(p));
}

/** Une arrivée déjà passée ne se réserve plus : aucun relevé n'y a de sens.
 *  `aujourdhui` en ISO `AAAA-MM-JJ`, que l'ordre des chaînes compare. */
export function estPassee(p: Periode, aujourdhui: string): boolean {
  return p.from < aujourdhui;
}

/* ---------- Médiane d'un relevé ---------- */

export type Resultat =
  | {
      etat: "fait";
      n: number;
      muettes: number;
      petits: number;
      med: number | null;
      ts: number;
      partiel: string[];
    }
  | { etat: "echec"; ts: number; raison: string };

/** Sans arrondi : la moyenne des deux du milieu reste telle quelle. */
export function mediane(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type Agregat = { n: number; muettes: number; petits: number; med: number | null };

/** Ce que la médiane lit d'un relevé, en plus de ses annonces. */
export type ContexteReleve = {
  dept: string | null;
  checkIn: string;
  checkOut: string;
  groupe: Groupe;
  now: number;
};

const REPLI = /repli/i;

/** « Dans la station » : à 2 km au plus d'une remontée (décision du 25 sept.
 *  2026). Au-delà, c'est une vallée, une ville ou une autre montagne. */
export const DISTANCE_STATION_M = 2000;

/**
 * Le logement est-il un logement de station ? La distance est celle de
 * Logements (`distFiltrableM`) : la remontée OpenStreetMap la plus proche du
 * domaine cherché (liste de la station, ou index national pour une gare à 3 km
 * au plus d'un repère de station), à défaut le repère de la station. Une distance inconnue
 * écarte : rien ne prouve alors que le logement soit en station, et le
 * propriétaire ne veut voir que ceux qui le sont.
 */
export function dansLaStation(
  l: Pick<Listing, "distToSlopesM" | "distToLiftM">,
  maxM: number = DISTANCE_STATION_M,
): boolean {
  const m = distFiltrableM(l);
  return m != null && m <= maxM;
}

type Crible = {
  /** Un logement, une offre : la moins chère de chacun. */
  retenues: Listing[];
  /** Toutes les offres retenues, logement par logement, chacune marquée du
   *  logement que la médiane lui donne (`logement`). */
  offres: AnnonceRetenue[];
  muettes: number;
  petits: number;
};

/**
 * Ce que `cribler` exige d'une annonce avant sa position et sa capacité :
 * offre réelle (offre Gîtes vérifiée, fiche trouvée), pas un repli sur le
 * relevé figé, en euros, pas un « à partir de », dans la zone de la station
 * (domaine, territoire, 12 km), et tarifée récemment pour exactement ce
 * séjour. La complétion (`aCompleter`) part du même prédicat : une annonce
 * qu'elle complète est une annonce que la médiane pourra compter.
 *
 * Et d'abord un logement de location : ni hôtel, ni forfait compris, ni
 * mobil-home, ni chambre d'hôtes ou dortoir, ni logement hors de France
 * (`motifHorsSujet`). Sur les relevés du 25 septembre 2026, les hôtels
 * faisaient bouger la médiane de 46 stations : La Clusaz passait de 5 688 à
 * 4 884 € sans eux. Les médianes déjà enregistrées ne changent qu'au relevé
 * suivant ; « Par budget » les écarte dès la relecture (`passeAnnonce`).
 */
function offreRecevable(l: Listing, ctx: ContexteReleve): boolean {
  if (motifHorsSujet(l) != null) return false;
  if (estFicheGitesIntrouvable(l) || !estOffreGitesVerifiee(l)) return false;
  if (REPLI.test(l.proven ?? "")) return false;
  if (l.currency !== "EUR") return false;
  if (l.priceIndicative) return false;
  if (geoReasonFor(l, RAYON_DEFAUT_KM, ctx.dept) != null) return false;
  const stay = { checkIn: ctx.checkIn, checkOut: ctx.checkOut };
  return availabilityOf(l, stay, ctx.now).status === "confirmed";
}

/**
 * Une annonce ne compte que si tout le reste est prouvé : offre réelle, pas
 * un repli sur le relevé figé, en euros, à la station, géolocalisée, à 2 km au
 * plus d'une remontée, et tarifée récemment pour exactement ce séjour. Un « à
 * partir de » n'est pas un total de séjour, même non nul. Parmi celles-là
 * seulement, le verdict de groupe tranche : une capacité tue est comptée à
 * part (`muettes`), jamais supposée suffisante, et une trop petite aussi
 * (`petits`). Une fiche que son titre dément (« 2 Pièces Pour 4 Personnes »
 * publié 8 personnes et 3 chambres, `ficheDementieParLeTitre`) est muette :
 * on ne sait pas qui, du titre ou de la fiche, a raison.
 *
 * Un logement vendu sur trois plateformes n'est qu'un logement : les retenues
 * se regroupent comme dans Logements, et seule l'offre la moins chère de
 * chacun compte. Sans cela, deux biens suffisaient à atteindre MIN_ANNONCES.
 * Muettes et petites restent des offres : elles ne sont pas proposées.
 */
function cribler(listings: readonly Listing[], ctx: ContexteReleve): Crible {
  const criteres = { travelers: ctx.groupe.trav, rooms: ctx.groupe.rooms };
  const vus = new Set<string>();
  const retenues: Listing[] = [];
  let muettes = 0;
  let petits = 0;

  for (const brute of listings) {
    const l = enrichirListing(brute);
    if (!offreRecevable(l, ctx)) continue;
    if (!gpsPrecis(l)) continue;
    // Le rayon de 12 km garde la vallée entière : un logement de station est
    // bien plus près d'une remontée. Écarté ici, il n'entre dans aucun compte.
    if (!dansLaStation(l)) continue;
    // Une même annonce rendue deux fois ne compte qu'une fois.
    if (vus.has(l.id)) continue;
    vus.add(l.id);

    const verdict = partyVerdict(l, criteres);
    if (verdict === "convient") retenues.push(l);
    else if (verdict === "non-annonce") muettes += 1;
    else petits += 1;
  }

  const logements = regrouper(retenues);
  return {
    retenues: logements.map((g) => g.principale),
    offres: logements.flatMap((g) => g.offres.map((o) => ({ ...o, logement: g.principale.id }))),
    muettes,
    petits,
  };
}

/** Les annonces que la médiane compte, enrichies : l'onglet « Par budget » ne
 *  propose que celles-là, pour qu'un logement affiché soit un logement mesuré. */
export function retenir(listings: readonly Listing[], ctx: ContexteReleve): Listing[] {
  return cribler(listings, ctx).retenues;
}

/**
 * Toutes les offres retenues, un logement vendu sur trois plateformes donnant
 * ses trois offres. La médiane n'en compte que la moins chère (`retenir`) ;
 * l'onglet budget les garde toutes pour dire, comme Logements, où d'autre le
 * même logement se loue et à quel prix (`logementsBudget`). Sans elles, un
 * appartement vendu moins cher sur Booking ne montrait jamais son offre
 * Airbnb : à Albiez-Montrond, le 25 septembre 2026, la seule Airbnb de la
 * station n'apparaissait nulle part. Chaque offre porte le logement que la
 * médiane lui donne (`logement`) : l'onglet reprend ce regroupement au lieu de
 * le refaire sur toutes les stations réunies, où un titre repris ailleurs le
 * défaisait.
 */
export function retenirOffres(
  listings: readonly Listing[],
  ctx: ContexteReleve,
): AnnonceRetenue[] {
  return cribler(listings, ctx).offres;
}

/** Ce qu'un relevé donne pour une station : la médiane des totaux publiés pour
 *  ces dates exactes, par des logements qui accueillent le groupe, une offre
 *  par logement. */
export function agreger(listings: readonly Listing[], ctx: ContexteReleve): Agregat {
  const { retenues, muettes, petits } = cribler(listings, ctx);
  return { n: retenues.length, muettes, petits, med: mediane(retenues.map((l) => l.total)) };
}

/** Une annonce retenue : l'annonce entière, telle que `retenir` la rend.
 *  L'onglet budget montre la carte, la pastille et le volet de Logements, qui
 *  lisent la distance, le GPS, la galerie, la provenance et la disponibilité :
 *  réduite, l'annonce y aurait des trous que la source n'a pas. */
export type AnnonceRetenue = Listing & {
  /**
   * Le logement que le relevé a donné à l'offre : l'id de l'offre la moins
   * chère de son groupe (`regrouper`, station par station, comme la médiane).
   * Les offres d'un même relevé qui le partagent sont un seul logement. Absent
   * des relevés antérieurs au soir du 25 septembre 2026, qui ne gardaient
   * qu'une offre par logement : l'offre y reste seule.
   */
  logement?: string;
};

/** Six photos suffisent à la galerie du volet. Au-delà, c'est du poids : une
 *  grande station retient des centaines d'annonces, et IndexedDB en garde
 *  pour 320 stations. */
export const PHOTOS_RETENUES = 6;

/** Une copie de l'annonce, dont seules les photos sont bornées. */
export function compacter(l: Listing): AnnonceRetenue {
  const copie = { ...l };
  if (Array.isArray(l.photos)) copie.photos = l.photos.slice(0, PHOTOS_RETENUES);
  return copie;
}

function nombreOuNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function texteOuNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Ce que prouve la retenue d'un gîte : `cribler` n'en garde aucun sans devis
 *  ITEA live. Sans cette trace, un gîte relu perdrait son prix au premier
 *  `enrichirListing` (`purgerTarifFigé`), et `estOffreGitesVerifiee` l'écarterait. */
const DEVIS_GITES_RETENU = "Devis ITEA live";

/**
 * Une annonce relue d'IndexedDB, rendue en `Listing`, ou `null` si elle est
 * illisible. Les relevés enregistrés avant ce format n'en gardaient que
 * quatorze champs, sans station, GPS, galerie ni provenance : ce qui manque
 * est dit absent, jamais deviné. La station vient de la clé, le GPS et la
 * galerie restent nuls, la provenance vide, sauf pour un gîte, dont la retenue
 * même prouve le devis. Une annonce au format actuel ressort telle quelle.
 */
export function versListing(a: unknown, stationId: string): Listing | null {
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const o = a as Record<string, unknown>;
  const source = ORDRE_SOURCES.find((s) => s === o.source);
  const { id, title, total, currency } = o;
  if (typeof id !== "string" || typeof title !== "string" || !source) return null;
  if (typeof total !== "number" || !Number.isFinite(total) || typeof currency !== "string") {
    return null;
  }
  let proven = "";
  if (typeof o.proven === "string") proven = o.proven;
  else if (source === "Gîtes de France" && total > 0) proven = DEVIS_GITES_RETENU;
  return {
    ...(o as Partial<Listing>),
    id,
    stationId: typeof o.stationId === "string" ? o.stationId : stationId,
    title,
    source,
    total,
    currency,
    guests: nombreOuNull(o.guests),
    bedrooms: nombreOuNull(o.bedrooms),
    available: true,
    photo: texteOuNull(o.photo),
    url: texteOuNull(o.url),
    lat: nombreOuNull(o.lat),
    lon: nombreOuNull(o.lon),
    proven,
    photos: Array.isArray(o.photos)
      ? o.photos.filter((u): u is string => typeof u === "string")
      : null,
  };
}

/**
 * La remontée d'une annonce enregistrée, remesurée à sa relecture. Jusqu'au
 * correctif du 25 septembre 2026, `attachAccess` ne mesurait que la liste de
 * gares de la station, incomplète pour plusieurs d'entre elles : une annonce
 * du village de Saint-Martin-de-Belleville gardait 2 839 m quand la gare
 * « Village » est à 27 m, et la règle des 2 km l'écartait. La gare la plus proche de toutes
 * (`nearestAnyLift`) la remplace quand elle est plus près. Seulement dans le
 * domaine cherché, comme `attachAccess` : hors du domaine, la remontée n'est
 * pas celle du logement ; sans position, rien ne se mesure.
 *
 * Une gare enregistrée qui n'est plus en service (son nom le dit,
 * `remonteeHorsService`, ou elle a été retirée des données, `gareRetiree` :
 * l'ancienne télécabine de Charlannes, le TKF1 Portatif de La Giettaz) ne vaut
 * plus rien : la mesure est refaite, même plus loin. Faute de gare en service
 * près d'un repère, c'est la plus proche de toutes, à 40 km au plus, comme
 * dans `nearestLift` : le repère de La Bourboule est dans le bourg, et s'y
 * rabattre remettait le bourg au pied des pistes quand la première remontée
 * de ski en service, l'Écureuil, est à 6,2 km. Plus loin encore, la remontée
 * s'efface.
 */
export function remesurerRemontee(l: Listing): Listing {
  const perimee = remonteeHorsService(l.liftName) || gareRetiree(l.liftLat, l.liftLon, l.liftName);
  if (l.lat == null || l.lon == null) return perimee ? sansRemontee(l) : l;
  if (l.domainFit !== "in" && l.domainFit !== "linked") return perimee ? sansRemontee(l) : l;
  const proche = l.nearestDomainId ? stationById(l.nearestDomainId) : undefined;
  let gare = nearestStationLift(l.lat, l.lon, [stationById(l.stationId), proche]);
  if (!gare && perimee) {
    const loin = nearestAnyLift(l.lat, l.lon);
    gare = loin && loin.m <= GARE_LOINTAINE_M ? loin : null;
  }
  if (!gare) return perimee ? sansRemontee(l) : l;
  const avant = l.distToLiftM;
  if (!perimee && avant != null && Number.isFinite(avant) && avant >= 0 && avant <= gare.m) {
    return l;
  }
  return {
    ...l,
    distToLiftM: gare.m,
    liftName: gare.name,
    liftKind: gare.kind,
    liftLat: gare.lat,
    liftLon: gare.lon,
    liftOtherLat: gare.otherLat,
    liftOtherLon: gare.otherLon,
  };
}

/** L'annonce sans sa remontée : `distFiltrableM` se rabat sur le repère. */
function sansRemontee(l: Listing): Listing {
  return {
    ...l,
    distToLiftM: null,
    liftName: null,
    liftKind: null,
    liftLat: null,
    liftLon: null,
    liftOtherLat: null,
    liftOtherLon: null,
  };
}

export const PARTS = ["airbnb", "gites", "cozy", "centrales", "greengo"] as const;
export type Part = (typeof PARTS)[number];

export const SOURCES_DE_PART: Record<Part, readonly Listing["source"][]> = {
  airbnb: ["Airbnb"],
  gites: ["Gîtes de France"],
  cozy: ["Abritel", "Booking"],
  centrales: ["Centrale"],
  greengo: ["GreenGo"],
};

/** Les plateformes existent pour toute station : leur silence est un défaut.
 *  Une centrale ou Gîtes de France peuvent ne pas exister pour la station. */
const PLATEFORMES: readonly Listing["source"][] = ["Airbnb", "Abritel", "Booking", "GreenGo"];

/** Un refus, une pause, un délai ou une coupure : la source existe, elle n'a
 *  pas tout rendu cette fois. Le motif de `dureeCache`, plus ce que les
 *  collecteurs écrivent d'autre (run.server.ts, airbnb.server.ts,
 *  gites.server.ts) et les délais du client.
 *  - « Cozy : » et « direct : » ne s'écrivent que sur un échec ou un arrêt ;
 *    le compte ordinaire s'écrit « Cozy 38, direct 408 ».
 *  - « échéance » : Cozy coupé avant Abritel ou Booking, relevé direct coupé.
 *  - « bloqué ( » : le pare-feu de Gîtes de France (403, 429, défi).
 *  - Le plafond de GreenGo, « arrêté en route » suivi de « 6 hôtes au-delà
 *    des 12 lus en détail », n'est pas un refus : il est de notre fait, et
 *    relever à nouveau ne l'effacerait jamais. */
const PASSAGER =
  /HTTP \d{3}|coupe-circuit|limiteur|arrêté en route(?! . \d+ hôtes au-delà des)|Délai dépassé|timeout|fetch failed|Cozy :|direct :|échéance|bloqué \(/i;

const ORDRE_SOURCES: readonly Listing["source"][] = PARTS.flatMap((p) => SOURCES_DE_PART[p]);

/** Sources en défaut pour ce relevé : noms uniques, dans l'ordre de PARTS.
 *  - toute source d'une part rejetée côté client (partsEchouees) ;
 *  - une source des plateformes (Airbnb, Abritel, Booking, GreenGo) avec ok: false ;
 *  - toute source dont error ou note matche un motif passager.
 *  Une centrale non branchée ou un Gîtes sans commune (ok: false sans motif
 *  passager) n'est PAS un défaut : la source n'existe pas pour cette station. */
export function sourcesEnDefaut(
  sources: readonly SourceReport[],
  partsEchouees: readonly Part[],
): string[] {
  const enDefaut = new Set<string>();
  for (const p of partsEchouees) for (const s of SOURCES_DE_PART[p]) enDefaut.add(s);
  for (const r of sources) {
    if (!r.ok && PLATEFORMES.includes(r.source)) enDefaut.add(r.source);
    else if (PASSAGER.test(`${r.error ?? ""} ${r.note ?? ""}`)) enDefaut.add(r.source);
  }
  return ORDRE_SOURCES.filter((s) => enDefaut.has(s));
}

const AUCUNE_SOURCE = "Aucune source n’a répondu.";

/** Ce que la boucle de relevé rapporte d'une station. */
export type EntreeReleve = ContexteReleve & {
  listings: readonly Listing[];
  sources: readonly SourceReport[];
  partsEchouees: readonly Part[];
};

/** Toutes les parts ont échoué côté client, ou aucune annonce réelle n'est
 *  revenue et les quatre plateformes sont en défaut : un zéro n'y serait pas
 *  une mesure. Le serveur ajoute le relevé figé (« repli ») à toute source
 *  muette : ces lignes-là ne prouvent pas qu'une source a répondu. */
function echoue(input: EntreeReleve, partiel: readonly string[]): boolean {
  const toutesEchouees = PARTS.every((p) => input.partsEchouees.includes(p));
  const aucuneReelle = input.listings.every((l) => REPLI.test(l.proven ?? ""));
  const plateformesMuettes = aucuneReelle && PLATEFORMES.every((s) => partiel.includes(s));
  return toutesEchouees || plateformesMuettes;
}

function contexte(input: EntreeReleve): ContexteReleve {
  return {
    dept: input.dept,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    groupe: input.groupe,
    now: input.now,
  };
}

/** Le résultat d'un relevé : `echec` s'il n'a rien mesuré, sinon `fait`, avec
 *  les sources en défaut dans `partiel`. */
export function resultatDuReleve(input: EntreeReleve): Resultat {
  const partiel = sourcesEnDefaut(input.sources, input.partsEchouees);
  if (echoue(input, partiel)) return { etat: "echec", ts: input.now, raison: AUCUNE_SOURCE };
  return { etat: "fait", ...agreger(input.listings, contexte(input)), ts: input.now, partiel };
}

/** Les offres que ce relevé retient, toutes plateformes, photos bornées ;
 *  aucune s'il a échoué. L'onglet budget les regroupe par logement. */
export function annoncesDuReleve(input: EntreeReleve): AnnonceRetenue[] {
  if (echoue(input, sourcesEnDefaut(input.sources, input.partsEchouees))) return [];
  return retenirOffres(input.listings, contexte(input)).map(compacter);
}

/* ---------- Complétion des relevés ---------- */

/** Ce qui manque encore à une annonce pour être jugée : sa position, sa
 *  capacité, ou ses chambres (à défaut ses pièces, `normalizedBedrooms`). */
export function manqueFiche(l: Listing): boolean {
  return !gpsPrecis(l) || l.guests == null || normalizedBedrooms(l) == null;
}

/**
 * Les annonces d'un relevé que la complétion cherche à compléter : celles
 * que `cribler` garderait jusqu'au prix confirmé (`offreRecevable`), sans
 * exiger ni position ni capacité, et auxquelles il manque la position, la
 * capacité ou les chambres. Une annonce déjà trop petite pour le groupe ne se
 * complète pas : rien ne la ferait compter. Une position connue se juge : à
 * plus de 2 km d'une remontée, compléter le reste ne la ferait pas compter
 * non plus. Les moins chères d'abord : ce sont elles que l'onglet budget
 * propose en premier.
 */
export function aCompleter(listings: readonly Listing[], ctx: ContexteReleve): Listing[] {
  const criteres = { travelers: ctx.groupe.trav, rooms: ctx.groupe.rooms };
  const vus = new Set<string>();
  const out: Listing[] = [];
  for (const brute of listings) {
    const l = enrichirListing(brute);
    if (!offreRecevable(l, ctx)) continue;
    if (gpsPrecis(l) && !dansLaStation(l)) continue;
    if (vus.has(l.id)) continue;
    vus.add(l.id);
    if (!manqueFiche(l)) continue;
    if (partyVerdict(l, criteres) === "trop-petit") continue;
    out.push(l);
  }
  return out.sort((a, b) => a.total - b.total);
}

/** Une annonce à compléter, telle que la complétion l'envoie au serveur : de
 *  quoi trouver sa fiche et dire ce qui lui manque, rien de plus. */
export type CandidateFiche = Pick<
  Listing,
  "id" | "source" | "title" | "url" | "lat" | "lon" | "guests" | "bedrooms" | "total" | "currency" | "proven"
> & {
  /** `cleListing` : la clé de la mémoire des fiches. */
  cle: string | null;
  platformId: string | null;
  rooms: number | null;
  beds: number | null;
  locality: string | null;
};

export function versCandidate(l: Listing): CandidateFiche {
  return {
    id: l.id,
    cle: cleListing(l),
    source: l.source,
    title: l.title,
    url: l.url,
    platformId: l.platformId ?? null,
    lat: l.lat,
    lon: l.lon,
    guests: l.guests,
    bedrooms: l.bedrooms,
    rooms: l.rooms ?? null,
    beds: l.beds ?? null,
    total: l.total,
    currency: l.currency,
    proven: l.proven,
    locality: l.locality ?? null,
  };
}

/** Une annonce complète du relevé, pour la mémoire des fiches. */
export type FicheConnue = {
  cle: string;
  guests: number;
  bedrooms: number | null;
  rooms: number | null;
  lat: number;
  lon: number;
};

/** Les annonces complètes (position, capacité, chambres ou pièces) d'un
 *  relevé, toutes sources, une par clé : ce que la source publie ici comble
 *  demain la même annonce ailleurs. Un repli sur le relevé figé n'en est pas. */
export function connuesDuReleve(listings: readonly Listing[]): FicheConnue[] {
  const vues = new Set<string>();
  const out: FicheConnue[] = [];
  for (const brute of listings) {
    if (REPLI.test(brute.proven ?? "")) continue;
    const l = enrichirListing(brute);
    if (manqueFiche(l) || l.guests == null || l.lat == null || l.lon == null) continue;
    const cle = cleListing(l);
    if (!cle || vues.has(cle)) continue;
    vues.add(cle);
    out.push({
      cle,
      guests: l.guests,
      bedrooms: l.bedrooms,
      rooms: l.rooms ?? null,
      lat: l.lat,
      lon: l.lon,
    });
  }
  return out;
}

/** Les URL de fiche que plusieurs annonces du relevé portent : jamais
 *  ouvertes comme la fiche de l'une d'elles (`urlsPartagees`). Sur le relevé
 *  entier, pas sur les seules candidates. */
export function urlsCommunesDuReleve(listings: readonly Listing[]): string[] {
  return [...urlsPartagees(listings, urlPropre)];
}

/** Ce qu'une tranche de complétion rend, à poser sur les annonces du relevé. */
export type Correctifs = {
  correctifs: Readonly<Record<string, Partial<Listing>>>;
  retires: readonly string[];
};

/** Ce qu'un correctif peut changer : les trous comblés, et la trace de la
 *  fiche. Jamais le prix publié : la médiane ne mêlerait plus des totaux
 *  avec et sans taxe de séjour. Rien d'autre ne passe. */
const CHAMPS_CORRIGES = [
  "guests",
  "bedrooms",
  "rooms",
  "lat",
  "lon",
  "locality",
  "title",
  "proven",
] as const satisfies readonly (keyof Listing)[];

/**
 * Les annonces du relevé, correctifs posés. Une annonce retirée (Airbnb :
 * hôtel, chambre, insolite) sort. Une position nouvelle se mesure aussitôt
 * (`attachAccess`) : sans sa remontée, la règle des 2 km l'écarterait.
 */
export function appliquerCorrectifs(
  listings: readonly Listing[],
  c: Correctifs,
  station: Station | undefined,
): Listing[] {
  const retires = new Set(c.retires);
  const out: Listing[] = [];
  for (const l of listings) {
    if (retires.has(l.id)) continue;
    const corr = c.correctifs[l.id];
    if (!corr) {
      out.push(l);
      continue;
    }
    const next: Listing = { ...l };
    for (const k of CHAMPS_CORRIGES) {
      if (k in corr) (next as Record<string, unknown>)[k] = corr[k];
    }
    const deplace = next.lat !== l.lat || next.lon !== l.lon;
    out.push(deplace && station ? attachAccess(next, station) : next);
  }
  return out;
}

/**
 * Les arrêts d'une tranche de fiches Airbnb après lesquels plus aucune fiche
 * Airbnb ne part de la course : un refus d'Airbnb, ou le coupe-circuit qu'un
 * refus a ouvert (protocole 429 : jamais de reprise), et les pannes qui ne
 * se répareront pas d'ici la fin (clé, worker, format illisible). `rythme` et
 * `echeance` se reprennent à la tranche suivante ; `hash` passe par les pages
 * `rooms/`.
 */
export function airbnbSuspendu(arret: ArretFiches | null | undefined): boolean {
  return (
    arret === "refus" ||
    arret === "coupe-circuit" ||
    arret === "illisible" ||
    arret === "cle" ||
    arret === "worker"
  );
}

/** Un refus d'Airbnb, lu ou déjà en cours : ce que le bandeau doit dire. */
export function airbnbARefuse(arret: ArretFiches | null | undefined): boolean {
  return arret === "refus" || arret === "coupe-circuit";
}

/** Ce que les offres d'un même logement se recopient (`recopierSoeurs`),
 *  sur les annonces réelles du relevé. */
export function recopieDuReleve(listings: readonly Listing[]): Correctifs {
  const reelles = listings.filter((l) => !REPLI.test(l.proven ?? "")).map(enrichirListing);
  return { correctifs: Object.fromEntries(recopierSoeurs(reelles)), retires: [] };
}

/* ---------- Filtres ---------- */

/** `null` : toute l'échelle, la plage ne filtre pas. */
export type Plage = readonly [number, number] | null;
/** Ce qui se lit sur la station elle-même. */
export type PlageStationK = "km" | "sommet" | "village";
/** Ce qui se lit sur l'annonce, hors prix. */
export type PlageLogementK = "capacite" | "chambres";
export type PlageK = "prix" | PlageStationK | "budget" | PlageLogementK;
/** Les deux onglets partagent massif, département et plages de station ;
 *  `prix` et `avecPrix` ne servent qu'à « Par station ». `budget`, `domaine`,
 *  `station`, `capacite`, `chambres` et `distMax` ne servent qu'à « Par
 *  budget » : le tableau des médianes ne les lit pas. */
export type Filtres = {
  massif: string;
  dept: string;
  avecPrix: boolean;
  prix: Plage;
  km: Plage;
  sommet: Plage;
  village: Plage;
  budget: Plage;
  /** Valeur de `Station.domain`, ou "" : tous les domaines. */
  domaine: string;
  /** Identifiant de station, ou "" : toutes les stations. */
  station: string;
  /** Couchages annoncés. */
  capacite: Plage;
  /** Chambres, ou pièces moins une (`normalizedBedrooms`). */
  chambres: Plage;
  /** Distance aux remontées, en mètres : un palier de `DIST_PALIERS_M`. */
  distMax: number;
};

export const FL0: Filtres = {
  massif: "",
  dept: "",
  avecPrix: false,
  prix: null,
  km: null,
  sommet: null,
  village: null,
  budget: null,
  domaine: "",
  station: "",
  capacite: null,
  chambres: null,
  distMax: DISTANCE_STATION_M,
};

export type DefPlage = {
  k: PlageK;
  lbl: string;
  pas: number;
  unite: "€" | "km" | "m" | "pers." | "ch.";
  fixe?: readonly [number, number];
};
export type DefPlageStation = DefPlage & { k: PlageStationK };

/** Les plages de station, communes aux deux onglets. */
export const PLAGES_STATION: readonly DefPlageStation[] = [
  { k: "km", lbl: "Kilomètres de pistes", pas: 10, unite: "km" },
  { k: "sommet", lbl: "Sommet", pas: 100, unite: "m" },
  { k: "village", lbl: "Altitude du village", pas: 100, unite: "m" },
];

/** Les plages de l'onglet « Par station ». */
export const PLAGES: readonly DefPlage[] = [
  { k: "prix", lbl: "Médiane", pas: 100, unite: "€", fixe: [0, 6000] },
  ...PLAGES_STATION,
];

/** Porte sur le total d'une annonce, jamais sur une station : `passe` l'ignore. */
export const PLAGE_BUDGET: DefPlage = {
  k: "budget",
  lbl: "Budget, total du séjour",
  pas: 100,
  unite: "€",
  fixe: [0, 10000],
};

/** Les plages de l'annonce, onglet « Par budget » seulement. Échelles fixes :
 *  le haut dit « et plus » (20 personnes, 8 chambres) ; zéro chambre, c'est
 *  un studio. */
export const PLAGES_LOGEMENT: readonly DefPlage[] = [
  { k: "capacite", lbl: "Personnes", pas: 1, unite: "pers.", fixe: [1, 20] },
  { k: "chambres", lbl: "Chambres", pas: 1, unite: "ch.", fixe: [0, 8] },
];

/** Une altitude à zéro n'est pas mesurée : `maxM` et `villageM` la rendent nulle. */
export function valeurStation(k: PlageStationK, s: Station): number | null {
  if (k === "km") return s.pistesKm;
  if (k === "sommet") return maxM(s);
  return villageM(s);
}

export type Bornes = Record<PlageK, readonly [number, number]>;

function bornesDe(def: DefPlage, stations: readonly Station[]): readonly [number, number] {
  if (def.fixe) return def.fixe;
  let min = Infinity;
  let max = -Infinity;
  for (const s of stations) {
    const v = valeurStation(def.k as PlageStationK, s);
    if (v == null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min > max) return [0, def.pas];
  return [Math.floor(min / def.pas) * def.pas, Math.ceil(max / def.pas) * def.pas];
}

/** L'échelle de chaque curseur, arrondie au pas, sur les valeurs mesurées. */
export function bornesPlages(stations: readonly Station[]): Bornes {
  const b = {} as Record<PlageK, readonly [number, number]>;
  for (const def of [...PLAGES, PLAGE_BUDGET, ...PLAGES_LOGEMENT]) {
    b[def.k] = bornesDe(def, stations);
  }
  return b;
}

/** Pose une poignée, arrondie au pas et bornée à l'échelle ; les deux ne se
 *  croisent pas. Toute l'échelle couverte, la plage redevient `null`. */
export function poserBorne(
  pl: Plage,
  b: readonly [number, number],
  pas: number,
  which: 0 | 1,
  v: number,
): Plage {
  if (!Number.isFinite(v)) return pl;
  const cur = pl ?? b;
  const x = Math.min(b[1], Math.max(b[0], Math.round(v / pas) * pas));
  const next: readonly [number, number] =
    which === 0 ? [Math.min(x, cur[1]), cur[1]] : [cur[0], Math.max(x, cur[0])];
  if (next[0] <= b[0] && next[1] >= b[1]) return null;
  return next;
}

/** La poignée qu'un clic sur la piste déplace. Poignées confondues : celle
 *  du côté du clic, sinon aucune ne pourrait plus s'écarter de l'autre. */
export function poigneeProche(v: number, cur: readonly [number, number]): 0 | 1 {
  if (cur[0] === cur[1]) return v < cur[0] ? 0 : 1;
  return Math.abs(v - cur[0]) <= Math.abs(v - cur[1]) ? 0 : 1;
}

/** « 1 200 € » → 1200, « 1,5 » → 1.5 ; ce qui n'est pas un nombre → `null`. */
export function lireSaisie(texte: string): number | null {
  const c = texte.replace(/[^\d.,-]/g, "").replace(",", ".");
  if (c === "") return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}

export function fmtPlage(k: PlageK, v: number): string {
  if (k === "prix" || k === "budget") return eur(v);
  if (k === "km") return `${fmt(v)} km`;
  if (k === "capacite") return `${fmt(v)} pers.`;
  if (k === "chambres") return `${fmt(v)} ch.`;
  return `${fmt(v)} m`;
}

/** La borne haute au maximum de l'échelle ne plafonne pas : « et plus ».
 *  Personnes et chambres se comptent à l'unité : deux poignées confondues
 *  disent un nombre, « 2 ch. », et non « 2 ch. à 2 ch. ». */
export function plageLbl(k: PlageK, pl: Plage, b: readonly [number, number]): string {
  if (pl == null) return "Indifférent";
  const [lo, hi] = pl;
  if (hi >= b[1]) return `${fmtPlage(k, lo)} et plus`;
  if (lo === hi && (k === "capacite" || k === "chambres")) return fmtPlage(k, lo);
  if (lo <= b[0]) return `jusqu’à ${fmtPlage(k, hi)}`;
  return `${fmtPlage(k, lo)} à ${fmtPlage(k, hi)}`;
}

/* ---------- Distance aux remontées ---------- */

/** Les paliers du filtre, ceux de Logements, jusqu'à la limite de la station. */
export const PALIERS_DIST_M: readonly number[] = DIST_PALIERS_M.filter(
  (m) => m <= DISTANCE_STATION_M,
);

/** Un palier inconnu (état abîmé, ancien réglage) revient aux 2 km de la
 *  station : le filtre ne s'élargit jamais au-delà. */
export function distMaxLue(m: number): number {
  return PALIERS_DIST_M.includes(m) ? m : DISTANCE_STATION_M;
}

/** « Au pied des pistes », « 500 m au plus », « 1 km au plus ». */
export function distLbl(m: number): string {
  if (m <= DIST_PALIERS_M[0]) return "Au pied des pistes";
  if (m >= 1000 && m % 1000 === 0) return `${fmt(m / 1000)} km au plus`;
  return `${fmt(m)} m au plus`;
}

/* ---------- Critères actifs ---------- */

/** Les filtres de l'onglet « Par station » : ceux de « Par budget » n'y comptent pas. */
export function filtresActifs(fl: Filtres): boolean {
  return fl.massif !== "" || fl.dept !== "" || fl.avecPrix || PLAGES.some((p) => fl[p.k] != null);
}

/** Les filtres de l'onglet « Par budget » : ni la médiane ni « avec un prix ».
 *  La distance ne compte qu'écartée de ses 2 km, qui sont le repos. */
export function filtresActifsBudget(fl: Filtres): boolean {
  return (
    fl.budget != null ||
    fl.massif !== "" ||
    fl.dept !== "" ||
    fl.domaine !== "" ||
    fl.station !== "" ||
    distMaxLue(fl.distMax) !== DISTANCE_STATION_M ||
    PLAGES_LOGEMENT.some((p) => fl[p.k] != null) ||
    PLAGES_STATION.some((p) => fl[p.k] != null)
  );
}

/** « Tout effacer » de l'onglet budget laisse les filtres de l'autre onglet. */
export function effacerBudget(fl: Filtres): Filtres {
  return {
    ...fl,
    budget: null,
    massif: "",
    dept: "",
    domaine: "",
    station: "",
    capacite: null,
    chambres: null,
    distMax: DISTANCE_STATION_M,
    km: null,
    sommet: null,
    village: null,
  };
}

/* ---------- Lieu : massif, département, domaine, station ---------- */

/** Chaque choix de lieu vide ceux qui en dépendaient : un autre massif rend
 *  caducs département, domaine et station ; un autre département, domaine et
 *  station ; un autre domaine, la station. */
export function choisirMassif(fl: Filtres, massif: string): Filtres {
  return { ...fl, massif, dept: "", domaine: "", station: "" };
}

export function choisirDept(fl: Filtres, dept: string): Filtres {
  return { ...fl, dept, domaine: "", station: "" };
}

export function choisirDomaine(fl: Filtres, domaine: string): Filtres {
  return { ...fl, domaine, station: "" };
}

export function choisirStation(fl: Filtres, station: string): Filtres {
  return { ...fl, station };
}

export type Option = { v: string; label: string };

/** Les domaines skiables des stations du massif et du département choisis,
 *  chacun avec son nombre de stations. « Tous » n'a pas de compte, comme le
 *  département. Le libellé que le classeur donne à trois domaines sans nom,
 *  sans rapport entre eux, n'est pas proposé (`domaineNomme`). */
export function optionsDomaine(
  stations: readonly Station[],
  massif: string,
  dept: string,
): Option[] {
  const compte = new Map<string, number>();
  for (const s of stations) {
    if (massif && s.massif !== massif) continue;
    if (dept && s.dept !== dept) continue;
    if (domaineNomme(s.domain)) compte.set(s.domain, (compte.get(s.domain) ?? 0) + 1);
  }
  return [
    { v: "", label: "Tous" },
    ...[...compte.keys()]
      .sort((a, b) => a.localeCompare(b, "fr"))
      .map((d) => ({ v: d, label: `${d} · ${compte.get(d)}` })),
  ];
}

/** Le nom de chaque station, précisé par son domaine (à défaut son
 *  département, puis son massif) quand deux stations le portent : deux
 *  « Le Granier » dans un même choix ne se distinguaient pas. */
export function nomsDistincts(stations: readonly Station[]): Map<string, string> {
  const parNom = new Map<string, number>();
  for (const s of stations) parNom.set(s.name, (parNom.get(s.name) ?? 0) + 1);
  return new Map(
    stations.map((s) => {
      if ((parNom.get(s.name) ?? 0) < 2) return [s.id, s.name];
      const precision = domaineNomme(s.domain) ? s.domain : (s.dept ?? s.massif);
      return [s.id, `${s.name} · ${precision}`];
    }),
  );
}

/** Les stations relevées qui passent massif, département et domaine, par nom.
 *  La station choisie reste proposée même quand elle n'y est plus (autres
 *  dates, autre groupe) : le choix affiché dit toujours le filtre réel. */
export function optionsStation(
  relevees: readonly Station[],
  fl: Pick<Filtres, "massif" | "dept" | "domaine" | "station">,
  noms: ReadonlyMap<string, string>,
): Option[] {
  const nom = (id: string) => noms.get(id) ?? id;
  const ids = relevees
    .filter(
      (s) =>
        (!fl.massif || s.massif === fl.massif) &&
        (!fl.dept || s.dept === fl.dept) &&
        (!fl.domaine || s.domain === fl.domaine),
    )
    .map((s) => s.id);
  if (fl.station && !ids.includes(fl.station)) ids.push(fl.station);
  const opts = ids
    .map((id) => ({ v: id, label: nom(id) }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr") || ordreTexte(a.v, b.v));
  return [{ v: "", label: "Toutes" }, ...opts];
}

/* ---------- Lignes, tri ---------- */

export type EtatLigne = "en-cours" | "attente" | "non-releve" | "echec" | "peu" | "prix";
export type Ligne = {
  id: string;
  nom: string;
  massif: string;
  dept: string | null;
  /** « Alpes du Nord · Isère » */
  subMassif: string;
  etat: EtatLigne;
  /** Logements retenus, pour un résultat « fait » seulement. */
  n: number | null;
  /** Seulement quand `etat === "prix"`. */
  med: number | null;
  res: Resultat | null;
};

/** Priorité : en-cours (même avec un résultat) > attente (seulement sans
 *  résultat) > pas de résultat → non-releve > echec > n < MIN_ANNONCES → peu > prix. */
export function ligne(
  s: Station,
  res: Resultat | null,
  course: { enCours: boolean; attente: boolean },
): Ligne {
  let etat: EtatLigne;
  if (course.enCours) etat = "en-cours";
  else if (course.attente && !res) etat = "attente";
  else if (!res) etat = "non-releve";
  else if (res.etat === "echec") etat = "echec";
  else if (res.n < MIN_ANNONCES) etat = "peu";
  else etat = "prix";
  const fait = res?.etat === "fait" ? res : null;
  return {
    id: s.id,
    nom: s.name,
    massif: s.massif,
    dept: s.dept,
    subMassif: [s.massif, s.dept].filter(Boolean).join(" · "),
    etat,
    n: fait ? fait.n : null,
    med: etat === "prix" && fait ? fait.med : null,
    res,
  };
}

/** Une plage active écarte une valeur absente : une absence n'est pas un
 *  zéro. La borne haute au maximum de l'échelle ne plafonne pas : « et plus ». */
function dansPlage(v: number | null, pl: Plage, b: readonly [number, number]): boolean {
  if (pl == null) return true;
  if (v == null) return false;
  if (v < pl[0]) return false;
  return !(pl[1] < b[1] && v > pl[1]);
}

/** Massif, département et plages de station : ce que les deux onglets
 *  partagent. */
function passeLieuCommun(s: Station, fl: Filtres, b: Bornes): boolean {
  if (fl.massif && s.massif !== fl.massif) return false;
  if (fl.dept && s.dept !== fl.dept) return false;
  return PLAGES_STATION.every((def) => dansPlage(valeurStation(def.k, s), fl[def.k], b[def.k]));
}

/** La station, vue de l'onglet budget : ce que les deux onglets partagent,
 *  plus le domaine et la station choisis. */
export function passeStationSeule(s: Station, fl: Filtres, b: Bornes): boolean {
  if (fl.domaine && s.domain !== fl.domaine) return false;
  if (fl.station && s.id !== fl.station) return false;
  return passeLieuCommun(s, fl, b);
}

/** La plage de prix lit la médiane de la ligne ; les critères de l'onglet
 *  budget (budget, domaine, station, logement) n'y entrent pas. */
export function passe(l: Ligne, s: Station, fl: Filtres, b: Bornes): boolean {
  if (fl.avecPrix && l.etat !== "prix") return false;
  return dansPlage(l.med, fl.prix, b.prix) && passeLieuCommun(s, fl, b);
}

export function passeBudget(total: number, pl: Plage, b: readonly [number, number]): boolean {
  return dansPlage(total, pl, b);
}

/**
 * Une annonce de l'onglet budget : son total, sa distance aux remontées, ses
 * personnes et ses chambres. Les annonces enregistrées avant la règle des
 * 2 km y passent aussi : leur relevé ne l'appliquait pas. Une capacité ou des
 * chambres absentes écartent quand leur plage est active, comme partout.
 *
 * Les relevés enregistrés avant le 26 septembre 2026 gardent aussi ce que
 * `cribler` écarte désormais : hôtels, forfaits compris, mobil-homes,
 * chambres d'hôtes et dortoirs, logements hors de France, fiches que leur
 * titre dément. Ils sortent ici, à la relecture, sans nouveau relevé : sur les
 * relevés d'Adrien, 119 cartes de « Par budget » sur 1 618, dont la carte
 * n° 1, l'Airbnb « Mobile-home » d'Aragnouet à 628 €, et 88 hôtels.
 */
export function passeAnnonce(a: AnnonceRetenue, fl: Filtres, b: Bornes): boolean {
  if (!passeBudget(a.total, fl.budget, b.budget)) return false;
  if (!dansLaStation(a, distMaxLue(fl.distMax))) return false;
  if (!dansPlage(a.guests ?? null, fl.capacite, b.capacite)) return false;
  if (!dansPlage(normalizedBedrooms(a), fl.chambres, b.chambres)) return false;
  return !horsSujetRelu(a);
}

/** Le verdict de chaque annonce relue, calculé une fois : `filtrerCartes`
 *  repasse toutes les cartes à chaque cran d'un curseur, et l'annonce ne
 *  change pas entre deux. */
const horsSujetMemo = new WeakMap<object, boolean>();

function horsSujetRelu(a: AnnonceRetenue): boolean {
  const connu = horsSujetMemo.get(a);
  if (connu !== undefined) return connu;
  const v = motifHorsSujet(a) != null || ficheDementieParLeTitre(a);
  horsSujetMemo.set(a, v);
  return v;
}

export type Tri = { k: "med" | "nom" | "massif" | "n"; dir: 1 | -1 };
export const TRI0: Tri = { k: "med", dir: 1 };

export const TRIS: readonly { v: string; label: string }[] = [
  { v: "med:1", label: "Prix croissant" },
  { v: "med:-1", label: "Prix décroissant" },
  { v: "nom:1", label: "Nom, de A à Z" },
  { v: "massif:1", label: "Massif, puis prix" },
  { v: "n:-1", label: "Nombre de logements" },
];

/** Le tri par massif ignore le sens : il n'a qu'une valeur. */
export function triVal(t: Tri): string {
  return t.k === "massif" ? "massif:1" : `${t.k}:${t.dir}`;
}

const CLES_TRI: readonly Tri["k"][] = ["med", "nom", "massif", "n"];

export function lireTri(v: string): Tri {
  const [k, d] = v.split(":");
  const cle = CLES_TRI.find((c) => c === k);
  if (!cle || (d !== "1" && d !== "-1")) return TRI0;
  return { k: cle, dir: cle === "massif" || d === "1" ? 1 : -1 };
}

/** Un clic d'en-tête peut poser un sens que la liste ne propose pas : le
 *  libellé le nomme quand même, plutôt que d'afficher le premier choix. */
export function triLbl(t: Tri): string {
  if (t.k === "nom" && t.dir === -1) return "Nom, de Z à A";
  if (t.k === "n" && t.dir === 1) return "Nombre de logements, croissant";
  return TRIS.find((x) => x.v === triVal(t))?.label ?? TRIS[0].label;
}

/** Nombre de stations décroissant, égalité départagée par le nom. */
export function ordreMassifs(stations: readonly Station[]): string[] {
  const compte = new Map<string, number>();
  for (const s of stations) compte.set(s.massif, (compte.get(s.massif) ?? 0) + 1);
  return [...compte.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .map(([m]) => m);
}

function parId(a: Ligne, b: Ligne): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Deux stations portent le même nom (« Le Granier ») : l'id départage, pour
 *  un ordre stable. */
function parNom(a: Ligne, b: Ligne): number {
  return a.nom.localeCompare(b.nom, "fr") || parId(a, b);
}

function parPrix(a: Ligne, b: Ligne): number {
  if (a.med == null && b.med == null) return parNom(a, b);
  if (a.med == null) return 1;
  if (b.med == null) return -1;
  return a.med - b.med || parNom(a, b);
}

/** Une station sans valeur passe en fin de liste dans les deux sens : un
 *  tri décroissant ne doit pas ouvrir sur des lignes vides. */
export function comparateur(
  t: Tri,
  rangMassif: ReadonlyMap<string, number>,
): (a: Ligne, b: Ligne) => number {
  if (t.k === "nom") return (a, b) => t.dir * a.nom.localeCompare(b.nom, "fr") || parId(a, b);
  if (t.k === "massif") {
    const rang = (m: string) => rangMassif.get(m) ?? Number.MAX_SAFE_INTEGER;
    return (a, b) => rang(a.massif) - rang(b.massif) || parPrix(a, b);
  }
  const k = t.k;
  return (a, b) => {
    const va = a[k];
    const vb = b[k];
    if (va == null && vb == null) return parNom(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    return t.dir * (va - vb) || parNom(a, b);
  };
}

/* ---------- Libellés ---------- */

export function plur(n: number, un: string, plusieurs: string): string {
  return `${n} ${n > 1 ? plusieurs : un}`;
}

/** « 12 stations sur 320 » */
export function countFl(n: number, total: number): string {
  return `${plur(n, "station", "stations")} sur ${total}`;
}

/** « 40 affichées sur 320 », « 1 affichée sur 1 » */
export function countLbl(affichees: number, total: number): string {
  return `${plur(affichees, "affichée", "affichées")} sur ${total}`;
}

export function moreLbl(restant: number): string {
  return `Afficher ${Math.min(PAGE, restant)} de plus`;
}

export function relLbl(n: number, listeFaite: boolean): string {
  if (listeFaite)
    return n === 1 ? "Relever à nouveau la station" : `Relever à nouveau les ${n} stations`;
  return n === 1 ? "Relever la station affichée" : `Relever les ${n} stations de la liste`;
}

/** Le nom d'une liste lancée : massif et département, les plages n'y entrent pas. */
export function nomListe(fl: Filtres): string {
  return [fl.massif, fl.dept].filter(Boolean).join(", ") || "stations de la liste";
}

export type Jeton = { k: keyof Filtres; lbl: string };

function jetonsPlages(defs: readonly DefPlage[], fl: Filtres, b: Bornes): Jeton[] {
  const out: Jeton[] = [];
  for (const def of defs) {
    const pl = fl[def.k];
    if (pl != null) out.push({ k: def.k, lbl: `${def.lbl} : ${plageLbl(def.k, pl, b[def.k])}` });
  }
  return out;
}

/** Les jetons de l'onglet « Par station » : le budget n'y paraît pas. */
export function jetons(fl: Filtres, b: Bornes): Jeton[] {
  const out: Jeton[] = [];
  if (fl.massif) out.push({ k: "massif", lbl: fl.massif });
  if (fl.dept) out.push({ k: "dept", lbl: fl.dept });
  if (fl.avecPrix) out.push({ k: "avecPrix", lbl: "Avec un prix" });
  return [...out, ...jetonsPlages(PLAGES, fl, b)];
}

/** Les jetons de l'onglet « Par budget », dans l'ordre des critères à
 *  l'écran : budget, massif, département, domaine, station, distance, puis
 *  les plages de logement et de station. `noms` nomme la station choisie. */
export function jetonsBudget(
  fl: Filtres,
  b: Bornes,
  noms: ReadonlyMap<string, string> = new Map(),
): Jeton[] {
  const out: Jeton[] = [];
  if (fl.budget != null) {
    out.push({ k: "budget", lbl: `Budget : ${plageLbl("budget", fl.budget, b.budget)}` });
  }
  if (fl.massif) out.push({ k: "massif", lbl: fl.massif });
  if (fl.dept) out.push({ k: "dept", lbl: fl.dept });
  if (fl.domaine) out.push({ k: "domaine", lbl: `Domaine : ${fl.domaine}` });
  if (fl.station) out.push({ k: "station", lbl: noms.get(fl.station) ?? fl.station });
  const dist = distMaxLue(fl.distMax);
  if (dist !== DISTANCE_STATION_M) {
    // « Au pied des pistes » se suffit : « Remontées : au pied des pistes »
    // dirait que les remontées sont au pied des pistes.
    const d = distLbl(dist);
    const lbl =
      dist <= DIST_PALIERS_M[0] ? d : `Remontées : ${d.charAt(0).toLowerCase()}${d.slice(1)}`;
    out.push({ k: "distMax", lbl });
  }
  return [...out, ...jetonsPlages(PLAGES_LOGEMENT, fl, b), ...jetonsPlages(PLAGES_STATION, fl, b)];
}

/** Retirer un lieu retire ceux qui en dépendaient (voir `choisirMassif`) ; la
 *  distance revient à ses 2 km. */
export function retirerJeton(fl: Filtres, k: keyof Filtres): Filtres {
  if (k === "massif") return choisirMassif(fl, "");
  if (k === "dept") return choisirDept(fl, "");
  if (k === "domaine") return choisirDomaine(fl, "");
  if (k === "station") return choisirStation(fl, "");
  if (k === "avecPrix") return { ...fl, avecPrix: false };
  if (k === "distMax") return { ...fl, distMax: DISTANCE_STATION_M };
  const next = { ...fl };
  next[k] = null;
  return next;
}

/** « 5 sans capacité annoncée, 2 trop petites » : ce que le relevé a écarté du compte. */
export function annSub(r: Resultat | null): string {
  if (r?.etat !== "fait") return "";
  const parts: string[] = [];
  if (r.muettes > 0) parts.push(`${r.muettes} sans capacité annoncée`);
  if (r.petits > 0) parts.push(plur(r.petits, "trop petite", "trop petites"));
  return parts.join(", ");
}

/** « partiel, sans Airbnb ni Booking » : après « sans », le dernier nom se
 *  relie par « ni », pas par une virgule. */
export function partielLbl(sources: readonly string[]): string {
  if (sources.length === 0) return "";
  const tete = sources.slice(0, -1);
  const dernier = sources[sources.length - 1];
  return `partiel, sans ${tete.length > 0 ? `${tete.join(", ")} ni ${dernier}` : dernier}`;
}

function deux(n: number): string {
  return String(n).padStart(2, "0");
}

/** « 24 sept. 2026 », jour du relevé à l'heure de l'utilisateur : le jour
 *  UTC datait de la veille tout relevé fait entre minuit et 2 h à Paris. Un
 *  horodatage hors de l'échelle des dates (stockage abîmé) ne se date pas,
 *  il ne casse pas l'écran. */
export function releveLbl(r: Resultat | null): string {
  if (!r) return "";
  const d = new Date(r.ts);
  if (Number.isNaN(d.getTime())) return "";
  const an = String(d.getFullYear()).padStart(4, "0");
  return formatDayIso(`${an}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`);
}

export function sousTitre(nights: number, trav: number): string {
  return `Médiane du total pour ${nuitsLbl(nights)}, parmi les logements qui accueillent ${travLbl(trav)}.`;
}

export function ecartLbl(sejour: Periode): string {
  return `Votre séjour : ${perLbl(sejour)}, ${nuitsLbl(sejour.nights)}.`;
}

export function medHead(nights: number): string {
  return `Médiane, ${nuitsLbl(nights)}`;
}

/** Compte à rebours, arrondi à la seconde supérieure : « 45 s », « 1 min 5 s ».
 *  Jamais négatif ; une attente écoulée se lit « 0 s ». */
export function dureeLbl(ms: number): string {
  const s = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const reste = s % 60;
  return reste ? `${min} min ${reste} s` : `${min} min`;
}

/* ---------- Onglet « Par budget » ---------- */

export type TriB = "prix:1" | "prix:-1" | "cap:-1" | "dist:1";
export const TRIB0: TriB = "prix:1";
export const TRIS_B: readonly { v: TriB; label: string }[] = [
  { v: "prix:1", label: "Prix croissant" },
  { v: "prix:-1", label: "Prix décroissant" },
  { v: "cap:-1", label: "Capacité" },
  { v: "dist:1", label: "Plus près des remontées" },
];

export function lireTriB(v: string): TriB {
  return TRIS_B.find((t) => t.v === v)?.v ?? TRIB0;
}

/** Une annonce de l'onglet budget, avec la station dont le relevé l'a retenue. */
export type CarteAnnonce = { a: AnnonceRetenue; stationId: string; stationNom: string };

function ordreTexte(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Une annonce à mi-chemin de deux stations peut sortir des deux relevés :
 *  la station départage après l'id, pour un ordre stable. */
function parCarte(p: CarteAnnonce, q: CarteAnnonce): number {
  return ordreTexte(p.a.id, q.a.id) || ordreTexte(p.stationId, q.stationId);
}

/** Une distance inconnue passe après toutes les autres. */
function parDistance(p: CarteAnnonce, q: CarteAnnonce): number {
  const dp = distFiltrableM(p.a);
  const dq = distFiltrableM(q.a);
  if (dp == null || dq == null) return dp == null ? (dq == null ? 0 : 1) : -1;
  return dp - dq;
}

/** Capacité : la plus grande d'abord, puis la moins chère. Remontées : la
 *  plus proche d'abord, puis la moins chère. */
export function comparateurBudget(t: TriB): (p: CarteAnnonce, q: CarteAnnonce) => number {
  if (t === "cap:-1") {
    return (p, q) =>
      (q.a.guests ?? 0) - (p.a.guests ?? 0) || p.a.total - q.a.total || parCarte(p, q);
  }
  if (t === "dist:1") return (p, q) => parDistance(p, q) || p.a.total - q.a.total || parCarte(p, q);
  const dir = t === "prix:-1" ? -1 : 1;
  return (p, q) => dir * (p.a.total - q.a.total) || parCarte(p, q);
}

/** Les cartes qui passent les critères d'annonce, une par logement : deux
 *  cartes d'un même logement ouvraient et retenaient la même copie, et le
 *  compte le prenait deux fois. Une annonce sortie des relevés de deux
 *  stations voisines garde, parmi ses cartes qui passent, celle qui la mesure
 *  le plus près des remontées, à la place de la première qui passe :
 *  celle-là changeait avec le palier de distance, et avec elle la distance
 *  affichée, le tri et la station nommée. La plus proche passe dès qu'une
 *  copie passe. À égalité, la station nommée est celle dont le repère est le
 *  plus près de la remontée du logement (`ecartAuReleve`), plus la première du
 *  référentiel : « La Cascade - La Giettaz », sortie à 293 m des relevés de
 *  Cordon, de Crest-Voland et de La Giettaz, s'étiquetait « Cordon »
 *  (25 septembre 2026). Chaque logement garde la place de sa première carte,
 *  qu'elle passe ou non. */
export function filtrerCartes(
  cartes: readonly CarteAnnonce[],
  fl: Filtres,
  b: Bornes,
): CarteAnnonce[] {
  // Une Map garde l'ordre de sa première clé, même quand la valeur change.
  const gardees = new Map<string, CarteAnnonce | null>();
  for (const c of cartes) {
    const deja = gardees.get(c.a.id) ?? null;
    if (!passeAnnonce(c.a, fl, b)) {
      if (!gardees.has(c.a.id)) gardees.set(c.a.id, null);
      continue;
    }
    if (!deja || copiePreferee(c, deja)) gardees.set(c.a.id, c);
  }
  return [...gardees.values()].filter((c): c is CarteAnnonce => c != null);
}

/** `c` passe devant `deja`, deux copies d'une même annonce qui passent. */
function copiePreferee(c: CarteAnnonce, deja: CarteAnnonce): boolean {
  // Une carte qui passe a une distance : `dansLaStation` l'exige.
  const dc = distFiltrableM(c.a) ?? 0;
  const dd = distFiltrableM(deja.a) ?? 0;
  if (dc !== dd) return dc < dd;
  return ecartAuReleve(c) < ecartAuReleve(deja);
}

/**
 * Du repère de la station du relevé à la remontée du logement (à défaut, au
 * logement) : c'est de ses remontées qu'on part skier. Pas le repère le plus
 * proche du logement lui-même : une maison d'Ax-les-Thermes, à 3,4 km du
 * repère nordique du Chioula et 3,6 km de celui d'Ax 3 Domaines, skie au Baou,
 * une remontée d'Ax.
 */
function ecartAuReleve(c: CarteAnnonce): number {
  const s = stationById(c.stationId);
  const lat = c.a.liftLat ?? c.a.lat;
  const lon = c.a.liftLon ?? c.a.lon;
  if (!s || lat == null || lon == null) return Number.POSITIVE_INFINITY;
  return metresBetween(lat, lon, s.lat, s.lon);
}

/**
 * Les logements de toutes les annonces relevées. L'identité est celle de chaque
 * relevé : les offres qu'il a marquées du même `logement` sont un logement,
 * exactement celui que sa médiane compte une fois. Elle n'est pas refaite ici
 * sur toutes les stations réunies : un titre générique repris par la même
 * plateforme dans une autre station y rendait le titre « ambigu » et défaisait
 * la paire (deux cartes pour un bien), et une clé Cozy s'y ancrait sur l'offre
 * d'une autre station.
 *
 * D'une station à l'autre, deux logements se réunissent quand ils partagent
 * une offre (même id), jamais au point de mettre deux offres d'une même
 * plateforme dans un logement, comme `regrouper`. Une offre sans marque vient
 * d'un relevé antérieur au soir du 25 septembre 2026, qui ne gardait qu'une
 * offre par logement : elle reste seule, faute de savoir ce que le relevé
 * avait séparé.
 *
 * À appeler sur toutes les annonces relevées, avant les critères : les
 * critères choisissent les cartes montrées, ils ne changent pas qui va avec qui.
 */
export function logementsReleves(cartes: readonly CarteAnnonce[]): Logement[] {
  const parent = new Map<string, string>();
  const premiere = new Map<string, AnnonceRetenue>();
  /** Les plateformes de chaque logement, tenues à sa racine. */
  const sources = new Map<string, Set<string>>();
  const racine = (id: string): string => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    let x = id;
    while (x !== r) {
      const suivant = parent.get(x) as string;
      parent.set(x, r);
      x = suivant;
    }
    return r;
  };
  const unir = (a: string, b: string) => {
    const ra = racine(a);
    const rb = racine(b);
    if (ra === rb) return;
    const sa = sources.get(ra) as Set<string>;
    const sb = sources.get(rb) as Set<string>;
    for (const s of sb) if (sa.has(s)) return;
    parent.set(rb, ra);
    for (const s of sb) sa.add(s);
    sources.delete(rb);
  };
  /** La première offre vue de chaque logement de relevé (station et marque). */
  const tete = new Map<string, string>();
  for (const c of cartes) {
    const { id, source, logement } = c.a;
    if (!parent.has(id)) {
      parent.set(id, id);
      premiere.set(id, c.a);
      sources.set(id, new Set([source]));
    }
    if (!logement) continue;
    const cle = `${c.stationId}\n${logement}`;
    const t = tete.get(cle);
    if (t == null) tete.set(cle, id);
    else unir(t, id);
  }
  const groupes = new Map<string, Listing[]>();
  for (const [id, a] of premiere) {
    const r = racine(id);
    const g = groupes.get(r);
    if (g) g.push(a);
    else groupes.set(r, [a]);
  }
  return [...groupes.values()].map((os) => {
    const offres = sansPrixAberrant(os).sort(parPrixOffre);
    return { principale: offres[0] as Listing, offres };
  });
}

/** Au-delà de trois fois la médiane des autres offres du logement, un prix
 *  n'est pas celui du logement. */
export const ECART_PRIX_ABERRANT = 3;

/**
 * Les offres d'un logement, moins celles dont le total dépasse trois fois la
 * médiane des autres. « Résidence Joséphine », à Châtel, se vendait 2 779 €
 * chez Booking et 73 566 € chez Abritel, 26,5 fois plus, sans doute la
 * résidence entière (relevés du 25 septembre 2026) : avec un budget minimum
 * au-dessus de 2 779 €, la carte montrait 73 566 €. L'offre est retirée du
 * logement, pas montrée à part : ce n'est pas un autre bien. Sur ces relevés,
 * le seuil ne touche que Joséphine ; l'hôtel Sowell qu'il retirait aussi sort
 * désormais comme hôtel, sans compter dans la médiane. À une fois et demie, il
 * retirait deux vraies locations. Une offre seule reste.
 *
 * La médiane des autres ne compte que les offres que la relecture montre
 * (`horsSujetRelu`) : une chambre d'hôtel à 2 000 € dans le même logement
 * retirait la vraie location à 7 000 €, puis sortait elle-même comme hôtel.
 * Le logement n'avait plus d'offre.
 */
function sansPrixAberrant(offres: readonly AnnonceRetenue[]): AnnonceRetenue[] {
  if (offres.length < 2) return [...offres];
  const montrees = offres.filter((o) => !horsSujetRelu(o));
  return offres.filter((o) => {
    const autres = mediane(montrees.filter((x) => x !== o).map((x) => x.total));
    return autres == null || !(o.total > ECART_PRIX_ABERRANT * autres);
  });
}

/** Un logement de l'onglet budget : ses offres qui passent les critères, la
 *  moins chère en tête, chacune avec la station dont le relevé la montre. */
export type LogementBudget = { principale: CarteAnnonce; offres: CarteAnnonce[] };

/**
 * Une carte par logement. Les critères retirent des offres à l'intérieur de
 * chaque logement (`filtrees`, rendu par `filtrerCartes`), et la moins chère
 * de celles qui restent se montre. Chaque offre garde la carte que
 * `filtrerCartes` a choisie pour elle, et c'est sur ces cartes que le prix se
 * compare : une annonce relevée pour deux stations à deux prix montre la
 * copie la plus proche des remontées, qui n'est pas forcément la première.
 */
export function logementsBudget(
  groupes: readonly Logement[],
  filtrees: readonly CarteAnnonce[],
): LogementBudget[] {
  const passe = new Map(filtrees.map((c) => [c.a.id, c] as const));
  const out: LogementBudget[] = [];
  for (const g of groupes) {
    const offres = g.offres
      .map((o) => passe.get(o.id))
      .filter((c): c is CarteAnnonce => c != null)
      .sort((p, q) => parPrixOffre(p.a, q.a));
    const [principale] = offres;
    if (principale) out.push({ principale, offres });
  }
  return out;
}

/** Le logement tel que le volet de Logements le lit. */
export function versLogement(g: LogementBudget): Logement {
  return { principale: g.principale.a, offres: g.offres.map((o) => o.a) };
}

/** L'étiquette de la carte : « Booking + 1 · Albiez-Montrond ». La liste mêle
 *  plusieurs stations, et la carte de Logements n'a pas d'autre place pour
 *  nommer celle du relevé. */
export function sourcesBudget(g: LogementBudget): string {
  const autres = g.offres.length - 1;
  const src = autres > 0 ? `${g.principale.a.source} + ${autres}` : g.principale.a.source;
  return `${src} · ${g.principale.stationNom}`;
}

/** « Aussi sur Airbnb (3 061,00 €) », pour l'infobulle de l'étiquette, comme
 *  dans Logements ; rien pour un logement vendu sur une seule plateforme. */
export function autresBudget(g: LogementBudget): string | null {
  const autres = g.offres.slice(1);
  if (autres.length === 0) return null;
  return `Aussi sur ${autres.map((o) => `${o.a.source} (${prixLbl(o.a)})`).join(", ")}`;
}

/** « 12 logements dans 3 stations », « 0 logement ». */
export function countBudget(nAnnonces: number, nStations: number): string {
  const n = plur(nAnnonces, "logement", "logements");
  return nStations > 0 ? `${n} dans ${plur(nStations, "station", "stations")}` : n;
}

/** Le domaine ou la station choisis n'ont aucune station relevée pour la
 *  période et le groupe affichés (`relevees`) : la liste est vide faute de
 *  relevé, pas à cause des autres critères. La station choisie reste dans
 *  son menu même sans relevé (`optionsStation`), un domaine aussi. */
export function lieuSansReleve(fl: Filtres, relevees: readonly Station[]): boolean {
  if (fl.station) return !relevees.some((s) => s.id === fl.station);
  if (fl.domaine) {
    return !relevees.some(
      (s) =>
        s.domain === fl.domaine &&
        (!fl.massif || s.massif === fl.massif) &&
        (!fl.dept || s.dept === fl.dept),
    );
  }
  return false;
}

/** Pourquoi la liste est vide : pas de relevé du tout, pas de relevé du lieu
 *  choisi, le budget, les autres critères, ou, sans aucun critère, la règle
 *  des 2 km elle-même. */
export function videBudget(
  aucunReleve: boolean,
  avantBudget: number,
  criteres = true,
  sansReleve = false,
): { titre: string; hint: string; versStation: boolean } {
  if (aucunReleve) {
    return {
      titre: "Aucune annonce relevée pour ces dates",
      hint: "Les logements proposés viennent des relevés. Lancez un relevé dans l’onglet Par station, ou revenez à des dates déjà relevées.",
      versStation: true,
    };
  }
  if (sansReleve) {
    return {
      titre: "Ce lieu n’a pas été relevé pour ces dates",
      hint: "Lancez un relevé dans l’onglet Par station, ou choisissez d’autres dates.",
      versStation: true,
    };
  }
  if (avantBudget > 0) {
    return {
      titre: "Aucun logement dans ce budget",
      hint: `${plur(avantBudget, "logement correspond", "logements correspondent")} aux autres critères. Élargissez le budget pour ${avantBudget > 1 ? "les" : "le"} voir.`,
      versStation: false,
    };
  }
  if (!criteres) {
    return {
      titre: "Aucun logement de station pour ces dates",
      hint: "Les relevés de ces dates n’ont retenu aucun logement à 2 km au plus d’une remontée.",
      versStation: false,
    };
  }
  return {
    titre: "Aucun logement ne correspond à ces critères",
    hint: "Retirez un critère, ou effacez-les tous.",
    versStation: false,
  };
}

export function sousTitreBudget(nights: number, trav: number): string {
  return `Logements qui accueillent ${travLbl(trav)} pour ${nuitsLbl(nights)}, dans votre budget.`;
}

/* ---------- File des relevés ---------- */

export type Job = { nom: string; ids: string[]; per: Periode; groupe: Groupe };

/** Même période, même groupe, mêmes stations dans le même ordre : même relevé.
 *  Le nom n'y entre pas, deux listes homonymes peuvent différer. */
export function signature(j: Pick<Job, "ids" | "per" | "groupe">): string {
  return `${perKey(j.per)}|${grpKey(j.groupe)}|${j.ids.join(",")}`;
}

export function dejaPrevu(j: Job, course: Job | null, file: readonly Job[]): boolean {
  const sig = signature(j);
  if (course && signature(course) === sig) return true;
  return file.some((x) => signature(x) === sig);
}

/** Les stations de `ids` qu'aucun relevé de même période et même groupe n'a
 *  pris en charge : ni la course, stations déjà faites comprises, ni la file.
 *  Une liste filtrée grandit pendant un relevé (« Avec un prix seulement ») :
 *  relancée telle quelle, elle referait les stations déjà prévues. Et une
 *  station que la course vient de finir n'est pas à refaire : sans cela, le
 *  bouton revenait en pleine course pour relever à nouveau ce qui venait de
 *  l'être. */
export function idsALancer(
  ids: readonly string[],
  per: Periode,
  groupe: Groupe,
  course: (Job & { i: number }) | null,
  file: readonly Job[],
): string[] {
  const cle = `${perKey(per)}|${grpKey(groupe)}`;
  const meme = (j: Job) => `${perKey(j.per)}|${grpKey(j.groupe)}` === cle;
  const prevus = new Set<string>();
  if (course && meme(course)) for (const id of course.ids) prevus.add(id);
  for (const j of file) if (meme(j)) for (const id of j.ids) prevus.add(id);
  return ids.filter((id) => !prevus.has(id));
}

/** Ce que le relevé d'une station rend à la boucle (`releve.ts`). */
export type ReleveRendu = {
  resultat: Resultat;
  /** L'application ne répondait plus : la course s'abandonne, rien ne s'écrit. */
  injoignable: boolean;
  /**
   * Les cinq parts se sont rendues avant tout arrêt de la course : un
   * « Arrêter » venu ensuite est tombé pendant la complétion, ou après.
   */
  partsRendues: boolean;
};

/**
 * Ce que la boucle écrit du relevé d'une station : `fait`, la médiane et les
 * annonces retenues ; `echec`, l'échec, qui retire les annonces d'un relevé
 * plus ancien de la même clé ; `null`, rien.
 *
 * `enCours` : la course qui l'a lancé est toujours celle en vol. Arrêtée
 * pendant ses parts, la station n'écrit rien. Arrêtée pendant la complétion,
 * ses cinq parts rendues, elle écrit sa médiane, avec ce que les tranches ont
 * posé : sa clé (période, groupe, station) est la sienne, pas celle de la
 * course suivante. Une course arrêtée n'écrit jamais d'échec, et un échec ne
 * remplace jamais une médiane.
 */
export function ecritureDuReleve(
  lu: ReleveRendu,
  ancien: Resultat | undefined,
  enCours: boolean,
): "fait" | "echec" | null {
  if (lu.injoignable) return null;
  if (!enCours) return lu.partsRendues && lu.resultat.etat === "fait" ? "fait" : null;
  if (lu.resultat.etat === "fait") return "fait";
  return ancien?.etat === "fait" ? null : "echec";
}

/** Garde les `max` résultats les plus récents. Rend l'objet d'origine quand
 *  rien ne part, pour ne pas réécrire le stockage sans raison. */
export function elaguer(
  res: Readonly<Record<string, Resultat>>,
  max: number = MAX_RESULTATS,
): Record<string, Resultat> {
  const entrees = Object.entries(res);
  const garde = Math.max(0, Math.floor(max));
  if (entrees.length <= garde) return res as Record<string, Resultat>;
  entrees.sort((a, b) => b[1].ts - a[1].ts);
  return Object.fromEntries(entrees.slice(0, garde));
}
