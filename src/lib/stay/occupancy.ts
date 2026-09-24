/**
 * Capacité et chambres telles que la source les écrit.
 *
 * On ne fabrique aucun nombre. Un titre « 8 personnes » est une annonce ; « 2
 * appartements de 6 personnes » n'en est pas une — ce serait 12, ou 6, et
 * choisir c'est inventer. Dans le doute, `null` : l'écran dit « non annoncé ».
 *
 * « N pièces » se traduit en chambres par la convention française déjà tenue
 * par `lodgingFilter` : un 3 pièces a deux chambres, un studio / 1 pièce n'en
 * a aucune. On ne recopie jamais le nombre de pièces dans `bedrooms`.
 *
 * Un slug `appartement-8-personnes` ou `2-pieces` est la même phrase, écrite
 * avec des tirets : on la lit, on n'en déduit rien d'autre.
 */

export type Occupancy = {
  guests: number | null;
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

const MULTI_UNITE =
  /(?<!\d)(?:[2-9]|1[0-2])(?!\d)\s+(?:appartements?|chalets?|logements?|maisons?)\s+(?:de\s+)?(\d+)\s+(?:personnes?|pers\.?|voyageurs?)\b/i;

const MULTI_UNITE_SLUG =
  /(\d+)-(?:appartements?|chalets?|logements?|maisons?)-de-(\d+)-(?:personnes?|pers)\b/i;

const GUESTS_RANGE =
  /(\d+)\s*[/\u2013–-]\s*(\d+)\s*-?\s*(?:personnes?|pers\.?|voyageurs?|guests?|pax|couchages?)\b/i;

const GUESTS_ONE =
  /(\d+)\s*-?\s*(?:personnes?|pers\.?|voyageurs?|guests?|pax|couchages?)\b/i;

/**
 * « 8p », « 10 P », « 8P pied des pistes » : l'abréviation des tuiles Airbnb.
 * Une lettre collée refuse : « 2 pièces ». « 2p cabine » aussi — ce n'est pas
 * deux voyageurs. Un espace puis un autre mot (« pied », « sauna ») passe.
 */
const GUESTS_P = /(?<![\p{L}\d])(\d+)\s*[pP](?![\p{L}])(?!\s*(?:cabine|pi[eè]ces?)\b)/u;

const GUESTS_ACCUEIL =
  /accueill(?:e|ant|ir)\s+(?:jusqu['’]?à\s+)?(\d+)\b/i;

const GUESTS_CAPACITE =
  /capacit(?:[eé]|y)\s*(?:de\s+|:\s*)?(?:jusqu['’]?à\s+)?(\d+)\b/i;

/** « cap. 8 », « cap 10 » : abréviation des fiches, pas le mot « cape ». */
const GUESTS_CAP_ABBR = /\bcap\.?\s*[:=]?\s*(\d+)\b/i;

/** `sleeps 8` : le verbe publié par les OTA anglophones, pas un compte de lits. */
const GUESTS_SLEEPS = /\bsleeps\s+(\d+)\b/i;

const BEDROOMS = /(\d+)\s*-?\s*(?:chambres?|bedrooms?|ch(?![a-zà-ÿ]))/i;

const PIECES = /(\d+)\s*-?\s*pi[eè]ces?\b/i;

const T_TYPE = /\bT([1-9])\b/i;

/** F2, F3 : la même convention que T2, T3, écrite avec un F. */
const F_TYPE = /\bF([1-9])\b/i;

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

function entier(n: unknown): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return Math.trunc(n);
  if (typeof n === "string" && /^\d+$/.test(n.trim())) return Number(n.trim());
  return null;
}

function takeGuests(n: unknown): number | null {
  const v = entier(n);
  return v != null && v > 0 && v <= MAX ? v : null;
}

function takeBeds(n: unknown): number | null {
  const v = entier(n);
  return v != null && v >= 0 && v <= MAX ? v : null;
}

/** N pièces → chambres. Studio / 1 pièce = 0 chambre. */
export function bedroomsFromRooms(rooms: number | null | undefined): number | null {
  if (rooms == null || !Number.isInteger(rooms) || rooms <= 0 || rooms > MAX) return null;
  return rooms - 1;
}

export function mergeOccupancy(base: Occupancy, extra: Occupancy): Occupancy {
  return {
    guests: base.guests ?? extra.guests,
    bedrooms: base.bedrooms ?? extra.bedrooms,
    rooms: base.rooms ?? extra.rooms,
  };
}

/**
 * Lit un titre, un sous-titre, un slug, un bloc de tuile. Plusieurs chaînes :
 * on les joint, c'est le même logement qui parle plusieurs fois.
 */
export function occupancyFromText(...parts: Array<string | null | undefined>): Occupancy {
  const text = parts.filter((p) => p && p.trim()).join(" · ");
  if (!text) return { guests: null, bedrooms: null, rooms: null };

  let guests: number | null = null;
  let bedrooms: number | null = null;
  let rooms: number | null = null;

  if (!MULTI_UNITE.test(text) && !MULTI_UNITE_SLUG.test(text)) {
    const range = GUESTS_RANGE.exec(text);
    if (range) {
      guests = takeGuests(Math.max(Number(range[1]), Number(range[2])));
    } else {
      const one = GUESTS_ONE.exec(text);
      if (one) guests = takeGuests(Number(one[1]));
      else {
        const p = GUESTS_P.exec(text);
        if (p) guests = takeGuests(Number(p[1]));
        else {
          const acc =
            GUESTS_ACCUEIL.exec(text) ??
            GUESTS_CAPACITE.exec(text) ??
            GUESTS_SLEEPS.exec(text) ??
            GUESTS_CAP_ABBR.exec(text);
          if (acc) guests = takeGuests(Number(acc[1]));
        }
      }
    }
  }

  const ch = BEDROOMS.exec(text);
  if (ch) bedrooms = takeBeds(Number(ch[1]));

  // Les pièces se lisent comme des pièces. Elles ne deviennent des chambres
  // qu'au moment de comparer, et jamais sur la fiche.
  const pi = PIECES.exec(text);
  if (pi) rooms = takeBeds(Number(pi[1]));
  if (rooms == null) {
    const t = T_TYPE.exec(text) ?? F_TYPE.exec(text);
    if (t) rooms = takeBeds(Number(t[1]));
  }
  // « Studio » est un mot publié, et il dit deux choses à la fois : une pièce,
  // et aucune chambre séparée. Les deux sont donc des lectures, pas des
  // déductions.
  if (/\bstudio\b/i.test(text)) {
    rooms ??= 1;
    bedrooms ??= 0;
  }

  return { guests, bedrooms, rooms };
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
  return { guests, bedrooms, rooms };
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
  let out: Occupancy = { guests: null, bedrooms: null, rooms: null };
  for (const layer of layers) out = mergeOccupancy(out, fromObj(layer));
  return out;
}

/** Le publié d'abord, le titre ensuite. Jamais l'inverse. */
export function annoncer(
  /** `rooms` est facultatif à l'entrée : la plupart des sources n'en parlent
   *  pas, et les obliger à écrire `rooms: null` n'apprendrait rien. */
  connu: Omit<Occupancy, "rooms"> & { rooms?: number | null },
  ...textes: Array<string | null | undefined>
): Occupancy {
  return mergeOccupancy(
    {
      guests: takeGuests(connu.guests),
      bedrooms: takeBeds(connu.bedrooms),
      rooms: takeBeds(connu.rooms),
    },
    occupancyFromText(...textes),
  );
}

/**
 * Relit titre, URL, type, libellé et photo d'une fiche déjà construite.
 *
 * Sauf les photos GreenGo : leurs noms sont des libellés numérotés
 * (« 12-chambre_rdc_cote_jardin-web.jpg », 12e photo) qui se lisaient
 * « 12 chambres ». GreenGo publie capacité et chambres dans son détail.
 */
export function occupancyOfListing(l: {
  source?: string | null;
  guests: number | null;
  bedrooms: number | null;
  rooms?: number | null;
  title?: string | null;
  url?: string | null;
  propertyType?: string | null;
  priceLabel?: string | null;
  photo?: string | null;
  photos?: string[] | null;
}): Occupancy {
  return annoncer(
    { guests: l.guests, bedrooms: l.bedrooms, rooms: l.rooms ?? null },
    l.title,
    l.url,
    l.propertyType,
    l.priceLabel,
    ...(l.source === "GreenGo" ? [] : [l.photo, ...(l.photos ?? [])]),
  );
}
