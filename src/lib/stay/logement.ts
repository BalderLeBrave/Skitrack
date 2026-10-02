/**
 * Le logement tel qu'une annonce le décrit : capacité, chambres, studio,
 * pièces, cabine, type, et la source de chaque valeur. Le module commun à
 * tous les collecteurs : la lecture du texte, la dérivation du type en
 * chambres et la priorité entre sources ne s'écrivent qu'ici.
 *
 * ## Les champs (`Listing`)
 *
 * - `capacity` : le nombre de personnes maximum. D'une fourchette (« 4 à 6
 *   personnes »), la borne haute ; la basse, ou la capacité standard qu'une
 *   source distingue de la maximale, va dans `capacityStandard`.
 * - `bedrooms` : les chambres séparées. Un studio : `bedrooms` 0 et
 *   `isStudio` vrai ; l'écran dit « Studio », jamais « 0 chambre ».
 * - `capacitySource`, `bedroomsSource` : d'où vient la valeur.
 * - Introuvable après toutes les stratégies : `null`, jamais 0 ni 1 par
 *   défaut, et l'annonce est journalisée (`residuLogements`).
 *
 * ## Trois sources, dans cet ordre
 *
 * 1. `structured` : un champ structuré ou un JSON embarqué (API, JSON-LD,
 *    attribut, `__NEXT_DATA__`), de la recherche ou de la page de détail ;
 * 2. `text_regex` : un texte libre (titre, sous-titre, description) qui écrit
 *    la valeur (« 6 personnes », « 3 chambres ») ;
 * 3. `derived_from_type` : des chambres tirées d'un type sans chambres
 *    écrites. T1, 1 pièce, studio : 0 chambre et un studio ; T2, 2 pièces :
 *    1 chambre ; Tn : n − 1. Jamais pour la capacité.
 *
 * Une valeur ne cède qu'à une source de meilleur rang (`poserValeur`).
 *
 * ## Ce que le texte dit
 *
 * - « studio », « studio cabine », « stud. », « studette », « T1 », « 1
 *   pièce » : un studio, 1 pièce, 0 chambre. La cabine est un booléen à
 *   part : elle ne compte pas comme une chambre.
 * - « T2 », « F2 », « 2 pièces », « 2P » : 2 pièces, donc 1 chambre.
 *   « 2 pièces cabine » : 1 chambre et une cabine. « 2P » ne vaut des pièces
 *   que s'il ne peut pas être une capacité : suivi de « cabine », ou à côté
 *   d'une capacité écrite (« Appt 2P 4 personnes », « Duplex 3P 6p »). Seul,
 *   « 8p » reste huit personnes, comme sur les tuiles Airbnb.
 * - « 3 chambres », « 3 ch. », « 3 bedrooms » : lus tels quels.
 * - « 6 personnes », « 6 pers », « 6 couchages », « 6 places », « 6 guests »,
 *   « 6 pax », « sleeps 6 » : capacité 6. « 4/6 personnes », « 4 à 6
 *   personnes » : capacité 6, capacité standard 4.
 * - « 2 appartements de 6 personnes », « chalet avec studio » : plusieurs
 *   logements, aucune capacité et aucun studio n'en sont tirés.
 *
 * Fonctions pures. Chargé tel quel par `node --experimental-strip-types` :
 * aucun alias `@/`.
 */

import { airbnbIdOf } from "./airbnbId.ts";

/* ---------- Types ---------- */

export type TypeLogement =
  "studio" | "appartement" | "chalet" | "maison" | "chambre" | "hotel" | "autre";

export const TYPE_LOGEMENT_LBL: Record<TypeLogement, string> = {
  studio: "Studio",
  appartement: "Appartement",
  chalet: "Chalet",
  maison: "Maison",
  chambre: "Chambre",
  hotel: "Hôtel",
  autre: "Autre",
};

/** D'où vient une valeur : un champ structuré, un texte libre, ou un type. */
export type SourceValeur = "structured" | "text_regex" | "derived_from_type";

/** La capacité ne se dérive jamais d'un type. */
export type SourceCapacite = Exclude<SourceValeur, "derived_from_type">;

