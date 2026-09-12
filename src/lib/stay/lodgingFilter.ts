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
 * et distance ne sont pas reprises : le relevé actuel ne porte ni type ni
 * mesure de distance au moment du filtre.
 */

import { isBookable, type Stay } from "./availability.ts";
import { inRange, rangeOpen } from "./range.ts";

/**
 * Ce que le filtre a besoin de lire.
 *
 * Structurel et tolérant : `Listing` s'y conforme, et `rooms` (pièces) reste
 * facultatif parce que les centrales comptent en pièces là où les plateformes
 * comptent en chambres.
 */
export type FilterSubject = {
  id: string;
  title?: string;
  source?: string;
  url?: string | null;
  total?: number | null;
  /** Couchages annoncés. `null` = la source s'est tue. */
  guests?: number | null;
  /** Chambres annoncées. `null` = la source s'est tue. */
  bedrooms?: number | null;
  /** Pièces annoncées, convention des centrales. `null` = non annoncé. */
  rooms?: number | null;
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
 */
export function normalizedBedrooms(listing: FilterSubject): number | null {
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
 */
export type PartyVerdict = "convient" | "trop-petit" | "non-annonce";

export function partyVerdict(listing: FilterSubject, criteria: PartyCriteria): PartyVerdict {
  let ignore = false;

  if (criteria.travelers > 0) {
    if (listing.guests != null) {
      if (listing.guests < criteria.travelers) return "trop-petit";
    } else {
      ignore = true;
    }
  }

  if (criteria.rooms > 0) {
    if (listing.bedrooms != null) {
      if (listing.bedrooms < criteria.rooms) return "trop-petit";
    } else if (listing.rooms != null && listing.rooms > 0) {
      if (listing.rooms < minRoomsFor(criteria.rooms)) return "trop-petit";
    } else {
      ignore = true;
    }
  }

  return ignore ? "non-annonce" : "convient";
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

/** Pourquoi une annonce a été écartée. Un motif, celui qui a tranché en premier. */
export type DropReason = "groupe" | "capacite" | "prix" | "source" | "disponibilite";

export type FilterCriteria = PartyCriteria & {
  /** Dates du séjour, pour juger la disponibilité. */
  stay: Stay;
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

  // Disponibilité ensuite. Une annonce listée mais non tarifée pour ces dates
  // n'est pas réservable : l'ouvrir mène à « Ces dates ne sont pas
  // disponibles ». Les cartes non jugées, porte d'entrée ou saisie manuelle,
  // traversent ce filtre sans être inquiétées.
  if (criteria.onlyAvailable && !isBookable(listing, criteria.stay, criteria.now)) {
    return "disponibilite";
  }

  if (criteria.srcOff?.includes(listing.source ?? "")) return "source";

  if (!fitsParty(listing, criteria, criteria.includeUnannounced === true)) return "capacite";

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
    capacite: 0,
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

const REASON_LABEL: Record<DropReason, [string, string]> = {
  groupe: ["gîte de groupe", "gîtes de groupe"],
  capacite: ["trop petit", "trop petits"],
  prix: ["hors budget", "hors budget"],
  source: ["source décochée", "sources décochées"],
  disponibilite: ["sans prix à ces dates", "sans prix à ces dates"],
};

/** « 12 biens masqués : 4 trop petits, 8 hors budget ». Vide si rien n'est masqué. */
export function droppedLabel(dropped: FilterOutcome<FilterSubject>["dropped"]): string {
  if (dropped.total === 0) return "";
  const parts = (Object.entries(dropped.byReason) as [DropReason, number][])
    .filter(([, n]) => n > 0)
    .map(([reason, n]) => `${n} ${REASON_LABEL[reason][n > 1 ? 1 : 0]}`);
  const bien = dropped.total > 1 ? "biens masqués" : "bien masqué";
  return `${dropped.total} ${bien} : ${parts.join(", ")}`;
}
