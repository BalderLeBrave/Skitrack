/**
 * Le contrôle d'une grille relevée, avant qu'elle soit écrite.
 *
 * Une lecture de page peut se tromper de colonne, prendre une assurance pour
 * un forfait ou un tarif de groupe pour un tarif public. Rien de ce qui
 * échoue à ces contrôles n'est écrit en silence : chaque rejet est rendu, en
 * clair, pour le rapport de fin de relevé.
 *
 * - **Bornes de plausibilité**, sur les tarifs ordinaires (sans restriction)
 *   de l'adulte : journée entre 5 et 120 €, 6 jours entre 30 et 600 €.
 *   Relevé du 30 septembre 2026 : la journée adulte va de 6 € (Les Signaraux,
 *   un téléski de village) et 10 € (Col du Feu) à 84,20 € (3 Vallées), le
 *   6 jours de 65 € (Col de l'Arzelier) à 468 € (Tignes-Val d'Isère). Les
 *   planchers de 15 et 80 € d'abord retenus écartaient ces petites stations ;
 *   à 5 €, une assurance ou une montée seule (2 à 3,50 €) reste écartée.
 *   Hors bornes : tarif rejeté.
 * - **La durée se paie** : dans une période et une catégorie, un forfait plus
 *   long ne coûte pas moins cher qu'un plus court. Le 6 jours strictement
 *   plus cher que la journée ; sinon la grille entière est rejetée, parce que
 *   c'est le signe d'une colonne mal lue. Une autre durée moins chère que la
 *   précédente est rejetée seule.
 * - **Le plancher de la journée** : un forfait adulte ordinaire de plusieurs
 *   jours (ou de semaine) coûte au moins `PLANCHER.plusieursJours` fois la
 *   journée adulte la moins chère, une saison au moins `PLANCHER.saison` fois,
 *   quel que soit son libellé de catégorie. La journée de référence est celle
 *   de la période, à défaut celle de la grille. La règle précédente ne
 *   compare qu'à libellé égal : Flaine, relevé du 4 octobre 2026, gardait
 *   « 2 à 7 jours consécutifs » à 29 € et « Saison » à 59 € en « Tarif
 *   unique », à côté d'une journée « Normal » à 60,70 € — une option lue comme
 *   un forfait, affichée comme son 6 jours. Les seuils viennent des grilles du
 *   4 octobre 2026 : les vrais forfaits de deux jours et plus valent au moins
 *   1,67 journée (Col de l'Arzelier, 25 € pour 15 €), les vraies saisons au
 *   moins 5 journées (Col du Feu, 50 € pour 10 €) ; les options lues comme
 *   des forfaits, au plus 1,4 journée (Thollon) et 1,16 pour une saison
 *   (Aravis, 43 € pour 37 €). Un produit sans journée à lui dont un tarif
 *   tombe sous le plancher est une table d'options : il est rejeté en entier
 *   dans la période, et non ligne par ligne.
 * - **La haute saison ne coûte pas moins que la basse** : sinon, grille
 *   rejetée.
 * - **Écart de plus de 30 %** avec la grille précédente du même forfait :
 *   écrite, mais signalée pour vérification, et sa confiance baisse.
 *
 * Fonction pure.
 */

import { plier } from "./periodesFr.ts";
import type { GrilleTarifaire, Periode, Tarif } from "./tarifsPeriode.ts";

export const BORNES = {
  jourAdulte: { min: 5, max: 120 },
  sixJoursAdulte: { min: 30, max: 600 },
} as const;

/** Le prix minimal d'un forfait adulte long, en journées adultes (voir l'en-tête). */
export const PLANCHER = { plusieursJours: 1.5, saison: 4 } as const;

/** L'écart qui fait signaler une grille. */
export const ECART_SIGNALE = 0.3;

export type Controle = {
  /** La grille retenue, `null` si elle est rejetée entière. */
  grille: GrilleTarifaire | null;
  /** Ce qui a été rejeté, et pourquoi. */
  rejets: string[];
  /** Ce qui est écrit mais à vérifier. */
  alertes: string[];
};

const ordinaire = (t: Tarif) => t.restriction == null && !t.estime;
const jours = (t: Tarif) => (t.duree.type === "jours" ? t.duree.jours : null);
const cleProduit = (t: Tarif) => `${t.categorie}|${t.libelleCategorie}|${t.canal}`;
const montant = (n: number) => `${String(n).replace(".", ",")} €`;

