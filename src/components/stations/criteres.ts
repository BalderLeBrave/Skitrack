/**
 * Les critères de la comparaison des stations (l'ancien `CRIT` de Comparer) :
 * libellé, texte, valeur comparable (la plus grande gagne), mention d'échelle,
 * absence écrite et fiabilité du forfait. Lus par `ModaleComparaison` et par
 * la fiche de survol de la carte (`forfaitTxt`, `forfaitAbsent`).
 */

import { montantCents } from "@/lib/devises";
import { echecLbl, libellesForfait, mentionForfait } from "@/lib/forfaits/prixSejour";
import { forfaitsStation, prixAdulteSejour } from "@/lib/forfaits/prixStations";
import type { Station } from "@/lib/stations";
import { altLbl, domaineRelieNom, glacier, kmLbl, liftsLbl, maxM, sansDomaineLbl, villageLbl, villageM } from "@/lib/v7";
import { aTraduire, tr } from "@/lib/i18n";

/** Un critère : libellé, texte, valeur comparable (la plus grande gagne),
 *  mention d'échelle. Libellé et mention se traduisent au rendu. */
export type Crit = {
  label: string;
  txt: (s: Station) => string | null;
  num: ((s: Station) => number | null) | null;
  note: string | null;
  /** Mention propre à une cellule, sous sa valeur (période et forfait d'un prix). */
  sous?: (s: Station) => string | null;
  /** Ce que la cellule écrit quand l'absence est connue ; « non relevé » sinon. */
  absent?: (s: Station) => string | null;
  /** Les raisons d'une valeur peu fiable : la cellule porte l'indicateur. */
  faible?: (s: Station) => string | null;
};

/** Le forfait adulte du séjour d'une station, ce qui le remplace sinon. */
export const forfaitTxt = (s: Station) => {
  const r = prixAdulteSejour(s.id);
  return r ? montantCents(r.prix, r.devise) : null;
};
export const forfaitAbsent = (s: Station) => {
  const f = forfaitsStation(s.id)?.adulte;
  return f && f.statut !== "resolu" ? echecLbl(f) : null;
};

export const CRIT: Crit[] = [
  {
    label: aTraduire("Altitude des pistes"),
    txt: (s) => altLbl(s),
    num: (s) => maxM(s),
    absent: sansDomaineLbl,
    // L'altitude est lue sur la fiche de la station, là où les km et les
    // remontées viennent d'OpenSkiMap à l'échelle du domaine : deux fiches
    // d'un même domaine annoncent deux altitudes, et la mention le dit.
    note: aTraduire("valeur de la station"),
  },
  { label: aTraduire("Village"), txt: (s) => villageLbl(s), num: (s) => villageM(s), note: null },
  {
    label: aTraduire("Kilomètres de pistes"),
    txt: (s) => kmLbl(s),
    num: (s) => s.pistesKm,
    note: aTraduire("valeur du domaine"),
    absent: sansDomaineLbl,
  },
  {
    label: aTraduire("Remontées"),
    txt: (s) => liftsLbl(s),
    num: (s) => s.lifts,
    note: aTraduire("valeur du domaine"),
    absent: sansDomaineLbl,
  },
  {
    label: aTraduire("Forfait adulte"),
    txt: forfaitTxt,
    num: (s) => {
      const r = prixAdulteSejour(s.id);
      return r ? -r.prix : null;
    },
    note: aTraduire("pour les dates du séjour"),
    sous: (s) => {
      const r = prixAdulteSejour(s.id);
      return r ? mentionForfait(r) : null;
    },
    absent: forfaitAbsent,
    faible: (s) => {
      const r = prixAdulteSejour(s.id);
      const l = r ? libellesForfait(r) : null;
      return l?.faible ? l.raisons : null;
    },
  },
  { label: aTraduire("Glacier"), txt: (s) => (glacier(s) ? tr("Oui") : tr("Non")), num: null, note: null },
  {
    label: aTraduire("Domaine relié"),
    // La table des grands domaines est complète : une station qui n'y est pas
    // n'est reliée à aucune autre.
    txt: (s) => domaineRelieNom(s) ?? tr("Non"),
    num: null,
    note: null,
  },
  {
    label: aTraduire("Massif · département"),
    txt: (s) => [s.massif, s.dept].filter(Boolean).join(" · "),
    num: null,
    note: null,
  },
];

// Identiques au texte affiché : « sans domaine alpin » et « non relevé »
// valent tous deux null, mais ne disent pas la même chose.
export const affiche = (c: Crit, s: Station) => c.txt(s) ?? c.absent?.(s) ?? null;

/** Le nombre de critères identiques d'une comparaison. */
export function nIdentiques(cmp: readonly Station[]): number {
  return cmp.length > 1 ? CRIT.filter((c) => new Set(cmp.map((s) => affiche(c, s))).size === 1).length : 0;
}

