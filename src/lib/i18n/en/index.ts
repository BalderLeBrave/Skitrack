/**
 * L'anglais de l'interface, une table par zone : plusieurs personnes peuvent
 * traduire en même temps sans se gêner. La clé est le texte français tel que
 * `tr` le reçoit, caractère pour caractère (apostrophe typographique ’,
 * espaces insécables comprises).
 *
 * Lexique (anglais britannique, comme les dates) :
 * - station → resort ; domaine skiable → ski area ; massif → range ;
 *   département → department ; remontées → lifts ; pistes → slopes (runs pour
 *   un décompte de pistes) ; forfait → ski pass ;
 * - logement → place to stay (liste), accommodation (titre), listing (annonce) ;
 *   annonce → listing ; séjour → stay ; voyageurs → travellers ;
 *   chambre → bedroom ; capacité → sleeps / capacity ; retenir → shortlist ;
 *   relevé → price check / survey ; favoris → Saved ; dossier → folder.
 * Mêmes règles d'écriture qu'en français : phrases courtes et concrètes, pas
 * de point d'exclamation ni de tiret cadratin, pas de ton publicitaire.
 */

import { COMMUN } from "./commun.ts";
import { EN_CONTROLE } from "./controle.ts";
import { EN_COQUILLE } from "./coquille.ts";
import { EN_FAVORIS } from "./favoris.ts";
import { EN_LOGEMENTS } from "./logements.ts";
import { EN_PARCOURS } from "./parcours.ts";
import { EN_PRIX } from "./prix.ts";

const TABLES: readonly Readonly<Record<string, string>>[] = [
  COMMUN,
  EN_COQUILLE,
  EN_PARCOURS,
  EN_LOGEMENTS,
  EN_PRIX,
  EN_FAVORIS,
  EN_CONTROLE,
];

export const EN: Readonly<Record<string, string>> = Object.assign({}, ...TABLES);

/** Pour le test : chaque table, pour repérer une même clé traduite deux fois différemment. */
export const TABLES_EN = TABLES;
