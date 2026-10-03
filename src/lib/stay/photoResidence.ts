/**
 * La photo d'une résidence Ski-Planet, reprise d'une autre source.
 *
 * Ski-Planet ne publie ses photos que sur ses fiches, derrière un défi
 * anti-robot ; la table des résidences n'a la photo que de celles dont une
 * archive du web garde la fiche. Décision du propriétaire du 3 octobre
 * 2026 : à une annonce Ski-Planet sans photo, la photo **de la même
 * résidence** publiée par une autre source du même relevé, en le disant
 * dans `proven`. Aucune requête.
 *
 * La même résidence, c'est le nom propre de la résidence (« Résidence Le
 * Serro Torre » → `serro torre`) écrit tel quel dans le titre d'une autre
 * annonce, mot pour mot :
 * - ni suivi d'un numéro ou d'une lettre de bâtiment (`quirlies` n'est pas
 *   « Les Quirlies II ») ;
 * - ni contenu dans le nom d'une autre résidence Ski-Planet du relevé
 *   (`ecrins` n'est pas « Les Hauts Ecrins ») ;
 * - un nom propre d'un seul mot court (« Soleil », « Midi ») ne suffit pas :
 *   il faut aussi les deux points, à `RAYON_RESIDENCE_M` ;
 * - les annonces retenues, quand elles ont un point, sont toutes à
 *   `RAYON_RESIDENCE_M` les unes des autres, et de l'annonce Ski-Planet si
 *   elle en a un : sinon deux résidences portent ce nom.
 */

import type { Listing } from "../listings.ts";
import { distanceM } from "./regroupement.ts";

export const SOURCE_SKIPLANET = "Ski-Planet";
/** Deux annonces d'une même résidence : à 400 m au plus. */
export const RAYON_RESIDENCE_M = 400;
/**
 * Un nom propre d'un seul mot court, ou courant en montagne, n'est pas assez
 * rare pour se passer des points : « Soleil », « Chamois » nomment des
 * résidences dans chaque station, « Makalu » une seule (La Plagne, 3 octobre
 * 2026 : la photo de l'annonce Orchestra « LE MAKALU » pour Ski-Planet).
 */
const MOT_COURT = 5;
const MOTS_COURANTS = new Set(
  (
    "soleil midi sud nord chamois marmotte marmottes edelweiss gentiane gentianes sapin sapins meleze melezes neige neiges " +
    "piste pistes alpage alpages cret crets cime cimes sommet sommets glacier glaciers arolle arolles bouquetin bouquetins " +
    "aiguille aiguilles montagne montagnes chalet chalets refuge lodge panorama belvedere horizon horizons village hameau " +
    "plein soleil vallee lac lacs etoile etoiles cristal cristaux balcon balcons terrasse terrasses source sources foret " +
    "pied pieds roc rocher rochers centre station"
  ).split(" "),
);

/** Les mots qui ne nomment pas une résidence en propre. */
const MOTS_VIDES = new Set(
  "residence residences res hotel les le la l d de du des the et mh by appartement appartements apartment apartments location".split(" "),
);
/** Un numéro ou une lettre de bâtiment : « II », « 2 », « C ». */
const SUFFIXE = /^(?:[ivx]{1,4}|\d{1,3}|[a-h])$/;
/** Ce qui suit un nombre qui n'est pas un bâtiment : « 2 pièces », « 6 pers ». */
const MESURE = /^(?:pieces?|p|pers|personnes?|chambres?|couchages?|m2|m|places?)$/;

function mots(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Un tiret, une virgule, une parenthèse séparent le nom de la suite : `|`.
    .replace(/\s*[-–—,;:|()/]+\s*/g, " | ")
    .replace(/[^a-z0-9|]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !MOTS_VIDES.has(w));
}

/** Le nom de la résidence d'une annonce Ski-Planet : son titre avant « — ». */
export function nomResidenceSkiPlanet(titre: string): string {
  return titre.split(" — ")[0]?.trim() ?? "";
}

/** Le nom propre d'une résidence, en mots, jusqu'au premier tiret : « Résidence Le Serro Torre » → `["serro", "torre"]`. */
export function nomPropre(nom: string): string[] {
  const m = mots(nom);
  const i = m.indexOf("|");
  return i < 0 ? m : m.slice(0, i);
}