/** Le rang d'une source : la plus petite l'emporte. */
export const RANG_SOURCE: Record<SourceValeur, number> = {
  structured: 0,
  text_regex: 1,
  derived_from_type: 2,
};

/** Ce que le texte dit du logement. */
export type LectureLogement = {
  type: TypeLogement | null;
  /** Les chambres écrites (« 3 chambres », « 3 bedrooms ») : `text_regex`. */
  chambresEcrites: number | null;
  /** Un studio (« studio », « studette », « T1 », « 1 pièce ») : 0 chambre. */
  studio: boolean;
  pieces: number | null;
  /** Les chambres tirées du type : 0 pour un studio, sinon les pièces moins
   *  une (`derived_from_type`). */
  chambresDerivees: number | null;
  cabine: boolean;
  /** La capacité maximale. */
  capacite: number | null;
  /** La capacité standard : la borne basse d'une fourchette « 4/6 personnes ». */
  capaciteStandard: number | null;
};

/* ---------- Motifs ---------- */

const MAX = 50;

/** « 2 appartements de 6 personnes » : plusieurs logements, aucune capacité. */
export const MULTI_UNITE =
  /(?<!\d)(?:[2-9]|1[0-2])(?!\d)\s+(?:appartements?|chalets?|logements?|maisons?)\s+(?:de\s+)?(\d+)\s+(?:personnes?|pers\.?|voyageurs?)\b/i;

export const MULTI_UNITE_SLUG =
  /(\d+)-(?:appartements?|chalets?|logements?|maisons?)-de-(\d+)-(?:personnes?|pers)\b/i;

/**
 * Titres de lot : plusieurs logements vendus ensemble, dont un studio, ou un
 * studio annexe (« chalet avec studio »). Sur un texte plié (`plier`). Voir
 * `ficheDementieParLeTitre` (`occupancy.ts`) pour les relevés qui les
 * fondent.
 */
export const LOTS: readonly RegExp[] = [
  /(?<!\d)(?:[2-9]|1[0-2])\s+(?:appartements|apparts|studios|chalets|logements|maisons|gites)\b/,
  /(?:\bet|\bavec|\bdont|\bplus|\+|&)\s*(?:de\s+)?(?:(?:un|une|1)\s+)?studios?\b/,
  /\bstudios?\s*(?:et|\+|&)\s*(?:(?:un|une|\d+)\s+)?(?:appartements?|apparts?|chalets?|gites?|maisons?|[tf]\d\b|\d\s*pieces?)/,
  /\b(?:chalets?|maisons?|villas?|fermes?|appartements?|apparts?|gites?)\b(?:(?!\s[-\u2013\u2014|:]\s).)*\bstudios?\s+(?:independant|attenant)e?s?\b/,
];

const UNITE_PERSONNES = String.raw`(?:personnes?|pers\.?|voyageurs?|guests?|pax|couchages?|places?)`;

/** « 4/6 personnes », « 4-6 pers. », « 4 à 6 couchages ». */
const GUESTS_RANGE = new RegExp(
  String.raw`(\d+)\s*(?:[/––-]|\s(?:à|a)\s)\s*(\d+)\s*-?\s*${UNITE_PERSONNES}\b`,
  "gi",
);

/**
 * La première fourchette qui monte, ses deux bornes plausibles.
 *
 * Une fourchette s'écrit de la plus petite à la plus grande : « 4 à 6 ».
 * Dans une adresse, `rond-point-7-4-personnes` n'en est pas une : le 7 est
 * le nom du logement, le 4 sa capacité (Ingénie, Les Saisies). La lire
 * comme « 4 à 7 » donnait 7 couchages à un logement qui en a 4, et
 * `altarena-d101-8-personnes` perdait ses 8 couchages avec la borne 101.
 * Une fourchette qui descend est laissée : le nombre écrit juste avant
 * « personnes » reste la capacité.
 */
function fourchetteEcrite(text: string): [number, number] | null {
  for (const m of text.matchAll(GUESTS_RANGE)) {
    const a = takeGuests(Number(m[1]));
    const b = takeGuests(Number(m[2]));
    if (a != null && b != null && a <= b) return [a, b];
  }
  return null;
}

