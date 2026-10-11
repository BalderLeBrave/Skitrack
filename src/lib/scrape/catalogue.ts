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
 * coordonnée hors de France sont écartés, et **aucun « à partir de » n'est un
 * prix** : un plancher (« à partir de », « dès », « from ») ou une fourchette
 * (« 1 190 à 1 980 € ») n'entre ni dans `tarifs` ni dans `totalSejour` ; il
 * est seulement compté (`planchersEcartes`). Consigne du propriétaire du
 * 11 octobre 2026 : de vrais prix, pas de « à partir de ». Les sites sans
 * moteur de réservation (Sancy, Font-Romeu, Haut-Giffre…) publient une grille
 * ferme (« Semaine : 650 € + taxe de séjour ») : elle est gardée comme grille,
 * jamais comme total daté. Un total n'est retenu que si la page écrit ses
 * deux dates.
 */

import { occupancyFromText } from "../stay/occupancy.ts";

export type UniteTarif = "semaine" | "nuit" | "week-end" | "sejour" | "mois" | "autre";

export type TarifPublie = {
  libelle: string;
  montant: number;
  unite: UniteTarif;
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
  /** Prix fermes publiés par la page : jamais un « à partir de ». */
  tarifs: TarifPublie[];
  /** Lignes « à partir de », « dès » ou fourchettes lues puis écartées. */
  planchersEcartes: number;
  totalSejour: TotalSejour | null;
  releveLe: string;
};

/* ---------- Schéma demandé à Firecrawl ---------- */

export const PROMPT_LOGEMENT =
  "Fiche d'un hébergement touristique. Recopie uniquement ce que la page écrit : " +
  "ne déduis rien, ne convertis pas les pièces en chambres, laisse null ce qui n'est pas écrit. " +
  "Pour les tarifs, recopie chaque ligne publiée avec son libellé exact (période, « à partir de »…) : " +
  "les prix « à partir de », « dès » et les fourchettes seront écartés, ne les présente pas comme des prix fermes. " +
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
const PLANCHER = /(a partir(?! du\b| des\b)|à partir(?! du\b| des\b)|à compter de|\bdès\b|\bfrom\b|starting at)/i;

/** Une fourchette n'est pas un prix : « entre 80 € et 92 € », « de 60 €/nuit
 *  à 70 €/nuit », « de 180 € (basse saison) à 300 € » (relevé du 11 octobre
 *  2026, Mole-Brasses, Sancy). */
const FOURCHETTES = [
  /\bentre\s+\d[\d\s.,]*\s*(?:€|eur)?[^.;:]{0,25}?\bet\s+\d/i,
  /\bde\s+\d[\d\s.,]*\s*(?:€|eur)[^.;:]{0,30}?\sà\s+\d[\d\s.,]*\s*(?:€|eur)/i,
];

/** Ni un loyer ni un séjour : repas, suppléments, tarif d'un enfant selon
 *  son âge (« De 3 à 6 ans : 23 € par enfant », « Petit déjeuner : 15 € »). */
