/**
 * Sitemaps : la liste que le site publie lui-même de ses pages.
 *
 * Lire un sitemap plutôt que suivre les liens d'une page à l'autre, c'est
 * demander au site ce qu'il expose, sans deviner d'URL. Relevés du
 * 11 octobre 2026 :
 * - font-romeu.fr publie `hebergements-sitemap.xml` (124 fiches) et
 *   `loueurs_particuliers-sitemap.xml` (64) ;
 * - www.haut-giffre.fr publie `hebergements-locatif-sitemap.xml` (81),
 *   `hebergements-collect-sitemap.xml` (27) ;
 * - www.sancy.com publie `sitemap-diffusio-fr.xml` : 2 573 fiches Diffusio,
 *   dont les hébergements sous `/fr/fiche/hebergement-locatif/` ;
 * - www.valleesdegavarnie.com (Tourinsoft) écrit ses `<loc>` en CDATA ;
 * - robots.txt écrit parfois « Sitemap : » (espace avant les deux-points,
 *   www.haut-giffre.fr) ou « Sitemap:http:// » sans espace.
 *
 * Ce module ne fait aucune requête : il lit des textes. Les requêtes, polies
 * et soumises à robots.txt, sont dans `sitemap.server.ts`.
 */

export type EntreeSitemap = { loc: string; lastmod: string | null };

export type Sitemap =
  | { type: "index"; entrees: EntreeSitemap[] }
  | { type: "urlset"; entrees: EntreeSitemap[] }
  | { type: "illisible"; entrees: [] };

/** Ce que l'on cherche dans un sitemap. */
export type Profil = "hebergement" | "tarifs";

