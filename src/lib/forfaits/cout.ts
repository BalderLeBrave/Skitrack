/**
 * Ce que coûtent les forfaits d'un groupe.
 *
 * Le récapitulatif multipliait le tarif adulte par le nombre de voyageurs :
 * huit personnes à 359 €, soit 2 872 €. Or le domaine publie aussi son tarif
 * enfant — 287 € aux 3 Vallées — et le catalogue le relève sous `enf6`. Six
 * adultes et deux enfants coûtent 2 728 €, pas 2 872 : cent quarante-quatre
 * euros d'écart, sur une donnée que l'application avait déjà sous la main.
 *
 * Deux règles tenues ici :
 *
 * - **rien n'est inventé.** Sans tarif enfant relevé, les enfants sont comptés
 *   au tarif adulte, et le total le dit en toutes lettres plutôt que de
 *   laisser croire à une remise ;
 * - **le détail est lisible**. « 6 × 359 € adulte + 2 × 287 € enfant » se
 *   vérifie ; « 8 × 6 j adulte » pour un groupe qui compte deux enfants, non.
 *
 * Le 26 septembre 2026, le 6 jours enfant de 142 domaines a quitté les prix
 * relevés : le catalogue le calculait (0,8 × le 6 jours adulte), et la famille
 * le payait comme un relevé. Ces domaines comptent désormais l'enfant au tarif
 * adulte — 58 € de plus par enfant aux Portes du Soleil (292 € au lieu de
 * 234 €). C'est un plafond, pas une remise supposée : l'estimation reste
 * affichée comme telle sur la fiche, elle n'entre pas dans le total. Le détail
 * dit donc les enfants à part, « 4 × 292 € adulte + 2 × 292 € enfant au tarif
 * adulte », plutôt que « 6 × 292 € adulte » pour un groupe qui en compte deux.
 */

import { formatTarif } from "./age.ts";

export type CoutForfaits = {
  /** Le coût du groupe, ou `null` si aucun tarif n'est relevé. */
  total: number | null;
  /** « 6 × 359 € adulte + 2 × 287 € enfant ». */
  detail: string;
  /** Les enfants sont comptés au tarif adulte, faute de tarif enfant relevé. */
  enfantsAuTarifAdulte: boolean;
  /**
   * La devise du total, qui est celle du domaine.
   *
   * Elle voyage avec le montant plutôt que d'être supposée à l'arrivée : un
   * écran qui reçoit `2 728` sans savoir en quoi finit par écrire « € »,
   * lequel est faux dès la première station suisse. Le total et sa devise sont
   * une seule valeur, et ne se séparent pas.
   */
  devise: string;
};

/**
 * Le coût des forfaits d'un groupe, dans la devise du domaine.
 *
 * Les deux tarifs viennent toujours du même forfait, donc du même domaine :
 * il n'y a pas d'addition d'euros et de francs à craindre ici. Ce qui était
 * faux est ailleurs, et plus banal — le résultat s'écrivait en euros quelle
 * que soit l'origine du tarif.
 */
export function coutForfaits(
  j6: number | null | undefined,
  enf6: number | null | undefined,
  adultes: number,
  enfants: number,
  devise = "EUR",
): CoutForfaits {
  if (j6 == null) {
    return { total: null, detail: "aucun tarif relevé", enfantsAuTarifAdulte: false, devise };
  }
  const ad = Math.max(0, Math.round(adultes));
  const enf = Math.max(0, Math.round(enfants));
  if (!enf) {
    return {
      total: j6 * ad,
      devise,
      detail: `${ad} × ${formatTarif(j6, devise)} adulte`,
      enfantsAuTarifAdulte: false,
    };
  }
  if (enf6 == null) {
    const enfants = `${enf} × ${formatTarif(j6, devise)} enfant au tarif adulte, tarif enfant non relevé`;
    return {
      total: j6 * (ad + enf),
      devise,
      detail: ad ? `${ad} × ${formatTarif(j6, devise)} adulte + ${enfants}` : enfants,
      enfantsAuTarifAdulte: true,
    };
  }
  const pieces = [`${ad} × ${formatTarif(j6, devise)} adulte`, `${enf} × ${formatTarif(enf6, devise)} enfant`];
  return {
    total: j6 * ad + enf6 * enf,
    devise,
    detail: ad ? pieces.join(" + ") : pieces[1],
    enfantsAuTarifAdulte: false,
  };
}