/** La journée adulte ordinaire la moins chère de ces tarifs, dans les bornes ; `null` sans journée. */
function journeeMin(tarifs: readonly Tarif[]): number | null {
  const prix = tarifs
    .filter(
      (t) =>
        ordinaire(t) &&
        t.categorie === "adulte" &&
        jours(t) === 1 &&
        t.prix >= BORNES.jourAdulte.min &&
        t.prix <= BORNES.jourAdulte.max,
    )
    .map((t) => t.prix);
  return prix.length ? Math.min(...prix) : null;
}

/** Combien de journées un tarif long doit valoir au moins ; `null` s'il n'est pas long. */
function facteurPlancher(t: Tarif): number | null {
  if (t.duree.type === "saison") return PLANCHER.saison;
  if (t.duree.type === "semaine" || (jours(t) ?? 0) >= 2) return PLANCHER.plusieursJours;
  return null;
}

/** Le tarif de référence d'une grille : le 6 jours adulte, à défaut la
 *  journée, ordinaires, le plus élevé des périodes. */
export function tarifReference(g: GrilleTarifaire): { jours: number; prix: number } | null {
  for (const j of [6, 1]) {
    const prix = g.periodes
      .flatMap((p) => p.tarifs)
      .filter((t) => ordinaire(t) && t.categorie === "adulte" && jours(t) === j)
      .map((t) => t.prix);
    if (prix.length) return { jours: j, prix: Math.max(...prix) };
  }
  return null;
}

