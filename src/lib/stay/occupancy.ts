/**
 * Capacité et chambres telles que la source les écrit.
 *
 * On ne fabrique aucun nombre. Un titre « 8 personnes » est une annonce ; « 2
 * appartements de 6 personnes » n'en est pas une — ce serait 12, ou 6, et
 * choisir c'est inventer. Dans le doute, `null` : l'écran dit « non annoncé ».
 *
 * « N pièces » se traduit en chambres par la convention française déjà tenue
 * par `lodgingFilter` : un 3 pièces a deux chambres, un studio / 1 pièce n'en
 * a aucune. La lecture ici ne recopie jamais le nombre de pièces dans
 * `bedrooms` : depuis le 1er octobre 2026, c'est `qualifierLogement`
 * (`logement.ts`) qui pose ces chambres, marquées `derived_from_type`, et l'écran
 * continue d'écrire « 3 pièces ».
 *
 * Un slug `appartement-8-personnes` ou `2-pieces` est la même phrase, écrite
 * avec des tirets : on la lit, on n'en déduit rien d'autre.
 */

import {
  LOTS,
  lireLogement,
  plier,
  qualifierLogement,
  takeBeds,
  takeGuests,
  type SourceCapacite,
  type SourceValeur,
} from "./logement.ts";

export type Occupancy = {
  capacity: number | null;
  bedrooms: number | null;
  /**
   * Pièces annoncées, telles quelles.
   *
   * « 3 pièces » **n'est pas** « 2 chambres » : c'est une déduction, juste,
   * mais que la source n'a pas écrite. Elle était inscrite dans `bedrooms`,
   * d'où une vignette affichant « 2 ch. » pour une annonce qui dit « 3 pièces »
   * — un chiffre publié par personne. La conversion appartient à la
   * comparaison (`lodgingFilter.normalizedBedrooms`, qui lit déjà ce champ),
   * pas au relevé.
   */
  rooms: number | null;
};

const MAX = 50;

const GUEST_KEYS = new Set([
  "guestcapacity",
  "personcapacity",
  "maxguestcapacity",
  "maxcapacity",
  "maxpersons",
  "maxguests",
  "maxpax",
  "numberofguests",
  "person_capacity",
  "guest_capacity",
  "capacite",
  "cap_max",
  "sleeps",
  "maxoccupancy",
  "occupancymax",
]);

/** Les pièces, quand la source les compte en champ propre. */
const ROOM_KEYS = new Set(["nbrooms", "nbpieces", "pieces", "rooms", "numberofrooms", "roomcount"]);

const BED_KEYS = new Set([
  "bedroomcount",
  "bedroomscount",
  "numberofbedrooms",
  "bedroom",
  "bedrooms",
]);

/** Sous-objets où les OTA écrivent vraiment l'occupation, pas un filtre. */
const NESTED = [
  "subTitleDetails",
  "details",
  "sharingConfig",
  "loggingContext",
  "eventDataLogging",
  "occupancy",
  "demandStayListing",
];

/** N pièces → chambres. Studio / 1 pièce = 0 chambre. */
export function bedroomsFromRooms(rooms: number | null | undefined): number | null {
  if (rooms == null || !Number.isInteger(rooms) || rooms <= 0 || rooms > MAX) return null;
  return rooms - 1;
}

export function mergeOccupancy(base: Occupancy, extra: Occupancy): Occupancy {
  return {
    capacity: base.capacity ?? extra.capacity,
    bedrooms: base.bedrooms ?? extra.bedrooms,
    rooms: base.rooms ?? extra.rooms,
  };
}

/**
 * Lit un titre, un sous-titre, un slug, un bloc de tuile. Plusieurs chaînes :
 * on les joint, c'est le même logement qui parle plusieurs fois.
 *
 * La lecture elle-même vit dans `logement.ts` (`lireLogement`). Ici, les
 * seules valeurs écrites : capacité, chambres écrites ou studio, pièces. Les
 * chambres tirées des pièces sont posées, avec leur source, par
 * `qualifierLogement`.
 */
export function occupancyFromText(...parts: Array<string | null | undefined>): Occupancy {
  const lu = lireLogement(...parts);
  return { capacity: lu.capacite, bedrooms: lu.chambresEcrites ?? (lu.studio ? 0 : null), rooms: lu.pieces };
}

/* ---------- Fiche démentie par le titre ---------- */

