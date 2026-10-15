/**
 * Fiches Booking, une par une, en tâche de fond : l'échelonnement d'Airbnb
 * (`scrape/airbnbSuite.server.ts`) appliqué à Booking.
 *
 * 1. Ce que la recherche publie d'abord (tuiles Cozy, pages de la suite) se
 *    lit tout de suite. La fiche, elle, ne se lisait qu'en passant, sur la
 *    page ouverte pour un GPS manquant (`bookingGps.server.ts`) ; or Cozy et
 *    les tuiles publient presque toujours le point : les annonces Booking
 *    restaient sans fiche, donc sans équipements.
 * 2. Après la réponse et la suite de pages, on lit la page de chaque annonce
 *    qui n'a pas encore de fiche : une à la fois, `PAUSE_FICHE_MS` entre deux
 *    en plus de l'écart du limiteur « booking » (`taux.server.ts`, que le
 *    relevé respecte avant chaque page), `FICHES_MAX` au plus par recherche.
 *    Au premier défi (202) ou refus (403, 429, 503), on s'arrête, sans rien
 *    réessayer ; un robots.txt qui ne permet pas la page arrête aussi. Une
 *    recherche plus récente fait céder (`stop`).
 * 3. Ce qui est lu se garde trente jours (`garderLectures`). Une page lue qui
 *    ne donne pas de fiche est notée lue (`lue`) ; une page tentée ne se
 *    redemande pas dans le processus (`pageTentee`).
 * 4. L'écran le pose sans réseau : sa relecture (`relecture.ts`,
 *    `ficheBookingAPoser`) passe par `reposerGardees`.
 *
 * Aucun accès réseau ici : la page s'ouvre par `lire`, que le relevé fournit
 * (navigateur, robots.txt, cadence, refus : `src/lib/scrape/`). Ici, le choix
 * des pages, l'ordre, les arrêts et la mémoire.
 */

import type { Listing } from "../listings.ts";
import { dejaGardee, garderLectures } from "./contenuFiches.server.ts";
import type { FicheEnrichie } from "./ficheEnrichie.ts";
import { memoireFiches } from "./memoireFiches.server.ts";
import { cleListing } from "./poserReleve.ts";

/** Au plus tant de pages par recherche : le reste attend une recherche suivante. */
export const FICHES_MAX = 100;
/** Entre deux pages, en plus de l'écart du limiteur « booking ». */
export const PAUSE_FICHE_MS = 12_000;
/** Une lecture de fond ne dure pas plus ; ce qui reste attend la recherche suivante. */
export const DUREE_MAX_MS = 45 * 60_000;
/**
 * Pages lues en 200 de suite sans fiche : la page ne se lit plus (balisage
 * changé, coquille sans contenu). Même seuil que les fiches Airbnb.
 */
export const VIDES_DE_SUITE_MAX = 4;
/** Pages de suite sans réponse (délai, onglet fermé) : on n'insiste pas. */
export const ECHECS_DE_SUITE_MAX = 3;
/** Le limiteur local tient le créneau : on attend, deux fois au plus pour une même page. */
const ATTENTES_MAX = 2;
const ATTENTE_MS = 8_000;

/** Ce que le relevé rend d'une page ouverte pour sa fiche. */
export type PageBooking = {
  /** Statut HTTP de la page ; `null` : rien n'a répondu (délai, onglet fermé). */
  statut: number | null;
  /** La fiche que la page donne (`ficheDepuisPageBooking`), s'il y en a une. */
  fiche?: FicheEnrichie;
  /** robots.txt ne permet pas ce chemin, ou ne se lit pas : la règle. Rien n'est parti. */
  interdit?: string;
  /** Le limiteur local ou une pause de refus tient le créneau. Rien n'est parti. */
  attente?: string;
};

