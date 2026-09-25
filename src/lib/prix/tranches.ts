/**
 * La complétion d'une station, vue du navigateur : ce que la boucle de
 * `releve.ts` sait entre deux tranches de `completerProfond`. Pur : ni réseau,
 * ni minuterie, ni magasin, pour être éprouvé seul.
 *
 * L'ordre d'une station :
 * 1. `debutCompletion` : les annonces complètes du relevé, pour la mémoire des
 *    fiches (lues **avant** toute recopie : la mémoire ne garde que ce que la
 *    source a publié pour l'annonce elle-même), les URL communes, puis la
 *    recopie entre offres d'un même logement (0 requête) ;
 * 2. la tranche « mémoire » (0 requête), posée par `poserRendu` ; elle reçoit
 *    les Airbnb même quand leurs fiches sont suspendues pour la course ;
 * 3. `viser` : les annonces qui attendent encore une fiche, le « sur » du
 *    bandeau (sans les Airbnb quand leurs fiches sont suspendues) ;
 * 4. des tranches de 45 s, tant que `aEnvoyer` rend quelque chose et que
 *    `sansProgres` reste sous sa borne.
 */

import type { Listing } from "../listings.ts";
import type { ArretFiches } from "../scrape/airbnbFiches.ts";
import type { Station } from "../stations.ts";
import {
  aCompleter,
  airbnbARefuse,
  airbnbSuspendu,
  appliquerCorrectifs,
  connuesDuReleve,
  recopieDuReleve,
  urlsCommunesDuReleve,
  versCandidate,
  type CandidateFiche,
  type ContexteReleve,
  type FicheConnue,
} from "./calcul.ts";

/**
 * Les fiches Airbnb de la course. `refus` : Airbnb a refusé (ou le
 * coupe-circuit qu'un refus a ouvert) ; `panne` : clé, worker ou format
 * illisibles. Ni l'un ni l'autre ne se reprend avant la course suivante.
 */
export type FichesAirbnb = "actives" | "refus" | "panne";

/** Ce qu'une tranche rend (`RenduTranche`), tel que le navigateur le lit. */
export type RenduLu = {
  correctifs: Readonly<Record<string, Partial<Listing>>>;
  retires: readonly string[];
  arretAirbnb: ArretFiches | null;
  raison?: string;
  attenteMs?: number;
  essayees: readonly string[];
  laissees: readonly string[];
  hotesRefus: readonly string[];
  lues: number;
};

export type Completion = {
  /** Le relevé de la station, correctifs posés, annonces retirées ôtées. */
  listings: Listing[];
  /** Les annonces complètes du relevé brut, pour la mémoire des fiches. */
  connues: FicheConnue[];
  /** Les URL que plusieurs annonces du relevé portent : jamais ouvertes. */
  urlsCommunes: string[];
  /** Fiches ouvertes ou lues, pleines ou vides : plus redemandées de la station. */
  essayees: Set<string>;
  /** Jamais ouvertes : aucune fiche, fiche qui ne publie pas ce qui manque, hôte laissé. */
  laissees: Set<string>;
  /** Les annonces qui attendaient une fiche après la mémoire (`viser`). */
  visees: Set<string>;
  /** Tranches de suite qui n'ont rien fait avancer. */
  sansProgres: number;
};

/**
 * Au-delà, la station s'arrête là : quatre tranches de suite sans une fiche
 * essayée, laissée ou retirée, ni une valeur posée, c'est qu'une annonce ne
 * se lira pas (une page qui part toujours trop tard pour répondre, un
 * limiteur qui ne se libère pas).
 */
export const SANS_PROGRES_MAX = 4;
/**
 * La même borne quand la dernière tranche s'est arrêtée sur le limiteur
 * Airbnb (`rythme`) : rien n'a été refusé, la boucle attend ce qu'il demande
 * (une minute au plus) et reprend. Quinze attentes de suite sans une fiche
 * lue, c'est un créneau qui ne se libère plus.
 */
export const SANS_PROGRES_RYTHME_MAX = 15;

