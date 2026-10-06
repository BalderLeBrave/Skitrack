/**
 * Le re-rattachement des relevés enregistrés, dans le navigateur où ils vivent
 * (IndexedDB `skitrack-prix` pour les annonces, `localStorage` pour les
 * résultats). La règle et le plan sont dans `migrationRattachement.ts` ; ici,
 * on lit, on simule, et on n'écrit que sur demande.
 *
 * Depuis la console de l'application (écran Prix ouvert) :
 *
 * ```js
 * await skitrackRattachement.simuler()                      // n'écrit rien
 * await skitrackRattachement.appliquer({ confirmer: true }) // écrit
 * copy(JSON.stringify(await skitrackRattachement.exporter())) // pour le script
 * ```
 *
 * L'export se simule aussi hors du navigateur :
 * `npm run logements:rattachement -- --fichier export.json`.
 *
 * `appliquer` refuse :
 * - sans `confirmer: true` ;
 * - sans simulation préalable, ou si les relevés ont changé depuis (le plan
 *   appliqué est exactement celui qu'on a lu) ;
 * - pendant un relevé de l'écran Prix, dans cet onglet ou un autre : il
 *   prend le verrou des relevés (`seulFaceAuxReleves`) ;
 * - si aucune annonce n'a pu être lue alors que des relevés en comptent.
 *   Un relevé dont la liste manque n'est ni recompté ni destinataire
 *   (`planifierRattachement`).
 *
 * Une écriture refusée par la base l'arrête : les relevés déjà réécrits le
 * restent, avec leurs résultats, et les autres sont intacts.
 *
 * Avant d'écrire, il garde l'export de l'état d'avant dans
 * `skitrackRattachement.sauvegarde` (et le rend) : `copy(JSON.stringify(...))`
 * le met de côté. Il ne touche qu'aux relevés que le plan nomme, et ne
 * remplace que leurs résultats.
 */

import { ecrireAnnoncesBrutes, lireAnnoncesBrutes, oublierAnnonces } from "./annonces.ts";
import {
  empreintePlan,
  exportIlisible,
  planifierExport,
  rapportRattachement,
  type ExportReleves,
  type PlanRattachement,
} from "./migrationRattachement.ts";
import { seulFaceAuxReleves, usePrix } from "./releve.ts";

/** Les relevés enregistrés, tels qu'ils sont stockés (`ExportReleves`). */
export async function exporterReleves(): Promise<ExportReleves> {
  const { res } = usePrix.getState();
  const annonces: ExportReleves["annonces"] = {};
  for (const cle of Object.keys(res)) {
    const a = await lireAnnoncesBrutes(cle);
    if (a) annonces[cle] = a;
  }
  return { res: { ...res }, annonces };
}

let simule: string | null = null;
let sauvegarde: ExportReleves | null = null;

async function planDuMoment(): Promise<{ plan: PlanRattachement; avant: ExportReleves }> {
  const avant = await exporterReleves();
  if (exportIlisible(avant)) {
    throw new Error(
      "Re-rattachement impossible : aucune annonce enregistrée n'a pu être lue, alors que des relevés en comptent. Rechargez l'écran Prix et réessayez.",
    );
  }
  return { plan: planifierExport(avant).plan, avant };
}

/** Le rapport de ce que ferait le re-rattachement. N'écrit rien. */
export async function simulerRattachement(): Promise<string> {
  const { plan } = await planDuMoment();
  simule = empreintePlan(plan);
  const rapport = rapportRattachement(plan, Number.POSITIVE_INFINITY);
  console.info(`[rattachement] simulation — rien n'est écrit\n${rapport}`);
  return rapport;
}

/** Applique le re-rattachement simulé. Voir l'en-tête pour ses refus. */
export async function appliquerRattachement(opts?: {
  confirmer?: boolean;
}): Promise<{ rapport: string; sauvegarde: ExportReleves }> {
  if (opts?.confirmer !== true) {
    throw new Error(
      "Re-rattachement non appliqué : appelez appliquer({ confirmer: true }) après la simulation.",
    );
  }
  // Tout se passe sous le verrou des relevés : aucun onglet ne relève entre la
  // lecture et la dernière écriture (`seulFaceAuxReleves`).
  return seulFaceAuxReleves(async () => {
    const { plan, avant } = await planDuMoment();
    if (simule == null || empreintePlan(plan) !== simule) {
      simule = null;
      throw new Error(
        "Re-rattachement non appliqué : les relevés ont changé depuis la simulation. Simulez à nouveau.",
      );
    }
    sauvegarde = avant;
    installerRattachement();
    // Clé par clé : les annonces, puis le résultat. Une écriture refusée
    // arrête tout ; les clés déjà faites restent faites, cohérentes, et la
    // sauvegarde dit l'état d'avant.
    const faites: string[] = [];
    for (const cle of plan.touchees) {
      const annonces = plan.apres.get(cle);
      if (annonces) {
        if (!(await ecrireAnnoncesBrutes(cle, annonces))) {
          poserResultats(plan, faites);
          simule = null;
          throw new Error(
            `Re-rattachement interrompu : la base a refusé d'écrire ${cle}. ${faites.length} relevé(s) faits sur ${plan.touchees.size} ; l'état d'avant est dans skitrackRattachement.sauvegarde.`,
          );
        }
      } else {
        await oublierAnnonces(cle);
      }
      faites.push(cle);
    }
    poserResultats(plan, faites);
    simule = null;
    const rapport = rapportRattachement(plan, Number.POSITIVE_INFINITY);
    console.info(
      `[rattachement] appliqué — l'état d'avant est dans skitrackRattachement.sauvegarde\n${rapport}`,
    );
    return { rapport, sauvegarde: avant };
  });
}

/** Les résultats des seules clés écrites : un relevé terminé ailleurs garde le sien. */
function poserResultats(plan: PlanRattachement, cles: readonly string[]): void {
  usePrix.setState((s) => {
    const res = { ...s.res };
    for (const cle of cles) {
      const r = plan.resultats[cle];
      if (r) res[cle] = r;
      else delete res[cle];
    }
    return { res };
  });
}

/** Pose `skitrackRattachement` sur `window`, pour la console. */
export function installerRattachement(): void {
  if (typeof window === "undefined") return;
  (window as unknown as { skitrackRattachement?: unknown }).skitrackRattachement = {
    simuler: simulerRattachement,
    appliquer: appliquerRattachement,
    exporter: exporterReleves,
    sauvegarde,
  };
}
