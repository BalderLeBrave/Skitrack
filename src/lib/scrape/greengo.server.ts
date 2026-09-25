/**
 * Relevé GreenGo, en HTTP simple sur son API GraphQL (voir `greengo.ts`).
 *
 * Une recherche par emprise autour de la station. Campings, hôtels, chambres
 * d'hôtes et « chez l'habitant » seuls sont écartés sans détail (étiquettes de
 * l'hôte) ; les autres sont tous détaillés, et le type de chaque logement
 * décide (`greengo.ts`). Un par un, au rythme du journal de taux partagé (2 s
 * entre deux, 20 par minute) : on attend son créneau tant que l'échéance de
 * la part le permet. Un refus (429, 503, 403) arrête le
 * relevé et pose une pause de 45 s au moins ; ce qui est lu reste, et rien
 * n'est repris. Un détail lu sert 15 min aux stations voisines (mêmes hôtes,
 * mêmes dates, même groupe). L'en-tête est celui d'un navigateur, comme tout
 * le relevé (`navigateur.ts`).
 */

import type { Listing } from "@/lib/listings";
import { CIRCUIT_COOLDOWN_MS, PAUSE_MAX_MS, estStatutRalenti, retryAfterMs } from "@/lib/stay/http429";
import { noterBlocage, paceTaux, pauseTauxMs } from "@/lib/stay/taux.server";
import { UA_NAVIGATEUR } from "./navigateur";
import { allowsPath } from "./robots";
import type { LiveSearchInput } from "./types";
import {
  ArretGreenGo,
  GREENGO_API,
  OPERATION_DETAIL,
  OPERATION_RECHERCHE,
  detailler,
  greengoListings,
  hoteGarde,
  lireDetail,
  lireRecherche,
  requeteDetail,
  requeteRecherche,
  type HoteGreenGo,
  type LogementGreenGo,
} from "./greengo";

const HOTE_TAUX = "greengo";
/** L'emprise de la recherche : celle du relevé Airbnb proche (6 km). */
const RAYON_KM = 6;
/**
 * Une borne de sûreté, pas un plafond de travail : c'est l'échéance qui
 * arrête (19 requêtes au plus en 40 s, à 2 s d'écart). Le plafond de 12
 * laissait sans capacité ni chambres les hôtes les plus lointains.
 */
const MAX_DETAILS = 60;
const DELAI_REQUETE_MS = 12_000;
/** Une requête qui ne peut pas finir avant l'échéance ne part pas. */
const MARGE_MS = 2_500;
/** Un détail lu reste bon pour les stations voisines qui partagent l'hôte. */
const CACHE_DETAIL_MS = 15 * 60_000;
const cacheDetails = new Map<string, { at: number; logements: LogementGreenGo[] }>();

async function graphql(operation: string, query: string, echeance: number): Promise<unknown> {
  const reste = echeance - Date.now();
  if (reste < MARGE_MS) throw new ArretGreenGo("échéance");
  // On attend son créneau tant que l'échéance le permet : abandonner au-delà
  // de 5 s laissait les hôtes suivants sans détail dès que la fenêtre était pleine.
  const attente = await paceTaux(HOTE_TAUX, reste - MARGE_MS);
  if (attente > 0) {
    const pourquoi = pauseTauxMs(HOTE_TAUX) > 0 ? "pause après un refus" : "limiteur local";
    throw new ArretGreenGo(`${pourquoi} (${Math.round(attente / 1000)} s à attendre)`);
  }
  const res = await fetch(GREENGO_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "accept-language": "fr-FR,fr;q=0.9",
      "user-agent": UA_NAVIGATEUR,
    },
    body: JSON.stringify({ operationName: operation, variables: {}, query }),
    signal: AbortSignal.timeout(Math.max(1_000, Math.min(DELAI_REQUETE_MS, echeance - Date.now()))),
  });
  // Un 403 est un refus, comme un 429 ou un 503 : pause partagée, jamais de
  // reprise. Sans Retry-After, la pause était de 2 s.
  if (estStatutRalenti(res.status) || res.status === 403) {
    const pause = Math.max(CIRCUIT_COOLDOWN_MS, retryAfterMs(res.headers, 0, PAUSE_MAX_MS));
    noterBlocage(HOTE_TAUX, pause);
    throw new ArretGreenGo(`HTTP ${res.status} — pause ${Math.round(pause / 1000)} s`);
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
  /** Hôtes écartés sans détail : camping, hôtel, chambres d'hôtes ou « chez l'habitant » seuls. */
  ecartes: number;
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
      const page = lireRecherche(await graphql(OPERATION_RECHERCHE, requeteRecherche(input, RAYON_KM, offset), echeance));
      publie = page.total ?? publie;
      hotes.push(...page.hotes);
      if (page.noeuds < 42 || (publie != null && offset + page.noeuds >= publie)) break;
    }
  } catch (err) {
    if (hotes.length === 0) throw err;
    raison = err instanceof Error ? err.message : String(err);
  }
  const gardes = hotes.filter(hoteGarde);
  const ecartes = hotes.length - gardes.length;
  // Les plus proches d'abord : arrêté en route, un hôte reste une annonce
  // « prix non publié » s'il est pur, jamais une annonce perdue sans le dire.
  const centre = { lat: input.lat, lon: input.lon };
  gardes.sort((a, b) => km(centre, a.lat, a.lon) - km(centre, b.lat, b.lon));
  const adultes = Math.max(1, Math.trunc(input.guests));
  /** L'heure de lecture du détail de chaque hôte : un détail du cache a jusqu'à 15 min. */
  const lus = new Map<string, number>();
  const suite = await detailler(raison ? [] : gardes.slice(0, MAX_DETAILS), async (h) => {
    const cle = [h.slug, input.checkIn, input.checkOut, adultes].join("|");
    const deja = cacheDetails.get(cle);
    if (deja && Date.now() - deja.at < CACHE_DETAIL_MS) {
      lus.set(h.id, deja.at);
      return deja.logements;
    }
    const logements = lireDetail(await graphql(OPERATION_DETAIL, requeteDetail(input, h.slug), echeance));
    const at = Date.now();
    for (const [k, v] of cacheDetails) if (at - v.at >= CACHE_DETAIL_MS) cacheDetails.delete(k);
    cacheDetails.set(cle, { at, logements });
    lus.set(h.id, at);
    return logements;
  });
  raison ??= suite.raison;
  if (!raison && gardes.length > MAX_DETAILS) raison = `${gardes.length - MAX_DETAILS} hôtes au-delà des ${MAX_DETAILS} lus en détail`;
  if (!raison && suite.echecs > 0) raison = `${suite.echecs} détail${suite.echecs > 1 ? "s" : ""} illisible${suite.echecs > 1 ? "s" : ""}`;
  const listings = gardes.flatMap((h) => {
    const annonces = greengoListings(h, suite.details.get(h.id) ?? null, input);
    const lu = lus.get(h.id);
    // Daté de la lecture du détail : `daterReleve` (run.server.ts) ne
    // retamponne pas une annonce qui porte déjà son heure.
    return lu == null ? annonces : annonces.map((l) => (l.total > 0 ? { ...l, scannedAt: lu } : l));
  });
  console.info(
    `[greengo] ${hotes.length} hôtes${publie != null ? ` sur ${publie} publiés` : ""}, ${ecartes} écartés (type), ${suite.details.size} lus en détail, ${listings.length} annonces${raison ? ` — ${raison}` : ""}`,
  );
  return { listings, hotes: publie, ecartes, detailles: suite.details.size, ...(raison ? { raison } : {}) };
}
