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
 * mêmes dates, même groupe). Ce qu'il publie d'un hôte à logement unique
 * (fiche, équipements, description, et capacité et chambres) se garde trente
 * jours, et se repose sans requête sur son annonce quand un relevé ne lit pas
 * son détail (`lecturesAGarder`, `valeursAGarder`). L'en-tête est celui d'un navigateur, comme tout le
 * relevé (`navigateur.ts`).
 *
 * Les hôtes à logement unique que la recherche n'a pas lus faute de temps
 * (au-delà des plus proches, échéance, limiteur) se lisent ensuite en tâche de
 * fond, pour l'écran Logements seul, sur le modèle des fiches lentes Airbnb
 * (`lancerSuiteGreenGo`). Elle ne part jamais après un refus, un défi ou une
 * panne de la recherche (`suiteALancer`). Un détail à la fois, douze secondes
 * au moins après la requête précédente vers GreenGo et au rythme du journal
 * partagé, dont elle accepte dix secondes d'attente au plus ; douze secondes
 * de délai par requête, comptées à l'envoi ; vingt-quatre détails ou huit
 * minutes au plus. Elle cède à toute nouvelle recherche vers GreenGo, et à
 * l'écran Prix qui attend sa fenêtre (`cederSuiteGreenGo`) ;
 * elle s'arrête sans nouvel essai sur la première erreur, un refus posant la
 * pause partagée de toujours. Un détail lu ou gardé il y a moins de trente
 * jours ne se relit pas (`notesDuDetail`). Ce qu'elle lit se garde comme à la
 * recherche, et l'écran le pose par sa relecture, sans réseau
 * (`detailGreenGoAPoser`, `relecture.ts`).
 */

