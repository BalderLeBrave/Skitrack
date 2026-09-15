import type { Page } from "playwright";
import type { Listing } from "@/lib/listings";
import { SCRAPE_UA, sleep } from "./browser.server.ts";
import { allowsPath } from "./robots.ts";
import type { LiveSearchInput } from "./types";
import { annoncer, type Occupancy } from "../stay/occupancy.ts";
import { gitesWidgetUrl, lieuFromGitesHtml, type LieuGites } from "./gitesGps.server.ts";

/**
 * Bornes du relevé, toutes explicites.
 *
 * `MAX_PAGES` et `BUDGET_PAGES_MS` sont des bornes de **sécurité** : c'est le
 * compteur publié par le moteur de recherche qui commande la pagination, et
 * elles ne servent qu'à ne pas tourner indéfiniment si ce compteur est absent
 * ou faux. Le motif d'arrêt est journalisé à chaque fois.
 *
 * `MAX_FICHES` est un budget de politesse envers `widget-fngf.itea.fr`, un
 * hôte tiers : ce n'est pas un filtre sur les résultats, et ce qu'il laisse de
 * côté est compté et journalisé. On interroge moins de fiches en parallèle
 * qu'avant (quatre au lieu de huit) et on souffle entre deux : le rythme ne
 * peut que se calmer.
 */
const MAX_PAGES = 6;
const BUDGET_PAGES_MS = 20_000;
/** Même intervalle que `politesse.ts` entre deux appels à un même hôte. */
const PAUSE_PAGE_MS = 2_000;
const MAX_FICHES = 24;
const WORKERS = 4;
const PAUSE_FICHE_MS = 250;

function townsId(name: string): string | null {
  const n = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (n.includes("deux alpes") || /(?:^|[^a-z0-9])2[\s-]?alpes(?:$|[^a-z0-9])/.test(n)) {
    return "50301";
  }
  if (n.includes("karellis") || n.includes("montricher")) return "64400";
  if (/angles-sur-correze/.test(n)) return null;
  if (/\bles angles\b/.test(n) || n.includes("les-angles")) return "61540";
  if (/vars-sur-roseix/.test(n)) return null;
  if (/\bvars\b/.test(n) || n.includes("foret blanche")) return "38123";
  return null;
}

function searchUrl(input: LiveSearchInput): string {
  const u = new URL("https://www.gites-de-france.com/fr/search");
  const towns = townsId(input.stationName);
  if (towns) {
    u.searchParams.set("towns", towns);
    u.searchParams.set("travelers", String(input.guests));
  } else {
    u.searchParams.set("destination", input.stationName);
    u.searchParams.set("adults", String(input.guests));
  }
  u.searchParams.set("date-start", input.checkIn);
  u.searchParams.set("date-end", input.checkOut);
  u.searchParams.set("f[0]", "type:36172");
  return u.toString();
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
};

type Moisson = {
  tiles: Tile[];
  /** Textes courts susceptibles de porter le compteur de résultats. */
  compteurs: string[];
  /** Lien « page suivante » publié par le moteur, s'il y en a un. */
  suivant: string | null;
};

async function lirePage(page: Page): Promise<Moisson> {
  return page.evaluate(() => {
    const out: Tile[] = [];
    const seen = new Set<string>();
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
      out.push({
        title,
        url: href.split("?")[0],
        typeLabel,
        capacite,
        photo: photo && /^https?:/.test(photo) ? photo : null,
      });
    });

    // Le compteur de résultats : on ramasse ici les textes courts des endroits
    // où un moteur Drupal l'écrit d'ordinaire, et c'est `nombreDeResultats`
    // qui tranche, hors du navigateur, donc sous test.
    const compteurs: string[] = [];
    document
      .querySelectorAll(
        "[data-results-count], [data-total-results], [data-count], .js-search-count, [class*='esultsCount'], [class*='esults-count'], [class*='esultCount'], [class*='ountResult'], h1, h2",
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

    return { tiles: out, compteurs: compteurs.slice(0, 60), suivant };
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
    guests: g ? Number(g) : null,
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
};

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
): Promise<Fiche | null> {
  const html = await fetch(gitesWidgetUrl(code), {
    headers: { "Accept-Language": "fr-FR", "User-Agent": SCRAPE_UA },
  }).then((r) => r.text());
  const occupancy = occupancyFromGitesHtml(html);
  const lieu = lieuFromGitesHtml(html);
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
  return {
    total: prix.total,
    currency: prix.currency ?? devise,
    priceLabel: prix.label,
    occupancy,
    lieu,
    platformId: sansDevis.platformId,
  };
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
  const occ = annoncer(fiche.occupancy, tile.title, tile.capacite);
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
    guests: occ.guests,
    bedrooms: occ.bedrooms,
    rooms: occ.rooms,
    propertyType: tile.typeLabel || null,
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

export async function scrapeGites(page: Page, input: LiveSearchInput): Promise<Listing[]> {
  await allowsPath("https://www.gites-de-france.com", "/");
  const debut = Date.now();
  const vues = new Map<string, Tile>();
  let compteur: number | null = null;
  let url = searchUrl(input);
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
    try {
      // La première page, c'est la source elle-même : si elle ne répond pas,
      // l'échec remonte et se journalise comme tel. Les suivantes ne valent
      // pas qu'on perde le relevé déjà fait : on s'arrête avec ce qu'on a.
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: pages === 0 ? 22_000 : 12_000 });
      await page
        .waitForSelector(".js-search-tile, .g2f-accommodationTile", { timeout: 10_000 })
        .catch(() => null);
      lot = await lirePage(page);
    } catch (err) {
      if (pages === 0) throw err;
      arret = `page ${pages + 1} non chargée (${err instanceof Error ? err.message : String(err)})`;
      break;
    }
    pages += 1;
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

  const candidats = [...vues.values()].filter((t) => codeFromUrl(t.url));
  const need = candidats.slice(0, MAX_FICHES);
  if (candidats.length > need.length) {
    console.info(
      `[gites] ${candidats.length - need.length} tuile(s) non interrogées : budget ITEA de ${MAX_FICHES} fiches`,
    );
  }
  const out: Listing[] = [];
  let horsPerimetre = 0;
  let manquees = 0;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(WORKERS, need.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= need.length) return;
        const tile = need[i];
        const code = codeFromUrl(tile.url);
        if (!code) continue;
        try {
          const fiche = await relever(code, input.checkIn, input.checkOut, input.guests);
          if (fiche == null) horsPerimetre += 1;
          else out.push(listingDeFiche(tile, fiche, code, input));
        } catch {
          // Une fiche rate : on ne sait rien de son prix, donc on ne rend pas
          // d'annonce — mais on la compte, pour que le silence se voie.
          manquees += 1;
        }
        // Un souffle entre deux fiches du même ouvrier : le widget ITEA est un
        // hôte tiers, et rien n'oblige à l'appeler aussi vite qu'on le peut.
        await sleep(PAUSE_FICHE_MS);
      }
    }),
  );
  if (horsPerimetre || manquees) {
    console.info(`[gites] ${horsPerimetre} hors périmètre · ${manquees} fiche(s) illisibles`);
  }
  // `total: 0` veut dire « prix non publié », pas « gratuit » : ces annonces
  // passent après celles qui portent un prix, jamais devant.
  return out.sort((a, b) => {
    const pa = a.total > 0 ? a.total : null;
    const pb = b.total > 0 ? b.total : null;
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb;
  });
}
