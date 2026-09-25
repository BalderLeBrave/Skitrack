/**
 * Ce qu'une fiche peut combler, avant de l'ouvrir.
 *
 * `fillFiches` ouvre la page d'une annonce trouée et y lit capacité, chambres,
 * GPS, titre. Lue en HTTP simple, la page ne porte pas tout, selon l'hôte :
 * l'ouvrir pour un trou qu'elle ne publie pas est une requête perdue, et
 * chaque nouvelle recherche la renverrait.
 *
 * Mesuré le 23 septembre 2026 (Avoriaz, 6→13/02/2027, 2 personnes) :
 * - abritel.fr rend le GPS et le titre, ni capacité ni chambres (p1486890,
 *   p2125874) ;
 * - booking.com répond 202, un défi AWS WAF : la « lecture » n'en tirait que
 *   le titre « JavaScript is disabled » ;
 * - la fiche Airbnb `rooms/` rend tout, mais ne s'ouvre que pour un GPS vide :
 *   c'est ce fetch qui ouvre le 429. Règle inchangée ;
 * - la page hôte GreenGo (www.greengo.voyage/hote/…, environ 1 Mo) ne donne
 *   rien de sûr : sa lecture a rendu « 2 personnes », tiré d'une activité. La
 *   capacité, les chambres et le total viennent du détail de l'API, que le
 *   relevé lit lui-même, à son rythme. Relu le 24 septembre 2026.
 *
 * Un hôte absent de la table est tenté ; le disjoncteur l'arrête s'il ne
 * comble rien.
 */

import type { Listing } from "../listings.ts";
import { estHoteAirbnb } from "./http429.ts";
import { titreEstFichier } from "./titre.ts";

export type Trou = "capacite" | "chambres" | "gps" | "titre";

