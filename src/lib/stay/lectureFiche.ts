/**
 * Ce qu'une page de fiche publie : capacité, chambres, GPS.
 *
 * Lecture seule d'un HTML déjà téléchargé. Rien n'est estimé : un
 * `occupancy.value` qui dit 5 quand `personCapacity` dit 8 n'est pas une
 * capacité — c'est souvent le nombre de lits. On prend les champs qui
 * nomment des voyageurs, des chambres, des coordonnées.
 */

import { lireLogement, RANG_SOURCE, type SourceCapacite, type SourceValeur } from "./logement.ts";
import type { SourceGps } from "./repliGps.ts";
import type { Occupancy } from "./occupancy.ts";
import { taxeSejourSomme } from "./tarif.ts";
import { titrePublie } from "./titre.ts";
import { capaciteDesCouchages } from "./couchages.ts";

/** Capacité, chambres et pièces lues, avec la source de chacune : un champ
 *  structuré ou un JSON embarqué (`structured`), ou un texte (`text_regex`,
 *  le 0 d'un studio écrit étant `derived_from_type`). */
type OccupancyLue = Occupancy & {
  capacitySource?: SourceCapacite | null;
  bedroomsSource?: SourceValeur | null;
};

export type LectureFiche = OccupancyLue & {
  lat: number | null;
  lon: number | null;
  locality: string | null;
  /** Rue publiée (JSON-LD `streetAddress`), pour un GPS encore vide. */
  street: string | null;
  /** Code postal publié (JSON-LD `postalCode`), avec la rue. */
  postcode?: string | null;
  /** D'où vient le point, quand c'est une page Airbnb (`repliGps.ts`). */
  gpsSource?: SourceGps | null;
  /** La page Airbnb a été lue : ce qui y manque y manque vraiment. */
  pageLue?: boolean;
  /** Nom de l'annonce tel que la fiche le publie (`h1`, og:title). */
  title: string | null;
  /** Lits annoncés par la page (« 4 lits », aperçu Airbnb), à part de la capacité. */
  beds?: number | null;
  /** Airbnb : chambre privée ou partagée, chambre d'hôtel ou hébergement insolite (`ecarteeAirbnb`). */
  ecartee?: boolean;
  /** Taxe de séjour publiée en une somme, pas un tarif à la nuit. */
  taxeSejour: number | null;
  /** La capacité est la somme des couchages décrits (`couchages.ts`), aucune page ne la chiffrant. */
  capaciteCouchages?: boolean;
};

const VIDE: LectureFiche = {
  capacity: null,
  capacitySource: null,
  bedrooms: null,
  bedroomsSource: null,
  rooms: null,
  lat: null,
  lon: null,
  locality: null,
  street: null,
  title: null,
  taxeSejour: null,
};

const MAX = 99;

function plausible(lat: number | null, lon: number | null): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function takeGuests(n: unknown): number | null {
  const v = typeof n === "number" ? n : typeof n === "string" && /^\d+$/.test(n.trim()) ? Number(n.trim()) : NaN;
  return Number.isInteger(v) && v > 0 && v <= MAX ? v : null;
}

function takeBeds(n: unknown): number | null {
  const v = typeof n === "number" ? n : typeof n === "string" && /^\d+$/.test(n.trim()) ? Number(n.trim()) : NaN;
  return Number.isInteger(v) && v >= 0 && v <= MAX ? v : null;
}

function asCoord(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1].replace(/^\s*\/\/<!\[CDATA\[/, "").replace(/\/\/\]\]>\s*$/, "").trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      /* bloc illisible : on passe */
    }
  }
  return out;
}

/** Des valeurs lues dans un champ structuré ou un JSON embarqué. */
function structure(capacity: number | null, bedrooms: number | null, rooms: number | null): OccupancyLue {
  return {
    capacity,
    capacitySource: capacity != null ? "structured" : null,
    bedrooms,
    bedroomsSource: bedrooms != null ? "structured" : null,
    rooms,
  };
}

/** Des valeurs lues dans un texte (`logement.ts`) : écrites, ou le 0 d'un studio. */
function duTexte(...parts: Array<string | null | undefined>): OccupancyLue {
  const lu = lireLogement(...parts);
  const bedrooms = lu.chambresEcrites ?? (lu.studio ? 0 : null);
  return {
    capacity: lu.capacite,
    capacitySource: lu.capacite != null ? "text_regex" : null,
    bedrooms,
    bedroomsSource: lu.chambresEcrites != null ? "text_regex" : bedrooms != null ? "derived_from_type" : null,
    rooms: lu.pieces,
  };
}

/** Le rang d'une source lue : un champ structuré avant le texte, le texte avant le type. */
function rang(source: SourceValeur | null | undefined): number {
  return RANG_SOURCE[source ?? "structured"];
}

/**
 * `a` d'abord, `b` comble ; chaque valeur garde sa source. Une valeur de `b`
 * d'une meilleure source remplace celle de `a` : le critère `GCAPAC-GCAP03`
 * d'une fiche Ingénie passe devant « Appartement 3 personnes » lu plus tôt
 * dans le titre (Les 2 Alpes, 2 octobre 2026).
 */
function fusion(a: OccupancyLue, b: OccupancyLue): OccupancyLue {
  const capB = b.capacity != null && (a.capacity == null || rang(b.capacitySource) < rang(a.capacitySource));
  const chB = b.bedrooms != null && (a.bedrooms == null || rang(b.bedroomsSource) < rang(a.bedroomsSource));
  return {
    capacity: capB ? b.capacity : a.capacity,
    capacitySource: capB ? b.capacitySource : a.capacitySource,
    bedrooms: chB ? b.bedrooms : a.bedrooms,
    bedroomsSource: chB ? b.bedroomsSource : a.bedroomsSource,
    rooms: a.rooms ?? b.rooms,
  };
}

function mergeLecture(a: LectureFiche, b: LectureFiche): LectureFiche {
  const occ = fusion(a, b);
  const gps = plausible(a.lat, a.lon) ? { lat: a.lat, lon: a.lon } : { lat: b.lat, lon: b.lon };
  return {
    ...occ,
    lat: gps.lat,
    lon: gps.lon,
    locality: a.locality ?? b.locality,
    street: a.street ?? b.street,
    postcode: a.postcode ?? b.postcode ?? null,
    // Chaque titre est déjà passé par `titrePublie` : le relire le décoderait une fois de plus.
    title: a.title ?? b.title,
    taxeSejour: a.taxeSejour ?? b.taxeSejour,
    ...(a.capaciteCouchages && occ.capacity === a.capacity ? { capaciteCouchages: true } : {}),
  };
}

