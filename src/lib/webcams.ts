/**
 * Webcams des stations.
 *
 * Table vérifiée : chaque adresse de `webcams.data.ts` a été affichée dans le
 * même cadre que l'application (`iframe` aux mêmes attributs, ou `img`), depuis
 * une page locale, et sa capture regardée. Une webcam morte est pire qu'une
 * webcam absente. Les flux restent chez l'exploitant : l'application les
 * affiche sans copie ni réencodage.
 *
 * La table est rangée par identifiant de station. Elle l'était par nom, avec un
 * rapprochement textuel tolérant qui ne couvrait qu'une trentaine de stations ;
 * l'identifiant ne se trompe pas de village.
 *
 * Une station montre d'abord ses caméras, puis celles des autres stations du
 * même domaine skiable (`Station.domain`) : La Tania montre celles de
 * Courchevel, Méribel, Val Thorens et des Menuires. Toutes les stations d'un
 * domaine proposent donc les mêmes caméras, dans un ordre qui commence chez
 * elles.
 */

import { stationsVoisines } from "./domaineStations.ts";
import { stationById } from "./stations.ts";
import { CAMERAS, type Camera } from "./webcams.data.ts";

export type Webcam = {
  /** L'URL sert d'identifiant : elle est unique et stable. */
  id: string;
  label: string;
  url: string;
  /** `iframe` pour le lecteur d'un fournisseur, `image` pour une image fixe que
   *  l'exploitant rafraîchit. */
  kind: "iframe" | "image";
  /** La station où la caméra est posée. Elle n'est pas toujours celle qu'on
   *  regarde : un domaine partage ses caméras entre ses villages, et la fiche
   *  de Brides-les-Bains montrait celle de Val Thorens sans le dire. */
  station: string | null;
  /** Vrai quand la caméra vient d'une autre station du domaine. */
  duDomaine: boolean;
  /** Le fournisseur du lecteur, pour l'audit. */
  fournisseur: string;
};

function versWebcam(c: Camera, station: string | null, duDomaine: boolean): Webcam {
  return {
    id: c.url,
    label: duDomaine && station ? `${station}, ${c.label}` : c.label,
    url: c.url,
    kind: c.kind ?? "iframe",
    station,
    duDomaine,
    fournisseur: c.fournisseur,
  };
}

/**
 * Webcams d'une station : les siennes en tête, dans l'ordre de la table, puis
 * celles des autres stations de son domaine, par ordre alphabétique, sans
 * doublon d'adresse.
 */
export function webcamsForStation(stationId: string): Webcam[] {
  const station = stationById(stationId);
  if (!station) return [];
  const vues = new Set<string>();
  const propres: Webcam[] = [];
  for (const c of CAMERAS[stationId] ?? []) {
    if (vues.has(c.url)) continue;
    vues.add(c.url);
    propres.push(versWebcam(c, null, false));
  }
  const partagees: Webcam[] = [];
  for (const voisine of stationsVoisines(stationId, station.domain)) {
    for (const c of CAMERAS[voisine.id] ?? []) {
      if (vues.has(c.url)) continue;
      vues.add(c.url);
      partagees.push(versWebcam(c, voisine.name, true));
    }
  }
  partagees.sort((a, b) => a.label.localeCompare(b.label, "fr"));
  return [...propres, ...partagees];
}

/** Couverture de la table, pour l'audit : qui a une caméra, qui n'en a pas. */
export function webcamCoverage(ids: readonly string[]): {
  total: number;
  couvertes: string[];
  sansCamera: string[];
  flux: number;
} {
  const couvertes: string[] = [];
  const sansCamera: string[] = [];
  let flux = 0;
  for (const id of ids) {
    const cams = webcamsForStation(id);
    if (cams.length === 0) sansCamera.push(id);
    else {
      couvertes.push(id);
      flux += cams.length;
    }
  }
  return { total: ids.length, couvertes, sansCamera, flux };
}