/**
 * Titres de lot (`LOTS`, `logement.ts`) : plusieurs logements vendus
 * ensemble, dont un studio. « 2 appartements et 1 studio » à 8 personnes
 * n'est pas un studio gonflé. Relevés du 25 septembre 2026 : « Arc 2000 -2
 * Appartements Et De 1 Studio… », « Appartements T4 Et Studio - 10 Pers »,
 * « Grand gite Narcisse (gite et studio) ».
 *
 * Un studio annexe aussi : « chalet avec studio », « dont un studio », « plus
 * un studio », ou un « studio indépendant » ou « attenant » nommé après le
 * chalet ou la maison, dans le même membre du titre. Seul en tête, « Studio
 * indépendant au calme » est un studio, et il reste jugé ; derrière un tiret,
 * « Chalet Les Sapins - Studio indépendant » ou « Ferme rénovée - Studio
 * Indépendant » nomment le lieu puis le logement loué : un studio, jugé aussi.
 */

/** « pour 4 personnes », « pour 5/6 pers. », « for 4 people » : la plus
 *  grande des deux valeurs d'une fourchette. Seulement après « pour » ou
 *  « for » : « Beau 4p », « Chalet Les Marmottes - 5p8 » ou « 6+2 Pers »
 *  ne disent pas une capacité qu'on puisse opposer à la fiche.
 *
 *  « Pour 12 personnes + 2 enfants » en annonce 14 : le « + N », entre
 *  parenthèses ou non, s'ajoute quand il compte des personnes (enfants,
 *  bébés, couchages…), ou quand rien ne le suit. « + 2 chambres » ne
 *  s'ajoute pas. */
const POUR_N =
  /\b(?:pour|for)\s+(\d{1,2})(?:\s*(?:a|-|\/|–|ou)\s*(\d{1,2}))?\s*(?:personnes?|pers\b\.?|voyageurs?|people|persons|guests)(?:\s*\(?\s*\+\s*(\d{1,2})(?:\s*(?:enfants?|bebes?|bb|adultes?|personnes?|pers\b\.?|couchages?|children|kids?|babies|baby)\b|(?!\d|\s*[a-z])))?/;

/** Une personne d'écart est ordinaire : un lit d'appoint, un bébé. « 4 Pièces
 *  Pour 7 Personnes », publié 8 personnes, reste une annonce. */
const ECART_PERSONNES = 2;

/**
 * Le titre annonce plus petit que la fiche : l'annonce ne dit pas ce qu'elle
 * loue, et sa fiche ne se croit pas.
 *
 * Relevés du 25 septembre 2026 : CozyCozy publiait « 3 chambres, 8 personnes »
 * pour « Résidence Cheval Blanc - 2 Pièces Pour 4 Personnes » (La Norma), 3
 * chambres pour « Homency - Résidence De L'oisans F1 » (Auris) ou « Studio
 * Rénové Avec Balcon Et Parking à Flaine ». C'est la fiche Cozy elle-même qui
 * le dit, pas un reflet de la recherche. Ces offres passaient premières de
 * leur station dans « Par budget » : « Appartement 2 Pièces 5/6 Pers. » à
 * 1 032 €, première à Abondance, Châtel et La Chapelle-d'Abondance.
 *
 * Deux contradictions, et seulement celles-là :
 * - un studio, un F1 ou T1, un 1 ou 2 pièces (lus par `occupancyFromText`)
 *   avec plus de chambres publiées que de pièces : un « 2 pièces + cabine »
 *   publié 2 chambres passe, publié 3 non ;
 * - « pour N personnes » avec au moins deux personnes de plus sur la fiche.
 *
 * Épargnés : les titres de lot (`LOTS`), et GreenGo, qui publie capacité et
 * chambres dans son détail. Une fiche muette ne se contredit pas.
 *
 * Un titre qui compte lui-même autant de chambres que la fiche (« Chalet Le
 * Studio - 5 Chambres », publié 5 chambres) ne mesure pas le logement par ses
 * pièces : la règle des pièces ne le juge pas. « 2 Pièces 1 Chambre »,
 * « Studio 1 chambre » ou « T2 2 chambres » publiés 3 chambres restent
 * démentis.
 */
export function ficheDementieParLeTitre(l: {
  source?: string | null;
  title?: string | null;
  capacity?: number | null;
  bedrooms?: number | null;
}): boolean {
  if (l.source === "GreenGo" || !l.title) return false;
  // « 2 pièces d'eau » compte des salles de bain, « 2 pièces à vivre » ou
  // « de vie » des séjours : ni l'un ni l'autre ne mesure le logement.
  const titre = l.title.replace(
    /\d+\s*-?\s*pi[eè]ces?\s+(?:d\W*\s*eau|[aà]\s+vivre|de\s+vie)\b/gi,
    " ",
  );
  const t = plier(titre);
  if (LOTS.some((re) => re.test(t))) return false;
  const lu = occupancyFromText(titre);
  const pieces = lu.rooms;
  if (
    pieces != null &&
    pieces >= 1 &&
    pieces <= 2 &&
    !(lu.bedrooms != null && l.bedrooms != null && lu.bedrooms >= l.bedrooms) &&
    l.bedrooms != null &&
    l.bedrooms > pieces
  ) {
    return true;
  }
  const pour = POUR_N.exec(t);
  if (pour && l.capacity != null) {
    const n = Math.max(Number(pour[1]), Number(pour[2] ?? 0)) + Number(pour[3] ?? 0);
    if (n > 0 && l.capacity >= n + ECART_PERSONNES) return true;
  }
  return false;
}

function fromObj(o: Record<string, unknown>): Occupancy {
  let guests: number | null = null;
  let bedrooms: number | null = null;
  let rooms: number | null = null;
  for (const [k, v] of Object.entries(o)) {
    const key = k.toLowerCase();
    if (guests == null && GUEST_KEYS.has(key)) guests = takeGuests(v);
    if (bedrooms == null && BED_KEYS.has(key)) bedrooms = takeBeds(v);
    if (rooms == null && ROOM_KEYS.has(key)) rooms = takeBeds(v);
  }
  return { capacity: guests, bedrooms, rooms };
}

/** Champs structurés d'une fiche JSON, sans descendre dans tout l'arbre. */
export function occupancyFromRecord(r: Record<string, unknown>): Occupancy {
  const layers: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();
  const queue: Record<string, unknown>[] = [r];
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    layers.push(cur);
    for (const k of NESTED) {
      const v = cur[k];
      if (v && typeof v === "object" && !Array.isArray(v)) queue.push(v as Record<string, unknown>);
    }
  }
  let out: Occupancy = { capacity: null, bedrooms: null, rooms: null };
  for (const layer of layers) out = mergeOccupancy(out, fromObj(layer));
  return out;
}

