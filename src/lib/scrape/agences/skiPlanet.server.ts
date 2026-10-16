/**
 * Relevé Ski-Planet (voir `skiPlanet.ts`) : le calendrier de chaque résidence
 * de la station, un par requête, au rythme du site (`stay/taux.server.ts` :
 * une par résidence, deux secondes et trente par minute) ; puis, pour les résidences qui
 * vendent un logement au groupe, le même calendrier forfaits compris.
 *
 * Aucun appel du site ne rend toutes les résidences d'une station : il en
 * faut un par résidence (31 à Avoriaz, 189 à Tignes), et une part de 40 s
 * n'en lit qu'une quinzaine. La lecture d'une station, pour des dates,
 * est donc une tâche à part, une seule à la fois dans le processus : la part
 * la lance, ou la rejoint, attend jusqu'à son échéance et rend ce qui est
 * lu ; la tâche continue après la part, jusqu'au bout de la station ou
 * jusqu'à un refus, et garde chaque calendrier six heures. Le relevé suivant
 * de la même station, pour les mêmes dates, part de là. Une autre station
 * arrête la tâche en cours : les stations passent l'une après l'autre, comme
 * pour les autres sources.
 *
 * Les résidences dont la position est connue passent d'abord : ce sont
 * celles que l'écran Logements affiche.
 *
 * **Le panneau des logements, en tâche de fond.** Le panneau « Voir
 * descriptif et photos » (`infos-logement.php`) donne la description et les
 * photos d'un logement ; il en faut un appel par logement vendu. La tâche de
 * la station le lit pour les seuls logements des résidences sans photo. Les
 * autres se lisent après elle, sur le modèle des fiches lentes Airbnb
 * (`lancerSuitePanneaux`) : un panneau à la fois, douze secondes d'écart,
 * cinquante panneaux ou douze minutes au plus par recherche, et la suite
 * cède à toute nouvelle recherche Ski-Planet (compteur de génération). Un
 * refus (403, 429, 503, défi anti-robot compris), ou une réponse qui n'est
 * pas un panneau, l'arrête sans reprise, et plus aucun panneau ne part avant
 * une heure ; un défi servi en 200 pose aussi la pause du site, comme un
 * refus. Ce qu'un panneau publie se garde trente jours (`garderLectures` :
 * description, photos, équipements qu'elle nomme, sans fiche ; la mémoire
 * des fiches note qu'il a été lu, le panneau ne publiant ni capacité ni
 * point), et se repose sans réseau : sur les annonces du relevé suivant
 * (`reposerGardees`), et à l'écran par sa relecture (`relecture.ts`).
 * robots.txt exclut `/ajax/` : lu, journalisé, non bloquant (`robots.ts`).
 */

import type { Listing } from "@/lib/listings";
import { garderLectures, reposerGardees } from "@/lib/stay/contenuFiches.server";
import { CIRCUIT_COOLDOWN_MS } from "@/lib/stay/http429";
import { memoireFiches } from "@/lib/stay/memoireFiches.server";
import { cleListing } from "@/lib/stay/poserReleve";
import { noterBlocage, pauseTauxMs } from "@/lib/stay/taux.server";
import { allowsPath } from "../robots";
import type { LiveSearchInput } from "../types";
import { lieuxDe } from "./couverture";
import { ArretAgence, demander, raisonDe, type OptionsReleve, type ReleveAgence } from "./reseau.server";
import donnees from "./skiPlanet.residences.json" with { type: "json" };
import {
  ENTETES_AJAX,
  SKIPLANET_SITE,
  calendrierIllisible,
  defiAntiRobot,
  lectureDuPanneau,
  lireCalendrier,
  lirePanneau,
  lireSuitePanneaux,
  logementGarde,
  nuitsEntre,
  ordonnerResidences,
  residencesDe,
  skiPlanetListings,
  urlCalendrier,
  urlInfosLogement,
  type CalendrierSkiPlanet,
  type PanneauALire,
  type PanneauLogement,
  type ResidenceSkiPlanet,
  type TableSkiPlanet,
} from "./skiPlanet";

