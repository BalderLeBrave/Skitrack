/**
 * Une tranche de la complétion des relevés de l'écran Prix, côté serveur.
 *
 * La boucle vit dans le navigateur (`releve.ts`) : elle envoie les annonces
 * d'une station à qui il manque la position, la capacité ou les chambres
 * (`aCompleter`), et reçoit ce qui a été trouvé. Chaque appel travaille 45 s
 * au plus, pour que « Arrêter » coupe entre deux tranches et que la boucle
 * relise, entre deux, la recherche de Logements et le créneau Airbnb.
 *
 * Du moins cher au plus cher :
 * 1. `memoire` : la mémoire des fiches (0 requête), et ce que le relevé a de
 *    complet, noté pour la suite ;
 * 2. (recopie entre offres d'un même logement : dans le navigateur, qui a le
 *    relevé entier) ;
 * 3. `tranche` : les pages de fiche hors Airbnb (centrales, Gîtes, Abritel),
 *    à leur rythme par hôte, et les fiches Airbnb par le worker Python
 *    (`lireFichesAirbnb`), les moins chères d'abord ; les deux à la fois,
 *    puisqu'ils ne touchent pas les mêmes hôtes.
 *
 * Rien n'est inventé : seuls les trous se comblent, avec ce qu'une source a
 * publié. Les dépendances (réseau, mémoire, horloge) sont injectées : les
 * essais ne partent jamais sur le réseau.
 */

import type { Listing } from "../listings.ts";
import {
  MAX_FICHES_TRANCHE,
  type ArretFiches,
  type DemandeFichesAirbnb,
  type FicheAirbnb,
  type LectureFichesAirbnb,
} from "../scrape/airbnbFiches.ts";
import { airbnbIdOf } from "../stay/enrichir.ts";
import { comblerDepuisMemoire, type ValeursFiche } from "../stay/memoireFiches.server.ts";
import { cleListing } from "../stay/poserReleve.ts";
import { airbnbSuspendu, manqueFiche, type CandidateFiche, type FicheConnue } from "./calcul.ts";

/** Ce qu'une tranche prend au plus, réponse comprise. */
export const TRANCHE_MS = 45_000;
/** Le temps de rendre la réponse, pris sur la tranche. */
const MARGE_MS = 3_000;

export const MARQUE_MEMOIRE = "mémoire des fiches";
export const MARQUE_AIRBNB = "fiche Airbnb";

export type DemandeTranche = {
  /** `memoire` : aucune requête. `tranche` : pages et fiches Airbnb. */
  mode: "memoire" | "tranche";
  stationId: string;
  checkIn: string;
  checkOut: string;
  /** Le groupe : Airbnb chiffre la fiche pour ce nombre d'adultes. */
  voyageurs: number;
  candidates: readonly CandidateFiche[];
  /** Les annonces complètes du relevé, à noter (première tranche seulement). */
  connues?: readonly FicheConnue[];
  /** Airbnb a refusé plus tôt dans la course : aucune fiche Airbnb. */
  airbnbSuspendu: boolean;
  /** Hôtes qui ont refusé plus tôt dans la course (429, 403, 503), ou n'ont pas répondu. */
  hotesExclus: readonly string[];
  /** Les URL que plusieurs annonces du relevé portent (`urlsCommunesDuReleve`). */
  urlsCommunes: readonly string[];
};

export type RenduTranche = {
  /** Par identifiant d'annonce, les champs trouvés, trace comprise. */
  correctifs: Record<string, Partial<Listing>>;
  /** Airbnb : hôtel, chambre ou hébergement insolite. L'annonce sort du relevé. */
  retires: string[];
  /** Candidates encore à compléter après cette tranche. */
  restantes: number;
  /** Pourquoi les fiches Airbnb se sont arrêtées dans cette tranche, ou `null`. */
  arretAirbnb: ArretFiches | null;
  raison?: string;
  /** `rythme` : ce que le limiteur demande d'attendre. */
  attenteMs?: number;
  /** Fiches ouvertes ou lues (pleines ou vides) : à ne plus demander de la course. */
  essayees: string[];
  /** Jamais ouvertes : aucune fiche, fiche qui ne publie pas ce qui manque, URL commune, hôte laissé. */
  laissees: string[];
  /** Hôtes qui ont refusé dans cette tranche. */
  hotesRefus: string[];
  /** Requêtes réellement parties. */
  lues: number;
};

