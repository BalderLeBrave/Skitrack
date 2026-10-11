/**
 * Catalogue d'une centrale sans connecteur : une fiche par logement, lue sur
 * sa page publique, sans rien inventer.
 *
 * Deux lecteurs remplissent la même fiche :
 * - Firecrawl (`firecrawl.server.ts`), qui rend la page et renvoie un JSON
 *   selon `SCHEMA_LOGEMENT` ;
 * - la lecture locale (`ficheDepuisHtml`), sans clé : JSON-LD, balises
 *   Open Graph et texte de la page, lus par les parseurs du dépôt.
 *
 * Les deux passent par `normaliserFiche` : un nombre hors bornes, une
 * coordonnée hors de France, un prix « à partir de » présenté comme total
 * sont écartés. Les sites sans moteur de réservation (relevés du 11 octobre
 * 2026 : Sancy, Font-Romeu, Haut-Giffre…) publient une grille (« Semaine :
 * 650 € + taxe de séjour ») : elle est gardée comme grille, jamais comme
 * total daté. Un total n'est retenu que si la page écrit ses deux dates.
 */

import { occupancyFromText } from "../stay/occupancy.ts";

export type UniteTarif = "semaine" | "nuit" | "week-end" | "sejour" | "mois" | "autre";

export type TarifPublie = {
  libelle: string;
  montant: number;
  unite: UniteTarif;
  /** « à partir de », « dès », « from » : un plancher, pas un prix. */
  plancher: boolean;
};

export type TotalSejour = { montant: number; arrivee: string; depart: string; nuits: number };

export type FicheCatalogue = {
  url: string;
  lecteur: "firecrawl" | "lecture";
  titre: string | null;
  type: string | null;
  commune: string | null;
  capacite: number | null;
  chambres: number | null;
  pieces: number | null;
  lat: number | null;
  lon: number | null;
  photos: string[];
  equipements: string[];
  tarifs: TarifPublie[];
  totalSejour: TotalSejour | null;
  releveLe: string;
};

/* ---------- Schéma demandé à Firecrawl ---------- */

export const PROMPT_LOGEMENT =
  "Fiche d'un hébergement touristique. Recopie uniquement ce que la page écrit : " +
  "ne déduis rien, ne convertis pas les pièces en chambres, laisse null ce qui n'est pas écrit. " +
  "Pour les tarifs, recopie chaque ligne publiée avec son libellé exact (période, « à partir de »…). " +
  "Ne remplis total_sejour que si la page affiche un prix total pour des dates d'arrivée et de départ précises.";

export const SCHEMA_LOGEMENT = {
  type: "object",
  properties: {
    titre: { type: ["string", "null"] },
    type_hebergement: { type: ["string", "null"], description: "appartement, chalet, gîte, studio, hôtel…" },
    commune: { type: ["string", "null"] },
    capacite_personnes: { type: ["integer", "null"] },
    chambres: { type: ["integer", "null"], description: "nombre de chambres écrit, pas déduit des pièces" },
    pieces: { type: ["integer", "null"] },
    latitude: { type: ["number", "null"] },
    longitude: { type: ["number", "null"] },
    photos: { type: "array", items: { type: "string" } },
    equipements: { type: "array", items: { type: "string" } },
    tarifs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          libelle: { type: "string", description: "texte exact de la ligne de tarif" },
          montant_eur: { type: "number" },
          unite: { type: "string", enum: ["semaine", "nuit", "week-end", "sejour", "mois", "autre"] },
        },
        required: ["libelle", "montant_eur"],
      },
    },
    total_sejour: {
      type: ["object", "null"],
      properties: {
        montant_eur: { type: "number" },
        arrivee: { type: "string", description: "AAAA-MM-JJ" },
        depart: { type: "string", description: "AAAA-MM-JJ" },
        libelle: { type: "string" },
      },
    },
  },
} as const;

/* ---------- Normalisation ---------- */

/** « à partir de », « dès », « from » : un plancher. « des » (l'article) et
 *  « minimum » (« 4 jours minimum ») n'en sont pas : relevé Sancy du
 *  11 octobre 2026, « Tarifs des semaines » passait pour un plancher. */
const PLANCHER = /(a partir de|à partir de|à compter de|\bdès\b|\bfrom\b|starting at)/i;

function entier(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n >= min && n <= max ? n : null;
}

function nombre(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "string" ? Number(v.replace(/\s/g, "").replace(",", ".")) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return n >= min && n <= max ? n : null;
}

