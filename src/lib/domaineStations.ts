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
import { cleDomaine, domainBySlug } from "./forfaits/catalog.ts";
import { STATIONS, type Station } from "./stations.ts";

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

/** Les autres stations du domaine skiable d'une station — ses voisines. */
export function stationsVoisines(stationId: string, nomDomaine: string | null | undefined): Station[] {
  if (!domaineNomme(nomDomaine)) return [];
  const cle = cleDomaine(nomDomaine);
  if (!cle) return [];
  return (parDomaine().get(cle) ?? []).filter((s) => s.id !== stationId);
}