/** Où `cle` figure dans `titre`, mot pour mot, sans numéro de bâtiment après ; -1 sinon. */
function position(titre: string[], cle: string[]): number {
  for (let i = 0; i + cle.length <= titre.length; i++) {
    if (!cle.every((w, k) => titre[i + k] === w)) continue;
    const apres = titre[i + cle.length];
    const mesure = titre[i + cle.length + 1];
    if (apres != null && SUFFIXE.test(apres) && !(mesure != null && /^\d/.test(apres) && MESURE.test(mesure))) continue;
    return i;
  }
  return -1;
}

type Point = { lat: number; lon: number };
function point(l: Pick<Listing, "lat" | "lon">): Point | null {
  return l.lat != null && l.lon != null && Number.isFinite(l.lat) && Number.isFinite(l.lon) && !(l.lat === 0 && l.lon === 0)
    ? { lat: l.lat, lon: l.lon }
    : null;
}

export type PhotoReprise = { photo: string; proven: string };

/**
 * Pour chaque annonce Ski-Planet sans photo, la photo de la même résidence
 * publiée par une autre source du relevé, et la trace pour `proven`.
 */
export function photosDeResidence(listings: readonly Listing[]): Map<string, PhotoReprise> {
  const out = new Map<string, PhotoReprise>();
  const sp = listings.filter((l) => l.source === SOURCE_SKIPLANET);
  const sansPhoto = sp.filter((l) => !l.photo && !(l.photos?.length ?? 0));
  if (sansPhoto.length === 0) return out;
  const autres = listings
    .filter((l) => l.source !== SOURCE_SKIPLANET && Boolean(l.photo))
    .map((l) => ({ l, mots: mots(l.title ?? ""), pt: point(l) }));
  // Les noms propres de toutes les résidences Ski-Planet du relevé : un nom
  // contenu dans un autre ne se cherche pas là où l'autre figure.
  const noms = [...new Set(sp.map((l) => nomPropre(nomResidenceSkiPlanet(l.title ?? "")).join(" ")))]
    .filter(Boolean)
    .map((n) => n.split(" "));
  const parResidence = new Map<string, PhotoReprise | null>();
  for (const l of sansPhoto) {
    const cle = nomPropre(nomResidenceSkiPlanet(l.title ?? ""));
    const k = `${cle.join(" ")}|${l.lat ?? ""}|${l.lon ?? ""}`;
    if (!parResidence.has(k)) parResidence.set(k, chercher(l, cle, autres, noms));
    const r = parResidence.get(k);
    if (r) out.set(l.id, r);
  }
  return out;
}

function chercher(
  l: Listing,
  cle: string[],
  autres: { l: Listing; mots: string[]; pt: Point | null }[],
  noms: string[][],
): PhotoReprise | null {
  if (cle.length === 0) return null;
  const plusLongs = noms.filter((n) => n.length > cle.length && position(n, cle) >= 0);
  const ici = point(l);
  const trouvees = autres.filter((a) => position(a.mots, cle) >= 0 && !plusLongs.some((n) => position(a.mots, n) >= 0));
  if (trouvees.length === 0) return null;
  const points = trouvees.map((a) => a.pt).filter((p): p is Point => p != null);
  if (ici && points.some((p) => distanceM(ici, p) > RAYON_RESIDENCE_M)) return null;
  if (points.some((p, i) => points.some((q, j) => j > i && distanceM(p, q) > RAYON_RESIDENCE_M))) return null;
  const rare = cle.length >= 2 || (cle[0].length >= MOT_COURT && !MOTS_COURANTS.has(cle[0]));
  if (!rare && !(ici && points.length > 0)) return null;
  // La plus proche d'abord, puis l'ordre des sources et des identifiants : le même choix à chaque rendu.
  const choisie = [...trouvees].sort((a, b) => {
    const da = ici && a.pt ? distanceM(ici, a.pt) : Infinity;
    const db = ici && b.pt ? distanceM(ici, b.pt) : Infinity;
    return da - db || a.l.source.localeCompare(b.l.source) || a.l.id.localeCompare(b.l.id);
  })[0];
  return { photo: choisie.l.photo as string, proven: `photo : même résidence, publiée par ${choisie.l.source}` };
}