/** Ce que le relevé fournit : l'adresse d'une page, sa lecture, et quand s'arrêter. */
export type PorteFichesBooking = {
  /** La page établissement de l'annonce (`hotelPageUrl`), ou `null`. */
  page: (row: Listing) => string | null;
  /** Ouvre la page et en lit la fiche. */
  lire: (row: Listing, url: string) => Promise<PageBooking>;
  /** Une recherche plus récente tient Booking : on lui laisse la place. */
  stop: () => boolean;
  /** La pause d'un refus en cours sur Booking (`porteFermee`), ou `null`. */
  fermee: () => string | null;
  dormir?: (ms: number) => Promise<void>;
  maintenant?: () => number;
};

/**
 * `ok` : fini, ou arrêté sans refus (plafond, durée, pages illisibles) ;
 * `defi` : un 202 ; `refus` : 403, 429, 503 ou une pause de refus ;
 * `robots` : robots.txt ne permet pas la page ; `laisse` : une recherche plus
 * récente a pris la place.
 */
export type IssueFichesBooking = "ok" | "defi" | "refus" | "robots" | "laisse";

/**
 * Les pages établissement déjà tentées (adresse), pour tout le processus :
 * lues, pleines ou vides, ou refusées. Aucune ne repart avant un redémarrage ;
 * une page lue reste ensuite trente jours dans la mémoire.
 */
const tentees = new Set<string>();
const TENTEES_MAX = 20_000;

/** Note une page ouverte (une réponse est revenue) : elle ne se redemande pas. */
export function noterPageTentee(url: string | null | undefined): void {
  if (!url) return;
  tentees.delete(url);
  tentees.add(url);
  if (tentees.size <= TENTEES_MAX) return;
  for (const u of tentees) {
    if (tentees.size <= TENTEES_MAX * 0.75) break;
    tentees.delete(u);
  }
}

export function pageTentee(url: string | null | undefined): boolean {
  return url != null && tentees.has(url);
}

/** Pour les essais : oublie les pages tentées. */
export function oublierPagesTentees(): void {
  tentees.clear();
}

/** Une fiche lue : présente, et pas `indisponible` (rien n'en a été lu). */
function ficheLue(f: FicheEnrichie | null | undefined): f is FicheEnrichie {
  return f != null && f.indisponible !== true;
}

/**
 * Sa fiche est gardée, ou sa page a été lue sans en donner une, il y a moins
 * de trente jours : elle ne se redemande pas. Une mémoire illisible ne dit
 * rien de lu : la page reste à lire.
 */
function dejaLue(cle: string): boolean {
  if (dejaGardee(cle)) return true;
  try {
    return memoireFiches().lire(cle)?.lue === true;
  } catch {
    return false;
  }
}

export type CibleBooking = { row: Listing; url: string; cle: string };

/**
 * Les pages à lire, dans l'ordre des annonces (le relevé les range du moins
 * cher au plus cher), `FICHES_MAX` au plus : une annonce Booking de logement
 * entier (un hôtel ou une chambre n'a pas de fiche, `ficheDepuisPageBooking`),
 * sans fiche lue, dont la page n'est ni gardée, ni lue, ni tentée. Une page
 * portée par deux annonces ne se lit qu'une fois. Aucune requête.
 */
export function fichesALire(rows: readonly Listing[], page: (row: Listing) => string | null): CibleBooking[] {
  const out: CibleBooking[] = [];
  const vues = new Set<string>();
  for (const row of rows) {
    if (out.length >= FICHES_MAX) break;
    if (row.source !== "Booking" || ficheLue(row.fiche)) continue;
    if (row.lodgingType === "hotel" || row.lodgingType === "chambre") continue;
    const url = page(row);
    const cle = cleListing(row);
    if (!url || !cle || vues.has(url)) continue;
    vues.add(url);
    if (pageTentee(url) || dejaLue(cle)) continue;
    out.push({ row, url, cle });
  }
  return out;
}

function dormirPar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function noterLues(notes: readonly { cle: string; lue: true }[]): void {
  if (notes.length === 0) return;
  try {
    memoireFiches().noter(notes);
  } catch (err) {
    // Perdue, la page se relira à la recherche suivante.
    console.warn("[booking] pages lues non gardées :", (err as Error).message);
  }
}

/**
 * Lit, une à une, la fiche des annonces Booking qui n'en ont pas
 * (`fichesALire`), et la garde trente jours. Voir l'en-tête du module.
 */
