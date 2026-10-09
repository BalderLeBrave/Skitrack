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
 * Mesuré le 26 septembre 2026, sur les agences de montagne :
 * - la fiche alpissime.com publie capacité, pièces et chambres, que la
 *   recherche du site n'a pas ; sa position n'est pas sûre (sur une fiche, la
 *   lecture a pris celle d'une annonce « similaire »), et la carte de
 *   recherche donne déjà celle de l'immeuble ;
 * - la fiche cimalpes.com publie la position (« Latitude : … ») et le titre,
 *   que la recherche n'a pas ; capacité et chambres viennent déjà de la carte ;
 * - la fiche travelski.com (400 Ko) ne se lit qu'avec son propre lecteur : le
 *   relevé Travelski l'ouvre lui-même, et en garde ce qu'elle publie ;
 * - les pages de ski-planet.com sont derrière un défi anti-robot : elles ne
 *   s'ouvrent jamais. La position et la photo des résidences viennent de
 *   leurs fiches archivées (`scrape/ski-planet/tables.mts`).
 *
 * Mesuré le 2 octobre 2026, fiches ouvertes par `fillFiches` et relues par
 * `lectureFiche` :
 * - reservation.haute-maurienne-vanoise.com (Open System, `dp…`) : la page
 *   est une coquille de recherche (titre, sélecteur « Nombre de pers. »), sans
 *   capacité, pièces ni point ; la liste (`tabPointCarto`, « Capacité : N
 *   pers. », « Appartement N pièces ») porte déjà tout ce que le site publie ;
 * - www.laplagneresort.com (Orchestra) : le relevé lit ses fiches lui-même
 *   (« Capacité : N Personnes », « Type de bien : N pièces », point), et les
 *   garde 30 jours ; le lecteur générique n'y lit rien (10 lues, 5 de suite
 *   sans rien combler) ;
 * - www.lesarcs-reservation.com (iResa) : la fiche publie « Nb chambre(s) :
 *   N » pour un logement à chambres (rien pour un studio), jamais de point ;
 *   la capacité est déjà dans la liste (`cap_max`).
 *
 * Un hôte absent de la table est tenté ; le disjoncteur l'arrête s'il ne
 * comble rien.
 */

import type { Listing } from "../listings.ts";
import { estHoteAirbnb } from "./http429.ts";
import { valeurDuTexte } from "./logement.ts";
import { titreEstFichier } from "./titre.ts";

export type Trou = "capacite" | "chambres" | "gps" | "titre";

