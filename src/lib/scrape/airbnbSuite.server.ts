/**
 * Fiches PDP Airbnb, une par une, après la suite de pages.
 *
 * L'écran ne les attend pas. Douze secondes entre deux, sous le plafond de
 * 18 appels par minute. Au premier refus (429, 503, coupe-circuit), on
 * s'arrête : rien n'est réessayé dans la pause. Ce qui est lu va dans la
 * mémoire des fiches ; l'écran le pose en relisant, sans nouveau réseau.
 * Une tuile de recherche n'est pas une fiche : on n'écrit ici que la réponse
 * PDP.
 */

import type { Listing } from "@/lib/listings";
import { airbnbCircuitOpen } from "@/lib/stay/airbnbCircuit.server";
import { airbnbIdOf } from "@/lib/stay/airbnbId";
import { cleListing } from "@/lib/stay/poserReleve";
import { memoireFiches } from "@/lib/stay/memoireFiches.server";
import { airbnbListePrioritaire } from "@/lib/stay/completerFiche.server";
import { lireFichesAirbnb } from "./airbnb.server";
import type { LiveSearchInput } from "./types";

/** Au plus tant de fiches par recherche : le reste attend une recherche suivante. */
const FICHES_MAX = 400;
/** Entre deux fiches, en plus de l'écart du limiteur. */
const PAUSE_FICHE_MS = 12_000;
const FICHE_MS = 40_000;

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Attend qu'un relevé de liste ait le limiteur. `true` : il faut s'arrêter. */
async function ceder(stop: () => boolean): Promise<boolean> {
  while (airbnbListePrioritaire()) {
    if (stop()) return true;
    await dormir(1_000);
  }
  return stop();
}

/**
 * Lit les fiches des annonces qui n'en ont pas encore une en mémoire.
 * `stop` : un relevé plus récent a pris Airbnb, on laisse la place.
 * Rend `refus` si Airbnb a refusé, `laisse` si on s'est effacé, `ok` sinon.
 */
export async function lireFichesLentes(
  rows: readonly Listing[],
  input: Pick<LiveSearchInput, "checkIn" | "checkOut" | "guests">,
  stop: () => boolean,
): Promise<"ok" | "refus" | "laisse"> {
  const memoire = memoireFiches();
  const vus = new Set<string>();
  const ids: string[] = [];
  for (const row of rows) {
    if (row.source !== "Airbnb") continue;
    const id = airbnbIdOf(row);
    const cle = cleListing(row);
    if (!id || !cle || vus.has(id)) continue;
    vus.add(id);
    if (memoire.lire(cle)?.fiche) continue;
    ids.push(id);
    if (ids.length >= FICHES_MAX) break;
  }
  const parId = new Map<string, Listing>();
  for (const row of rows) {
    const id = row.source === "Airbnb" ? airbnbIdOf(row) : null;
    if (id && !parId.has(id)) parId.set(id, row);
  }
  let lues = 0;
  for (const id of ids) {
    if (await ceder(stop)) return "laisse";
    if (airbnbCircuitOpen()) return "refus";
    const row = parId.get(id);
    const cle = row ? cleListing(row) : null;
    if (cle && memoire.lire(cle)?.fiche) continue;
    let essaisRythme = 0;
    for (;;) {
      const lu = await lireFichesAirbnb({
        ids: [id],
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        adults: input.guests,
        echeance: Date.now() + FICHE_MS,
        pauseS: 12,
      });
      if (lu.arret === "refus" || lu.arret === "coupe-circuit") return "refus";
      if (lu.arret === "rythme") {
        essaisRythme += 1;
        if (essaisRythme > 2) break;
        if (await ceder(stop)) return "laisse";
        await dormir(lu.attenteMs ?? 8_000);
        continue;
      }
      const notes = [];
      for (const [fid, f] of Object.entries(lu.fiches)) {
        const cible = parId.get(fid);
        const cleCible = cible ? cleListing(cible) : null;
        if (!cleCible) continue;
        const { enrichie, ...valeurs } = f;
        notes.push({
          cle: cleCible,
          capacity: valeurs.capacity,
          bedrooms: valeurs.bedrooms,
          rooms: valeurs.rooms,
          lat: valeurs.lat,
          lon: valeurs.lon,
          ...(valeurs.capacitySource ? { capacitySource: valeurs.capacitySource } : {}),
          ...(valeurs.bedroomsSource ? { bedroomsSource: valeurs.bedroomsSource } : {}),
          ...(typeof valeurs.ecartee === "boolean" ? { ecartee: valeurs.ecartee } : {}),
          ...(enrichie ? { fiche: { ...enrichie, recupereLe: enrichie.recupereLe ?? new Date().toISOString() } } : {}),
          lue: true,
        });
      }
      for (const vid of lu.vides) {
        const cible = parId.get(vid);
        const cleCible = cible ? cleListing(cible) : null;
        if (cleCible) notes.push({ cle: cleCible, lue: true });
      }
      if (notes.length) memoire.noter(notes);
      lues += lu.lues;
      if (lu.arret === "hash" || lu.arret === "cle" || lu.arret === "worker" || lu.arret === "illisible") {
        console.info(`[airbnb] fiches lentes arrêtées (${lu.arret}) après ${lues}`);
        return "ok";
      }
      break;
    }
    if (await ceder(stop)) return "laisse";
    await dormir(PAUSE_FICHE_MS);
  }
  if (lues) console.info(`[airbnb] fiches lentes : ${lues} lue(s), ${ids.length} demandée(s)`);
  return "ok";
}
