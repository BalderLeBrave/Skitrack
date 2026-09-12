/**
 * Quelle photo afficher pour une station, et de qui elle est.
 *
 * ## Le problème
 *
 * Le dépôt porte 229 photos locales, une par station ayant une fiche Skiinfo.
 * Le référentiel en compte 320 : **91 stations n'ont donc pas de photo
 * propre**, et la plupart sont des fronts de neige d'un domaine dont une autre
 * station, elle, en a une. Aime 2000 n'a pas de photo ; La Plagne, même
 * domaine, en a une, et c'est bien celle que Skiinfo publie pour ce front de
 * neige.
 *
 * ## Ce qui est fait
 *
 * La photo du **domaine** est empruntée, et l'emprunt est dit à l'écran. Ce
 * n'est pas une invention : la photo existe, elle est locale, elle montre le
 * même domaine skiable, et le crédit nomme la station d'origine. Ce serait une
 * invention de la présenter comme la photo d'Aime 2000.
 *
 * ## Ce qui n'est pas fait
 *
 * Aucun hotlink. Les URL distantes de `skiinfo.photos.json` ne sont jamais
 * posées dans un `src` : deux d'entre elles ne répondent plus, et
 * `skiinfo.photos.test.ts` interdit la pratique. Une station sans domaine
 * donneur reste sans photo, et l'écran le dit — elles sont 19.
 *
 * ## Le choix du donneur
 *
 * Déterministe, et dans cet ordre :
 *
 * 1. une station du domaine dont le **nom figure dans le libellé du domaine**
 *    (« Paradiski (Les Arcs – La Plagne) » désigne La Plagne et Les Arcs) ;
 *    à égalité, le nom le plus long, donc le plus spécifique ;
 * 2. sinon la station du domaine au **sommet le plus haut**, qui est le visage
 *    usuel d'un domaine (Les Trois Vallées → Val Thorens) ;
 * 3. à égalité stricte, l'ordre alphabétique, pour que le résultat ne dépende
 *    pas de l'ordre de chargement.
 */

import { STATIONS, stationById, type Station } from "./stations.ts";

export type ResolvedPhoto = {
  /** Chemin du fichier local à afficher. */
  src: string;
  /** Station dont la photo est empruntée. `null` quand c'est la sienne. */
  fromId: string | null;
  fromName: string | null;
  /** Domaine qui justifie l'emprunt. `null` quand la photo est la sienne. */
  domain: string | null;
};

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const BY_DOMAIN = new Map<string, Station[]>();
for (const s of STATIONS) {
  if (!s.domain) continue;
  const rows = BY_DOMAIN.get(s.domain) ?? [];
  rows.push(s);
  BY_DOMAIN.set(s.domain, rows);
}

/** Station du domaine qui prête sa photo, ou `null` si aucune n'en a. */
export function photoDonorOf(domain: string): Station | null {
  const cands = (BY_DOMAIN.get(domain) ?? []).filter((s) => s.photo);
  if (cands.length === 0) return null;
  const label = fold(domain);
  const named = cands
    .filter((s) => label.includes(fold(s.name)))
    .sort((a, b) => fold(b.name).length - fold(a.name).length);
  if (named[0]) return named[0];
  return [...cands].sort(
    (a, b) => (b.maxM ?? 0) - (a.maxM ?? 0) || a.name.localeCompare(b.name, "fr"),
  )[0];
}

/** Photo à afficher pour cette station. `null` quand il n'y en a aucune. */
export function resolveStationPhoto(id: string): ResolvedPhoto | null {
  const s = stationById(id);
  if (!s) return null;
  if (s.photo) return { src: s.photo, fromId: null, fromName: null, domain: null };
  if (!s.domain) return null;
  const donor = photoDonorOf(s.domain);
  if (!donor || !donor.photo || donor.id === s.id) return null;
  return { src: donor.photo, fromId: donor.id, fromName: donor.name, domain: s.domain };
}

/** Couverture, pour l'audit : propres, empruntées, absentes. */
export function photoCoverage(): {
  total: number;
  propres: number;
  empruntees: number;
  absentes: string[];
} {
  let propres = 0;
  let empruntees = 0;
  const absentes: string[] = [];
  for (const s of STATIONS) {
    const p = resolveStationPhoto(s.id);
    if (!p) absentes.push(s.id);
    else if (p.fromId) empruntees += 1;
    else propres += 1;
  }
  return { total: STATIONS.length, propres, empruntees, absentes };
}
