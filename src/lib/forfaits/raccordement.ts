/**
 * Le domaine du référentiel Monde qui correspond à une station française.
 *
 * Les stations sans forfait au catalogue (152 le 30 septembre 2026) ont
 * presque toutes une grille dans le référentiel Monde (Skiinfo, skiresort ou
 * bergfex), mais rien ne les reliait. Le plus proche voisin ne suffit pas :
 * Megevette tombait sur le Massif des Brasses, à 3,4 km, alors que son domaine
 * est Hirmentaz - Les Habères, qui a sa propre fiche.
 *
 * L'ordre suit la force de la preuve :
 *
 * 1. **le nom du domaine** de la station est celui de la fiche, dans un rayon
 *    large (un domaine s'étend) ;
 * 2. **le nom de la station** se retrouve dans celui de la fiche, dans un
 *    rayon moyen ;
 * 3. à défaut, **la proximité seule**, dans un rayon court.
 *
 * Au-delà, rien : une station sans fiche reste sans grille plutôt que de
 * prendre celle du voisin.
 *
 * Un même lieu figure parfois deux fois au référentiel : « Orcières » avec
 * une grille, « Orcières Merlette » sans. Quand la meilleure preuve désigne
 * une fiche sans grille, la preuve suivante est consultée ; faute de mieux, la
 * fiche sans grille est rendue, pour que le rapport dise pourquoi la station
 * reste sans prix.
 */

import { cleDomaine } from "./catalog.ts";

export type DomaineMonde = { id: string; nom: string; lat: number; lon: number };

export type StationARaccorder = {
  id: string;
  name: string;
  domain: string | null;
  lat: number;
  lon: number;
};

export type Raccordement = {
  id: string;
  km: number;
  par: "domaine" | "nom" | "proximite";
};

export const RAYON_DOMAINE_KM = 25;
export const RAYON_NOM_KM = 10;
export const RAYON_PROXIMITE_KM = 2;

/** Distance en kilomètres, à l'équirectangulaire : assez juste à cette échelle. */
export function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const r = Math.PI / 180;
  const x = (b.lat - a.lat) * r;
  const y = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  return 6371 * Math.hypot(x, y);
}

/** Les abréviations que les deux référentiels n'écrivent pas de la même
 *  façon : « La Pierre St Martin » et « La Pierre Saint-Martin ». */
const ABREGES: Record<string, string> = { st: "saint", ste: "sainte" };

/** Les mots d'une clé de domaine, pour dire qu'un nom en contient un autre. */
function mots(nom: string | null | undefined): string[] {
  return (
    cleDomaine(nom)
      ?.split("-")
      .filter(Boolean)
      .map((m) => ABREGES[m] ?? m) ?? []
  );
}

const memeCle = (a: string[], b: string[]): boolean => a.length > 0 && a.join("-") === b.join("-");

/** Tous les mots de `court` se retrouvent, dans l'ordre et d'un seul tenant,
 *  dans `long` : « Orcières » est dans « Orcières Merlette ». */
function contient(long: string[], court: string[]): boolean {
  if (!court.length || court.length > long.length) return false;
  for (let i = 0; i + court.length <= long.length; i += 1) {
    if (court.every((m, j) => long[i + j] === m)) return true;
  }
  return false;
}

export function raccorder(
  s: StationARaccorder,
  domaines: readonly DomaineMonde[],
  aUneGrille: (id: string) => boolean = () => true,
): Raccordement | null {
  if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return null;
  const motsDom = mots(s.domain);
  const motsNom = mots(s.name);
  // Par niveau de preuve, le plus proche avec grille et le plus proche tout court.
  const niveaux: Record<
    Raccordement["par"],
    { avec: Raccordement | null; tout: Raccordement | null }
  > = {
    domaine: { avec: null, tout: null },
    nom: { avec: null, tout: null },
    proximite: { avec: null, tout: null },
  };
  const retenir = (par: Raccordement["par"], d: DomaineMonde, km: number) => {
    const n = niveaux[par];
    const r = { id: d.id, km, par };
    if (!n.tout || km < n.tout.km) n.tout = r;
    if (aUneGrille(d.id) && (!n.avec || km < n.avec.km)) n.avec = r;
  };
  for (const d of domaines) {
    if (!Number.isFinite(d.lat) || !Number.isFinite(d.lon)) continue;
    const km = distanceKm(s, d);
    const motsFiche = mots(d.nom);
    if (km <= RAYON_DOMAINE_KM && memeCle(motsFiche, motsDom)) retenir("domaine", d, km);
    if (km <= RAYON_NOM_KM && contient(motsFiche, motsNom)) retenir("nom", d, km);
    if (km <= RAYON_PROXIMITE_KM) retenir("proximite", d, km);
  }
  const ordre: Raccordement["par"][] = ["domaine", "nom", "proximite"];
  for (const par of ordre) if (niveaux[par].avec) return niveaux[par].avec;
  for (const par of ordre) if (niveaux[par].tout) return niveaux[par].tout;
  return null;
}
