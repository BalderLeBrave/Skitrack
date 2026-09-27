/**
 * Ovo Network : chalets, appartements et villas de particuliers, loués en
 * direct sur www.ovonetwork.com (www.ovo-network.com, avec un tiret, est une
 * autre zone Cloudflare qui ne sert qu'un défi).
 *
 * Partie pure : URL de la recherche, lecture de sa réponse JSON, annonces. Le
 * relevé lui-même est dans `ovo.server.ts`, les destinations de chaque station
 * dans `couverture.ts`.
 *
 * Étude du 26 septembre 2026 (La Clusaz, 6→13/02/2027, 2 puis 6 adultes) :
 * - les pages HTML (fiches comprises) sont derrière un défi Cloudflare pour un
 *   `fetch` de Node. L'API de la recherche, `/ajax?action=web/portal/search`,
 *   celle que la page appelle, répond en JSON à un simple `fetch`, sans cookie
 *   ni jeton. robots.txt ne l'interdit pas (sa ligne `# Disallow: /ajax` est
 *   commentée) ;
 * - `pageSize=500` rend toute une destination en une requête ;
 * - chaque bien y porte son total aux dates (loyer, ménage et linge, frais de
 *   réservation, et taxe de séjour quand `tax_sej_incl`), sa capacité, ses
 *   chambres, ses salles de bain, son point GPS, ses photos et son lien ; le
 *   type se lit dans la rubrique du lien (`/chalets/`, `/appartements/`,
 *   `/villas/`) ;
 * - quand les dates demandées ne tombent pas sur les jours d'arrivée du bien,
 *   le site propose d'autres dates : `date_from`, `date_to` et `price` sont
 *   alors ceux de la proposition, et les dates demandées sont rangées dans
 *   `orig_dates`, avec leur prix et leur disponibilité. C'est lui qui fait foi ;
 * - le site ne vend que l'hébergement : ni forfait de ski, ni hôtel, ni
 *   chambre d'hôtes. `skiPassIncluded` vaut `false` partout.
 */

import type { Listing } from "@/lib/listings";
import type { LiveSearchInput } from "../types";

export const OVO_SITE = "https://www.ovonetwork.com";
/** L'appel que fait la page de recherche du site. */
export const OVO_RECHERCHE = `${OVO_SITE}/ajax?action=web/portal/search`;
/** Plus que tout le catalogue (267 biens le 26 septembre 2026) : une page suffit. */
export const TAILLE_PAGE = 500;

/**
 * Les filtres que la page envoie, dans son ordre, avec leurs valeurs neutres
 * (`OVO.filter_defaults` de /fr/rechercher, relevés le 26 septembre 2026). On
 * les envoie tous, comme le site : rien de ce qu'il n'envoie pas.
 */
