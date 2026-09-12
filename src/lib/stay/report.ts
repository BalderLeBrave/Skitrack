/**
 * Le récapitulatif du séjour : ce qui se calcule, sans mise en page.
 *
 * ## Le modèle de provenance
 *
 * C'est tout ce que ce module apporte. Chaque montant porte son origine, et il
 * y en a **quatre**, pas trois :
 *
 * - `relevé` : une source l'a publié, l'application l'a lu ;
 * - `saisi` : l'utilisateur l'a écrit lui-même ;
 * - `estimé` : l'application l'a calculé depuis un barème, et le dit ;
 * - `néant` : le poste vaut zéro **par décision**.
 *
 * Le quatrième est celui que le commentaire d'origine documente comme ayant
 * manqué. Un poste à zéro parce que le matériel est décoché, parce qu'il n'y a
 * aucun péage sur la route, n'est pas une estimation. Le marquer « estimé »
 * puis l'inscrire dans « ce qui manque » revenait à reprocher à l'application
 * de ne pas avoir relevé un chiffre que personne ne lui a demandé.
 *
 * Un cinquième cas existe, mais ce n'est pas une origine de montant : `inconnu`
 * dit qu'il **n'y a pas de montant**. Un poste inconnu ne figure pas dans le
 * tableau, il part dans les manques. Une ligne à « — » dans un budget se lit
 * comme un zéro à la troisième relecture, et fausse toutes les additions faites
 * de tête.
 *
 * ## Ce que ce module ne fait pas
 *
 * Il ne relève rien et n'appelle rien : il met en ordre ce qui est déjà là.
 *
 * Extrait de `2d960d5:src/renderer/src/components/StayReport.tsx`, où la
 * logique vivait au milieu du rendu et ne pouvait donc pas être testée.
 */

import { nightsBetween } from "./calendar.ts";
import type { ForfaitStatus } from "../forfaits/types.ts";

/**
 * Euros à la française.
 *
 * Recopié plutôt qu'importé de `listings.ts` : ce module doit rester pur, et
 * `listings.ts` entraîne avec lui le relevé figé, l'accès et le référentiel des
 * stations. Un récapitulatif n'a pas besoin de charger 231 stations pour écrire
 * « 4 031 € ».
 */
function euros(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

export type Origine = "relevé" | "saisi" | "estimé" | "néant" | "inconnu";

export type PosteInput = {
  label: string;
  /** `null` = aucun montant connu. Le poste part dans les manques. */
  montant: number | null;
  origine: Origine;
  detail?: string | null;
};

export type ReportPoste = {
  label: string;
  montant: number;
  origine: Exclude<Origine, "inconnu">;
  detail: string | null;
};

export type ReportInput = {
  stationName: string;
  checkIn: string;
  checkOut: string;
  /** Taille du groupe, pour le prix par personne. */
  voyageurs: number;
  postes: PosteInput[];
  /** Ce qui manque ailleurs qu'au budget : position, lien, neige, bulletin. */
  manquesAutres?: string[];
};

export type Report = {
  /** `null` quand les dates sont illisibles. Le manque le dit. */
  nuits: number | null;
  /** Les postes chiffrés, dans l'ordre reçu. Les inconnus n'y sont pas. */
  postes: ReportPoste[];
  total: number;
  /** Part du total qui vient d'une estimation, pas d'un relevé ni d'une saisie. */
  totalEstime: number;
  manques: string[];
  parPersonne: number | null;
};

/**
 * Un poste décidé par l'utilisateur.
 *
 * Zéro y vaut `néant` : c'est une décision, pas une estimation ratée. Au-dessus
 * de zéro, l'origine passée fait foi.
 */
export function posteDecide(
  label: string,
  montant: number | null,
  origine: Origine = "estimé",
  detail?: string | null,
): PosteInput {
  if (montant === 0) return { label, montant: 0, origine: "néant", detail: detail ?? null };
  return { label, montant, origine, detail: detail ?? null };
}

/**
 * Origine d'un montant de forfait, depuis son statut de relevé.
 *
 * `ok` et `stale` sont deux relevés : le second est vieux, mais il a bien été
 * lu chez l'exploitant. `erreur` n'a pas de montant à montrer, pas plus qu'un
 * statut absent : les deux sont `inconnu` et partent dans les manques.
 */
export function origineForfait(status: ForfaitStatus | null | undefined): Origine {
  switch (status) {
    case "ok":
    case "stale":
      return "relevé";
    case "manuel":
      return "saisi";
    case "estimé":
      return "estimé";
    default:
      return "inconnu";
  }
}

/** Ce que l'écran écrit à côté d'un montant. */
export const ORIGINE_LABEL: Record<Exclude<Origine, "inconnu">, string> = {
  relevé: "relevé",
  saisi: "saisi",
  estimé: "estimé",
  néant: "aucun",
};

/**
 * Assemble le récapitulatif.
 *
 * Le total additionne **tous** les postes chiffrés, estimations comprises :
 * retrancher les estimations donnerait un chiffre plus bas que la réalité, ce
 * qui est la pire des deux erreurs possibles sur un budget. `totalEstime` dit
 * quelle part de ce total n'est pas prouvée, et `fiabiliteLabel` la formule.
 */
export function buildReport(input: ReportInput): Report {
  const nuits = nightsBetween(input.checkIn, input.checkOut);
  const postes: ReportPoste[] = [];
  const manques: string[] = [];

  if (nuits == null) {
    manques.push("Les dates du séjour sont illisibles : la durée n’a pas pu être calculée.");
  } else if (nuits <= 0) {
    manques.push("Le départ ne suit pas l’arrivée : la durée du séjour n’a pas de sens.");
  }

  for (const p of input.postes) {
    if (p.origine === "inconnu" || p.montant == null) {
      manques.push(`${p.label} : aucun montant relevé.`);
      continue;
    }
    postes.push({
      label: p.label,
      montant: p.montant,
      origine: p.origine,
      detail: p.detail ?? null,
    });
  }

  for (const m of input.manquesAutres ?? []) manques.push(m);

  const total = postes.reduce((n, p) => n + p.montant, 0);
  const totalEstime = postes
    .filter((p) => p.origine === "estimé")
    .reduce((n, p) => n + p.montant, 0);
  const parPersonne = input.voyageurs > 0 ? total / input.voyageurs : null;

  return { nuits, postes, total, totalEstime, manques, parPersonne };
}

/**
 * Ce que vaut ce total.
 *
 * On annonce la **part estimée**, pas un chiffre net. Écrire « 4 812 € » sans
 * rien d'autre prête au total une précision qu'il n'a pas ; écrire « dont
 * 1 150 € estimés, soit 24 % » laisse le lecteur décider de la confiance qu'il
 * lui accorde.
 */
export function fiabiliteLabel(report: Report): string {
  if (report.postes.length === 0) return "Aucun montant : ce récapitulatif ne chiffre rien.";
  if (report.totalEstime === 0) {
    return "Aucune estimation : chaque montant de ce total a été relevé ou saisi.";
  }
  const part = report.total > 0 ? Math.round((report.totalEstime / report.total) * 100) : 0;
  return `Dont ${euros(report.totalEstime)} estimés, soit ${part} % du total.`;
}
