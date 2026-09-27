/**
 * Mountain Collection : les locations (appartements, studios, chalets) des
 * agences Mountain Collection Immobilier, réseau de la Compagnie des Alpes,
 * vendues sur www.mountaincollection.com par Travelfactory SAS.
 *
 * Partie pure : requêtes et lecture des réponses, sans réseau. Le relevé est
 * dans `mountainCollection.server.ts`, la zone du site pour chaque station
 * Skitrack dans `couverture.ts`.
 *
 * Étude du 26 septembre 2026 (Les 2 Alpes, 6→13/02/2027, 2 puis 6 adultes ;
 * La Plagne, Tignes, Val Thorens pour la pagination et les forfaits) :
 * - la recherche passe par l'API du site, `POST
 *   https://ws.mountaincollection.com/search` (JSON), celle que sa page de
 *   recherche appelle. Elle répond en HTTP simple, sans cookie ni jeton ;
 *   Imperva, devant, n'a opposé aucun défi en 58 requêtes. Le robots.txt de
 *   www n'interdit que /booking, /auth, /settings, /account et /login ;
 * - 30 logements par page, jamais plus ; le total est `nbProduct` ;
 * - chaque logement porte son total exact aux dates (`depart.prix`), sa
 *   capacité, ses pièces, ses chambres, ses salles de bain, son type, sa
 *   position, ses photos. Les lits, seuls, ne sont que dans la fiche ;
 * - `depart.prix` = hébergement + 24 € de frais de dossier. La taxe de séjour
 *   n'y est pas : elle se règle sur place ;
 * - deux formules, une recherche chacune : l'hébergement seul, et la
 *   « Formule ski » (hébergement et un forfait par voyageur, 6 jours), qui
 *   donne une seconde annonce du même logement. La réponse dit elle-même ce
 *   qu'elle comprend (`depart.options_selected`). La formule ski ne se vend
 *   que par semaine de 7 nuits : à d'autres dates, sa recherche rend 0 ;
 * - le site vend des semaines (7, 14, 21 nuits) ; des dates non vendues
 *   rendent 0 logement, sans dates voisines.
 */

import type { Listing } from "@/lib/listings";
import type { LiveSearchInput } from "../types";

export const MC_SITE = "https://www.mountaincollection.com";
export const MC_API = "https://ws.mountaincollection.com";
export const MC_RECHERCHE = `${MC_API}/search`;
/** Le serveur rend 30 logements par page, quel que soit `per_page`. */
export const MC_PAR_PAGE = 30;

/**
 * Les formules relevées, par leur identifiant de lien (`package_id`) :
 * l'hébergement seul, et la « Formule ski ». La « Formule tout compris »
 * (avec le matériel) n'est jamais demandée.
 */
export type FormuleMC = "hebergement" | "hebergement_forfait";
const PAQUETS: Readonly<Record<FormuleMC, readonly string[]>> = {
  hebergement: ["hebergement"],
  hebergement_forfait: ["hebergement", "forfait"],
};

/* ---------- Requêtes ---------- */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ZONE = /^zte_\d+$/;

function dates(input: LiveSearchInput): { debut: string; fin: string } {
  if (!DATE.test(input.checkIn) || !DATE.test(input.checkOut)) throw new Error("dates illisibles");
  if (input.checkOut <= input.checkIn) throw new Error("départ avant l'arrivée");
  return { debut: input.checkIn, fin: input.checkOut };
}

function adultes(input: LiveSearchInput): number {
  const n = Math.trunc(input.guests);
  if (!Number.isFinite(n) || n < 1 || n > 50) throw new Error("voyageurs illisibles");
  return n;
}

/** Le nombre de nuits du séjour demandé. */
export function nuitsDe(input: LiveSearchInput): number {
  const { debut, fin } = dates(input);
  return Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000);
}

/** La formule ski ne se vend que par semaine de 7 nuits : ailleurs, sa recherche rend 0. */
export function formuleSkiPossible(input: LiveSearchInput): boolean {
  return nuitsDe(input) === 7;
}

/**
 * Le corps de la recherche, champ pour champ celui du site : une zone, des
 * dates, des adultes, une formule, une page de 30.
 */
export function corpsRecherche(input: LiveSearchInput, zone: string, page = 1, formule: FormuleMC = "hebergement") {
  if (!ZONE.test(zone)) throw new Error("zone illisible");
  const p = Math.trunc(page);
  if (!Number.isFinite(p) || p < 1) throw new Error("page illisible");
  const { debut, fin } = dates(input);
  return {
    lang: "fr",
    broker_code: "mci",
    page: p,
    modeResidence: false,
    sortBy: "ranking:desc",
    per_page: MC_PAR_PAGE,
    id: zone,
    dateDebut: debut,
    dateFin: fin,
    package: [...PAQUETS[formule]],
    nbAdult: adultes(input),
    nbChild: 0,
    childrenAges: [] as number[],
    facets: [] as string[],
  };
}

