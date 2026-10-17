/**
 * La lecture des galeries en tâche de fond, commune aux moteurs dont la liste
 * ne publie qu'une vignette (Open System, iResa) : la fiche de chaque
 * logement, une à la fois, pour ses seules photos. Partie pure : le réseau,
 * la mémoire et l'arrêt sont confiés à la porte.
 */

/** Ce que la suite demande au réseau et à la mémoire. */
export type PorteGaleries<F> = {
  /** La page de la fiche ; `null` : rien n'est parti (la suite a cédé). Lève sur un refus ou une panne. */
  lire: (f: F) => Promise<string | null>;
  /** Galerie déjà gardée, ou fiche hors de la centrale : on passe. */
  dejaLue: (f: F) => boolean;
  /** Une raison de s'arrêter avant la fiche suivante (nouvelle recherche, durée, pause de refus). */
  arret: () => string | null;
  /** La galerie lue, à garder. */
  garder: (f: F, photos: string[]) => void;
};

/** Pages sans galerie d'affilée avant d'arrêter : un défi, une page d'erreur servie en 200. */
export const SANS_GALERIE_DE_SUITE = 3;

/**
 * Une fiche à la fois, sans nouvel essai : la suite s'arrête sur la première
 * raison que donne `arret`, sur la première erreur (rendue, refus compris),
 * et après trois pages de suite sans galerie. Une galerie d'une seule photo
 * n'apprend rien que la liste ne dise : elle n'est pas gardée. Au plus `max`
 * fiches demandées. `nom` dit la fiche dans le motif d'arrêt.
 */
export async function lireGaleries<F>(
  fiches: readonly F[],
  porte: PorteGaleries<F>,
  galerie: (page: string, f: F) => string[],
  nom: (f: F) => string,
  max: number,
): Promise<{ lues: number; demandes: number; arret: string | null; erreur: string | null }> {
  let lues = 0;
  let demandes = 0;
  let vides = 0;
  for (const f of fiches) {
    if (demandes >= max) return { lues, demandes, arret: `${max} fiches demandées`, erreur: null };
    const raison = porte.arret();
    if (raison) return { lues, demandes, arret: raison, erreur: null };
    if (porte.dejaLue(f)) continue;
    demandes += 1;
    let page: string | null;
    try {
      page = await porte.lire(f);
    } catch (err) {
      const erreur = err instanceof Error ? err.message : String(err);
      return { lues, demandes, arret: `fiche ${nom(f)} : ${erreur}`, erreur };
    }
    if (page == null) return { lues, demandes, arret: porte.arret() ?? "la suite a cédé", erreur: null };
    const photos = galerie(page, f);
    if (photos.length === 0) {
      vides += 1;
      if (vides >= SANS_GALERIE_DE_SUITE) {
        return { lues, demandes, arret: `${vides} fiches de suite sans galerie`, erreur: null };
      }
      continue;
    }
    vides = 0;
    lues += 1;
    if (photos.length > 1) porte.garder(f, photos);
  }
  return { lues, demandes, arret: null, erreur: null };
}
