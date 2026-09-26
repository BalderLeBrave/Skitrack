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

/* ---------- Fiche démentie par le titre ---------- */

function plier(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Titres de lot : plusieurs logements vendus ensemble, dont un studio. « 2
 * appartements et 1 studio » à 8 personnes n'est pas un studio gonflé.
 * Relevés du 25 septembre 2026 : « Arc 2000 -2 Appartements Et De 1 Studio… »,
 * « Appartements T4 Et Studio - 10 Pers », « Grand gite Narcisse (gite et
 * studio) ».
 *
 * Un studio annexe aussi : « chalet avec studio », « dont un studio », « plus
 * un studio », ou un « studio indépendant » ou « attenant » nommé après le
 * chalet ou la maison, dans le même membre du titre. Seul en tête, « Studio
 * indépendant au calme » est un studio, et il reste jugé ; derrière un tiret,
 * « Chalet Les Sapins - Studio indépendant » ou « Ferme rénovée - Studio
 * Indépendant » nomment le lieu puis le logement loué : un studio, jugé aussi.
 */
const LOTS: readonly RegExp[] = [
  /(?<!\d)(?:[2-9]|1[0-2])\s+(?:appartements|apparts|studios|chalets|logements|maisons|gites)\b/,
  /(?:\bet|\bavec|\bdont|\bplus|\+|&)\s*(?:de\s+)?(?:(?:un|une|1)\s+)?studios?\b/,
  /\bstudios?\s*(?:et|\+|&)\s*(?:(?:un|une|\d+)\s+)?(?:appartements?|apparts?|chalets?|gites?|maisons?|[tf]\d\b|\d\s*pieces?)/,
  /\b(?:chalets?|maisons?|villas?|fermes?|appartements?|apparts?|gites?)\b(?:(?!\s[-–—|:]\s).)*\bstudios?\s+(?:independant|attenant)e?s?\b/,
];

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
  guests?: number | null;
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
  if (pour && l.guests != null) {
    const n = Math.max(Number(pour[1]), Number(pour[2] ?? 0)) + Number(pour[3] ?? 0);
    if (n > 0 && l.guests >= n + ECART_PERSONNES) return true;
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