export function debutCompletion(listings: readonly Listing[], station: Station | undefined): Completion {
  return {
    connues: connuesDuReleve(listings),
    urlsCommunes: urlsCommunesDuReleve(listings),
    listings: appliquerCorrectifs(listings, recopieDuReleve(listings), station),
    essayees: new Set(),
    laissees: new Set(),
    visees: new Set(),
    sansProgres: 0,
  };
}

/**
 * Les annonces à envoyer à la prochaine tranche : celles que `aCompleter`
 * retient encore, ni essayées ni laissées, et pas d'Airbnb quand ses fiches
 * sont suspendues. Les moins chères d'abord. La tranche « mémoire », qui ne
 * fait aucune requête, les demande comme si les fiches étaient actives.
 */
export function aEnvoyer(c: Completion, ctx: ContexteReleve, airbnb: FichesAirbnb): CandidateFiche[] {
  return aCompleter(c.listings, ctx)
    .filter((l) => !c.essayees.has(l.id) && !c.laissees.has(l.id))
    .filter((l) => airbnb === "actives" || l.source !== "Airbnb")
    .map(versCandidate);
}

/** Fixe le « sur » du bandeau : ce qui attend une fiche après la mémoire.
 *  Les tranches de fiches commencent : le compte sans progrès repart de zéro. */
export function viser(c: Completion, ctx: ContexteReleve, airbnb: FichesAirbnb): number {
  c.visees = new Set(aEnvoyer(c, ctx, airbnb).map((l) => l.id));
  c.sansProgres = 0;
  return c.visees.size;
}

/**
 * Pose une tranche : correctifs, annonces retirées, puis de nouveau la
 * recopie (ce qu'une fiche vient de donner passe aux autres offres du même
 * logement). Rend `true` si la tranche a changé quelque chose : une fiche
 * essayée ou laissée pour la première fois, une annonce retirée, une valeur
 * posée. Des requêtes parties sans rien de tout cela (une page coupée à
 * l'échéance) ne sont pas un progrès : sans quoi la même annonce repartait
 * à chaque tranche, et la station ne finissait jamais.
 */
export function poserRendu(c: Completion, r: RenduLu, station: Station | undefined): boolean {
  const avant = new Map(c.listings.map((l) => [l.id, l]));
  const tenues = c.essayees.size + c.laissees.size;
  const corriges = appliquerCorrectifs(c.listings, r, station);
  const retire = corriges.length < c.listings.length;
  const pose = corriges.some((l) => {
    const a = avant.get(l.id);
    const corr = r.correctifs[l.id];
    return a != null && corr != null && Object.keys(corr).some((k) => l[k as keyof Listing] !== a[k as keyof Listing]);
  });
  c.listings = appliquerCorrectifs(corriges, recopieDuReleve(corriges), station);
  for (const id of r.essayees) c.essayees.add(id);
  for (const id of r.laissees) c.laissees.add(id);
  const avance = retire || pose || c.essayees.size + c.laissees.size > tenues;
  c.sansProgres = avance ? 0 : c.sansProgres + 1;
  return avance;
}

/** Les fiches Airbnb après une tranche : un refus ou une panne ne se lèvent pas. */
export function fichesAirbnbApres(avant: FichesAirbnb, arret: ArretFiches | null | undefined): FichesAirbnb {
  if (avant !== "actives") return avant;
  if (airbnbARefuse(arret)) return "refus";
  if (airbnbSuspendu(arret)) return "panne";
  return "actives";
}

/** Où en est la station : fiches visées déjà essayées, sur le nombre visé. */
export function progression(c: Completion): { faites: number; total: number } {
  let faites = 0;
  for (const id of c.visees) if (c.essayees.has(id)) faites += 1;
  return { faites, total: c.visees.size };
}

/** Ce que la boucle envoie à `completerProfond`, hors station, dates et groupe. */
export type Envoi = {
  mode: "memoire" | "tranche";
  candidates: CandidateFiche[];
  /** Les annonces complètes du relevé, à noter : tranche « mémoire » seulement. */
  connues?: FicheConnue[];
  airbnbSuspendu: boolean;
  hotesExclus: string[];
  urlsCommunes: string[];
};

