/**
 * Les grilles de forfaits de l'application, chargées une fois côté
 * navigateur dans `useGrillesForfaits` (`prixStations.ts`) :
 *
 * 1. les grilles officielles, quand le relevé (`npm run forfaits:releve`) a
 *    écrit `grillesOfficielles.json` ;
 * 2. les grilles migrées (`grillesMigrees.json`) ;
 * 3. le relevé du magasin serveur (`listForfaits`), converti en grilles
 *    (`grillesDuMagasin`) : le 6 jours que l'actualisation a lu sur la page
 *    officielle, ou le prix saisi à la main.
 *
 * Le résolveur choisit ensuite, grille par grille (`resolution.ts`) : l'ordre
 * de cette liste ne décide de rien.
 *
 * Les grilles migrées s'écrivent dès qu'elles sont là ; le relevé serveur les
 * complète ensuite. Un serveur qui ne répond pas laisse les grilles des
 * fichiers, et le dit dans la console.
 */

import { listForfaits } from "./api";
import { grillesDuMagasin } from "./migration";
import { useGrillesForfaits } from "./prixStations";
import type { FichierGrilles, GrilleTarifaire } from "./tarifsPeriode";
import type { ForfaitRow } from "./types";
import { villageById } from "../villages";

/** Les grilles migrées, chargées à la demande : un écran qui n'affiche aucun
 *  forfait n'en paie pas le poids (32 Ko compressés). Sans attribut
 *  `with { type: "json" }` : en développement, Vite sert le JSON transformé
 *  en module JavaScript, que le navigateur refuse alors comme JSON. */
async function grillesMigrees(): Promise<GrilleTarifaire[]> {
  return ((await import("./grillesMigrees.json")).default as FichierGrilles).grilles;
}

/** Le fichier du relevé officiel, s'il existe : `import.meta.glob` rend un
 *  objet vide tant que le relevé n'a pas tourné, sans casser la construction. */
const OFFICIELLES = import.meta.glob<FichierGrilles>("./grillesOfficielles.json", {
  import: "default",
});

async function grillesOfficielles(): Promise<GrilleTarifaire[]> {
  const charger = Object.values(OFFICIELLES)[0];
  return charger ? (await charger()).grilles : [];
}

async function releveServeur(): Promise<ForfaitRow[]> {
  try {
    return (await listForfaits({ data: {} })).items;
  } catch (e) {
    console.warn("[forfaits] relevé serveur illisible : grilles des fichiers seules", e);
    return [];
  }
}

/**
 * Les grilles avec les stations d'aujourd'hui.
 *
 * Une grille relevée pour un village (« espiaube », « saint-lary-pla-d-adet »)
 * vaut pour sa station (`villages.ts`, 5 octobre 2026), **quand la station n'a
 * aucune grille à elle** : Saint-Lary n'avait que celles de ses deux villages.
 * Une station qui a la sienne la garde seule ; le tarif de Villaroger ne vient
 * pas concurrencer celui des Arcs. Les fichiers ne sont pas réécrits, la
 * lecture les ramène. Un doublon fusionné n'est pas ramené : la grille de
 * « le-granier » est celle du Planolet, que le vote de proximité du classeur
 * lui avait prêtée, pas celle du Granier.
 */
export function ramenerAuxStations(grilles: readonly GrilleTarifaire[]): GrilleTarifaire[] {
  const couvertes = new Set(grilles.flatMap((g) => g.stationIds.filter((id) => !villageById(id))));
  return grilles.map((g) => {
    const ids = [
      ...new Set(
        g.stationIds.map((id) => {
          const station = villageById(id)?.station;
          return station && !couvertes.has(station) ? station : id;
        }),
      ),
    ].sort();
    return ids.length === g.stationIds.length && ids.every((id, i) => id === g.stationIds[i])
      ? g
      : { ...g, stationIds: ids };
  });
}

let enCours: Promise<void> | null = null;

/** Charge les grilles une fois ; les appels suivants attendent le même
 *  chargement. Un échec se relance au prochain appel. */
export function chargerGrillesForfaits(): Promise<void> {
  enCours ??= (async () => {
    const [migrees, officielles] = await Promise.all([grillesMigrees(), grillesOfficielles()]);
    // Ramenées ensemble : une station couverte par l'un des lots ne prend pas
    // la grille d'un village dans un autre.
    useGrillesForfaits.setState({ grilles: ramenerAuxStations([...officielles, ...migrees]) });
    const rejets: string[] = [];
    const magasin = grillesDuMagasin(await releveServeur(), migrees, rejets);
    if (rejets.length) console.warn("[forfaits] relevé serveur : tarifs rejetés au contrôle", rejets);
    if (magasin.length)
      useGrillesForfaits.setState({
        grilles: ramenerAuxStations([...officielles, ...magasin, ...migrees]),
      });
  })().catch((e: unknown) => {
    console.warn("[forfaits] grilles illisibles", e);
    enCours = null;
  });
  return enCours;
}
