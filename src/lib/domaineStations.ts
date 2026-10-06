/**
 * Les stations rattachées à un domaine skiable.
 *
 * Le catalogue de forfaits va dans un sens : d'une station à l'entrée qui
 * porte son tarif (`rattachementForfait`). Deux écrans ont besoin de l'autre —
 * Forfaits, où l'on choisit un domaine sans pouvoir ouvrir aucune de ses
 * stations, et « Plus », qui ne proposait rien pour passer d'une station à sa
 * voisine de forfait.
 *
 * Le rattachement se lit sur le **domaine skiable**, pas sur l'entrée du
 * catalogue : celui-ci décrit des stations — « Courchevel », « Méribel »,
 * « Val Thorens » ont chacune la leur — et c'est leur `pass` qui nomme le
 * domaine commun, « Les 3 Vallées ». Le référentiel de stations le nomme
 * « Les Trois Vallées ». `cleDomaine` fait tomber les deux écritures sur la
 * même clé, comme pour l'héritage du tarif : les deux sens ne peuvent donc pas
 * se contredire.
 *
 * Le libellé « domaine non nommé (OpenStreetMap) » ne réunit personne
 * (`domaineNomme`) : il faisait de Beille, dans l'Ariège, la voisine de
 * Névache et de Saint-Colomban-des-Villards, à 471 et 462 km.
 */

import { domaineNomme } from "./classeur.ts";
import { libelleSansLiaison, memeLibelleNonReliees } from "./domainFit.ts";
import { cleDomaine, domainBySlug } from "./forfaits/catalog.ts";
import { STATIONS, stationById, type Station } from "./stations.ts";
import { stationDeRattachement, villagesDe } from "./villages.ts";

let index: Map<string, Station[]> | null = null;

function parDomaine(): Map<string, Station[]> {
  if (index) return index;
  index = new Map();
  for (const s of STATIONS) {
    if (!domaineNomme(s.domain)) continue;
    const cle = cleDomaine(s.domain);
    if (!cle) continue;
    const f = index.get(cle);
    if (f) f.push(s);
    else index.set(cle, [s]);
  }
  for (const f of index.values()) f.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return index;
}

/** La clé du domaine skiable qu'une entrée de catalogue ouvre. */
function cleDuForfait(slug: string): string | null {
  const d = domainBySlug(slug);
  if (!d) return null;
  return cleDomaine(d.pass) ?? cleDomaine(d.seed?.zone) ?? cleDomaine(d.name);
}

/** Les stations que ce forfait ouvre, par ordre alphabétique. */
export function stationsDuDomaine(slug: string): Station[] {
  const d = domainBySlug(slug);
  if (!d) return [];
  const cle = cleDuForfait(slug);
  const vues = new Map<string, Station>();
  for (const s of cle ? (parDomaine().get(cle) ?? []) : []) vues.set(s.id, s);
  // Les seize stations que le catalogue nomme lui-même priment : elles sont
  // rattachées à la main, et n'ont pas besoin d'un nom de domaine pour l'être.
  for (const id of d.stationIds) {
    const s = STATIONS.find((x) => x.id === id);
    if (s) vues.set(s.id, s);
  }
  return [...vues.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/**
 * Les autres stations qui portent le même libellé de domaine, villages
 * compris, sans autre examen. C'est le partage des caméras (`webcams.ts`) :
 * une caméra du domaine se montre sur chacune de ses fiches. Ce n'est pas
 * « domaine relié » (`stationsVoisines`), et jamais un rattachement de
 * logements.
 */
export function stationsDuLibelle(stationId: string, nomDomaine: string | null | undefined): Station[] {
  if (!domaineNomme(nomDomaine)) return [];
  const cle = cleDomaine(nomDomaine);
  if (!cle) return [];
  return (parDomaine().get(cle) ?? []).filter((s) => s.id !== stationId);
}

/**
 * Les autres stations du domaine skiable relié d'une station — ses voisines :
 * « domaine relié avec X ». Une information de la fiche station, jamais un
 * rattachement : leurs logements restent les leurs (`stay/rattachement.ts`).
 *
 * Des stations, pas des villages : les villages de la station
 * (`villages.ts`) sont elle-même, et ceux d'une voisine sont rendus par leur
 * station. Un libellé de forfait commun (`libelleSansLiaison`, Haute
 * Maurienne Vanoise) ne relie personne, ni une paire que le libellé réunit
 * sans liaison à ski (`memeLibelleNonReliees`, Abondance–Morzine) : le menu
 * proposait Aussois depuis Val Cenis, et Morzine depuis Abondance.
 */
export function stationsVoisines(stationId: string, nomDomaine: string | null | undefined): Station[] {
  if (!domaineNomme(nomDomaine) || libelleSansLiaison(nomDomaine)) return [];
  const cle = cleDomaine(nomDomaine);
  if (!cle) return [];
  const famille = stationDeRattachement(stationId);
  const vues = new Map<string, Station>();
  for (const s of parDomaine().get(cle) ?? []) {
    const mere = stationDeRattachement(s.id);
    if (mere === famille || vues.has(mere)) continue;
    if (memeLibelleNonReliees(famille, mere) || memeLibelleNonReliees(stationId, s.id)) continue;
    const station = stationById(mere);
    if (station) vues.set(mere, station);
  }
  return [...vues.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/** La station dont celle-ci n'est qu'un village, ou rien. */
export function stationMere(stationId: string): Station | undefined {
  const mere = stationDeRattachement(stationId);
  return mere === stationId ? undefined : stationById(mere);
}

/** Les villages d'une station, par ordre alphabétique. */
export function villagesDeLaStation(stationId: string): Station[] {
  return villagesDe(stationId)
    .map((id) => stationById(id))
    .filter((s): s is Station => s != null)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