const TABLE = donnees as unknown as TableSkiPlanet;
const HOTE = "skiplanet";
/** Deux calendriers illisibles de suite : c'est le site qui a changé. */
const ECHECS_DE_SUITE = 2;
/** Six heures : assez pour qu'une série de recherches complète la station, pas assez pour vieillir. */
const DUREE_MEMOIRE_MS = 6 * 60 * 60 * 1000;
const MEMOIRE_MAX = 20_000;
/** Une tâche ne dure pas plus : Tignes, 189 résidences et leurs forfaits, tient en dix minutes à ce rythme. */
const TACHE_MAX_MS = 15 * 60 * 1000;
/** La part rend sa réponse un peu avant son échéance. */
const MARGE_PART_MS = 1_500;
/** Ce qu'un calendrier coûte en moyenne, réservation du créneau comprise. */
const CALENDRIER_MS = 2_500;
/** La suite des panneaux : l'écart des fiches lentes Airbnb, bien au-dessus de celui du site. */
const SUITE_ECART_MS = 12_000;
/** Panneaux demandés au plus par une suite, c'est-à-dire par recherche. */
const SUITE_PANNEAUX_MAX = 50;
/** Cinquante panneaux à douze secondes font dix minutes ; la marge couvre l'attente du créneau. */
const SUITE_MAX_MS = 12 * 60_000;
/** Délai d'un panneau, attente du créneau comprise. */
const DELAI_PANNEAU_MS = 15_000;
/** Après un refus ou une réponse qui n'est pas un panneau, plus aucun panneau en tâche de fond pendant une heure. */
const REFUS_PANNEAUX_MS = 60 * 60_000;

type Lu = { a: number; calendrier: CalendrierSkiPlanet };
type Tache = {
  cle: string;
  fin: Promise<void>;
  finie: boolean;
  /** Une autre station a pris la main : on s'arrête après la requête en cours. */
  arret: boolean;
  /** Un refus du site, ou des calendriers illisibles : la lecture s'est arrêtée là. */
  raison?: string;
  echecs: number;
};
const g = globalThis as typeof globalThis & {
  __skitrackCalendriersSkiPlanet__?: Map<string, Lu>;
  __skitrackTacheSkiPlanet__?: Tache;
  __skitrackPhotosSkiPlanet__?: Map<string, PanneauLu>;
  /** La génération des recherches Ski-Planet : une recherche neuve la change, et la suite des panneaux cède. */
  __skitrackGenerationSkiPlanet__?: number;
  /** La suite des panneaux en cours (une seule à la fois) : la suivante attend sa fin. */
  __skitrackSuitePanneauxSkiPlanet__?: Promise<void>;
  /** Le dernier refus d'un panneau en tâche de fond, en ms. */
  __skitrackRefusPanneauxSkiPlanet__?: number;
};
/** Ce que le panneau d'un logement a donné : ses photos, sa description. */
type PanneauLu = { a: number; photos: string[]; description: string | null };
/** Les photos d'un logement changent peu : une semaine. */
const DUREE_PHOTOS_MS = 7 * 24 * 60 * 60 * 1000;

/** Les photos lues sur le panneau de chaque logement (`infos-logement.php`), pour le processus. */
function memoirePhotos(): Map<string, PanneauLu> {
  return (g.__skitrackPhotosSkiPlanet__ ??= new Map());
}

/** Les photos connues d'un logement, `null` s'il n'a pas été lu (ou plus depuis une semaine). */
function photosConnues(idLogement: string, now = Date.now()): string[] | null {
  const e = memoirePhotos().get(idLogement);
  if (!e || now - e.a > DUREE_PHOTOS_MS) return null;
  return e.photos;
}

/** La description lue sur le même panneau, `null` s'il n'a pas été lu (ou plus depuis une semaine). */
function descriptionConnue(idLogement: string, now = Date.now()): string | null {
  const e = memoirePhotos().get(idLogement);
  if (!e || now - e.a > DUREE_PHOTOS_MS) return null;
  return e.description;
}

/** La clé d'un logement dans les mémoires des fiches (`cleListing`) : celle de ses annonces, seul ou forfaits compris. */
function cleLogement(idLogement: string): string | null {
  return cleListing({ source: "Ski-Planet", platformId: idLogement, capacity: null, bedrooms: null, lat: null, lon: null, proven: "" });
}