const GUESTS_ONE = new RegExp(String.raw`(\d+)\s*-?\s*${UNITE_PERSONNES}\b`, "gi");

/** « 2 places de parking », « garage 2 places » : pas une capacité. */
const PARKING_APRES = /^\s*(?:de\s+)?(?:parking|garage|stationnement)/i;
const PARKING_AVANT = /(?:parking|garage|stationnement)\W{0,3}\w{0,12}\W{0,3}$/i;

/** « 8p », « 10 P », « 2P » : capacité ou pièces, voir `lireLogement`. */
const N_P = /(?<![\p{L}\d])(\d+)\s*[pP](?![\p{L}])/gu;

const GUESTS_ACCUEIL = /accueill(?:e|ant|ir)\s+(?:jusqu['’]?à\s+)?(\d+)\b/i;
const GUESTS_CAPACITE = /capacit(?:[eé]|y)\s*(?:de\s+|:\s*)?(?:jusqu['’]?à\s+)?(\d+)\b/i;
/** « cap. 8 », « cap 10 » : abréviation des fiches, pas le mot « cape ». */
const GUESTS_CAP_ABBR = /\bcap\.?\s*[:=]?\s*(\d+)\b/i;
/** `sleeps 8` : le verbe publié par les OTA anglophones, pas un compte de lits. */
const GUESTS_SLEEPS = /\bsleeps\s+(\d+)\b/i;

const BEDROOMS = /(\d+)\s*-?\s*(?:chambres?|bedrooms?|ch(?![a-zà-ÿ]))/i;
const PIECES = /(\d+)\s*-?\s*pi[eè]ces?\b/i;
const T_TYPE = /\bT([1-9])\b/i;
const F_TYPE = /\bF([1-9])\b/i;
const STUDIO = /(?<![\p{L}])(?:studios?|studettes?|stud\.?)(?![\p{L}])/iu;
const CABINE = /\bcabines?\b/i;

/* ---------- Lecture ---------- */

export function plier(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function entier(n: unknown): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return Math.trunc(n);
  if (typeof n === "string" && /^\d+$/.test(n.trim())) return Number(n.trim());
  return null;
}

export function takeGuests(n: unknown): number | null {
  const v = entier(n);
  return v != null && v > 0 && v <= MAX ? v : null;
}

export function takeBeds(n: unknown): number | null {
  const v = entier(n);
  return v != null && v >= 0 && v <= MAX ? v : null;
}

/** La première capacité écrite « N personnes / pers / couchages / places »,
 *  hors places de parking. */
function capaciteEcrite(text: string): number | null {
  for (const m of text.matchAll(GUESTS_ONE)) {
    const avant = text.slice(0, m.index);
    const apres = text.slice(m.index + m[0].length);
    if (/places?$/i.test(m[0]) && (PARKING_APRES.test(apres) || PARKING_AVANT.test(avant)))
      continue;
    const v = takeGuests(Number(m[1]));
    if (v != null) return v;
  }
  return null;
}

/** Le type que nomment des mots, dans l'ordre où ils l'emportent :
 *  « Appartement dans chalet » est un appartement, « Chambre double dans
 *  chalet » une chambre. `studio` : le texte décrit un studio. */
function typeDesMots(plie: string, studio: boolean): TypeLogement | null {
  if (/\bhotels?\b/.test(plie)) return "hotel";
  if (
    /chambres?\s+d\W?\s*hotes?\b|bed\s*(?:and|&)\s*breakfast|\bb\s*&\s*b\b/.test(plie) ||
    /^\s*chambres?\s+(?:double|simple|twin|triple|quadruple|familiale)\b/.test(plie)
  )
    return "chambre";
  if (studio) return "studio";
  if (/\b(?:appartements?|apparts?|appt|apt|duplex|triplex|loft)\b/.test(plie))
    return "appartement";
  if (/\bchalets?\b/.test(plie)) return "chalet";
  if (/\b(?:maisons?|villas?|gites?|fermes?|longeres?|mazets?)\b/.test(plie)) return "maison";
  if (
    /\b(?:yourtes?|cabanes?|tipis?|roulottes?|mobil[- ]?homes?|bungalows?|camping|insolite|igloos?|tentes?|refuges?)\b/.test(
      plie,
    )
  )
    return "autre";
  return null;
}

/** Le type publié par la source (`propertyType`), ramené aux sept types.
 *  `null` quand il ne nomme aucun d'eux. */
export function typePublie(propertyType: string | null | undefined): TypeLogement | null {
  if (!propertyType?.trim()) return null;
  const p = plier(propertyType);
  return typeDesMots(p, STUDIO.test(propertyType));
}

/**
 * Ce que le texte dit du logement : titre, description, URL, type publié.
 * Plusieurs chaînes : on les joint, c'est le même logement qui parle.
 */
export function lireLogement(...parts: Array<string | null | undefined>): LectureLogement {
  const text = parts.filter((p) => p && p.trim()).join(" · ");
  const vide: LectureLogement = {
    type: null,
    chambresEcrites: null,
    studio: false,
    pieces: null,
    chambresDerivees: null,
    cabine: false,
    capacite: null,
    capaciteStandard: null,
  };
  if (!text) return vide;
  const plie = plier(text);
  const lot = LOTS.some((re) => re.test(plie));
  const multi = MULTI_UNITE.test(text) || MULTI_UNITE_SLUG.test(text);
  const cabine = CABINE.test(text);

  // « 2P » : pièces s'il ne peut pas être une capacité.
  const range = fourchetteEcrite(text);
  const ecrite = capaciteEcrite(text);
  const nps = [...text.matchAll(N_P)].filter(
    (m) => !/^\s*pi[eè]ces?\b/i.test(text.slice(m.index + m[0].length)),
  );
  let piecesNP: number | null = null;
  let personnesNP: number | null = null;
  nps.forEach((m, i) => {
    const n = Number(m[1]);
    const cabineApres = /^\s*cabines?\b/i.test(text.slice(m.index + m[0].length));
    const pieces =
      n >= 1 &&
      n <= 9 &&
      (cabineApres || range != null || ecrite != null || (nps.length > 1 && i === 0));
    if (pieces) piecesNP ??= n;
    else if (!cabineApres) personnesNP ??= takeGuests(n);
  });

  let capacite: number | null = null;
  let capaciteStandard: number | null = null;
  if (!multi) {
    if (range) {
      const [base, haut] = range;
      capacite = haut;
      capaciteStandard = base < haut ? base : null;
    } else {
      capacite = ecrite ?? personnesNP;
      if (capacite == null) {
        const acc =
          GUESTS_ACCUEIL.exec(text) ??
          GUESTS_CAPACITE.exec(text) ??
          GUESTS_SLEEPS.exec(text) ??
          GUESTS_CAP_ABBR.exec(text);
        if (acc) capacite = takeGuests(Number(acc[1]));
      }
    }
  }

  const ch = BEDROOMS.exec(text);
  const chambresEcrites = ch ? takeBeds(Number(ch[1])) : null;

  const pi = PIECES.exec(text);
  let pieces = pi ? takeBeds(Number(pi[1])) : null;
  if (pieces != null && pieces < 1) pieces = null;
  if (pieces == null) {
    const t = T_TYPE.exec(text) ?? F_TYPE.exec(text);
    if (t) pieces = takeBeds(Number(t[1]));
  }
  pieces ??= piecesNP;

  // « Studio » dit deux choses : une pièce, aucune chambre. Pas dans un lot,
  // et pas quand deux chambres ou plus sont écrites : « Chalet Le Studio - 5
  // Chambres » est le nom d'un chalet. Un T1 ou « 1 pièce » est un studio.
  const studio =
    !lot &&
    !(chambresEcrites != null && chambresEcrites >= 2) &&
    (STUDIO.test(text) || pieces === 1);
  if (studio) pieces ??= 1;

  const chambresDerivees = studio ? 0 : pieces != null && pieces >= 2 ? pieces - 1 : null;
  let type = typeDesMots(plie, studio);
  // Des pièces sans autre mot : un appartement (« T3 pied des pistes »).
  if (type == null && pieces != null) type = studio ? "studio" : "appartement";
  return {
    type,
    chambresEcrites,
    studio,
    pieces,
    chambresDerivees,
    cabine,
    capacite,
    capaciteStandard,
  };
}

/* ---------- Qualification d'une annonce ---------- */

/** Ce que `qualifierLogement` lit et pose. */
export type SujetLogement = {
  source?: string | null;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  propertyType?: string | null;
  priceLabel?: string | null;
  photo?: string | null;
  photos?: string[] | null;
  capacity: number | null;
  capacityStandard?: number | null;
  capacitySource?: SourceCapacite | null;
  bedrooms: number | null;
  bedroomsSource?: SourceValeur | null;
  isStudio?: boolean | null;
  rooms?: number | null;
  cabin?: boolean | null;
  lodgingType?: TypeLogement | null;
  /** Airbnb : de quoi retrouver sa page (`airbnbIdOf`). */
  platformId?: string | null;
  /** Airbnb : sa page a été lue ; ce qui y manque y manque vraiment. */
  pdpLue?: boolean | null;
};

/** Les textes d'une annonce. Sans les photos GreenGo : leurs noms sont des
 *  libellés numérotés (« 12-chambre_rdc_cote_jardin-web.jpg ») qui se
 *  liraient « 12 chambres ». */
function textesDe(l: SujetLogement): Array<string | null | undefined> {
  return [
    l.title,
    l.description,
    l.url,
    l.propertyType,
    l.priceLabel,
    ...(l.source === "GreenGo" ? [] : [l.photo, ...(l.photos ?? [])]),
  ];
}

/** Ce que `qualifierLogement` pose sur l'annonce. */
export type Qualifie = {
  capacity: number | null;
  capacityStandard: number | null;
  capacitySource: SourceCapacite | null;
  bedrooms: number | null;
  bedroomsSource: SourceValeur | null;
  isStudio: boolean | null;
  rooms: number | null;
  cabin: boolean | null;
  lodgingType: TypeLogement | null;
};

/** La source de la capacité ; sans source écrite, celle du collecteur : un
 *  champ structuré. `null` sans capacité. */
export function sourceCapacite(l: SujetLogement): SourceCapacite | null {
  return l.capacity == null ? null : (l.capacitySource ?? "structured");
}

/** La source des chambres, comme `sourceCapacite`. */
export function sourceChambres(l: SujetLogement): SourceValeur | null {
  return l.bedrooms == null ? null : (l.bedroomsSource ?? "structured");
}

/** Un studio : 0 chambre. `null` tant que les chambres sont inconnues. */
export function estStudio(bedrooms: number | null): boolean | null {
  return bedrooms == null ? null : bedrooms === 0;
}

/**
 * Qualifie une annonce : garde chaque valeur et sa source, comble par le
 * texte ce qui manque (`text_regex`), puis par le type (`derived_from_type`).
 * Des chambres écrites passent devant des chambres dérivées ; des chambres
 * dérivées suivent les pièces du moment. Idempotente.
 */
export function qualifierLogement<T extends SujetLogement>(l: T): T & Qualifie {
  if (l.source === "Airbnb") return qualifierAirbnb(l);
  const lu = lireLogement(...textesDe(l));

  let capacity = takeGuests(l.capacity);
  let capacitySource = capacity == null ? null : (l.capacitySource ?? "structured");
  if (capacity == null && lu.capacite != null) {
    capacity = lu.capacite;
    capacitySource = "text_regex";
  }
  let capacityStandard = takeGuests(l.capacityStandard);
  if (capacityStandard == null && lu.capaciteStandard != null && capacity === lu.capacite) {
    capacityStandard = lu.capaciteStandard;
  }
  if (capacityStandard != null && (capacity == null || capacityStandard >= capacity))
    capacityStandard = null;

  let rooms = l.rooms != null && l.rooms > 0 ? l.rooms : null;
  rooms ??= lu.pieces;

  let bedrooms = takeBeds(l.bedrooms);
  let bedroomsSource = bedrooms == null ? null : (l.bedroomsSource ?? "structured");
  if (lu.chambresEcrites != null && (bedrooms == null || bedroomsSource === "derived_from_type")) {
    bedrooms = lu.chambresEcrites;
    bedroomsSource = "text_regex";
  }
  if (bedrooms == null || bedroomsSource === "derived_from_type") {
    const d = lu.studio ? 0 : rooms != null && rooms >= 2 ? rooms - 1 : rooms === 1 ? 0 : null;
    if (d != null) {
      bedrooms = d;
      bedroomsSource = "derived_from_type";
    }
  }

  const cabin = l.cabin === true || lu.cabine ? true : (l.cabin ?? null);
  let lodgingType = l.lodgingType ?? typePublie(l.propertyType) ?? lu.type;
  // Aucune chambre, une pièce au plus : un studio, que la source l'appelle
  // appartement ou rien du tout.
  if (
    bedrooms === 0 &&
    (rooms == null || rooms <= 1) &&
    (lodgingType == null || lodgingType === "appartement")
  ) {
    lodgingType = "studio";
  }
  return {
    ...l,
    capacity,
    capacityStandard,
    capacitySource,
    bedrooms,
    bedroomsSource,
    isStudio: estStudio(bedrooms),
    rooms,
    cabin,
    lodgingType,
  };
}

/**
 * Airbnb : capacité et chambres ne viennent que de champs structurés, ceux de
 * la recherche puis ceux de la page du logement (`personCapacity`,
 * `bedroomCount`). Règle du propriétaire (1er octobre 2026) : ni regex sur le
 * titre, ni déduction des pièces ou du type, ni valeur inventée. Ce que seul
 * le texte disait redevient un trou, que la page comblera (`priseFiche.ts`).
 * 0 chambre est un studio ; 0 personne n'est pas une capacité.
 *
 * Deux exceptions, une par champ, quand la page a été lue (`pdpLue`) :
 * - la capacité : introuvable (`capaciteIntrouvable`), celle que le titre
 *   écrit compte, en `text_regex` ;
 * - les chambres : mesuré le 2 octobre 2026 sur dix fiches PDP et une page
 *   `rooms/` d'Abondance, Airbnb ne publie aucun `bedroomCount` ; les
 *   chambres n'y sont écrites que dans le titre de partage
 *   (`sharingConfig.title`, « Appartement · Bernex · ★4,92 · 1 chambre · 1
 *   lit · 1 salle de bain », ou « Studio »). Ce sont les mots de la page
 *   elle-même, lus par le lecteur de fiche (`lectureAirbnb`, `pdp.py`) ; ils
 *   tiennent, en `text_regex` (« N chambres ») ou `derived_from_type` (le 0
 *   d'un « Studio »). Le titre de la tuile, lui, ne donne jamais de chambres.
 * Un champ structuré, arrivé plus tard, remplace l'un comme l'autre
 * (`poserValeur`).
 */
function qualifierAirbnb<T extends SujetLogement>(l: T): T & Qualifie {
  const structure = (source: SourceValeur | null | undefined) =>
    (source ?? "structured") === "structured";
  let capacity = structure(l.capacitySource) ? takeGuests(l.capacity) : null;
  let capacitySource: SourceCapacite | null = capacity == null ? null : "structured";
  let capacityStandard = capacity != null ? takeGuests(l.capacityStandard) : null;
  if (capacity == null && capaciteIntrouvable(l)) {
    const lu = lireLogement(l.title);
    if (lu.capacite != null) {
      capacity = lu.capacite;
      capacitySource = "text_regex";
      capacityStandard = lu.capaciteStandard;
    }
  }
  if (capacityStandard != null && capacity != null && capacityStandard >= capacity)
    capacityStandard = null;
  // Les chambres : structurées, ou les mots de la page lue (voir l'en-tête).
  const chambresDeLaPage = l.pdpLue === true && !structure(l.bedroomsSource);
  const bedrooms = structure(l.bedroomsSource) || chambresDeLaPage ? takeBeds(l.bedrooms) : null;
  const bedroomsSource: SourceValeur | null =
    bedrooms == null ? null : chambresDeLaPage ? (l.bedroomsSource as SourceValeur) : "structured";
  const rooms = l.rooms != null && l.rooms > 0 ? l.rooms : null;
  let lodgingType = l.lodgingType ?? typePublie(l.propertyType) ?? null;
  if (
    bedrooms === 0 &&
    (rooms == null || rooms <= 1) &&
    (lodgingType == null || lodgingType === "appartement")
  ) {
    lodgingType = "studio";
  }
  return {
    ...l,
    capacity,
    capacityStandard,
    capacitySource,
    bedrooms,
    bedroomsSource,
    isStudio: estStudio(bedrooms),
    rooms,
    cabin: l.cabin ?? null,
    lodgingType,
  };
}

/**
 * La capacité d'une annonce Airbnb est introuvable ailleurs que dans son
 * titre : sa page a été lue sans `personCapacity` (`pdpLue`), ou elle n'a
 * aucune page à lire (ni `platformId`, ni URL `rooms/`, ni photo `Hosting-`).
 * Une page pas encore lue, ou refusée (429), ne l'est pas : elle sera lue.
 */
export function capaciteIntrouvable(l: SujetLogement): boolean {
  return l.pdpLue === true || airbnbIdOf(l) == null;
}

/**
 * Pose une valeur lue ailleurs (page de détail, mémoire, offre sœur) si elle
 * vaut mieux que celle de l'annonce : absente, ou d'une source de rang
 * inférieur. Les pièces ne comblent qu'un vide. Rend `true` si elle est
 * posée. Ne requalifie pas : à l'appelant de le faire une fois toutes les
 * valeurs posées.
 */
export function poserValeur(
  l: SujetLogement,
  champ: "capacity" | "bedrooms" | "rooms",
  v: number | null | undefined,
  source: SourceValeur,
): boolean {
  // Airbnb : rien que du structuré (`qualifierAirbnb`). Une valeur du texte
  // ou du type ne comble pas un trou Airbnb : la page du logement le fera.
  // Sauf les chambres que cette page, une fois lue, écrit elle-même
  // (`sharingConfig.title`) : Airbnb ne les publie pas autrement.
  if (l.source === "Airbnb" && source !== "structured" && !(champ === "bedrooms" && l.pdpLue === true)) {
    return false;
  }
  if (champ === "rooms") {
    const x = takeBeds(v);
    if (x == null || x < 1 || (l.rooms != null && l.rooms > 0)) return false;
    l.rooms = x;
    return true;
  }
  if (champ === "capacity") {
    const x = takeGuests(v);
    // La capacité ne se dérive pas : un type n'en dit rien.
    const s: SourceCapacite = source === "structured" ? "structured" : "text_regex";
    const cur = sourceCapacite(l);
    if (x == null || (cur != null && RANG_SOURCE[cur] <= RANG_SOURCE[s])) return false;
    l.capacity = x;
    l.capacitySource = s;
    return true;
  }
  const x = takeBeds(v);
  const cur = sourceChambres(l);
  if (x == null || (cur != null && RANG_SOURCE[cur] <= RANG_SOURCE[source])) return false;
  l.bedrooms = x;
  l.bedroomsSource = source;
  l.isStudio = estStudio(x);
  return true;
}

/** La valeur n'est connue que par le texte ou le type : un champ structuré,
 *  sur la page de détail par exemple, vaut mieux. */
export function valeurDuTexte(l: SujetLogement, champ: "capacity" | "bedrooms"): boolean {
  const s = champ === "capacity" ? sourceCapacite(l) : sourceChambres(l);
  return s === "text_regex" || s === "derived_from_type";
}

/** Des chambres tirées des pièces (« T3 » : 2 chambres) : l'affichage dit
 *  alors les pièces, pas « 2 ch. ». */
export function chambresDesPieces(l: SujetLogement): boolean {
  return (
    l.bedroomsSource === "derived_from_type" &&
    l.rooms != null &&
    l.rooms >= 2 &&
    l.bedrooms === l.rooms - 1
  );
}

/* ---------- Résidu ---------- */

/** Une annonce dont la capacité ou les chambres (et, pour Airbnb, le GPS)
 *  restent introuvables. */
export type Residu = {
  id: string;
  source: string;
  url: string | null;
  manque: Array<"gps" | "capacity" | "bedrooms">;
  /** Airbnb : la page du logement a été lue (le champ y manque vraiment), ou
   *  pas encore (refusée, en file : elle se relira). */
  pageLue?: boolean;
};

/** Un point utilisable : fini, pas (0, 0), dans le globe. */
function pointPlausible(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * Les annonces dont la capacité ou les chambres restent `null` après toutes
 * les stratégies : à journaliser, jamais à combler par défaut.
 */
export function residuLogements(
  rows: ReadonlyArray<{
    id: string;
    source: string;
    url: string | null;
    capacity: number | null;
    bedrooms: number | null;
    lat?: number | null;
    lon?: number | null;
    pdpLue?: boolean | null;
  }>,
): Residu[] {
  const out: Residu[] = [];
  for (const l of rows) {
    const airbnb = l.source === "Airbnb";
    const manque: Residu["manque"] = [];
    // Airbnb doit finir avec ses trois champs : le point aussi se nomme.
    if (airbnb && !pointPlausible(l.lat, l.lon)) manque.push("gps");
    if (l.capacity == null || (airbnb && !(l.capacity > 0))) manque.push("capacity");
    if (l.bedrooms == null) manque.push("bedrooms");
    if (manque.length === 0) continue;
    out.push({
      id: l.id,
      source: l.source,
      url: l.url,
      manque,
      ...(airbnb ? { pageLue: l.pdpLue === true } : {}),
    });
  }
  return out;
}

/** Au plus autant d'annonces nommées une à une dans le journal. */
export const RESIDU_DETAIL_MAX = 30;

/**
 * Les lignes du journal d'un résidu : un compte par source et par champ, puis
 * chaque annonce avec son lien, `RESIDU_DETAIL_MAX` au plus. Vide sans résidu.
 */
export function journalResidu(residu: readonly Residu[], contexte: string): string[] {
  if (residu.length === 0) return [];
  const parSource = new Map<string, { gps: number; capacite: number; chambres: number }>();
  for (const r of residu) {
    const c = parSource.get(r.source) ?? { gps: 0, capacite: 0, chambres: 0 };
    if (r.manque.includes("gps")) c.gps += 1;
    if (r.manque.includes("capacity")) c.capacite += 1;
    if (r.manque.includes("bedrooms")) c.chambres += 1;
    parSource.set(r.source, c);
  }
  const comptes = [...parSource]
    .map(
      ([s, c]) =>
        `${s} ${[
          c.gps ? `${c.gps} sans GPS` : "",
          c.capacite ? `${c.capacite} sans capacité` : "",
          c.chambres ? `${c.chambres} sans chambres` : "",
        ]
          .filter(Boolean)
          .join(", ")}`,
    )
    .join(" · ");
  const lignes = [
    `[logement] ${contexte} : ${residu.length} ${residu.length > 1 ? "annonces" : "annonce"} à null après toutes les stratégies (${comptes})`,
  ];
  const noms = { gps: "GPS", capacity: "capacité", bedrooms: "chambres" } as const;
  for (const r of residu.slice(0, RESIDU_DETAIL_MAX)) {
    const manque = r.manque.map((m) => noms[m]).join(" et ");
    // « capacité introuvable », mais « chambres introuvables ».
    const accord =
      r.manque.length === 1 && r.manque[0] !== "bedrooms" ? "introuvable" : "introuvables";
    // Airbnb : page lue, le champ y manque vraiment ; sinon elle se relira.
    const page = r.pageLue == null ? "" : r.pageLue ? " (page lue)" : " (page pas encore lue)";
    lignes.push(
      `[logement]   ${r.source} ${r.id} : ${manque} ${accord}${page}, ${r.url ?? "sans lien"}`,
    );
  }
  if (residu.length > RESIDU_DETAIL_MAX)
    lignes.push(`[logement]   … et ${residu.length - RESIDU_DETAIL_MAX} autres`);
  return lignes;
}
