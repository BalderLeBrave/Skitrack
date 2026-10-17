/**
 * Ce que la fiche d'un domaine européen hors France montre en plus de ce que
 * `Station` porte : sa photo et ses forfaits, tels que le relevé mondial les a
 * appariés (`monde/vues.ts` : Skiinfo, skiresort, bergfex, page officielle).
 *
 * Un prix reste dans sa devise : 62 CHF ne s'écrit pas en euros. Une case que
 * la source ne publie pas s'écrit « non relevé », aucune n'est déduite d'une
 * autre.
 */

import { useEffect, useState } from "react";
import { tr } from "@/lib/i18n";
import {
  forfaitDuDomaine,
  LIBELLE_POSTE,
  mentionForfait,
  photoDuDomaine,
  prix,
  releveVues,
  type ForfaitVue,
  type PhotoVue,
  type ReleveVues,
} from "@/lib/monde/vues";
import type { Station } from "@/lib/stations";

export type VueEurope = {
  pret: boolean;
  photo: { src: string; source: PhotoVue } | null;
  forfait: ForfaitVue | null;
};

/** Le relevé du domaine, chargé pour un domaine hors France seulement. */
export function useVueEurope(s: Station): VueEurope {
  const etranger = s.country !== "FR";
  const [releve, setReleve] = useState<ReleveVues | null>(null);
  useEffect(() => {
    if (!etranger) return;
    let actif = true;
    releveVues()
      .then((r) => {
        if (actif) setReleve(r);
      })
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [etranger]);
  if (!etranger || !releve) return { pret: !etranger, photo: null, forfait: null };
  return {
    pret: true,
    photo: photoDuDomaine(releve, s.id, 1600),
    forfait: forfaitDuDomaine(releve, s.id),
  };
}

const LIGNES = [
  { cle: "jour", adulte: "jourAdulte", enfant: "jourEnfant" },
  { cle: "six", adulte: "sixJoursAdulte", enfant: "sixJoursEnfant" },
  { cle: "saison", adulte: "saisonAdulte", enfant: "saisonEnfant" },
] as const;

/** Le prix d'une journée adulte, dans sa devise, ou `null`. */
export function journeeAdulteEurope(f: ForfaitVue | null): string | null {
  const c = f?.matrice?.jourAdulte;
  return f && c ? prix(c.prix, f.devise) : null;
}

/** Les six forfaits d'un domaine européen : journée, six jours, saison, adulte et enfant. */
export function ForfaitsEurope({ vue }: { vue: VueEurope }) {
  const f = vue.forfait;
  if (!vue.pret) return <p className="fs-muet">{tr("Lecture des tarifs…")}</p>;
  if (!f?.matrice || !f.devise) {
    return (
      <p className="fs-muet">
        {tr(
          "Aucun tarif relevé pour ce domaine. Le coût du séjour n’inclura pas de forfait tant qu’un prix n’a pas été relevé ou saisi.",
        )}
      </p>
    );
  }
  const m = f.matrice;
  return (
    <>
      <div className="fs-forfaits">
        {LIGNES.flatMap((l) =>
          (["adulte", "enfant"] as const).map((qui) => {
            const poste = l[qui];
            const c = m[poste];
            const lib = LIBELLE_POSTE[poste];
            return (
              <div key={poste}>
                <span>
                  {tr(lib.ligne)} {tr(lib.colonne).toLowerCase()}
                </span>
                {c ? (
                  <b title={c.libelle}>{prix(c.prix, f.devise)}</b>
                ) : (
                  <b className="fs-absent">{tr("non relevé")}</b>
                )}
              </div>
            );
          }),
        )}
      </div>
      <p className="fs-muet">{mentionForfait(f)}</p>
    </>
  );
}
