/** Altitudes par source, grain station. On n’en fusionne aucune.
 *
 * ## Deux familles de sources, qui ne se mélangent jamais
 *
 * Les cinq premières décrivent une **station française** : elles viennent du
 * dépôt, du classeur France Montagnes, de Skiinfo, de l'IGN ou du catalogue
 * des domaines. Les deux dernières décrivent un **domaine du référentiel
 * mondial**, et `altBandsDomaine()` est seule à les rendre.
 *
 * Aucune fonction ne rend les deux. Ce n'est pas une précaution de style : une
 * altitude IGN au pin d'un village et l'altitude minimale d'un domaine
 * OpenSkiMap ne mesurent pas la même chose, et les afficher dans une même
 * colonne laisserait croire à un écart là où il y a deux définitions.
 */

import { domainForStation } from "./forfaits/catalog.ts";
import type { DomaineMonde } from "./monde/monde.ts";
import { SKIINFO } from "./skiinfo.ts";
import { dropM, type Station } from "./stations.ts";

export type AltSourceId =
  | "village"
  | "fm"
  | "skiinfo"
  | "ign"
  | "catalog"
  /** Le relevé d'altitude d'OpenSkiMap, à l'échelle du domaine. */
  | "openskimap"
  /** Modèle numérique de terrain servi par Open-Meteo, hors de France, où
   *  l'IGN ne couvre rien. Les deux ne se mélangent pas : `ign` tient au pin
   *  d'une station française, `dem` au point de référence d'un domaine. */
  | "dem";

export type AltBand = {
  source: AltSourceId;
  label: string;
  villageM: number | null;
  minM: number | null;
  maxM: number | null;
  dropM: number | null;
  /**
   * Un relevé **ponctuel**, qui n'est ni un village, ni une borne de domaine.
   *
   * Aucun des trois champs ci-dessus ne le dirait sans mentir : le ranger dans
   * `villageM` inventerait un village, et le mettre à la fois dans `minM` et
   * `maxM` afficherait un dénivelé de zéro là où rien n'a été mesuré. Seule la
   * bande `dem` l'emploie.
   */
  pointM?: number | null;
};

function band(
  source: AltSourceId,
  label: string,
  villageM: number | null,
  minM: number | null,
  maxM: number | null,
): AltBand {
  const drop = minM != null && maxM != null ? Math.max(0, maxM - minM) : null;
  return { source, label, villageM, minM, maxM, dropM: drop };
}

export function altBands(station: Station): AltBand[] {
  const out: AltBand[] = [
    band("village", "Village (cette station)", station.villageM, null, null),
  ];
  const si = SKIINFO[station.id];
  if (si?.minM != null || si?.maxM != null) {
    out.push(band("skiinfo", "Skiinfo (cette fiche)", null, si.minM ?? null, si.maxM ?? null));
  }
  if (station.fmId != null && (station.fmMinM != null || station.fmMaxM != null)) {
    out.push(
      band("fm", "France Montagnes", station.fmVillageM, station.fmMinM, station.fmMaxM),
    );
  }
  if (station.demM != null) {
    const pin =
      station.pinKind === "sommet"
        ? "IGN au pin (sommet, pas le village)"
        : station.pinKind === "base"
          ? "IGN au pin (village)"
          : "IGN au pin GPS";
    out.push(band("ign", pin, station.pinKind === "sommet" ? null : station.demM, null, station.pinKind === "sommet" ? station.demM : null));
  }
  const cat = domainForStation(station.id);
  if (cat && (cat.villageM != null || cat.minM != null || cat.maxM != null)) {
    out.push(band("catalog", "Catalogue domaine", cat.villageM ?? null, cat.minM ?? null, cat.maxM ?? null));
  }
  return out;
}

/**
 * Les altitudes d'un domaine du référentiel mondial.
 *
 * **`villageM` vaut toujours `null` ici, et c'est le fond du sujet.** Un
 * domaine n'a pas de village : `minM` est son point le plus bas, qui peut être
 * un fond de vallée sans une maison, et le point de référence que la source
 * donne — `viewportHint.center` — n'est ni le village, ni le sommet, ni le
 * départ des pistes. L'écran doit dire ce qu'il montre, et ne peut pas parler
 * d'altitude de village là où personne n'en a mesuré une.
 *
 * `demM` est le relevé du modèle de terrain à ce point de référence, quand il
 * a été demandé. Il ne remplace ni `minM` ni `maxM` : il dit à quelle altitude
 * se trouve le point sur lequel la carte cadre, ce qui est une troisième
 * chose encore.
 */
export function altBandsDomaine(d: DomaineMonde, demM: number | null = null): AltBand[] {
  const out: AltBand[] = [];
  if (d.minM != null || d.maxM != null) {
    out.push(band("openskimap", "OpenSkiMap (domaine, pas un village)", null, d.minM, d.maxM));
  }
  if (demM != null) {
    out.push({
      ...band("dem", "Modèle de terrain au point de référence du domaine", null, null, null),
      pointM: demM,
    });
  }
  return out;
}

export function altDeltaM(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return a - b;
}

export function displaySummitM(station: Station): number {
  return station.maxM;
}

export function displayDropM(station: Station): number {
  return dropM(station);
}
