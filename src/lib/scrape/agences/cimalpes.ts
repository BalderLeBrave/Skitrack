/**
 * Cimalpes : agence de location de chalets et d'appartements haut de gamme,
 * publiés sur cimalpes.com (18 stations de location : Tarentaise, Mont-Blanc,
 * Portes du Soleil, Oisans, Beaufortain, Serre Chevalier).
 *
 * Partie pure : URL de recherche, lecture de sa réponse, annonces. Le relevé
 * est dans `cimalpes.server.ts`, la station et les secteurs du site pour
 * chaque station Skitrack dans `couverture.ts`.
 *
 * Étude du 26 septembre 2026 (Val Thorens, 6→13/02/2027, 2 puis 6 voyageurs) :
 * - la recherche passe par la page de résultats en mode AJAX
 *   (`/fr/recherche-location/?…&ajax=1`), qui répond en HTTP simple, sans
 *   jeton ni cookie, un JSON `{ html, total }` servi en `text/html`. Le
 *   robots.txt exclut la recherche et les fiches datées : la politique du
 *   dépôt (robots lu, journalisé, extraction quand même) est celle du
 *   propriétaire ;
 * - les dates s'écrivent jj/mm/aaaa : en ISO, le serveur répond 500 ;
 * - 26 logements par page, `page_nb` de 1 à ⌈total / 26⌉ ;
 * - chaque carte publie le total du séjour aux dates (« /semaine » pour
 *   7 nuits, « /séjour » sinon) : loyer, charges et frais de dossier compris,
 *   taxe de séjour et forfaits de ski en sus. Aucun séjour n'est vendu forfait
 *   compris ;
 * - quand la station a peu de résultats, le site ajoute « D’autres séjours à
 *   proximité pourraient vous intéresser » : des logements d'autres stations,
 *   hors `total`, qu'on coupe ;
 * - la position n'est que dans la fiche (« Latitude : … »), que le lecteur
 *   générique de la complétion lit (`stay/priseFiche.ts`).
 */

import type { Listing } from "@/lib/listings";
import type { LiveSearchInput } from "../types";
import { annoncer, champsLogement } from "../../stay/occupancy.ts";

export const CIMALPES_SITE = "https://cimalpes.com";
const RECHERCHE = `${CIMALPES_SITE}/fr/recherche-location/`;
/** Logements par page de recherche (5 pages pleines et une de 7 pour 137, à Courchevel). */
export const PAR_PAGE = 26;
/** Borne de sûreté : Courchevel, la plus grande, en a six. */
export const PAGES_MAX = 10;

/* ---------- Cible ---------- */

export type CibleCimalpes = {
  /** `station_id` du site. */
  station: number;
  /** `secteurs[]` du site ; vide : tous les secteurs de la station. */
  secteurs: readonly number[];
};

/**
 * Le lieu de `couverture.ts` : la station du site, et ses secteurs après un
 * deux-points (« 1 », « 1:7 », « 21:109 »).
 */
export function cibleCimalpes(lieu: string): CibleCimalpes {
  const m = /^(\d{1,4})(?::(\d{1,4}(?:,\d{1,4})*))?$/.exec(lieu);
  if (!m) throw new Error("station illisible");
  return { station: Number(m[1]), secteurs: m[2] ? m[2].split(",").map(Number) : [] };
}

/* ---------- Requête ---------- */

