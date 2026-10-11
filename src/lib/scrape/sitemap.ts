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
  /(post_tag|category|categorie|author|auteur|attachment|media|image|video|agenda|evenement|event|news|actualite|blog|restaurant|restauration|activite|randonnee|commerce|commercesservices|commerces_services|patrimoine|patrimoine-culturel|patrimoine-naturel|faq|loisir|webcam|producteur|equipement|fetesmanifestation|bloc|document|type_cuisine)s?[-_]?(?:sitemap|\d|\.xml)/;
/** Sitemaps de taxonomies WordPress (`type_hebergements-sitemap.xml`,
 *  `categories_patrimoines-sitemap.xml`, `theme_loisirs-sitemap.xml`) : ils
 *  listent des pages de rubrique, jamais une fiche ni une grille. Relevé
 *  font-romeu.fr du 11 octobre 2026 : 18 de ses 29 sitemaps. */
const SITEMAP_TAXONOMIE = /(?:^|\/)(?:type|types|categorie|categories|category|theme|themes|tag|tags)[-_][\w-]*sitemap/;

/**
 * Un sitemap nommé pour le profil : `hebergements-sitemap.xml`,
 * `loueurs_particuliers-sitemap.xml`, ou un flux d'office de tourisme
 * (Diffusio, Tourinsoft, Apidae, SIT) qui publie les fiches. Ses pages
 * passent avant celles des sitemaps génériques (`post-`, `page-`), qui
 * listent des rubriques et des articles.
 */
export function sitemapDedie(url: string, profil: Profil): boolean {
  const c = cheminPlie(url).split("/").pop() ?? "";
  if (SITEMAP_TAXONOMIE.test(c)) return false;
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
  if (SITEMAP_HORS_SUJET.test(c) || SITEMAP_TAXONOMIE.test(c)) return false;
  if (profil === "tarifs" && /heberg|loueur|locati|hotel/.test(c)) return false;
  return true;
}

/**
 * Un sitemap qui peut être un index (`sitemap.xml`, `sitemap_index.xml`,
 * `wp-sitemap.xml`, `…index…`) : il peut mener à un sitemap dédié, on l'ouvre
 * même quand des fiches sont déjà trouvées.
 */
export function sitemapIndexProbable(url: string): boolean {
  const c = cheminPlie(url).split("/").pop() ?? "";
  return /index/.test(c) || /^(?:wp-)?sitemap\.xml(?:\.gz)?$/.test(c);
}

export function urlDuProfil(url: string, profil: Profil): boolean {
  const c = cheminPlie(url);
  if (profil === "hebergement") return HEBERGEMENT.test(c) && !PAS_HEBERGEMENT.test(c);
  return TARIFS.test(c) && !PAS_TARIFS.test(c);
}

/** Langues étrangères reconnues en préfixe de chemin (`/en/`) ou en
 *  sous-domaine (`nl.la-plagne.com`, `it.chamonix.com`, `en.chamrousse.com`). */
const LANGUES = new Set(["en", "de", "it", "nl", "es", "pt", "ca", "ru", "pl", "da", "sv", "no", "cs", "zh", "ja", "fr"]);

/** La langue que l'URL affiche, ou `null` quand elle n'en dit rien. */
export function langueUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/")[1] ?? "";
    if (/^[a-z]{2}(?:-[a-z]{2})?$/i.test(seg)) return seg.toLowerCase().slice(0, 2);
    const sous = u.hostname.toLowerCase().split(".");
    if (sous.length >= 3 && LANGUES.has(sous[0])) return sous[0];
    return null;
  } catch {
    return null;
  }
}

/** Début de la saison d'hiver en cours : 2026 d'août 2026 à juillet 2027. */
function debutSaison(maintenant: Date): number {
  return maintenant.getUTCMonth() >= 7 ? maintenant.getUTCFullYear() : maintenant.getUTCFullYear() - 1;
}

/**
 * Une page tarifs plutôt qu'une autre : « /forfaits/tarifs-hiver » avant
 * « /boutique ». Plus le score est haut, plus la page a de chances d'être la
 * grille publique. Le chemin court l'emporte à score égal (une page de
 * rubrique plutôt qu'un article).
 */