/** Les lignes `Sitemap:` d'un robots.txt, quel que soit le groupe. */
export function sitemapsDeRobots(texte: string | null, origine: string): string[] {
  if (!texte) return [];
  const vus = new Set<string>();
  for (const brut of texte.split(/\r?\n/)) {
    const m = /^\s*sitemap\s*:\s*(\S+)/i.exec(brut.replace(/#.*$/, ""));
    if (!m) continue;
    const abs = absolue(m[1], origine);
    if (abs) vus.add(abs);
  }
  return [...vus];
}

/** Les emplacements à essayer quand robots.txt n'en nomme aucun. */
export function sitemapsParDefaut(origine: string): string[] {
  const o = origine.replace(/\/$/, "");
  return [`${o}/sitemap.xml`, `${o}/sitemap_index.xml`, `${o}/wp-sitemap.xml`];
}

function absolue(href: string, base: string): string | null {
  try {
    const u = new URL(href.trim(), base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

const ENTITES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function texteXml(brut: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(brut);
  const t = cdata ? cdata[1] : brut;
  return t
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITES[e])
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .trim();
}

/**
 * Lit un sitemap XML : un index (`<sitemapindex>`, d'autres sitemaps) ou une
 * liste de pages (`<urlset>`). Un document qui n'est ni l'un ni l'autre (page
 * d'erreur HTML servie en 200, 403 déguisé) est « illisible », pas vide.
 */
export function lireSitemap(xml: string): Sitemap {
  const corps = xml.replace(/<\?xml[^>]*\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const index = /<(?:\w+:)?sitemapindex\b/i.test(corps);
  const urlset = /<(?:\w+:)?urlset\b/i.test(corps);
  if (!index && !urlset) return { type: "illisible", entrees: [] };
  const bloc = index ? "sitemap" : "url";
  const re = new RegExp(`<(?:\\w+:)?${bloc}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${bloc}>`, "gi");
  const entrees: EntreeSitemap[] = [];
  for (const m of corps.matchAll(re)) {
    const loc = /<(?:\w+:)?loc>([\s\S]*?)<\/(?:\w+:)?loc>/i.exec(m[1]);
    if (!loc) continue;
    const url = texteXml(loc[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    const lm = /<(?:\w+:)?lastmod>([\s\S]*?)<\/(?:\w+:)?lastmod>/i.exec(m[1]);
    entrees.push({ loc: url, lastmod: lm ? texteXml(lm[1]) : null });
  }
  return { type: index ? "index" : "urlset", entrees };
}

/* ---------- Tri par profil ---------- */

function plie(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Chemin seul, décodé et plié : on juge ce que l'URL dit, pas l'hôte. */
function cheminPlie(url: string): string {
  try {
    const u = new URL(url);
    return plie(decodeURIComponent(u.pathname + u.search));
  } catch {
    return plie(url);
  }
}

const HEBERGEMENT =
  /(heberg|locati|loueur|meubl|gite|chalet|appartement|residence|studio|chambre[s]?-d-?hote|hotel|accommodation|lodging|unterkunft|alloggi|location[s]?\b|\/locations?\/|logement|village[s]?-vacances|centre[s]?-vacances|refuge)/;
/** Ce qui n'est pas un logement même si le mot y passe : un article de
 *  blogue sur « 5 idées de chalets », un restaurant d'hôtel, l'agenda. */
const PAS_HEBERGEMENT =
  /(\/(?:blog|actualites?|news|agenda|evenements?|events?|tag|category|categorie|author|auteur|attachment|wp-content|feed)\/|restaurant|restauration|bar-|activite|randonnee|commerce|patrimoine|equipement|loisir|mentions-legales|cgv|contact|\.(?:jpg|jpeg|png|webp|pdf)$)/;

const TARIFS =
  /(forfait|tarif|skipass|ski-pass|lift-?pass|lift-?ticket|prix|billetter|ticket|remontees?-mecaniques|domaine-skiable|pass-saison|season-pass|e-?shop|boutique-en-ligne)/;
const PAS_TARIFS =
  /(\/(?:blog|actualites?|news|tag|category|author|attachment|feed)\/|restaurant|ecole-de-ski|esf|location-materiel|hebergement|\.(?:jpg|jpeg|png|webp)$)/;

/** Les noms de sitemaps d'un index qui ne parlent pas du profil : on ne les
 *  ouvre pas. Un nom muet (`sitemap2.xml`, `tourinsoft-sitemap.xml`,
 *  `sitemap-diffusio-fr.xml`) s'ouvre : il peut tout contenir. */
const SITEMAP_HORS_SUJET =
  /(post_tag|category|categorie|author|auteur|attachment|media|image|video|agenda|evenement|event|news|actualite|blog|restaurant|activite|randonnee|commerce|patrimoine|faq)[-_]?(?:sitemap|\d|\.xml)/;

/**
 * Un sitemap nommé pour le profil : `hebergements-sitemap.xml`,
 * `loueurs_particuliers-sitemap.xml`, ou un flux d'office de tourisme
 * (Diffusio, Tourinsoft, Apidae, SIT) qui publie les fiches. Ses pages
 * passent avant celles des sitemaps génériques (`post-`, `page-`), qui
 * listent des rubriques et des articles.
 */
export function sitemapDedie(url: string, profil: Profil): boolean {
  const c = cheminPlie(url).split("/").pop() ?? "";
  if (profil === "hebergement") return /(heberg|loueur|locati|logement|hotel|gite|meubl|residence|camping|diffusio|tourinsoft|apidae|sitra|\bsit\b|fiche)/.test(c);
  return /(forfait|tarif|skipass|ticket|product|produit|boutique|shop)/.test(c);
}

/**
 * robots.txt qui écrit `Disallow: /` hors de tout groupe `User-agent`
 * (booking.prazsurarly.com, 11 octobre 2026 : le fichier tient en cette
 * seule ligne). La norme ignore une règle sans groupe ; l'intention, elle,
 * est claire : on la respecte.
 */
export function interditToutSansGroupe(texte: string | null): boolean {
  if (!texte) return false;
  for (const brut of texte.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const l = brut.replace(/#.*$/, "").trim();
    if (!l) continue;
    if (/^user-agent\s*:/i.test(l)) return false;
    if (/^disallow\s*:\s*\/\s*$/i.test(l)) return true;
  }
  return false;
}

export function sitemapUtile(url: string, profil: Profil): boolean {
  const c = cheminPlie(url);
  if (SITEMAP_HORS_SUJET.test(c)) return false;
  if (profil === "tarifs" && /heberg|loueur|locati|hotel/.test(c)) return false;
  return true;
}

export function urlDuProfil(url: string, profil: Profil): boolean {
  const c = cheminPlie(url);
  if (profil === "hebergement") return HEBERGEMENT.test(c) && !PAS_HEBERGEMENT.test(c);
  return TARIFS.test(c) && !PAS_TARIFS.test(c);
}

/**
 * Une page tarifs plutôt qu'une autre : « /forfaits/tarifs-hiver » avant
 * « /boutique ». Plus le score est haut, plus la page a de chances d'être la
 * grille publique. Le chemin court l'emporte à score égal (une page de
 * rubrique plutôt qu'un article).
 */
export function scoreTarifs(url: string): number {
  const c = cheminPlie(url);
  let s = 0;
  if (/forfait/.test(c)) s += 4;
  if (/tarif|prix|price/.test(c)) s += 4;
  if (/skipass|ski-pass|lift-?pass|lift-?ticket/.test(c)) s += 3;
  if (/hiver|winter|saison|season/.test(c)) s += 1;
  if (/\bete\b|summer|vtt|bike|piscine|luge|pieton|pedestrian|raquette|nordique|ski-de-fond|biathlon/.test(c)) s -= 4;
  if (/grand-prix|prix-du|remise-des-prix|concours/.test(c)) s -= 6;
  // Une même page en anglais, italien, allemand, néerlandais : la française
  // passe devant (`/winter/…/buy-your-skipass/` derrière `/hiver/…`).
  if (/\/(en|de|it|nl|es|pt|ca)\//.test(c)) s -= 3;
  if (/winter|inverno|skiing|buy-|getting|deals|kaufen|acquist|sciare|kopen/.test(c)) s -= 3;
  s -= Math.min(3, (c.match(/\//g)?.length ?? 0) / 3);
  return s;
}

/** Dédoublonne en gardant l'ordre ; retire fragments et barres finales doubles. */
export function dedoublonner(urls: Iterable<string>): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    let k = u;
    try {
      const x = new URL(u);
      x.hash = "";
      k = x.toString();
    } catch {
      /* gardée telle quelle */
    }
    if (vus.has(k)) continue;
    vus.add(k);
    out.push(k);
  }
  return out;
}

/**
 * Une page par logement, dans la langue du site : font-romeu.fr publie
 * chaque fiche en quatre langues (`/hebergements/`, `/ca/hebergements/`,
 * `/es/alojamientos/`, `/en/…`). Quand des URL sans préfixe de langue (ou en
 * `/fr/`) existent, les variantes étrangères sont retirées.
 */
export function preferFrancais(urls: string[]): string[] {
  const langue = (u: string): string | null => {
    try {
      const seg = new URL(u).pathname.split("/")[1] ?? "";
      return /^[a-z]{2}(?:-[a-z]{2})?$/i.test(seg) ? seg.toLowerCase().slice(0, 2) : null;
    } catch {
      return null;
    }
  };
  const fr = urls.filter((u) => {
    const l = langue(u);
    return l === null || l === "fr";
  });
  return fr.length ? fr : urls;
}