/** Un panneau lu il y a moins de trente jours, plein ou vide, ne se relit pas. */
function panneauNote(idLogement: string): boolean {
  try {
    return memoireFiches().lire(cleLogement(idLogement))?.lue === true;
  } catch {
    return false;
  }
}

/** Un panneau déjà lu : dans le processus (une semaine), ou noté (trente jours). */
function panneauConnu(idLogement: string): boolean {
  return photosConnues(idLogement) != null || panneauNote(idLogement);
}

/**
 * Garde ce qu'un panneau publie : pour le processus (les annonces des relevés
 * suivants), et trente jours sur disque (`garderLectures`), avec la note
 * qu'il a été lu. Un disque refusé ne coupe rien.
 */
function garderPanneau(l: PanneauALire, p: PanneauLogement): void {
  memoirePhotos().set(l.id, { a: Date.now(), photos: p.photos, description: p.description });
  const cle = cleLogement(l.id);
  garderLectures([{ cle, ...lectureDuPanneau(p) }]);
  try {
    if (cle) memoireFiches().noter([{ cle, lue: true }]);
  } catch (err) {
    console.warn("[ski-planet] panneau non noté :", (err as Error).message);
  }
}

/** Les logements vendus des résidences sans photo dans la table, dont le panneau n'est pas lu. */
function logementsSansPhoto(input: LiveSearchInput, residences: readonly ResidenceSkiPlanet[]): PanneauALire[] {
  const vus = new Map<string, PanneauALire>();
  for (const r of residences) {
    if (r.photo) continue;
    for (const forfait of [false, true]) {
      for (const l of relire(cle(r.id, input, forfait))?.logements ?? []) {
        if (logementGarde(l) && !vus.has(l.id) && !panneauConnu(l.id)) vus.set(l.id, { id: l.id });
      }
    }
  }
  return [...vus.values()];
}

/** Les calendriers lus, pour le processus : le module se réévalue en développement. */
function memoire(): Map<string, Lu> {
  return (g.__skitrackCalendriersSkiPlanet__ ??= new Map());
}

function cle(id: string, input: LiveSearchInput, forfait: boolean): string {
  return `${id}|${input.checkIn}|${input.checkOut}|${forfait ? "forfait" : "seul"}`;
}

function cleStation(input: LiveSearchInput): string {
  return `${input.stationId}|${input.checkIn}|${input.checkOut}`;
}

function relire(k: string, now = Date.now()): CalendrierSkiPlanet | null {
  const e = memoire().get(k);
  if (!e) return null;
  if (now - e.a > DUREE_MEMOIRE_MS) {
    memoire().delete(k);
    return null;
  }
  return e.calendrier;
}

function garder(k: string, calendrier: CalendrierSkiPlanet): void {
  const m = memoire();
  m.delete(k);
  m.set(k, { a: Date.now(), calendrier });
  if (m.size <= MEMOIRE_MAX) return;
  // Les plus anciens d'abord : une `Map` garde l'ordre d'insertion.
  for (const k2 of m.keys()) {
    if (m.size <= MEMOIRE_MAX * 0.75) break;
    m.delete(k2);
  }
}

/** Un arrêt de notre fait (échéance, limiteur local), et non un refus du site ni un défi. */
function arretDeTemps(err: unknown): boolean {
  return err instanceof ArretAgence && !/HTTP \d{3}|défi/.test(err.message);
}

function pluriel(n: number, mot: string): string {
  return `${n} ${mot}${n > 1 ? "s" : ""}`;
}

const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/** La résidence vend un logement au groupe et propose le forfait avec. */
function proposeForfait(r: ResidenceSkiPlanet, input: LiveSearchInput): boolean {
  const s = relire(cle(r.id, input, false));
  if (!s?.forfaitPropose) return false;
  const voyageurs = Math.max(1, Math.trunc(input.guests));
  return s.logements.some((l) => logementGarde(l) && (l.capacite == null || l.capacite >= voyageurs));
}