function fromOccupancyNode(o: Record<string, unknown>): OccupancyLue {
  return structure(takeGuests(o.maxValue) ?? takeGuests(o.maxPersons) ?? takeGuests(o.maxGuests), null, null);
}

/** Une entreprise, pas un logement : chez les centrales, le loueur ou l'agence. */
const ENTREPRISE =
  /LocalBusiness|Organi[sz]ation|Corporation|RealEstateAgent|TravelAgency|Store|ProfessionalService/i;
const LOGEMENT = /VacationRental|LodgingBusiness|Accommodation|Hotel|Apartment|House|Residence/i;

function fromRecord(o: Record<string, unknown>): LectureFiche {
  let out: LectureFiche = { ...VIDE };
  const guests =
    takeGuests(o.personCapacity) ??
    takeGuests(o.numberOfGuests) ??
    takeGuests(o.guestCapacity) ??
    takeGuests(o.maxPersons) ??
    takeGuests(o.accommodates) ??
    takeGuests(o.sleeps);
  const bedrooms = takeBeds(o.numberOfBedrooms) ?? takeBeds(o.bedroomCount) ?? takeBeds(o.bedrooms);
  const rooms = takeBeds(o.numberOfRooms) ?? takeBeds(o.roomCount);
  if (guests != null || bedrooms != null || rooms != null) {
    out = { ...out, ...structure(guests, bedrooms, rooms) };
  }
  const occ = o.occupancy;
  if (occ && typeof occ === "object" && !Array.isArray(occ)) {
    out = { ...out, ...fusion(out, fromOccupancyNode(occ as Record<string, unknown>)) };
  }
  const geo = o.geo;
  if (geo && typeof geo === "object" && !Array.isArray(geo)) {
    const g = geo as Record<string, unknown>;
    const lat = asCoord(g.latitude);
    const lon = asCoord(g.longitude);
    if (plausible(lat, lon)) {
      out = { ...out, lat, lon };
    }
  }
  const lat = asCoord(o.latitude) ?? asCoord(o.listingLat);
  const lon = asCoord(o.longitude) ?? asCoord(o.listingLng) ?? asCoord(o.lng);
  if (plausible(lat, lon)) out = { ...out, lat, lon };
  const loc =
    (typeof o.addressLocality === "string" && o.addressLocality.trim()) ||
    (o.address && typeof o.address === "object" && !Array.isArray(o.address)
      ? typeof (o.address as Record<string, unknown>).addressLocality === "string"
        ? String((o.address as Record<string, unknown>).addressLocality).trim()
        : ""
      : "");
  if (loc) out = { ...out, locality: loc };
  const streetRaw =
    (typeof o.streetAddress === "string" && o.streetAddress.trim()) ||
    (o.address && typeof o.address === "object" && !Array.isArray(o.address)
      ? typeof (o.address as Record<string, unknown>).streetAddress === "string"
        ? String((o.address as Record<string, unknown>).streetAddress).trim()
        : ""
      : "");
  if (streetRaw) out = { ...out, street: streetRaw.replace(/,\s*$/, "").trim() };
  const adresse =
    o.address && typeof o.address === "object" && !Array.isArray(o.address)
      ? (o.address as Record<string, unknown>)
      : null;
  const cp = adresse?.postalCode ?? o.postalCode;
  if (typeof cp === "string" || typeof cp === "number") {
    const code = String(cp).match(/\b\d{5}\b/)?.[0];
    if (code) out = { ...out, postcode: code };
  }
  const name = typeof o.name === "string" ? o.name : null;
  const kind = String(o["@type"] ?? "");
  const lodging = LOGEMENT.test(kind);
  if (name) {
    if (lodging) {
      const titre = titrePublie(name);
      if (titre) out = { ...out, title: out.title ?? titre };
    }
    out = { ...out, ...fusion(out, duTexte(name)) };
  }
  // La description d'un logement : ses chambres (« une chambre (1 lit 2
  // personnes) », gîtes du widget Gîtes de France), ses pièces, et la capacité
  // qu'elle énonce — jamais celle d'un couchage (« 1 lit 2 personnes »,
  // `capaciteEcrite`).
  // Les fiches Ingénie décrivent l'annonce dans un `Product` (son nom, sa
  // description), à côté du `LocalBusiness` de l'agence.
  if ((lodging || /\bProduct\b/i.test(kind)) && typeof o.description === "string") {
    const lu = lireLogement(decodeHtml(o.description));
    if (out.bedrooms == null && lu.chambresEcrites != null) {
      out = { ...out, bedrooms: lu.chambresEcrites, bedroomsSource: "text_regex" };
    } else if (out.bedrooms == null && out.rooms == null && lu.pieces != null) out = { ...out, rooms: lu.pieces };
    if (out.capacity == null && lu.capacite != null) out = { ...out, capacity: lu.capacite, capacitySource: "text_regex" };
  }
  return out;
}

function estEntreprise(o: Record<string, unknown>): boolean {
  const kind = String(o["@type"] ?? "");
  return ENTREPRISE.test(kind) && !LOGEMENT.test(kind);
}

/** Les points qu'une entreprise de la page publie pour elle-même. */
type PointsLoueur = Array<{ lat: number; lon: number }>;

/**
 * Parcourt un bloc JSON-LD. Le point, la rue et la commune d'une entreprise
 * ne sont jamais ceux du logement : chez Ingénie, le bloc `LocalBusiness` est
 * le loueur (nom, téléphone, courriel), et c'est son `location` qui porte le
 * point du logement. Pris pour le logement, le point de l'agence se posait sur
 * chacun de ses logements sans point propre. Il est gardé à part (`loueur`),
 * pour qu'aucun recours ne le reprenne ailleurs dans la page.
 */
