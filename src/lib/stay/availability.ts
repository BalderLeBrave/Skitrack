/**
 * Ce qu'on sait vraiment de la disponibilité d'une annonce.
 *
 * ## La prémisse fausse qu'il a fallu défaire
 *
 * Le code partait d'une conviction écrite en toutes lettres dans le module de
 * fusion Airbnb : « une recherche Airbnb ne renvoie que ce qui est libre aux
 * dates demandées ». C'est faux. Airbnb remplit sa grille de résultats avec des
 * annonces qu'il ne peut pas vendre pour ces dates-là, et il le signale d'une
 * seule façon : **il n'affiche pas de prix**.
 *
 * Le relevé récupérait donc ces annonces avec un total à zéro, et l'écran les
 * rangeait dans le même casier que les hébergements OpenStreetMap, qui n'ont
 * légitimement pas de prix parce qu'OSM n'en publie aucun. Les deux
 * s'affichaient en carte-redirection, bouton « Voir sur Airbnb » compris. Sauf
 * qu'une carte OSM ouvre une **recherche**, alors qu'une annonce Airbnb non
 * tarifée ouvre **cette annonce, à ces dates**, c'est-à-dire la page « Ces
 * dates ne sont pas disponibles ».
 *
 * ## Le principe retenu
 *
 * Une plateforme tarife ce qu'elle peut vendre. Un prix relevé pour des dates
 * précises est donc la seule preuve de disponibilité dont l'application
 * dispose ; tout le reste est une supposition, et se dit comme telle.
 *
 * Aucun champ n'est calculé puis stocké : le verdict se déduit de ce que
 * l'annonce porte déjà. Une donnée dérivable ne mérite pas d'être enregistrée :
 * enregistrée, elle finirait par contredire les champs dont elle sort.
 *
 * ## Ce que ce module ne fait pas
 *
 * Il n'interroge rien. Confirmer une disponibilité demande un relevé aux bonnes
 * dates, et ce relevé passe par le geste de l'utilisateur. Ce module dit
 * seulement, de ce qu'on a déjà, ce qui est prouvé et ce qui ne l'est pas.
 *
 * Repris de `src/renderer/src/data/lodgingAvailability.ts` (commit 2d960d5).
 * Le type lu est **structurel** et tous ses champs de relevé sont facultatifs :
 * le relevé figé de `listings.ts` ne les porte pas, et ressort donc « non
 * confirmé », ce qui est exact. On ne compense pas par un défaut optimiste.
 */

/** Libellé de source réservé à ce que l'utilisateur a saisi lui-même. */
export const MANUAL_SOURCE = "Import manuel";

export type AvailabilityStatus =
  /** Une source a tarifé cette annonce pour exactement ces dates. */
  | "confirmed"
  /** Listée, mais sans prix à ces dates, ou tarifée pour d'autres dates. */
  | "unconfirmed"
  /** Un relevé couvrant ces dates ne la retrouve plus : très probablement prise. */
  | "gone"
  /** La carte ne prétend rien : porte d'entrée, ou saisie à la main. */
  | "unrated";

/** Pourquoi la disponibilité n'est pas confirmée. */
export type AvailabilityReason = "unpriced" | "other_dates" | "stale" | "gone" | null;

export type AvailabilityVerdict = {
  status: AvailabilityStatus;
  reason: AvailabilityReason;
};

export type Stay = {
  checkIn: string;
  checkOut: string;
};

/**
 * Ce que le module a besoin de lire, et rien de plus.
 *
 * Tout est facultatif parce que tout peut manquer : une annonce qu'aucun relevé
 * daté n'a touchée n'a ni `pricedCheckIn` ni `scannedAt`, et c'est une
 * information, pas un trou à combler.
 */
