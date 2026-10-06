/**
 * Relevé Ski-Planet (voir `skiPlanet.ts`) : le calendrier de chaque résidence
 * de la station, un par requête, au rythme du site (`stay/taux.server.ts` :
 * une par seconde, quarante par minute) ; puis, pour les résidences qui
 * vendent un logement au groupe, le même calendrier forfaits compris.
 *
 * Aucun appel du site ne rend toutes les résidences d'une station : il en
 * faut un par résidence (31 à Avoriaz, 189 à Tignes), et une part de 40 s
 * n'en permet qu'une trentaine. La lecture d'une station, pour des dates,
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
 */

import type { Listing } from "@/lib/listings";
import { allowsPath } from "../robots";
import type { LiveSearchInput } from "../types";
import { lieuxDe } from "./couverture";
import { ArretAgence, demander, raisonDe, type OptionsReleve, type ReleveAgence } from "./reseau.server";
import donnees from "./skiPlanet.residences.json" with { type: "json" };
import {
  ENTETES_AJAX,
  SKIPLANET_SITE,
  calendrierIllisible,
  lireCalendrier,
  lireDescriptionLogement,
  lirePhotosLogement,
  logementGarde,
  nuitsEntre,
  ordonnerResidences,
  residencesDe,
  skiPlanetListings,
  urlCalendrier,
  urlInfosLogement,
  type CalendrierSkiPlanet,
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
const CALENDRIER_MS = 1_500;

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

/** Les logements vendus des résidences sans photo dans la table, dont le panneau n'est pas lu. */
function logementsSansPhoto(input: LiveSearchInput, residences: readonly ResidenceSkiPlanet[]): string[] {
  const ids = new Set<string>();
  for (const r of residences) {
    if (r.photo) continue;
    for (const forfait of [false, true]) {
      for (const l of relire(cle(r.id, input, forfait))?.logements ?? []) {
        if (logementGarde(l) && photosConnues(l.id) == null) ids.add(l.id);
      }
    }
  }
  return [...ids];
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

/** Un arrêt de notre fait (échéance, limiteur local), et non un refus du site. */
function arretDeTemps(err: unknown): boolean {
  return err instanceof ArretAgence && !/HTTP \d{3}/.test(err.message);
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

/** Lit le panneau des logements sans photo. `false` : la lecture s'arrête là. */
async function lirePhotos(tache: Tache, input: LiveSearchInput, residences: readonly ResidenceSkiPlanet[], echeance: number): Promise<boolean> {
  let suite = 0;
  for (const id of logementsSansPhoto(input, residences)) {
    if (tache.arret) return false;
    try {
      const res = await demander({ hote: HOTE, url: urlInfosLogement(id), echeance, entetes: { ...ENTETES_AJAX } });
      // Un panneau sans photo se note aussi : il ne se relit pas à chaque relevé.
      memoirePhotos().set(id, {
        a: Date.now(),
        photos: lirePhotosLogement(res.texte),
        description: lireDescriptionLogement(res.texte),
      });
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

export async function releverSkiPlanet(input: LiveSearchInput, opts: OptionsReleve): Promise<ReleveAgence> {
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

  const restantes = residences.length - connues + (aForfait - forfaitsLus);
  const minutes = Math.max(1, Math.ceil((restantes * CALENDRIER_MS) / 60_000));
  const sansPosition = listings.filter((l) => l.lat == null || l.lon == null).length;
  const notes = [
    `${connues} résidences lues sur ${residences.length}`,
    restantes && !tache.finie ? `la lecture continue (encore ${pluriel(minutes, "minute")} environ)` : null,
    restantes && tache.finie && !tache.raison ? `${restantes} laissées au relevé suivant` : null,
    aForfait ? `forfaits lus pour ${forfaitsLus} sur ${aForfait}` : null,
    tache.echecs ? `${pluriel(tache.echecs, "calendrier")} en échec` : null,
    sansPosition ? `${pluriel(sansPosition, "annonce")} sans position` : null,
  ].filter(Boolean);
  return {
    listings,
    // Le site ne publie pas de compte pour une station.
    annoncees: null,
    note: notes.join(", "),
    ...(tache.raison ? { raison: tache.raison } : {}),
  };
}
