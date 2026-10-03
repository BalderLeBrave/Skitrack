/**
 * L'altitude d'un logement, lue au point de son annonce.
 *
 * Deux sources, dans cet ordre, et la source toujours dite :
 * - `ign` : le RGE ALTI de l'IGN (Géoplateforme, service d'altimétrie),
 *   au mètre près, en France ;
 * - `dem` : le modèle de terrain Copernicus servi par Open-Meteo, à 90 m de
 *   maille, là où l'IGN ne répond pas (hors de France).
 *
 * L'altitude ne vaut que ce que vaut le point. Airbnb décale le sien de
 * quelques centaines de mètres, et un point géocodé depuis une adresse (`ban`)
 * tombe sur la rue : sur une pente, l'écart peut faire plusieurs dizaines de
 * mètres. Ces altitudes-là se disent « environ ».
 */

import type { Listing } from "../listings.ts";
import { langueIntl } from "../i18n/langue.ts";
import { tr } from "../i18n/tr.ts";

export type SourceAltitude = "ign" | "dem";
export type Altitude = { m: number; source: SourceAltitude };

/** Le point arrondi à 4 décimales (une dizaine de mètres) : la clé du cache. */
export function cleAltitude(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/** Les points utilisables : ni absents, ni (0, 0), ni hors du globe. */
export function pointAltitude(l: Pick<Listing, "lat" | "lon">): { lat: number; lon: number } | null {
  const { lat, lon } = l;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if ((lat === 0 && lon === 0) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Le point de l'annonce n'est qu'approché : Airbnb, ou une adresse géocodée. */
export function positionApprochee(l: Pick<Listing, "source" | "gpsSource">): boolean {
  return l.source === "Airbnb" || l.gpsSource === "ban";
}

const nombre = (m: number) => new Intl.NumberFormat(langueIntl(), { maximumFractionDigits: 0 }).format(m);

/** « 1 850 m », « env. 1 850 m » ; `null` : inconnue ; `undefined` : en cours de lecture. */
export function altitudeLbl(a: Altitude | null | undefined, approchee: boolean): string {
  if (a === undefined) return tr("Altitude en cours");
  if (a === null) return tr("Altitude inconnue");
  return approchee ? tr("env. {altitude} m", { altitude: nombre(a.m) }) : `${nombre(a.m)} m`;
}

/** Une phrase pour l'infobulle : d'où vient l'altitude, et ce qu'elle vaut. */
export function altitudeAide(a: Altitude | null | undefined, approchee: boolean): string {
  if (!a) return tr("Altitude lue au point de l’annonce, quand elle en a un.");
  const source = a.source === "ign" ? tr("IGN, au mètre près") : tr("modèle de terrain Copernicus, à 90 m près");
  return approchee
    ? tr("Altitude au point approché de l’annonce ({source}) : elle peut s’écarter de quelques dizaines de mètres.", { source })
    : tr("Altitude au point de l’annonce ({source}).", { source });
}

/** Une altitude plausible dans les Alpes, les Pyrénées ou ailleurs : l'IGN rend -99999 hors de ses données. */
export function altitudePlausible(m: unknown): m is number {
  return typeof m === "number" && Number.isFinite(m) && m > -500 && m < 6000;
}

/** Lit la réponse du service d'altimétrie de l'IGN : une altitude par point, `null` hors données. */
export function lireIgn(json: unknown, n: number): (number | null)[] {
  const els = (json as { elevations?: unknown[] } | null)?.elevations;
  const out: (number | null)[] = new Array(n).fill(null);
  if (!Array.isArray(els)) return out;
  for (let i = 0; i < n; i++) {
    const v = els[i];
    const m = typeof v === "number" ? v : typeof (v as { z?: unknown })?.z === "number" ? (v as { z: number }).z : null;
    out[i] = altitudePlausible(m) ? Math.round(m) : null;
  }
  return out;
}
