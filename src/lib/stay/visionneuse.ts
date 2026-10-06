/**
 * La logique de la visionneuse de photos et du passage d'un logement à
 * l'autre dans la fiche d'annonce, sans DOM, pour être éprouvée seule.
 * L'affichage est dans `components/v7/Visionneuse.tsx` et `VoletAnnonce.tsx`.
 */

/** Le rang `i` ramené dans la galerie de `n` photos : après la dernière vient
 *  la première, avant la première la dernière. 0 pour une galerie vide. */
export function indexBoucle(i: number, n: number): number {
  if (n <= 0) return 0;
  return ((i % n) + n) % n;
}

/**
 * Les photos à charger d'avance autour de celle qu'on regarde : la précédente
 * et les deux suivantes, en boucle, sans la photo affichée ni doublon. Dans
 * l'ordre où on risque d'en avoir besoin : la suivante d'abord.
 */
export function aPrecharger(i: number, n: number): number[] {
  if (n <= 1) return [];
  const out: number[] = [];
  for (const d of [1, -1, 2]) {
    const j = indexBoucle(i + d, n);
    if (j !== indexBoucle(i, n) && !out.includes(j)) out.push(j);
  }
  return out;
}

/**
 * Le rang de la photo affichée. La photo se suit par son adresse : quand une
 * photo qui la précède ne se charge pas et sort de la galerie, la même photo
 * reste à l'écran. Si c'est elle qui sort, on garde son ancien rang, borné :
 * la suivante prend sa place.
 */
export function rangCourant(photos: readonly string[], adresse: string | null, repli: number): number {
  if (photos.length === 0) return 0;
  const i = adresse == null ? -1 : photos.indexOf(adresse);
  if (i >= 0) return i;
  return Math.min(Math.max(0, repli), photos.length - 1);
}

/**
 * Le logement voisin dans la liste affichée, ou `null` aux extrémités. Pas de
 * boucle : la liste a un début et une fin, et les boutons s'y désactivent.
 *
 * `ici` : l'annonce ouverte et les autres offres du même logement. La liste
 * ne montre que l'offre la moins chère : celle qu'on a ouverte peut ne pas y
 * figurer, son logement si.
 */
export function voisinDansListe(liste: readonly string[], ici: readonly string[], sens: 1 | -1): string | null {
  const i = liste.findIndex((id) => ici.includes(id));
  if (i < 0) return null;
  return liste[i + sens] ?? null;
}

/** Ce que la molette ou le trackpad a accumulé depuis le dernier pas. */
export type Molette = { cumul: number; dernier: number; bloqueJusqua: number };
export const MOLETTE0: Molette = { cumul: 0, dernier: 0, bloqueJusqua: 0 };
/** Distance à parcourir pour changer de photo. */
export const MOLETTE_SEUIL = 60;
/** Après un pas, l'élan du trackpad est absorbé pendant ce délai. */
export const MOLETTE_PAUSE_MS = 350;
/** Un geste qui s'arrête plus longtemps que cela repart de zéro. */
export const MOLETTE_OUBLI_MS = 250;

/**
 * Lit un évènement de molette. Un trackpad envoie des dizaines de petits
 * déplacements pour un seul geste : on les additionne jusqu'au seuil, on
 * avance d'une photo, puis on ignore l'élan qui suit.
 *
 * L'axe horizontal compte toujours. Le vertical seulement si `vertical` : en
 * plein écran, où rien d'autre ne défile. Dans la fenêtre, la molette
 * verticale fait défiler la fiche, même au-dessus de la photo.
 *
 * `pris` dit si l'évènement concerne la visionneuse (et doit être retenu au
 * navigateur) ; `pas` dit s'il faut changer de photo.
 */
export function lireMolette(
  m: Molette,
  dx: number,
  dy: number,
  t: number,
  vertical: boolean,
): { m: Molette; pas: -1 | 0 | 1; pris: boolean } {
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const d = horizontal ? dx : vertical ? dy : 0;
  if (d === 0) return { m, pas: 0, pris: false };
  if (t < m.bloqueJusqua) return { m: { ...m, cumul: 0, dernier: t }, pas: 0, pris: true };
  const cumul = (t - m.dernier > MOLETTE_OUBLI_MS ? 0 : m.cumul) + d;
  if (Math.abs(cumul) < MOLETTE_SEUIL) return { m: { ...m, cumul, dernier: t }, pas: 0, pris: true };
  return { m: { cumul: 0, dernier: t, bloqueJusqua: t + MOLETTE_PAUSE_MS }, pas: cumul > 0 ? 1 : -1, pris: true };
}

/** Distance horizontale d'un glissé qui change de photo. */
export const GLISSE_SEUIL = 50;

/**
 * Le sens d'un glissé, souris ou doigt : vers la gauche, la photo suivante.
 * Un geste surtout vertical ne compte pas : c'est un défilement.
 */
export function sensGlisse(dx: number, dy: number, seuil = GLISSE_SEUIL): -1 | 0 | 1 {
  if (Math.abs(dx) < seuil || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * Le défilement du ruban de vignettes qui garde la vignette active en vue,
 * avec une marge de chaque côté. Rend le défilement actuel quand elle l'est
 * déjà : le ruban ne bouge pas pour rien.
 */
export function defilementRuban(
  defilement: number,
  largeur: number,
  gauche: number,
  taille: number,
  marge = 0,
): number {
  if (gauche - marge < defilement) return Math.max(0, gauche - marge);
  if (gauche + taille + marge > defilement + largeur) return gauche + taille + marge - largeur;
  return defilement;
}