/** Ce qu'une fiche a publié, pour la mémoire. */
export type LectureCourte = Pick<ValeursFiche, "guests" | "bedrooms" | "rooms" | "lat" | "lon">;

/** Ce qu'une tranche de pages hors Airbnb a fait (`lirePagesProfond`). */
export type PagesProfond = {
  essayees: string[];
  laissees: string[];
  hotesRefus: string[];
  /** Par identifiant, ce que chaque page ouverte publiait. */
  lectures: Record<string, LectureCourte>;
  lues: number;
};

/** Ce qu'une tranche de pages `rooms/` a fait, repli d'un hash PDP périmé. */
export type PagesAirbnbProfond = {
  essayees: string[];
  arret: "refus" | "coupe-circuit" | "rythme" | null;
  attenteMs?: number;
  lectures: Record<string, LectureCourte>;
  lues: number;
};

export type OptionsPages = {
  until: number;
  hotesExclus: readonly string[];
  urlsCommunes: readonly string[];
};

export type Memoire = {
  lire(cle: string | null | undefined, now?: number): ValeursFiche | null;
  noter(
    entrees: ReadonlyArray<{ cle: string | null | undefined } & Partial<ValeursFiche>>,
    now?: number,
  ): number;
};

export type Dependances = {
  lireFichesAirbnb(d: DemandeFichesAirbnb): Promise<LectureFichesAirbnb>;
  /** Lit les pages et comble les annonces reçues (mutées sur place). */
  lirePages(rows: Listing[], opts: OptionsPages): Promise<PagesProfond>;
  /** Les pages `rooms/`, une à une, au moins 6 s d'écart ; comble sur place. */
  lirePagesAirbnb(rows: Listing[], until: number): Promise<PagesAirbnbProfond>;
  /** Les annonces hors Airbnb qu'aucune page ne complétera. */
  laissees(rows: Listing[], opts: Omit<OptionsPages, "until">): string[];
  memoire: Memoire;
  maintenant(): number;
};

function versLigne(c: CandidateFiche, stationId: string): Listing {
  return {
    id: c.id,
    stationId,
    title: c.title,
    source: c.source,
    total: c.total,
    currency: c.currency,
    guests: c.guests,
    bedrooms: c.bedrooms,
    rooms: c.rooms,
    beds: c.beds,
    available: true,
    photo: null,
    url: c.url,
    platformId: c.platformId,
    lat: c.lat,
    lon: c.lon,
    locality: c.locality,
    proven: c.proven,
  };
}

function marquer(row: Listing, marque: string): void {
  if (!row.proven.includes(marque)) row.proven = `${row.proven} · ${marque}`;
}

/**
 * Les champs qu'une tranche peut changer, comparés avant et après. Jamais le
 * prix : la complétion ne comble que des trous (la taxe de séjour d'une page
 * de centrale ne s'y ajoute pas, `lirePagesProfond`).
 */
const CHAMPS = [
  "guests",
  "bedrooms",
  "rooms",
  "lat",
  "lon",
  "locality",
  "title",
  "proven",
] as const satisfies readonly (keyof Listing)[];

function correctif(avant: Listing, apres: Listing): Partial<Listing> | null {
  const c: Partial<Listing> = {};
  let n = 0;
  for (const k of CHAMPS) {
    if (avant[k] === apres[k]) continue;
    (c as Record<string, unknown>)[k] = apres[k];
    n += 1;
  }
  return n > 0 ? c : null;
}

type BilanAirbnb = {
  essayees: string[];
  laissees: string[];
  retires: string[];
  arret: ArretFiches | null;
  raison?: string;
  attenteMs?: number;
  lectures: Array<{ cle: string | null } & Partial<ValeursFiche>>;
  lues: number;
};

/**
 * Les fiches Airbnb d'une tranche : les candidates dans l'ordre reçu (les
 * moins chères d'abord), 60 au plus, par le worker Python. Un hash PDP
 * périmé passe par les pages `rooms/`, une à une.
 */