function chaine(v: unknown, max = 300): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

/** France métropolitaine, Corse comprise : une coordonnée hors de ce cadre
 *  est une erreur de lecture (0,0, lat/lon inversées). */
export function coordonneesPlausibles(lat: number | null, lon: number | null): boolean {
  if (lat == null || lon == null) return false;
  return lat >= 41 && lat <= 51.5 && lon >= -5.5 && lon <= 10;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function nuitsEntre(a: string, b: string): number | null {
  if (!ISO.test(a) || !ISO.test(b)) return null;
  const n = (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
  return Number.isInteger(n) && n >= 1 && n <= 30 ? n : null;
}

function unite(v: unknown, libelle: string): UniteTarif {
  const l = libelle.toLowerCase();
  // Plusieurs nuits ou semaines, un court séjour : un prix de séjour, pas
  // « la nuit ». Relevé Sancy : « Court séjour (base 4 nuits) : 220 à 260 € »
  // était rangé à la nuit. Le libellé l'emporte sur l'unité proposée.
  if (/\b(?:[2-9]|\d{2})\s*(?:semaines|nuits|nuitées|jours|weeks|nights)\b|base\s*\d+\s*nuits|court\s*s[eé]jour|mid-?week|midweek/.test(l)) return "sejour";
  const s = typeof v === "string" ? v.toLowerCase() : "";
  if (["semaine", "nuit", "week-end", "sejour", "mois", "autre"].includes(s)) return s as UniteTarif;
  if (/semaine|week\b|7 nuits/.test(l)) return "semaine";
  if (/week-?end/.test(l)) return "week-end";
  if (/nuit|night/.test(l)) return "nuit";
  if (/mois|month/.test(l)) return "mois";
  return "autre";
}

/** Le loyer le plus bas qu'un logement puisse afficher pour cette unité. En
 *  dessous, c'est un supplément (« 15 € / semaine » : le linge, le wifi). */
const MINIMUM: Record<UniteTarif, number> = { semaine: 80, nuit: 15, "week-end": 30, sejour: 50, mois: 200, autre: 10 };

function photo(v: unknown, base: string): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.trim(), base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (/logo|sprite|icon|pictogram|placeholder|\.svg($|\?)/i.test(u.pathname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** La fiche, bornée. `brut` suit `SCHEMA_LOGEMENT`, quel que soit le lecteur. */
export function normaliserFiche(
  brut: Record<string, unknown>,
  url: string,
  lecteur: FicheCatalogue["lecteur"],
  releveLe = new Date().toISOString(),
): FicheCatalogue {
  const lat = nombre(brut.latitude, -90, 90);
  const lon = nombre(brut.longitude, -180, 180);
  const geoOk = coordonneesPlausibles(lat, lon);

  const tarifs: TarifPublie[] = [];
  for (const t of Array.isArray(brut.tarifs) ? brut.tarifs : []) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    const libelle = chaine(o.libelle, 200);
    const montant = nombre(o.montant_eur, 10, 50_000);
    if (!libelle || montant == null) continue;
    const u = unite(o.unite, libelle);
    if (montant < MINIMUM[u]) continue;
    tarifs.push({ libelle, montant, unite: u, plancher: PLANCHER.test(libelle) });
  }

  let totalSejour: TotalSejour | null = null;
  const ts = brut.total_sejour;
  if (ts && typeof ts === "object") {
    const o = ts as Record<string, unknown>;
    const montant = nombre(o.montant_eur, 20, 100_000);
    const arrivee = chaine(o.arrivee, 10);
    const depart = chaine(o.depart, 10);
    const libelle = chaine(o.libelle, 200) ?? "";
    const nuits = arrivee && depart ? nuitsEntre(arrivee, depart) : null;
    if (montant != null && nuits != null && !PLANCHER.test(libelle)) {
      totalSejour = { montant, arrivee: arrivee!, depart: depart!, nuits };
    }
  }

  const photos = [
    ...new Set((Array.isArray(brut.photos) ? brut.photos : []).map((p) => photo(p, url)).filter((p): p is string => !!p)),
  ].slice(0, 20);
  const equipements = [
    ...new Set(
      (Array.isArray(brut.equipements) ? brut.equipements : []).map((e) => chaine(e, 80)).filter((e): e is string => !!e),
    ),
  ].slice(0, 60);

  return {
    url,
    lecteur,
    titre: chaine(brut.titre),
    type: chaine(brut.type_hebergement, 60),
    commune: chaine(brut.commune, 80),
    capacite: entier(brut.capacite_personnes, 1, 50),
    chambres: entier(brut.chambres, 0, 30),
    pieces: entier(brut.pieces, 1, 30),
    lat: geoOk ? lat : null,
    lon: geoOk ? lon : null,
    photos,
    equipements,
    tarifs,
    totalSejour,
    releveLe,
  };
}

/* ---------- Lecture locale, sans clé ---------- */

function decoder(s: string): string {
  return s
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&euro;/g, "€")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

/** Texte visible de la page, une ligne par bloc. */
export function texteVisible(html: string): string {
  return decoder(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(?:br|\/p|\/div|\/li|\/h\d|\/tr|\/dd|\/dt)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((l) => l.replace(/[ \t\r\f\v]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function jsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const v = JSON.parse(m[1].trim());
      const pile = Array.isArray(v) ? v : [v];
      while (pile.length) {
        const x = pile.shift();
        if (!x || typeof x !== "object") continue;
        out.push(x as Record<string, unknown>);
        const g = (x as Record<string, unknown>)["@graph"];
        if (Array.isArray(g)) pile.push(...g);
      }
    } catch {
      /* bloc JSON-LD mal formé : ignoré */
    }
  }
  return out;
}

function meta(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  const c = tag && /content=["']([^"']*)["']/i.exec(tag);
  return c ? decoder(c[1]).trim() || null : null;
}

/** « Semaine : 650 € + taxe de séjour », « Nuit 85€ », « À partir de 420 € » :
 *  une ligne de texte avec un montant en euros. */
const MONTANT = "(?<![\\d.,])(\\d{1,3}(?:[ .\\u202f\\u00a0]\\d{3})+|\\d+)(?:[.,](\\d{1,2}))?";
const LIGNE_TARIF = new RegExp(`${MONTANT}\\s*(?:€|eur\\b|euros?\\b)`, "i");
/** « 1190 à 1980 € », « de 450 à 620 € », « 450 - 620 € » : une fourchette. */
const FOURCHETTE = new RegExp(`${MONTANT}\\s*(?:€\\s*)?(?:à|a|-|–)\\s*${MONTANT}\\s*(?:€|eur\\b|euros?\\b)`, "i");

function lireMontant(entier: string, cents?: string): number {
  return Number(entier.replace(/[ .\u202f\u00a0]/g, "") + (cents ? `.${cents}` : ""));
}

function tarifsDuTexte(texte: string): Array<{ libelle: string; montant_eur: number }> {
  const out: Array<{ libelle: string; montant_eur: number }> = [];
  for (const ligne of texte.split("\n")) {
    if (ligne.length > 200) continue;
    if (!/semaine|nuit|week|s[eé]jour|mois|tarif|prix|p[eé]riode|saison|vacances|jours?\b/i.test(ligne)) continue;
    if (/caution|d[eé]p[oô]t de garantie|arrhes|acompte|frais de dossier|m[eé]nage|draps|linge|animal|taxe de s[eé]jour\s*:/i.test(ligne)) continue;
    const f = FOURCHETTE.exec(ligne);
    if (f) {
      // Le bas d'une fourchette est un plancher : libellé marqué pour
      // `normaliserFiche`, qui le range comme tel.
      const bas = lireMontant(f[1], f[2]);
      if (Number.isFinite(bas)) out.push({ libelle: `à partir de — ${ligne}`, montant_eur: bas });
      continue;
    }
    const m = LIGNE_TARIF.exec(ligne);
    if (!m) continue;
    const montant = lireMontant(m[1], m[2]);
    if (Number.isFinite(montant)) out.push({ libelle: ligne, montant_eur: montant });
    if (out.length >= 30) break;
  }
  return out;
}

/**
 * Fiche lue dans le HTML, sans service tiers : JSON-LD (`geo`, `image`,
 * `name`, `address`), Open Graph, puis le texte visible pour la capacité,
 * les chambres et les lignes de tarif. Aucun total daté : une page servie
 * sans dates n'en a pas.
 */
export function ficheDepuisHtml(html: string, url: string, releveLe?: string): FicheCatalogue {
  const ld = jsonLd(html);
  const texte = texteVisible(html);
  let titre: string | null = null;
  let commune: string | null = null;
  let lat: unknown = null;
  let lon: unknown = null;
  const photos: unknown[] = [];
  for (const o of ld) {
    const t = String(o["@type"] ?? "");
    // L'office de tourisme se décrit lui-même sur chaque fiche (Haut-Giffre,
    // 11 octobre 2026 : `TouristInformationCenter`, son nom et sa position sur
    // les 110 fiches). Ni son nom ni sa position ne sont ceux du logement.
    if (/BreadcrumbList|WebSite|Organization|WebPage|SearchAction|TouristInformationCenter|GovernmentOffice|ImageObject|FAQPage|Event/i.test(t)) continue;
    if (!titre && typeof o.name === "string") titre = o.name;
    const geo = o.geo as Record<string, unknown> | undefined;
    if (geo && lat == null) {
      lat = geo.latitude;
      lon = geo.longitude;
    }
    const adr = o.address as Record<string, unknown> | undefined;
    if (adr && !commune && typeof adr.addressLocality === "string") commune = adr.addressLocality;
    const img = o.image;
    for (const i of Array.isArray(img) ? img : img ? [img] : []) {
      photos.push(typeof i === "string" ? i : (i as Record<string, unknown>)?.url);
    }
  }
  titre ??= meta(html, "og:title") ?? (/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, " ") ?? null);
  const og = meta(html, "og:image");
  if (og) photos.unshift(og);
  const dl = /data-lat(?:itude)?=["'](-?\d{1,2}\.\d+)["']/i.exec(html);
  const dg = /data-(?:lng|lon|long|longitude)=["'](-?\d{1,3}\.\d+)["']/i.exec(html);
  if (lat == null && dl && dg) {
    lat = dl[1];
    lon = dg[1];
  }
  // Galerie : les images de contenu (JPEG, WebP), pas les pictos du thème.
  for (const m of html.matchAll(/<img\b[^>]*?\s(?:data-src|src)=["']([^"']+\.(?:jpe?g|webp)(?:\?[^"']*)?)["']/gi)) {
    if (/\/themes?\/|\/medias?\/|logo|picto|icon|label|epi-gdf/i.test(m[1])) continue;
    photos.push(m[1]);
    if (photos.length >= 25) break;
  }
  lat ??= meta(html, "place:location:latitude") ?? meta(html, "geo.position")?.split(/[;,]/)[0];
  lon ??= meta(html, "place:location:longitude") ?? meta(html, "geo.position")?.split(/[;,]/)[1];

  // Capacité et chambres : seulement les lignes qui les nomment, pas toute la
  // page (un menu « Chalets 12 personnes » ne décrit pas cette fiche).
  const lignesLogement = texte
    .split("\n")
    .filter((l) => l.length < 160 && /personne|pers\b|couchage|chambre|pi[eè]ce|studio|\bT\d\b|\bF\d\b/i.test(l))
    .slice(0, 12);
  const occ = occupancyFromText(titre ?? "", ...lignesLogement);

  return normaliserFiche(
    {
      titre,
      commune,
      capacite_personnes: occ.capacity,
      chambres: occ.bedrooms,
      pieces: occ.rooms,
      latitude: typeof lat === "string" ? Number(lat) : lat,
      longitude: typeof lon === "string" ? Number(lon) : lon,
      photos,
      tarifs: tarifsDuTexte(texte),
    },
    url,
    "lecture",
    releveLe,
  );
}

/** La fiche dit-elle quelque chose d'utile ? Une page de liste ou d'erreur
 *  n'a ni capacité, ni chambres, ni tarif, ni coordonnées. */
export function ficheParlante(f: FicheCatalogue): boolean {
  return f.capacite != null || f.chambres != null || f.pieces != null || f.tarifs.length > 0 || f.lat != null;
}

/**
 * Une même position sur plus de la moitié des fiches d'un site (cinq au
 * moins) est celle de l'office ou de la commune, pas des logements : elle est
 * retirée. Une résidence de huit appartements à la même adresse reste.
 */
export function retirerPositionsDuSite(fiches: FicheCatalogue[]): number {
  const n = new Map<string, number>();
  for (const f of fiches) if (f.lat != null) n.set(`${f.lat},${f.lon}`, (n.get(`${f.lat},${f.lon}`) ?? 0) + 1);
  let retirees = 0;
  for (const [cle, c] of n) {
    if (c < 5 || c <= fiches.length / 2) continue;
    for (const f of fiches) {
      if (`${f.lat},${f.lon}` !== cle) continue;
      f.lat = null;
      f.lon = null;
      retirees += 1;
    }
  }
  return retirees;
}