/** Lit les calendriers qui manquent, l'hébergement seul d'abord, puis les forfaits. */
async function lireStation(tache: Tache, input: LiveSearchInput, residences: readonly ResidenceSkiPlanet[]): Promise<void> {
  const echeance = Date.now() + TACHE_MAX_MS;
  let suite = 0;
  /** `false` : la lecture s'arrête là. */
  const lire = async (r: ResidenceSkiPlanet, forfait: boolean): Promise<boolean> => {
    try {
      const res = await demander({ hote: HOTE, url: urlCalendrier(r.id, input, forfait), echeance, entetes: { ...ENTETES_AJAX } });
      if (calendrierIllisible(res.texte)) throw new Error("calendrier illisible");
      garder(cle(r.id, input, forfait), lireCalendrier(res.texte));
      suite = 0;
      return true;
    } catch (err) {
      if (err instanceof ArretAgence) {
        if (!arretDeTemps(err)) tache.raison = raisonDe(err);
        return false;
      }
      tache.echecs++;
      if (++suite >= ECHECS_DE_SUITE) {
        tache.raison = `${suite} calendriers illisibles de suite : ${raisonDe(err)}`;
        return false;
      }
      return true;
    }
  };
  for (const r of residences) {
    if (tache.arret) return;
    if (relire(cle(r.id, input, false))) continue;
    if (!(await lire(r, false))) return;
  }
  // Les photos des logements dont la résidence n'en a pas (table) : le
  // panneau de chaque logement, avant les forfaits, au même rythme.
  if (!(await lirePhotos(tache, input, residences, echeance))) return;
  for (const r of residences) {
    if (tache.arret) return;
    if (!proposeForfait(r, input) || relire(cle(r.id, input, true))) continue;
    if (!(await lire(r, true))) return;
  }
  // Les logements que seuls les forfaits ont montrés.
  await lirePhotos(tache, input, residences, echeance);
}

/**
 * Le panneau lu, ou une erreur. Un défi servi en 200 pose la pause du site,
 * comme un refus, et arrête la lecture ; une autre réponse qui n'est pas un
 * panneau est une panne, qui ne se note pas comme un panneau vide.
 */
function panneauDe(id: string, texte: string): PanneauLogement {
  const p = lirePanneau(texte);
  if (p) return p;
  if (defiAntiRobot(texte)) {
    noterBlocage(HOTE, CIRCUIT_COOLDOWN_MS);
    throw new ArretAgence(`panneau ${id} : défi anti-robot — pause ${Math.round(CIRCUIT_COOLDOWN_MS / 1000)} s`);
  }
  throw new Error(`panneau ${id} : la réponse n'est pas un panneau`);
}

/** Lit le panneau des logements sans photo. `false` : la lecture s'arrête là. */
async function lirePhotos(tache: Tache, input: LiveSearchInput, residences: readonly ResidenceSkiPlanet[], echeance: number): Promise<boolean> {
  let suite = 0;
  for (const l of logementsSansPhoto(input, residences)) {
    if (tache.arret) return false;
    try {
      const res = await demander({ hote: HOTE, url: urlInfosLogement(l.id), echeance, entetes: { ...ENTETES_AJAX } });
      // Un panneau sans photo se note aussi : il ne se relit pas à chaque relevé.
      garderPanneau(l, panneauDe(l.id, res.texte));
      suite = 0;
    } catch (err) {
      if (err instanceof ArretAgence) {
        if (!arretDeTemps(err)) tache.raison = raisonDe(err);
        return false;
      }
      tache.echecs++;
      if (++suite >= ECHECS_DE_SUITE) {
        tache.raison = `${suite} panneaux de logement illisibles de suite : ${raisonDe(err)}`;
        return false;
      }
    }
  }
  return true;
}

/** La tâche de la station : celle en cours si c'est la même, sinon une nouvelle, qui arrête l'autre. */
function tacheDe(input: LiveSearchInput, residences: readonly ResidenceSkiPlanet[]): Tache {
  const k = cleStation(input);
  const courante = g.__skitrackTacheSkiPlanet__;
  if (courante && courante.cle === k && !courante.finie) return courante;
  if (courante && !courante.finie) courante.arret = true;
  const tache: Tache = { cle: k, fin: Promise.resolve(), finie: false, arret: false, echecs: 0 };
  tache.fin = lireStation(tache, input, residences)
    .catch((err: unknown) => {
      tache.raison = raisonDe(err);
    })
    .finally(() => {
      tache.finie = true;
    });
  g.__skitrackTacheSkiPlanet__ = tache;
  return tache;
}