async function trancheAirbnb(
  rows: Listing[],
  d: DemandeTranche,
  deps: Dependances,
  until: number,
  cleDe: (row: Listing) => string | null,
): Promise<BilanAirbnb> {
  const bilan: BilanAirbnb = {
    essayees: [],
    laissees: [],
    retires: [],
    arret: null,
    lectures: [],
    lues: 0,
  };
  const parId = new Map<string, Listing[]>();
  for (const row of rows) {
    const id = airbnbIdOf(row);
    if (!id) {
      bilan.laissees.push(row.id);
      continue;
    }
    const liste = parId.get(id);
    if (liste) liste.push(row);
    else parId.set(id, [row]);
  }
  const ids = [...parId.keys()].slice(0, MAX_FICHES_TRANCHE);
  if (ids.length === 0) return bilan;
  const lu = await deps.lireFichesAirbnb({
    ids,
    checkIn: d.checkIn,
    checkOut: d.checkOut,
    adults: d.voyageurs,
    echeance: until,
  });
  bilan.lues += lu.lues;
  bilan.arret = lu.arret;
  if (lu.raison) bilan.raison = lu.raison;
  if (lu.attenteMs != null) bilan.attenteMs = lu.attenteMs;
  // Une fiche lue, pleine ou vide, se note comme lue : elle ne se redemande
  // plus de trente jours, ni à la station voisine, ni à la course suivante.
  // Sauf si le worker a jugé le format illisible : ces fiches-là sont suspectes.
  const lue = lu.arret !== "illisible";
  for (const [id, f] of Object.entries(lu.fiches) as [string, FicheAirbnb][]) {
    for (const row of parId.get(id) ?? []) {
      bilan.essayees.push(row.id);
      bilan.lectures.push({ cle: cleDe(row), ...f, lue });
      if (f.ecartee) {
        bilan.retires.push(row.id);
        continue;
      }
      if (comblerDepuisMemoire(row, f)) marquer(row, MARQUE_AIRBNB);
    }
  }
  for (const id of lu.vides) {
    for (const row of parId.get(id) ?? []) {
      bilan.essayees.push(row.id);
      if (lue) bilan.lectures.push({ cle: cleDe(row), lue: true });
    }
  }

  if (lu.arret === "hash") {
    // La requête PDP n'est plus connue d'Airbnb : les pages `rooms/`, une à
    // une, au moins 6 s d'écart, arrêt au premier refus.
    const faites = new Set(bilan.essayees);
    const reste = [...parId.values()].flat().filter((row) => !faites.has(row.id));
    const p = await deps.lirePagesAirbnb(reste, until);
    bilan.lues += p.lues;
    bilan.essayees.push(...p.essayees);
    // Une page `rooms/` publie moins que la fiche PDP : elle ne se note pas
    // comme lue, et la fiche se lira quand la requête sera réparée. Dans la
    // course, le cache des pages évite de la redemander au réseau.
    for (const row of reste) {
      const l = p.lectures[row.id];
      if (l) bilan.lectures.push({ cle: cleDe(row), ...l });
    }
    if (p.arret === "refus" || p.arret === "coupe-circuit") {
      bilan.arret = p.arret;
      bilan.raison =
        p.arret === "refus"
          ? "Airbnb a refusé une page rooms/"
          : "coupe-circuit Airbnb, pause après un refus";
    } else if (p.arret === "rythme") {
      // Notre limiteur fait attendre les pages `rooms/` : rien n'est refusé,
      // la boucle attend ce qu'il demande, comme pour les fiches.
      bilan.arret = "rythme";
      bilan.raison = "limiteur local des pages rooms/ (requête de fiche périmée)";
      if (p.attenteMs != null) bilan.attenteMs = p.attenteMs;
    }
  }
  return bilan;
}

/**
 * Une tranche. `memoire` ne fait aucune requête : elle note les annonces
 * complètes du relevé, comble les candidates par la mémoire, et dit celles
 * qu'aucune page ne complétera. `tranche` lit pages et fiches Airbnb.
 */