import type { Listing } from "@/lib/listings";
import { CIRCUIT_COOLDOWN_MS, PAUSE_MAX_MS, estStatutRalenti, retryAfterMs } from "@/lib/stay/http429";
import { noterBlocage, paceTaux, pauseTauxMs } from "@/lib/stay/taux.server";
import { dejaGardee, garderLectures, type LectureAGarder } from "@/lib/stay/contenuFiches.server";
import { memoireFiches } from "@/lib/stay/memoireFiches.server";
import { UA_NAVIGATEUR } from "./navigateur";
import { allowsPath } from "./robots";
import { stationsDuReleve } from "./domaine";
import type { LiveSearchInput } from "./types";
import {
  ArretGreenGo,
  GREENGO_API,
  OPERATION_DETAIL,
  OPERATION_RECHERCHE,
  cleSansDetail,
  detailler,
  detaillerMalgre,
  greengoListings,
  hoteGarde,
  hotesDeSuite,
  lecturesAGarder,
  lireDetail,
  lireRecherche,
  lireSuiteGreenGo,
  notesDuDetail,
  requeteDetail,
  requeteRecherche,
  suiteALancer,
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

/** La suite de fond : l'écart des fiches lentes Airbnb, au-dessus de celui du journal (2 s). */
const SUITE_ECART_MS = 12_000;
/** Détails demandés au plus par une suite : cinq par minute à cet écart, le reste attend une recherche. */
const SUITE_DETAILS_MAX = 24;
const SUITE_MAX_MS = 8 * 60_000;
/**
 * L'attente du journal qu'accepte un détail de la suite ; au-delà, il ne part
 * pas et elle s'arrête (limiteur). Son délai, `DELAI_REQUETE_MS`, court ensuite
 * depuis l'envoi.
 */
const SUITE_ATTENTE_TAUX_MS = 10_000;

/**
 * La génération des recherches GreenGo : une recherche neuve la change, et la
 * suite de fond de la précédente cède. Une seule suite à la fois : la
 * suivante part à la fin de celle d'avant (`suiteCourante`).
 */
let generation = 0;
let suiteCourante: Promise<void> = Promise.resolve();
/** La fin de la dernière requête vers GreenGo, recherche ou détail, de ce processus. */
let finDerniere = 0;

/**
 * Les bornes d'une requête. La recherche les tire de son échéance : elle
 * attend son créneau tant que l'échéance le permet, et une requête qui ne
 * peut pas finir avant ne part pas. La suite de fond a les siennes, fixes :
 * l'attente du journal qu'elle accepte (`attenteMaxMs`, au-delà elle s'arrête
 * sur le limiteur) et le délai de la requête (`delaiMs`), compté à l'envoi,
 * jamais rogné par l'attente. `arret` : relu après l'attente du journal, juste
 * avant l'envoi ; une raison arrête la requête, qui ne part pas (la suite cède
 * à une recherche).
 */
type BornesRequete = { echeance: number } | { attenteMaxMs: number; delaiMs: number; arret: () => string | null };

async function graphql(operation: string, query: string, bornes: BornesRequete): Promise<unknown> {
  let attenteMax: number;
  if ("echeance" in bornes) {
    const reste = bornes.echeance - Date.now();
    if (reste < MARGE_MS) throw new ArretGreenGo("échéance");
    // On attend son créneau tant que l'échéance le permet : abandonner au-delà
    // de 5 s laissait les hôtes suivants sans détail dès que la fenêtre était pleine.
    attenteMax = reste - MARGE_MS;
  } else {
    attenteMax = bornes.attenteMaxMs;
  }
  const attente = await paceTaux(HOTE_TAUX, attenteMax);
  if (attente > 0) {
    const pourquoi = pauseTauxMs(HOTE_TAUX) > 0 ? "pause après un refus" : "limiteur local";
    throw new ArretGreenGo(`${pourquoi} (${Math.round(attente / 1000)} s à attendre)`);
  }
  const raison = "arret" in bornes ? bornes.arret() : null;
  if (raison) throw new ArretGreenGo(raison);
  // Le délai court depuis l'envoi : celui de la recherche s'arrête à son échéance.
  const delai =
    "echeance" in bornes ? Math.max(1_000, Math.min(DELAI_REQUETE_MS, bornes.echeance - Date.now())) : bornes.delaiMs;
  try {
    const res = await fetch(GREENGO_API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "accept-language": "fr-FR,fr;q=0.9",
        "user-agent": UA_NAVIGATEUR,
      },
      body: JSON.stringify({ operationName: operation, variables: {}, query }),
      signal: AbortSignal.timeout(delai),
    });
    // Un 403 est un refus, comme un 429 ou un 503 : pause partagée, jamais de
    // reprise. Sans Retry-After, la pause était de 2 s.
    if (estStatutRalenti(res.status) || res.status === 403) {
      const pause = Math.max(CIRCUIT_COOLDOWN_MS, retryAfterMs(res.headers, 0, PAUSE_MAX_MS));
      noterBlocage(HOTE_TAUX, pause);
      throw new ArretGreenGo(`HTTP ${res.status} — pause ${Math.round(pause / 1000)} s`);
    }
    // Un défi anti-robot n'est pas une panne : servi en 202 par AWS WAF
    // (`x-amzn-waf-action`), en 405 avec un captcha, ou en page HTML à la
    // place du JSON, il arrête l'hôte comme un refus, pause partagée comprise.
    // Lu comme un JSON illisible, il laissait partir les détails suivants vers
    // le même hôte, et la recherche suivante sans attendre. Il n'est jamais
    // contourné.
    if (
      res.headers.has("x-amzn-waf-action") ||
      res.status === 202 ||
      res.status === 405 ||
      /text\/html/i.test(res.headers.get("content-type") ?? "")
    ) {
      await res.body?.cancel().catch(() => undefined);
      const pause = Math.max(CIRCUIT_COOLDOWN_MS, retryAfterMs(res.headers, 0, PAUSE_MAX_MS));
      noterBlocage(HOTE_TAUX, pause);
      throw new ArretGreenGo(`HTTP ${res.status} (défi anti-robot) — pause ${Math.round(pause / 1000)} s`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { errors?: Array<{ message?: string }> };
    if (Array.isArray(json.errors) && json.errors.length) {
      // Une requête que le schéma refuse : le site a changé, on le dit.
      throw new Error(`GraphQL : ${json.errors[0]?.message ?? "erreur"}`.slice(0, 200));
    }
    return json;
  } finally {
    // La suite de fond compte son écart depuis là, réponse lue ou non.
    finDerniere = Math.max(finDerniere, Date.now());
  }
}

/** Note les valeurs et la lecture des détails ; un disque refusé ne coupe rien. */
function noterDetails(notes: ReturnType<typeof notesDuDetail>): void {
  if (!notes.length) return;
  try {
    memoireFiches().noter(notes);
  } catch (err) {
    console.warn("[greengo] détails non notés :", (err as Error).message);
  }
}

/** Le détail de cet hôte a été lu, ou ce qu'il publie gardé, il y a moins de trente jours. */
function detailNote(cle: string | null): boolean {
  if (!cle) return false;
  try {
    return memoireFiches().lire(cle)?.lue === true || dejaGardee(cle);
  } catch {
    return false;
  }
}

function cleCache(h: HoteGreenGo, input: LiveSearchInput): string {
  return [h.slug, input.checkIn, input.checkOut, Math.max(1, Math.trunc(input.guests))].join("|");
}

function garderEnCache(cle: string, logements: LogementGreenGo[]): number {
  const at = Date.now();
  for (const [k, v] of cacheDetails) if (at - v.at >= CACHE_DETAIL_MS) cacheDetails.delete(k);
  cacheDetails.set(cle, { at, logements });
  return at;
}

/**
 * L'écran Prix attend sa fenêtre GreenGo (`etatAirbnb`) : la suite de fond
 * cède, comme à une recherche. Sans cela, ses cinq détails par minute
 * tenaient la fenêtre occupée jusqu'à sa fin, et la station suivante attendait.
 */
export function cederSuiteGreenGo(): void {
  generation += 1;
}

/**
 * Les détails que la recherche n'a pas lus, en tâche de fond (`lireSuiteGreenGo`) :
 * un à la fois, douze secondes au moins après la requête précédente vers
 * GreenGo, au rythme du journal partagé (`SUITE_ATTENTE_TAUX_MS` d'attente au
 * plus, puis `DELAI_REQUETE_MS` depuis l'envoi), au plus `SUITE_DETAILS_MAX`
 * détails ou `SUITE_MAX_MS`. Elle cède à toute nouvelle recherche vers
 * GreenGo, ne part pas pendant une pause et s'arrête sur la première erreur ;
 * un refus pose la pause partagée (`graphql`). Ce qu'elle lit se garde comme
 * à la recherche (`lecturesAGarder`, `notesDuDetail`), et quinze minutes pour
 * les stations voisines et une recherche aux mêmes dates (`cacheDetails`).
 */
function lancerSuiteGreenGo(input: LiveSearchInput, gen: number, hotes: HoteGreenGo[]): void {
  if (hotes.length === 0) return;
  const suite = async () => {
    const cede = () => (generation !== gen ? "une nouvelle recherche est partie" : null);
    if (cede()) return;
    const debut = Date.now();
    const arret = () =>
      cede() ??
      (pauseTauxMs(HOTE_TAUX) > 0
        ? "pause après un refus"
        : Date.now() - debut > SUITE_MAX_MS
          ? `${SUITE_MAX_MS / 60_000} min atteintes`
          : null);
    const r = await lireSuiteGreenGo(
      hotes,
      {
        lire: (h) =>
          graphql(OPERATION_DETAIL, requeteDetail(input, h.slug), {
            attenteMaxMs: SUITE_ATTENTE_TAUX_MS,
            delaiMs: DELAI_REQUETE_MS,
            arret,
          }),
        dejaLu: (h) => detailNote(cleSansDetail(h, input)),
        arret,
        garder: (h, logements) => {
          garderEnCache(cleCache(h, input), logements);
          const annonces = greengoListings(h, logements, input);
          const lectures = lecturesAGarder(h, annonces, input);
          if (lectures.length) garderLectures(lectures);
          noterDetails(notesDuDetail(h, annonces, input));
        },
        derniere: () => finDerniere,
        maintenant: () => Date.now(),
        attendre: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      },
      { max: SUITE_DETAILS_MAX, ecartMs: SUITE_ECART_MS },
    );
    console.info(
      `[greengo] suite de fond : ${r.lus} détail(s) lu(s) sur ${r.demandes} demandé(s)${r.arret ? `, arrêtée : ${r.arret}` : ""}`,
    );
  };
  suiteCourante = suiteCourante.then(suite).catch((err: unknown) => {
    console.warn("[greengo] suite de fond :", err instanceof Error ? err.message : String(err));
  });
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
  // Une recherche neuve : la suite de fond d'avant cède avant toute requête.
  const gen = ++generation;
  await allowsPath("https://operations.greengo.voyage", "/graphql");
  const { echeance } = opts;
  const hotes: HoteGreenGo[] = [];
  let publie: number | null = null;
  let raison: string | undefined;
  // Sur un grand domaine, l'emprise couvre aussi chaque station reliée.
  const autour = stationsDuReleve(input);
  try {
    for (let offset = 0; ; offset += 42) {
      const page = lireRecherche(
        await graphql(OPERATION_RECHERCHE, requeteRecherche(input, RAYON_KM, offset, autour), { echeance }),
      );
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
  /** L'heure de lecture du détail de chaque hôte : un détail du cache a jusqu'à 15 min. */
  const lus = new Map<string, number>();
  /** Les hôtes dont le détail a échoué (500, réponse illisible) : la suite de fond ne les reprend pas. */
  const echoues = new Set<string>();
  const suite = await detailler(detaillerMalgre(raison) ? gardes.slice(0, MAX_DETAILS) : [], async (h) => {
    const cle = cleCache(h, input);
    const deja = cacheDetails.get(cle);
    if (deja && Date.now() - deja.at < CACHE_DETAIL_MS) {
      lus.set(h.id, deja.at);
      return deja.logements;
    }
    let reponse: unknown;
    try {
      reponse = await graphql(OPERATION_DETAIL, requeteDetail(input, h.slug), { echeance });
    } catch (err) {
      if (!(err instanceof ArretGreenGo)) echoues.add(h.id);
      throw err;
    }
    const logements = lireDetail(reponse);
    lus.set(h.id, garderEnCache(cle, logements));
    return logements;
  });
  raison ??= suite.raison;
  if (!raison && gardes.length > MAX_DETAILS) raison = `${gardes.length - MAX_DETAILS} hôtes au-delà des ${MAX_DETAILS} lus en détail`;
  if (!raison && suite.echecs > 0) raison = `${suite.echecs} détail${suite.echecs > 1 ? "s" : ""} illisible${suite.echecs > 1 ? "s" : ""}`;
  /**
   * Ce que les détails lus publient, à garder trente jours (`lecturesAGarder`,
   * `notesDuDetail` : valeurs et lecture).
   */
  const aGarder: LectureAGarder[] = [];
  const aNoter: ReturnType<typeof notesDuDetail> = [];
  const listings = gardes.flatMap((h) => {
    const logements = suite.details.get(h.id) ?? null;
    const annonces = greengoListings(h, logements, input);
    if (logements) {
      aGarder.push(...lecturesAGarder(h, annonces, input));
      aNoter.push(...notesDuDetail(h, annonces, input));
    }
    const lu = lus.get(h.id);
    // Daté de la lecture du détail : `daterReleve` (run.server.ts) ne
    // retamponne pas une annonce qui porte déjà son heure.
    return lu == null ? annonces : annonces.map((l) => (l.total > 0 ? { ...l, scannedAt: lu } : l));
  });
  // Une écriture par relevé au plus, sans requête ; un disque refusé ne
  // coupe pas le relevé (`garderLectures`).
  if (aGarder.length) garderLectures(aGarder);
  noterDetails(aNoter);
  console.info(
    `[greengo] ${hotes.length} hôtes${publie != null ? ` sur ${publie} publiés` : ""}, ${ecartes} écartés (type), ${suite.details.size} lus en détail, ${listings.length} annonces${raison ? ` — ${raison}` : ""}`,
  );
  // Le reste en tâche de fond, pour l'écran Logements seul (l'écran Prix compare
  // des stations, et ne relit pas), et seulement si la recherche s'est arrêtée
  // faute de temps : jamais après un refus, un défi ou une panne (`suiteALancer`).
  if (input.domaine === true && suiteALancer(raison, suite.echecs)) {
    lancerSuiteGreenGo(input, gen, hotesDeSuite(gardes, suite.details, echoues, input));
  }
  return { listings, hotes: publie, ecartes, detailles: suite.details.size, ...(raison ? { raison } : {}) };
}