/** Les annonces des calendriers lus, dans l'ordre des résidences, sans doublon, et ce qu'on en sait. */
function annoncesLues(input: LiveSearchInput, residences: readonly ResidenceSkiPlanet[]) {
  const vus = new Set<string>();
  const listings: Listing[] = [];
  let connues = 0;
  let aForfait = 0;
  let forfaitsLus = 0;
  for (const r of residences) {
    const s = relire(cle(r.id, input, false));
    const f = relire(cle(r.id, input, true));
    if (s) connues++;
    if (proposeForfait(r, input)) {
      aForfait++;
      if (f) forfaitsLus++;
    }
    // Du calendrier forfaits compris, seules les offres qui le sont.
    const lot = [
      ...(s ? skiPlanetListings(r, s, input, null, photosConnues, descriptionConnue) : []),
      ...(f ? skiPlanetListings(r, f, input, s, photosConnues, descriptionConnue).filter((l) => l.skiPassIncluded === true) : []),
    ];
    for (const l of lot) {
      if (vus.has(l.id)) continue;
      vus.add(l.id);
      listings.push(l);
    }
  }
  return { listings, connues, aForfait, forfaitsLus };
}

/** Les logements dont une annonce n'a pas de description, une fois chacun, ceux des résidences placées d'abord. */
function panneauxALire(listings: readonly Listing[]): PanneauALire[] {
  const vus = new Map<string, PanneauALire>();
  for (const l of listings) {
    const id = l.platformId;
    if (!id || l.description || vus.has(id)) continue;
    vus.set(id, { id });
  }
  return [...vus.values()];
}

/** Un panneau a été refusé il y a moins d'une heure. */
function refusRecent(now = Date.now()): boolean {
  const a = g.__skitrackRefusPanneauxSkiPlanet__;
  return a != null && now - a < REFUS_PANNEAUX_MS;
}

/**
 * Les panneaux des logements sans description, en tâche de fond, sur le
 * modèle des fiches lentes Airbnb, une fois la tâche de la station finie :
 * un à la fois, douze secondes après le précédent (`SUITE_ECART_MS`), au plus
 * `SUITE_PANNEAUX_MAX` panneaux ou `SUITE_MAX_MS`. Elle cède dès qu'une
 * nouvelle recherche Ski-Planet part (génération), et s'arrête sans nouvel
 * essai sur la première panne, sur un refus (403, 429, 503 : pause du site
 * posée par `demander`) ou sur une réponse qui n'est pas un panneau (un défi
 * servi en 200 pose la même pause) : plus aucun panneau pendant une heure.
 * Une seule suite à la fois : la suivante attend la fin de la précédente,
 * qui cède. Chaque panneau lu se garde aussitôt (`garderPanneau`) ; l'écran
 * le pose par sa relecture, sans réseau.
 */