export function scoreTarifs(url: string, maintenant = new Date()): number {
  const c = cheminPlie(url);
  let s = 0;
  if (/forfait/.test(c)) s += 4;
  // « prix » : le prix d'un forfait, pas un prix littéraire (« remise du prix
  // Michel Galabru », « prix roman jeunesse », Alpe d'Huez et Les Arcs le
  // 11 octobre 2026) ni un « petit prix » d'hébergement.
  if (/tarif|price/.test(c) || (/prix/.test(c) && !/remise-d|prix-(?:roman|litt|d-interpretation|interpretation)|petit-prix|prix-(?:reduit|gele|givre|fondu|mini)/.test(c))) s += 4;
  if (/skipass|ski-pass|lift-?pass|lift-?ticket/.test(c)) s += 3;
  if (/hiver|winter|saison|season/.test(c)) s += 1;
  if (/\bete\b|summer|vtt|bike|velo|piscine|luge|pieton|pedestrian|raquette|nordique|ski-de-fond|biathlon/.test(c)) s -= 4;
  if (/grand-prix|prix-du|remise-des-prix|concours/.test(c)) s -= 6;
  // Une activité qui publie ses tarifs n'est pas le domaine skiable
  // (« commando-games-tarifs-et-horaires », « tarifs-golf », « tarif
  // exceptionnel au tennis », la patinoire).
  if (/golf|tennis|patinoire|commando|paintball|accrobranche|parapente|bowling|cinema|musee|spa\b|escalade|canyoning|rafting|parking|navette|secours/.test(c)) s -= 6;
  // Les points de vente, caisses et bornes : où acheter, pas combien.
  if (/points?-de-vente|verkooppunt|verkoopspunt|caisse|borne|distributeur|guichet/.test(c)) s -= 6;
  // Agenda, actualités, délibérations, conditions de vente, séminaires,
  // bons plans d'hébergement : la page parle de forfaits sans en donner la
  // grille publique.
  if (/\/(?:agenda|actualites?|news|evenements?|tous-les-evenements|video_webtv|webtv|faq)\/|deliberation|conseil-municipal|conditions-(?:generales-)?de-vente|\bcgv\b|seminaire|incentive|entreprise|organismes|groupes?\b|immoforfait|airbnb|bons?-plans?-logement|ventes?-flash/.test(c)) s -= 4;
  // Une saison passée (« preventes-des-forfaits-de-ski-hiver-2022-2023 »).
  const annees = [...c.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)].map((m) => Number(m[1]));
  if (annees.length && Math.max(...annees) < debutSaison(maintenant)) s -= 5;
  // Une même page en anglais, italien, allemand, néerlandais : la française
  // passe devant (`/winter/…/buy-your-skipass/` derrière `/hiver/…`), en
  // chemin comme en sous-domaine (`nl.la-plagne.com`).
  const langue = langueUrl(url);
  if (langue && langue !== "fr") s -= 3;
  if (/winter|inverno|skiing|buy-|getting|deals|kaufen|acquist|sciare|kopen|ontdekken/.test(c)) s -= 3;
  // Ni forfait, ni ski, ni remontées, ni hiver : un « tarifs » sans contexte
  // n'est la grille que s'il est à la racine du site (`/tarifs.html`).
  const profondeur = c.split("/").filter(Boolean).length;
  if (!/forfait|ski|remontee|domaine|lift|hiver|winter|neige|snow|pass/.test(c) && profondeur > 1) s -= 5;
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
 * `/es/alojamientos/`, `/en/…`), chamonix.com sur `it.`, `de.`, `es.`.
 * Quand des URL sans marque de langue (ou en `fr`) existent, les variantes
 * étrangères, en chemin comme en sous-domaine, sont retirées.
 */
export function preferFrancais(urls: string[]): string[] {
  const fr = urls.filter((u) => {
    const l = langueUrl(u);
    return l === null || l === "fr";
  });
  return fr.length ? fr : urls;
}