export function controlerGrille(g: GrilleTarifaire, precedente?: GrilleTarifaire | null): Controle {
  const rejets: string[] = [];
  const alertes: string[] = [];
  const nom = `${g.perimetre.nom} ${g.saison}`;

  // 1. Le 6 jours plus cher que la journée, sur les tarifs tels que lus :
  // l'inverse dit une colonne mal lue, avant même de juger chaque montant.
  for (const p of g.periodes) {
    const parProduit = new Map<string, Tarif[]>();
    for (const t of p.tarifs)
      if (ordinaire(t))
        parProduit.set(cleProduit(t), [...(parProduit.get(cleProduit(t)) ?? []), t]);
    for (const liste of parProduit.values()) {
      const un = liste.find((t) => jours(t) === 1);
      const six = liste.find((t) => jours(t) === 6);
      if (un && six && six.prix <= un.prix) {
        rejets.push(
          `${nom}, « ${p.libelle} » : 6 jours (${montant(six.prix)}) pas plus cher que la journée (${montant(un.prix)}) en ${un.libelleCategorie} ; grille rejetée`,
        );
        return { grille: null, rejets, alertes };
      }
    }
  }

  // 2. Bornes, 3. la durée se paie, et 3 bis. le plancher de la journée.
  const journeeGrille = journeeMin(g.periodes.flatMap((p) => p.tarifs));
  const periodes: Periode[] = [];
  for (const p of g.periodes) {
    let tarifs = p.tarifs.filter((t) => {
      if (!(t.prix > 0 && t.prix < 5000)) {
        rejets.push(
          `${nom}, « ${p.libelle} » : ${t.libelleDuree} ${t.libelleCategorie} à ${montant(t.prix)}, montant impossible`,
        );
        return false;
      }
      if (!ordinaire(t) || t.categorie !== "adulte") return true;
      const b = jours(t) === 1 ? BORNES.jourAdulte : jours(t) === 6 ? BORNES.sixJoursAdulte : null;
      if (b && (t.prix < b.min || t.prix > b.max)) {
        rejets.push(
          `${nom}, « ${p.libelle} » : ${t.libelleDuree} adulte à ${montant(t.prix)}, hors des bornes ${b.min} à ${b.max} €`,
        );
        return false;
      }
      return true;
    });
    const parProduit = new Map<string, Tarif[]>();
    for (const t of tarifs) {
      if (!ordinaire(t) || jours(t) == null) continue;
      const k = cleProduit(t);
      parProduit.set(k, [...(parProduit.get(k) ?? []), t]);
    }
    for (const liste of parProduit.values()) {
      const tries = [...liste].sort((a, b) => jours(a)! - jours(b)!);
      let plafond = 0;
      for (const t of tries) {
        if (t.prix < plafond) {
          rejets.push(
            `${nom}, « ${p.libelle} » : ${t.libelleDuree} ${t.libelleCategorie} à ${montant(t.prix)}, moins cher qu'une durée plus courte`,
          );
          tarifs = tarifs.filter((x) => x !== t);
        } else plafond = t.prix;
      }
    }
    // 3 bis. Le plancher de la journée, tous libellés de catégorie confondus.
    const journeeP = journeeMin(tarifs);
    const journee = journeeP ?? journeeGrille;
    if (journee != null) {
      const sousPlancher = (t: Tarif) => {
        const facteur = facteurPlancher(t);
        return facteur != null && ordinaire(t) && t.categorie === "adulte" && t.prix < facteur * journee;
      };
      const fautifs = tarifs.filter(sousPlancher);
      // Un produit sans journée à lui, dont un tarif tombe sous le plancher :
      // une table d'options, rejetée en entier dans la période.
      const tables = new Set(
        fautifs
          .map(cleProduit)
          .filter((k) => !tarifs.some((t) => cleProduit(t) === k && jours(t) === 1)),
      );
      const reference = `${journeeP != null ? "la journée adulte" : "la journée adulte de la grille"} (${montant(journee)})`;
      tarifs = tarifs.filter((t) => {
        if (sousPlancher(t)) {
          rejets.push(
            `${nom}, « ${p.libelle} » : ${t.libelleDuree} ${t.libelleCategorie} à ${montant(t.prix)}, sous ${String(facteurPlancher(t)).replace(".", ",")} fois ${reference}`,
          );
          return false;
        }
        if (facteurPlancher(t) != null && ordinaire(t) && t.categorie === "adulte" && tables.has(cleProduit(t))) {
          rejets.push(
            `${nom}, « ${p.libelle} » : ${t.libelleDuree} ${t.libelleCategorie} à ${montant(t.prix)}, de la même table d'options`,
          );
          return false;
        }
        return true;
      });
    }
    if (tarifs.length) periodes.push({ ...p, tarifs });
    else if (p.tarifs.length) rejets.push(`${nom}, « ${p.libelle} » : période sans tarif retenu`);
  }

  // 4. Haute saison au moins égale à la basse.
  const hautes = periodes.filter((p) => /haute/.test(plier(p.libelle)));
  const basses = periodes.filter((p) => /basse/.test(plier(p.libelle)));
  for (const h of hautes) {
    for (const b of basses) {
      for (const th of h.tarifs.filter(ordinaire)) {
        const tb = b.tarifs.find(
          (x) =>
            ordinaire(x) &&
            cleProduit(x) === cleProduit(th) &&
            JSON.stringify(x.duree) === JSON.stringify(th.duree),
        );
        if (tb && th.prix < tb.prix) {
          rejets.push(
            `${nom} : ${th.libelleDuree} ${th.libelleCategorie} moins cher en « ${h.libelle} » (${montant(th.prix)}) qu'en « ${b.libelle} » (${montant(tb.prix)}) ; grille rejetée`,
          );
          return { grille: null, rejets, alertes };
        }
      }
    }
  }

  if (!periodes.length) {
    rejets.push(`${nom} : aucun tarif retenu ; grille rejetée`);
    return { grille: null, rejets, alertes };
  }

  // 5. Écart avec la grille précédente.
  let grille: GrilleTarifaire = { ...g, periodes };
  const avant = precedente ? tarifReference(precedente) : null;
  const apres = tarifReference(grille);
  if (avant && apres && avant.jours === apres.jours) {
    const ecart = Math.abs(apres.prix - avant.prix) / avant.prix;
    if (ecart > ECART_SIGNALE) {
      const pct = Math.round(ecart * 100);
      const texte = `écart de ${pct} % sur le ${apres.jours === 6 ? "6 jours" : "1 jour"} adulte avec la grille précédente (${montant(avant.prix)}, ${precedente!.source.libelle}, saison ${precedente!.saison}) : à vérifier`;
      alertes.push(`${nom} : ${texte}`);
      grille = {
        ...grille,
        confiance: grille.confiance === "haute" ? "moyenne" : grille.confiance,
        notes: [...grille.notes, texte.charAt(0).toUpperCase() + texte.slice(1)],
      };
    }
  }
  return { grille, rejets, alertes };
}