function lancerSuitePanneaux(input: LiveSearchInput, residences: readonly ResidenceSkiPlanet[], gen: number): void {
  const cede = () => g.__skitrackGenerationSkiPlanet__ !== gen;
  const precedente = g.__skitrackSuitePanneauxSkiPlanet__ ?? Promise.resolve();
  const suite = precedente.then(async () => {
    if (cede() || refusRecent()) return;
    const logements = panneauxALire(annoncesLues(input, residences).listings).filter((l) => !panneauConnu(l.id));
    if (logements.length === 0) return;
    await allowsPath(SKIPLANET_SITE, "/fr/ajax/infos-logement.php");
    const debut = Date.now();
    const r = await lireSuitePanneaux(
      logements,
      {
        dejaLu: (l) => panneauConnu(l.id),
        arret: () =>
          cede()
            ? "une nouvelle recherche est partie"
            : refusRecent()
              ? "le site a refusé un panneau il y a moins d'une heure"
              : pauseTauxMs(HOTE) > 0
                ? "pause après un refus"
                : Date.now() - debut > SUITE_MAX_MS
                  ? `${SUITE_MAX_MS / 60_000} min atteintes`
                  : null,
        lire: async (l) => {
          // Une recherche plus récente, ou une pause, pendant l'attente : rien ne part.
          await dormir(SUITE_ECART_MS);
          if (cede() || pauseTauxMs(HOTE) > 0) return null;
          const res = await demander({ hote: HOTE, url: urlInfosLogement(l.id), echeance: Date.now() + DELAI_PANNEAU_MS, entetes: { ...ENTETES_AJAX } });
          return res.texte;
        },
        garder: garderPanneau,
      },
      SUITE_PANNEAUX_MAX,
    );
    // Un défi servi en 200 vaut un refus : la pause du site, comme `demander` la pose pour un 403.
    if (r.defi) noterBlocage(HOTE, CIRCUIT_COOLDOWN_MS);
    const refus = r.defi || (r.erreur != null && /HTTP (?:403|429|503)\b/.test(r.erreur)) || (r.arret != null && /n'est pas un panneau/.test(r.arret));
    if (refus) g.__skitrackRefusPanneauxSkiPlanet__ = Date.now();
    console.info(
      `[ski-planet] ${input.stationName} : panneaux en tâche de fond, ${r.lus} lu(s) sur ${r.demandes} demandé(s)` +
        `${r.arret ? `, arrêtée : ${r.arret}` : ""}`,
    );
  });
  g.__skitrackSuitePanneauxSkiPlanet__ = suite.catch((e: unknown) => {
    console.warn(`[ski-planet] panneaux en tâche de fond : ${raisonDe(e)}`);
  });
}

export async function releverSkiPlanet(input: LiveSearchInput, opts: OptionsReleve): Promise<ReleveAgence> {
  // Toute recherche Ski-Planet fait céder la suite des panneaux en cours.
  const gen = (g.__skitrackGenerationSkiPlanet__ = (g.__skitrackGenerationSkiPlanet__ ?? 0) + 1);
  const residences = ordonnerResidences(residencesDe(TABLE, lieuxDe("Ski-Planet", input.stationId)));
  if (!residences.length) return { listings: [] };
  try {
    nuitsEntre(input.checkIn, input.checkOut);
  } catch (err) {
    return { listings: [], raison: raisonDe(err) };
  }
  await allowsPath(SKIPLANET_SITE, "/fr/ajax/calendrier-residence.php");

  const tache = tacheDe(input, residences);
  // La part attend la tâche jusqu'à son échéance, puis rend ce qui est lu.
  await Promise.race([tache.fin, dormir(Math.max(0, opts.echeance - MARGE_PART_MS - Date.now()))]);
  // La tâche finie, sans refus : les panneaux des logements sans description, lentement.
  void tache.fin.then(() => {
    if (!tache.raison) lancerSuitePanneaux(input, residences, gen);
  });

  const { listings, connues, aForfait, forfaitsLus } = annoncesLues(input, residences);
  // Ce que les panneaux lus avant ont donné, gardé trente jours : sans réseau.
  reposerGardees(listings);

  const restantes = residences.length - connues + (aForfait - forfaitsLus);
  const minutes = Math.max(1, Math.ceil((restantes * CALENDRIER_MS) / 60_000));
  const sansPosition = listings.filter((l) => l.lat == null || l.lon == null).length;
  const sansDescription = listings.filter((l) => !l.description).length;
  const notes = [
    `${connues} résidences lues sur ${residences.length}`,
    restantes && !tache.finie ? `la lecture continue (encore ${pluriel(minutes, "minute")} environ)` : null,
    restantes && tache.finie && !tache.raison ? `${restantes} laissées au relevé suivant` : null,
    aForfait ? `forfaits lus pour ${forfaitsLus} sur ${aForfait}` : null,
    tache.echecs ? `${pluriel(tache.echecs, "calendrier")} en échec` : null,
    sansPosition ? `${pluriel(sansPosition, "annonce")} sans position` : null,
    sansDescription ? `${pluriel(sansDescription, "annonce")} sans description (panneau lu ensuite, en tâche de fond)` : null,
  ].filter(Boolean);
  return {
    listings,
    // Le site ne publie pas de compte pour une station.
    annoncees: null,
    note: notes.join(", "),
    ...(tache.raison ? { raison: tache.raison } : {}),
  };
}
