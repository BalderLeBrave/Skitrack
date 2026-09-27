/**
 * Alpissime : locations de vacances à la montagne, publiées sur alpissime.com
 * (SARL AMSA, Arc 1800). Deux inventaires derrière la même recherche : des
 * agences immobilières (Valloire, Tignes, La Clusaz…), vendues du samedi au
 * samedi, sept nuits au moins ; des particuliers gérés par la conciergerie
 * Alpissime (Arc 1800 surtout), à dates libres.
 *
 * Partie pure : adresses de recherche, lecture des pages, annonces. Le relevé
 * (réseau, cadence, arrêt sur refus) est dans `alpissime.server.ts`, la
 * station du site pour chaque station Skitrack dans `couverture.ts`.
 *
 * Étude du 26 septembre 2026 (Valloire, 6→13/02/2027, 2 puis 6 adultes) :
 * - HTTP simple suffit : `GET /recherche?…` rend la page entière, sans défi,
 *   cookie ni jeton ;
 * - neuf cartes par page, `page=N` ; la page 1 porte en plus, dans
 *   `var jsontab = JSON.parse('…')`, la liste complète des résultats par
 *   immeuble : le témoin de la pagination. À Valloire, 85 résultats, 10 pages,
 *   85 cartes distinctes, les mêmes que le témoin ;
 * - chaque carte porte le total exact du séjour aux dates et son détail : N
 *   nuits, taxe de séjour (selon les voyageurs), frais de service (50 € chez
 *   les agences, 15,4 % du loyer chez les particuliers), frais de ménage
 *   (0 chez les agences, dont la fiche dit « ménage de fin de séjour non
 *   inclus » ; obligatoire et compté chez les particuliers). Le « / Nuit » de
 *   la carte n'est pas daté ;
 * - une recherche datée ne rend que ce qui est réservable aux dates exactes ;
 * - la position est celle de l'immeuble ; les chambres ne sont que sur la
 *   fiche, que la complétion lit (`stay/priseFiche.ts`). La fiche n'est jamais
 *   une source de prix : aux dates où le logement n'est pas libre, elle
 *   affiche « 50 € au total », les seuls frais de service ;
 * - robots.txt n'exclut ni `/recherche` ni les fiches.
 *
 * Forfaits de ski : le site n'en vend qu'en option de réservation, par skieur,
 * et leur prix ne se calcule qu'avec les nom et date de naissance de chacun.
 * Le total d'une carte est l'hébergement seul : `skiPassIncluded: false`.
 */

import type { Listing } from "@/lib/listings";
import type { LiveSearchInput } from "../types";

export const ALPISSIME_SITE = "https://www.alpissime.com";
/** Cartes par page de recherche, fixé par le site. */
export const PAR_PAGE = 9;
/** Borne de sûreté : 180 cartes. Valloire en a 85 au plus fort mesuré. */
export const PAGES_MAX = 20;

/* ---------- Stations ---------- */

/**
 * Les stations Skitrack plus fines que celles du site, prises dans leur
 * station par le village publié sur la carte. Le paramètre `village` de la
 * recherche ne filtre pas (il range ce village en tête) : le tri se fait à la
 * lecture. « Tignes 2100 » est Le Lac, « Tignes 1800 » Les Boisses.
 */
