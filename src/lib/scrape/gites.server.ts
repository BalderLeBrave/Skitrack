import type { Page } from "playwright";
import type { Listing } from "@/lib/listings";
import { SCRAPE_UA, sleep } from "./browser.server.ts";
import { allowsPath } from "./robots.ts";
import type { LiveSearchInput } from "./types";
import { annoncer, type Occupancy } from "../stay/occupancy.ts";
import { capaciteFormuleItea } from "../stay/lectureFiche.ts";
import { depuisTexte, equipements } from "../stay/equipements.ts";
import { texteDeHtml } from "../stay/texteHtml.ts";
import { ficheDepuisBrut } from "../stay/ficheEnrichie.ts";
import { gitesWidgetUrl, lieuFromGitesHtml, retenirLieuGites, type LieuGites } from "./gitesGps.server.ts";
import { communeGites } from "./gitesCommunes.ts";

/**
 * Bornes du relevé, toutes explicites.
 *
 * `MAX_PAGES` et `BUDGET_PAGES_MS` sont des bornes de **sécurité** : c'est le
 * compteur publié par le moteur de recherche qui commande la pagination, et
 * elles ne servent qu'à ne pas tourner indéfiniment si ce compteur est absent
 * ou faux. Le motif d'arrêt est journalisé à chaque fois.
 *
 * `MAX_FICHES` est un budget de politesse envers `widget-fngf.itea.fr`, un
 * hôte tiers : ce n'est pas un filtre sur les résultats. Au-delà de ces
 * vingt-quatre fiches, et quand ITEA ne répond pas, la tuile de recherche
 * sort tout de suite — titre, type, photo, position et ligne de capacité,
 * total à zéro. La description, les avis et le devis des dates choisies
 * vivent sur la fiche : ils sont lus ensuite, une fiche à la fois, et un
 * refus (403, 429, 503) arrête cette suite. Rien n'est inventé à sa place.
 */
const MAX_PAGES = 6;
const BUDGET_PAGES_MS = 20_000;
/**
 * Entre deux pages de recherche : le `Crawl-delay` que publie le robots.txt du
 * site (5 s). C'était 2 s ; la page 2 étant le plus souvent refusée de toute
 * façon (voir `blocage`), l'attendre davantage ne coûte rien.
 */
const PAUSE_PAGE_MS = 5_000;
const MAX_FICHES = 24;
/** Quatre fiches à la fois, et un souffle entre deux : c'était huit. */
const WORKERS = 4;
const PAUSE_FICHE_MS = 250;
/**
 * Le temps des fiches ITEA. Cette phase n'avait aucune borne : quand ITEA ne
 * répondait pas, elle prenait jusqu'à 70 s et faisait dépasser les 52 s de la
 * recherche entière. Elle dispose d'au moins `RESERVE_FICHES_MS` après la
 * pagination — de quoi lire les 24 fiches à quatre ouvriers —, sans jamais
 * finir après `PLAFOND_GITES_MS` depuis le début du relevé.
 */
const RESERVE_FICHES_MS = 14_000;
const PLAFOND_GITES_MS = 38_000;
/** Délai d'un appel ITEA : une fiche qui ne répond pas ne retient pas les autres. */
const DELAI_FICHE_MS = 8_000;
/** Après tant d'échecs d'affilée, ITEA est tenu pour injoignable. */
const ECHECS_DISJONCTEUR = 3;
/**
 * Au-delà, le moteur a cherché dans toute la France : un code `towns` manquant
 * ou périmé. `drupalSettings.searchResults` plafonne d'ailleurs à 5 000.
 */
const SEUIL_NATIONAL = 5_000;

export function searchUrl(input: LiveSearchInput, towns: string): string {
  const u = new URL("https://www.gites-de-france.com/fr/search");
  // Toujours par code de commune : le texte `destination=` est ignoré par le
  // moteur, qui rendait alors toute la France (voir gitesCommunes.ts).
  u.searchParams.set("towns", towns);
  u.searchParams.set("travelers", String(input.guests));
  u.searchParams.set("date-start", input.checkIn);
  u.searchParams.set("date-end", input.checkOut);
  u.searchParams.set("f[0]", "type:36172");
  return u.toString();
}

/**
 * Une page refusée par le pare-feu du site, et comment on le sait.
 *
 * Cloudflare répond 403, avec le titre « Attention Required! » dans Chromium
 * ou « Just a moment... » et l'en-tête `cf-mitigated` en HTTP simple. On
 * attendait jusqu'ici 10 s des tuiles qui ne venaient pas, pour conclure à une
 * « page sans tuile nouvelle ». On s'arrête désormais tout de suite, sans
 * réessayer : un refus se respecte, il ne se contourne pas.
 */
export function blocage(r: { status: number | null; cfMitigated: string | null; titre: string | null }): string | null {
  if (r.cfMitigated) return `bloqué (défi ${r.cfMitigated})`;
  if (r.status === 403 || r.status === 429) return `bloqué (${r.status})`;
  if (r.titre && /attention required|just a moment/i.test(r.titre)) return "bloqué (page de défi)";
  // Une panne ou une page absente n'est pas un refus : on l'appelle par son nom.
  if (r.status != null && r.status >= 400) return `HTTP ${r.status}`;
  return null;
}

/**
 * Le total publié par le moteur, du porteur le plus sûr au moins sûr : le
 * titre de tri (« 94 Résultats »), puis le compte de la facette cochée, puis
 * la liste `drupalSettings.searchResults` quand elle n'est pas plafonnée.
 */
