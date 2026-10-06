/**
 * L'état de la galerie de la fiche d'annonce : la photo affichée, celles qui
 * ne se chargent pas, et le chargement d'avance. La fenêtre et le plein écran
 * (`Visionneuse.tsx`) le partagent : ils montrent la même photo.
 *
 * Chaque photo s'affiche à la plus grande taille publiée (`photoHd.ts`). Si
 * celle-là ne se charge pas, la photo revient à l'adresse relevée ; si
 * celle-ci échoue aussi, elle sort de la galerie.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { photoTailles, type TaillesPhoto } from "@/lib/stay/photoHd";
import { aPrecharger, indexBoucle, rangCourant } from "@/lib/stay/visionneuse";

/** La place de la photo dans la fenêtre : toute la largeur sous 940 px, la
 *  colonne de gauche au-dessus. */
export const TAILLE_FENETRE = "(max-width: 939.98px) 100vw, 820px";
/** En plein écran, tout l'écran. */
export const TAILLE_PLEIN = "100vw";

/** La grande taille (`photoHd`), puis l'adresse relevée. */
export type Etape = "grande" | "releve";
export type VuePhoto = TaillesPhoto & { etape: Etape };

type EtatGalerie = {
  cle: string;
  adresse: string | null;
  rang: number;
  /** Photos qui ne se chargent pas du tout : hors de la galerie. */
  ratees: ReadonlySet<string>;
  /** Photos dont la grande taille a échoué : montrées à l'adresse relevée. */
  replis: ReadonlySet<string>;
};

export type Galerie = {
  /** Les photos qui se chargent, dans l'ordre publié (adresses relevées). */
  photos: readonly string[];
  /** Le rang de la photo affichée. */
  i: number;
  aller: (sens: 1 | -1) => void;
  choisir: (j: number) => void;
  /** L'adresse à afficher pour une photo, ses tailles, et l'étape : la
   *  grande taille, ou l'adresse relevée. */
  vue: (adresse: string) => VuePhoto;
  /** Une photo n'a pas pu se charger à cette étape : on passe à la suivante.
   *  Un second échec de la même étape ne compte pas deux fois. */
  echec: (adresse: string, etape: Etape) => void;
  /** La photo sort de la galerie. */
  rater: (adresse: string) => void;
};

/**
 * L'état de la galerie d'une annonce. `cle` : l'annonce ; une autre annonce
 * repart de sa première photo. `sizes` : la place de la photo à l'écran, pour
 * charger d'avance la bonne taille.
 */
export function useGalerie(cle: string, toutes: readonly string[], sizes: string): Galerie {
  const init = useCallback(
    (): EtatGalerie => ({ cle, adresse: toutes[0] ?? null, rang: 0, ratees: new Set(), replis: new Set() }),
    [cle, toutes],
  );
  const [brut, setBrut] = useState<EtatGalerie>(init);
  // Une autre annonce : l'état repart de zéro dès ce rendu, et se pose au suivant.
  const etat = useMemo(() => (brut.cle === cle ? brut : init()), [brut, cle, init]);
  useEffect(() => {
    if (brut.cle !== cle) setBrut(init());
  }, [brut.cle, cle, init]);
  const photos = useMemo(() => toutes.filter((u) => !etat.ratees.has(u)), [toutes, etat.ratees]);
  const i = rangCourant(photos, etat.adresse, etat.rang);
  const maj = useCallback(
    (f: (e: EtatGalerie) => EtatGalerie) => setBrut((p) => f(p.cle === cle ? p : init())),
    [cle, init],
  );
  const aller = useCallback(
    (sens: 1 | -1) =>
      maj((e) => {
        const vis = toutes.filter((u) => !e.ratees.has(u));
        const j = indexBoucle(rangCourant(vis, e.adresse, e.rang) + sens, vis.length);
        return { ...e, adresse: vis[j] ?? null, rang: j };
      }),
    [maj, toutes],
  );
  const choisir = useCallback(
    (j: number) =>
      maj((e) => {
        const vis = toutes.filter((u) => !e.ratees.has(u));
        return { ...e, adresse: vis[j] ?? null, rang: j };
      }),
    [maj, toutes],
  );
  const rater = useCallback(
    (u: string) => maj((e) => (e.ratees.has(u) ? e : { ...e, ratees: new Set(e.ratees).add(u) })),
    [maj],
  );
  const echec = useCallback(
    (u: string, etape: Etape) =>
      maj((e) => {
        if (e.ratees.has(u)) return e;
        // Une image chargée d'avance à qui l'on donne `srcset` puis `src`
        // part deux fois, et peut échouer deux fois pour un seul essai.
        if (etape === "grande") return e.replis.has(u) ? e : { ...e, replis: new Set(e.replis).add(u) };
        return { ...e, ratees: new Set(e.ratees).add(u) };
      }),
    [maj],
  );
  const replis = etat.replis;
  const vue = useCallback((u: string): VuePhoto => {
    const t = photoTailles(u);
    // Une adresse que `photoHd` ne change pas n'a pas de second essai.
    if (replis.has(u) || t.src === u) return { src: u, srcset: null, etape: "releve" };
    return { ...t, etape: "grande" };
  }, [replis]);

  // La précédente et les deux suivantes se chargent d'avance, à la taille
  // qu'elles auront à l'écran.
  useEffect(() => {
    for (const j of aPrecharger(i, photos.length)) {
      const u = photos[j];
      if (!u) continue;
      const t = vue(u);
      const im = new Image();
      im.onerror = () => echec(u, t.etape);
      if (t.srcset) {
        im.sizes = sizes;
        im.srcset = t.srcset;
      }
      im.src = t.src;
    }
  }, [i, photos, vue, echec, sizes]);

  return { photos, i, aller, choisir, vue, echec, rater };
}