export const VILLAGES: Readonly<Record<string, readonly string[]>> = {
  "arc-1600": ["Arc 1600 – Station", "Arc 1600 – Courbaton"],
  "arc-1800": ["Arc 1800 – Alpages du Chantel", "Arc 1800 – Charmettoger", "Arc 1800 – Charvet", "Arc 1800 – Villards"],
  "arc-1950": ["Arc 1950"],
  "arc-2000": ["Arc 2000"],
  "aime-2000": ["Aime 2000"],
  "belle-plagne": ["Belle Plagne"],
  "champagny-en-vanoise": ["Champagny en Vanoise"],
  "les-coches": ["Les Coches"],
  "montchavin-les-coches": ["Montchavin", "Les Coches"],
  "plagne-bellecote": ["Plagne Bellecôte"],
  "plagne-centre": ["Plagne Centre"],
  "plagne-villages": ["Plagne Villages"],
  "tignes-les-brevieres": ["Tignes 1550 Les Brévières"],
  "tignes-val-claret": ["Tignes Val Claret"],
  "tignes-le-lac": ["Tignes 2100"],
  "tignes-les-boisses": ["Tignes 1800"],
  lanslebourg: ["Lanslebourg"],
  lanslevillard: ["Lans Le Villard"],
  "la-foux-d-allos": ["Val d'Allos – La Foux"],
  "le-seignus": ["Val d'Allos – Le Seignus"],
};

export type StationAlpissime = {
  /** Identifiant de station du site (`lieugeo` de /recherche). */
  lieugeo: number;
  /** Villages gardés, tels que la carte les écrit, ou `null` : toute la station. */
  villages: readonly string[] | null;
};

export function stationAlpissime(lieugeo: string, stationId: string): StationAlpissime {
  if (!/^\d{1,5}$/.test(lieugeo)) throw new Error("station illisible");
  return { lieugeo: Number(lieugeo), villages: VILLAGES[stationId] ?? null };
}

/* ---------- Requêtes ---------- */

/** « 2027-02-06 » → « 06-02-2027 », le format du formulaire. */
export function dateSite(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error("date illisible");
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * La recherche datée d'une station, telle que le formulaire l'envoie. Les
 * pages suivantes reprennent les liens du site (`nb_etoiles=0&page=N`). Les
 * dates « élargies » ne partent pas : la recherche porte sur les dates exactes.
 */
export function urlRecherche(input: LiveSearchInput, station: StationAlpissime, page = 1): string {
  const adultes = Math.max(1, Math.trunc(input.guests));
  const q = new URLSearchParams({
    lieugeo: String(Math.trunc(station.lieugeo)),
    village: "0",
    dbt: dateSite(input.checkIn),
    fin: dateSite(input.checkOut),
    nbCouchage_ad: String(adultes),
    nbCouchage_enf: "0",
  });
  const p = Math.max(1, Math.trunc(page));
  if (p > 1) {
    q.set("nb_etoiles", "0");
    q.set("page", String(p));
  }
  return `${ALPISSIME_SITE}/recherche?${q}`;
}

/** Pages à lire pour `annoncees` résultats, bornées. Une au moins. */
export function pagesAttendues(annoncees: number | null): number {
  if (annoncees == null || !Number.isFinite(annoncees) || annoncees <= 0) return 1;
  return Math.min(PAGES_MAX, Math.ceil(annoncees / PAR_PAGE));
}

/* ---------- Lecture ---------- */

const ENTITES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  bull: "•",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  hellip: "…",
  deg: "°",
  euro: "€",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ocirc: "ô",
  icirc: "î",
  ucirc: "û",
  ugrave: "ù",
  times: "×",
};

export function decoder(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tout, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : tout;
    }
    return ENTITES[e.toLowerCase()] ?? tout;
  });
}

