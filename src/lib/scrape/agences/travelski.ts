/**
 * Travelski : voyagiste du ski (groupe Travelfactory), www.travelski.com.
 *
 * Partie pure : requêtes, lecture des réponses, annonces, sans réseau. Le
 * relevé est dans `travelski.server.ts`, le lieu du catalogue pour chaque
 * station Skitrack dans `couverture.ts`.
 *
 * Étude du 26 septembre 2026 (Avoriaz, 6→13/02/2027, 2 adultes puis 6
 * personnes ; La Plagne) :
 * - la recherche passe par l'API JSON que la page de résultats appelle,
 *   `POST https://api.travelski.com/se/search/product`, en HTTP simple, sans
 *   cookie ni jeton. Le `robots.txt` de l'API autorise `/se/search/` ;
 * - une résidence (« lihe ») porte ses offres (`prestations`) : un logement y
 *   revient une fois par formule, même `id`. `HS` hébergement seul, `PF`
 *   hébergement + forfait, `PFP` hébergement + forfait + matériel ;
 * - en hébergement seul, `pricePerLogement` est le prix du logement aux dates,
 *   hors frais de service : le site ajoute 24 € par réservation et affiche
 *   « Frais de service inclus ». La taxe de séjour et la caution se paient sur
 *   place ;
 * - forfait compris, `pricePerLogement` vaut `pricePerPerson` × `capacity` :
 *   un forfait par place du logement, quel que soit le nombre de voyageurs.
 *   Le prix exact d'un groupe plus petit n'est publié que par un second appel
 *   (`/wiyp/price`), une requête par résidence et par formule, que le
 *   robots.txt de l'API exclut : il n'est pas fait. Le total n'est donc
 *   exact que si le groupe remplit le logement ; `skipass` est le nombre de
 *   jours de forfait, « du plus petit domaine » selon le site ;
 * - la position, les chambres et les pièces ne sont que sur la fiche de la
 *   résidence (340 à 435 Ko), dans la ligne `window.lihe = {…};`. Elles ne
 *   changent pas avec les dates : le relevé les garde (mémoire des fiches).
 */

import type { Listing } from "@/lib/listings";
import type { LiveSearchInput } from "../types";

export const TRAVELSKI_SITE = "https://www.travelski.com";
export const TRAVELSKI_API = "https://api.travelski.com";
/** Le moteur de www.travelski.com (`engineId` de la page de résultats). */
const MOTEUR = 1;
/** Résidences par page : le site en demande 20, l'API en rend 100. */
export const TAILLE_PAGE = 100;
/** Borne de sûreté : La Plagne, la plus grande, en a quatre. */
export const PAGES_MAX = 6;
/** La capacité la plus haute que le site demande (`MAX_PARTICIPANTS`). */
const CAPACITE_MAX = 20;
/** Frais de service par réservation, « Fixed Fees ». */
export const FRAIS_DE_SERVICE = 24;

/* ---------- Lieu ---------- */

/** Un lieu du catalogue : la clé du corps de recherche, et ses identifiants. */
export type LieuTravelski = { cle: "station" | "parentStation"; ids: readonly number[] };

/** Le lieu de `couverture.ts` : « station:96,27 » ou « parentStation:5 ». */
export function lieuTravelski(lieu: string): LieuTravelski {
  const m = /^(station|parentStation):(\d{1,7}(?:,\d{1,7})*)$/.exec(lieu);
  if (!m) throw new Error("lieu illisible");
  return { cle: m[1] as LieuTravelski["cle"], ids: m[2].split(",").map(Number) };
}

/* ---------- Requêtes ---------- */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Le nombre de voyageurs, entre 1 et 20. */
export function voyageurs(input: Pick<LiveSearchInput, "guests">): number {
  const n = Math.trunc(Number(input.guests));
  return Number.isFinite(n) ? Math.min(CAPACITE_MAX, Math.max(1, n)) : 1;
}

