/**
 * Relevé Travelski (voir `travelski.ts`) : la recherche de l'API pour le lieu
 * du catalogue rattaché à la station, cent résidences par page ; puis, pour
 * chaque résidence, ce que la recherche ne dit pas :
 *
 * - sa fiche, quand la position manque : position, chambres et pièces ne sont
 *   que là (340 à 435 Ko), et ne changent pas avec les dates. Lues une fois,
 *   elles vont dans la mémoire des fiches de l'application
 *   (`stay/memoireFiches.server.ts`, trente jours) ;
 * - le prix du groupe des formules forfait compris (`/wiyp/price`, l'appel
 *   que la page de résultats fait elle-même), quand le groupe ne remplit pas
 *   le logement : la recherche ne publie que le prix de la capacité pleine.
 *
 * Ces lectures tournent dans une tâche de fond par station, comme celle de
 * Ski-Planet : la part rend ce qui est lu à son échéance, la tâche continue,
 * et la recherche suivante sur la même station et les mêmes dates reprend ce
 * qu'elle a lu. Une annonce forfait compris dont le prix du groupe n'est pas
 * encore lu reste à 0, et la note le dit.
 */

import { createHash } from "node:crypto";
import type { Listing } from "@/lib/listings";
import { contenuFiches } from "@/lib/stay/contenuFiches.server";
import { comblerDepuisMemoire, memoireFiches } from "@/lib/stay/memoireFiches.server";
import { cleListing } from "@/lib/stay/poserReleve";
import { allowsPath } from "../robots";
import type { LiveSearchInput } from "../types";
import { lieuxDe } from "./couverture";
import { ArretAgence, demander, raisonDe, type OptionsReleve, type ReleveAgence } from "./reseau.server";
import {
  cleGroupe,
  corpsRecherche,
  groupesWiyp,
  lieuTravelski,
  contenuTravelski,
  lireFiche,
  lireRecherche,
  offresRetenues,
  reponseWiyp,
  requeteWiyp,
  travelskiListings,
  urlFiche,
  urlRecherche,
  voyageurs,
  PAGES_MAX,
  TRAVELSKI_API,
  type PrixGroupe,
  type ReponseWiyp,
  type ResidenceTravelski,
} from "./travelski";

const HOTE = "travelski";
/** Une tâche ne dure pas plus. */
const TACHE_MAX_MS = 15 * 60 * 1000;
/** La part rend sa réponse un peu avant son échéance. */
const MARGE_PART_MS = 1_500;
/** Un prix de groupe vaut pour six heures : assez pour une série de recherches, pas assez pour vieillir. */
const DUREE_PRIX_MS = 6 * 60 * 60 * 1000;
const PRIX_MAX = 20_000;

type Tache = {
  cle: string;
  fin: Promise<void>;
  finie: boolean;
  /** Une autre station a pris la main : on s'arrête après la requête en cours. */
  arret: boolean;
  /** Un refus du site : la lecture s'est arrêtée là. */
  raison?: string;
  fiches: number;
  prix: number;
};
type PrixLu = { a: number; reponse: ReponseWiyp };
const g = globalThis as typeof globalThis & {
  __skitrackTacheTravelski__?: Tache;
  __skitrackPrixTravelski__?: Map<string, PrixLu>;
};

const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/** Un arrêt de notre fait (échéance, limiteur local), et non un refus du site. */
function arretDeTemps(err: unknown): boolean {
  return err instanceof ArretAgence && !/HTTP \d{3}/.test(err.message);
}

function sansPosition(l: Listing): boolean {
  return l.lat == null || l.lon == null;
}

/** La clé de mémoire d'un logement de la fiche : celle de ses annonces (`cleListing`). */
function cleLogement(id: string): string | null {
  return cleListing({ source: "Travelski", platformId: id, proven: "", capacity: null, bedrooms: null, lat: null, lon: null });
}

function cleStation(input: LiveSearchInput): string {
  return `${input.stationId}|${input.checkIn}|${input.checkOut}|${voyageurs(input)}`;
}

/* ---------- Prix de groupe lus ---------- */

function prixLus(): Map<string, PrixLu> {
  return (g.__skitrackPrixTravelski__ ??= new Map());
}

