/**
 * Le forfait d'un séjour, tel que les écrans l'écrivent.
 *
 * `resolvePassPrice` (`resolution.ts`) répond pour une catégorie à la fois.
 * Un écran a besoin de plus : l'adulte et l'enfant **sur le même forfait**
 * (un total ne mêle pas le prix des 3 Vallées et celui de Méribel seul), la
 * journée et la saison de la fiche, les mots qui accompagnent le prix
 * (période, bornes de validité, périmètre, source, fiabilité), et le budget
 * des forfaits du groupe.
 *
 * ## Le budget
 *
 * `PrixResolu.prix` est le prix d'un forfait, pour une personne, sur toute la
 * durée retenue : la durée est déjà dedans. Le budget vaut donc
 * prix adulte × adultes + prix enfant × enfants, par `coutForfaits`, qui tient
 * la règle de l'enfant sans tarif enfant publié (compté au prix adulte, et
 * dit). La période indiquée est celle du forfait adulte.
 *
 * Fonctions pures : les grilles et la date du jour viennent de l'appelant.
 *
 * Chargé tel quel par `node --experimental-strip-types` : aucun alias `@/`.
 */

import { montantCents } from "../devises.ts";
import { periodeLbl } from "../provenance.ts";
import { aTraduire, tr, trN } from "../i18n/tr.ts";
import { langueIntl } from "../i18n/langue.ts";
import { coutForfaits, type CoutForfaits } from "./cout.ts";
import {
  joursDeSki,
  resolvePassPrice,
  type DatesSejour,
  type EchecResolution,
  type PrixResolu,
  type Resolution,
} from "./resolution.ts";
import type { GrilleTarifaire } from "./tarifsPeriode.ts";

/* ---------- Résolution ---------- */

export type ForfaitsSejour = {
  /** Le forfait adulte du séjour. */
  adulte: Resolution;
  /** Le forfait enfant, sur le forfait (périmètre) de l'adulte. */
  enfant: Resolution;
};

/** Les grilles du forfait de l'adulte, toutes saisons : l'enfant et la
 *  journée ne se cherchent que là. La préférence de périmètre du résolveur
 *  (`perimetreCle`) ne suffit pas : faute de tarif enfant sur ce forfait,
 *  elle passerait au suivant (Châtel seul pour un adulte aux Portes du
 *  Soleil), et le total mêlerait deux forfaits. */
function duForfait(grilles: readonly GrilleTarifaire[], adulte: PrixResolu): GrilleTarifaire[] {
  return grilles.filter((g) => g.perimetre.cle === adulte.perimetre.cle);
}

/**
 * L'adulte, puis l'enfant sur le même forfait que lui. Sans dates : le
 * 6 jours de la période du jour (`resolvePassPrice`).
 */
export function forfaitsDuSejour(
  stationId: string,
  dates: DatesSejour | null,
  grilles: readonly GrilleTarifaire[],
  aujourdhui: string,
): ForfaitsSejour {
  const adulte = resolvePassPrice({ id: stationId }, dates, { grilles, aujourdhui });
  const enfant = resolvePassPrice({ id: stationId }, dates, {
    grilles: adulte.statut === "resolu" ? duForfait(grilles, adulte) : grilles,
    aujourdhui,
    categorie: "enfant",
  });
  return { adulte, enfant };
}

/**
 * La journée adulte du premier jour de ski, sur le forfait de l'adulte : la
 * case « Journée adulte » de la fiche. `null` sans forfait adulte.
 *
 * Une grille qui ne publie pas la journée n'en donne pas : le résolveur
 * prendrait la durée supérieure (le 6 jours), qui n'est pas une journée.
 * L'estimation du catalogue, s'il y en a une, voyage avec l'échec.
 */
export function journeeDuSejour(
  stationId: string,
  dates: DatesSejour | null,
  grilles: readonly GrilleTarifaire[],
  aujourdhui: string,
  adulte: Resolution,
): Resolution | null {
  if (adulte.statut !== "resolu" || !dates) return null;
  const r = resolvePassPrice({ id: stationId }, dates, {
    grilles: duForfait(grilles, adulte),
    aujourdhui,
    joursSki: 1,
  });
  if (r.statut !== "resolu" || r.duree.retenue === 1) return r;
  const estimation = journeeEstimee(grilles, adulte);
  return {
    statut: "duree-absente",
    detail: tr("aucune journée publiée sur le forfait {nom}", { nom: adulte.perimetre.nom }),
    dureesDisponibles: [r.duree.retenue],
    ...(estimation ? { estimation } : {}),
  };
}