const HORS_LOYER =
  /(petits?[- ]d[ée]jeuners?|demi[- ]pension|pension compl[eè]te|\brepas\b|table d'h[ôo]te|\d+\s*(?:à|-)\s*\d+\s*ans\b|^[\s•*–-]*(?:caution|d[ée]p[ôo]t de garantie|m[ée]nage|draps|linge|animaux?|chiens?|taxe de s[ée]jour|frais de dossier|enfants?\b))/i;

/** Ce qu'est une ligne de tarif : un prix ferme, un « à partir de » (ou une
 *  fourchette), ou autre chose qu'un loyer. */
export function natureTarif(libelle: string): "ferme" | "plancher" | "hors-loyer" {
  if (HORS_LOYER.test(libelle)) return "hors-loyer";
  if (PLANCHER.test(libelle) || FOURCHETTES.some((re) => re.test(libelle))) return "plancher";
  return "ferme";
}

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
    // Avatars d'auteur (gravatar), vignettes de menu (`Rando-menu.jpg`, sur
    // les 88 fiches de font-romeu.fr le 11 octobre 2026), pixels espions.
    if (/gravatar|avatar|[-_]menu\.|\/menu\/|emoji|spacer|pixel\.|blank\./i.test(u.hostname + u.pathname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** `photo-1200x766.jpg` → largeur 1200 ; `null` sans taille dans le nom. */
function tailleNommee(url: string): { cle: string; largeur: number | null } {
  const m = /^(.*?)-(\d{1,4})x(\d{1,4})(\.\w+)(\?.*)?$/.exec(url);
  if (!m) return { cle: url, largeur: null };
  return { cle: `${m[1]}${m[4]}`, largeur: Number(m[2]) };
}

/**
 * Une photo par image : WordPress publie la même en plusieurs tailles
 * (`-1200x766`, `-752x480`), on garde la plus grande à la place de la
 * première vue. Une vignette nommée de moins de 200 px de large (`-89x70`,
 * `-0x80`) est un picto, pas une photo du logement.
 */
export function photosNettes(urls: string[]): string[] {
  const ordre: string[] = [];
  const meilleure = new Map<string, { url: string; largeur: number }>();
  for (const u of urls) {
    const { cle, largeur } = tailleNommee(u);
    if (largeur != null && largeur < 200) continue;
    const l = largeur ?? Number.MAX_SAFE_INTEGER;
    const vue = meilleure.get(cle);
    if (!vue) {
      ordre.push(cle);
      meilleure.set(cle, { url: u, largeur: l });
    } else if (l > vue.largeur) meilleure.set(cle, { url: u, largeur: l });
  }
  return ordre.map((c) => meilleure.get(c)!.url);
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
  let planchersEcartes = 0;
  for (const t of Array.isArray(brut.tarifs) ? brut.tarifs : []) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    const libelle = chaine(o.libelle, 200);
    const montant = nombre(o.montant_eur, 10, 50_000);
    if (!libelle || montant == null) continue;
    const u = unite(o.unite, libelle);
    if (montant < MINIMUM[u]) continue;
    // « À partir de », « dès », une fourchette : pas un prix.
    const nature = natureTarif(libelle);
    if (nature === "hors-loyer") continue;
    if (nature === "plancher") {
      planchersEcartes += 1;
      continue;
    }
    tarifs.push({ libelle, montant, unite: u });
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

  const photos = photosNettes([
    ...new Set((Array.isArray(brut.photos) ? brut.photos : []).map((p) => photo(p, url)).filter((p): p is string => !!p)),
  ]).slice(0, 20);
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
    planchersEcartes,
    totalSejour,
    releveLe,
  };
}

/**
 * Une fiche d'un relevé antérieur, remise à la règle : ses « à partir de »
 * (marqués `plancher` ou reconnus au libellé) sortent de `tarifs`.
 */
export function retirerPlanchers(f: FicheCatalogue): FicheCatalogue {
  const garde = f.tarifs.filter((t) => natureTarif(t.libelle) !== "hors-loyer");
  const fermes = garde.filter((t) => !(t as { plancher?: boolean }).plancher && natureTarif(t.libelle) === "ferme");
  return {
    ...f,
    tarifs: fermes.map(({ libelle, montant, unite }) => ({ libelle, montant, unite })),
    planchersEcartes: (f.planchersEcartes ?? 0) + garde.length - fermes.length,
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
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*>`, "i");
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
      // Une fourchette n'est pas un prix : libellé marqué pour
      // `normaliserFiche`, qui la compte parmi les planchers écartés.
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
    // L'auteur de la page non plus (beuil.fr : « Administrateur SICTIAM »,
    // « Emilie Groeneveld » en titre de fiche, `@type: Person`).
    if (/BreadcrumbList|WebSite|Organization|WebPage|SearchAction|TouristInformationCenter|GovernmentOffice|ImageObject|FAQPage|Event|Person|ProfilePage|Comment/i.test(t)) continue;
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
  lat ??= meta(html, "place:location:latitude") ?? meta(html, "latitude") ?? meta(html, "geo.position")?.split(/[;,]/)[0];
  lon ??= meta(html, "place:location:longitude") ?? meta(html, "longitude") ?? meta(html, "geo.position")?.split(/[;,]/)[1];
  if (lat == null) {
    const p = positionDansLaPage(html);
    if (p) [lat, lon] = p;
  }

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

/** Une carte posée par un script ou un lien d'itinéraire : Leaflet
 *  (`L.marker([45.1, 6.6])`), Google Maps (`LatLng(…)`, `?q=lat,lon`,
 *  `@lat,lon`, `destination=`), OpenStreetMap (`mlat=…&mlon=…`), ou un objet
 *  `{ lat: …, lng: … }`. Une position commune à tout le site (l'office) est
 *  retirée ensuite par `retirerPositionsDuSite`. */
const POSITIONS: RegExp[] = [
  /L\.marker\(\s*\[\s*(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})\s*\]/i,
  /google\.maps\.LatLng\(\s*(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})\s*\)/i,
  /google\.[a-z.]+\/maps[^"'\s<>]*?[?&;](?:q|ll|daddr|destination|query)=(-?\d{1,2}\.\d{3,})(?:,|%2C)\s*(-?\d{1,3}\.\d{3,})/i,
  /google\.[a-z.]+\/maps\/[^"'\s<>]*@(-?\d{1,2}\.\d{3,}),(-?\d{1,3}\.\d{3,})/i,
  /openstreetmap\.org\/[^"'\s<>]*?mlat=(-?\d{1,2}\.\d{3,})&(?:amp;)?mlon=(-?\d{1,3}\.\d{3,})/i,
  /["']?lat(?:itude)?["']?\s*[:=]\s*["']?(-?\d{1,2}\.\d{3,})["']?\s*,\s*["']?(?:lng|lon|long|longitude)["']?\s*[:=]\s*["']?(-?\d{1,3}\.\d{3,})/i,
];

function positionDansLaPage(html: string): [number, number] | null {
  for (const re of POSITIONS) {
    const m = re.exec(html);
    if (!m) continue;
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (coordonneesPlausibles(lat, lon)) return [lat, lon];
  }
  return null;
}

/** La fiche dit-elle quelque chose d'utile ? Une page de liste ou d'erreur
 *  n'a ni capacité, ni chambres, ni tarif, ni coordonnées. */
export function ficheParlante(f: FicheCatalogue): boolean {
  return f.capacite != null || f.chambres != null || f.pieces != null || f.tarifs.length > 0 || f.lat != null;
}

/**
 * Le décor du site, retiré des fiches : une photo vue sur plus d'une fiche
 * sur dix (cinq au moins) est un logo, un bandeau ou un carrousel « vous
 * aimerez aussi » (11 octobre 2026 : le logo FEDER sur 375 des 425 fiches de
 * Gavarnie, trois vignettes de menu sur les 88 de Font-Romeu) ; une fin de
 * titre commune à plus de la moitié (« - Haut-Giffre Tourisme ») est le nom
 * du site. Une résidence qui partage ses photos entre quelques lots reste.
 */
export type DecorSite = { photos: string[]; finsTitre: string[] };

export function retirerDecorDuSite(
  fiches: FicheCatalogue[],
  connu: Partial<DecorSite> = {},
): { photos: number; titres: number; decor: DecorSite } {
  // Le décor relevé la fois précédente le reste : les fiches reprises n'en
  // portent plus, il ne passerait plus le seuil sur les seules fiches relues.
  const seuil = Math.max(5, fiches.length / 10);
  const vues = new Map<string, number>();
  for (const f of fiches) for (const p of new Set(f.photos)) vues.set(p, (vues.get(p) ?? 0) + 1);
  const decor = new Set(connu.photos ?? []);
  for (const [p, n] of vues) if (n >= seuil) decor.add(p);
  let photos = 0;
  for (const f of fiches) {
    const avant = f.photos.length;
    f.photos = f.photos.filter((p) => !decor.has(p));
    photos += avant - f.photos.length;
  }

  const fin = (t: string) => /\s[-–|]\s((?:(?!\s[-–|]\s).)+)$/.exec(t)?.[1]?.trim() ?? null;
  const fins = new Map<string, number>();
  for (const f of fiches) {
    const s = f.titre ? fin(f.titre) : null;
    if (s) fins.set(s, (fins.get(s) ?? 0) + 1);
  }
  const finsSite = new Set(connu.finsTitre ?? []);
  for (const [s, n] of fins) if (n >= 5 && n > fiches.length / 2) finsSite.add(s);
  let titres = 0;
  for (const f of fiches) {
    const s = f.titre ? fin(f.titre) : null;
    if (!s || !finsSite.has(s)) continue;
    const court = f.titre!.slice(0, f.titre!.lastIndexOf(s)).replace(/\s[-–|]\s*$/, "").trim();
    if (court) {
      f.titre = court;
      titres += 1;
    }
  }
  return { photos, titres, decor: { photos: [...decor].sort(), finsTitre: [...finsSite].sort() } };
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
