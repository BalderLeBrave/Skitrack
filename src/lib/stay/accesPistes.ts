/**
 * L'accès aux pistes d'un logement, pour la fiche d'annonce : la remontée la
 * plus proche et ses altitudes, la piste la plus proche, le village à pied.
 *
 * Module pur : les altitudes arrivent du service d'altitude
 * (`src/lib/altitude/`), les tracés de pistes de `public/pistes-traces/`
 * (`scripts/build-pistes-traces.mjs`). Rien n'est estimé quand une donnée
 * manque : la fonction rend `null`, et la fiche le dit.
 */

/** Une piste telle que l'écrit `scripts/build-pistes-traces.mjs`. */
export type TracePiste = {
  /** Le nom publié, ou `null`. */
  n: string | null;
  /** La référence (numéro), ou `null`. */
  r: string | null;
  /** La difficulté d'openskidata : `novice`, `easy`, `intermediate`, `advanced`… */
  d: string | null;
  /** Le tracé, [lon, lat]. */
  l: [number, number][];
};

export type FichierTraces = { domaine: string; nom: string; le: string; source: string; pistes: TracePiste[] };

/** Au-delà, la piste « la plus proche » ne dit plus rien de l'accès. */
export const PISTE_MAX_M = 2000;
/** À cette distance d'une piste ou moins, on part skis aux pieds. */
export const SKIS_AUX_PIEDS_M = 50;
/** Allure à pied, sans tenir compte du dénivelé. */
export const MARCHE_KMH = 4.5;

/**
 * Les altitudes d'une remontée à ses deux gares. Le départ est la gare la plus
 * basse. `null` si l'une des deux manque : une seule altitude ne dit pas dans
 * quel sens va la remontée.
 */
export function altitudesRemontee(
  a: number | null | undefined,
  b: number | null | undefined,
): { depart: number; arrivee: number } | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { depart: Math.min(a, b), arrivee: Math.max(a, b) };
}

/**
 * Le temps à pied pour une distance, arrondi à 5 minutes. `moins` : la
 * distance se fait en moins de 5 minutes (l'arrondi rendrait 0).
 */
export function tempsAPied(m: number | null | undefined): { minutes: number; moins: boolean } | null {
  if (m == null || !Number.isFinite(m) || m < 0) return null;
  const brut = m / ((MARCHE_KMH * 1000) / 60);
  const minutes = Math.round(brut / 5) * 5;
  return minutes < 5 ? { minutes: 5, moins: true } : { minutes, moins: false };
}

/** Distance en mètres d'un point à un segment, sur une projection locale. */
function auSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * La piste la plus proche d'un point, et sa distance en mètres, ou `null` s'il
 * n'y en a aucune à moins de `max` mètres. Distance à vol d'oiseau jusqu'au
 * tracé, pas jusqu'à son départ.
 */
export function pisteLaPlusProche(
  lat: number,
  lon: number,
  pistes: readonly TracePiste[],
  max = PISTE_MAX_M,
): { piste: TracePiste; m: number } | null {
  const ex = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ey = 110_540;
  let meilleure: { piste: TracePiste; m: number } | null = null;
  for (const p of pistes) {
    for (let i = 0; i < p.l.length; i++) {
      const [lo1, la1] = p.l[i];
      const [lo2, la2] = p.l[Math.min(i + 1, p.l.length - 1)];
      const d = auSegment(0, 0, (lo1 - lon) * ex, (la1 - lat) * ey, (lo2 - lon) * ex, (la2 - lat) * ey);
      if (d <= max && (!meilleure || d < meilleure.m)) meilleure = { piste: p, m: d };
    }
  }
  return meilleure;
}

/** Une distance affichée : au mètre sous 10 m, à la dizaine au-delà. */
export function arrondiM(m: number): number {
  return m < 10 ? Math.round(m) : Math.round(m / 10) * 10;
}

/**
 * « Skis aux pieds » : seulement si la piste est mesurée à 50 m ou moins, et
 * jamais depuis une position approchée (Airbnb, adresse géocodée), où
 * l'erreur dépasse la distance.
 */
export function skisAuxPieds(m: number | null | undefined, approchee: boolean): boolean {
  return !approchee && m != null && Number.isFinite(m) && m <= SKIS_AUX_PIEDS_M;
}
