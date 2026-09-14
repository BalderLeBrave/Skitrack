import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { BraBulletin } from "./parse";
import { rattachementBra, reperesBra, type VoieBra } from "./massifs";
import { STATIONS, stationById } from "../stations";

/**
 * Le bulletin d'avalanche d'une station, et **ce qui lui est arrivé**.
 *
 * Le payload ne portait que `official: BraBulletin | null`, si bien que quatre
 * situations distinctes — requête en vol, massif non rattaché, refus de
 * Météo-France, saison terminée — arrivaient à l'écran sous la même forme et y
 * produisaient le même message, « Bulletin d'avalanche non lu ». `etat` les
 * sépare, et l'écran en dit la cause.
 *
 * Le bloc `internal` — un indice maison calculé à partir d'AROME — a été
 * retiré : aucun écran ne le lisait, et il coûtait un second appel réseau en
 * série à chaque affichage du bulletin.
 */
export type EtatBra = "ok" | "hors-zone" | "non-rattache" | "echec";

export type BraPayload = {
  /** Massif Météo-France retenu, et par quelle voie. */
  massif: string | null;
  code: number | null;
  voie: VoieBra | null;
  etat: EtatBra;
  official: BraBulletin | null;
  /** Cause technique, pour le détail repliable et le journal. Jamais le
   *  libellé principal. */
  cause: string | null;
  /** Horodatage de la tentative, réussie ou non. */
  releveA: string;
};

/** Les repères de rattachement par proximité, construits une fois. */
let reperes: ReturnType<typeof reperesBra> | null = null;
function lesReperes() {
  reperes ??= reperesBra(STATIONS);
  return reperes;
}

/**
 * Le bulletin d'une station : rattachement au massif, puis relevé.
 *
 * Le corps est partagé par l'appel unitaire et l'appel par lot — il n'y a
 * qu'un chemin de lecture, et `fetchBra` partage son cache et ses requêtes en
 * vol entre les stations d'un même massif.
 */
async function payloadStation(id: string, force: boolean): Promise<BraPayload> {
  const releveA = new Date().toISOString();
  const s = stationById(id);
  if (!s) {
    return { massif: null, code: null, voie: null, etat: "non-rattache", official: null, cause: "Station inconnue.", releveA };
  }
  const r = rattachementBra(s, lesReperes());
  if (r.code == null) {
    // Journalisé station par station : les trous de rattachement étaient
    // invisibles en exploitation.
    console.warn(`[bra] ${s.id} : aucun massif Météo-France (${s.massif})`);
    return {
      massif: r.massif,
      code: null,
      voie: r.voie,
      etat: r.horsZone ? "hors-zone" : "non-rattache",
      official: null,
      cause: r.horsZone
        ? `Météo-France ne publie pas de bulletin d'avalanche pour le massif « ${s.massif} ».`
        : "Aucun massif Météo-France ne couvre cette station.",
      releveA,
    };
  }
  const { fetchBra } = await import("./fetch.server");
  const official = await fetchBra(r.code, force);
  if (!official.ok) console.warn(`[bra] ${s.id} (massif ${r.code}) : ${official.error ?? "échec"}`);
  return {
    massif: r.massif,
    code: r.code,
    voie: r.voie,
    etat: official.ok ? "ok" : "echec",
    official,
    cause: official.ok ? null : (official.error ?? "Bulletin illisible."),
    releveA,
  };
}

/** Le bulletin d'une station, rattachement compris. */
export const getStationBra = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1), force: z.boolean().optional() }))
  .handler(async ({ data }): Promise<BraPayload> => payloadStation(data.id, data.force ?? false));

/**
 * Les bulletins de plusieurs stations, **en un appel**.
 *
 * Le client groupait bien ses demandes dans une fenêtre de quelques
 * millisecondes, mais en tirait ensuite une requête HTTP par station : le lot
 * n'existait que de nom. Trois cents stations tiennent en une trentaine de
 * massifs, et `fetchBra` ne sort sur le réseau qu'une fois par massif ; ce qui
 * reste à économiser, ce sont les allers-retours avec le serveur du dépôt.
 */
export const getStationsBra = createServerFn({ method: "POST" })
  .validator(z.object({ ids: z.array(z.string().min(1)).min(1).max(40), force: z.boolean().optional() }))
  .handler(async ({ data }): Promise<Record<string, BraPayload>> => {
    const uniques = [...new Set(data.ids)];
    const lus = await Promise.all(uniques.map((id) => payloadStation(id, data.force ?? false)));
    return Object.fromEntries(uniques.map((id, i) => [id, lus[i]!]));
  });