function walk(node: unknown, acc: LectureFiche, depth: number, loueur: PointsLoueur): LectureFiche {
  if (depth > 12 || node == null) return acc;
  if (Array.isArray(node)) {
    for (const x of node) acc = walk(x, acc, depth + 1, loueur);
    return acc;
  }
  if (typeof node !== "object") return acc;
  const o = node as Record<string, unknown>;
  const propre = fromRecord(o);
  const entreprise = estEntreprise(o);
  if (entreprise) {
    if (plausible(propre.lat, propre.lon)) loueur.push({ lat: propre.lat as number, lon: propre.lon as number });
    acc = mergeLecture(acc, { ...propre, lat: null, lon: null, street: null, locality: null });
  } else {
    acc = mergeLecture(acc, propre);
  }
  if (Array.isArray(o["@graph"])) acc = walk(o["@graph"], acc, depth + 1, loueur);
  if (o.containsPlace) acc = walk(o.containsPlace, acc, depth + 1, loueur);
  if (o.location) acc = walk(o.location, acc, depth + 1, loueur);
  // L'adresse d'une entreprise est la sienne, pas celle du logement.
  if (!entreprise && o.address && typeof o.address === "object") {
    acc = walk(o.address, acc, depth + 1, loueur);
  }
  if (o.itemListElement) acc = walk(o.itemListElement, acc, depth + 1, loueur);
  return acc;
}

/** La lecture sans un point qui est celui d'une entreprise de la page. */
function sansPointLoueur(l: LectureFiche, loueur: PointsLoueur): LectureFiche {
  if (l.lat == null || l.lon == null) return l;
  const { lat, lon } = l;
  const pareil = loueur.some((p) => Math.abs(p.lat - lat) < 1e-6 && Math.abs(p.lon - lon) < 1e-6);
  return pareil ? { ...l, lat: null, lon: null } : l;
}

