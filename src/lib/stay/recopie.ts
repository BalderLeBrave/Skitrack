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
 * Chaque valeur passe avec sa source (`stay/logement.ts`) : elle comble un
 * vide, ou remplace une valeur de moins bonne source (un champ structuré
 * devant le texte, le texte devant le type) ; une valeur que la sœur tirait
 * de son texte (son titre, le sous-titre de sa tuile) reste `text_regex`. Ne
 * recopier que les champs structurés laissait muet l'Airbnb dont la sœur
 * Abritel disait « 4 chambres • 10 personnes » sous son titre.
 */

import type { Listing } from "../listings.ts";
import { RANG_SOURCE, sourceCapacite, sourceChambres, type SourceCapacite, type SourceValeur } from "./logement.ts";
import { gpsPrecis } from "./lodgingFilter.ts";
import type { SourceGps } from "./repliGps.ts";
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

type Champs = Pick<Listing, "capacity" | "bedrooms" | "rooms" | "lat" | "lon">;
/** Ce qu'une offre reçoit : ses trous comblés, leur source, et la trace dans
 *  `proven`. */
export type Recopie = Partial<Champs> & {
  capacitySource?: SourceCapacite;
  bedroomsSource?: SourceValeur;
  /** Airbnb : un point reçu d'une sœur se dit `jumelage` (`repliGps.ts`). */
  gpsSource?: SourceGps;
  proven: string;
};

/**
 * Ce qu'une offre Airbnb peut recevoir de ses sœurs (règle du propriétaire,
 * 1er octobre 2026) : ni capacité ni chambres, qui ne viennent que de sa
 * page (`personCapacity`, `bedroomCount`) ; un point, seulement si sa page a
 * été lue sans `listingLat` / `listingLng`, et seulement à la place d'un
 * point absent. Une page refusée ou pas encore lue n'est pas un échec : elle
 * se relira, sans repli.
 */
function recoitNombres(o: Listing): boolean {
  return o.source !== "Airbnb";
}

function recoitPoint(o: Listing): boolean {
  return o.source !== "Airbnb" || o.pdpLue === true;
}

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

const NOMBRES = ["capacity", "bedrooms", "rooms"] as const;
type Nombre = (typeof NOMBRES)[number];
type Valeurs = Champs & { de: Record<Nombre, SourceValeur> };

/** La source d'une valeur ; les pièces n'en ont pas, et ne comblent qu'un vide. */
function sourceDe(o: Listing, k: Nombre): SourceValeur {
  if (k === "capacity") return sourceCapacite(o) ?? "structured";
  if (k === "bedrooms") return sourceChambres(o) ?? "structured";
  return "structured";
}

/**
 * `a` prend la valeur de `b` : dans un champ vide, ou à la place d'une valeur
 * de moins bonne source. Chaque prise améliore la source, et la boucle finit.
 */
function prendre(a: Valeurs, b: Valeurs, k: Nombre): boolean {
  const x = b[k];
  if (x == null || (k === "rooms" && x <= 0)) return false;
  const vide = a[k] == null || (k === "rooms" && (a[k] as number) <= 0);
  if (!vide && RANG_SOURCE[b.de[k]] >= RANG_SOURCE[a.de[k]]) return false;
  a[k] = x;
  a.de[k] = b.de[k];
  return true;
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
    // Chaque valeur connue, et sa source.
    const vals: Valeurs[] = offres.map((o) => ({
      capacity: o.capacity,
      bedrooms: o.bedrooms,
      rooms: o.rooms ?? null,
      lat: o.lat,
      lon: o.lon,
      de: { capacity: sourceDe(o, "capacity"), bedrooms: sourceDe(o, "bedrooms"), rooms: "structured" },
    }));
    for (let tour = 0; tour < offres.length; tour += 1) {
      let bouge = false;
      for (let i = 0; i < offres.length; i += 1) {
        for (let j = 0; j < offres.length; j += 1) {
          if (i === j || !memeLogement(offres[i], offres[j])) continue;
          const a = vals[i];
          const b = vals[j];
          if (recoitNombres(offres[i])) for (const k of NOMBRES) if (prendre(a, b, k)) bouge = true;
          if (!gpsPrecis(a) && gpsPrecis(b) && offres[j]?.gpsSource !== "triangule" && recoitPoint(offres[i])) {
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
      const recu: Omit<Recopie, "proven"> = {};
      for (const k of NOMBRES) {
        if (v[k] === (o[k] ?? null) && (v[k] == null || v.de[k] === sourceDe(o, k))) continue;
        recu[k] = v[k];
        if (k === "capacity") recu.capacitySource = v.de.capacity === "structured" ? "structured" : "text_regex";
        if (k === "bedrooms") recu.bedroomsSource = v.de.bedrooms;
      }
      if (v.lat !== o.lat || v.lon !== o.lon) {
        recu.lat = v.lat;
        recu.lon = v.lon;
        if (o.source === "Airbnb") recu.gpsSource = "jumelage";
      }
      if (Object.keys(recu).length > 0) out.set(o.id, { ...recu, proven: marquer(o.proven) });
    });
  }
  return out;
}

/**
 * Le jumelage du seul point, pour les annonces Airbnb dont la page a été lue
 * sans coordonnées (Logements) : le point d'une offre sœur du même logement
 * (`regrouper`, `memeLogement`), repris tel quel, jamais moyenné avec la
 * station. Rien d'autre ne passe, et aucune autre source ne reçoit quoi que
 * ce soit. Par identifiant d'annonce.
 */
export function jumelageGpsAirbnb(listings: readonly Listing[]): Map<string, { lat: number; lon: number }> {
  const out = new Map<string, { lat: number; lon: number }>();
  for (const { offres } of regrouper(listings)) {
    if (offres.length < 2) continue;
    if (offres.some((a, i) => offres.some((b, j) => j > i && !capaciteCompatible(a, b)))) continue;
    for (const o of offres) {
      if (o.source !== "Airbnb" || o.pdpLue !== true || gpsPrecis(o)) continue;
      const soeur = offres.find((x) => x !== o && gpsPrecis(x) && x.gpsSource !== "triangule" && memeLogement(o, x));
      if (soeur) out.set(o.id, { lat: soeur.lat as number, lon: soeur.lon as number });
    }
  }
  return out;
}