function texte(html: string | null | undefined): string | null {
  if (html == null) return null;
  const t = decoder(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  return t || null;
}

/**
 * Un montant tel que le site l'écrit, dans ses deux formats : « 1 610,00 € »
 * (nuits) et « 1,683.10 € » (total). Le dernier séparateur suivi d'un ou deux
 * chiffres est la virgule décimale ; les autres groupent les milliers.
 */
export function montant(s: string | null | undefined): number | null {
  if (!s) return null;
  // `\s` couvre les espaces fines et insécables.
  let t = s.replace(/[\s€]/g, "");
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const k = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  if (k >= 0) {
    const decimales = t.length - k - 1;
    t = decimales === 1 || decimales === 2 ? `${t.slice(0, k).replace(/[.,]/g, "")}.${t.slice(k + 1)}` : t.replace(/[.,]/g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function entier(s: string | null | undefined, max = 1000): number | null {
  if (s == null || !/^\d+$/.test(s.trim())) return null;
  const n = Number(s.trim());
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

function coord(s: string | null | undefined): number | null {
  if (s == null || !s.trim()) return null;
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export type LigneDetail = { libelle: string; montant: number | null };

export type CarteAlpissime = {
  id: string;
  titre: string;
  /** La fiche, dates et voyageurs compris : …/06-02-2027/13-02-2027/2/0 */
  url: string | null;
  /** Le segment de type de l'URL : appartement, studio, chalet, villa, gite, location. */
  typeUrl: string | null;
  /** Le type écrit sur la carte : « Appart. », « Studio », « Chalet ». */
  libelleType: string | null;
  /** Le village publié : « Arc 1800 – Villards », « Valloire ». */
  village: string | null;
  capacite: number | null;
  surface: number | null;
  /** La position de l'immeuble (`data-lat`, `data-lng`). */
  lat: number | null;
  lon: number | null;
  photos: string[];
  /** Le « … € / Nuit » de la carte : pas un prix daté. */
  prixNuit: number | null;
  nuits: number | null;
  loyer: number | null;
  taxeSejour: number | null;
  fraisService: number | null;
  fraisMenage: number | null;
  /** Le total exact (ligne « Total » du détail), ou `null` : carte sans dates. */
  total: number | null;
  /** Le libellé visible : « Total : 1 683 € ». */
  libelleTotal: string | null;
  /** Toutes les lignes du détail, y compris celles qu'on ne connaît pas. */
  detail: LigneDetail[];
  /** Les lignes redonnent le total, au centime près (un écart ferait douter du total). */
  coherent: boolean;
};

export type ImmeubleAlpissime = {
  id: string;
  nom: string;
  lat: number | null;
  lon: number | null;
  /** Les annonces de l'immeuble : leurs identifiants, lus dans leurs liens. */
  annonces: string[];
};

export type PageAlpissime = {
  /** Le compteur « N résultats de location » ; `null` s'il manque. */
  annoncees: number | null;
  cartes: CarteAlpissime[];
  /** Le témoin `jsontab` : tous les résultats, par immeuble ; `null` s'il manque. */
  plan: ImmeubleAlpissime[] | null;
  /** La page dit « Aucun résultat » (bloc `zero_result`). */
  vide: boolean;
};

const DEBUT_CARTE = /<div class="col-6 col-md-4 col-xl-4 mb-3" id="(\d+)">/g;

function idDeLien(url: string): string | null {
  return /\/station\/[^/]+\/[^/]+\/(\d+)_/.exec(url)?.[1] ?? null;
}

function lireCarte(id: string, bloc: string): CarteAlpissime {
  const url = /href="(https:\/\/www\.alpissime\.com\/station\/[^"]+)"/.exec(bloc)?.[1] ?? null;
  const typeUrl = url ? (/\/station\/[^/]+\/([^/]+)\//.exec(url)?.[1] ?? null) : null;
  const meta = texte(/<p class="small mb-1">([\s\S]*?)<\/p>/.exec(bloc)?.[1]) ?? "";
  const parts = meta.split("•").map((p) => p.trim()).filter(Boolean);
  const capacite = entier(/(\d+)\s*pers\b/.exec(meta)?.[1], 50);
  const surf = /(\d+(?:[.,]\d+)?)\s*m²/.exec(meta)?.[1];
  const libelleType = parts[0] && !/\bpers\b|m²/.test(parts[0]) ? parts[0] : null;
  const gps = /data-lat="([^"]*)"\s+data-lng="([^"]*)"/.exec(bloc);
  const photos: string[] = [];
  for (const m of bloc.matchAll(/<img class="object-fit-cover" src="([^"]+)"/g)) {
    const p = decoder(m[1]);
    if (!photos.includes(p)) photos.push(p);
  }
  const detail: LigneDetail[] = [];
  let nuits: number | null = null;
  let loyer: number | null = null;
  let taxeSejour: number | null = null;
  let fraisService: number | null = null;
  let fraisMenage: number | null = null;
  let total: number | null = null;
  for (const m of bloc.matchAll(/<span class="resleft[^"]*">([\s\S]*?)<\/span>\s*<span class="float-right">([\s\S]*?)<\/span>/g)) {
    const libelle = texte(m[1]) ?? "";
    const v = montant(texte(m[2]));
    detail.push({ libelle, montant: v });
    const n = /^(\d+)\s+nuits?$/i.exec(libelle);
    if (n) {
      nuits = Number(n[1]);
      loyer = v;
    } else if (/^taxe de s[ée]jour$/i.test(libelle)) taxeSejour = v;
    else if (/^frais de service$/i.test(libelle)) fraisService = v;
    else if (/^frais de m[ée]nage$/i.test(libelle)) fraisMenage = v;
    else if (/^total$/i.test(libelle)) total = v;
  }
  const lignes = detail.filter((d) => !/^total$/i.test(d.libelle));
  const somme = lignes.reduce((s, d) => s + (d.montant ?? Number.NaN), 0);
  return {
    id,
    titre: texte(/<a class=['"]text['"][^>]*>([\s\S]*?)<\/a>/.exec(bloc)?.[1]) ?? "",
    url: url ? decoder(url) : null,
    typeUrl,
    libelleType,
    village: texte(/<div class="village-wrapper">[\s\S]*?<span>([\s\S]*?)<\/span>/.exec(bloc)?.[1]),
    capacite: capacite != null && capacite > 0 ? capacite : null,
    surface: surf != null ? Number(surf.replace(",", ".")) : null,
    lat: coord(gps?.[1]),
    lon: coord(gps?.[2]),
    photos,
    prixNuit: montant(texte(/<strong>\s*(?:D[èe]s\s*)?([^<]*?)\s*<\/strong>\s*\/\s*Nuit/i.exec(bloc)?.[1])),
    nuits,
    loyer,
    taxeSejour,
    fraisService,
    fraisMenage,
    total,
    libelleTotal: texte(/(Total\s*:[^<]*)<\/u>/.exec(bloc)?.[1]),
    detail,
    coherent: total != null && lignes.length > 0 && Math.abs(somme - total) < 0.05,
  };
}

/**
 * Le témoin `var jsontab = JSON.parse('…')` : un objet par immeuble. La page
 * en porte trois copies : la première suffit. Un tableau vide (`[]`) quand il
 * n'y a aucun résultat.
 */
export function lirePlan(html: string): ImmeubleAlpissime[] | null {
  const m = /var jsontab = JSON\.parse\('([\s\S]*?)'\);/.exec(html);
  if (!m) return null;
  let brut: unknown;
  try {
    brut = JSON.parse(m[1].replace(/\\'/g, "'"));
  } catch {
    return null;
  }
  if (Array.isArray(brut)) return [];
  if (!brut || typeof brut !== "object") return null;
  const out: ImmeubleAlpissime[] = [];
  for (const [id, v] of Object.entries(brut as Record<string, unknown>)) {
    const o = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    if (!o) continue;
    const urls = Array.isArray(o.url) ? o.url : [];
    out.push({
      id,
      nom: typeof o.title === "string" ? (texte(o.title) ?? "") : "",
      lat: typeof o.lat === "string" || typeof o.lat === "number" ? coord(String(o.lat)) : null,
      lon: typeof o.lon === "string" || typeof o.lon === "number" ? coord(String(o.lon)) : null,
      annonces: urls.flatMap((u) => {
        const aid = typeof u === "string" ? idDeLien(u) : null;
        return aid ? [aid] : [];
      }),
    });
  }
  return out;
}

export function idsDuPlan(plan: readonly ImmeubleAlpissime[]): Set<string> {
  return new Set(plan.flatMap((i) => i.annonces));
}

/** Une page de résultats : compteur, cartes, témoin. */
export function lirePage(html: string): PageAlpissime {
  const n = /(\d+)\s+r[ée]sultats?\s+de\s+location/i.exec(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "")?.[1];
  const vide = /class=['"]zero_result['"]/.test(html);
  const debuts = [...html.matchAll(DEBUT_CARTE)];
  const cartes: CarteAlpissime[] = [];
  debuts.forEach((m, i) => {
    const debut = (m.index ?? 0) + m[0].length;
    const suivant = debuts[i + 1]?.index;
    let fin = suivant ?? html.length;
    if (suivant == null) {
      const pagination = html.indexOf('<div class="pagination', debut);
      if (pagination > 0) fin = pagination;
    }
    cartes.push(lireCarte(m[1], html.slice(debut, fin)));
  });
  return {
    annoncees: n != null ? Number(n) : cartes.length === 0 && vide ? 0 : null,
    cartes,
    plan: lirePlan(html),
    vide: cartes.length === 0 && vide,
  };
}

/* ---------- Relevé d'une station ---------- */

export type ReleveAlpissime = {
  /** Toutes les cartes lues, sans doublon, dans l'ordre du site. */
  cartes: CarteAlpissime[];
  /** Ce que le site annonce (`N résultats de location`). */
  annoncees: number | null;
  pagesLues: number;
  plan: ImmeubleAlpissime[] | null;
  /** Les résultats du témoin qu'aucune carte lue ne porte. */
  manquantes: string[];
  raison?: string;
};

/**
 * Lit la page 1, puis les suivantes une à une, autant que le compteur en
 * demande. `lire` rend le HTML d'une adresse ou lève : une erreur (refus,
 * échéance) arrête la pagination, et ce qui a été lu est rendu, avec la
 * raison. Seule la page 1 fait échouer le relevé entier.
 */
export async function releverStation(
  input: LiveSearchInput,
  station: StationAlpissime,
  lire: (url: string) => Promise<string>,
): Promise<ReleveAlpissime> {
  const premiere = lirePage(await lire(urlRecherche(input, station, 1)));
  const vues = new Set<string>();
  const cartes: CarteAlpissime[] = [];
  const garder = (p: PageAlpissime) => {
    for (const c of p.cartes) {
      if (vues.has(c.id)) continue;
      vues.add(c.id);
      cartes.push(c);
    }
  };
  garder(premiere);
  const pages = pagesAttendues(premiere.annoncees);
  let pagesLues = 1;
  let raison: string | undefined;
  for (let p = 2; p <= pages; p++) {
    let page: PageAlpissime;
    try {
      page = lirePage(await lire(urlRecherche(input, station, p)));
    } catch (err) {
      raison = `page ${p} : ${err instanceof Error ? err.message : String(err)}`;
      break;
    }
    pagesLues++;
    if (page.cartes.length === 0) {
      raison = `page ${p} sans carte`;
      break;
    }
    garder(page);
  }
  const plan = premiere.plan;
  const manquantes = plan ? [...idsDuPlan(plan)].filter((id) => !vues.has(id)) : [];
  return { cartes, annoncees: premiere.annoncees, pagesLues, plan, manquantes, ...(raison ? { raison } : {}) };
}

/* ---------- Annonces ---------- */

function plierVillage(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** La carte est-elle d'un village gardé pour cette station ? */
export function villageGarde(carte: Pick<CarteAlpissime, "village">, station: StationAlpissime): boolean {
  if (!station.villages) return true;
  if (!carte.village) return false;
  const v = plierVillage(carte.village);
  return station.villages.some((x) => plierVillage(x) === v);
}

/** Les types publiés : l'abréviation de la carte, sinon le segment de l'URL. */
const TYPES_CARTE: Readonly<Record<string, string>> = {
  "appart.": "Appartement",
  appartement: "Appartement",
  studio: "Studio",
  chalet: "Chalet",
  villa: "Villa",
  gite: "Gîte",
  "gîte": "Gîte",
};

export function typePublie(c: Pick<CarteAlpissime, "libelleType" | "typeUrl">): string | null {
  const l = c.libelleType?.trim().toLowerCase();
  if (l && TYPES_CARTE[l]) return TYPES_CARTE[l];
  const u = c.typeUrl?.trim().toLowerCase();
  return u && TYPES_CARTE[u] ? TYPES_CARTE[u] : null;
}

/** Au-delà, la position n'est pas celle d'un logement de la station (le site
 *  place par défaut au centre de la France : 46,77 N, 2,23 E). */
export const ECART_MAX_KM = 25;

function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

export function positionPlausible(
  lat: number | null,
  lon: number | null,
  input: Pick<LiveSearchInput, "lat" | "lon">,
): boolean {
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  return km(lat, lon, input.lat, input.lon) <= ECART_MAX_KM;
}

/** Une ligne du détail qui nommerait un forfait de ski. Jamais vue en recherche. */
const LIGNE_FORFAIT = /forfait|ski\s*-?\s*pass|skipass|remont[ée]es?\s+m[ée]caniques/i;

/**
 * Le total de la carte comprend-il des forfaits de ski ? Une carte datée est
 * l'hébergement seul (`false`), sauf si une ligne de son détail nommait un
 * forfait (`true`, jamais vu sur 94 cartes). Sans détail, rien ne le dit.
 */
export function forfaitDansLeDetail(c: Pick<CarteAlpissime, "total" | "detail">): boolean | null {
  if (c.total == null || c.detail.length === 0) return null;
  return c.detail.some((d) => LIGNE_FORFAIT.test(d.libelle));
}

/**
 * Une carte datée devient une annonce. Le total est celui de la ligne
 * « Total » : loyer, taxe de séjour, frais de service, et ménage quand il est
 * obligatoire. Une carte sans total (jamais vue en recherche datée) garde la
 * convention du dépôt : `total: 0`, prix non publié.
 */
export function annonceAlpissime(
  c: CarteAlpissime,
  input: LiveSearchInput,
  immeuble?: Pick<ImmeubleAlpissime, "nom"> | null,
): Listing {
  const place = positionPlausible(c.lat, c.lon, input);
  const total = c.total != null && c.total > 0 ? c.total : 0;
  const type = typePublie(c);
  return {
    id: `alp-${c.id}`,
    stationId: input.stationId,
    title: c.titre,
    source: "Alpissime",
    total,
    currency: "EUR",
    guests: c.capacite,
    // Un studio publié n'a pas de chambre ; les autres attendent la fiche.
    bedrooms: type === "Studio" ? 0 : null,
    rooms: null,
    propertyType: type,
    available: true,
    photo: c.photos[0] ?? null,
    photos: c.photos.length ? c.photos : null,
    url: c.url,
    lat: place ? c.lat : null,
    lon: place ? c.lon : null,
    locality: c.village,
    placeName: immeuble?.nom || c.village,
    priceLabel: c.libelleTotal,
    priceIndicative: total > 0 ? false : null,
    skiPassIncluded: forfaitDansLeDetail(c),
    platformId: c.id,
    proven: `Alpissime live ${input.checkIn}→${input.checkOut}`,
  };
}

/** Les annonces d'un relevé, pour la station demandée (village compris). */
export function annoncesAlpissime(
  r: Pick<ReleveAlpissime, "cartes" | "plan">,
  input: LiveSearchInput,
  station: StationAlpissime,
): Listing[] {
  const immeubleDe = new Map<string, ImmeubleAlpissime>();
  for (const i of r.plan ?? []) for (const a of i.annonces) immeubleDe.set(a, i);
  return r.cartes
    .filter((c) => villageGarde(c, station))
    .map((c) => annonceAlpissime(c, input, immeubleDe.get(c.id)));
}
