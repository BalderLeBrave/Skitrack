/**
 * Le filtre de l'écran Logements, extrait du sélecteur pour être testable.
 *
 * Il vivait en ligne dans une passe de dérivation React, où rien ne pouvait
 * l'interroger. Une annonce sans prix y a traversé longtemps un « 4 chambres
 * minimum » qu'elle contredisait sur sa propre vignette, et aucun test ne
 * pouvait le voir. Le prédicat est donc ici, pur, et `lodging.test.ts` en
 * couvre les cas limites : c'est ce fichier qui fait autorité sur ce que
 * l'écran montre.
 *
 * Les deux règles qui gouvernent tout le reste :
 *
 * 1. **« Non annoncé » n'est pas « ne convient pas ».** Une caractéristique
 *    absente laisse passer. Écarter sur une donnée que la source n'a jamais
 *    publiée viderait la liste sans rien dire : une recherche Airbnb à huit
 *    voyageurs ne rend que des biens qui les acceptent, mais ses cartes ne
 *    l'écrivent nulle part.
 * 2. **Une caractéristique annoncée engage l'annonce**, qu'elle porte un prix
 *    ou non. L'absence de tarif dispense des filtres de prix, pas des autres.
 *
 * Repris de `src/renderer/src/data/lodgingFilter.ts` (commit 2d960d5), adapté
 * au `Listing` actuel : l'ancien `Lodging` disait « non annoncé » avec un zéro,
 * `Listing` le dit avec `null`, ce qui supprime toute ambiguïté avec « zéro
 * chambre », c'est-à-dire un studio. Les parties hôtel combinable, type coché
 * et distance ne sont pas reprises : le relevé ne portait alors ni type ni
 * mesure de distance au moment du filtre. Il porte aujourd'hui le type publié
 * (`propertyType`) : hôtels, chambres d'hôtes, mobil-homes et logements hors
 * de France sortent de l'écran « Prix » par `prix/horsSujet.ts` (26 septembre
 * 2026), pas par ce filtre.
 */

import { isBookable, type Stay } from "./availability.ts";
import { inRange, rangeOpen } from "./range.ts";
import type { DomainVerdict } from "../domainFit.ts";
import { ficheDementieParLeTitre } from "./occupancy.ts";
import { LIMITE_TERRITOIRE_M, territoireReasonFor } from "./territoire.ts";
import { distanceAuRepere, RATTACHEMENT_MAX_M, verdictStation } from "./rattachement.ts";
import { aTraduire, tr, trN } from "../i18n/tr.ts";


/**
 * Ce que le filtre a besoin de lire.
 *
 * Structurel et tolérant : `Listing` s'y conforme, et `rooms` (pièces) reste
 * facultatif parce que les centrales comptent en pièces là où les plateformes
 * comptent en chambres.
 */