const FILTRES_NEUTRES: ReadonlyArray<readonly [string, string]> = [
  ["df", "0"], ["dt", "0"], ["noocc", "0"], ["accueilvelo", "0"], ["activity", "0"], ["aircon", "0"],
  ["amazing_view", "0"], ["baby", "0"], ["bathrooms", "0"], ["bbq", "0"], ["bedrooms", "0"], ["business", "0"],
  ["car_charger", "0"], ["cap_max", "0"], ["cap_min", "0"], ["cinema", "0"], ["cool", "0"], ["couples", "0"],
  ["cycling", "0"], ["dest_linked", "1"], ["destination", "0"], ["dist_piste", "0"], ["dist_town", "0"],
  ["fast_internet", "0"], ["fire", "0"], ["gym", "0"], ["hammam", "0"], ["hero", ""], ["hot_tub", "0"],
  ["kids", "0"], ["lux", "0"], ["multi_pass", "0"], ["nocache", "0"], ["offer", "0"], ["parking", "0"],
  ["petanque", "0"], ["pets", "0"], ["playarea", "0"], ["pool", "0"], ["price_max", "0"], ["price_min", "0"],
  ["price_range", "0"], ["prop_ids", "0"], ["prop_type", "0"], ["remote_work", "0"], ["sauna", "0"],
  ["season", "0"], ["secluded", "0"], ["walk", "0"], ["wellness", "0"], ["wine_cellar", "0"], ["workspace", "0"],
  ["sort", "0"], ["lang", "fr"], ["adults", "0"], ["children", "0"], ["babies", "0"],
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function sejour(input: LiveSearchInput): { du: string; au: string; adultes: string } {
  if (!DATE.test(input.checkIn) || !DATE.test(input.checkOut) || input.checkIn >= input.checkOut) {
    throw new Error("dates illisibles");
  }
  // Tous adultes : la taxe de séjour se compte par adulte et par nuit, et
  // Skitrack ne distingue pas les enfants.
  return { du: input.checkIn, au: input.checkOut, adultes: String(Math.max(1, Math.trunc(input.guests))) };
}

function destinationLue(destination: string): string {
  if (!/^\d{1,5}$/.test(destination)) throw new Error("destination illisible");
  return destination;
}

/**
 * La recherche d'une destination aux dates, pour ces voyageurs : tous les
 * biens réservables, ou que le site propose à d'autres dates proches, en une
 * page. Sans les destinations voisines que le site rattache d'office (La
 * Clusaz : Manigod, Thônes, La Giettaz…) : `couverture.ts` dit ce qui revient
 * à chaque station. Les sous-destinations viennent toujours.
 */
export function urlRecherche(input: LiveSearchInput, destination: string): string {
  const s = sejour(input);
  const valeurs: Record<string, string> = {
    df: s.du,
    dt: s.au,
    noocc: s.adultes,
    adults: s.adultes,
    children: "0",
    babies: "0",
    dest_linked: "0",
    destination: destinationLue(destination),
  };
  const q = new URLSearchParams();
  for (const [k, neutre] of FILTRES_NEUTRES) q.set(k, valeurs[k] ?? neutre);
  q.set("hold_uids", "");
  return `${OVO_RECHERCHE}&page=0&pageSize=${TAILLE_PAGE}&${q}`;
}

/** Les en-têtes de l'appel, hors `User-Agent` : ceux de la page de recherche d'où il part. */
export function entetesRecherche(input: LiveSearchInput, destination: string): Record<string, string> {
  const s = sejour(input);
  const q = new URLSearchParams({
    destination: destinationLue(destination),
    dest_linked: "0",
    df: s.du,
    dt: s.au,
    noocc: s.adultes,
    adults: s.adultes,
    children: "0",
    babies: "0",
  });
  return { accept: "*/*", referer: `${OVO_SITE}/fr/rechercher?${q}` };
}

/* ---------- Lecture ---------- */

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function texte(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim() : null;
}

/** Un entier publié en nombre ou en chaîne (« 4 »). */
function entier(v: unknown, max = 60): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

/** Un montant positif, au centime (« 4108.6 », 4108.6) ; « » ou 0 : pas de prix. */
function montant(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+(?:\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function coord(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Le type, d'après la rubrique du lien : c'est elle que le filtre `prop_type` du site suit. */
const TYPES: Readonly<Record<string, string>> = { chalets: "Chalet", appartements: "Appartement", villas: "Villa" };

export function typeDuChemin(chemin: string | null): string | null {
  const rubrique = chemin?.match(/^\/[a-z]{2}\/([a-z-]+)\//)?.[1];
  return rubrique ? (TYPES[rubrique] ?? null) : null;
}

/**
 * Une photo, au format des vignettes du site (`img_path` + nom de la diapo,
 * paramètres imgix de sa fonction de vignette). Les noms sont déjà encodés
 * (« %28 ») : on les colle tels quels.
 */
export function photoUrl(imgPath: string, diapo: string): string {
  return `${imgPath}${diapo}?dpr=2&q=20&auto=format&ixlib=php-4.1.0&fit=crop&w=500&h=375`;
}

export type TaxeOvo = "incluse" | "a-l-arrivee" | "aucune" | null;

export type AutresDates = { du: string; au: string; total: number | null };

export type BienOvo = {
  id: string;
  nom: string;
  /** Tel que publié : « Manigod - La Clusaz » (la commune, puis la station que le site lui rattache). */
  lieu: string | null;
  commune: string | null;
  pays: string | null;
  lat: number | null;
  lon: number | null;
  capacite: number | null;
  chambres: number | null;
  sdb: number | null;
  type: string | null;
  /** Le chemin de la fiche, sans ses paramètres de dates. */
  chemin: string | null;
  photos: string[];
  note: number | null;
  avis: number | null;
  /** Réservable aux dates demandées (pas seulement à celles que le site propose à la place). */
  reservable: boolean;
  /**
   * Total du séjour aux dates demandées, ou `null` s'il n'est pas publié. Le
   * site chiffre aussi des dates qui ne sont pas libres : c'est `reservable`
   * qui dit si c'est une offre.
   */
  total: number | null;
  /** Le prix tel que le site l'écrit (« 8 405 € »). */
  prixAffiche: string | null;
  /** « Tarif sur demande » (`price_type: "enquire"`) : réservable, sans prix. */
  surDemande: boolean;
  /** La taxe de séjour : comprise dans le total, à régler à l'arrivée, ou aucune (la commune n'en lève pas). */
  taxe: TaxeOvo;
  /** Les dates que le site propose à la place des dates demandées, et leur total. */
  autresDates: AutresDates | null;
};

function prixDe(x: Record<string, unknown>): number | null {
  // La règle d'affichage du site : le prix d'offre quand il y en a une.
  return x.is_offer === true && montant(x.offer_price) != null ? montant(x.offer_price) : montant(x.price);
}

function libelleDe(x: Record<string, unknown>): string | null {
  return x.is_offer === true ? (texte(x.offer_price_formatted) ?? texte(x.price_formatted)) : texte(x.price_formatted);
}

function taxeDe(x: Record<string, unknown>, montantTaxe: unknown): TaxeOvo {
  if (x.tax_sej_incl === true) return "incluse";
  if (x.tax_sej_poa === true) return "a-l-arrivee";
  if (x.tax_sej_incl === false && (montantTaxe === "0" || montantTaxe === 0)) return "aucune";
  return null;
}

function photosDe(l: Record<string, unknown>): string[] {
  const base = texte(l.img_path);
  if (!base || !Array.isArray(l.slides)) return [];
  return l.slides.filter((d): d is string => typeof d === "string" && d.trim() !== "").map((d) => photoUrl(base, d.trim()));
}

function lireBien(l: Record<string, unknown>, input: LiveSearchInput): BienOvo | null {
  const id = typeof l.id === "number" && Number.isInteger(l.id) ? String(l.id) : texte(l.id);
  const nom = texte(l.name);
  if (!id || !/^\d+$/.test(id) || !nom) return null;
  const lien = texte(l.site_link);
  const chemin = lien ? lien.split("?")[0] : null;
  const lieu = texte(l.location);
  const note = typeof l.review_rating === "string" || typeof l.review_rating === "number" ? Number(l.review_rating) : NaN;
  const avis = entier(l.review_count, 100_000);
  const surDemande = l.price_type === "enquire";

  // Les dates demandées : `orig_dates` quand le site en propose d'autres, le bien lui-même sinon.
  const orig = obj(l.orig_dates);
  const x = orig ?? l;
  const memes = x.date_from === input.checkIn && x.date_to === input.checkOut;
  const reservable = memes && x.available === true && x.hold !== true;
  const du = texte(l.date_from);
  const au = texte(l.date_to);
  const deplace = orig != null || !memes;

  return {
    id,
    nom,
    lieu,
    commune: lieu ? lieu.split(" - ")[0]?.trim() || null : null,
    pays: texte(l.country),
    lat: coord(l.latitude),
    lon: coord(l.longitude),
    capacite: entier(l.capacity),
    chambres: entier(l.bedrooms),
    sdb: entier(l.bathrooms),
    type: typeDuChemin(chemin),
    chemin,
    photos: photosDe(l),
    note: Number.isFinite(note) && note > 0 && note <= 5 && avis ? note : null,
    avis: avis || null,
    reservable,
    total: surDemande || !memes ? null : prixDe(x),
    prixAffiche: surDemande || !memes ? null : libelleDe(x),
    surDemande,
    taxe: taxeDe(x, l.tax_sej),
    autresDates: deplace && du && au ? { du, au, total: prixDe(l) } : null,
  };
}

/**
 * Les biens d'une réponse de recherche, le compteur qu'elle publie (`total`)
 * et le nombre d'entrées reçues. Une entrée `panel: "combined"` (deux biens
 * vendus ensemble à un grand groupe, jamais vue à l'étude) n'est pas un
 * logement : elle est comptée dans `combines` et laissée.
 */
export function lireRecherche(
  json: unknown,
  input: LiveSearchInput,
): { biens: BienOvo[]; total: number | null; recus: number; combines: number; complet: boolean } {
  const racine = obj(json);
  const liste = Array.isArray(racine?.listings) ? racine.listings : [];
  const total = typeof racine?.total === "number" ? racine.total : null;
  const biens: BienOvo[] = [];
  let combines = 0;
  for (const brut of liste) {
    const l = obj(brut);
    if (!l) continue;
    if (l.panel === "combined") {
      combines++;
      continue;
    }
    const b = lireBien(l, input);
    if (b) biens.push(b);
  }
  return { biens, total, recus: liste.length, combines, complet: total == null || liste.length >= total };
}

/** Plusieurs destinations pour une station (La Clusaz : 1 et 15) : chaque bien une fois. */
export function uniques(pages: ReadonlyArray<ReadonlyArray<BienOvo>>): BienOvo[] {
  const vus = new Map<string, BienOvo>();
  for (const page of pages) for (const b of page) if (!vus.has(b.id)) vus.set(b.id, b);
  return [...vus.values()];
}

/* ---------- Annonces ---------- */

export function lienBien(chemin: string, input: LiveSearchInput): string {
  const s = sejour(input);
  const q = new URLSearchParams({ df: s.du, dt: s.au, adults: s.adultes, children: "0", babies: "0" });
  return `${OVO_SITE}${chemin}?${q}`;
}

/** Les mots du site pour ce que le total comprend. */
const MOTS_TAXE: Readonly<Record<Exclude<TaxeOvo, null>, string>> = {
  incluse: "Taxes et frais inclus",
  "a-l-arrivee": "Taxe de séjour à régler au propriétaire à l'arrivée",
  aucune: "Pas de taxe de séjour",
};

/**
 * Les annonces d'une station : chaque bien réservable aux dates demandées, en
 * France, avec son total exact. Un bien que le site ne propose qu'à d'autres
 * dates n'est pas une offre. Un bien « sur demande » reste, prix non publié
 * (`total: 0`).
 */
export function ovoListings(biens: ReadonlyArray<BienOvo>, input: LiveSearchInput): Listing[] {
  const out: Listing[] = [];
  for (const b of biens) {
    if (!b.reservable || !b.chemin || b.pays !== "FR") continue;
    const mots = b.taxe ? MOTS_TAXE[b.taxe] : null;
    out.push({
      id: `ovo-${b.id}`,
      stationId: input.stationId,
      title: b.nom,
      source: "Ovo Network",
      total: b.total ?? 0,
      currency: "EUR",
      guests: b.capacite,
      bedrooms: b.chambres,
      baths: b.sdb,
      propertyType: b.type,
      available: true,
      photo: b.photos[0] ?? null,
      photos: b.photos.length ? b.photos : null,
      url: lienBien(b.chemin, input),
      lat: b.lat,
      lon: b.lon,
      locality: b.commune,
      placeName: b.lieu,
      priceLabel: b.surDemande
        ? "Pas de tarif, merci de nous contacter"
        : b.prixAffiche
          ? mots
            ? `${b.prixAffiche} · ${mots}`
            : b.prixAffiche
          : null,
      priceIndicative: b.total == null ? null : false,
      // Le site ne vend que l'hébergement : le total ne comprend jamais de forfait.
      skiPassIncluded: false,
      platformId: b.id,
      rating: b.note,
      reviewCount: b.avis,
      proven: `Ovo Network live ${input.checkIn}→${input.checkOut}`,
    });
  }
  return out;
}
