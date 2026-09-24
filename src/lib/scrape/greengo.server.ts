/**
 * Relevé GreenGo, en HTTP simple sur son API GraphQL (voir `greengo.ts`).
 *
 * Une recherche par emprise autour de la station, puis le détail des hôtes
 * les plus proches, un par un, au rythme du journal de taux partagé (2 s
 * entre deux, 20 par minute). Un refus (429, 503) arrête le relevé et pose la
 * pause demandée ; ce qui est lu reste. L'en-tête dit ce que le programme est.
 */

import type { Listing } from "@/lib/listings";
import { PAUSE_MAX_MS, estStatutRalenti, retryAfterMs } from "@/lib/stay/http429";
import { noterBlocage, paceTaux } from "@/lib/stay/taux.server";
import { allowsPath } from "./robots";
import type { LiveSearchInput } from "./types";
import {
  GREENGO_API,
  greengoListings,
  lireDetail,
  lireRecherche,
  requeteDetail,
  requeteRecherche,
  type HoteGreenGo,
  type LogementGreenGo,
} from "./greengo";

/** Identification honnête : ni navigateur, ni robot d'indexation. */
const UA = "Skitrack/1.0 (relevé de logements ; robot applicatif, une requête à la fois, 2 s au moins entre deux)";
const HOTE_TAUX = "greengo";
/** L'emprise de la recherche : celle du relevé Airbnb proche (6 km). */
const RAYON_KM = 6;
/** Au plus tant de détails par relevé : une requête chacun. */
const MAX_DETAILS = 12;
const DELAI_REQUETE_MS = 12_000;
/** Une requête qui ne peut pas finir avant l'échéance ne part pas. */
const MARGE_MS = 2_500;

class ArretGreenGo extends Error {}

async function graphql(operation: string, query: string, echeance: number): Promise<unknown> {
  const reste = echeance - Date.now();
  if (reste < MARGE_MS) throw new ArretGreenGo("échéance");
  const pause = await paceTaux(HOTE_TAUX, Math.min(5_000, reste - MARGE_MS));
  if (pause > 0) throw new ArretGreenGo(`limiteur local (${Math.round(pause / 1000)} s à attendre)`);
  const res = await fetch(GREENGO_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "accept-language": "fr-FR,fr;q=0.9",
      "user-agent": UA,
    },
    body: JSON.stringify({ operationName: operation, variables: {}, query }),
    signal: AbortSignal.timeout(Math.max(1_000, Math.min(DELAI_REQUETE_MS, echeance - Date.now()))),
  });
  if (estStatutRalenti(res.status)) {
    const attente = retryAfterMs(res.headers, 0, PAUSE_MAX_MS);
    noterBlocage(HOTE_TAUX, attente);
    throw new ArretGreenGo(`HTTP ${res.status} — pause ${Math.round(attente / 1000)} s`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { errors?: Array<{ message?: string }> };
  if (Array.isArray(json.errors) && json.errors.length) {
    // Une requête que le schéma refuse : le site a changé, on le dit.
    throw new Error(`GraphQL : ${json.errors[0]?.message ?? "erreur"}`.slice(0, 200));
  }
  return json;
}

function km(a: { lat: number; lon: number }, lat: number | null, lon: number | null): number {
  if (lat == null || lon == null) return Number.POSITIVE_INFINITY;
  const r = 6371;
  const dLat = ((lat - a.lat) * Math.PI) / 180;
  const dLon = ((lon - a.lon) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(x)));
}

export type ReleveGreenGo = {
  listings: Listing[];
  /** Hôtes réservables aux dates que GreenGo publie dans l'emprise. */
  hotes: number | null;
  /** Hôtes dont le détail (total exact par logement) a été lu. */
  detailles: number;
  /** Pourquoi le relevé s'est arrêté avant la fin, s'il l'a fait. */
  raison?: string;
};

export async function releverGreenGo(input: LiveSearchInput, opts: { echeance: number }): Promise<ReleveGreenGo> {
  await allowsPath("https://operations.greengo.voyage", "/graphql");
  const { echeance } = opts;
  const hotes: HoteGreenGo[] = [];
  let publie: number | null = null;
  let raison: string | undefined;
  try {
    for (let offset = 0; ; offset += 42) {
      const page = lireRecherche(await graphql("SkitrackRecherche", requeteRecherche(input, RAYON_KM, offset), echeance));
      publie = page.total ?? publie;
      hotes.push(...page.hotes);
      if (page.noeuds < 42 || (publie != null && offset + page.noeuds >= publie)) break;
    }
  } catch (err) {
    if (hotes.length === 0) throw err;
    raison = err instanceof Error ? err.message : String(err);
  }
  // Les plus proches d'abord : au-delà de MAX_DETAILS ou de l'échéance, un
  // hôte reste une annonce « prix non publié », jamais une annonce perdue.
  const centre = { lat: input.lat, lon: input.lon };
  hotes.sort((a, b) => km(centre, a.lat, a.lon) - km(centre, b.lat, b.lon));
  const details = new Map<string, LogementGreenGo[]>();
  for (const h of hotes.slice(0, MAX_DETAILS)) {
    if (raison) break;
    try {
      details.set(h.id, lireDetail(await graphql("SkitrackDetail", requeteDetail(input, h.slug), echeance)));
    } catch (err) {
      raison = err instanceof Error ? err.message : String(err);
    }
  }
  if (!raison && hotes.length > MAX_DETAILS) raison = `${hotes.length - MAX_DETAILS} hôtes au-delà des ${MAX_DETAILS} lus en détail`;
  const listings = hotes.flatMap((h) => greengoListings(h, details.get(h.id) ?? null, input));
  console.info(
    `[greengo] ${hotes.length} hôtes${publie != null ? ` sur ${publie} publiés` : ""}, ${details.size} lus en détail, ${listings.length} annonces${raison ? ` — ${raison}` : ""}`,
  );
  return { listings, hotes: publie, detailles: details.size, ...(raison ? { raison } : {}) };
}
