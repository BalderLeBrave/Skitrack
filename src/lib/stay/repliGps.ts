/**
 * Le point d'une annonce Airbnb, dans l'ordre strict du propriétaire
 * (1er octobre 2026). Partie pure : ce qui se décide sans réseau.
 *
 * 1. La liste : un point plausible n'est jamais touché.
 * 2. La page du logement (PDP) : `listingLat` / `listingLng`, provenance
 *    `pdp` (`lectureAirbnb`). Un 429 ou une page non lue n'est pas un échec
 *    de GPS : aucun repli, la page se relira (`completerFiche.server.ts`).
 * 3. Seulement si la page a été lue et que ces deux champs y manquent :
 *    a. des coordonnées déjà écrites dans cette même page, en nombres
 *       (`page`) ;
 *    b. l'adresse que la page publie, géocodée par la BAN
 *       (api-adresse.data.gouv.fr) : voie + code postal + commune. Le point
 *       n'est retenu que s'il porte un numéro ou une voie, dans la commune de
 *       l'annonce, à moins de 15 km de la station ; jamais une commune seule,
 *       une mairie ou un centroïde (`ban`) ;
 *    c. le même logement relevé sur une autre source, avec un point
 *       plausible (`jumelage`, `recopie.ts`), repris tel quel, jamais moyenné
 *       avec la station.
 *
 * Jamais : Street View, antennes, centroïde de commune ou de station,
 * géocodage du titre, latitude fabriquée à partir d'un texte sans
 * coordonnées. Un point `ban` ou `jumelage` n'écrase jamais un point `pdp`, ni
 * celui de la liste : un repli ne comble qu'un point absent.
 */

import { plier } from "./logement.ts";

/** D'où vient un point qui n'est pas celui de la liste. */
export type SourceGps = "pdp" | "page" | "ban" | "jumelage";

/** Un point BAN plus loin de la station est écarté. */
export const RAYON_BAN_KM = 15;
/** Le service de la Base Adresse Nationale. */
export const BAN_URL = "https://api-adresse.data.gouv.fr/search/";

export type Point = { lat: number; lon: number };

/** Coordonnées utilisables : finies, pas un (0, 0), dans le globe. */
export function gpsPlausible(
  lat: number | null | undefined,
  lon: number | null | undefined,
): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function kmEntre(a: Point, b: Point): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Un nom de commune comparable : sans accents, tirets ni apostrophes. */
function cleCommune(s: string): string {
  return plier(s)
    .replace(/[-'’\s]+/g, " ")
    .trim();
}

/** L'adresse qu'une page publie, telle qu'elle part à la BAN. */
export type AdressePage = { voie: string; codePostal: string | null; commune: string };

/**
 * L'adresse publiée par la page, si elle en est une : une voie et une
 * commune. « Abondance » seul n'est pas une adresse, pas plus qu'une voie qui
 * ne serait que le nom de la commune. `null` : pas de géocodage.
 */
export function adressePourBan(
  street: string | null | undefined,
  postcode: string | null | undefined,
  locality: string | null | undefined,
): AdressePage | null {
  const voie = (street ?? "").replace(/\s+/g, " ").trim();
  const commune = (locality ?? "").replace(/\s+/g, " ").trim();
  if (!voie || !commune) return null;
  if (!/\p{L}{2,}/u.test(voie)) return null;
  // La voie n'est ni la commune, ni la commune et son code postal.
  const sansCode = cleCommune(voie.replace(/\b\d{5}\b/g, " "));
  if (!sansCode || sansCode === cleCommune(commune)) return null;
  const codePostal =
    (postcode ?? "").match(/\b\d{5}\b/)?.[0] ?? voie.match(/\b\d{5}\b/)?.[0] ?? null;
  return { voie, codePostal, commune };
}

/** La requête BAN : voie, code postal, commune. */
export function requeteBan(a: AdressePage): string {
  return [a.voie, a.codePostal, a.commune].filter(Boolean).join(" ");
}

/** Une réponse BAN (GeoJSON), réduite à ce qu'on en lit. */
export type FeatureBan = {
  geometry?: { coordinates?: readonly number[] | null } | null;
  properties?: {
    type?: string | null;
    city?: string | null;
    name?: string | null;
    label?: string | null;
    street?: string | null;
    housenumber?: string | null;
  } | null;
};

/**
 * Le point d'une réponse BAN, s'il est recevable : une adresse numérotée ou
 * une voie (`housenumber`, `street`), dans la commune de l'annonce, à moins de
 * `RAYON_BAN_KM` de la station. Une commune (`municipality`), un lieu-dit
 * (`locality`), une mairie : rejetés. `null` sinon.
 */
export function pointBan(
  features: readonly FeatureBan[] | null | undefined,
  adresse: AdressePage,
  station: Point,
): Point | null {
  for (const f of features ?? []) {
    const p = f?.properties ?? {};
    if (p.type !== "housenumber" && p.type !== "street") continue;
    if (p.type === "housenumber" && !p.housenumber) continue;
    if (/\bmairie\b|h[oô]tel de ville/i.test(`${p.name ?? ""} ${p.label ?? ""}`)) continue;
    if (!p.city || cleCommune(p.city) !== cleCommune(adresse.commune)) continue;
    const [lon, lat] = f?.geometry?.coordinates ?? [];
    if (!gpsPlausible(lat, lon)) continue;
    const point = { lat: lat as number, lon: lon as number };
    if (kmEntre(point, station) > RAYON_BAN_KM) continue;
    return point;
  }
  return null;
}