export function plausible(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * Un point que la source publie : plausible, et pas triangulé par l'écran
 * (`placerSansPoint`). Une position triangulée place l'annonce sur la carte ;
 * elle ne comble pas le trou de GPS, et la fiche se lit encore pour lui.
 */
export function pointPublie(l: Pick<Listing, "lat" | "lon" | "gpsSource">): boolean {
  return plausible(l.lat, l.lon) && l.gpsSource !== "triangule";
}

/**
 * Ce qui manque à une annonce. Avec `faibles` : aussi ce que seul le texte ou
 * le type a donné (`text_regex`, `derived_from_type`), qu'un champ structuré
 * de la page de détail, quand elle le publie, remplace (`logement.ts`).
 */
export function trousDe(l: Listing, opts: { faibles?: boolean } = {}): Trou[] {
  const out: Trou[] = [];
  const faible = (champ: "capacity" | "bedrooms") => !!opts.faibles && valeurDuTexte(l, champ);
  if (l.capacity == null || faible("capacity")) out.push("capacite");
  if ((l.bedrooms == null && (l.rooms == null || l.rooms <= 0)) || faible("bedrooms")) out.push("chambres");
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
  // Relu le 2 octobre 2026 : le résumé (`propertyHighlightedDetails`) publie
  // « 22 chambres » et « 62 personnes » sur p2305900, les chambres seules sur
  // p5392632vb ; la fiche s'ouvre donc aussi pour la capacité et les chambres.
  { nom: "abritel.fr", hote: /(^|\.)abritel\.fr$/i, prise: new Set(["gps", "titre", "capacite", "chambres"]) },
  { nom: "greengo.voyage", hote: /(^|\.)greengo\.voyage$/i, prise: new Set() },
  { nom: "alpissime.com", hote: /(^|\.)alpissime\.com$/i, prise: new Set(["capacite", "chambres", "titre"]) },
  { nom: "cimalpes.com", hote: /(^|\.)cimalpes\.com$/i, prise: new Set(["gps", "titre"]) },
  { nom: "travelski.com", hote: /(^|\.)travelski\.com$/i, prise: new Set() },
  { nom: "ski-planet.com", hote: /(^|\.)ski-planet\.com$/i, prise: new Set() },
  {
    nom: "haute-maurienne-vanoise.com",
    hote: /(^|\.)reservation\.haute-maurienne-vanoise\.com$/i,
    prise: new Set(),
  },
  { nom: "laplagneresort.com", hote: /(^|\.)laplagneresort\.com$/i, prise: new Set() },
  { nom: "lesarcs-reservation.com", hote: /(^|\.)lesarcs-reservation\.com$/i, prise: new Set(["chambres"]) },
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
 * `date-start`, Open System `DateRecherche`, Cimalpes `date_debut`, Mountain
 * Collection `date_in`. Casse ignorée.
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
  "date_debut",
  "date_fin",
  "date_in",
  "date_out",
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

/** La raison de laisser une fiche quand l'annonce n'a qu'une valeur lue dans
 *  le texte, chez un hôte dont on ne sait pas ce que la fiche publie. */
export const VALEUR_DU_TEXTE = "valeur déjà lue dans le texte";

/** La raison de laisser une annonce Airbnb : GPS, capacité et chambres déjà là. */
export const AIRBNB_COMPLET = "Airbnb complet";

/**
 * Une annonce Airbnb complète : GPS plausible, capacité, chambres. Règle du
 * propriétaire (1er octobre 2026) : 0 chambre est une valeur (un studio),
 * `null` est un trou ; 0 personne n'est pas une capacité. Il en manque une,
 * la fiche (PDP) est lue ; aucune annonce n'est écartée pour autant.
 */
export function airbnbComplet(
  l: Pick<Listing, "lat" | "lon" | "gpsSource" | "capacity" | "bedrooms">,
): boolean {
  return pointPublie(l) && l.capacity != null && l.capacity > 0 && l.bedrooms != null;
}

/** Ce qu'il manque à une annonce Airbnb, dans l'ordre du journal. */
export function troisChampsAirbnb(
  l: Pick<Listing, "lat" | "lon" | "gpsSource" | "capacity" | "bedrooms">,
): Array<"gps" | "capacity" | "bedrooms"> {
  const manque: Array<"gps" | "capacity" | "bedrooms"> = [];
  if (!pointPublie(l)) manque.push("gps");
  if (l.capacity == null || !(l.capacity > 0)) manque.push("capacity");
  if (l.bedrooms == null) manque.push("bedrooms");
  return manque;
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
    // Les trois champs déjà là : rien à lire. Il en manque un : la liste ne
    // l'a pas, la PDP le publie (personCapacity, bedroomCount, listingLat,
    // listingLng). 0 chambre (studio) est une valeur, pas un trou. Un GPS
    // seul ne suffit plus (règle du 1er octobre 2026) : le seau se nomme
    // par ce qu'il contient, des annonces complètes.
    return airbnbComplet(l) ? AIRBNB_COMPLET : null;
  }
  if (estPageDeSite(url) || communes?.has(cleUrl(url))) return "URL commune";
  const hote = hoteDe(url) ?? "";
  const regle = PRISES.find((r) => r.hote.test(hote));
  // Chez un hôte dont on ne sait pas ce que la fiche publie, seul un vrai
  // trou la fait ouvrir : une valeur déjà lue dans le texte n'y use pas le
  // débit et le disjoncteur de l'hôte au détriment des annonces muettes.
  if (!regle) return trousDe(l).length > 0 ? null : VALEUR_DU_TEXTE;
  return trousDe(l, { faibles: true }).some((t) => regle.prise.has(t)) ? null : regle.nom;
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
