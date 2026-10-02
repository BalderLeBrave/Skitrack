/**
 * Ski-Planet (www.ski-planet.com) : voyagiste de séjours au ski, logement
 * seul ou « Hébergement + Forfait de ski ».
 *
 * Partie pure : adresses des requêtes, lecture des réponses, annonces. Le
 * relevé est dans `skiPlanet.server.ts`. La table des résidences
 * (`skiPlanet.residences.json`) se refait avec `scrape/ski-planet/tables.mts`.
 *
 * Étude du 26 septembre 2026 (Avoriaz, 6→13/02/2027) :
 * - les pages du site (stations, recherche, fiches) sont derrière un défi
 *   anti-robot (Cloudflare Turnstile). Skitrack ne le franchit pas, et ne
 *   demande jamais ces pages ;
 * - les appels `/fr/ajax/…` que font ces pages répondent sans défi. Le
 *   calendrier d'une résidence (`calendrier-residence.php`) donne, pour une
 *   arrivée et un nombre de nuits, chaque logement vendu avec le prix du
 *   séjour, sa capacité, son libellé et son lien. L'autocomplétion
 *   (`recherche-destination.php`) donne les résidences et leur station ;
 * - robots.txt exclut les appels `/ajax/` : lu, journalisé, extraction quand
 *   même, selon la politique du dépôt. Les conditions d'utilisation, derrière
 *   le défi, n'ont pas pu être lues ;
 * - aucun appel ne liste les résidences d'une station, ni ne donne leur
 *   position. La table des résidences vient de l'autocomplétion ; la position
 *   et la photo, des copies de leurs fiches sur archive.org.
 *
 * Forfaits. Le même logement se vend seul (`checkForfait=0`, « prix par
 * logement », total du séjour) ou avec les forfaits (`checkForfait=1`,
 * « prix par personne », « sur la base de N adultes », N = capacité). Le prix
 * forfaits compris n'a pas de total publié pour un autre nombre de
 * voyageurs, et ni la durée ni le domaine du forfait ne sont publiés.
 */

import type { Listing } from "@/lib/listings";
import type { LiveSearchInput } from "../types";
import { annoncer, champsLogement } from "../../stay/occupancy.ts";

export const SKIPLANET_SITE = "https://www.ski-planet.com";
export const SKIPLANET_AJAX = `${SKIPLANET_SITE}/fr/ajax`;
/** Les photos du site, servies sans défi par leur propre hôte. */
export const SKIPLANET_PHOTOS = "https://docs.ski-planet.com/photo/";

/** En-têtes des appels `ajax`, ceux qu'envoie le jQuery du site ; l'en-tête navigateur s'y ajoute (`reseau.server.ts`). */
export const ENTETES_AJAX: Readonly<Record<string, string>> = {
  accept: "text/html, */*; q=0.01",
  "x-requested-with": "XMLHttpRequest",
  referer: `${SKIPLANET_SITE}/fr/`,
};

/* ---------- Outils ---------- */