/** Ce que rend `annoncer` : les valeurs, leur source, et le studio. */
export type OccupancyAnnoncee = Occupancy & {
  capacityStandard: number | null;
  capacitySource: SourceCapacite | null;
  bedroomsSource: SourceValeur | null;
  isStudio: boolean | null;
};

/**
 * Le publié d'abord, le texte ensuite. Jamais l'inverse.
 *
 * Ce que le collecteur passe est `structured` (un champ d'API, un JSON
 * embarqué, un attribut), sauf `source` contraire, par exemple une valeur
 * qu'il a lue lui-même dans une ligne de texte (`text_regex`). Les textes
 * comblent le reste (`text_regex`), puis le type (`derived_from_type`), selon
 * `qualifierLogement` : la règle est la même pour tous les collecteurs.
 */
export function annoncer(
  /** `rooms` est facultatif à l'entrée : la plupart des sources n'en parlent
   *  pas, et les obliger à écrire `rooms: null` n'apprendrait rien. */
  connu: Omit<Occupancy, "rooms"> & {
    rooms?: number | null;
    capacityStandard?: number | null;
    source?: SourceValeur | Partial<Record<"capacity" | "bedrooms", SourceValeur>>;
  },
  ...textes: Array<string | null | undefined>
): OccupancyAnnoncee {
  const source = (k: "capacity" | "bedrooms"): SourceValeur =>
    typeof connu.source === "string" ? connu.source : (connu.source?.[k] ?? "structured");
  const capacity = takeGuests(connu.capacity);
  const bedrooms = takeBeds(connu.bedrooms);
  const rooms = takeBeds(connu.rooms);
  const q = qualifierLogement({
    description: textes.filter((t) => t && t.trim()).join(" · ") || null,
    capacity,
    capacitySource: capacity == null ? null : source("capacity") === "structured" ? "structured" : "text_regex",
    capacityStandard: connu.capacityStandard ?? null,
    bedrooms,
    bedroomsSource: bedrooms == null ? null : source("bedrooms"),
    rooms: rooms != null && rooms >= 1 ? rooms : null,
  });
  return {
    capacity: q.capacity,
    bedrooms: q.bedrooms,
    rooms: q.rooms,
    capacityStandard: q.capacityStandard,
    capacitySource: q.capacitySource,
    bedroomsSource: q.bedroomsSource,
    isStudio: q.isStudio,
  };
}

/** Les champs de logement d'une annonce, tels que `annoncer` les rend : à
 *  poser sur le `Listing` d'un collecteur, sans en oublier un. */
export function champsLogement(o: OccupancyAnnoncee): OccupancyAnnoncee {
  return {
    capacity: o.capacity,
    capacityStandard: o.capacityStandard,
    capacitySource: o.capacitySource,
    bedrooms: o.bedrooms,
    bedroomsSource: o.bedroomsSource,
    isStudio: o.isStudio,
    rooms: o.rooms,
  };
}
