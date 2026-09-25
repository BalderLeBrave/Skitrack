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

export const etatAirbnb = createServerFn({ method: "GET" }).handler(
  async (): Promise<EtatCreneau> => {
    const [{ airbnbCircuitRestantMs }, { attentePlacesMs, pauseTauxMs }] = await Promise.all([
      import("../stay/airbnbCircuit.server"),
      import("../stay/taux.server"),
    ]);
    const refus = Math.max(airbnbCircuitRestantMs(), pauseTauxMs("airbnb"));
    if (refus > 0) return { attenteMs: refus, motif: "refus" };
    const rythme = attentePlacesMs("airbnb", PLACES_PAR_STATION);
    if (rythme > 0) return { attenteMs: rythme, motif: "rythme" };
    return { attenteMs: 0, motif: null };
  },
);