/** Minuscules, sans accents, ponctuation repliée : « Saint-Colomban » vaut « Saint Colomban ». */
export function plier(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Le libellé en slug : « Val d'Isère » → `val-d-isere`. C'est la clé de la table des résidences. */
export function slug(s: string | null | undefined): string {
  return plier(s).replace(/ /g, "-");
}

const ENTITES: Readonly<Record<string, string>> = {
  euro: "€",
  nbsp: " ",
  amp: "&",
  quot: '"',
  lt: "<",
  gt: ">",
  apos: "'",
  egrave: "è",
  eacute: "é",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  icirc: "î",
  ocirc: "ô",
  ucirc: "û",
  ugrave: "ù",
  ccedil: "ç",
  sup2: "²",
};

/** Décode les entités HTML que le site emploie et resserre les blancs. */
export function decoder(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&([a-z0-9]+);/gi, (m, nom: string) => ENTITES[nom.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function nombre(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function entier(v: string | null | undefined, max = 50): number | null {
  const n = nombre(v);
  return n != null && Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/** « 3 897 », « 233,96 » : milliers séparés par une espace, centimes s'il y en a. */
function euros(n: number): string {
  const [e, c] = arrondi(n).toFixed(2).split(".");
  const entier = e!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return c === "00" ? entier : `${entier},${c}`;
}

/* ---------- Dates ---------- */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Le nombre de nuits entre deux dates `AAAA-MM-JJ`. Le moteur du site vend de 1 à 35 nuits. */
export function nuitsEntre(checkIn: string, checkOut: string): number {
  if (!DATE.test(checkIn) || !DATE.test(checkOut)) throw new Error("dates illisibles");
  const n = Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000);
  if (!Number.isInteger(n) || n < 1 || n > 35) throw new Error(`durée hors de ce que vend le site : ${n} nuits`);
  return n;
}

/* ---------- Table des résidences ---------- */

/** Une résidence de la table : identifiant, nom, et la position et la photo de sa fiche archivée. */
export type LigneResidence = [id: number, nom: string, lat: number | null, lon: number | null, photo: string | null];

export type TableSkiPlanet = {
  /** Date de la dernière construction (`AAAA-MM-JJ`). */
  genere: string;
  /** Par station de l'autocomplétion (son libellé en slug) : le libellé tel quel, et ses résidences. */
  stations: Record<string, { libelle: string; residences: LigneResidence[] }>;
};

export type ResidenceSkiPlanet = {
  id: string;
  nom: string;
  /** La station telle que le site l'écrit (« Avoriaz »). */
  station: string;
  lat: number | null;
  lon: number | null;
  /** Adresse complète de la photo principale, ou `null`. */
  photo: string | null;
};

function coordonnee(v: unknown, borne: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v !== 0 && Math.abs(v) <= borne ? v : null;
}

/**
 * Le panneau « Voir descriptif et photos » d'un logement du calendrier
 * (`afficheLogement`, `js/tools182.js`) : son descriptif et ses photos.
 * Relevé le 3 octobre 2026 sur le logement 76147 (Résidence le Cervin, La
 * Plagne), dont la résidence n'a pas de photo dans la table.
 */
export function urlInfosLogement(idLogement: string): string {
  return `${SKIPLANET_AJAX}/infos-logement.php?${new URLSearchParams({ id_logement: idLogement })}`;
}

/**
 * Les photos d'un logement, dans l'ordre du panneau, au grand format qu'il
 * publie (le petit n'est que la vignette du diaporama) ; sans grand format,
 * celles qu'il donne.
 */
export function lirePhotosLogement(html: string): string[] {
  const toutes = [...new Set([...html.matchAll(/https:\/\/docs\.ski-planet\.com\/photo\/[\w-]+(?:\/[\w.-]+)+\.(?:jpe?g|webp)/gi)].map((m) => m[0]))];
  const grandes = toutes.filter((u) => /\/large\//.test(u));
  return grandes.length > 0 ? grandes : toutes;
}

/** L'adresse d'une photo de la table (chemin sous `SKIPLANET_PHOTOS`), ou `null`. */
export function adressePhoto(chemin: unknown): string | null {
  return typeof chemin === "string" && /^[\w-]+(?:\/[\w.-]+)+\.(?:jpe?g|webp)$/i.test(chemin) ? `${SKIPLANET_PHOTOS}${chemin}` : null;
}

/** Les résidences des lieux d'une station (`couverture.ts`), dans l'ordre de la table, sans doublon. */
export function residencesDe(table: TableSkiPlanet, lieux: readonly string[]): ResidenceSkiPlanet[] {
  const vues = new Set<string>();
  const out: ResidenceSkiPlanet[] = [];
  for (const lieu of lieux) {
    const s = table.stations[lieu];
    if (!s) continue;
    for (const [id, nom, lat, lon, photo] of s.residences) {
      const cle = String(id);
      if (!Number.isInteger(id) || id <= 0 || vues.has(cle) || !nom) continue;
      vues.add(cle);
      const la = coordonnee(lat, 90);
      const lo = coordonnee(lon, 180);
      out.push({ id: cle, nom, station: s.libelle, lat: la != null && lo != null ? la : null, lon: la != null && lo != null ? lo : null, photo: adressePhoto(photo) });
    }
  }
  return out;
}

/** Les résidences dont la position est connue d'abord : ce sont celles que Logements affiche. L'ordre de la table pour le reste. */
export function ordonnerResidences(rs: readonly ResidenceSkiPlanet[]): ResidenceSkiPlanet[] {
  return [...rs].sort((a, b) => Number(a.lat == null) - Number(b.lat == null));
}

/* ---------- Requêtes ---------- */

function idSite(id: string | number): string {
  const s = String(id);
  if (!/^\d{1,9}$/.test(s)) throw new Error(`identifiant illisible : ${s}`);
  return s;
}

/**
 * Le calendrier d'une résidence : ses logements vendus pour cette arrivée et
 * cette durée, logement seul ou avec forfaits. Le nombre de voyageurs n'y
 * entre pas : le site ne le prend qu'à l'étape 2 de la réservation.
 */
export function urlCalendrier(
  idResidence: string | number,
  input: Pick<LiveSearchInput, "checkIn" | "checkOut">,
  forfait: boolean,
): string {
  const q = new URLSearchParams({
    id_residence: idSite(idResidence),
    nb_nuits: String(nuitsEntre(input.checkIn, input.checkOut)),
    id_formule: "0",
    date_debut: input.checkIn,
    checkForfait: forfait ? "1" : "0",
    checkMateriel: "0",
    checkCours: "0",
    afficher_menu: "1",
    afficher_infobulles: "0",
  });
  return `${SKIPLANET_AJAX}/calendrier-residence.php?${q}`;
}

/** L'autocomplétion du moteur. Le serveur ne répond rien sous trois lettres. */
export function urlAutocompletion(expression: string): string {
  const e = plier(expression);
  if (e.length < 3) throw new Error("trois lettres au moins");
  return `${SKIPLANET_AJAX}/recherche-destination.php?${new URLSearchParams({ expression: e, recuperer_recherche: "false" })}`;
}

/* ---------- Autocomplétion ---------- */

export type EntreeAutocompletion = {
  /** `stations`, `sous_stations`, `domaines`, `villes`, `residences`… */
  critere: string;
  id: string;
  nom: string;
  /** Pour une résidence : sa station (« - Avoriaz »). */
  station: string | null;
};

/** Les entrées de l'autocomplétion et les compteurs de chaque rubrique (« Hébergement (3112) »). */
export function lireAutocompletion(html: string): { entrees: EntreeAutocompletion[]; compteurs: Record<string, number> } {
  const compteurs: Record<string, number> = {};
  for (const m of html.matchAll(/<div class="destination_titre">([^<]*)<span class="nb_resultats">\((\d+)\)<\/span>/g)) {
    compteurs[decoder(m[1])] = Number(m[2]);
  }
  const entrees: EntreeAutocompletion[] = [];
  const re = /<a href="\/fr\/reservation\/online_affiche\.php\?(\w+)=(\d+)"[^>]*>\s*<div class="destination_resultat">([\s\S]*?)<\/div>\s*<\/a>/g;
  for (const m of html.matchAll(re)) {
    const info = m[3].match(/<span class="info">([^<]*)<\/span>/)?.[1];
    const nom = decoder(m[3].replace(/<span class="info">[^<]*<\/span>/, "").replace(/<[^>]+>/g, ""));
    const station = info != null ? decoder(info).replace(/^-\s*/, "") || null : null;
    if (nom) entrees.push({ critere: m[1], id: m[2], nom, station });
  }
  return { entrees, compteurs };
}

/* ---------- Fiche archivée ---------- */

export type FicheArchivee = {
  /** `id_residence` de la couche de données de la page. */
  id: string | null;
  station: string | null;
  lat: number | null;
  lon: number | null;
  /** Chemin de la première photo (sous `SKIPLANET_PHOTOS`), format moyen de préférence. */
  photo: string | null;
};

/**
 * Ce que la copie archivée d'une fiche de résidence publie : son
 * identifiant, sa station, le point de sa carte et sa première photo.
 */
export function lireFicheArchivee(html: string): FicheArchivee {
  const id = html.match(/"id_residence"\s*:\s*"?(\d{1,9})"?/)?.[1] ?? null;
  let station: string | null = null;
  const s = html.match(/"nom_station"\s*:\s*("(?:[^"\\]|\\.)*")/)?.[1];
  if (s) {
    try {
      station = decoder(JSON.parse(s) as string) || null;
    } catch {
      station = null;
    }
  }
  const carte = html.match(/id="googlemap_carte"[^>]*?data-latitude="([^"]*)"[^>]*?data-longitude="([^"]*)"/);
  const geo = html.match(/"latitude"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*"longitude"\s*:\s*(-?\d+(?:\.\d+)?)/);
  const lat = coordonnee(nombre(carte?.[1] ?? geo?.[1]), 90);
  const lon = coordonnee(nombre(carte?.[2] ?? geo?.[2]), 180);
  const photos = [...html.matchAll(/docs\.ski-planet\.com\/photo\/([\w-]+(?:\/[\w.-]+)+\.jpe?g)/gi)].map((m) => m[1]);
  const photo = photos.find((p) => /\/medium\//.test(p)) ?? photos.find((p) => /\/large\//.test(p)) ?? photos[0] ?? null;
  return { id, station, lat: lat != null && lon != null ? lat : null, lon: lat != null && lon != null ? lon : null, photo };
}

/* ---------- Calendrier ---------- */

export type LogementCalendrier = {
  /** Identifiant du logement (`trLog69622`), stable d'une date à l'autre. */
  id: string;
  /** « Appartement 3 pièces 5 personnes (742-618) ». */
  nom: string;
  /** Sa page (« …,avoriaz_69622.html »), telle que publiée. */
  url: string | null;
  /** « sam 06/02/27 - 7 nuits -2.7% - 919.8€ », « sam 06/02/27 - épuisé ». */
  texteSejour: string | null;
  /** Identifiant du séjour vendu ; `null` quand le logement est épuisé (« 0 »). */
  idSejour: string | null;
  dateDebut: string | null;
  nuits: number | null;
  /** Formule : 1 location (appartements, chalets, avec ou sans forfait), 6 « all inclusive » (hôtel-club). */
  formule: number | null;
  /** `NbpersMax` : la capacité. */
  capacite: number | null;
  /** `Nb_dispo` : logements identiques encore libres. */
  dispo: number | null;
  prix: number | null;
  /** « prix par personne » (forfaits compris) plutôt que « prix par logement ». */
  parPersonne: boolean;
  prixBarre: number | null;
  /** « -2.7% ». */
  remise: string | null;
  /** « sur la base de 5 adultes », pour un prix par personne. */
  baseAdultes: number | null;
  epuise: boolean;
};

export type CalendrierSkiPlanet = {
  /** `false` : « Aucune disponibilité n'a été trouvée. » */
  disponible: boolean;
  /** La case « Forfait de ski » est cochée : les prix comprennent les forfaits. */
  forfait: boolean;
  /** La case « Forfait de ski » existe : la résidence vend le forfait avec le logement. */
  forfaitPropose: boolean;
  logements: LogementCalendrier[];
};

function lireLigne(id: string, b: string): LogementCalendrier {
  const lien = b.match(/<a class="nomLog[^"]*"([^>]*)>(?:\s*<img[^>]*>)?([^<]*)<\/a>/);
  const href = lien?.[1].match(/href="([^"]+)"/)?.[1] ?? null;
  const texte = b.match(/<div class="selection" onclick="chargeSejoursLogement\([^"]*\);">([^<]*)</)?.[1];
  const sejour = b.match(/id="sejourSelected\d+" value="([^"]*)"/)?.[1]?.split("|") ?? [];
  const plan = entier(b.match(/id="PlanID\d+" value="(\d+)"/)?.[1], 1000);
  const prix = b.match(/<span title="prix par (logement|personne)">\s*([\d.]+)\s*&euro;/);
  const texteSejour = texte != null ? decoder(texte) : null;
  const idSejour = sejour[0] && sejour[0] !== "0" ? sejour[0] : null;
  const epuise = idSejour == null || /épuisé/i.test(texteSejour ?? "");
  return {
    id,
    nom: lien ? decoder(lien[2]) : "",
    url: href && /^https:\/\/www\.ski-planet\.com\//.test(href) ? href : null,
    texteSejour,
    idSejour,
    dateDebut: sejour[1] && DATE.test(sejour[1]) ? sejour[1] : null,
    nuits: entier(sejour[2], 60),
    // Le 4e champ de `sejourSelected` est la formule (`id_formule` du site) ; `PlanID` la répète.
    formule: entier(sejour[3], 1000) ?? plan,
    capacite: entier(b.match(/id="NbpersMax\d+" value="(\d+)"/)?.[1]),
    dispo: entier(b.match(/id="Nb_dispo\d+">(\d+)</)?.[1], 10_000),
    prix: epuise ? null : nombre(prix?.[2]),
    parPersonne: prix?.[1] === "personne",
    prixBarre: nombre(b.match(/<span class="pxbarre">\s*([\d.]+)\s*&euro;/)?.[1]),
    remise: b.match(/<div class="promotion">\s*([^<]*?)\s*<\/div>/)?.[1] || null,
    baseAdultes: entier(b.match(/sur la base de (\d+) adultes?/)?.[1]),
    epuise,
  };
}

/** Lit la réponse de `calendrier-residence.php`. */
export function lireCalendrier(html: string): CalendrierSkiPlanet {
  const logements: LogementCalendrier[] = [];
  for (const m of html.matchAll(/<tr class="tr(?:Pair|Impair)" id="trLog(\d+)">([\s\S]*?)<\/tr>/g)) {
    logements.push(lireLigne(m[1], m[2]));
  }
  const caseForfait = html.match(/<input type="checkbox"[^>]*>\s*Forfait de ski/)?.[0] ?? null;
  return {
    disponible: !/class="residence_non_disponible"/.test(html) && logements.length > 0,
    forfait: (caseForfait != null && /checked/.test(caseForfait)) || /name="checkForfait" value="Oui"/.test(html),
    forfaitPropose: caseForfait != null,
    logements,
  };
}

/**
 * Une réponse qui n'est pas un calendrier : ni logement, ni « aucune
 * disponibilité ». Une page d'erreur, ou un site qui a changé.
 */
export function calendrierIllisible(html: string): boolean {
  return !/class="residence_non_disponible"/.test(html) && !/id="trLog\d+"/.test(html) && !/class="calendrier_menu"/.test(html);
}

/* ---------- Libellés et règles ---------- */

export type Libelle = {
  /** Les mots du site avant les nombres : « Appartement », « Studio coin montagne », « Appartement duplex ». */
  type: string | null;
  pieces: number | null;
  personnes: number | null;
  studio: boolean;
  /** Une chambre d'hôtel (« Chambre avec vue imprenable (2 adultes) »). */
  chambre: boolean;
};

/** Lit le libellé d'un logement : « Appartement 2 pièces 2-4 personnes (210) ». */
export function lireLibelle(nom: string): Libelle {
  const n = decoder(nom);
  const studio = /^studio\b/i.test(n);
  const type = n.match(/^([^\d(]+?)(?=\s+\d|\s*\(|$)/)?.[1]?.trim() || null;
  const p = n.match(/(\d+)\s*pi[eè]ces?\b/i);
  const g = n.match(/(\d+)(?:\s*-\s*(\d+))?\s*personnes?\b/i);
  return {
    type,
    pieces: p ? Number(p[1]) : studio ? 1 : null,
    personnes: g ? Math.max(Number(g[1]), g[2] ? Number(g[2]) : 0) : null,
    studio,
    chambre: /^chambres?\b/i.test(n),
  };
}

/**
 * Un logement vendu, et que Skitrack garde : pas épuisé, un prix, la formule
 * « location » (1). Une chambre d'hôtel (libellé « Chambre… », formule 6
 * « all inclusive » à l'hôtel Belambra Club d'Avoriaz) ne l'est jamais. Le
 * nom de la résidence ne suffit pas : « Hôtel de la Falaise » est un
 * « Logement de particulier » qui loue des appartements.
 */
export function logementGarde(l: LogementCalendrier): boolean {
  if (l.epuise || l.prix == null || l.prix <= 0) return false;
  if (l.formule !== 1) return false;
  return !lireLibelle(l.nom).chambre;
}

/* ---------- Annonces ---------- */

/** Au-delà, la position d'une fiche archivée n'est pas celle d'une résidence de la station. */
export const ECART_POSITION_MAX_KM = 25;

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** La position de la résidence, si elle est plausible pour la station demandée. */
function positionPlausible(r: ResidenceSkiPlanet, input: Pick<LiveSearchInput, "lat" | "lon">): { lat: number; lon: number } | null {
  if (r.lat == null || r.lon == null) return null;
  const p = { lat: r.lat, lon: r.lon };
  if (Number.isFinite(input.lat) && Number.isFinite(input.lon) && distanceKm(p, input) > ECART_POSITION_MAX_KM) return null;
  return p;
}

/**
 * Les annonces d'une résidence, depuis un calendrier. Hébergement seul : le
 * total publié (« prix par logement »). Forfaits compris : le prix est par
 * personne, « sur la base de N adultes » ; le total publié est prix × N,
 * exact lorsque N est le nombre de voyageurs. Pour un autre groupe, le site ne
 * publie le prix qu'à l'étape de réservation, protégée par un défi
 * anti-robot : il est calculé depuis les deux prix publiés du même logement,
 * le logement seul (`seul`) plus, par voyageur, l'écart par personne entre la
 * formule et le logement seul (le forfait). C'est la composition que
 * Travelski publie à l'euro près ; le libellé dit que c'est un calcul. Sans le
 * logement seul, le total reste à 0. Un logement trop petit pour le groupe,
 * épuisé, ou vendu à d'autres dates n'est pas rendu.
 */
export function skiPlanetListings(
  residence: ResidenceSkiPlanet,
  calendrier: CalendrierSkiPlanet,
  input: LiveSearchInput,
  seul?: CalendrierSkiPlanet | null,
  /** Les photos du logement lues sur son panneau (`lirePhotosLogement`), pour une résidence sans photo. */
  photosLogement?: (idLogement: string) => readonly string[] | null,
): Listing[] {
  if (!calendrier.disponible) return [];
  const nuits = nuitsEntre(input.checkIn, input.checkOut);
  const voyageurs = Math.max(1, Math.trunc(input.guests));
  const position = positionPlausible(residence, input);
  const out: Listing[] = [];
  for (const l of calendrier.logements) {
    if (!logementGarde(l) || l.prix == null) continue;
    if (l.dateDebut !== input.checkIn || l.nuits !== nuits) continue;
    if (l.capacite != null && l.capacite < voyageurs) continue;
    const lib = lireLibelle(l.nom);
    // Case cochée et prix par personne : forfaits compris. Case non cochée et
    // prix par logement : hébergement seul. Le reste ne se tranche pas.
    const forfait: boolean | null = calendrier.forfait ? (l.parPersonne ? true : null) : l.parPersonne ? null : false;
    let total: number;
    let priceLabel: string;
    if (forfait === true) {
      const base = l.baseAdultes != null ? `, sur la base de ${l.baseAdultes} adultes` : "";
      priceLabel = `${l.texteSejour ?? `${l.prix}€`} /pers.${base}, Hébergement + Forfait de ski`;
      if (l.baseAdultes != null && l.baseAdultes === voyageurs) total = arrondi(l.prix * l.baseAdultes);
      else {
        const logement = seul?.logements.find(
          (x) => x.id === l.id && !x.parPersonne && x.prix != null && x.dateDebut === input.checkIn && x.nuits === nuits,
        )?.prix;
        const parForfait = logement != null && l.baseAdultes != null ? (l.prix * l.baseAdultes - logement) / l.baseAdultes : null;
        if (logement != null && parForfait != null && parForfait > 0) {
          total = arrondi(logement + voyageurs * parForfait);
          priceLabel = `${euros(total)} € calculé pour ${voyageurs} adulte${voyageurs > 1 ? "s" : ""} : logement ${euros(logement)} € et ${voyageurs} forfait${voyageurs > 1 ? "s" : ""} à ${euros(parForfait)} € (prix publié ${l.texteSejour ?? `${l.prix}€`} /pers.${base})`;
        } else total = 0;
      }
    } else if (l.parPersonne) {
      total = 0;
      priceLabel = `${l.texteSejour ?? `${l.prix}€`} /pers.`;
    } else {
      total = arrondi(l.prix);
      priceLabel = l.texteSejour ?? `${l.prix}€`;
    }
    // La photo de la résidence (table), sinon celles du logement (son panneau).
    const photos = residence.photo ? [residence.photo] : [...(photosLogement?.(l.id) ?? [])];
    out.push({
      id: forfait === true ? `sp-${l.id}-forfait` : `sp-${l.id}`,
      stationId: input.stationId,
      title: `${residence.nom} — ${l.nom}`,
      source: "Ski-Planet",
      total,
      currency: "EUR",
      // Capacité : le champ caché `NbpersMax`, sinon le libellé « 2-4
      // personnes » (un texte). Un studio compte 0 chambre, par son type ; les
      // autres se tirent des pièces du libellé.
      ...champsLogement(
        annoncer(
          {
            capacity: l.capacite ?? lib.personnes,
            bedrooms: lib.studio ? 0 : null,
            rooms: lib.pieces,
            source: {
              capacity: l.capacite != null ? "structured" : "text_regex",
              bedrooms: "derived_from_type",
            },
          },
          l.nom,
        ),
      ),
      propertyType: lib.type,
      available: true,
      photo: photos[0] ?? null,
      photos: photos.length > 0 ? photos : null,
      url: l.url,
      lat: position?.lat ?? null,
      lon: position?.lon ?? null,
      locality: residence.station,
      placeName: residence.station,
      priceLabel,
      priceIndicative: total > 0 ? false : null,
      skiPassIncluded: forfait,
      platformId: l.id,
      proven: `Ski-Planet live ${input.checkIn}→${input.checkOut}`,
    });
  }
  return out;
}