export async function lireFichesBookingLentes(
  rows: readonly Listing[],
  porte: PorteFichesBooking,
): Promise<IssueFichesBooking> {
  const dormir = porte.dormir ?? dormirPar;
  const maintenant = porte.maintenant ?? Date.now;
  const fin = maintenant() + DUREE_MAX_MS;
  const cibles = fichesALire(rows, porte.page);
  if (cibles.length === 0) return "ok";
  /** Pages parties (une réponse ou non) : la pause sépare chacune de la suivante. */
  let parties = 0;
  let ouvertes = 0;
  let gardees = 0;
  let videsDeSuite = 0;
  let echecsDeSuite = 0;
  // Les pages vides d'une série en cours ne se notent qu'une fois une fiche
  // revenue : une série qui finit illisible n'est pas une suite de pages
  // sans fiche, et une recherche suivante doit pouvoir les relire.
  let videsEnAttente: { cle: string; lue: true }[] = [];
  const bilan = (issue: IssueFichesBooking, raison?: string): IssueFichesBooking => {
    if (ouvertes || issue !== "ok") {
      console.info(
        `[booking] fiches lentes : ${ouvertes} page(s) ouverte(s), ${gardees} fiche(s) gardée(s), ${cibles.length} demandée(s)` +
          (raison ? ` — arrêt : ${raison}` : ""),
      );
    }
    return issue;
  };
  for (const { row, url, cle } of cibles) {
    if (porte.stop()) return bilan("laisse", "recherche plus récente");
    if (maintenant() >= fin) break;
    const ferme = porte.fermee();
    if (ferme) return bilan("refus", ferme);
    // Gardée ou tentée depuis le choix (le GPS d'une recherche suivante) : rien à relire.
    if (pageTentee(url) || dejaLue(cle)) continue;
    if (parties > 0) {
      await dormir(PAUSE_FICHE_MS);
      if (porte.stop()) return bilan("laisse", "recherche plus récente");
    }
    let lu: PageBooking;
    let attentes = 0;
    for (;;) {
      lu = await porte.lire(row, url);
      if (!lu.attente) break;
      // Rien n'est parti : le créneau du limiteur, ou la pause d'un refus.
      const fermeeDepuis = porte.fermee();
      if (fermeeDepuis) return bilan("refus", fermeeDepuis);
      attentes += 1;
      if (attentes > ATTENTES_MAX) return bilan("ok", lu.attente);
      await dormir(ATTENTE_MS);
      if (porte.stop()) return bilan("laisse", "recherche plus récente");
    }
    if (lu.interdit) return bilan("robots", `robots.txt (${lu.interdit})`);
    parties += 1;
    if (lu.statut == null) {
      // Partie, sans réponse : elle a eu sa chance pour ce processus.
      noterPageTentee(url);
      echecsDeSuite += 1;
      if (echecsDeSuite >= ECHECS_DE_SUITE_MAX) return bilan("ok", "pages sans réponse");
      continue;
    }
    echecsDeSuite = 0;
    noterPageTentee(url);
    ouvertes += 1;
    if (lu.statut === 202) return bilan("defi", "défi (HTTP 202)");
    if (lu.statut === 403 || lu.statut === 429 || lu.statut === 503) return bilan("refus", `HTTP ${lu.statut}`);
    // 404, 410 : page retirée. Tentée, rien à garder.
    if (lu.statut !== 200) continue;
    if (ficheLue(lu.fiche)) {
      gardees += garderLectures([{ cle, fiche: lu.fiche }]);
      noterLues(videsEnAttente);
      videsEnAttente = [];
      videsDeSuite = 0;
      continue;
    }
    videsDeSuite += 1;
    videsEnAttente.push({ cle, lue: true });
    if (videsDeSuite >= VIDES_DE_SUITE_MAX) return bilan("ok", "pages sans fiche lisible");
  }
  // Une série de moins de quatre en fin de liste : des pages sans fiche ordinaires.
  noterLues(videsEnAttente);
  return bilan("ok");
}