function fromRegex(html: string): LectureFiche {
  let out: LectureFiche = { ...VIDE };
  const pc = html.match(/"personCapacity"\s*:\s*(\d+)/);
  if (pc) out = { ...out, capacity: takeGuests(pc[1]), capacitySource: "structured" };
  const guestsJson =
    html.match(/"numberOfGuests"\s*:\s*"?(\d+)/i)?.[1] ??
    html.match(/"guestCapacity"\s*:\s*"?(\d+)/i)?.[1] ??
    html.match(/"accommodates"\s*:\s*"?(\d+)/i)?.[1] ??
    html.match(/"maxOccupancy"\s*:\s*"?(\d+)/i)?.[1] ??
    html.match(/"sleeps"\s*:\s*"?(\d+)/i)?.[1] ??
    // MSEM : le bloc `capacity` du `__NEXT_DATA__` de la fiche
    // (`"capacity":{"maxCapacity":7,"nbRooms":3,"nbBedrooms":2}`).
    html.match(/"maxCapacity"\s*:\s*"?(\d+)/)?.[1];
  if (out.capacity == null && guestsJson) out = { ...out, capacity: takeGuests(guestsJson), capacitySource: "structured" };
  const bedsJson =
    html.match(/"numberOfBedrooms"\s*:\s*"?(\d+)/i)?.[1] ??
    html.match(/"bedroomCount"\s*:\s*"?(\d+)/i)?.[1] ??
    html.match(/"nbBedrooms"\s*:\s*"?(\d+)/)?.[1];
  if (bedsJson) out = { ...out, bedrooms: takeBeds(bedsJson), bedroomsSource: "structured" };
  const roomsJson =
    html.match(/"numberOfRooms"\s*:\s*"?(\d+)/i)?.[1] ?? html.match(/"nbRooms"\s*:\s*"?(\d+)/)?.[1];
  if (roomsJson) out = { ...out, rooms: takeBeds(roomsJson) };
  const latlng = html.match(/"listingLat"\s*:\s*(-?\d+(?:\.\d+))\s*,\s*"listingLng"\s*:\s*(-?\d+(?:\.\d+))/);
  if (latlng) {
    const lat = Number(latlng[1]);
    const lon = Number(latlng[2]);
    if (plausible(lat, lon)) out = { ...out, lat, lon };
  }
  const phrases: string[] = [];
  const reVoy = /"(\d+)\s*voyageurs?"/gi;
  const reCh = /"(\d+)\s*chambres?"/gi;
  const rePers = /"(\d+)\s*(?:personnes?|pers\.?)"/gi;
  const reMax = /Max(?:imum|\.)?\s*(?:de\s+)?(\d+)\s*(?:personnes?|voyageurs?|occupants?|guests?)/gi;
  let m: RegExpExecArray | null;
  // La valeur d'un champ de formulaire n'est pas une capacité : le sélecteur
  // de voyageurs d'Abritel porte `value="2 personnes"`, la taille du groupe
  // cherché (Châtel, 2 octobre 2026), et la fiche en tirait 2 personnes.
  const deChamp = (i: number) => /(?:\bvalue|placeholder|aria-valuetext)\s*=\s*$|"(?:value|placeholder)"\s*:\s*$/i.test(html.slice(Math.max(0, i - 24), i));
  while ((m = reVoy.exec(html))) if (!deChamp(m.index)) phrases.push(m[0].replace(/"/g, ""));
  while ((m = reCh.exec(html))) if (!deChamp(m.index)) phrases.push(m[0].replace(/"/g, ""));
  while ((m = rePers.exec(html))) if (!deChamp(m.index)) phrases.push(m[0].replace(/"/g, ""));
  while ((m = reMax.exec(html))) phrases.push(m[0]);
  if (phrases.length) out = { ...out, ...fusion(out, duTexte(...phrases)) };
  return out;
}

const ENTITES: Record<string, string> = { nbsp: " ", deg: "°", quot: '"', apos: "'", amp: "&" };

/**
 * Les entités d'un attribut `content`, décodées en une seule passe : le `&`
 * rendu par une entité n'en ouvre pas une autre (`&amp;quot;` reste `&quot;`).
 */
export function decodeHtml(s: string): string {
  return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (brut, dec?: string, hex?: string, nom?: string) => {
    if (nom) return ENTITES[nom.toLowerCase()] ?? brut;
    const code = dec != null ? Number(dec) : Number.parseInt(hex ?? "", 16);
    return code === 160 ? " " : String.fromCharCode(code);
  });
}

/** Meta description / Open Graph : la centrale y répète capacité et pièces. */
function fromMeta(html: string): LectureFiche {
  let out: LectureFiche = { ...VIDE };
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    if (!/name=["']description["']|property=["']og:(?:description|title)["']/i.test(tag)) continue;
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (!content) continue;
    out = { ...out, ...fusion(out, duTexte(decodeHtml(content))) };
    if (/property=["']og:title["']/i.test(tag)) {
      const titre = titrePublie(content);
      if (titre) out = { ...out, title: out.title ?? titre };
    }
  }
  return out;
}

/**
 * Les chambres écrites dans le descriptif d'une fiche Ingénie : les blocs
 * `contenu_descriptif`, débarrassés de leurs balises. `null` sans descriptif,
 * ou sans « N chambres » dedans.
 */
/**
 * La quantité d'un critère Ingénie : `<li class="capacite-nombreChambres-G">
 * <span class="quantite">1</span> <span class="libelle">chambre(s)</span>`.
 */
function critereQuantite(html: string, critere: string): string | undefined {
  const re = new RegExp(`class=["']${critere}(?:-[A-Z])?["'][^>]*>\\s*<span[^>]*\\bquantite\\b[^>]*>\\s*(\\d+)`, "i");
  return re.exec(html)?.[1];
}

/**
 * Le critère « TYPE DE LOGEMENT » (`OTYPA-…`, Val d'Arly, 2 octobre 2026) :
 * « deux pièces » (`OTYPA-OTYP2P`), ou des variantes de studio (« studio
 * cabine », « studio mezzanine »…). Un seul nombre de pièces écrit : celui-là ;
 * sinon un studio, une pièce. `undefined` sans ce critère.
 */
function piecesTypeLogement(html: string): string | undefined {
  const valeurs = [...html.matchAll(/<li class=["']OTYPA-[^"']*["'][^>]*>([^<]{1,60})<\/li>/gi)].map((m) =>
    decodeHtml(m[1] ?? "").trim(),
  );
  if (valeurs.length === 0) return undefined;
  const pieces = new Set(valeurs.map((v) => lireLogement(v)).filter((lu) => !lu.studio && lu.pieces != null).map((lu) => lu.pieces));
  if (pieces.size === 1) return String([...pieces][0]);
  if (pieces.size === 0 && valeurs.some((v) => /\bstudio/i.test(v))) return "1";
  return undefined;
}

/**
 * Le critère dont le titre est « Nombre de chambres » ou « Nombre de
 * chambre(s) », quel que soit son code : « 1 Chambre » (`GNCHME-GCHN01`,
 * Gérardmer), une quantité (`<span class="quantite">2</span>`), ou « 1
 * Coin(s) nuit » (Les Rousses) — un coin nuit n'est pas une chambre : 0.
 */
function critereNombreDeChambres(html: string): string | undefined {
  const bloc = /crit_[A-Z0-9_]+["'][^>]*>\s*Nombre de chambres?(?:\s*\(s\))?\s*(?:<span>[^<]*<\/span>\s*)?<\/span>\s*<ul class=["']valeur-critere["'][^>]*>([\s\S]{0,600}?)<\/ul>/i.exec(html)?.[1];
  if (!bloc) return undefined;
  const texte = decodeHtml(bloc.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  const n = /(\d+)\s*chambres?\b/i.exec(texte)?.[1] ?? (/^\d+$/.test(texte) ? texte : undefined);
  if (n != null) return n;
  if (/coins?\s*\(?s?\)?\s*nuit/i.test(texte) && !/chambre/i.test(texte)) return "0";
  return undefined;
}

function descriptifIngenie(html: string): ReturnType<typeof lireLogement> | null {
  const textes: string[] = [];
  const re = /class=["']contenu_descriptif["'][^>]*>([\s\S]*?)<\/span>\s*<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) textes.push(decodeHtml((m[1] ?? "").replace(/<[^>]*>/g, " ")));
  if (textes.length === 0) return null;
  return lireLogement(textes.join(" · ").replace(/\s+/g, " "));
}

/**
 * Fiche Ingénie : critères GCAPAC / pièces / Chambre 1-N, GPS écrit en clair.
 *
 * Le JSON-LD de la centrale est souvent celui du loueur, pas du logement ;
 * les chambres n'y figurent pas. Les titres `Chambre 1`, `Chambre 2` sont
 * le décompte publié, pas une estimation.
 */
function fromIngenie(html: string): LectureFiche {
  let out: LectureFiche = { ...VIDE };
  // Les critères sont des attributs : `GCAPAC-GCAP08`, `OPERSONNES-8PERS`
  // (« Capacité maximale », Les Saisies), `capaciteMaximumPossible` suivi de
  // sa quantité (« 4 personnes maximum », Arêches). La ligne « Capacité … N
  // personnes » est un texte ; son libellé peut porter un `<span>:</span>`.
  const capCritere =
    html.match(/GCAPAC-GCAP0?(\d+)/i)?.[1] ??
    html.match(/\bOPERSONNES-(\d+)PERS\b/i)?.[1] ??
    html.match(/capaciteMaximumPossible[^>]*>\s*<span[^>]*\bquantite\b[^>]*>\s*(\d+)/i)?.[1] ??
    // `ICAPAC-ICAPAC` suivi de sa quantité (« 2 personnes », Les Menuires,
    // fiches Interhome, 2 octobre 2026).
    html.match(/\bICAPAC-ICAPAC\b[^>]*>\s*<span[^>]*\bquantite\b[^>]*>\s*(\d+)/i)?.[1] ??
    // Bloc « Capacité » : `capacite-capaciteHebergement`, à côté de
    // `capacite-nombreChambres` et `capacite-nombrePieces` (Val d'Arly).
    critereQuantite(html, "capacite-capaciteHebergement") ??
    // `CAPAMAX-CAPALOGEMENT` (Le Collet d'Allevard).
    critereQuantite(html, "CAPAMAX-CAPALOGEMENT");
  const capTexte = html.match(
    /Capacit[eé][^<]{0,80}(?:<span>[^<]{0,4}<\/span>\s*)?<\/span>[\s\S]{0,280}?(\d+)\s*personnes/i,
  )?.[1];
  const cap = capCritere ?? capTexte;
  if (cap) out = { ...out, capacity: takeGuests(cap), capacitySource: capCritere ? "structured" : "text_regex" };
  const pieces =
    html.match(/GTYPAP-G(\d+)PIEC/i)?.[1] ??
    critereQuantite(html, "capacite-nombrePieces") ??
    html.match(/Nombre de pi[eè]ces[\s\S]{0,280}?(\d+)\s*pi[eè]ces/i)?.[1] ??
    // « Nombre de pièces : Studio » (`GTYPAP-GSTUDI`, « Studio + coin(s)
    // nuit ») : une pièce, que `qualifierLogement` lit 0 chambre.
    (/\bGTYPAP-G?STUDI/i.test(html) ? "1" : undefined) ??
    piecesTypeLogement(html);
  if (pieces) out = { ...out, rooms: takeBeds(pieces) };
  // Le nombre publié (`NBDECHAMBRE-CHAMBRE1`, « 1 chambre »), sinon le
  // décompte des titres `Chambre 1`, `Chambre 2` (`crit_GCHAM1`, `crit_CHAMBRE1`).
  const chPubliees =
    html.match(/\bNBDECHAMBRE-CHAMBRE(\d+)\b/i)?.[1] ??
    critereQuantite(html, "capacite-nombreChambres") ??
    critereNombreDeChambres(html);
  // Le numéro du libellé « Chambre N », pas celui du critère : `crit_GCHAM7`
  // est « Cabine 1 » chez Vacanceole (Chamrousse, 2 octobre 2026), et le
  // plus grand numéro de critère donnait 7 chambres à un studio.
  let maxCh = 0;
  // « Dans la chambre 1- couchage » (`crit_CHAMB1`, Le Collet) aussi.
  const reCh = /crit_G?CHAM(?:BRE|B)?\d+\b[^>]*>\s*([^<]{0,40})/g;
  let m: RegExpExecArray | null;
  while ((m = reCh.exec(html))) {
    const n = Number(/^(?:dans\s+la\s+)?chambre\s*n?°?\s*(\d+)/i.exec(decodeHtml(m[1] ?? "").trim())?.[1]);
    if (Number.isInteger(n) && n > maxCh && n <= MAX) maxCh = n;
  }
  const ch = chPubliees != null ? takeBeds(chPubliees) : maxCh > 0 ? takeBeds(maxCh) : null;
  if (ch != null) out = { ...out, bedrooms: ch, bedroomsSource: "structured" };
  // Sans critère, les chambres écrites dans le descriptif (« 3 chambres (1 lit
  // 1 personne / 1 lit 2 personnes…) », gîtes distribués par la centrale). La
  // capacité ne s'y lit pas : « 2 lits gigognes 1 personne » décrit un lit.
  const descriptif = descriptifIngenie(html);
  // La capacité que le descriptif énonce (« Studio … pour 4 personnes », La
  // Rosière), quand aucun critère ne la donne. Un couchage (« 1 lit 2
  // personnes ») n'en est pas une (`capaciteEcrite`).
  if (out.capacity == null && descriptif?.capacite != null) {
    out = { ...out, capacity: descriptif.capacite, capacitySource: "text_regex" };
  }
  if (out.bedrooms == null) {
    const lu = descriptif;
    if (lu?.chambresEcrites != null) out = { ...out, bedrooms: lu.chambresEcrites, bedroomsSource: "text_regex" };
    // Sans chambres écrites, les pièces que le descriptif nomme (« studio 18
    // m2 », « 2 pièces ») : `qualifierLogement` en tire les chambres, 0 pour
    // un studio, comme pour tout type sans chambres écrites.
    else if (out.rooms == null && lu?.pieces != null) out = { ...out, rooms: lu.pieces };
  }
  const itemLat = html.match(/itemprop=["']latitude["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const itemLon = html.match(/itemprop=["']longitude["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const lat = asCoord(itemLat) ?? asCoord(html.match(/Latitude\s*:\s*(-?\d+(?:[.,]\d+)?)/i)?.[1] ?? null);
  const lon = asCoord(itemLon) ?? asCoord(html.match(/Longitude\s*:\s*(-?\d+(?:[.,]\d+)?)/i)?.[1] ?? null);
  if (plausible(lat, lon)) out = { ...out, lat, lon };
  const h1 = html.match(/<h1\b[^>]*>([\s\S]{0,220}?)<\/h1>/i)?.[1];
  const titre = titrePublie(h1 ?? null);
  if (titre) out = { ...out, title: titre };
  return out;
}

/**
 * Fiche iResa (lesarcs-reservation.com) : les chambres écrites en libellé,
 * « Nb chambre(s) : 1 » (`SheetEquipmentServices-listing`), lu le 2 octobre
 * 2026 sur une fiche réelle. Un studio n'a pas la ligne : rien n'est déduit.
 * Ni capacité (celle de la liste, `cap_max`) ni point sur cette page.
 */
function fromLibelles(html: string): LectureFiche {
  const ch = html.match(/Nb\s+chambres?\s*\(s\)\s*:\s*(\d+)/i)?.[1];
  if (ch == null) return { ...VIDE };
  const n = takeBeds(ch);
  return n == null ? { ...VIDE } : { ...VIDE, bedrooms: n, bedroomsSource: "structured" };
}

/**
 * Fiche Gîtes de France (widget ITEA) : le formulaire de réservation
 * `formule_capacite` propose 1 à N personnes, N étant la capacité que la
 * réservation accepte. Lu le 2 octobre 2026 sur le gîte 73G34159 (Arêches),
 * dont ni le JSON-LD ni le texte ne chiffrent la capacité : « 1 personne ·
 * 2 personnes · 3 personnes ». `null` sans ce formulaire.
 */
export function capaciteFormuleItea(html: string): number | null {
  const select = /<select[^>]*\bname=["']formule_capacite["'][^>]*>([\s\S]*?)<\/select>/i.exec(html)?.[1];
  if (!select) return null;
  let max: number | null = null;
  for (const m of select.matchAll(/<option[^>]*\bvalue=["']?(\d+)["']?/gi)) {
    const n = takeGuests(m[1]);
    if (n != null && (max == null || n > max)) max = n;
  }
  return max;
}

/**
 * Fiche Orchestra (La Plagne) : le bloc « Information », des libellés en gras
 * suivis de leur valeur — `<strong>Capacité:</strong> 4`, `<strong>Chambres à
 * coucher:</strong> 1`, `<strong>Type</strong>: Appt 2 pièces` ou « Studio
 * divisible ». Relevé le 2 octobre 2026 ; aucune autre partie de la page ne
 * chiffre les chambres.
 */
function fromLibellesGras(html: string): LectureFiche {
  let out: LectureFiche = { ...VIDE };
  const cap = /<strong>\s*Capacit[ée]\s*:\s*<\/strong>\s*(\d+)/i.exec(html)?.[1];
  if (cap) out = { ...out, capacity: takeGuests(cap), capacitySource: "structured" };
  const ch = /<strong>\s*Chambres?\s+à\s+coucher\s*:\s*<\/strong>\s*(\d+)/i.exec(html)?.[1];
  if (ch) out = { ...out, bedrooms: takeBeds(ch), bedroomsSource: "structured" };
  const type = /<strong>\s*Type\s*<\/strong>\s*:\s*([^<]{1,60})/i.exec(html)?.[1];
  if (type) {
    const lu = lireLogement(decodeHtml(type));
    if (lu.pieces != null) out = { ...out, rooms: lu.pieces };
  }
  if (out.capacity == null) out = { ...out, capacitySource: null };
  return out;
}

/**
 * Les chambres d'une description : la somme des lignes d'une énumération
 * (« - 1 Chambre avec un lit double… - 1 chambre en suite… »), sinon le
 * nombre annoncé (« offre 5 chambres », « une chambre »). `null` sans aucun.
 */
export function chambresDeDescription(texte: string): number | null {
  const lignes = texte.split(/\r?\n|<br\s*\/?>|\s\|\s/i);
  let somme = 0;
  let enumerees = 0;
  for (const ligne of lignes) {
    const m = /^\s*[-•*]\s*(\d+|une?|deux|trois|quatre|cinq)\s+chambres?\b/i.exec(ligne);
    if (!m) continue;
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : lireLogement(`${m[1]} chambre`).chambresEcrites;
    if (n == null) continue;
    somme += n;
    enumerees += 1;
  }
  if (enumerees > 0) return takeBeds(somme);
  return lireLogement(texte).chambresEcrites;
}

/**
 * Fiche Ingénie : la description de l'annonce est écrite dans le JSON-LD de
 * l'agence (`LocalBusiness`, « Agence Cimalpes »), pas dans un bloc du
 * logement (Les 2 Alpes, 2 octobre 2026 : « Chalet de 193m² qui offre 5
 * chambres et peut accueillir 12 personnes »). Lue sur les pages Ingénie
 * seulement : ailleurs, la description d'une agence parle de l'agence.
 */
function fromDescriptionIngenie(html: string): LectureFiche {
  if (!/static\.ingenie\.fr/.test(html)) return { ...VIDE };
  let out: LectureFiche = { ...VIDE };
  for (const bloc of jsonLdBlocks(html)) {
    const items = Array.isArray(bloc) ? bloc : [bloc];
    for (const o of items) {
      const d = o && typeof o === "object" ? (o as Record<string, unknown>).description : null;
      if (typeof d !== "string" || !d.trim()) continue;
      const texte = decodeHtml(d);
      const lu = lireLogement(texte.replace(/<br\s*\/?>/gi, " · "));
      if (out.capacity == null && lu.capacite != null) out = { ...out, capacity: lu.capacite, capacitySource: "text_regex" };
      const ch = chambresDeDescription(texte);
      if (out.bedrooms == null && ch != null) out = { ...out, bedrooms: ch, bedroomsSource: "text_regex" };
      if (out.rooms == null && lu.pieces != null) out = { ...out, rooms: lu.pieces };
    }
  }
  return out;
}

/**
 * Fiche Abritel (Vrbo) : le résumé du logement, `propertyHighlightedDetails`
 * → `infoItems`, un texte par icône — `room` « 22 chambres », `people » « 62
 * personnes » (Cordon, 2 octobre 2026). Le JSON est échappé dans la page.
 */
function fromResumeAbritel(html: string): LectureFiche {
  if (!html.includes("propertyHighlightedDetails")) return { ...VIDE };
  const brut = html.replace(/\\+"/g, '"');
  const i = brut.indexOf('"propertyHighlightedDetails"');
  const bloc = brut.slice(i, i + 4000);
  let out: LectureFiche = { ...VIDE };
  for (const m of bloc.matchAll(/"id":"(room|people)"[^{}]*\}\},"text":"(\d+)\s*(?:chambres?|personnes?|voyageurs?)"/g)) {
    if (m[1] === "people" && out.capacity == null) out = { ...out, capacity: takeGuests(m[2]), capacitySource: "structured" };
    if (m[1] === "room" && out.bedrooms == null) out = { ...out, bedrooms: takeBeds(m[2]), bedroomsSource: "structured" };
  }
  // Sans l'icône `people` : la capacité que la description du logement
  // énonce (« il accueille jusqu'à 8 personnes avec 4 chambres », p2708242),
  // jamais celle d'un couchage (`capaciteEcrite`).
  if (out.capacity == null) {
    // Le bloc peut être dans une chaîne JavaScript, guillemets échappés.
    for (const m of html.matchAll(/<div data-stid=\\?"content-markup\\?">([\s\S]{0,20000}?)<\/div>/g)) {
      const lu = lireLogement(decodeHtml((m[1] ?? "").replace(/<[^>]*>/g, " ")));
      if (lu.capacite != null) {
        out = { ...out, capacity: lu.capacite, capacitySource: "text_regex" };
        break;
      }
    }
  }
  return out;
}

/**
 * Les textes d'une page qui décrivent ses couchages, du plus sûr au moins
 * sûr : les critères Ingénie (« Coin montagne ouvert : 1 x 2 lits 1 personne
 * superposés », Risoul), le descriptif Ingénie (« Couchages : Entrée : 2 lits
 * superposés Séjour : Canapé convertible 140X190 », La Daille), la
 * description du JSON-LD, celle d'Abritel. Un seul texte compte : le même lit
 * décrit deux fois ne se compte pas deux fois.
 */
export function textesCouchages(html: string): { texte: string; compteExige?: boolean }[] {
  const textes: { texte: string; compteExige?: boolean }[] = [];
  const nettoyer = (s: string) => decodeHtml(s.replace(/<br\s*\/?>/gi, " . ").replace(/<\/li>/gi, " . ").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  const criteres: string[] = [];
  for (const m of html.matchAll(/<ul class=["']valeur-critere["'][^>]*>([\s\S]{0,1500}?)<\/ul>/gi)) {
    const t = nettoyer(m[1] ?? "");
    if (t) criteres.push(t);
  }
  // Les critères listent aussi des équipements (« Lit 140 cm ») : un lit n'y compte qu'avec son nombre.
  if (criteres.length > 0) textes.push({ texte: criteres.join(" . "), compteExige: true });
  const descriptif: string[] = [];
  for (const m of html.matchAll(/class=["']contenu_descriptif["'][^>]*>([\s\S]*?)<\/span>\s*<\/div>/gi)) descriptif.push(nettoyer(m[1] ?? ""));
  if (descriptif.length > 0) textes.push({ texte: descriptif.join(" . ") });
  for (const bloc of jsonLdBlocks(html)) {
    for (const o of Array.isArray(bloc) ? bloc : [bloc]) {
      const d = o && typeof o === "object" ? (o as Record<string, unknown>).description : null;
      if (typeof d === "string" && d.trim()) textes.push({ texte: nettoyer(d) });
    }
  }
  for (const m of html.matchAll(/<div data-stid=\\?"content-markup\\?">([\s\S]{0,20000}?)<\/div>/g)) textes.push({ texte: nettoyer(m[1] ?? "") });
  return textes;
}

/** La somme des couchages du premier texte de la page qui les chiffre tous (`couchages.ts`). */
function capaciteDesCouchagesPage(html: string): number | null {
  for (const { texte, compteExige } of textesCouchages(html)) {
    const cap = capaciteDesCouchages(texte, { compteExige });
    if (cap != null) return cap;
  }
  return null;
}

function fromFormuleItea(html: string): LectureFiche {
  const cap = capaciteFormuleItea(html);
  return cap == null ? { ...VIDE } : { ...VIDE, capacity: cap, capacitySource: "structured" };
}

/** Le point d'une carte de la page : `data-atlas-latlng` (Booking), `data-lat`. */
function fromGpsAttributs(html: string): LectureFiche {
  let out: LectureFiche = { ...VIDE };
  const atlas = html.match(/data-atlas-latlng="\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*"/i);
  if (atlas) {
    const lat = Number(atlas[1]);
    const lon = Number(atlas[2]);
    if (plausible(lat, lon)) out = { ...out, lat, lon };
  }
  if (!plausible(out.lat, out.lon)) {
    const lat = asCoord(html.match(/\bdata-lat=["']([^"']+)["']/i)?.[1] ?? null);
    const lon =
      asCoord(html.match(/\bdata-lng=["']([^"']+)["']/i)?.[1] ?? null) ??
      asCoord(html.match(/\bdata-lon=["']([^"']+)["']/i)?.[1] ?? null);
    if (plausible(lat, lon)) out = { ...out, lat, lon };
  }
  return out;
}

/**
 * Un `"geo"` ou un couple `"latitude"`/`"longitude"` écrit n'importe où dans
 * la page : le premier qui n'est pas le point d'une entreprise de la page
 * (le texte du bloc JSON-LD du loueur porte aussi un `"geo"`).
 */
function fromGpsTexte(html: string, loueur: PointsLoueur): LectureFiche {
  const motifs = [
    /"geo"\s*:\s*\{[^}]{0,280}"latitude"\s*:\s*"?(-?\d+(?:\.\d+)?)"?[^}]{0,120}"longitude"\s*:\s*"?(-?\d+(?:\.\d+)?)"?/gi,
    /"latitude"\s*:\s*"?(-?\d+(?:\.\d+)?)"?\s*,\s*"longitude"\s*:\s*"?(-?\d+(?:\.\d+)?)"?/gi,
  ];
  for (const re of motifs) {
    for (const m of html.matchAll(re)) {
      const lu = sansPointLoueur({ ...VIDE, lat: Number(m[1]), lon: Number(m[2]) }, loueur);
      if (plausible(lu.lat, lu.lon)) return lu;
    }
  }
  return { ...VIDE };
}

/**
 * Une vraie page de logement Airbnb : ses données (`data-deferred-state`,
 * `pdpSections`) ou l'un des quatre champs. Une coquille, un mur de connexion
 * ou une page d'erreur sans eux n'est pas une page lue : rien n'y manque
 * « vraiment », et elle se relira.
 */
export function pageAirbnbLisible(html: string): boolean {
  return /id=["']data-deferred-state-\d+["']|"pdpSections"|"personCapacity"|"bedroomCount"|"listingLat"/.test(html);
}

/**
 * Le titre de partage d'une page Airbnb (`sharingConfig.title`) : « Appartement
 * · Bernex · ★4,92 · 1 chambre · 1 lit · 1 salle de bain », ou « … · Studio ·
 * 3 lits · … ». Lu le 2 octobre 2026 sur une page `rooms/` réelle, la même
 * forme que `lignes_partage` du worker (`scrape/airbnb/occupancy.py`).
 */
function titrePartageAirbnb(html: string): string | null {
  const brut = html.match(/"sharingConfig"\s*:\s*\{[^{}]*?"title"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  if (!brut) return null;
  try {
    return JSON.parse(`"${brut}"`) as string;
  } catch {
    return brut;
  }
}

/**
 * L'aperçu d'une page Airbnb, les lignes que l'écran montre sous le titre
 * (« 6 voyageurs · 2 chambres · 4 lits · 1 salle de bain ») : dans le HTML
 * reçu, elles ne sont pas des `<li>` (le navigateur les rend), mais le bloc
 * JSON `"overview":{"__typename":"StaysPdpOverview", … "items":[…]}`. Lu le
 * 2 octobre 2026 sur `rooms/1456397434311994216`.
 */
function apercuAirbnb(html: string): string[] | null {
  const m = html.match(/"__typename"\s*:\s*"StaysPdpOverview"[^{}[\]]*?"items"\s*:\s*\[((?:\s*"(?:[^"\\]|\\.)*"\s*,?)*)\]/);
  if (!m) return null;
  try {
    const items = JSON.parse(`[${m[1]}]`) as unknown[];
    const lignes = items.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    return lignes.length > 0 ? lignes : null;
  } catch {
    return null;
  }
}

/* Les règles du worker, recopiées telles quelles pour juger une page `rooms/`
 * comme il juge une fiche PDP : `scrape/airbnb/map.py` (`PRIVATE`,
 * `HOTEL_TILE`, `ENTIRE`, `is_dropped_listing`) et `scrape/airbnb/occupancy.py`
 * (`INSOLITE_RE`, lu sur le type de logement seul). */
const PRIVEE =
  /chambre d['’ ]?hotes|maison d['’ ]?hotes|private[ _-]?room|chambre privee|shared[ _-]?room|chambre partage|bed[- ]and[- ]breakfast|hotel[ _]room|chambre d['’ ]?hotel/i;
const HOTEL_EN_TETE = /^h[oô]tels?\b/i;
const ENTIER = /appartement|chalet|maison|logement entier|entire/i;
const INSOLITE =
  /(?:^|[\s\-_'’:(])(?:campings?|glamping|campement|tentes?|tipis?|yourtes?|roulottes?|bulles?|mobil-?homes?|caravanes?|camping-?cars?|bateaux?|p[eé]niches?|igloos?|cabanes? dans les arbres|emplacements?)(?=$|[\s\-_'’.,:)])/i;

function plierTexte(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** `is_dropped_listing` du worker. */
function pasUnLogementEntier(texte: string | null | undefined): boolean {
  if (!texte || !texte.trim()) return false;
  const t = plierTexte(texte);
  if (PRIVEE.test(t)) return true;
  return HOTEL_EN_TETE.test(t) && !ENTIER.test(t);
}

/**
 * Une page Airbnb qui n'est pas un logement entier, jugée comme le worker juge
 * une fiche PDP (`occupancy_from_pdp`) : le `roomType` (« Private room »,
 * « Hotel room ») ou le type publié (« Logement entier : tente »). La page
 * `rooms/` ne porte pas `isHotelRatePlanEnabled` : ce seul signal-là manque.
 */
export function ecarteeAirbnb(html: string): boolean {
  const lire = (cle: string) => {
    const brut = html.match(new RegExp(`"${cle}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))?.[1];
    if (brut == null) return null;
    try {
      return JSON.parse(`"${brut}"`) as string;
    } catch {
      return brut;
    }
  };
  const roomType = lire("roomType");
  const type = lire("propertyType");
  return pasUnLogementEntier(roomType) || pasUnLogementEntier(type) || (type != null && INSOLITE.test(type));
}

/** « 4 lits », « 1 lit » : le nombre de lits annoncé, à part de la capacité. */
function litsDe(lignes: readonly string[]): number | null {
  for (const l of lignes) {
    const m = l.match(/(\d+)\s*lits?\b/i);
    if (m) return takeGuests(m[1]);
  }
  return null;
}

/**
 * La page d'un logement Airbnb (PDP, `rooms/`) : ce qu'elle publie, et elle
 * seule. Règle du propriétaire (1er octobre 2026) : pour Airbnb, c'est la
 * seule source de rattrapage. Les champs structurés d'abord : `personCapacity`,
 * `bedroomCount` quand la page le porte, `listingLat`/`listingLng` pour le
 * point (provenance `pdp`). Puis les mots de la page elle-même (2 octobre
 * 2026) : l'aperçu (`apercuAirbnb`, « N voyageurs », « N chambres »,
 * « Studio », « N lits »), et à défaut le titre de partage pour les chambres.
 * Mesuré sur dix fiches PDP et une page `rooms/` (Abondance), Airbnb ne
 * publie pas de `bedroomCount` : les chambres viennent de l'aperçu, en
 * `text_regex` (« N chambres ») ou `derived_from_type` (le 0 d'un
 * « Studio »), comme le lit déjà `pdp.py`. Ni titre d'annonce, ni
 * description, ni méta : un champ absent reste un trou, que le journal nomme.
 * 0 chambre est un studio ; 0 personne n'est pas une capacité.
 */
export function lectureAirbnb(html: string): LectureFiche {
  let out: LectureFiche = { ...VIDE };
  if (!html) return out;
  const apercu = apercuAirbnb(html);
  const capacite = takeGuests(html.match(/"personCapacity"\s*:\s*(\d+)/)?.[1]);
  if (capacite != null) out = { ...out, capacity: capacite, capacitySource: "structured" };
  else if (apercu) {
    const lu = duTexte(...apercu);
    if (lu.capacity != null) out = { ...out, capacity: lu.capacity, capacitySource: "text_regex" };
  }
  const chambres = takeBeds(html.match(/"bedroomCount"\s*:\s*(\d+)/)?.[1]);
  if (chambres != null) out = { ...out, bedrooms: chambres, bedroomsSource: "structured" };
  else {
    const lu = apercu ? duTexte(...apercu) : null;
    if (lu && lu.bedrooms != null) out = { ...out, bedrooms: lu.bedrooms, bedroomsSource: lu.bedroomsSource ?? null };
    else {
      const partage = titrePartageAirbnb(html);
      if (partage) {
        const p = duTexte(partage);
        if (p.bedrooms != null) out = { ...out, bedrooms: p.bedrooms, bedroomsSource: p.bedroomsSource ?? null };
      }
    }
  }
  const lits = apercu ? litsDe(apercu) : null;
  if (lits != null) out = { ...out, beds: lits };
  if (ecarteeAirbnb(html)) out = { ...out, ecartee: true };
  const lat = Number(html.match(/"listingLat"\s*:\s*(-?\d+(?:\.\d+)?)/)?.[1] ?? NaN);
  const lon = Number(html.match(/"listingLng"\s*:\s*(-?\d+(?:\.\d+)?)/)?.[1] ?? NaN);
  if (plausible(lat, lon)) out = { ...out, lat, lon, gpsSource: "pdp" };
  return out;
}

/**
 * Lit capacité, chambres et GPS dans le HTML d'une fiche déjà chargée.
 *
 * Le point est celui du logement ou rien : JSON-LD du logement (ou
 * `location` d'une entreprise), `listingLat`, critères Ingénie, carte de la
 * page, enfin un `"geo"` écrit n'importe où. Chaque étape ne comble que ce
 * qui manque. Le point, la rue et la commune d'une entreprise (le loueur,
 * l'agence) ne se lisent jamais comme ceux du logement, et un recours qui
 * retombe sur le point de l'entreprise est écarté.
 */
export function lectureFiche(html: string): LectureFiche {
  if (!html || html.length < 40) return { ...VIDE };
  let out: LectureFiche = { ...VIDE };
  const loueur: PointsLoueur = [];
  for (const block of jsonLdBlocks(html)) out = walk(block, out, 0, loueur);
  out = mergeLecture(out, sansPointLoueur(fromRegex(html), loueur));
  out = mergeLecture(out, fromMeta(html));
  const ingenie = sansPointLoueur(fromIngenie(html), loueur);
  out = mergeLecture(out, ingenie);
  if (ingenie.title) out = { ...out, title: ingenie.title };
  out = mergeLecture(out, fromLibelles(html));
  out = mergeLecture(out, fromFormuleItea(html));
  out = mergeLecture(out, fromLibellesGras(html));
  out = mergeLecture(out, fromDescriptionIngenie(html));
  out = mergeLecture(out, fromResumeAbritel(html));
  // En dernier : la somme des couchages décrits, quand rien ne chiffre la capacité.
  if (out.capacity == null) {
    const cap = capaciteDesCouchagesPage(html);
    if (cap != null) out = { ...out, capacity: cap, capacitySource: "text_regex", capaciteCouchages: true };
  }
  if (!plausible(out.lat, out.lon)) out = mergeLecture(out, sansPointLoueur(fromGpsAttributs(html), loueur));
  if (!plausible(out.lat, out.lon)) out = mergeLecture(out, fromGpsTexte(html, loueur));
  const taxe = taxeSejourSomme(html);
  if (taxe != null) out = { ...out, taxeSejour: out.taxeSejour ?? taxe };
  // Une source sans valeur ne dit rien.
  if (out.capacity == null) out = { ...out, capacitySource: null };
  if (out.bedrooms == null) out = { ...out, bedroomsSource: null };
  return out;
}
