/**
 * Recopie entre offres d'un même logement.
 *
 * Un logement vendu sur deux plateformes ne publie pas partout la même chose :
 * Airbnb relevé en direct tait souvent capacité et chambres, que l'annonce
 * Abritel du même chalet donne. Quand on sait que deux offres décrivent le
 * même logement, ce que l'une publie comble ce que l'autre tait. Aucune
 * requête, rien d'estimé : c'est la même source de vérité, lue ailleurs.
 *
 * **On ne recopie qu'entre deux offres dont on sait qu'elles sont le même
 * logement**, dans un groupe de `regrouper` :
 * - le même titre exact sur deux plateformes, à `RAYON_M` (150 m) au plus ;
 * - ou le même identifiant CozyCozy **et** le même titre : Cozy range parfois
 *   sous un même identifiant une offre de 4 personnes et la résidence
 *   entière (`regroupement.ts`), et deux titres différents le trahissent.
 *
 * Dans les deux cas, des capacités compatibles (`capaciteCompatible`). Et un
 * groupe dont deux offres publient des capacités qui ne le sont pas ne
 * recopie rien : `regrouper` l'a formé de proche en proche (A avec B, B avec
 * C, mais A de 4 personnes et C de 6), il réunit donc au moins deux
 * logements, et rien ne dit auquel appartient l'offre qui ne publie rien.
 *
 * Jamais une valeur publiée remplacée ; jamais entre deux logements distincts.
 */

import type { Listing } from "../listings.ts";
import { gpsPrecis } from "./lodgingFilter.ts";
import {
  capaciteCompatible,
  cleCozy,
  clesTitre,
  distanceM,
  RAYON_M,
  regrouper,
  TITRE_MIN,
} from "./regroupement.ts";

/** La trace laissée dans `proven` d'une offre complétée par sa sœur. */
export const MARQUE_SOEUR = "même logement";

type Champs = Pick<Listing, "guests" | "bedrooms" | "rooms" | "lat" | "lon">;
/** Ce qu'une offre reçoit : ses trous comblés, et la trace dans `proven`. */
export type Recopie = Partial<Champs> & { proven: string };

function titresCommuns(a: Listing, b: Listing): string[] {
  const deB = new Set(clesTitre(b.title));
  return clesTitre(a.title).filter((k) => k.length > 0 && deB.has(k));
}

/** Deux offres dont l'une peut combler l'autre : voir l'en-tête. */
export function memeLogement(a: Listing, b: Listing): boolean {
  if (a.source === b.source) return false;
  if (!capaciteCompatible(a, b)) return false;
  const communs = titresCommuns(a, b);
  if (communs.length === 0) return false;
  const cozy = cleCozy(a);
  if (cozy != null && cozy === cleCozy(b)) return true;
  if (!communs.some((k) => k.length >= TITRE_MIN && k.includes(" "))) return false;
  if (!gpsPrecis(a) || !gpsPrecis(b)) return false;
  return (
    distanceM({ lat: a.lat as number, lon: a.lon as number }, { lat: b.lat as number, lon: b.lon as number }) <=
    RAYON_M
  );
}

function marquer(proven: string): string {
  return proven.includes(MARQUE_SOEUR) ? proven : `${proven} · ${MARQUE_SOEUR}`;
}

/**
 * Ce que chaque offre reçoit de ses sœurs, par identifiant d'annonce. Une
 * offre qui ne reçoit rien n'y figure pas. Une valeur reçue passe d'une sœur à
 * la suivante (A et B même titre à 5 m, B et C même identifiant Cozy et même
 * titre) : chaque maillon est une preuve.
 */
export function recopierSoeurs(listings: readonly Listing[]): Map<string, Recopie> {
  const out = new Map<string, Recopie>();
  for (const { offres } of regrouper(listings)) {
    if (offres.length < 2) continue;
    // Deux capacités publiées qui se contredisent : deux logements au moins.
    if (offres.some((a, i) => offres.some((b, j) => j > i && !capaciteCompatible(a, b)))) continue;
    const vals: Champs[] = offres.map((o) => ({
      guests: o.guests,
      bedrooms: o.bedrooms,
      rooms: o.rooms ?? null,
      lat: o.lat,
      lon: o.lon,
    }));
    for (let tour = 0; tour < offres.length; tour += 1) {
      let bouge = false;
      for (let i = 0; i < offres.length; i += 1) {
        for (let j = 0; j < offres.length; j += 1) {
          if (i === j || !memeLogement(offres[i], offres[j])) continue;
          const a = vals[i];
          const b = vals[j];
          if (a.guests == null && b.guests != null) {
            a.guests = b.guests;
            bouge = true;
          }
          if (a.bedrooms == null && b.bedrooms != null) {
            a.bedrooms = b.bedrooms;
            bouge = true;
          }
          if ((a.rooms == null || a.rooms <= 0) && b.rooms != null && b.rooms > 0) {
            a.rooms = b.rooms;
            bouge = true;
          }
          if (!gpsPrecis(a) && gpsPrecis(b)) {
            a.lat = b.lat;
            a.lon = b.lon;
            bouge = true;
          }
        }
      }
      if (!bouge) break;
    }
    offres.forEach((o, i) => {
      const v = vals[i];
      const recu: Partial<Champs> = {};
      if (v.guests !== o.guests) recu.guests = v.guests;
      if (v.bedrooms !== o.bedrooms) recu.bedrooms = v.bedrooms;
      if (v.rooms !== (o.rooms ?? null)) recu.rooms = v.rooms;
      if (v.lat !== o.lat || v.lon !== o.lon) {
        recu.lat = v.lat;
        recu.lon = v.lon;
      }
      if (Object.keys(recu).length > 0) out.set(o.id, { ...recu, proven: marquer(o.proven) });
    });
  }
  return out;
}
