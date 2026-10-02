/**
 * Ce qu'une page de fiche publie : capacité, chambres, GPS.
 *
 * Lecture seule d'un HTML déjà téléchargé. Rien n'est estimé : un
 * `occupancy.value` qui dit 5 quand `personCapacity` dit 8 n'est pas une
 * capacité — c'est souvent le nombre de lits. On prend les champs qui
 * nomment des voyageurs, des chambres, des coordonnées.
 */

import { lireLogement, type SourceCapacite, type SourceValeur } from "./logement.ts";
import type { SourceGps } from "./repliGps.ts";
import type { Occupancy } from "./occupancy.ts";
import { taxeSejourSomme } from "./tarif.ts";
import { titrePublie } from "./titre.ts";

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
  /** Taxe de séjour publiée en une somme, pas un tarif à la nuit. */
  taxeSejour: number | null;
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

const MAX = 50;

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

/** `a` d'abord, `b` comble ; chaque valeur garde sa source. */
function fusion(a: OccupancyLue, b: OccupancyLue): OccupancyLue {
  return {
    capacity: a.capacity ?? b.capacity,
    capacitySource: a.capacity != null ? a.capacitySource : b.capacitySource,
    bedrooms: a.bedrooms ?? b.bedrooms,
    bedroomsSource: a.bedrooms != null ? a.bedroomsSource : b.bedroomsSource,
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
  while ((m = reVoy.exec(html))) phrases.push(m[0].replace(/"/g, ""));
  while ((m = reCh.exec(html))) phrases.push(m[0].replace(/"/g, ""));
  while ((m = rePers.exec(html))) phrases.push(m[0].replace(/"/g, ""));
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
function chambresDuDescriptif(html: string): number | null {
  const textes: string[] = [];
  const re = /class=["']contenu_descriptif["'][^>]*>([\s\S]*?)<\/span>\s*<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) textes.push(decodeHtml((m[1] ?? "").replace(/<[^>]*>/g, " ")));
  if (textes.length === 0) return null;
  return lireLogement(textes.join(" · ").replace(/\s+/g, " ")).chambresEcrites;
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
    html.match(/capaciteMaximumPossible[^>]*>\s*<span[^>]*\bquantite\b[^>]*>\s*(\d+)/i)?.[1];
  const capTexte = html.match(
    /Capacit[eé][^<]{0,80}(?:<span>[^<]{0,4}<\/span>\s*)?<\/span>[\s\S]{0,280}?(\d+)\s*personnes/i,
  )?.[1];
  const cap = capCritere ?? capTexte;
  if (cap) out = { ...out, capacity: takeGuests(cap), capacitySource: capCritere ? "structured" : "text_regex" };
  const pieces =
    html.match(/GTYPAP-G(\d+)PIEC/i)?.[1] ??
    html.match(/Nombre de pi[eè]ces[\s\S]{0,280}?(\d+)\s*pi[eè]ces/i)?.[1];
  if (pieces) out = { ...out, rooms: takeBeds(pieces) };
  // Le nombre publié (`NBDECHAMBRE-CHAMBRE1`, « 1 chambre »), sinon le
  // décompte des titres `Chambre 1`, `Chambre 2` (`crit_GCHAM1`, `crit_CHAMBRE1`).
  const chPubliees = html.match(/\bNBDECHAMBRE-CHAMBRE(\d+)\b/i)?.[1];
  let maxCh = 0;
  const reCh = /crit_G?CHAM(?:BRE)?(\d+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = reCh.exec(html))) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n > maxCh && n <= MAX) maxCh = n;
  }
  const ch = chPubliees != null ? takeBeds(chPubliees) : maxCh > 0 ? takeBeds(maxCh) : null;
  if (ch != null) out = { ...out, bedrooms: ch, bedroomsSource: "structured" };
  // Sans critère, les chambres écrites dans le descriptif (« 3 chambres (1 lit
  // 1 personne / 1 lit 2 personnes…) », gîtes distribués par la centrale). La
  // capacité ne s'y lit pas : « 2 lits gigognes 1 personne » décrit un lit.
  if (out.bedrooms == null) {
    const chambres = chambresDuDescriptif(html);
    if (chambres != null) out = { ...out, bedrooms: chambres, bedroomsSource: "text_regex" };
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
 * La page d'un logement Airbnb (PDP, `rooms/`) : les quatre champs qu'elle
 * publie, et eux seuls. Règle du propriétaire (1er octobre 2026) : pour
 * Airbnb, c'est la seule source de rattrapage. `personCapacity` est
 * structuré ; `listingLat` et `listingLng` font le point, de provenance `pdp`.
 * `bedroomCount`, quand la page le porte, est structuré ; mesuré le 2 octobre
 * 2026 (dix fiches PDP et une page `rooms/`, Abondance), Airbnb ne le publie
 * pas, et n'écrit les chambres que dans son titre de partage : « N chambres »
 * y vaut `text_regex`, « Studio » le 0 d'un studio (`derived_from_type`),
 * comme le lit déjà `pdp.py`. Ni titre d'annonce, ni description, ni méta :
 * un champ absent reste un trou, que le journal nomme. 0 chambre est un
 * studio ; 0 personne n'est pas une capacité.
 */
export function lectureAirbnb(html: string): LectureFiche {
  let out: LectureFiche = { ...VIDE };
  if (!html) return out;
  const capacite = takeGuests(html.match(/"personCapacity"\s*:\s*(\d+)/)?.[1]);
  if (capacite != null) out = { ...out, capacity: capacite, capacitySource: "structured" };
  const chambres = takeBeds(html.match(/"bedroomCount"\s*:\s*(\d+)/)?.[1]);
  if (chambres != null) out = { ...out, bedrooms: chambres, bedroomsSource: "structured" };
  else {
    const partage = titrePartageAirbnb(html);
    if (partage) {
      const lu = duTexte(partage);
      if (lu.bedrooms != null) out = { ...out, bedrooms: lu.bedrooms, bedroomsSource: lu.bedroomsSource ?? null };
    }
  }
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
  if (!plausible(out.lat, out.lon)) out = mergeLecture(out, sansPointLoueur(fromGpsAttributs(html), loueur));
  if (!plausible(out.lat, out.lon)) out = mergeLecture(out, fromGpsTexte(html, loueur));
  const taxe = taxeSejourSomme(html);
  if (taxe != null) out = { ...out, taxeSejour: out.taxeSejour ?? taxe };
  // Une source sans valeur ne dit rien.
  if (out.capacity == null) out = { ...out, capacitySource: null };
  if (out.bedrooms == null) out = { ...out, bedroomsSource: null };
  return out;
}
