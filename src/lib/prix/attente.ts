/**
 * Le créneau Airbnb, vu de l'écran « Prix par station » : peut-on lancer la
 * station suivante ?
 *
 * Les stations passent l'une après l'autre. Après un refus (coupe-circuit, ou
 * pause posée dans le journal de taux), la station suivante n'aurait aucune
 * annonce Airbnb ; quand la fenêtre glissante est trop pleine, le limiteur
 * local la couperait à mi-chemin. On lit les fichiers partagés avec le sidecar
 * Python, sans rien y réserver : c'est le relevé lui-même qui réserve.
 */
import { createServerFn } from "@tanstack/react-start";

export type EtatCreneau = { attenteMs: number; motif: "refus" | "rythme" | null };

/** Requêtes StaysSearch d'un relevé Airbnb, au plus (`MAX_REQUETES` de `scrape/airbnb/stays.py`). */
export const PLACES_PAR_STATION = 12;
/**
 * Requêtes GreenGo d'une station, au plus : une recherche et un détail par
 * hôte, à 2 s d'écart dans les 40 s de la part (`ECHEANCE_PART_MS`,
 * `scrape/run.server.ts`), soit 19. Une station lancée sur une fenêtre pleine
 * laissait ses hôtes lointains sans capacité ni chambres.
 */
export const PLACES_GREENGO = 19;
/**
 * Au-delà, on n'attend pas GreenGo : une longue pause après un refus ne
 * retient pas Airbnb et les autres, et la part GreenGo s'arrête d'elle-même
 * en le disant.
 */
export const ATTENTE_GREENGO_MAX_MS = 120_000;

export const etatAirbnb = createServerFn({ method: "GET" }).handler(
  async (): Promise<EtatCreneau> => {
    const [{ airbnbCircuitRestantMs }, { attentePlacesMs, pauseTauxMs }] = await Promise.all([
      import("../stay/airbnbCircuit.server"),
      import("../stay/taux.server"),
    ]);
    const refus = Math.max(airbnbCircuitRestantMs(), pauseTauxMs("airbnb"));
    if (refus > 0) return { attenteMs: refus, motif: "refus" };
    const greengo = attentePlacesMs("greengo", PLACES_GREENGO);
    const rythme = Math.max(
      attentePlacesMs("airbnb", PLACES_PAR_STATION),
      greengo <= ATTENTE_GREENGO_MAX_MS ? greengo : 0,
    );
    if (rythme > 0) return { attenteMs: rythme, motif: "rythme" };
    return { attenteMs: 0, motif: null };
  },
);