export function totalPublie(c: {
  titreTri: string | null;
  facette: string | null;
  resultats: number | null;
}): number | null {
  const titre = c.titreTri?.replace(/\s+/g, " ").match(/(\d[\d\s.]{0,8})\s*r[ée]sultats?\b/i);
  if (titre) {
    const n = Number(titre[1].replace(/[\s.]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  if (c.facette && /^\d{1,7}$/.test(c.facette.trim())) return Number(c.facette.trim());
  if (c.resultats != null && c.resultats < SEUIL_NATIONAL) return c.resultats;
  return null;
}

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.hypot(x, y) * 6371;
}

/**
 * Les tuiles de la plus proche à la plus éloignée de la station, celles dont
 * la position n'est pas publiée à la fin, dans l'ordre du site.
 *
 * Le budget de fiches coupait dans l'ordre de la page ; quand il joue, c'est
 * désormais ce qui est loin de la station qui reste sans fiche.
 */
export function trierParDistance<T extends { lat: number | null; lon: number | null }>(
  tiles: readonly T[],
  pin: { lat: number; lon: number },
): T[] {
  return tiles
    .map((t, i) => ({ t, i, d: t.lat != null && t.lon != null ? distanceKm(pin, { lat: t.lat, lon: t.lon }) : null }))
    .sort((a, b) => {
      if (a.d == null && b.d == null) return a.i - b.i;
      if (a.d == null) return 1;
      if (b.d == null) return -1;
      return a.d - b.d || a.i - b.i;
    })
    .map((x) => x.t);
}

function codeFromUrl(url: string): string | null {
  const m = url.match(/(\d{2}g\d{3,})/i);
  return m ? m[1].toUpperCase() : null;
}

function isoToFr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export type Tile = {
  title: string;
  url: string;
  /**
   * Le libellé de produit publié par la tuile (« Gîte », « Chambre d'hôtes »…).
   * Il servait uniquement à écarter ; il dit aussi ce que le bien **est**, et
   * se pose donc dans `propertyType`.
   */
  typeLabel: string;
  /**
   * La ligne de capacité de la tuile, telle qu'elle est publiée.
   *
   * Lue seule, et non plus noyée dans `node.textContent` : tout le texte de la
   * tuile passait auparavant dans la même moulinette, si bien qu'un nombre
   * ramassé n'importe où (une description, un « 7 nuits », un prix) pouvait
   * devenir une capacité — et faire écarter l'annonce.
   */
  capacite: string;
  photo: string | null;
  /**
   * La position publiée pour la tuile par `drupalSettings.searchResults`
   * (appariée par `data-marker-id`), sans aucune requête de plus ; `null` si
   * elle ne l'est pas.
   */
  lat: number | null;
  lon: number | null;
};

type Moisson = {
  tiles: Tile[];
  /** Textes courts susceptibles de porter le compteur de résultats. */
  compteurs: string[];
  /** Le titre de tri (« 94 Résultats »), le porteur le plus sûr du total. */
  titreTri: string | null;
  /** Le compte publié par la facette cochée. */
  facette: string | null;
  /** La longueur de `drupalSettings.searchResults`, plafonnée par le site à 5 000. */
  resultats: number | null;
  /** Si le moteur a localisé la recherche (`drupalSettings.searchPoint`). */
  localisee: boolean | null;
  /** Lien « page suivante » publié par le moteur, s'il y en a un. */
  suivant: string | null;
};

async function lirePage(page: Page): Promise<Moisson> {
  return page.evaluate(() => {
    const out: Tile[] = [];
    const seen = new Set<string>();
    // `drupalSettings` porte la liste des résultats avec leur position, et le
    // point autour duquel le moteur a cherché. Absent ou illisible : rien.
    type Reglages = { searchResults?: unknown; searchPoint?: unknown };
    const settings = ((): Reglages | null => {
      try {
        const raw = document.querySelector("script[data-drupal-selector='drupal-settings-json']")?.textContent;
        return raw ? (JSON.parse(raw) as Reglages) : null;
      } catch {
        return null;
      }
    })();
    const positions = new Map<string, { lat: number; lon: number }>();
    const liste = Array.isArray(settings?.searchResults) ? (settings.searchResults as unknown[]) : null;
    for (const r of liste ?? []) {
      if (!r || typeof r !== "object") continue;
      const { id, lat, lng } = r as { id?: unknown; lat?: unknown; lng?: unknown };
      const la = Number(lat);
      const lo = Number(lng);
      if (id != null && Number.isFinite(la) && Number.isFinite(lo) && la !== 0 && lo !== 0) {
        positions.set(String(id), { lat: la, lon: lo });
      }
    }
    const tiles = document.querySelectorAll(".js-search-tile");
    const nodes = tiles.length > 0 ? tiles : document.querySelectorAll(".g2f-accommodationTile");
    nodes.forEach((node) => {
      const anchors = Array.from(node.querySelectorAll("a[href]")) as HTMLAnchorElement[];
      const link =
        (node.querySelector("a.g2f-accommodationTile-link") as HTMLAnchorElement | null) ||
        (node.querySelector("a.g2f-accommodationTile-image") as HTMLAnchorElement | null) ||
        anchors.find((a) => /\d{2}g\d{3,}/i.test(a.getAttribute("href") || a.href)) ||
        null;
      const href = link?.href;
      if (!href || !/\d{2}g\d{3,}/i.test(href)) return;
      if (/gite[-_]de[-_]groupe|gite[-_]de[-_]sejour|chambre[-_]d[-_]hotes/i.test(href)) return;
      if (/\/account\//i.test(href)) return;
      if (seen.has(href)) return;
      seen.add(href);
      const title =
        node.querySelector("h2, h3, a.g2f-accommodationTile-link")?.textContent?.trim() ||
        link?.getAttribute("title")?.trim() ||
        "";
      if (title.length < 3) return;
      const typeLabel =
        node.querySelector(".g2f-accommodationTile-text-type")?.textContent?.replace(/\s+/g, " ").trim() ||
        "";
      // Gîte de groupe et chambre d'hôtes : la source les vend hors du
      // périmètre cherché. C'est la seule raison d'écarter ici.
      if (/chambre/i.test(typeLabel) && /h[oô]te/i.test(typeLabel)) return;
      if (/groupe/i.test(typeLabel)) return;
      const capacite =
        node
          .querySelector(".g2f-accommodationTile-text-capacity")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() || "";
      const img = node.querySelector("img") as HTMLImageElement | null;
      const rawPhoto =
        img?.getAttribute("data-src") ||
        img?.getAttribute("data-lazy") ||
        img?.currentSrc ||
        img?.src ||
        "";
      let photo: string | null = null;
      if (/^https?:/i.test(rawPhoto)) photo = rawPhoto;
      else if (rawPhoto.startsWith("//")) photo = `https:${rawPhoto}`;
      else if (rawPhoto.startsWith("/") && !/placeholder|pictos|sprite|1x1/i.test(rawPhoto)) {
        photo = `https://www.gites-de-france.com${rawPhoto}`;
      }
      const pos = positions.get(node.getAttribute("data-marker-id") ?? "");
      out.push({
        title,
        url: href.split("?")[0],
        typeLabel,
        capacite,
        photo: photo && /^https?:/.test(photo) ? photo : null,
        lat: pos?.lat ?? null,
        lon: pos?.lon ?? null,
      });
    });

    // Le compteur de résultats : on ramasse ici les textes courts des endroits
    // où un moteur Drupal l'écrit d'ordinaire, et c'est `nombreDeResultats`
    // qui tranche, hors du navigateur, donc sous test. Plus de `h1, h2` : le
    // titre d'une tuile y portait un nombre nu (« 177113 »), pris pour le total
    // alors que la recherche en annonçait 94.
    const compteurs: string[] = [];
    document
      .querySelectorAll(
        "[data-results-count], [data-total-results], [data-count], .js-search-count, [class*='esultsCount'], [class*='esults-count'], [class*='esultCount'], [class*='ountResult']",
      )
      .forEach((n) => {
        for (const attr of ["data-results-count", "data-total-results", "data-count"]) {
          const v = n.getAttribute(attr);
          if (v) compteurs.push(v);
        }
        const t = (n.textContent || "").replace(/\s+/g, " ").trim();
        if (t && t.length <= 120) compteurs.push(t);
      });

    const suivant =
      (document.querySelector("link[rel='next']") as HTMLLinkElement | null)?.href ||
      (document.querySelector("a[rel='next']") as HTMLAnchorElement | null)?.href ||
      (document.querySelector(
        ".pager__item--next a[href], li.pager-next a[href], a.pager__link--next, a.pager-next",
      ) as HTMLAnchorElement | null)?.href ||
      (Array.from(document.querySelectorAll("nav a[href], .pager a[href]")) as HTMLAnchorElement[]).find(
        (a) => /^(suivant|suivante|page suivante|›|»)$/i.test((a.textContent || "").trim()),
      )?.href ||
      null;

    const titreTri =
      document.querySelector(".g2f-searchResult-sorting-title")?.textContent?.replace(/\s+/g, " ").trim() || null;
    const facette =
      document
        .querySelector("a.is-active[data-drupal-facet-item-count], .is-active [data-drupal-facet-item-count]")
        ?.getAttribute("data-drupal-facet-item-count") ?? null;

    return {
      tiles: out,
      compteurs: compteurs.slice(0, 60),
      titreTri,
      facette,
      resultats: liste ? liste.length : null,
      localisee: settings ? Boolean(settings.searchPoint) : null,
      suivant,
    };
  });
}

/**
 * Le nombre de résultats annoncé par le moteur, lu dans les textes ramassés
 * sur la page.
 *
 * Ce qui est cherché, en toutes lettres : un attribut `data-results-count` /
 * `data-total-results` / `data-count`, ou un texte court du genre « 28
 * résultats », « 28 logements », « 28 hébergements ». Si rien de tout cela
 * n'est présent, on rend `null` — et l'appelant pagine alors à l'aveugle
 * jusqu'à sa borne de sécurité, en le disant dans le journal. Aucune page de
 * résultats n'étant figée dans le dépôt, on ne peut pas prouver ici laquelle
 * de ces formes le site emploie : la lecture est donc volontairement large,
 * et ne rend un nombre que s'il est écrit.
 */
export function nombreDeResultats(textes: string[]): number | null {
  for (const brut of textes) {
    const t = (brut || "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (/^\d{1,6}$/.test(t)) return Number(t);
    const m = t.match(
      /(\d[\d\s.]{0,8})\s*(?:r[ée]sultats?|logements?|h[ée]bergements?|locations?|annonces?|offres?)\b/i,
    );
    if (!m) continue;
    const n = Number(m[1].replace(/[\s.]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Page suivante quand le moteur n'en publie pas le lien.
 *
 * `page=N` (indexée à zéro) est la convention du pager Drupal, et le moteur de
 * Gîtes de France en est un ; ce n'est pas une preuve, faute de page figée
 * dans le dépôt. Le repli est donc sans danger par construction : si le
 * paramètre n'a pas cours, la page rendue est la même, aucune tuile nouvelle
 * n'en sort, et la boucle s'arrête d'elle-même.
 */
export function pageSuivante(url: string, deja: number): string | null {
  try {
    const u = new URL(url);
    u.searchParams.set("page", String(deja));
    return u.toString();
  } catch {
    return null;
  }
}

/** Capacité et chambres publiées par le JSON-LD de la fiche ITEA. */
export function occupancyFromGitesHtml(html: string): Occupancy {
  const g =
    html.match(/"numberOfGuests"\s*:\s*"?(\d+)/i)?.[1] ??
    html.match(/"occupancy"\s*:\s*\{[^}]{0,280}"maxValue"\s*:\s*"?(\d+)/i)?.[1];
  const b = html.match(/"numberOfBedrooms"\s*:\s*"?(\d+)/i)?.[1];
  return annoncer({
    capacity: g ? Number(g) : (capaciteFormuleItea(html) ?? null),
    bedrooms: b ? Number(b) : null,
  });
}

/**
 * La devise publiée par la fiche, quand elle l'est.
 *
 * Lecture optionnelle : `priceCurrency` appartient au vocabulaire JSON-LD des
 * offres, mais aucune fiche ITEA n'est figée dans le dépôt, donc rien ne prouve
 * ici qu'elle y figure. Absente, on rend `null` et l'appelant tranche.
 */
export function deviseFromGitesHtml(html: string): string | null {
  const m = html.match(/"priceCurrency"\s*:\s*"([A-Za-z]{3})"/i);
  return m ? m[1].toUpperCase() : null;
}

function texteDeLigne(html: string): string | null {
  const t = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&euro;/gi, "€")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.length > 160) return null;
  return t;
}

function deviseDuTexte(texte: string | null): string | null {
  if (!texte) return null;
  if (/€|\bEUR\b/i.test(texte)) return "EUR";
  if (/\bCHF\b|\bFr\.\s/i.test(texte)) return "CHF";
  return null;
}

/** Ménage, taxe de séjour, caution : des montants, mais pas des totaux de séjour. */
const LIGNE_DE_FRAIS = /m[ée]nage|taxe de s[ée]jour|caution|arrhes|acompte|assurance/i;

export type PrixSejour = {
  total: number;
  /** Le libellé publié de la formule retenue, tel quel. */
  label: string | null;
  currency: string | null;
};

/**
 * Le total de séjour le moins cher du tableau `getHTMLTabPrixFormulesSejour`.
 *
 * Le tableau porte **plusieurs formules** ; le code n'en prenait que la
 * première venue dans l'ordre du DOM, ce qui n'est pas un prix : entre deux
 * formules vendues pour les mêmes dates, c'est la moins chère qui répond à la
 * question posée. On retient donc le plus petit des montants marqués
 * `sp_montantPrixTotal`, et on rend avec lui le libellé publié de sa ligne.
 *
 * **Lecture volontairement défensive.** Aucun HTML de ce tableau n'est figé
 * dans le dépôt : on ne peut prouver ni la forme de ses lignes, ni ce qu'elles
 * contiennent d'autre. On ne lit donc que les montants explicitement marqués
 * comme prix total, on n'en déduit aucun frais — ni ménage, ni taxe de séjour,
 * ni caution ne sont inventés ici —, et on rend `null` dès qu'aucun montant
 * n'est reconnu. Seule précaution prise : une ligne dont le libellé publié
 * parle de ménage, de taxe de séjour ou de caution n'est pas retenue comme
 * total de séjour ; on ne la lit pas pour autant comme un frais, on refuse
 * seulement de la prendre pour ce qu'elle n'est pas.
 */
export function prixDuTableau(html: string): PrixSejour | null {
  const candidats: PrixSejour[] = [];
  for (const ligne of html.split(/(?=<tr\b)/i)) {
    const balises = ligne.match(/<[^>]*\bsp_montantPrixTotal\b[^>]*>/gi);
    if (!balises) continue;
    const label = texteDeLigne(ligne);
    if (label && LIGNE_DE_FRAIS.test(label)) continue;
    for (const balise of balises) {
      const m = balise.match(/data-prix=["']([\d.,]+)["']/i);
      if (!m) continue;
      const n = Number(m[1].replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) continue;
      candidats.push({
        total: Math.round(n * 100) / 100,
        label,
        currency: deviseDuTexte(label),
      });
    }
  }
  if (candidats.length === 0) return null;
  candidats.sort((a, b) => a.total - b.total);
  return candidats[0];
}

export type Fiche = {
  /** Total du séjour. `0` = la source n'a publié aucun prix à ces dates. */
  total: number;
  currency: string | null;
  priceLabel: string | null;
  occupancy: Occupancy;
  lieu: LieuGites;
  /** `data-ident` ITEA (« 38G40102.G »), l'identifiant du bien chez l'hébergeur. */
  platformId: string | null;
  /** La description publiée par le JSON-LD de la fiche, en texte. */
  description?: string | null;
  /** La note et le nombre d'avis du JSON-LD (`aggregateRating`), bruts. */
  avis?: AvisGites | null;
};

/** La note brute du JSON-LD, son échelle **si la fiche l'écrit** (`bestRating`), et le nombre d'avis. */
export type AvisGites = { noteSource: unknown; echelleSource: unknown; nombre: unknown; extraits: [] };

/**
 * L'`aggregateRating` du JSON-LD de la fiche ITEA, tel quel. Les fiches
 * relevées n'écrivent pas `bestRating` : leur note n'a pas d'échelle, et
 * reste sans note sur 5 (`noterSur5`) ; seul le nombre d'avis se lit.
 */
export function avisFromGitesHtml(html: string): AvisGites | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let ld: unknown;
    try {
      ld = JSON.parse(m[1] ?? "");
    } catch {
      continue;
    }
    const r = ld && typeof ld === "object" ? (ld as { aggregateRating?: unknown }).aggregateRating : null;
    if (r && typeof r === "object") {
      const o = r as Record<string, unknown>;
      return { noteSource: o.ratingValue, echelleSource: o.bestRating ?? null, nombre: o.reviewCount ?? o.ratingCount, extraits: [] };
    }
  }
  return null;
}

/**
 * La description du JSON-LD de la fiche ITEA (`LodgingBusiness.description`),
 * en texte : elle est écrite en entités (« am&eacute;nag&eacute; »). `null`
 * sans JSON-LD ou sans texte.
 */
export function descriptionFromGitesHtml(html: string): string | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let brut: unknown = null;
    try {
      brut = (JSON.parse(m[1] ?? "") as { description?: unknown }).description;
    } catch {
      brut = /"description"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(m[1] ?? "")?.[1] ?? null;
    }
    const texte = typeof brut === "string" ? texteDeHtml(brut) : null;
    if (texte) return texte;
  }
  return null;
}

/**
 * Le devis ITEA ne remplace que le prix. Description, avis, lieu, capacité
 * et identifiant déjà lus sur la fiche restent : un montant publié ne les
 * efface pas.
 */
export function ficheAvecDevis(
  base: Fiche,
  prix: { total: number; currency: string | null; label: string | null },
): Fiche {
  return {
    ...base,
    total: prix.total,
    currency: prix.currency ?? base.currency,
    priceLabel: prix.label,
  };
}

/**
 * La fiche ITEA d'un gîte : un seul téléchargement, tout ce qu'elle publie.
 *
 * Ce HTML portait déjà la capacité et les chambres ; il porte aussi le lieu
 * (JSON-LD `geo` et `addressLocality`), qui était jeté ici pour être
 * retéléchargé ensuite par `gitesGps.server.ts` — et perdu quand le budget de
 * ce second passage expirait.
 *
 * Rend `null` dans un seul cas : la source déclare elle-même le produit hors
 * périmètre (identifiant qui ne finit pas par `.G`, donc chambre d'hôtes ou
 * gîte de groupe). Une fiche illisible ou sans prix ressort au contraire, avec
 * ce qu'on a pu en lire : c'est le filtre de l'écran qui décide de la montrer
 * ou non, pas le collecteur.
 */
async function relever(
  code: string,
  checkIn: string,
  checkOut: string,
  guests: number,
  fin: number = Date.now() + 3 * DELAI_FICHE_MS,
): Promise<Fiche | null> {
  // Chaque appel a son délai, tiré du temps qui reste à la fiche : un fetch
  // sans délai pouvait attendre ITEA indéfiniment, et tenir toute la
  // recherche avec lui ; un délai par appel laissait trois appels lents
  // déborder ensemble.
  const signal = () => AbortSignal.timeout(Math.max(1_000, Math.min(DELAI_FICHE_MS, fin - Date.now())));
  const rep = await fetch(gitesWidgetUrl(code), {
    headers: { "Accept-Language": "fr-FR", "User-Agent": SCRAPE_UA },
    signal: signal(),
  });
  // Un refus se respecte : on ne lit pas la page de défi comme une fiche vide.
  if (rep.status === 403 || rep.status === 429 || rep.status === 503) {
    await rep.body?.cancel().catch(() => undefined);
    throw new Error(`ITEA HTTP ${rep.status}`);
  }
  const html = await rep.text();
  const occupancy = occupancyFromGitesHtml(html);
  const lieu = lieuFromGitesHtml(html);
  retenirLieuGites(code, lieu);
  const devise = deviseFromGitesHtml(html);
  const ident = html.match(/data-ident="([^"]+)"/)?.[1];
  const instance = html.match(/data-instance="([^"]+)"/)?.[1];
  const exercice0 = html.match(/data-exercice="([^"]+)"/)?.[1];
  const sansDevis: Fiche = {
    total: 0,
    currency: devise,
    priceLabel: null,
    occupancy,
    lieu,
    platformId: ident && ident !== code ? ident : null,
    description: descriptionFromGitesHtml(html),
    avis: avisFromGitesHtml(html),
  };
  if (!ident || !instance || !exercice0) return sansDevis;
  if (!/\.G$/i.test(ident)) return null;
  const post = async (exercice: string, type: string) => {
    const body = new URLSearchParams({
      nbAdultes: String(guests),
      dateDeb: isoToFr(checkIn),
      dateFin: isoToFr(checkOut),
      instance,
      ident,
      exercice,
      estpresentsurfiche: "true",
      type,
    });
    const res = await fetch("https://widget-fngf.itea.fr/lib_2/ajax/gereResa.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://widget-fngf.itea.fr",
        Referer: gitesWidgetUrl(code),
      },
      body,
      signal: signal(),
    });
    return res.text();
  };
  let exercice = exercice0;
  try {
    const exo = JSON.parse(await post(exercice, "getExerciceByDateFin")) as { exercice?: string };
    if (exo.exercice) exercice = String(exo.exercice);
  } catch {
    /* HTML */
  }
  const tab = await post(exercice, "getHTMLTabPrixFormulesSejour");
  // « contactSiNonVendable » : la source ne vend pas ce séjour en ligne à ces
  // dates. Elle ne publie donc pas de prix, ce qui se dit `total: 0` — et non
  // par la disparition de l'annonce.
  const prix = /contactSiNonVendable/.test(tab) ? null : prixDuTableau(tab);
  if (!prix) return sansDevis;
  // Le devis ne remplace que le prix. Recopier les champs un à un avait
  // laissé l'avis du JSON-LD sur le chemin sans prix, et l'avait perdu dès
  // qu'un montant était publié.
  return ficheAvecDevis(sansDevis, prix);
}

/**
 * La tuile et sa fiche, réunies en une annonce.
 *
 * Rien n'est écarté ici : une capacité plus petite que la demande, une
 * capacité absente ou un prix absent restent des faits publiés (ou tus), et
 * `stay/lodgingFilter.ts` sait les distinguer et compter ce qu'il masque.
 */
export function listingDeFiche(
  tile: Tile,
  fiche: Fiche,
  code: string,
  input: LiveSearchInput,
): Listing {
  // La capacité se relit sur le titre et sur la seule ligne de capacité de la
  // tuile — jamais sur tout le texte de la tuile, où traînent des nombres qui
  // ne parlent pas de personnes.
  // Capacité et chambres viennent du JSON-LD de la fiche ITEA : un champ
  // structuré. À défaut, la ligne de capacité de la tuile, un élément dédié
  // (`.g2f-accommodationTile-text-capacity`, « 4 personnes ») ; le titre et
  // une fourchette de cette ligne se lisent comme du texte.
  const capaciteTuile = /^(\d{1,2})\s*personnes?\b/i.exec(tile.capacite.trim())?.[1];
  const occ = annoncer(
    {
      ...fiche.occupancy,
      capacity: fiche.occupancy.capacity ?? (capaciteTuile ? Number(capaciteTuile) : null),
    },
    tile.title,
    tile.capacite,
  );
  const dates = `${input.checkIn}→${input.checkOut}`;
  const proven =
    fiche.total > 0
      ? `Devis ITEA live ${dates}, ${input.guests} pers.`
      : `Fiche ITEA live ${dates}, ${input.guests} pers. — aucun prix publié à ces dates.`;
  return {
    id: code,
    stationId: input.stationId,
    title: tile.title,
    source: "Gîtes de France",
    total: fiche.total,
    // La devise n'est pas facultative dans le modèle : faute de devise
    // publiée, on garde celle du pays où Gîtes de France vend, sans prétendre
    // l'avoir lue.
    currency: fiche.currency ?? "EUR",
    capacity: occ.capacity,
    bedrooms: occ.bedrooms,
    rooms: occ.rooms,
    capacityStandard: occ.capacityStandard,
    capacitySource: occ.capacitySource,
    bedroomsSource: occ.bedroomsSource,
    isStudio: occ.isStudio,
    propertyType: tile.typeLabel || null,
    // La description de la fiche, et les équipements qu'elle nomme.
    ...(fiche.description ? { description: fiche.description, amenities: equipements(depuisTexte(fiche.description)) } : {}),
    // La fiche : sa description et son nombre d'avis, tels que le JSON-LD les
    // publie. Pas d'équipement tiré de la description, pas de note sans échelle.
    ...ficheGites(fiche, `${tile.url}`),
    priceLabel: fiche.priceLabel,
    platformId: fiche.platformId,
    available: true,
    photo: tile.photo,
    url: `${tile.url}?adults=${input.guests}&date-start=${input.checkIn}&date-end=${input.checkOut}`,
    lat: fiche.lieu.lat,
    lon: fiche.lieu.lon,
    locality: fiche.lieu.locality,
    proven: fiche.lieu.lat != null && fiche.lieu.lon != null ? `${proven} · GPS ITEA` : proven,
  };
}

function ficheGites(fiche: Fiche, url: string): Pick<Listing, "fiche"> | Record<string, never> {
  const f = ficheDepuisBrut({ description: fiche.description, avis: fiche.avis }, "gites", { url });
  return f ? { fiche: f } : {};
}

/**
 * Une tuile de recherche dont la fiche ITEA n'a pas été lue.
 *
 * Le budget de politesse, une échéance ou un ITEA muet ne font plus
 * disparaître le gîte : la tuile publie déjà un titre, un type, une photo,
 * parfois une position et une ligne « N personnes ». Le total reste 0 — la
 * tuile ne porte pas de prix — et ni description, ni avis, ni équipement
 * n'est posé : ils ne vivent que sur la fiche.
 */
export function listingDeTuile(tile: Tile, code: string, input: LiveSearchInput): Listing {
  const capaciteTuile = /^(\d{1,2})\s*personnes?\b/i.exec(tile.capacite.trim())?.[1];
  const occ = annoncer(
    { capacity: capaciteTuile ? Number(capaciteTuile) : null, bedrooms: null, rooms: null },
    tile.title,
    tile.capacite,
  );
  const dates = `${input.checkIn}→${input.checkOut}`;
  const position = tile.lat != null && tile.lon != null;
  return {
    id: code,
    stationId: input.stationId,
    title: tile.title,
    source: "Gîtes de France",
    total: 0,
    // La tuile ne publie pas de devise. Même convention qu'une fiche muette :
    // EUR, sans prétendre l'avoir lue.
    currency: "EUR",
    capacity: occ.capacity,
    bedrooms: occ.bedrooms,
    rooms: occ.rooms,
    capacityStandard: occ.capacityStandard,
    capacitySource: occ.capacitySource,
    bedroomsSource: occ.bedroomsSource,
    isStudio: occ.isStudio,
    propertyType: tile.typeLabel || null,
    available: true,
    photo: tile.photo,
    url: `${tile.url}?adults=${input.guests}&date-start=${input.checkIn}&date-end=${input.checkOut}`,
    lat: tile.lat,
    lon: tile.lon,
    proven: `Tuile Gîtes de France live ${dates}, ${input.guests} pers. — fiche ITEA non lue${
      position ? " · position publiée par la recherche" : ""
    }`,
  };
}

/** Entre deux fiches de la suite : un seul ouvrier, plus lent que les quatre du relevé. */
const PAUSE_SUITE_GITES_MS = 2_000;
/** La suite ne dure pas plus. Au-delà, la recherche suivante reprend le reste. */
const SUITE_GITES_MAX_MS = 8 * 60 * 1000;
/** Ce qui a été lu vaut une heure : les disponibilités bougent. */
const DUREE_MEMOIRE_GITES_MS = 60 * 60 * 1000;

export type ResteGites = { tile: Tile; code: string };

export type OutilsSuiteGites = {
  relever: (code: string, checkIn: string, checkOut: string, guests: number, fin: number) => Promise<Fiche | null>;
  attendre: (ms: number) => Promise<void>;
  maintenant: () => number;
  /** Posé dès qu'une fiche est lue, pour que l'écran n'attende pas la fin. */
  noter?: (listing: Listing) => void;
};

export type BilanSuiteGites = {
  listings: Listing[];
  arret: "fin" | "refus" | "échéance";
  lues: number;
};

/**
 * Les fiches ITEA que le budget interactif n'a pas lues.
 *
 * Une à la fois, `PAUSE_SUITE_GITES_MS` entre deux. Un HTTP 403, 429 ou 503
 * arrête tout de suite, sans reprise. Trois autres échecs d'affilée aussi.
 * `null` est un hors-périmètre déclaré par la source, pas un échec.
 * L'échéance rend ce qui a déjà été lu.
 */
export async function lireFichesEnRetard(
  reste: readonly ResteGites[],
  input: LiveSearchInput,
  echeance: number,
  o: OutilsSuiteGites,
): Promise<BilanSuiteGites> {
  const listings: Listing[] = [];
  let echecs = 0;
  for (let i = 0; i < reste.length; i++) {
    if (o.maintenant() >= echeance) return { listings, arret: "échéance", lues: i };
    if (echecs >= ECHECS_DISJONCTEUR) return { listings, arret: "refus", lues: i };
    await o.attendre(PAUSE_SUITE_GITES_MS);
    if (o.maintenant() >= echeance) return { listings, arret: "échéance", lues: i };
    const { tile, code } = reste[i]!;
    try {
      const fiche = await o.relever(code, input.checkIn, input.checkOut, input.guests, echeance);
      echecs = 0;
      if (fiche) {
        const listing = listingDeFiche(tile, fiche, code, input);
        listings.push(listing);
        o.noter?.(listing);
      }
    } catch (err) {
      echecs += 1;
      const msg = err instanceof Error ? err.message : String(err);
      if (/HTTP (403|429|503)/.test(msg) || echecs >= ECHECS_DISJONCTEUR) {
        return { listings, arret: "refus", lues: i + 1 };
      }
    }
  }
  return { listings, arret: "fin", lues: reste.length };
}

type MemoireGites = { a: number; listings: Listing[]; enCours: boolean; finie: boolean };
const gitesGlobal = globalThis as typeof globalThis & { __skitrackSuiteGites__?: Map<string, MemoireGites> };

function memoiresGites(): Map<string, MemoireGites> {
  return (gitesGlobal.__skitrackSuiteGites__ ??= new Map());
}

export function cleSuiteGites(input: Pick<LiveSearchInput, "stationId" | "checkIn" | "checkOut" | "guests">): string {
  return `${input.stationId}|${input.checkIn}|${input.checkOut}|${input.guests}`;
}

/** Les fiches déjà lues en tâche de fond pour ces dates. Aucun appel réseau. */
export function lireMemoireGites(input: Pick<LiveSearchInput, "stationId" | "checkIn" | "checkOut" | "guests">): Listing[] {
  const cle = cleSuiteGites(input);
  const s = memoiresGites().get(cle);
  if (!s) return [];
  if (!s.enCours && Date.now() - s.a > DUREE_MEMOIRE_GITES_MS) {
    memoiresGites().delete(cle);
    return [];
  }
  return s.listings;
}

/** La fiche lue remplace la tuile du même identifiant. Rien d'autre n'est ajouté. */
export function couvrirTuiles(tuiles: readonly Listing[], memoire: readonly Listing[]): Listing[] {
  if (memoire.length === 0) return [...tuiles];
  const par = new Map(memoire.map((l) => [l.id, l]));
  return tuiles.map((l) => par.get(l.id) ?? l);
}

function lancerSuiteGites(input: LiveSearchInput, reste: readonly ResteGites[]): void {
  if (reste.length === 0) return;
  const map = memoiresGites();
  for (const s of map.values()) if (s.enCours) return;
  const cle = cleSuiteGites(input);
  const etat = map.get(cle);
  if (etat?.finie && Date.now() - etat.a < DUREE_MEMOIRE_GITES_MS) return;
  const connus = new Set((etat?.listings ?? []).map((l) => l.id));
  const encore = reste.filter((r) => !connus.has(r.code));
  if (encore.length === 0) return;
  const listings = [...(etat?.listings ?? [])];
  map.set(cle, { a: Date.now(), listings, enCours: true, finie: false });
  const echeance = Date.now() + SUITE_GITES_MAX_MS;
  void lireFichesEnRetard(encore, input, echeance, {
    relever,
    attendre: sleep,
    maintenant: () => Date.now(),
    noter: (l) => {
      listings.push(l);
      const s = map.get(cle);
      if (s) s.a = Date.now();
    },
  })
    .then((b) => {
      map.set(cle, {
        a: Date.now(),
        listings,
        enCours: false,
        // Une échéance se reprend à la recherche suivante. Un refus, non.
        finie: b.arret !== "échéance",
      });
      console.info(`[gites] suite ${cle} : ${b.listings.length} fiche(s), arrêt « ${b.arret} »`);
    })
    .catch(() => {
      const s = map.get(cle);
      if (s) s.enCours = false;
    });
}

export type OptionsGites = {
  /** Instant absolu (`Date.now()`) après lequel aucune fiche ITEA n'est plus lancée. */
  finFiches?: number;
};

export async function scrapeGites(page: Page, input: LiveSearchInput, opts: OptionsGites = {}): Promise<Listing[]> {
  const commune = communeGites(input.stationId);
  if (!commune) {
    // Sans code de commune, le moteur cherche dans toute la France : on ne
    // lance rien, et le rapport de source le dit.
    throw new Error(`pas d'identifiant de commune Gîtes de France pour ${input.stationName}`);
  }
  await allowsPath("https://www.gites-de-france.com", "/");
  const debut = Date.now();
  const vues = new Map<string, Tile>();
  let compteur: number | null = null;
  let url = searchUrl(input, commune.towns);
  let pages = 0;
  let arret = "fin des pages";
  // Le moteur publie un nombre de résultats : on pagine jusqu'à lui. Une seule
  // page était relevée, puis la liste était coupée net, sans que rien ne dise
  // ce qui restait derrière.
  //
  // Le compteur peut porter sur tout ce que la recherche rend, y compris les
  // produits qu'on écarte du périmètre (gîte de groupe, chambre d'hôtes) : on
  // ne l'atteindra donc pas toujours, et c'est la borne de sécurité qui ferme
  // la boucle, en le disant.
  for (;;) {
    let lot: Moisson;
    let refus: string | null = null;
    try {
      // La première page, c'est la source elle-même : si elle ne répond pas,
      // l'échec remonte et se journalise comme tel. Les suivantes ne valent
      // pas qu'on perde le relevé déjà fait : on s'arrête avec ce qu'on a.
      const rep = await page.goto(url, { waitUntil: "domcontentloaded", timeout: pages === 0 ? 22_000 : 12_000 });
      refus = blocage({
        status: rep?.status() ?? null,
        cfMitigated: rep?.headers()["cf-mitigated"] ?? null,
        titre: await page.title().catch(() => null),
      });
      if (refus) throw new Error(`Gîtes de France ${refus}`);
      await page
        .waitForSelector(".js-search-tile, .g2f-accommodationTile", { timeout: 10_000 })
        .catch(() => null);
      lot = await lirePage(page);
    } catch (err) {
      if (pages === 0) throw err;
      arret = refus ?? `page ${pages + 1} non chargée (${err instanceof Error ? err.message : String(err)})`;
      break;
    }
    pages += 1;
    if (pages === 1) {
      compteur = totalPublie(lot);
      // Un total national, c'est un code de commune faux ou périmé : les gîtes
      // de la page seraient n'importe où en France. On le dit, sans fiche ITEA.
      if (compteur != null && compteur >= SEUIL_NATIONAL) {
        throw new Error(
          `recherche Gîtes de France non localisée (towns=${commune.towns}, ${compteur} résultats) — code de commune à revérifier`,
        );
      }
      if (lot.localisee === false) console.warn(`[gites] point de recherche absent (towns=${commune.towns})`);
    }
    compteur ??= nombreDeResultats(lot.compteurs);
    let neuves = 0;
    for (const t of lot.tiles) {
      if (vues.has(t.url)) continue;
      vues.set(t.url, t);
      neuves += 1;
    }
    if (neuves === 0) {
      arret = "page sans tuile nouvelle";
      break;
    }
    if (compteur != null && vues.size >= compteur) {
      arret = `compteur atteint (${compteur})`;
      break;
    }
    if (pages >= MAX_PAGES) {
      arret = `borne de sécurité ${MAX_PAGES} pages`;
      break;
    }
    if (Date.now() - debut > BUDGET_PAGES_MS) {
      arret = `budget de ${BUDGET_PAGES_MS / 1000} s dépassé`;
      break;
    }
    const suite = lot.suivant ?? pageSuivante(url, pages);
    if (!suite || suite === url) {
      arret = "aucune page suivante publiée";
      break;
    }
    url = suite;
    await sleep(PAUSE_PAGE_MS);
  }
  console.info(
    `[gites] ${vues.size} tuile(s) en ${pages} page(s) · compteur publié : ${compteur ?? "aucun"} · arrêt : ${arret}`,
  );

  // Le temps des fiches se compte depuis la fin de la pagination : compté
  // depuis le début, il était déjà mangé par elle quand elle passait.
  const finFiches =
    opts.finFiches ?? Math.min(debut + PLAFOND_GITES_MS, Date.now() + RESERVE_FICHES_MS);
  const candidats = trierParDistance(
    [...vues.values()].filter((t) => codeFromUrl(t.url)),
    { lat: input.lat, lon: input.lon },
  );
  const need = candidats.slice(0, MAX_FICHES);
  if (candidats.length > need.length) {
    console.info(
      `[gites] ${candidats.length - need.length} tuile(s) au-delà du budget ITEA de ${MAX_FICHES} : la tuile sort tout de suite, la fiche se lit ensuite`,
    );
  }
  const out: Listing[] = [];
  // Codes déjà tranchés : fiche lue, ou produit hors périmètre (identifiant
  // qui ne finit pas par `.G`). Le reste de la recherche sort depuis la tuile.
  const deja = new Set<string>();
  let horsPerimetre = 0;
  let manquees = 0;
  let echecsDeSuite = 0;
  let nonInterrogees = 0;
  let coupure: string | null = null;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(WORKERS, need.length) }, async () => {
      for (;;) {
        if (coupure) return;
        if (Date.now() >= finFiches) {
          coupure = "échéance";
          return;
        }
        const i = cursor++;
        if (i >= need.length) return;
        const tile = need[i];
        const code = codeFromUrl(tile.url);
        if (!code) continue;
        try {
          const fiche = await relever(code, input.checkIn, input.checkOut, input.guests, finFiches);
          echecsDeSuite = 0;
          if (fiche == null) {
            horsPerimetre += 1;
            deja.add(code);
          } else {
            out.push(listingDeFiche(tile, fiche, code, input));
            deja.add(code);
          }
        } catch {
          // ITEA n'a pas répondu : la tuile, plus bas, porte l'annonce sans
          // prix. On compte l'échec, et plusieurs d'affilée coupent la file.
          manquees += 1;
          echecsDeSuite += 1;
          // Plusieurs échecs d'affilée : ITEA ne répond plus. Inutile de lui
          // envoyer le reste de la file, ni de retenir la recherche.
          if (echecsDeSuite >= ECHECS_DISJONCTEUR) coupure ??= "ITEA injoignable";
        }
        // Un souffle entre deux fiches du même ouvrier : le widget ITEA est un
        // hôte tiers, et rien n'oblige à l'appeler aussi vite qu'on le peut.
        await sleep(PAUSE_FICHE_MS);
      }
    }),
  );
  if (coupure) nonInterrogees = Math.max(0, need.length - cursor);
  if (horsPerimetre || manquees || nonInterrogees) {
    const coupe = coupure ? ` · ${nonInterrogees} non interrogée(s) : ${coupure}` : "";
    console.info(`[gites] ${horsPerimetre} hors périmètre · ${manquees} fiche(s) illisibles${coupe}`);
  }
  let depuisTuile = 0;
  const reste: ResteGites[] = [];
  for (const tile of candidats) {
    const code = codeFromUrl(tile.url);
    if (!code || deja.has(code)) continue;
    deja.add(code);
    out.push(listingDeTuile(tile, code, input));
    reste.push({ tile, code });
    depuisTuile += 1;
  }
  if (depuisTuile) {
    console.info(
      `[gites] ${depuisTuile} tuile(s) sans fiche ITEA pour l'instant : description, avis et devis des dates lues ensuite, une à une`,
    );
  }
  const memoire = lireMemoireGites(input);
  lancerSuiteGites(input, reste);
  // `total: 0` veut dire « prix non publié », pas « gratuit » : ces annonces
  // passent après celles qui portent un prix, jamais devant. Une fiche déjà
  // lue en tâche de fond remplace sa tuile, sans rien ajouter d'autre.
  return couvrirTuiles(out, memoire).sort((a, b) => {
    const pa = a.total > 0 ? a.total : null;
    const pb = b.total > 0 ? b.total : null;
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb;
  });
}