/** L'adresse de la page de recherche du site pour ces critères (Referer). */
export function lienRecherche(input: LiveSearchInput, zone: string, formule: FormuleMC = "hebergement"): string {
  const { debut, fin } = dates(input);
  const q = new URLSearchParams({ id: zone, date_in: debut, date_out: fin, package_id: formule, pax: String(adultes(input)) });
  return `${MC_SITE}/fr/search?${q}`;
}

/** Les en-têtes de l'appel, hors `User-Agent` : ceux que le navigateur envoie. */
export function entetesRecherche(input: LiveSearchInput, zone: string, formule: FormuleMC = "hebergement"): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json, text/plain, */*",
    origin: MC_SITE,
    referer: lienRecherche(input, zone, formule),
  };
}

/**
 * La page suivante, ou `null` quand c'est fini : la règle du site (rien reçu,
 * ou `nbProduct / 30 <= page`). Sans total publié, on s'arrête.
 */
export function pageSuivante(page: number, total: number | null, recus: number, parPage = MC_PAR_PAGE): number | null {
  if (recus <= 0 || total == null || total / parPage <= page) return null;
  return page + 1;
}

/* ---------- Lecture ---------- */

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function texte(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim() : null;
}

function entier(v: unknown, max = 50): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : Number.NaN;
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