/**
 * Le corps de la recherche, comme la page de résultats le construit : les
 * capacités acceptées vont du nombre de voyageurs à 20 ; `packages` retient
 * les résidences qui vendent au moins une de ces formules (avec `HS` seul,
 * deux résidences d'Avoriaz vendues seulement forfait compris manquaient).
 */
export function corpsRecherche(input: LiveSearchInput, lieu: LieuTravelski) {
  if (!DATE.test(input.checkIn) || !DATE.test(input.checkOut)) throw new Error("dates illisibles");
  if (input.checkOut <= input.checkIn) throw new Error("dates dans le désordre");
  const n = voyageurs(input);
  return {
    engineId: MOTEUR,
    beginDate: input.checkIn,
    endDate: input.checkOut,
    [lieu.cle]: [...lieu.ids],
    capacity: Array.from({ length: CAPACITE_MAX - n + 1 }, (_, i) => n + i),
    packages: ["HS", "PF", "PFP"],
    criteria: [] as string[],
  };
}

/** L'adresse d'une page de résultats : `start` est le numéro de page, à partir de 0. */
export function urlRecherche(page: number): string {
  return `${TRAVELSKI_API}/se/search/product?size=${TAILLE_PAGE}&start=${Math.max(0, Math.trunc(page) || 0)}&agg=lihePack`;
}

/** L'adresse de la fiche, depuis le `productPageUrl` relatif de la recherche. */
export function urlFiche(lien: string | null | undefined): string | null {
  if (typeof lien !== "string" || !/^\/[a-z0-9][a-z0-9/_-]*$/i.test(lien) || lien.includes("//")) return null;
  return `${TRAVELSKI_SITE}${lien}`;
}

/* ---------- Lecture ---------- */

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function texte(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim() : null;
}

function nombre(v: unknown): number | null {
  const n =
    typeof v === "number" ? v : typeof v === "string" && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(v) ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
}