export function plausible(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function trousDe(l: Listing): Trou[] {
  const out: Trou[] = [];
  if (l.guests == null) out.push("capacite");
  if (l.bedrooms == null && (l.rooms == null || l.rooms <= 0)) out.push("chambres");
  if (!plausible(l.lat, l.lon)) out.push("gps");
  if (titreEstFichier(l.title)) out.push("titre");
  return out;
}

export function hoteDe(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Les hôtes dont on sait ce que la fiche publie en HTTP simple. */
const PRISES: ReadonlyArray<{ nom: string; hote: RegExp; prise: ReadonlySet<Trou> }> = [
  { nom: "booking.com", hote: /(^|\.)booking\.com$/i, prise: new Set() },
  { nom: "abritel.fr", hote: /(^|\.)abritel\.fr$/i, prise: new Set(["gps", "titre"]) },
  { nom: "greengo.voyage", hote: /(^|\.)greengo\.voyage$/i, prise: new Set() },
];

/**
 * Une URL ramenée à ce qui désigne la page : sans fragment, hôte en
 * minuscules, sans barre finale. La requête reste : chez iResa, deux fiches ne
 * diffèrent que par `?package=`.
 */
export function cleUrl(url: string): string {
  try {
    const u = new URL(url);
    const chemin = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.toLowerCase()}${chemin}${u.search}`;
  } catch {
    return url.trim();
  }
}

/**
 * Les paramètres de dates que les collecteurs ajoutent à l'URL d'une fiche :
 * Airbnb `check_in`, Abritel `chkin` et `startDate`, Booking `checkin`, Gîtes
 * `date-start`, Open System `DateRecherche`. Casse ignorée.
 */
const PARAMS_DATES: ReadonlySet<string> = new Set([
  "check_in",
  "check_out",
  "checkin",
  "checkout",
  "chkin",
  "chkout",
  "startdate",
  "enddate",
  "date-start",
  "date-end",
  "daterecherche",
]);

/**
 * La clé d'une page de fiche dans un cache de lectures : `cleUrl`, moins les
 * seuls paramètres de dates connus. La même fiche, à d'autres dates, publie
 * la même capacité et le même point ; le reste de la requête désigne la
 * fiche (iResa : `?package=`), et deux fiches ne se prêtent jamais leur
 * lecture.
 */
export function clePage(url: string): string {
  try {
    const u = new URL(url);
    const dates = [...u.searchParams.keys()].filter((k) => PARAMS_DATES.has(k.toLowerCase()));
    for (const k of new Set(dates)) u.searchParams.delete(k);
    return cleUrl(u.toString());
  } catch {
    return cleUrl(url);
  }
}

/** Le dernier mot d'un chemin qui dit une page de recherche ou de liste, pas un logement. */
const MOT_DE_RECHERCHE =
  /^(?:recherche|rechercher|search|resultats?|results?|liste|hebergements?|locations?|reservation)$/i;

/**
 * La racine du site, ou sa page de recherche : une page qui ne décrit aucun
 * logement. Arkiane donne l'accueil pour toutes ses annonces, Feratel
 * `/reservation/hebergements` : lue comme une fiche, elle posait le point et
 * la taxe de séjour de l'office sur chacune.
 */
export function estPageDeSite(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const segments = u.pathname
    .split("/")
    .filter(Boolean)
    .filter((s) => !/^index\.(?:html?|php|aspx?)$/i.test(s));
  // « /fr/ » est encore l'accueil.
  if (segments.length > 0 && /^[a-z]{2}(?:-[a-z]{2})?$/i.test(segments[0])) segments.shift();
  if (segments.length === 0) return true;
  const dernier = segments[segments.length - 1].replace(/\.(?:html?|php|aspx?)$/i, "");
  return segments.length <= 2 && MOT_DE_RECHERCHE.test(dernier);
}

/**
 * Les URL de fiche que portent au moins deux annonces du lot, par `cleUrl`.
 * Une telle page n'est la fiche d'aucune : c'est l'accueil, la recherche, ou
 * la page de la résidence. `urlOf` rend `null` pour ce qui ne s'ouvre pas par
 * l'URL de l'annonce (Airbnb, Gîtes : leur fiche vient de leur identifiant).
 */
export function urlsPartagees(
  rows: readonly Listing[],
  urlOf: (l: Listing) => string | null,
): Set<string> {
  const porteurs = new Map<string, Set<string>>();
  for (const l of rows) {
    const url = urlOf(l);
    if (!url) continue;
    const cle = cleUrl(url);
    const ids = porteurs.get(cle);
    if (ids) ids.add(l.id);
    else porteurs.set(cle, new Set([l.id]));
  }
  return new Set([...porteurs].filter(([, ids]) => ids.size >= 2).map(([cle]) => cle));
}

/** L'URL qui mène à la fiche propre de l'annonce, hors Airbnb et Gîtes. */
export function urlPropre(l: Pick<Listing, "source" | "url">): string | null {
  if (l.source === "Airbnb" || l.source === "Gîtes de France") return null;
  return l.url;
}

/**
 * Pourquoi ne pas ouvrir cette fiche, ou `null` s'il faut l'ouvrir.
 * La raison sert de compte dans le journal.
 *
 * `communes` : les URL que plusieurs annonces du relevé portent
 * (`urlsPartagees`), calculées sur le relevé entier et pas sur les seules
 * annonces trouées.
 */
export function raisonDeLaisser(
  l: Listing,
  url: string,
  communes?: ReadonlySet<string>,
): string | null {
  // Nom et URL publics à aligner, même sans trou : voir `fillFiches`.
  if (l.source === "Gîtes de France") return null;
  if (l.source === "Airbnb" || estHoteAirbnb(url)) {
    return plausible(l.lat, l.lon) ? "Airbnb avec GPS" : null;
  }
  if (estPageDeSite(url) || communes?.has(cleUrl(url))) return "URL commune";
  const hote = hoteDe(url) ?? "";
  const regle = PRISES.find((r) => r.hote.test(hote));
  if (!regle) return null;
  return trousDe(l).some((t) => regle.prise.has(t)) ? null : regle.nom;
}

/**
 * Les fiches à ouvrir, dans l'ordre reçu, et le compte de celles laissées.
 *
 * Le tri se fait avant la borne : une annonce qu'on n'ouvrira pas ne prend
 * plus la place d'une qu'on ouvrirait.
 */
export function choisirFiches(
  rows: Listing[],
  urlOf: (l: Listing) => string | null,
  communes?: ReadonlySet<string>,
): { aLire: Listing[]; laissees: Map<string, number> } {
  const aLire: Listing[] = [];
  const laissees = new Map<string, number>();
  for (const l of rows) {
    const url = urlOf(l);
    if (!url) continue;
    const raison = raisonDeLaisser(l, url, communes);
    if (raison) laissees.set(raison, (laissees.get(raison) ?? 0) + 1);
    else aLire.push(l);
  }
  return { aLire, laissees };
}

export function ecrireLaissees(laissees: Map<string, number>): string {
  if (laissees.size === 0) return "";
  const parts = [...laissees].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`);
  return ` · laissées : ${parts.join(", ")}`;
}

/**
 * Coupe un hôte dont les `max` dernières fiches lues n'ont rien comblé.
 *
 * Il ne vaut que pour une passe. Les lectures déjà parties vers l'hôte vont
 * au bout ; une qui comble le rouvre.
 */
export function disjoncteur(max: number) {
  const suite = new Map<string, number>();
  return {
    coupe(hote: string): boolean {
      return (suite.get(hote) ?? 0) >= max;
    },
    /** Rend vrai à la lecture qui vient de couper l'hôte, et à elle seule. */
    noter(hote: string, comble: boolean): boolean {
      if (comble) {
        suite.set(hote, 0);
        return false;
      }
      const n = (suite.get(hote) ?? 0) + 1;
      suite.set(hote, n);
      return n === max;
    },
  };
}