export type FilterSubject = {
  id: string;
  /**
   * La station du relevé : celle que la recherche a interrogée, et sous
   * laquelle l'annonce est proposée. Un logement n'y reste que s'il lui
   * appartient (`rattacher`, `stay/rattachement.ts`).
   */
  stationId?: string;
  /** La commune publiée par la source, lue par `rattacher`. */
  locality?: string | null;
  title?: string;
  source?: string;
  url?: string | null;
  total?: number | null;
  /** Couchages annoncés. `null` = la source s'est tue. */
  capacity?: number | null;
  /** Chambres annoncées. `null` = la source s'est tue. */
  bedrooms?: number | null;
  /** Pièces annoncées, convention des centrales. `null` = non annoncé. */
  rooms?: number | null;
  /** Un studio, lu dans le titre ou le type (`qualifierLogement`). */
  isStudio?: boolean | null;
  /** Le type de logement ramené à sept (`TypeLogement`). */
  lodgingType?: string | null;
  /**
   * Distance au repère de la station cherchée, en mètres.
   *
   * Posée par `attachAccess`, sur le relevé figé comme sur la recherche en
   * direct. Le nom vient de `Listing` et il ment un peu : il dit « slopes »
   * mais mesure la distance au **pin de la station** (`domainFit.ts`,
   * `distToSearchedPinM`). C'est le seul repère commun à toutes les annonces,
   * les pistes n'étant pas géolocalisées partout.
   *
   * `null` quand l'annonce n'a pas de coordonnées : ce n'est pas une distance
   * nulle, c'est une distance non mesurable.
   */
  distToSlopesM?: number | null;
  /** Distance à la remontée OSM la plus proche, en mètres. */
  distToLiftM?: number | null;
  /** Latitude publiée par la source. `null` : pas de GPS. */
  lat?: number | null;
  /** Longitude publiée par la source. `null` : pas de GPS. */
  lon?: number | null;
  /**
   * Rattachement au domaine cherché, posé par `attachAccess`. Information :
   * l'appartenance se décide par station (`rattacher`) ; ce verdict n'écarte
   * plus qu'une annonce sans station de relevé (`lieuReasonFor`).
   */
  domainFit?: DomainVerdict;
  pricedCheckIn?: string | null;
  pricedCheckOut?: string | null;
  scannedAt?: number | null;
  missingSince?: { checkIn: string; checkOut: string } | null;
};

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Gîte de groupe, gîte de séjour, chambre d'hôtes : hors liste.
 *
 * Preuve par libellé **ou** par chemin d'URL (`/gite-de-groupe-`,
 * `/chambre-d-hotes-`). Un libellé « Gîte » ne sauve pas une URL de groupe :
 * c'est l'URL qui dit ce que la centrale vend, le libellé n'est qu'un titre.
 * « Copains comme Cochons » (14 personnes, identifiant en .G) reste un gîte
 * ordinaire, et passe.
 */
export function isDroppedGitesOffer(
  listing: Pick<FilterSubject, "source" | "url" | "title">,
): boolean {
  const blob = fold(`${listing.title ?? ""} ${listing.url ?? ""}`);
  if (/gites?[-_ /]*de[-_ ]*groupe|gite[-_ ]de[-_ ]sejour/.test(blob)) return true;
  const isGites = fold(listing.source ?? "").includes("gite");
  if (isGites && /chambre[-_ ]d[-_ ]?hotes/.test(blob)) return true;
  return false;
}

/**
 * Pièces qu'il faut au minimum pour loger un nombre de chambres demandé.
 *
 * Un « 2 pièces » est un séjour et une chambre ; un studio est un « 1 pièce »
 * et n'a aucune chambre. La demande se traduit donc `chambres + 1`, et c'est la
 * convention française de la location de montagne : demander 4 chambres, c'est
 * demander au moins un 5 pièces.
 *
 * **On traduit la demande, jamais la donnée.** Aucune annonce ne se voit
 * attribuer un nombre de chambres qu'elle n'a pas publié, et sa vignette
 * continue d'afficher « 2 pièces ». Seul le seuil change d'unité, pour être
 * comparable à ce que la centrale publie réellement.
 *
 * La convention est prudente dans le bon sens : un « 2 pièces cabine » couche
 * quatre personnes dans une chambre et une cabine, et sera compté pour une
 * chambre, la cabine n'étant pas une pièce. On écarte donc plutôt qu'on ne
 * laisse passer, ce qui est le comportement attendu d'un minimum.
 */
export function minRoomsFor(bedrooms: number): number {
  return bedrooms + 1;
}

/**
 * Chambres comparables, après autopsie des sources.
 *
 * - `bedrooms` annoncé : la source a publié des chambres, on les prend telles
 *   quelles, **zéro compris** : un studio annonce zéro chambre, et c'est un
 *   fait publié, pas une absence.
 * - sinon `rooms` : convention française des centrales, « N pièces » = séjour
 *   plus N-1 chambres. Un studio est un 1 pièce, donc zéro chambre.
 * - sinon `null` : la source s'est tue. Ce n'est pas un zéro.
 *
 * Avant tout, **un studio compte zéro chambre**, avec la règle même qui écrit
 * « Studio » sur sa carte (`bedLbl`) : `isStudio`, ou un type « studio » sans
 * chambres publiées. Sans elle, un studio sans chambres chiffrées passait
 * « Chambres ≥ 1 » comme une inconnue, et celui qu'une plateforme dit à
 * « 1 chambre » le passait tout à fait, la carte affichant « Studio »
 * (remarque du propriétaire du 4 octobre 2026).
 */