/** Une date ISO (`2027-02-06`) au format du site (`06/02/2027`). */
export function dateSite(iso: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(iso);
  if (!m) throw new Error("date illisible");
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Une date du site (`06/02/2027`) en ISO, ou `null`. */
function dateIso(site: string | null | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((site ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function entierPositif(n: number, defaut: number): number {
  return Number.isFinite(n) ? Math.max(defaut, Math.trunc(n)) : defaut;
}

/**
 * La recherche datée, page `page`, telle que la page de résultats l'envoie
 * elle-même (mêmes paramètres, même ordre). `nbrVoyageurs` filtre sur la
 * capacité ; l'interface s'arrête à 12, le serveur accepte davantage.
 */
export function urlRecherche(input: LiveSearchInput, cible: CibleCimalpes, page = 1): string {
  const q = new URLSearchParams({
    page_nb: String(entierPositif(page, 1)),
    ajax: "1",
    tri: "Recommandé",
    date_debut: dateSite(input.checkIn),
    date_fin: dateSite(input.checkOut),
    station_id: String(cible.station),
    nbrVoyageurs: String(entierPositif(input.guests, 1)),
  });
  for (const s of cible.secteurs) q.append("secteurs[]", String(s));
  return `${RECHERCHE}?${q}`;
}

/** Le nombre de pages de la recherche : ⌈total / 26⌉, borné ; une seule si le total est illisible. */
export function nombrePages(total: number | null): number {
  if (total == null || !Number.isFinite(total)) return 1;
  return Math.min(PAGES_MAX, Math.max(0, Math.ceil(total / PAR_PAGE)));
}

/* ---------- Lecture ---------- */

const ENTITES: Readonly<Record<string, string>> = {
  amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", rsquo: "’", lsquo: "‘",
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ocirc: "ô", ccedil: "ç",
  icirc: "î", iuml: "ï", ucirc: "û", ugrave: "ù", euml: "ë", oelig: "œ", Eacute: "É",
};

function decoder(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (tout, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : tout;
    }
    return ENTITES[e] ?? tout;
  });
}

/** Le texte d'un fragment HTML : balises ôtées, entités décodées, blancs repliés ; `null` s'il est vide. */
function texte(html: string | null | undefined): string | null {
  if (html == null) return null;
  const t = decoder(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  return t || null;
}

/** Le contenu du premier `<p class="…">` de la classe donnée. */
function paragraphe(html: string, classe: string): string | null {
  return new RegExp(`<p class="${classe}"[^>]*>([\\s\\S]*?)</p>`).exec(html)?.[1] ?? null;
}

function entier(v: string | null | undefined, max = 1000): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

/** Un montant écrit « 8 100 € » (espaces, fines ou insécables, entre les milliers). */
function montant(v: string | null | undefined): number | null {
  if (v == null) return null;
  // `\s` couvre les espaces fines et insécables.
  const chiffres = v.replace(/[\s.]/g, "");
  if (!/^\d+$/.test(chiffres)) return null;
  const n = Number(chiffres);
  return n > 0 ? n : null;
}

function absolue(chemin: string): string {
  return new URL(decoder(chemin), CIMALPES_SITE).href;
}

/** Le type publié dans l'URL du logement : `/fr/location-<station>/<type>-<nom>/`. */
function typeDansUrl(url: string): "Appartement" | "Chalet" | null {
  const m = /\/location-[^/]+\/(appartement|chalet)-/i.exec(url);
  if (!m) return null;
  return m[1].toLowerCase() === "chalet" ? "Chalet" : "Appartement";
}

export type CarteCimalpes = {
  /** `data-bien-id` : l'identifiant du logement sur le site. */
  id: string;
  /** Lien absolu de la fiche, avec les dates telles que le site les écrit. */
  url: string;
  titre: string;
  type: "Appartement" | "Chalet" | null;
  /** « Val Thorens - Centre & proche centre » : station et secteur. */
  lieu: string | null;
  /** « N voyageurs » : adultes et enfants. */
  capacite: number | null;
  /** Le 0 chambre vient du mot « Studio », pas d'un nombre écrit. */
  studio: boolean;
  /** Chambres publiées ; un studio en a 0. */
  chambres: number | null;
  surface: number | null;
  /** Montant publié ; `null` pour « Prix sur demande ». */
  prix: number | null;
  /** Le prix avec les mots du site : « 8 100 € /semaine », « Prix sur demande ». */
  libellePrix: string | null;
  /** « Dès … » : prix de catalogue d'une recherche non datée, pas un total de séjour. */
  aPartirDe: boolean;
  /** Dates du lien (ISO) : celles du séjour dont la carte donne le prix. */
  dateDebut: string | null;
  dateFin: string | null;
  photos: string[];
};

/** Début du bloc de suggestions d'autres stations, ou -1. */
function debutSuggestions(html: string): number {
  const titre = html.search(/<h2[^>]*>\s*D[’']autres\s+séjours/i);
  const premier = html.indexOf('class="modresult"');
  const second = premier >= 0 ? html.indexOf('class="modresult"', premier + 1) : -1;
  const candidats = [titre, second].filter((i) => i >= 0);
  return candidats.length ? Math.min(...candidats) : -1;
}

function morceaux(html: string): string[] {
  return html.split(/<div class="product"\s/).slice(1);
}

function lireCarte(p: string): CarteCimalpes | null {
  const id = /data-bien-id="(\d+)"/.exec(p)?.[1];
  const lien = /<a href="([^"]+)"[^>]*>\s*<p class="titleproduct"/.exec(p)?.[1];
  const titre = texte(paragraphe(p, "titleproduct"));
  if (!id || !lien || !titre) return null;
  const url = absolue(lien);
  const detail = texte(paragraphe(p, "detailproduct")) ?? "";
  const chambres = /(\d+)\s*chambres?\b/i.exec(detail)?.[1];
  const prixHtml = paragraphe(p, "prixproduct") ?? "";
  const libellePrix = texte(prixHtml);
  const surDemande = /sur\s+demande/i.test(libellePrix ?? "");
  const brut =
    /<span>\s*([\d\s.]+?)\s*€\s*<\/span>/.exec(prixHtml)?.[1] ??
    /(\d[\d\s.]*)\s*€/.exec(libellePrix ?? "")?.[1];
  const requete = new URL(url).searchParams;
  const photos = new Set<string>();
  for (const m of p.matchAll(new RegExp(`src="(/cache/photos/\\d+/photos_bien_${id}_[^"]+)"`, "g"))) photos.add(absolue(m[1]));
  return {
    id,
    url,
    titre,
    type: typeDansUrl(url),
    lieu: texte(paragraphe(p, "lieuproduct")),
    capacite: entier(/(\d+)\s*voyageurs?\b/i.exec(detail)?.[1], 100),
    chambres: chambres != null ? entier(chambres, 50) : /\bstudio\b/i.test(detail) ? 0 : null,
    studio: chambres == null && /\bstudio\b/i.test(detail),
    surface: entier(/(\d+)\s*m²/.exec(detail)?.[1], 5000),
    prix: surDemande ? null : montant(brut),
    libellePrix,
    aPartirDe: /^(?:dès|à partir de)\b/i.test(libellePrix ?? ""),
    dateDebut: dateIso(requete.get("date_debut")),
    dateFin: dateIso(requete.get("date_fin")),
    photos: [...photos],
  };
}

export type RechercheCimalpes = {
  /** Le compte que publie le site pour la recherche entière (toutes pages, sans les suggestions). */
  total: number | null;
  cartes: CarteCimalpes[];
  /** Cartes d'autres stations coupées. */
  suggestions: number;
};

/** Les cartes d'un fragment de résultats, sans le bloc de suggestions, et le nombre de cartes coupées avec lui. */
export function lireCartes(html: string): { cartes: CarteCimalpes[]; suggestions: number } {
  const coupure = debutSuggestions(html);
  const propre = coupure >= 0 ? html.slice(0, coupure) : html;
  const cartes: CarteCimalpes[] = [];
  for (const p of morceaux(propre)) {
    const c = lireCarte(p);
    if (c) cartes.push(c);
  }
  return { cartes, suggestions: coupure >= 0 ? morceaux(html.slice(coupure)).length : 0 };
}

/** La réponse de la recherche AJAX, en texte (servie en `text/html`) ou déjà lue. */
export function lireRecherche(reponse: unknown): RechercheCimalpes {
  let v = reponse;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return { total: null, cartes: [], suggestions: 0 };
    }
  }
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  const html = typeof o?.html === "string" ? o.html : "";
  const t = o?.total;
  const total =
    typeof t === "number" && Number.isInteger(t) && t >= 0 ? t : typeof t === "string" && /^\d+$/.test(t) ? Number(t) : null;
  return { total, ...lireCartes(html) };
}

/* ---------- Annonces ---------- */

/**
 * Les annonces d'une recherche. Une carte n'est une offre que si son lien
 * porte les dates demandées et qu'elle ne dit pas « Dès » : sans quoi son prix
 * n'est pas celui du séjour, et le logement n'est pas prouvé libre à ces
 * dates. « Prix sur demande » reste, `total: 0`. La position vient de la
 * fiche, par la complétion.
 */
export function cimalpesListings(cartes: readonly CarteCimalpes[], input: LiveSearchInput): Listing[] {
  const vus = new Set<string>();
  const out: Listing[] = [];
  for (const c of cartes) {
    if (c.aPartirDe || c.dateDebut !== input.checkIn || c.dateFin !== input.checkOut) continue;
    if (vus.has(c.id)) continue;
    vus.add(c.id);
    out.push({
      id: `cim-${c.id}`,
      stationId: input.stationId,
      title: c.titre,
      source: "Cimalpes",
      total: c.prix ?? 0,
      currency: "EUR",
      // « 12 voyageurs ⸱ 2 chambres ⸱ 85 m² » : une ligne de texte ; le 0 d'un
      // studio vient de son type.
      ...champsLogement(
        annoncer(
          {
            capacity: c.capacite,
            bedrooms: c.chambres,
            source: { capacity: "text_regex", bedrooms: c.studio ? "derived_from_type" : "text_regex" },
          },
          c.titre,
        ),
      ),
      propertyType: c.type,
      available: true,
      photo: c.photos[0] ?? null,
      photos: c.photos.length ? c.photos : null,
      url: c.url,
      lat: null,
      lon: null,
      locality: c.lieu,
      priceLabel: c.libellePrix,
      priceIndicative: c.prix != null ? false : null,
      skiPassIncluded: false,
      platformId: c.id,
      proven: `Cimalpes live ${input.checkIn}→${input.checkOut}`,
    });
  }
  return out;
}