export async function trancheProfonde(d: DemandeTranche, deps: Dependances): Promise<RenduTranche> {
  const t0 = deps.maintenant();
  const rows = d.candidates.map((c) => versLigne(c, d.stationId));
  const avant = new Map(rows.map((r) => [r.id, { ...r }]));
  // La clé de mémoire que le navigateur a calculée sur l'annonce entière
  // (photos comprises, d'où vient parfois l'identifiant Airbnb).
  const cles = new Map(d.candidates.map((c) => [c.id, c.cle]));
  const cleDe = (row: Listing): string | null => cles.get(row.id) ?? cleListing(row);
  const retires = new Set<string>();
  const essayees = new Set<string>();
  const laissees = new Set<string>();
  const hotesRefus: string[] = [];
  let arretAirbnb: ArretFiches | null = null;
  let raison: string | undefined;
  let attenteMs: number | undefined;
  let lues = 0;
  const memoriser: Array<{ cle: string | null } & Partial<ValeursFiche>> = [];
  const opts = { hotesExclus: d.hotesExclus, urlsCommunes: d.urlsCommunes };

  if (d.mode === "memoire") {
    if (d.connues && d.connues.length > 0) deps.memoire.noter(d.connues, t0);
    for (const row of rows) {
      const m = deps.memoire.lire(cleDe(row), t0);
      if (!m) continue;
      if (row.source === "Airbnb" && m.ecartee) {
        retires.add(row.id);
        continue;
      }
      if (comblerDepuisMemoire(row, m)) marquer(row, MARQUE_MEMOIRE);
      // Sa fiche Airbnb a été lue il y a moins de trente jours, et ne publie
      // pas ce qui manque encore : la redemander coûterait une requête pour rien.
      if (row.source === "Airbnb" && m.lue && manqueFiche(row)) laissees.add(row.id);
    }
    const autres = rows.filter((r) => r.source !== "Airbnb" && !retires.has(r.id) && manqueFiche(r));
    for (const id of deps.laissees(autres, opts)) laissees.add(id);
    for (const row of rows) {
      if (row.source === "Airbnb" && !airbnbIdOf(row)) laissees.add(row.id);
    }
  } else {
    const until = t0 + TRANCHE_MS - MARGE_MS;
    const aLire = rows.filter((r) => manqueFiche(r));
    const airbnb = aLire.filter((r) => r.source === "Airbnb");
    const autres = aLire.filter((r) => r.source !== "Airbnb");
    const [pages, fiches] = await Promise.all([
      autres.length > 0 ? deps.lirePages(autres, { ...opts, until }) : null,
      airbnb.length > 0 && !d.airbnbSuspendu ? trancheAirbnb(airbnb, d, deps, until, cleDe) : null,
    ]);
    if (pages) {
      lues += pages.lues;
      for (const id of pages.essayees) essayees.add(id);
      for (const id of pages.laissees) laissees.add(id);
      hotesRefus.push(...pages.hotesRefus);
      for (const row of autres) {
        const l = pages.lectures[row.id];
        if (l) memoriser.push({ cle: cleDe(row), ...l });
      }
    }
    if (fiches) {
      lues += fiches.lues;
      for (const id of fiches.essayees) essayees.add(id);
      for (const id of fiches.laissees) laissees.add(id);
      for (const id of fiches.retires) retires.add(id);
      memoriser.push(...fiches.lectures);
      arretAirbnb = fiches.arret;
      raison = fiches.raison;
      attenteMs = fiches.attenteMs;
    }
    if (memoriser.length > 0) deps.memoire.noter(memoriser, deps.maintenant());
    const bilan = [
      `${essayees.size} fiches`,
      `${lues} lues`,
      `${laissees.size} laissées`,
      ...(retires.size > 0 ? [`${retires.size} retirées`] : []),
      ...(arretAirbnb ? [`Airbnb : ${raison ?? arretAirbnb}`] : []),
    ];
    console.info(`[fiches] ${d.stationId} : ${bilan.join(" · ")}`);
  }

  const correctifs: Record<string, Partial<Listing>> = {};
  for (const row of rows) {
    if (retires.has(row.id)) continue;
    const c = correctif(avant.get(row.id) as Listing, row);
    if (c) correctifs[row.id] = c;
  }
  const sansAirbnb = d.airbnbSuspendu || airbnbSuspendu(arretAirbnb);
  const restantes = rows.filter(
    (r) =>
      !retires.has(r.id) &&
      manqueFiche(r) &&
      !essayees.has(r.id) &&
      !laissees.has(r.id) &&
      !(r.source === "Airbnb" && sansAirbnb),
  ).length;

  return {
    correctifs,
    retires: [...retires],
    restantes,
    arretAirbnb,
    ...(raison ? { raison } : {}),
    ...(attenteMs != null ? { attenteMs } : {}),
    essayees: [...essayees],
    laissees: [...laissees],
    hotesRefus,
    lues,
  };
}