export type AvailabilitySubject = {
  url?: string | null;
  total?: number | null;
  source?: string;
  /** Dates auxquelles ce prix a été relevé. */
  pricedCheckIn?: string | null;
  pricedCheckOut?: string | null;
  /** Horodatage du relevé qui a produit ce prix. */
  scannedAt?: number | null;
  /** Dates du relevé qui ne retrouve plus cette annonce. */
  missingSince?: { checkIn: string; checkOut: string } | null;
};

/** TTL du relevé : au-delà, un prix daté des bonnes dates est à revalider. */
export const AVAILABILITY_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Carte qui n'ouvre pas une annonce datée.
 *
 * Deux cas, et un seul test pour les deux : l'absence d'URL (rien derrière) et
 * l'URL de **recherche** que produisent les hébergements OpenStreetMap,
 * `/s/<lieu>/homes`. Une recherche ne peut pas être « indisponible à ces
 * dates » : elle renvoie ce qu'elle trouve. La juger sur la disponibilité
 * n'aurait pas de sens.
 */
export function isDoorway(listing: Pick<AvailabilitySubject, "url">): boolean {
  if (!listing.url) return true;
  return /\/s\/[^/]+\/homes/.test(listing.url);
}

/**
 * Verdict de disponibilité d'une annonce pour un séjour donné.
 *
 * Les saisies manuelles ne sont pas jugées. L'utilisateur les a écrites
 * lui-même : aucune source ne les a confrontées à ces dates, et les masquer
 * comme « non disponibles » ferait disparaître sa propre saisie sous un filtre
 * qu'il n'a pas relié à elle.
 */
export function availabilityOf(
  listing: AvailabilitySubject,
  stay: Stay,
  now: number = Date.now(),
): AvailabilityVerdict {
  if (isDoorway(listing) || listing.source === MANUAL_SOURCE) {
    return { status: "unrated", reason: null };
  }

  // Absente du dernier relevé couvrant ce séjour : c'est le signal le plus fort
  // dont on dispose, il passe donc avant le prix. Un tarif relevé la semaine
  // dernière ne prouve rien contre une absence constatée aujourd'hui.
  if (
    listing.missingSince != null &&
    listing.missingSince.checkIn === stay.checkIn &&
    listing.missingSince.checkOut === stay.checkOut
  ) {
    return { status: "gone", reason: "gone" };
  }

  const priced = (listing.total ?? 0) > 0;
  const sameStay =
    listing.pricedCheckIn === stay.checkIn && listing.pricedCheckOut === stay.checkOut;

  if (priced && sameStay) {
    if (listing.scannedAt != null && now - listing.scannedAt > AVAILABILITY_TTL_MS) {
      return { status: "unconfirmed", reason: "stale" };
    }
    return { status: "confirmed", reason: null };
  }

  // Listée par la source, mais sans tarif pour ces dates. C'est la forme sous
  // laquelle Airbnb annonce qu'il ne peut pas vendre ce bien à ces dates-là.
  if (!priced) return { status: "unconfirmed", reason: "unpriced" };

  // Tarifée, mais pour d'autres dates. Le prix est périmé, et la disponibilité
  // avec lui, puisqu'elle n'a jamais été observée pour le séjour en cours.
  return { status: "unconfirmed", reason: "other_dates" };
}

/** Raccourci de lecture : cette annonce est-elle affichable comme réservable ? */
export function isBookable(listing: AvailabilitySubject, stay: Stay, now?: number): boolean {
  const { status } = availabilityOf(listing, stay, now);
  return status === "confirmed" || status === "unrated";
}

/** Ce que l'écran écrit à côté de l'annonce. Jamais une promesse. */
export function availabilityLabel(verdict: AvailabilityVerdict): string {
  switch (verdict.reason) {
    case "gone":
      return "Absente du dernier relevé à ces dates";
    case "unpriced":
      return "Listée sans prix à ces dates";
    case "other_dates":
      return "Prix relevé pour d’autres dates";
    case "stale":
      return "Prix relevé il y a plus de six heures";
    default:
      return verdict.status === "confirmed" ? "Prix relevé pour ces dates" : "Non jugée";
  }
}