export function normalizedBedrooms(listing: FilterSubject): number | null {
  if (listing.isStudio === true || (listing.bedrooms == null && listing.lodgingType === "studio")) return 0;
  if (listing.bedrooms != null) return listing.bedrooms;
  if (listing.rooms != null && listing.rooms > 0) return Math.max(0, listing.rooms - 1);
  return null;
}

/**
 * Studio : aucune chambre séparée.
 *
 * L'original lisait le champ `type` de l'ancien `Lodging`. Le relevé actuel ne
 * porte pas de type ; le titre est le seul texte dont on dispose, et les
 * centrales y écrivent « studio » en toutes lettres.
 */
export function isStudioListing(listing: FilterSubject): boolean {
  if (fold(listing.title ?? "").includes("studio")) return true;
  if (listing.rooms === 1 && listing.bedrooms == null) return true;
  return normalizedBedrooms(listing) === 0;
}

/**
 * Le rayon de recherche, en kilomètres.
 *
 * Douze par défaut, et au plus : c'est « à la station ». Au-delà de 12 km de
 * toute station, un logement n'est dans aucune (`RATTACHEMENT_MAX_M`), et les
 * villages d'une station voisine, reliée ou non, sont à elle. Les crans de
 * 25 et 50 km, qui ouvraient la recherche aux villages du même domaine
 * skiable, ne retenaient plus rien : retirés le 6 octobre 2026, sur décision
 * du propriétaire.
 *
 * Des crans plutôt qu'un curseur au kilomètre près, comme la maquette
 * (App.dc.html:873) : un rayon de 17 km, personne ne sait le juger.
 */
export const RAYONS_KM = [5, 12] as const;
/** Le rayon par défaut est celui du rattachement : au-delà, un logement
 *  n'est dans aucune station (`RATTACHEMENT_MAX_M`). */
export const RAYON_DEFAUT_KM = RATTACHEMENT_MAX_M / 1000;
export const RAYON_MIN_KM = 1;
export const RAYON_MAX_KM = RAYON_DEFAUT_KM;
export { LIMITE_TERRITOIRE_M };


export function clampRayonKm(km: number | null | undefined): number {
  if (km == null || !Number.isFinite(km)) return RAYON_DEFAUT_KM;
  return Math.min(RAYON_MAX_KM, Math.max(RAYON_MIN_KM, Math.round(km)));
}