function entier(v: unknown, max = 50): number | null {
  const n = nombre(v);
  return n != null && Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

function prix(v: unknown): number | null {
  const n = nombre(v);
  return n != null && n > 0 && n < 1_000_000 ? n : null;
}

function date(v: unknown): string | null {
  return typeof v === "string" && DATE.test(v) ? v : null;
}

function url(v: unknown): string | null {
  return typeof v === "string" && /^https:\/\/[^\s"<>]+$/.test(v) ? v : null;
}

export type OffreTravelski = {
  /** L'identifiant du logement, le même pour ses trois formules. */
  id: string;
  /** `HS`, `PF`, `PFP`, ou une formule avec transport (`PFTTF`, `HTTF`…). */
  formule: string;
  nom: string;
  capacite: number | null;
  typeCode: string | null;
  /** `pricePerLogement` : le logement seul en HS, la capacité pleine forfait compris ; hors frais. */
  prixLogement: number | null;
  debut: string | null;
  fin: string | null;
  nuits: number | null;
  /** `skipass` : jours de forfait (0 en HS). */
  joursForfait: number | null;
};

export type ResidenceTravelski = {
  liheId: string;
  nom: string;
  station: string | null;
  typeCode: string | null;
  /** `productPageUrl`, relatif. */
  lien: string | null;
  image: string | null;
  note: number | null;
  avis: number | null;
  offres: OffreTravelski[];
};

function lireOffre(v: unknown): OffreTravelski | null {
  const o = obj(v);
  const id = texte(o?.id);
  const formule = texte(o?.codePackage)?.toUpperCase() ?? null;
  if (!o || !id || !/^\d+$/.test(id) || !formule) return null;
  return {
    id,
    formule,
    nom: texte(o.name) ?? "",
    capacite: entier(o.capacity),
    typeCode: texte(o.lodgingType),
    prixLogement: prix(o.pricePerLogement),
    debut: date(o.startDate),
    fin: date(o.endDate),
    nuits: entier(o.duration, 60),
    joursForfait: entier(o.skipass, 30),
  };
}

/** Une page de recherche : ses résidences, le nombre annoncé, le nombre de pages. */
export function lireRecherche(json: unknown): {
  residences: ResidenceTravelski[];
  total: number | null;
  pages: number | null;
  recues: number;
} {
  const r = obj(json);
  const produits = Array.isArray(r?.products) ? r.products : [];
  const residences: ResidenceTravelski[] = [];
  for (const v of produits) {
    const p = obj(v);
    const liheId = texte(p?.liheId);
    const nom = texte(p?.name);
    if (!p || !liheId || !/^\d+$/.test(liheId) || !nom) continue;
    const offres = (Array.isArray(p.prestations) ? p.prestations : [])
      .map(lireOffre)
      .filter((o): o is OffreTravelski => o != null);
    const avis = entier(p.reviewNumber, 100_000);
    const note = nombre(p.averageRating);
    residences.push({
      liheId,
      nom,
      station: texte(p.stationName),
      typeCode: texte(p.lodgingType),
      lien: texte(p.productPageUrl),
      image: url(p.image) ?? url(p.imageMedium),
      note: note != null && note > 0 && note <= 5 ? note : null,
      avis: avis && avis > 0 ? avis : null,
      offres,
    });
  }
  return {
    residences,
    total: entier(r?.totalProducts, 100_000),
    pages: entier(r?.pageCount, 10_000),
    recues: produits.length,
  };
}

export type LogementFiche = { id: string; chambres: number | null; pieces: number | null; capacite: number | null };

export type FicheTravelski = {
  liheId: string;
  lat: number | null;
  lon: number | null;
  logements: Map<string, LogementFiche>;
};

/** « 46.188055, 6.775888 » → un point plausible, ou rien. */
export function lirePosition(v: unknown): { lat: number; lon: number } | null {
  const m = typeof v === "string" ? v.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/) : null;
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

/**
 * La fiche : la ligne `window.lihe = {…};`, un JSON d'un seul tenant. Rend la
 * position de la résidence et, par logement (`prestationId`), chambres, pièces
 * et capacité. `null` si la ligne manque ou ne se lit pas.
 */
export function lireFiche(html: string): FicheTravelski | null {
  const m = typeof html === "string" ? html.match(/^\s*window\.lihe\s*=\s*(\{.*\})\s*;?\s*$/m) : null;
  if (!m) return null;
  let lihe: Record<string, unknown> | null;
  try {
    lihe = obj(JSON.parse(m[1]));
  } catch {
    return null;
  }
  const liheId = texte(lihe?.id);
  if (!lihe || !liheId) return null;
  const point = lirePosition(lihe.geolocalisation);
  const logements = new Map<string, LogementFiche>();
  for (const v of Array.isArray(lihe.prestations) ? lihe.prestations : []) {
    const p = obj(v);
    const id = texte(p?.prestationId);
    if (!p || !id) continue;
    logements.set(id, { id, chambres: entier(p.numberOfBedrooms), pieces: entier(p.numberOfRooms), capacite: entier(p.capacity) });
  }
  return { liheId, lat: point?.lat ?? null, lon: point?.lon ?? null, logements };
}

/* ---------- Ce qui est gardé ---------- */

/** Les libellés du site (`lodgingType`, traductions françaises du script de recherche). */
const LIBELLES_TYPE: Readonly<Record<string, string>> = {
  "18": "Chalet",
  "19": "Résidence de Tourisme",
  "22": "Hôtel",
  "23": "Clubs Vacances",
  "40": "Appartement de particulier",
  "43": "Résidence de Tourisme",
  "44": "Chalet Premium",
  "45": "Appartement de particulier",
};

/**
 * Types gardés, en liste blanche : chalets, résidences de tourisme,
 * appartements de particulier. Écartés : « Hôtel » (22) et « Clubs Vacances »
 * (23, chambres « All inclusive » ou « Demi-pension »), et tout code inconnu.
 */
const TYPES_GARDES: ReadonlySet<string> = new Set(["18", "19", "40", "43", "44", "45"]);

export function typeGarde(code: string | null | undefined): boolean {
  return code != null && TYPES_GARDES.has(code);
}

/** Les libellés des formules, avec les mots du site. */
const LIBELLES_FORMULE: Readonly<Record<string, string>> = {
  HS: "Hébergement",
  PF: "Hébergement + Skipass",
  PFP: "Hébergement + Skipass + Matériel",
};

/** L'offre forfait compris d'un logement : `PF`, sinon `PFP`. Les formules avec transport ne sont jamais rendues. */
const FORFAITS: readonly string[] = ["PF", "PFP"];

/** Chambres et pièces écrites dans le nom du logement : « Studio », « 3 pièces », « 1 chambre ». */
export function lireNomLogement(nom: string): { chambres: number | null; pieces: number | null } {
  const t = nom.toLowerCase();
  if (/^\s*studio\b/.test(t)) return { chambres: 0, pieces: 1 };
  const p = t.match(/\b(\d{1,2})\s*pi[eè]ces?\b/);
  const c = t.match(/\b(\d{1,2})\s*chambres?\b/);
  return { chambres: c ? Number(c[1]) : null, pieces: p ? Number(p[1]) : null };
}

/** Une offre vendable aux dates demandées, dans un type gardé, à la bonne capacité. */
function offreValable(o: OffreTravelski, r: ResidenceTravelski, input: LiveSearchInput): boolean {
  if (o.debut !== input.checkIn || o.fin !== input.checkOut) return false;
  if (o.capacite != null && o.capacite < voyageurs(input)) return false;
  return typeGarde(o.typeCode ?? r.typeCode);
}

/** Pour chaque logement gardé : son offre d'hébergement seul, et son offre forfait compris (`PF`, sinon `PFP`). */
export function offresRetenues(
  r: ResidenceTravelski,
  input: LiveSearchInput,
): Array<{ id: string; seule: OffreTravelski | null; forfait: OffreTravelski | null }> {
  const parLogement = new Map<string, OffreTravelski[]>();
  for (const o of r.offres) {
    if (!offreValable(o, r, input)) continue;
    parLogement.set(o.id, [...(parLogement.get(o.id) ?? []), o]);
  }
  const out: Array<{ id: string; seule: OffreTravelski | null; forfait: OffreTravelski | null }> = [];
  for (const [id, offres] of parLogement) {
    const seule = offres.find((o) => o.formule === "HS") ?? null;
    const forfait = FORFAITS.map((f) => offres.find((o) => o.formule === f)).find((o) => o != null) ?? null;
    if (seule || forfait) out.push({ id, seule, forfait });
  }
  return out;
}

/* ---------- Annonces ---------- */

/** « 5 184 € » : milliers séparés par une espace. */
function euros(n: number): string {
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} €`;
}

/** « 2027-02-06 » → « 06/02/2027 », comme dans les liens du site. */
function jjmmaaaa(d: string): string {
  return d.split("-").reverse().join("/");
}

/**
 * Le lien que la page de résultats construit : la fiche, avec en fragment la
 * formule, la saison, le logement et les dates (le fragment ne part pas au
 * serveur).
 */
export function lienOffre(r: Pick<ResidenceTravelski, "lien">, o: OffreTravelski): string | null {
  const base = urlFiche(r.lien);
  if (!base) return null;
  if (!o.debut || !o.fin) return base;
  const mois = Number(o.debut.slice(5, 7));
  const saison = [10, 11, 12, 1, 2, 3, 4].includes(mois) ? "H" : "E";
  return `${base}#packCode=${o.formule}&season=${saison}&prest_id_source=${o.id}&BeginDate=${jjmmaaaa(o.debut)}&EndDate=${jjmmaaaa(o.fin)}&dated=1`;
}

/**
 * Le total et son libellé. Hébergement seul : `pricePerLogement` + 24 € de
 * frais de service. Forfait compris : le prix de la recherche ne vaut que pour
 * la capacité pleine du logement : exact si le groupe la remplit, sinon non
 * publié pour ce groupe (`total: 0`), et le libellé dit ce que le site publie.
 */
export function prixOffre(o: OffreTravelski, input: LiveSearchInput): { total: number; priceLabel: string | null } {
  const n = voyageurs(input);
  if (o.formule === "HS") {
    const total = o.prixLogement != null ? Math.round(o.prixLogement) + FRAIS_DE_SERVICE : 0;
    const nuits = o.nuits ? `, ${o.nuits} nuits` : "";
    return { total, priceLabel: total ? `${LIBELLES_FORMULE.HS}${nuits}, frais de service inclus` : null };
  }
  const forfait = o.joursForfait ? `forfait ${o.joursForfait} jours du plus petit domaine` : "forfait du plus petit domaine";
  const formule = LIBELLES_FORMULE[o.formule] ?? o.formule;
  if (o.prixLogement != null && o.capacite != null && o.capacite === n) {
    return {
      total: Math.round(o.prixLogement) + FRAIS_DE_SERVICE,
      priceLabel: `${formule} : ${forfait} pour ${n} personne${n > 1 ? "s" : ""}, frais de service inclus`,
    };
  }
  if (o.prixLogement == null || o.capacite == null) return { total: 0, priceLabel: `${formule} : ${forfait}` };
  return {
    total: 0,
    priceLabel: `${formule} : ${forfait} pour ${o.capacite} personnes, ${euros(o.prixLogement)} hors frais de service (prix pour ${n} personne${n > 1 ? "s" : ""} non publié)`,
  };
}

/**
 * Les annonces d'une résidence. Un logement vendu seul et forfait compris rend
 * deux annonces : `tsk-<id>` (hébergement seul) et `tsk-<id>-forfait` ; vendu
 * seulement forfait compris, une seule, `tsk-<id>`. Hôtels, clubs, formules
 * avec transport, dates ou capacité qui ne conviennent pas : rien. La position
 * vient de la fiche, quand elle a été lue.
 */
export function travelskiListings(r: ResidenceTravelski, fiche: FicheTravelski | null, input: LiveSearchInput): Listing[] {
  const f = fiche && fiche.liheId === r.liheId ? fiche : null;
  const out: Listing[] = [];
  for (const { id, seule, forfait } of offresRetenues(r, input)) {
    const offres: Array<[OffreTravelski, string]> = [];
    if (seule) offres.push([seule, `tsk-${id}`]);
    if (forfait) offres.push([forfait, seule ? `tsk-${id}-forfait` : `tsk-${id}`]);
    for (const [o, idAnnonce] of offres) {
      const logement = f?.logements.get(o.id) ?? null;
      const nom = lireNomLogement(o.nom);
      const { total, priceLabel } = prixOffre(o, input);
      const code = o.typeCode ?? r.typeCode;
      out.push({
        id: idAnnonce,
        stationId: input.stationId,
        title: o.nom && o.nom !== r.nom ? `${r.nom} — ${o.nom}` : r.nom,
        source: "Travelski",
        total,
        currency: "EUR",
        guests: o.capacite,
        bedrooms: logement?.chambres ?? nom.chambres,
        rooms: logement?.pieces ?? nom.pieces,
        propertyType: code ? (LIBELLES_TYPE[code] ?? null) : null,
        available: true,
        photo: r.image,
        photos: r.image ? [r.image] : null,
        url: lienOffre(r, o),
        lat: f?.lat ?? null,
        lon: f?.lon ?? null,
        locality: r.station,
        placeName: r.nom,
        priceLabel,
        priceIndicative: total > 0 ? false : null,
        skiPassIncluded: o.formule !== "HS",
        platformId: o.id,
        rating: r.avis ? r.note : null,
        reviewCount: r.avis,
        proven: `Travelski live ${input.checkIn}→${input.checkOut}`,
      });
    }
  }
  return out;
}