/** Ce que `releve.ts` branche sur la boucle : le serveur, les attentes, le bandeau. */
export type Pilote = {
  /** Une tranche côté serveur. Une erreur arrête la station ; ce qui est posé reste. */
  tranche(e: Envoi): Promise<RenduLu>;
  /**
   * Avant chaque tranche de fiches : la recherche de Logements, l'attente que
   * le limiteur Airbnb a demandée (`attenteMs`), le créneau Airbnb quand la
   * tranche vise Airbnb. `false` : la course est arrêtée.
   */
  entreDeux(p: { attenteMs: number; airbnb: boolean; faites: number; total: number }): Promise<boolean>;
  /** Les fiches Airbnb de la course, relues à chaque tranche : un refus lu par `entreDeux` compte. */
  airbnb(): FichesAirbnb;
  /** Les hôtes qui ont refusé une page plus tôt dans la course. */
  hotesExclus(): readonly string[];
  /** Après chaque tranche : ce qu'elle a rendu, l'état des fiches Airbnb qui en suit, la progression. */
  noter(p: { rendu: RenduLu; airbnb: FichesAirbnb; faites: number; total: number }): void;
};

/**
 * La complétion d'une station, de la recopie à la dernière tranche. Rend le
 * relevé corrigé. Pas de plafond de nombre : la boucle s'arrête quand rien ne
 * reste à envoyer, quand la course s'arrête (`entreDeux`), sur une erreur du
 * serveur, ou après `SANS_PROGRES_MAX` tranches de suite sans rien d'avancé
 * (`SANS_PROGRES_RYTHME_MAX` quand le limiteur Airbnb demande d'attendre).
 */
export async function completerStation(
  listings: readonly Listing[],
  ctx: ContexteReleve,
  station: Station | undefined,
  p: Pilote,
): Promise<Listing[]> {
  const c = debutCompletion(listings, station);
  const envoi = (mode: Envoi["mode"], candidates: CandidateFiche[], connues?: FicheConnue[]): Envoi => ({
    mode,
    candidates,
    ...(connues ? { connues } : {}),
    airbnbSuspendu: p.airbnb() !== "actives",
    hotesExclus: [...p.hotesExclus()],
    urlsCommunes: c.urlsCommunes,
  });
  const poser = (r: RenduLu) => {
    poserRendu(c, r, station);
    p.noter({ rendu: r, airbnb: fichesAirbnbApres(p.airbnb(), r.arretAirbnb), ...progression(c) });
  };

  // La mémoire ne fait aucune requête : elle comble aussi les Airbnb quand
  // leurs fiches sont suspendues (refus ou panne plus tôt dans la course).
  // `viser` et les tranches, elles, les laissent.
  const premieres = aEnvoyer(c, ctx, "actives");
  if (premieres.length === 0 && c.connues.length === 0) return c.listings;
  try {
    poser(await p.tranche(envoi("memoire", premieres, c.connues)));
  } catch (err) {
    console.warn("[prix] mémoire des fiches injoignable", err);
    return c.listings;
  }

  viser(c, ctx, p.airbnb());
  let attenteMs = 0;
  for (;;) {
    const avant = aEnvoyer(c, ctx, p.airbnb());
    if (avant.length === 0) break;
    const airbnb = avant.some((l) => l.source === "Airbnb");
    if (!(await p.entreDeux({ attenteMs, airbnb, ...progression(c) }))) break;
    // Un refus lu entre deux retire les Airbnb de la tranche.
    const suite = aEnvoyer(c, ctx, p.airbnb());
    if (suite.length === 0) break;
    let r: RenduLu;
    try {
      r = await p.tranche(envoi("tranche", suite));
    } catch (err) {
      console.warn("[prix] tranche de fiches en échec", err);
      break;
    }
    poser(r);
    const borne = r.arretAirbnb === "rythme" ? SANS_PROGRES_RYTHME_MAX : SANS_PROGRES_MAX;
    if (c.sansProgres >= borne) {
      console.warn(`[prix] ${c.sansProgres} tranches de suite sans rien d'avancé : fiches arrêtées là`);
      break;
    }
    attenteMs = r.arretAirbnb === "rythme" ? (r.attenteMs ?? 0) : 0;
  }
  return c.listings;
}