function montant(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function coord(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function photos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((p): p is string => typeof p === "string" && /^https:\/\//.test(p.trim())).map((p) => p.trim());
}

function chaines(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export type DepartMC = {
  debut: string | null;
  fin: string | null;
  /** Le total publié : hébergement (et forfaits) + frais de dossier (`depart.prix`). */
  total: number | null;
  /** L'hébergement seul (`depart.hebergement.prix`). */
  hebergement: number | null;
  /** Le total barré d'une promotion (`depart.prix_barre`), sinon `null`. */
  barre: number | null;
  /** Les options comprises (`options_selected`) : `["hebergement"]` ou `["hebergement","forfait"]`. */
  formules: string[];
};

/**
 * Le total comprend-il les forfaits ? La réponse le dit (`options_selected`) :
 * `["hebergement"]` non, `["hebergement","forfait"]` oui. Autre chose (le
 * matériel, une liste vide) : on ne sait pas.
 */
export function forfaitDeLaFormule(d: Pick<DepartMC, "formules">): boolean | null {
  const f = [...d.formules].sort().join(",");
  if (f === "hebergement") return false;
  if (f === "forfait,hebergement") return true;
  return null;
}

export type ProduitMC = {
  id: number;
  /** Le titre de la fiche (son `h1`) : l'accroche, sinon le libellé. */
  titre: string;
  /** La station ou sous-station du logement : « Tignes 2100 », « Belle Plagne ». */
  lieu: string | null;
  type: string | null;
  capacite: number | null;
  pieces: number | null;
  chambres: number | null;
  sdb: number | null;
  lat: number | null;
  lon: number | null;
  photos: string[];
  note: number | null;
  avis: number | null;
  depart: DepartMC | null;
};

function lireDepart(v: unknown): DepartMC | null {
  const d = obj(v);
  if (!d) return null;
  const total = montant(d.prix);
  const barre = montant(d.prix_barre);
  return {
    debut: texte(d.date_debut),
    fin: texte(d.date_fin),
    total,
    hebergement: montant(obj(d.hebergement)?.prix),
    barre: barre != null && total != null && barre > total ? barre : null,
    formules: chaines(d.options_selected),
  };
}

/** Un logement de la recherche (`results[]`). */
export function lireProduit(v: unknown): ProduitMC | null {
  const r = obj(v);
  const p = obj(r?.produit);
  const id = entier(p?.id, 10_000_000);
  if (!r || !p || id == null || id === 0) return null;
  const titre = texte(p.headline) ?? texte(p.libelle);
  if (!titre) return null;
  const avis = obj(r.avis);
  const nbAvis = entier(avis?.nb, 100_000);
  const note = typeof avis?.note === "number" && avis.note > 0 && avis.note <= 5 ? avis.note : null;
  const g = obj(r.geoloc);
  return {
    id,
    titre,
    lieu: texte(obj(r.resort)?.libelle),
    type: texte(r.type),
    capacite: entier(r.nbPax),
    pieces: entier(r.nbPiece),
    chambres: entier(r.nbChambre),
    sdb: entier(r.nbSdb),
    lat: coord(g?.lat),
    lon: coord(g?.lng),
    photos: photos(r.photos),
    note: nbAvis ? note : null,
    avis: nbAvis ? nbAvis : null,
    depart: lireDepart(r.depart),
  };
}

/**
 * Une page de recherche : ses logements, le total publié (`nbProduct`), et
 * le nombre de résultats reçus — c'est lui qui dit si la page était pleine.
 */
export function lireRecherche(json: unknown): { produits: ProduitMC[]; total: number | null; recus: number } {
  const j = obj(json);
  const bruts = Array.isArray(j?.results) ? j.results : [];
  const produits: ProduitMC[] = [];
  for (const b of bruts) {
    const p = lireProduit(b);
    if (p) produits.push(p);
  }
  return { produits, total: entier(j?.nbProduct, 1_000_000), recus: bruts.length };
}

/* ---------- Annonces ---------- */

/** Le lien de la fiche, tel que la recherche du site l'écrit. */
export function lienFiche(id: number, input: LiveSearchInput, formule: FormuleMC = "hebergement"): string {
  const { debut, fin } = dates(input);
  const q = new URLSearchParams({ pax: String(adultes(input)), package_id: formule, date_in: debut, date_out: fin });
  return `${MC_SITE}/fr/product/${id}?${q}`;
}

/** Ce que couvre le forfait, avec les mots des cartes du site et les participants de sa fiche. */
export function libelleForfait(input: LiveSearchInput): string {
  const n = adultes(input);
  return `Inclus : Forfait · ${n} ${n > 1 ? "Adultes" : "Adulte"}`;
}

/**
 * Types que Skitrack n'a pas à comparer. Le site n'a publié que « Studio »,
 * « Appartement » et « Chalet » (2 304 logements sur 2 305) : la règle ne sert
 * que si un autre type apparaît.
 */
const TYPE_ECARTE = /h[oô]tel|chambre|mobil|camping|dortoir|auberge/i;

/**
 * Pourquoi un logement de la recherche n'est pas une offre aux dates, ou
 * `null` : dates différentes de celles demandées, formule inconnue (le
 * matériel), type écarté, total non publié.
 */
export function motifEcart(p: ProduitMC, input: LiveSearchInput): string | null {
  const d = p.depart;
  if (!d || d.debut !== input.checkIn || d.fin !== input.checkOut) return "autres dates";
  if (forfaitDeLaFormule(d) == null) return "formule inconnue";
  if (p.type && TYPE_ECARTE.test(p.type)) return "type écarté";
  if (d.total == null) return "total non publié";
  return null;
}

function euros(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR").replace(/\s/g, " ")} €`;
}

/**
 * Les logements d'une recherche, en annonces datées. L'hébergement seul et la
 * formule ski d'un même logement donnent deux annonces : `mc-2338` et
 * `mc-2338-forfait`, même `platformId`, deux totaux.
 */
export function mcListings(produits: readonly ProduitMC[], input: LiveSearchInput): Listing[] {
  const out: Listing[] = [];
  for (const p of produits) {
    if (motifEcart(p, input)) continue;
    const d = p.depart as DepartMC;
    const forfait = forfaitDeLaFormule(d) === true;
    const formule: FormuleMC = forfait ? "hebergement_forfait" : "hebergement";
    const total = d.total as number;
    // Le prix barré d'une promotion, avec les montants du site.
    const barre = d.barre != null ? `${euros(total)} au lieu de ${euros(d.barre)}` : null;
    out.push({
      id: forfait ? `mc-${p.id}-forfait` : `mc-${p.id}`,
      stationId: input.stationId,
      title: p.titre,
      source: "Mountain Collection",
      total,
      currency: "EUR",
      guests: p.capacite,
      bedrooms: p.chambres,
      rooms: p.pieces,
      baths: p.sdb,
      propertyType: p.type,
      available: true,
      photo: p.photos[0] ?? null,
      photos: p.photos.length ? p.photos : null,
      url: lienFiche(p.id, input, formule),
      lat: p.lat,
      lon: p.lon,
      locality: p.lieu,
      placeName: p.lieu,
      skiPassIncluded: forfait,
      priceLabel: forfait ? [libelleForfait(input), barre].filter(Boolean).join(" · ") : barre,
      priceIndicative: false,
      platformId: String(p.id),
      rating: p.note,
      reviewCount: p.avis,
      proven: `Mountain Collection live ${input.checkIn}→${input.checkOut}`,
    });
  }
  return out;
}