/** La journée adulte que le catalogue estime, sur la grille de l'adulte. */
function journeeEstimee(grilles: readonly GrilleTarifaire[], adulte: PrixResolu) {
  const g = grilles.find((x) => x.id === adulte.grille.id);
  for (const p of g?.periodes ?? [])
    for (const t of p.tarifs)
      if (t.estime && t.categorie === "adulte" && t.duree.type === "jours" && t.duree.jours === 1)
        return {
          prix: t.prix,
          devise: t.devise,
          libelle: `${t.libelleDuree} ${t.libelleCategorie}`,
        };
  return undefined;
}

/**
 * Le forfait saison adulte publié par la grille du forfait adulte, estimation
 * exclue. `null` si elle n'en publie pas.
 */
export function saisonDeLaGrille(
  grilles: readonly GrilleTarifaire[],
  adulte: Resolution,
): { prix: number; devise: string } | null {
  if (adulte.statut !== "resolu") return null;
  const g = grilles.find((x) => x.id === adulte.grille.id);
  for (const p of g?.periodes ?? [])
    for (const t of p.tarifs)
      if (t.duree.type === "saison" && t.categorie === "adulte" && !t.estime && !t.restriction)
        return { prix: t.prix, devise: t.devise };
  return null;
}

/** Les jours de ski du séjour : les nuits moins une. `null` si les dates ne
 *  se lisent pas. */
export function joursDuSejour(dates: DatesSejour): number | null {
  return joursDeSki(dates)?.length ?? null;
}

/* ---------- Ce qui s'écrit ---------- */

/** « 6 jours », « 6 journées » (additionnées), « 6 jours, pour 5 jours de
 *  ski » (durée supérieure retenue). */
export function dureeLbl(r: PrixResolu): string {
  if (r.calcul === "journees") return trN(r.duree.demandee, "{n} journée", "{n} journées");
  const d = trN(r.duree.retenue, "{n} jour", "{n} jours");
  return r.drapeaux.dureeSuperieure
    ? trN(r.duree.demandee, "{duree}, pour {n} jour de ski", "{duree}, pour {n} jours de ski", { duree: d })
    : d;
}

/**
 * La période du prix et ses bornes de validité. Une grille sans période
 * publiée le dit, avec sa saison ; une grille d'une saison antérieure donne
 * ses propres bornes, saison nommée.
 */
export function periodeDuPrix(r: PrixResolu): { libelle: string; bornes: string } {
  const touchees = r.periodes.length ? r.periodes : [r.periode];
  const saison = r.grille.saison;
  if (touchees.every((p) => p.saisonEntiere))
    return { libelle: tr("Saison {saison}", { saison }), bornes: tr("sans période publiée") };
  const datees = touchees.filter((p) => !p.saisonEntiere);
  const libelle = [...new Set(datees.map((p) => p.libelle))].join(tr(" puis "));
  const bornes = periodeLbl(datees[0].debut, datees[datees.length - 1].fin) ?? "";
  return {
    libelle,
    bornes: r.drapeaux.saisonAnterieure ? tr("{bornes}, saison {saison}", { bornes, saison }) : bornes,
  };
}

/** « Forfait du domaine Les 3 Vallées », « Forfait de la station La Schlucht ». */
export function perimetreLbl(r: PrixResolu): string {
  return r.perimetre.type === "domaine"
    ? tr("Forfait du domaine {nom}", { nom: r.perimetre.nom })
    : tr("Forfait de la station {nom}", { nom: r.perimetre.nom });
}

/** Tout ce qui accompagne un prix résolu. */
export type LibellesForfait = {
  /** « 359 € », « 118,20 € » : les centimes quand il y en a. */
  prix: string;
  duree: string;
  periode: string;
  bornes: string;
  perimetre: string;
  /** D'où vient le prix, en clair : « Catalogue des forfaits, relevé du 11 août 2026 ». */
  source: string;
  /** Fiabilité faible : l'écran pose l'indicateur discret. */
  faible: boolean;
  /** Pourquoi, en phrases : pour l'infobulle de l'indicateur. */
  raisons: string;
};

/** Ce que dit une grille de confiance faible, avant les notes du résolveur. */
const NON_VERIFIE = aTraduire("Prix non vérifié sur la page officielle de la saison.");