/** Coordonnées publiées, utilisables : pas un (0, 0), pas hors globe. */
export function gpsPrecis(listing: Pick<FilterSubject, "lat" | "lon">): boolean {
  const lat = listing.lat;
  const lon = listing.lon;
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * Distance à filtrer, en mètres.
 *
 * La remontée OSM d'abord : c'est l'accès ski. À défaut, le pin GPS de la
 * station. Sans l'un ni l'autre, rien à comparer — le filtre écarte.
 */
export function distFiltrableM(listing: Pick<FilterSubject, "distToSlopesM" | "distToLiftM">): number | null {
  const lift = listing.distToLiftM;
  if (lift != null && Number.isFinite(lift) && lift >= 0) return lift;
  const pin = listing.distToSlopesM;
  if (pin != null && Number.isFinite(pin) && pin >= 0) return pin;
  return null;
}

/** Paliers du filtre distance, du pied des pistes à deux kilomètres. */
export const DIST_PALIERS_M = [200, 500, 1000, 2000] as const;

/** Motif géographique d'écart : une autre station, un autre domaine, ou la distance. */
export type GeoReason = "autre-station" | "autre-domaine" | "hors-zone";

/**
 * La géographie écarte-t-elle cette annonce ?
 *
 * 1. **Un logement n'est listé que sous sa station** (`rattacher`) : celle de
 *    sa commune ou de son village, à défaut la plus proche. Une station
 *    voisine ne le garde pas, même reliée par les pistes (« autre-station ») ;
 *    un logement situé à plus de 12 km de toute station sort (« hors-zone »).
 *    Le domaine relié ne retient plus rien : il ne se lit que sur la fiche
 *    station. Sans station du relevé (`stationId`), il n'y a rien à comparer.
 * 2. Une annonce sans station de relevé sort si `domainFit` la dit sur un
 *    autre domaine. Avec une station de relevé, le rattachement seul décide :
 *    un nom lu dans un titre n'écarte pas.
 * 3. Un gîte que son département dit ailleurs sort.
 * 4. Le rayon de l'écran borne encore la distance au repère de la station.
 */
export function geoReasonFor(
  listing: FilterSubject,
  rayonKm: number | null | undefined = RAYON_DEFAUT_KM,
  searchedDept?: string | null,
): GeoReason | null {
  return lieuReasonFor(listing, searchedDept) ?? (horsRayon(listing, rayonKm) ? "hors-zone" : null);
}

/**
 * Le lieu écarte-t-il cette annonce, rayon mis à part ? Les points 1 à 3 de
 * `geoReasonFor` : une autre station, aucune station, un autre domaine pour
 * une annonce sans station de relevé, un autre département pour un gîte.
 * Jugé face à `stationId`, la station de l'écran ; à défaut, celle du relevé
 * de l'annonce. Le filtre « Dans
 * la station » de l'écran Logements, que le rayon ne règle pas.
 */
export function lieuReasonFor(
  listing: FilterSubject,
  searchedDept?: string | null,
  stationId: string | null | undefined = listing.stationId,
): GeoReason | null {
  const verdict = stationId ? verdictStation(listing, stationId) : null;
  if (verdict === "autre-station") return "autre-station";
  if (verdict === "trop-loin") return "hors-zone";
  // Le verdict de domaine ne juge plus qu'une annonce sans station de relevé :
  // sinon, le rattachement seul décide — Bramans, sans domaine au
  // référentiel, est un village de Val Cenis, et ses logements y restent.
  // Une annonce non située n'est pas écartée sur un nom lu dans son titre
  // (« Chalet vue sur Aussois » sous Val Cenis) : le texte inclut, il
  // n'exclut pas. Elle ne s'affiche ni ne compte nulle part (Logements et la
  // médiane exigent une position), mais reste à compléter (`aCompleter`) :
  // sa fiche lue lui donne souvent un point.
  if (verdict == null && listing.domainFit === "other") return "autre-domaine";

  // Le département d'un gîte est une preuve à part : un gîte de la Manche
  // n'est pas à Flumet, quel que soit le point qu'il porte.
  const territoire = territoireReasonFor(listing, searchedDept);
  if (territoire) return territoire;
  return null;
}

/**
 * La distance qu'un rayon mesure, en mètres : depuis le repère de la station
 * du logement, village compris (`distanceAuRepere`) — un logement de Belle
 * Plagne est à 5,9 km du repère de La Plagne, posé à Montchavin, mais au pied
 * de Belle Plagne. Sans rattachement par la position, depuis le repère de la
 * station cherchée (`distToSlopesM`). `null` : non mesurée.
 */
export function distanceRayonM(listing: FilterSubject): number | null {
  const m = (listing.stationId ? distanceAuRepere(listing, listing.stationId) : null) ?? listing.distToSlopesM;
  return m != null && Number.isFinite(m) ? m : null;
}

/** Au-delà du rayon (`distanceRayonM`) ? Une distance non mesurée ne l'est pas. */
export function horsRayon(listing: FilterSubject, rayonKm: number | null | undefined = RAYON_DEFAUT_KM): boolean {
  const m = distanceRayonM(listing);
  return m != null && m > clampRayonKm(rayonKm) * 1000;
}

export type PartyCriteria = {
  /** Taille du groupe : autant de couchages au minimum. */
  travelers: number;
  /** Chambres au minimum. `0` est la valeur de repos : elle n'écarte personne. */
  rooms: number;
};

/**
 * Trois verdicts, parce qu'il y a trois situations et non deux.
 *
 * `convient` : l'annonce publie de quoi juger, et elle passe.
 * `trop-petit` : elle publie de quoi juger, et elle ne passe pas.
 * `non-annonce` : **elle ne publie rien**, et il n'y a rien à juger.
 *
 * Le troisième cas était fondu dans le premier, au nom de « non annoncé n'est
 * pas ne convient pas ». La règle se défend pour une annonce isolée ; elle ne
 * tient plus à l'échelle observée : sur un relevé de Val d'Isère, 25 annonces
 * sur 39 ne publiaient aucune capacité et 27 ni chambres ni pièces. Une demande
 * de 8 personnes et 4 chambres en laissait passer 32 sur 39, dont des studios.
 * Le filtre ne filtrait plus, et rien ne le disait.
 *
 * On ne bascule pas pour autant vers « non annoncé = écarté » en silence : ce
 * serait cacher des annonces qui conviennent peut-être. Le verdict est rendu,
 * l'écran écarte par défaut, les compte, et sait les réafficher.
 *
 * L'ordre compte : **un refus l'emporte sur une absence**. Une annonce qui
 * publie « 1 chambre » quand on en demande quatre est démontrablement trop
 * petite, que sa capacité soit publiée ou non.
 *
 * Une fiche que son titre dément ne se juge pas non plus
 * (`ficheDementieParLeTitre`) : « Résidence Cheval Blanc - 2 Pièces Pour 4
 * Personnes », publiée 8 personnes et 3 chambres, entrait dans un groupe de
 * six avec trois chambres (relevés du 25 septembre 2026). Elle ne devient pas
 * « trop petite » pour autant, puisqu'on ne sait pas qui a raison : elle est
 * « non annoncée ». Un refus de la fiche l'emporte toujours.
 */
export type PartyVerdict = "convient" | "trop-petit" | "non-annonce";

export function partyVerdict(listing: FilterSubject, criteria: PartyCriteria): PartyVerdict {
  let ignore = false;

  if (criteria.travelers > 0) {
    if (listing.capacity != null) {
      if (listing.capacity < criteria.travelers) return "trop-petit";
    } else {
      ignore = true;
    }
  }

  if (criteria.rooms > 0) {
    // Chambres publiées, sinon pièces moins une, un studio comptant zéro
    // (`normalizedBedrooms`) : « N pièces » contre `minRoomsFor` revient au même.
    const chambres = normalizedBedrooms(listing);
    if (chambres != null) {
      if (chambres < criteria.rooms) return "trop-petit";
    } else {
      ignore = true;
    }
  }

  if (ignore) return "non-annonce";
  // La fiche n'a servi qu'à un groupe à juger ; sans critère, rien ne la lit.
  const lue = criteria.travelers > 0 || criteria.rooms > 0;
  return lue && ficheDementieParLeTitre(listing) ? "non-annonce" : "convient";
}

/**
 * L'annonce accueille-t-elle le groupe demandé ?
 *
 * `includeNonAnnonce` dit ce qu'on fait du troisième verdict, et **le défaut
 * est de l'écarter** : un écran qui additionne des coûts ne doit pas classer
 * premier un studio dont on ignore la capacité.
 */
export function fitsParty(
  listing: FilterSubject,
  criteria: PartyCriteria,
  includeNonAnnonce = false,
): boolean {
  const v = partyVerdict(listing, criteria);
  return v === "convient" || (v === "non-annonce" && includeNonAnnonce);
}

/**
 * Pourquoi une annonce a été écartée. Un motif, celui qui a tranché en premier.
 *
 * `capacite` et `capacite-muette` sont deux motifs parce que ce sont deux
 * faits : l'un dit que l'annonce est **démontrablement** trop petite, l'autre
 * que la source **n'a rien publié**. `partyVerdict` les distinguait déjà, et
 * `dropReasonFor` les refondait aussitôt en un seul, si bien que l'écran
 * annonçait « 25 biens masqués : trop petits » pour des annonces dont personne
 * ne connaissait la taille. C'est la règle 1 du fichier, appliquée jusqu'au
 * libellé : « non annoncé » n'est pas « ne convient pas ».
 */
export type DropReason =
  | "groupe"
  | "autre-station"
  | "autre-domaine"
  | "hors-zone"
  | "capacite"
  | "capacite-muette"
  | "prix"
  | "source"
  | "disponibilite";

export type FilterCriteria = PartyCriteria & {
  /** Dates du séjour, pour juger la disponibilité. */
  stay: Stay;
  /** Rayon de recherche autour de la station, en km. Défaut : `RAYON_DEFAUT_KM`. */
  rayonKm?: number;
  /** Département de la station cherchée, pour écarter un gîte d'un autre territoire. */
  searchedDept?: string | null;
  /** N'afficher que ce qui est réservable, ou non jugé. */
  onlyAvailable?: boolean;
  /** Sources décochées, par libellé affiché. */
  srcOff?: string[];
  budgetMin?: number;
  budgetMax?: number;
  /** Borne haute du curseur : atteinte, elle ne borne plus. */
  budgetCeiling?: number;
  /** Réafficher les annonces qui n'annoncent ni capacité ni chambres. */
  includeUnannounced?: boolean;
  /** Pour le test : l'instant qui juge la péremption des relevés. */
  now?: number;
};

export type FilterOutcome<T> = {
  kept: T[];
  dropped: {
    total: number;
    /** Écarts comptés par motif, pour que l'écran puisse les nommer. */
    byReason: Record<DropReason, number>;
    /** Identifiant et motif, pour un panneau de détail. */
    rows: { id: string; reason: DropReason }[];
  };
};

/** Le motif qui écarte cette annonce, ou `null` si elle reste. */
export function dropReasonFor(listing: FilterSubject, criteria: FilterCriteria): DropReason | null {
  // Gîte de groupe : hors liste, quelles que soient les autres réponses.
  if (isDroppedGitesOffer(listing)) return "groupe";

  // La géographie ensuite, avant tout le reste : un logement qui n'est pas à
  // la station n'est pas un candidat, quel que soit son prix ou sa taille.
  const geo = geoReasonFor(listing, criteria.rayonKm, criteria.searchedDept);
  if (geo) return geo;

  // Disponibilité ensuite. Une annonce listée mais non tarifée pour ces dates
  // n'est pas réservable : l'ouvrir mène à « Ces dates ne sont pas
  // disponibles ». Les cartes non jugées, porte d'entrée ou saisie manuelle,
  // traversent ce filtre sans être inquiétées.
  if (criteria.onlyAvailable && !isBookable(listing, criteria.stay, criteria.now)) {
    return "disponibilite";
  }

  if (criteria.srcOff?.includes(listing.source ?? "")) return "source";

  // Un refus l'emporte sur une absence, et les deux se disent séparément.
  const party = partyVerdict(listing, criteria);
  if (party === "trop-petit") return "capacite";
  if (party === "non-annonce" && criteria.includeUnannounced !== true) return "capacite-muette";

  // Règle 2 : l'absence de tarif dispense des filtres de prix, pas des autres.
  // Une carte sans prix n'a rien à comparer, et un zéro n'est pas un prix.
  const total = listing.total ?? 0;
  if (total <= 0) return null;

  const lo = criteria.budgetMin ?? 0;
  const hi = criteria.budgetMax ?? Number.POSITIVE_INFINITY;
  const ceil = criteria.budgetCeiling ?? Number.POSITIVE_INFINITY;
  if (!rangeOpen(lo, hi, ceil) && !inRange(total, lo, hi, ceil)) return "prix";

  return null;
}

/**
 * Le filtre, et le compte de ce qu'il a écarté.
 *
 * Une liste vide est le pire des résultats : elle ne dit ni pourquoi ni
 * combien. `dropped` permet à l'écran d'écrire « 12 biens masqués : 4 trop
 * petits, 8 hors budget », ce qui rend la main à l'utilisateur au lieu de le
 * laisser devant un vide.
 */
export function applyFilter<T extends FilterSubject>(
  listings: readonly T[],
  criteria: FilterCriteria,
): FilterOutcome<T> {
  const kept: T[] = [];
  const rows: { id: string; reason: DropReason }[] = [];
  const byReason: Record<DropReason, number> = {
    groupe: 0,
    "autre-station": 0,
    "autre-domaine": 0,
    "hors-zone": 0,
    capacite: 0,
    "capacite-muette": 0,
    prix: 0,
    source: 0,
    disponibilite: 0,
  };

  for (const listing of listings) {
    const reason = dropReasonFor(listing, criteria);
    if (reason == null) kept.push(listing);
    else {
      byReason[reason] += 1;
      rows.push({ id: listing.id, reason });
    }
  }

  return { kept, dropped: { total: rows.length, byReason, rows } };
}

/** Singulier et pluriel de chaque motif, en français : `droppedLabel` les traduit. */
const REASON_LABEL: Record<DropReason, [string, string]> = {
  groupe: [aTraduire("gîte de groupe"), aTraduire("gîtes de groupe")],
  "autre-station": [aTraduire("dans une autre station"), aTraduire("dans d’autres stations")],
  "autre-domaine": [aTraduire("sur un autre domaine"), aTraduire("sur d’autres domaines")],
  "hors-zone": [aTraduire("hors de la zone"), aTraduire("hors de la zone")],
  capacite: [aTraduire("trop petit"), aTraduire("trop petits")],
  // Ni « trop petit » ni « convient » : la source s'est tue, et on le dit.
  "capacite-muette": [aTraduire("sans capacité annoncée"), aTraduire("sans capacité annoncée")],
  prix: [aTraduire("hors budget"), aTraduire("hors budget")],
  source: [aTraduire("issu d’une source décochée"), aTraduire("issus de sources décochées")],
  disponibilite: [aTraduire("sans prix à ces dates"), aTraduire("sans prix à ces dates")],
};

/** Motif venu d'ailleurs que du filtre : la distance aux pistes, par exemple,
 *  qui vient de l'accès calculé et non de l'annonce. */
export type ExtraDrop = { singulier: string; pluriel: string; n: number };

/**
 * « 12 biens masqués : 4 trop petits, 8 hors budget ». Vide si rien n'est
 * masqué.
 *
 * Un seul motif ne se répète pas : « 96 biens masqués : 96 hors budget »
 * disait deux fois le même nombre. On écrit « 96 biens masqués : hors
 * budget ».
 */
export function droppedLabel(
  dropped: FilterOutcome<FilterSubject>["dropped"],
  extra: readonly ExtraDrop[] = [],
): string {
  const reasons: { label: [string, string]; n: number }[] = [
    ...(Object.entries(dropped.byReason) as [DropReason, number][])
      .filter(([, n]) => n > 0)
      .map(([reason, n]) => ({ label: REASON_LABEL[reason], n })),
    ...extra.filter((e) => e.n > 0).map((e) => ({ label: [e.singulier, e.pluriel] as [string, string], n: e.n })),
  ];
  const total = reasons.reduce((sum, r) => sum + r.n, 0);
  if (total === 0) return "";
  // `trN` choisit le singulier ou le pluriel selon la langue, et traduit.
  const masques = trN(total, "{n} bien masqué", "{n} biens masqués");
  if (reasons.length === 1) {
    return tr("{masques} : {motifs}", { masques, motifs: trN(total, reasons[0].label[0], reasons[0].label[1]) });
  }
  const parts = reasons.map((r) => `${r.n} ${trN(r.n, r.label[0], r.label[1])}`);
  return tr("{masques} : {motifs}", { masques, motifs: parts.join(", ") });
}