function clePrix(r: ResidenceTravelski, groupe: string, input: LiveSearchInput): string {
  return `${r.liheId}|${groupe}|${input.checkIn}|${input.checkOut}|${voyageurs(input)}`;
}

function relirePrix(k: string, now = Date.now()): ReponseWiyp | null {
  const e = prixLus().get(k);
  if (!e) return null;
  if (now - e.a > DUREE_PRIX_MS) {
    prixLus().delete(k);
    return null;
  }
  return e.reponse;
}

function garderPrix(k: string, reponse: ReponseWiyp): void {
  const m = prixLus();
  m.delete(k);
  m.set(k, { a: Date.now(), reponse });
  if (m.size <= PRIX_MAX) return;
  for (const k2 of m.keys()) {
    if (m.size <= PRIX_MAX * 0.75) break;
    m.delete(k2);
  }
}

/** Les prix de groupe déjà lus pour une résidence. */
function groupeDe(r: ResidenceTravelski, input: LiveSearchInput): PrixGroupe {
  const out = new Map<string, ReponseWiyp>();
  for (const offres of groupesWiyp(r, input)) {
    const k = cleGroupe(offres[0]!);
    const lu = relirePrix(clePrix(r, k, input));
    if (lu) out.set(k, lu);
  }
  return out;
}

/** Les annonces d'une résidence, avec les prix de groupe et la mémoire des fiches. */
function annonces(r: ResidenceTravelski, input: LiveSearchInput): Listing[] {
  const memoire = memoireFiches();
  const contenus = contenuFiches();
  const rows = travelskiListings(r, null, input, groupeDe(r, input));
  for (const row of rows) {
    const m = memoire.lire(cleListing(row));
    if (m) comblerDepuisMemoire(row, m);
    // La description, la galerie et les équipements de la fiche déjà lue.
    const c = contenus.lire(cleListing(row));
    if (c?.description) row.description = c.description;
    if (c?.amenities) row.amenities = c.amenities;
    if (c?.photos?.length) {
      row.photos = [...new Set([...(row.photo ? [row.photo] : []), ...c.photos])];
      row.photo = row.photos[0] ?? null;
    }
  }
  return rows;
}

/* ---------- Tâche de la station ---------- */

/** Lit, résidence par résidence, la fiche qui manque puis les prix de groupe qui manquent. */
async function lireStation(tache: Tache, input: LiveSearchInput, residences: readonly ResidenceTravelski[]): Promise<void> {
  const echeance = Date.now() + TACHE_MAX_MS;
  const memoire = memoireFiches();
  /** `false` : un refus du site ou l'échéance de la tâche, la lecture s'arrête. Une réponse illisible est passée. */
  const essayer = async (lire: () => Promise<void>): Promise<boolean> => {
    try {
      await lire();
      return true;
    } catch (err) {
      if (err instanceof ArretAgence) {
        if (!arretDeTemps(err)) tache.raison = raisonDe(err);
        return false;
      }
      return true;
    }
  };
  for (const r of residences) {
    if (tache.arret) return;
    const lien = urlFiche(r.lien);
    if (lien && annonces(r, input).some(sansPosition)) {
      const suite = await essayer(async () => {
        const res = await demander({ hote: HOTE, url: lien, echeance, entetes: { accept: "text/html,application/xhtml+xml" } });
        const fiche = lireFiche(res.texte);
        if (!fiche) return;
        tache.fiches++;
        memoire.noter(
          [...fiche.logements.values()].map((l) => ({
            cle: cleLogement(l.id),
            capacity: l.capacite,
            bedrooms: l.chambres,
            rooms: l.pieces,
            lat: fiche.lat,
            lon: fiche.lon,
            lue: true,
          })),
        );
        // La fiche n'est lue qu'une fois : ce qu'elle publie de plus se garde.
        contenuFiches().noter(
          [...fiche.logements.keys()].flatMap((id) => {
            const contenu = contenuTravelski(fiche, id);
            return contenu ? [{ cle: cleLogement(id), contenu }] : [];
          }),
        );
      });
      if (!suite) return;
    }
    for (const offres of groupesWiyp(r, input)) {
      if (tache.arret) return;
      const k = clePrix(r, cleGroupe(offres[0]!), input);
      if (relirePrix(k)) continue;
      const url = requeteWiyp(r, offres, input, md5);
      if (!url) continue;
      const suite = await essayer(async () => {
        const res = await demander({ hote: HOTE, url, echeance, entetes: { accept: "application/json" } });
        garderPrix(k, reponseWiyp(offres, JSON.parse(res.texte)));
        tache.prix++;
      });
      if (!suite) return;
    }
  }
}