const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 11 août 2026 », écrit dans une grille, dans la langue de l'interface. */
function dateDansLaLangue(fr: string): string {
  const m = /^(\d{1,2}) (\S+) (\d{4})$/.exec(fr.trim());
  const mois = m ? MOIS_FR.indexOf(m[2]) : -1;
  if (!m || mois < 0) return fr;
  return new Intl.DateTimeFormat(langueIntl(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(m[3]), mois, Number(m[1]))),
  );
}

/**
 * La source d'une grille telle que l'écran la montre. Le libellé est écrit en
 * français dans la grille (`migration.ts`) et y reste : il se traduit ici, à
 * l'affichage, date comprise. Un libellé d'une autre forme passe tel quel.
 */
export function sourceAffichee(libelle: string): string {
  const cat = /^Catalogue des forfaits(?:, relevé du (.+))?$/.exec(libelle);
  if (cat) {
    return cat[1]
      ? tr("Catalogue des forfaits, relevé du {date}", { date: dateDansLaLangue(cat[1]) })
      : tr("Catalogue des forfaits");
  }
  const page = /^Page officielle, relevé du (.+)$/.exec(libelle);
  if (page) return tr("Page officielle, relevé du {date}", { date: dateDansLaLangue(page[1]) });
  return libelle;
}

export function libellesForfait(r: PrixResolu): LibellesForfait {
  const { libelle, bornes } = periodeDuPrix(r);
  const raisons = r.grille.confiance === "faible" ? [tr(NON_VERIFIE), ...r.notes] : r.notes;
  return {
    prix: montantCents(r.prix, r.devise) ?? "",
    duree: dureeLbl(r),
    periode: libelle,
    bornes,
    perimetre: perimetreLbl(r),
    source: sourceAffichee(r.grille.source.libelle),
    faible: r.fiabilite === "faible",
    raisons: raisons.join(" "),
  };
}

/** Une ligne pour une infobulle ou un texte copié : « Saison 2026-27, sans
 *  période publiée · Forfait du domaine Les 3 Vallées ». */
export function mentionForfait(r: PrixResolu): string {
  const l = libellesForfait(r);
  return `${l.periode}, ${l.bornes} · ${l.perimetre}`;
}

/**
 * Ce qu'on écrit à la place d'un prix qui manque. L'enfant sans tarif publié
 * est « non communiqué », décision du 30 septembre 2026 ; une grille trop
 * ancienne, « non publié ».
 */
export function echecLbl(e: EchecResolution): string {
  switch (e.statut) {
    case "grille-ancienne":
      return tr("non publié");
    case "categorie-absente":
      return tr("non communiqué");
    case "duree-absente":
      return tr("durée non publiée");
    case "dates-invalides":
      return tr("dates à revoir");
    default:
      return tr("non relevé");
  }
}

/* ---------- Budget ---------- */

export type BudgetForfaits = CoutForfaits & {
  /** « Forfaits 6 jours », « Forfaits 6 journées ». « Forfaits » sans prix. */
  libelle: string;
  /** « 6 jours », « 6 journées » ; `null` sans prix. */
  duree: string | null;
  /** La période indiquée, celle du forfait adulte : « Saison 2026-27, sans
   *  période publiée ». `null` sans prix. */
  periode: string | null;
  /** Son libellé seul, pour un pied de page : « Saison 2026-27 ». */
  periodeCourte: string | null;
  /** L'adulte n'a pas de prix : ce qui manque, en clair. */
  manque: string | null;
};

/**
 * Le budget des forfaits du groupe, pour la durée du séjour.
 */
export function budgetForfaits(
  f: ForfaitsSejour,
  adultes: number,
  enfants: number,
): BudgetForfaits {
  const a = f.adulte;
  if (a.statut !== "resolu") {
    return {
      ...coutForfaits(null, null, adultes, enfants),
      libelle: tr("Forfaits"),
      duree: null,
      periode: null,
      periodeCourte: null,
      manque: echecLbl(a),
    };
  }
  const e = f.enfant.statut === "resolu" && f.enfant.devise === a.devise ? f.enfant.prix : null;
  const { libelle, bornes } = periodeDuPrix(a);
  // La durée du forfait compté, sans la précision « pour 5 jours de ski ».
  const duree = dureeLbl(a).split(",")[0];
  return {
    ...coutForfaits(a.prix, e, adultes, enfants, a.devise),
    libelle: tr("Forfaits {duree}", { duree }),
    duree,
    periode: `${libelle}, ${bornes}`,
    periodeCourte: libelle,
    manque: null,
  };
}