/** La tâche de la station : celle en cours si c'est la même, sinon une nouvelle, qui arrête l'autre. */
function tacheDe(input: LiveSearchInput, residences: readonly ResidenceTravelski[]): Tache {
  const k = cleStation(input);
  const courante = g.__skitrackTacheTravelski__;
  if (courante && courante.cle === k && !courante.finie) return courante;
  if (courante && !courante.finie) courante.arret = true;
  const tache: Tache = { cle: k, fin: Promise.resolve(), finie: false, arret: false, fiches: 0, prix: 0 };
  tache.fin = lireStation(tache, input, residences)
    .catch((err: unknown) => {
      if (!arretDeTemps(err)) tache.raison = raisonDe(err);
    })
    .finally(() => {
      tache.finie = true;
    });
  g.__skitrackTacheTravelski__ = tache;
  return tache;
}

export async function releverTravelski(input: LiveSearchInput, opts: OptionsReleve): Promise<ReleveAgence> {
  const [brut] = lieuxDe("Travelski", input.stationId);
  if (!brut) return { listings: [] };
  const lieu = lieuTravelski(brut);
  await allowsPath(TRAVELSKI_API, "/se/search/product");
  const residences: ResidenceTravelski[] = [];
  let total: number | null = null;
  let pages = 1;
  let raison: string | undefined;
  for (let page = 0; page < pages; page++) {
    try {
      const res = await demander({
        hote: HOTE,
        url: urlRecherche(page),
        methode: "POST",
        corps: JSON.stringify(corpsRecherche(input, lieu)),
        entetes: { accept: "*/*", "content-type": "application/json" },
        echeance: opts.echeance,
      });
      const r = lireRecherche(JSON.parse(res.texte));
      if (page === 0) {
        total = r.total;
        pages = Math.min(PAGES_MAX, Math.max(1, r.pages ?? 1));
      }
      residences.push(...r.residences);
      if (r.recues === 0) break;
    } catch (err) {
      if (page === 0) throw err;
      raison = `page ${page + 1} : ${raisonDe(err)}`;
      break;
    }
  }

  const retenues = residences.filter((r) => offresRetenues(r, input).length > 0);
  // Le robots.txt de l'API exclut `/wiyp/` : lu et journalisé, la lecture se
  // fait quand même (décision du propriétaire du 30 septembre 2026).
  await allowsPath(TRAVELSKI_API, "/wiyp/price");
  const tache = tacheDe(input, retenues);
  await Promise.race([tache.fin, dormir(Math.max(0, opts.echeance - MARGE_PART_MS - Date.now()))]);

  const listings = retenues.flatMap((r) => annonces(r, input));
  const sans = listings.filter(sansPosition).length;
  const aPrixManquant = listings.filter((l) => l.skiPassIncluded && !(l.total > 0)).length;
  const enRoute = !tache.finie;
  const notes = [
    `${residences.length} résidences${total != null && total > residences.length ? ` sur ${total}` : ""}, ${retenues.length} avec une offre aux dates`,
    `${tache.fiches} fiche${tache.fiches > 1 ? "s" : ""} et ${tache.prix} prix de groupe lus par la tâche de la station`,
    sans ? `${sans} annonces encore sans position` : null,
    aPrixManquant ? `${aPrixManquant} formules forfait compris sans prix du groupe` : null,
    enRoute && (sans || aPrixManquant) ? "la lecture continue" : null,
  ].filter(Boolean);
  const r2 = raison ?? tache.raison;
  return {
    listings,
    // Le compte du site est celui des résidences (`totalProducts`), pas des logements : il va dans la note.
    annoncees: null,
    note: notes.join(", "),
    ...(r2 ? { raison: r2 } : {}),
  };
}
