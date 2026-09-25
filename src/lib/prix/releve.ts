/**
 * Le relevé des prix par station : le magasin de l'écran et sa boucle.
 *
 * La boucle vit au niveau du module, comme celle de `maj.ts` : une course
 * survit à la navigation dans l'application, pas à un rechargement (seuls la
 * période et les résultats sont persistés).
 *
 * Une station à la fois, jamais deux, serveur compris : un relevé Airbnb
 * envoie jusqu'à douze requêtes, et deux stations ensemble se feraient couper
 * par le limiteur local. « Arrêter » pendant les cinq parts n'écrit rien de la
 * station en vol ; pendant sa complétion, ses parts rendues, elle s'écrit
 * quand même, avec ce que les tranches ont posé, et la course s'arrête là
 * (`ecritureDuReleve`). Le serveur, qui ne sait rien de l'arrêt, finit ce qui
 * est parti : la station suivante l'attend. Entre onglets, un verrou (Web
 * Locks) tient le même rôle. Avant chaque station, on laisse finir la
 * recherche de Logements, puis on attend que le créneau Airbnb le permette
 * (`etatAirbnb`). Une station coupée par un refus n'est jamais relancée
 * d'elle-même.
 *
 * Les cinq parts de la recherche de Logements, trois en vol au plus, sans
 * `relance` : le relevé Airbnb que le serveur garde quinze minutes sert aux
 * deux écrans. Mais rien n'est écrit dans `useStay`, et pas de repli sur le
 * relevé figé : la médiane ne porte que sur ce qui a été relevé pour ces
 * dates. Les annonces qu'elle a retenues vont dans IndexedDB (`annonces.ts`),
 * pour l'onglet « Par budget ». Un échec ne remplace jamais une médiane.
 *
 * Entre les parts et la médiane, la complétion (`tranches.ts`) cherche la
 * position, la capacité et les chambres qui manquent aux annonces que la
 * médiane pourrait compter : mémoire des fiches, recopie entre offres d'un
 * même logement, puis des tranches de 45 s (`completerProfond`), toujours
 * sous le verrou de la station. Entre deux tranches, Logements passe
 * d'abord, et « Arrêter » coupe : ce que les tranches finies ont posé compte
 * dans la médiane écrite. Après un refus d'Airbnb, plus aucune fiche Airbnb
 * jusqu'à la fin de la course.
 *
 * Le magasin tient aussi l'état de vue (onglet, filtres, tris, pages), non
 * persisté : changer d'onglet, ou passer par Réservation et revenir, ne perd
 * rien.
 */
import { create } from "zustand";
import { createJSONStorage, persist, type PersistStorage } from "zustand/middleware";
import type { Listing } from "../listings";
import { useParcours } from "../parcours";
import { DEVIS_MS, SEARCH_PART_MS, TARIF_MS, searchStay } from "../searchStay";
import { stationById, type Station } from "../stations";
import { useStay } from "../stay";
import { todayIso } from "../stay/calendar";
import { estTimeout, withDeadline } from "../stay/deadline";
import { ecrireAnnonces, oublierAnnonces, oublierAnnoncesSauf } from "./annonces";
import { etatAirbnb, type EtatCreneau } from "./attente";
import { completerProfond } from "./completion";
import { completerStation, type FichesAirbnb, type Pilote } from "./tranches";
import {
  annoncesDuReleve,
  bornerNuits,
  cleResultat,
  dejaPrevu,
  departIso,
  ecritureDuReleve,
  elaguer,
  FL0,
  PAGE,
  PARTS,
  resultatDuReleve,
  TRI0,
  TRIB0,
  type AnnonceRetenue,
  type EntreeReleve,
  type Filtres,
  type Job,
  type Part,
  type Periode,
  type ReleveRendu,
  type Resultat,
  type Tri,
  type TriB,
} from "./calcul";

export type Course = Job & {
  /** Stations déjà passées : l'indice de celle en cours. */
  i: number;
  /**
   * Ce que la station `i` attend avant de partir, tant qu'elle attend : le
   * créneau Airbnb (`refus`, `rythme`, ou un autre onglet qui relève), la
   * station d'une course arrêtée que le serveur finit (`arret`), la recherche
   * de Logements (`logements`). `jusqua` vaut `null` quand on ne sait pas.
   */
  attente: { jusqua: number | null; motif: "refus" | "rythme" | "arret" | "logements" } | null;
  /**
   * La complétion de la station `i` : fiches essayées, sur celles qui en
   * attendaient une après la mémoire. `null` hors complétion.
   */
  fiches: { faites: number; total: number } | null;
  /** Airbnb a refusé des requêtes pendant la course : plus de fiches Airbnb jusqu'à sa fin. */
  airbnbRefus: boolean;
};

export type Onglet = "station" | "budget";

export type PrixStore = {
  /** `null` : suivre le séjour. */
  per: Periode | null;
  /** Par `cleResultat(période, groupe, station)`. */
  res: Record<string, Resultat>;
  course: Course | null;
  file: Job[];
  onglet: Onglet;
  fl: Filtres;
  /** Tri du tableau (onglet station). */
  tri: Tri;
  /** Tri des logements (onglet budget). */
  triB: TriB;
  /** Lignes affichées du tableau. */
  limit: number;
  /** Page de la liste des logements (onglet budget), à partir de 0. */
  pageB: number;
  /** Une autre période repart de la première page. */
  setPer(p: Periode | null): void;
  lancer(job: Job): void;
  arreter(): void;
  setOnglet(o: Onglet): void;
  /** Un autre critère repart de la première page. Un autre tri du tableau
   *  garde ses lignes ; un autre tri des logements ramène leur liste à sa
   *  première page, comme dans Logements. */
  setFl(patch: Partial<Filtres>): void;
  /** Calculé sur l'état courant du magasin : deux appels dans le même
   *  événement (un brouillon validé au blur, puis la poignée) s'enchaînent. */
  majFl(f: (fl: Filtres) => Filtres): void;
  resetFl(fl: Filtres): void;
  setTri(t: Tri): void;
  setTriB(t: TriB): void;
  setLimit(n: number): void;
  setPageB(n: number): void;
};

type Rendu = Awaited<ReturnType<typeof searchStay>>;

/** Le relevé d'une station : sa médiane, les annonces qu'elle a comptées, si
 *  l'application elle-même a cessé de répondre, et si ses cinq parts se sont
 *  rendues avant tout arrêt (`ecritureDuReleve`). */
type Releve = ReleveRendu & { annonces: AnnonceRetenue[] };

/** Pendant une attente, l'état du créneau est relu à ce rythme : un refus levé
 *  plus tôt que prévu, ou une fenêtre qui se vide, relance aussitôt. */
const RELIRE_MS = 5_000;

/** La plus longue recherche de Logements côté client : la part Gîtes et son devis. */
const LOGEMENTS_MS = SEARCH_PART_MS + DEVIS_MS + 6_000;

/** Le verrou que les onglets se passent : un seul relève à la fois. */
const VERROU = "skitrack-prix-releve";

const CLE_STOCKAGE = "skitrack-prix";

/** Une tranche de fiches prend 45 s au plus côté serveur : passé ce délai, il ne répond plus. */
const TRANCHE_CLIENT_MS = 75_000;
/** L'attente que le limiteur Airbnb demande entre deux tranches, au plus. */
const ATTENTE_FICHES_MAX_MS = 60_000;

/** Parts en vol à la fois. L'application de bureau parle HTTP/1.1, six
 *  connexions par origine : un long relevé en laisse au reste de l'écran. */
const CONNEXIONS = 3;

/** Les longues d'abord. Gîtes et la plupart des centrales répondent tout de
 *  suite (pas de commune, centrale non branchée). */
const RANG: Record<Part, number> = { airbnb: 0, cozy: 1, greengo: 2, centrales: 3, gites: 4 };
const ORDRE_PARTS: readonly Part[] = [...PARTS].sort((a, b) => RANG[a] - RANG[b]);

/**
 * La génération de la course en vol : une course arrêtée n'écrit plus rien,
 * sauf la station dont les cinq parts étaient rendues (`ecritureDuReleve`).
 */
let generation = 0;
/** Coupe les attentes de la course courante (pas sa station : voir `stationEnVol`). */
let arret: AbortController | null = null;
/**
 * La station en vol, attentes comprises, de quelque course qu'elle soit :
 * réglée quand ses parts et sa complétion le sont. Arrêtée pendant ses parts,
 * elle n'écrit rien ; pendant sa complétion, elle s'écrit en sortant, avant
 * que la station suivante, qui l'attend, ne parte.
 */
let stationEnVol: Promise<void> | null = null;
/** Depuis quand Logements cherche (voir `attendreLogements`). */
let chercheDepuis: number | null = null;
/** Les fiches Airbnb de la course en vol : un refus ou une panne valent jusqu'à sa fin. */
let fichesAirbnb: FichesAirbnb = "actives";
/** Les hôtes qui ont refusé une page de fiche pendant la course en vol (429, 403, 503), ou n'ont pas répondu. */
let hotesExclus = new Set<string>();

/** Les bornes de Logements : le devis ITEA et le panier Ingénie s'ajoutent au relevé. */
function delaiPart(part: Part): number {
  if (part === "gites") return SEARCH_PART_MS + DEVIS_MS + 6_000;
  if (part === "centrales") return SEARCH_PART_MS + TARIF_MS + 6_000;
  return SEARCH_PART_MS + 6_000;
}

/** Une pause que l'arrêt interrompt. */
function dormir(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const fin = () => {
      clearTimeout(t);
      signal.removeEventListener("abort", fin);
      resolve();
    };
    const t = setTimeout(fin, ms);
    signal.addEventListener("abort", fin, { once: true });
  });
}

/** Attend `p`, ou l'arrêt. */
function attendre(p: Promise<unknown>, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const fin = () => {
      signal.removeEventListener("abort", fin);
      resolve();
    };
    signal.addEventListener("abort", fin, { once: true });
    void p.then(fin, fin);
  });
}

/** Seulement pour la course courante : une course arrêtée ne pose rien sur la suivante. */
function poserAttente(gen: number, attente: Course["attente"]): void {
  if (gen !== generation) return;
  const { course } = usePrix.getState();
  if (!course || (course.attente === null && attente === null)) return;
  usePrix.setState({ course: { ...course, attente } });
}

/** La progression des fiches, ou le refus d'Airbnb : pour la course courante seulement. */
function poserCourse(gen: number, patch: Partial<Pick<Course, "fiches" | "airbnbRefus">>): void {
  if (gen !== generation) return;
  const { course } = usePrix.getState();
  if (!course) return;
  usePrix.setState({ course: { ...course, ...patch } });
}

/** Plus de fiches Airbnb jusqu'à la fin de la course : jamais de reprise après un refus. */
function suspendreAirbnb(gen: number, etat: FichesAirbnb, raison: string): void {
  if (gen !== generation || etat === "actives" || fichesAirbnb !== "actives") return;
  fichesAirbnb = etat;
  console.warn(`[prix] fiches Airbnb suspendues pour la course : ${raison}`);
  if (etat === "refus") poserCourse(gen, { airbnbRefus: true });
}

/**
 * Logements d'abord : sa recherche, l'utilisateur l'attend ; le relevé, non.
 * Bornée : quitter Logements en pleine recherche laisse `searching` levé, et
 * aucune recherche ne dure plus que LOGEMENTS_MS. `false` : course arrêtée.
 */
async function attendreLogements(gen: number, signal: AbortSignal): Promise<boolean> {
  let attendu = false;
  for (;;) {
    const depuis = useStay.getState().searching ? chercheDepuis : null;
    const reste = depuis === null ? 0 : depuis + LOGEMENTS_MS - Date.now();
    if (!(reste > 0)) break;
    attendu = true;
    poserAttente(gen, { jusqua: null, motif: "logements" });
    await dormir(Math.min(reste, RELIRE_MS), signal);
    if (gen !== generation) return false;
  }
  if (attendu) poserAttente(gen, null);
  return gen === generation;
}

/** Attend que le créneau Airbnb tienne une station entière. `false` : course arrêtée. */
async function attendreCreneau(gen: number, signal: AbortSignal): Promise<boolean> {
  for (;;) {
    let etat: EtatCreneau = { attenteMs: 0, motif: null };
    try {
      etat = await etatAirbnb({ signal });
    } catch (err) {
      // Serveur muet : on part, le relevé dira lui-même ce qu'Airbnb a répondu.
      if (!signal.aborted) console.warn("[prix] créneau Airbnb illisible", err);
    }
    if (gen !== generation) return false;
    if (!(etat.attenteMs > 0)) {
      poserAttente(gen, null);
      return true;
    }
    poserAttente(gen, { jusqua: Date.now() + etat.attenteMs, motif: etat.motif ?? "rythme" });
    await dormir(Math.min(etat.attenteMs, RELIRE_MS), signal);
    if (gen !== generation) return false;
  }
}

/** Les bornes du validateur de `searchStay` : un groupe venu d'une adresse
 *  (`?pers=35`, `t=2.5`) ferait refuser les cinq parts. */
function borne(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v) || min));
}

/**
 * Ce que la complétion d'une station (`completerStation`) demande à la course :
 * le serveur, les attentes entre deux tranches, et le bandeau. Une course
 * arrêtée ne pose plus rien sur la course (bandeau, hôtes exclus, fiches
 * Airbnb), et n'envoie plus de tranche ; ce que la tranche en vol rend se pose
 * encore sur le relevé de la station.
 */
function pilote(
  gen: number,
  signal: AbortSignal,
  base: { stationId: string; checkIn: string; checkOut: string; voyageurs: number },
): Pilote {
  return {
    // Sans le signal de la course : une tranche partie va au bout côté
    // serveur, et la station suivante l'attend (`stationEnVol`).
    tranche: (e) => withDeadline(completerProfond({ data: { ...base, ...e } }), TRANCHE_CLIENT_MS, "fiches"),
    async entreDeux({ attenteMs, airbnb, faites, total }) {
      if (gen !== generation) return false;
      poserCourse(gen, { fiches: { faites, total } });
      if (!(await attendreLogements(gen, signal))) return false;
      if (attenteMs > 0) {
        // Le limiteur Airbnb a demandé d'attendre : rien n'a été refusé.
        const ms = Math.min(attenteMs, ATTENTE_FICHES_MAX_MS);
        poserAttente(gen, { jusqua: Date.now() + ms, motif: "rythme" });
        await dormir(ms, signal);
        if (gen !== generation) return false;
        poserAttente(gen, null);
      }
      if (airbnb && fichesAirbnb === "actives") {
        // Un refus lu au créneau (relevé, Logements, worker) : aucune fiche
        // Airbnb pendant sa pause, ni après.
        try {
          const etat = await etatAirbnb({ signal });
          if (etat.motif === "refus") suspendreAirbnb(gen, "refus", "créneau Airbnb en pause après un refus");
        } catch (err) {
          if (!signal.aborted) console.warn("[prix] créneau Airbnb illisible", err);
        }
      }
      return gen === generation;
    },
    airbnb: () => fichesAirbnb,
    hotesExclus: () => [...hotesExclus],
    noter({ rendu, airbnb, faites, total }) {
      if (gen !== generation) return;
      for (const h of rendu.hotesRefus) hotesExclus.add(h);
      if (airbnb !== fichesAirbnb) suspendreAirbnb(gen, airbnb, rendu.raison ?? rendu.arretAirbnb ?? airbnb);
      poserCourse(gen, { fiches: { faites, total } });
    },
  };
}

/** Les cinq parts d'une station, trois à la fois, leur complétion, et ce qu'on en garde. */
async function relever(s: Station, job: Job, gen: number, signal: AbortSignal): Promise<Releve> {
  const checkIn = job.per.from;
  const checkOut = departIso(job.per);
  const payload = {
    stationId: s.id,
    stationName: s.name,
    lat: s.lat,
    lon: s.lon,
    checkIn,
    checkOut,
    guests: borne(job.groupe.trav, 1, 30),
    bedrooms: borne(job.groupe.rooms, 0, 20),
    // Jamais de relance : le relevé Airbnb de quinze minutes sert aussi à Logements.
    relance: false,
  };
  // Dans l'ordre de PARTS, quel que soit l'ordre de départ.
  const lus: PromiseSettledResult<Rendu>[] = [];
  const lire = async (part: Part): Promise<void> => {
    // Son délai court de son départ ; échu, sa connexion est rendue (le
    // serveur finit quand même, d'où `stationEnVol`).
    const ctrl = new AbortController();
    const k = PARTS.indexOf(part);
    try {
      const value = await withDeadline(
        searchStay({ data: { ...payload, part }, signal: ctrl.signal }),
        delaiPart(part),
        part,
      );
      lus[k] = { status: "fulfilled", value };
    } catch (reason) {
      lus[k] = { status: "rejected", reason };
    } finally {
      ctrl.abort();
    }
  };
  const reste = [...ORDRE_PARTS];
  const tour = async () => {
    for (let part = reste.shift(); part; part = reste.shift()) await lire(part);
  };
  await Promise.all(Array.from({ length: CONNEXIONS }, tour));
  // Tout refusé, et pas sur un délai : c'est l'application qui ne répond plus.
  const injoignable = lus.every((lu) => lu.status === "rejected" && !estTimeout(lu.reason));
  // Rendues avant tout arrêt : un « Arrêter » venu après tombe pendant la
  // complétion, et la station s'écrira quand même (`ecritureDuReleve`).
  const partsRendues = gen === generation;
  try {
    const rendus = lus.flatMap((lu) => (lu.status === "fulfilled" ? [lu.value] : []));
    const ctx = { dept: s.dept, checkIn, checkOut, groupe: job.groupe, now: Date.now() };
    let listings: Listing[] = rendus.flatMap((r) => r.listings);
    if (!injoignable && partsRendues) {
      try {
        listings = await completerStation(
          listings,
          ctx,
          s,
          pilote(gen, signal, { stationId: s.id, checkIn, checkOut, voyageurs: payload.guests }),
        );
      } catch (err) {
        // La complétion ne coûte jamais le relevé : il se compte tel quel.
        console.warn("[prix] complétion en échec", s.id, err);
      }
    }
    const entree: EntreeReleve = {
      ...ctx,
      listings,
      sources: rendus.flatMap((r) => r.sources),
      partsEchouees: PARTS.filter((_, k) => lus[k].status === "rejected"),
    };
    const resultat = resultatDuReleve(entree);
    const annonces = resultat.etat === "fait" ? annoncesDuReleve(entree) : [];
    return { resultat, annonces, injoignable, partsRendues };
  } catch (err) {
    console.warn("[prix] relevé en échec", s.id, err);
    return {
      resultat: { etat: "echec", ts: Date.now(), raison: "Le relevé n’a pas abouti." },
      annonces: [],
      injoignable,
      partsRendues,
    };
  }
}

/**
 * Logements, le créneau, puis la station, sous un verrou que les onglets se
 * passent : deux onglets sur /prix ne relèvent jamais ensemble. Sans Web
 * Locks (page hors contexte sécurisé), l'onglet ne se garde que lui-même.
 * `null` : course arrêtée entre-temps.
 */
async function passerStation(
  gen: number,
  s: Station,
  job: Job,
  signal: AbortSignal,
): Promise<Releve | null> {
  const section = async (): Promise<Releve | null> => {
    if (!(await attendreLogements(gen, signal))) return null;
    if (!(await attendreCreneau(gen, signal))) return null;
    return relever(s, job, gen, signal);
  };
  const verrous = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!verrous) return section();
  try {
    // Libre, on part sans rien afficher. Tenu, c'est qu'un autre onglet relève :
    // son relevé occupe le créneau Airbnb.
    const libre = await verrous.request(VERROU, { ifAvailable: true }, async (v) =>
      v ? { lu: await section() } : null,
    );
    if (libre) return libre.lu;
    if (gen !== generation) return null;
    poserAttente(gen, { jusqua: null, motif: "rythme" });
    return await verrous.request(VERROU, { signal }, section);
  } catch (err) {
    // L'arrêt pendant l'attente du verrou la rejette (AbortError) : rien à dire.
    if (gen !== generation) return null;
    throw err;
  }
}

async function derouler(gen: number, signal: AbortSignal): Promise<void> {
  for (;;) {
    const course = usePrix.getState().course;
    if (gen !== generation || !course) return;
    if (course.i >= course.ids.length) break;
    // Un identifiant inconnu (station retirée depuis) est sauté.
    const station = stationById(course.ids[course.i]);
    if (station) {
      const avant = stationEnVol;
      if (avant) {
        poserAttente(gen, { jusqua: null, motif: "arret" });
        await attendre(avant, signal);
        if (gen !== generation) return;
        poserAttente(gen, null);
      }
      const vol = passerStation(gen, station, course, signal);
      const fin = vol.then(
        () => undefined,
        () => undefined,
      );
      stationEnVol = fin;
      let lu: Releve | null;
      try {
        lu = await vol;
      } finally {
        if (stationEnVol === fin) stationEnVol = null;
      }
      // Arrêtée pendant l'attente de Logements, du créneau ou du verrou.
      if (!lu) return;
      const enCours = gen === generation;
      if (enCours && lu.injoignable) {
        abandonner();
        return;
      }
      // La clé de cette course-ci, même arrêtée : pas celle de la suivante.
      const cle = cleResultat(course.per, course.groupe, station.id);
      // Arrêtée pendant ses parts : rien. Pendant sa complétion : sa médiane.
      // Un échec ne remplace jamais une médiane : le relevé précédent reste,
      // ses annonces aussi (la règle de `deadline.ts`).
      const ecrit = ecritureDuReleve(lu, usePrix.getState().res[cle], enCours);
      if (ecrit !== null) {
        // Les annonces avant le résultat : l'onglet budget les trouve en mémoire
        // dès que la station paraît. Un échec retire celles d'un relevé plus
        // ancien de la même clé, sans écrire de liste vide : l'onglet budget
        // compterait la station parmi les relevées.
        if (ecrit === "fait") void ecrireAnnonces(cle, lu.annonces);
        else void oublierAnnonces(cle);
        const avec = { ...usePrix.getState().res, [cle]: lu.resultat };
        const res = elaguer(avec);
        usePrix.setState({ res });
        // Des résultats sont partis : leurs annonces aussi.
        if (res !== avec) void oublierAnnoncesSauf(new Set(Object.keys(res)));
      }
      // Arrêtée : la course s'arrête là (« Arrêter » a déjà passé la main à la
      // suivante de la file, qui attendait cette station).
      if (!enCours) return;
    }
    usePrix.setState((s) =>
      s.course ? { course: { ...s.course, i: s.course.i + 1, attente: null, fiches: null } } : {},
    );
  }
  suivante();
}

/** La course en vol n'écrira plus rien, sauf la station dont les cinq parts
 *  sont rendues (`ecritureDuReleve`), et ses attentes s'arrêtent. */
function couperCourse(): void {
  generation += 1;
  arret?.abort();
  arret = null;
}

/** L'application ne répond plus : inutile de passer toute la liste en
 *  échecs. La course et la file s'arrêtent, et on le dit. */
function abandonner(): void {
  couperCourse();
  usePrix.setState({ course: null, file: [] });
  useParcours
    .getState()
    .say("Le relevé s’est arrêté : l’application ne répond plus. Relancez-le plus tard.");
}

function demarrer(job: Job): void {
  couperCourse();
  const gen = generation;
  const ctrl = new AbortController();
  arret = ctrl;
  fichesAirbnb = "actives";
  hotesExclus = new Set();
  usePrix.setState({
    course: { ...job, ids: [...job.ids], i: 0, attente: null, fiches: null, airbnbRefus: false },
  });
  void derouler(gen, ctrl.signal).catch((err: unknown) => {
    console.warn("[prix] course interrompue", err);
    if (gen === generation) suivante();
  });
}

/** Termine la course en cours et démarre la suivante de la file, s'il y en a une. */
function suivante(): void {
  couperCourse();
  // Une liste mise en file la veille peut viser des dates passées depuis.
  const aujourdhui = todayIso();
  const [job, ...reste] = usePrix.getState().file.filter((j) => j.per.from >= aujourdhui);
  if (!job) {
    usePrix.setState({ course: null, file: [] });
    return;
  }
  usePrix.setState({ file: reste });
  demarrer(job);
}

function periodeLue(v: unknown): Periode | null {
  if (!v || typeof v !== "object") return null;
  const { from, nights } = v as { from?: unknown; nights?: unknown };
  if (typeof from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  if (typeof nights !== "number") return null;
  return { from, nights: bornerNuits(nights) };
}

function resultatsLus(v: unknown): Record<string, Resultat> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const res: Record<string, Resultat> = {};
  for (const [cle, r] of Object.entries(v as Record<string, unknown>)) {
    const { etat, ts } = (r ?? {}) as { etat?: unknown; ts?: unknown };
    if ((etat === "fait" || etat === "echec") && typeof ts === "number") res[cle] = r as Resultat;
  }
  return elaguer(res);
}

/** Deux résultats d'une même clé : une médiane plutôt qu'un échec, sinon le plus récent. */
function prefere(r: Resultat, d: Resultat): boolean {
  if (r.etat !== d.etat) return r.etat === "fait";
  return r.ts > d.ts;
}

/** Les résultats d'un autre onglet ajoutés aux siens, clé par clé. Rien de neuf :
 *  le même objet, que le garde du stockage reconnaît. */
function reunir(
  siens: Record<string, Resultat>,
  lus: Record<string, Resultat>,
): Record<string, Resultat> {
  let res: Record<string, Resultat> | null = null;
  for (const [cle, r] of Object.entries(lus)) {
    const d = siens[cle];
    if (d !== undefined && !prefere(r, d)) continue;
    res ??= { ...siens };
    res[cle] = r;
  }
  return res ? elaguer(res) : siens;
}

type Persiste = Pick<PrixStore, "per" | "res">;

/** Ce que cet onglet a écrit ou lu en dernier (voir `stockage`). */
let dernierEcrit: Persiste | null = null;
/** Faite une fois : les hydratations suivantes viennent d'un autre onglet. */
let hydrate = false;

/**
 * `localStorage`, réécrit seulement quand la période ou les résultats
 * changent. L'état de vue passe par le même magasin : sans ce garde, chaque
 * cran d'une fourchette qu'on glisse resérialiserait tous les résultats, et le
 * premier clic d'un onglet ouvert avant un autre réécrirait les résultats,
 * périmés, qu'il avait lus.
 */
function stockage(): PersistStorage<Persiste> | undefined {
  const base = createJSONStorage<Persiste>(() => localStorage);
  if (!base) return undefined;
  return {
    getItem: (nom) => base.getItem(nom),
    setItem: (nom, valeur) => {
      const { per, res } = valeur.state;
      if (dernierEcrit && dernierEcrit.per === per && dernierEcrit.res === res) return;
      const fait = base.setItem(nom, valeur);
      dernierEcrit = valeur.state;
      return fait;
    },
    removeItem: (nom) => base.removeItem(nom),
  };
}

/** Les premières pages : une autre période ou un autre critère y ramène. */
const PAGES0 = { limit: PAGE, pageB: 0 };

export const usePrix = create<PrixStore>()(
  persist(
    (set, get) => ({
      per: null,
      res: {},
      course: null,
      file: [],
      onglet: "station",
      fl: FL0,
      tri: TRI0,
      triB: TRIB0,
      ...PAGES0,
      setPer: (p) =>
        set({ per: p ? { from: p.from, nights: bornerNuits(p.nights) } : null, ...PAGES0 }),
      lancer: (job) => {
        // La boucle ne tourne que dans le navigateur.
        if (typeof window === "undefined") return;
        const { course, file } = get();
        if (job.ids.length === 0 || dejaPrevu(job, course, file)) return;
        // Des dates passées : rien à louer, et le créneau Airbnb est compté.
        if (job.per.from < todayIso()) return;
        if (course) set({ file: [...file, { ...job, ids: [...job.ids] }] });
        else demarrer(job);
      },
      arreter: () => suivante(),
      setOnglet: (o) => set({ onglet: o }),
      setFl: (patch) => set((s) => ({ fl: { ...s.fl, ...patch }, ...PAGES0 })),
      majFl: (f) => set((s) => ({ fl: f(s.fl), ...PAGES0 })),
      resetFl: (fl) => set({ fl, ...PAGES0 }),
      setTri: (t) => set({ tri: t }),
      setTriB: (t) => set({ triB: t, pageB: 0 }),
      setLimit: (n) => set({ limit: n }),
      setPageB: (n) => set({ pageB: n }),
    }),
    {
      name: CLE_STOCKAGE,
      version: 1,
      storage: stockage(),
      partialize: (s) => ({ per: s.per, res: s.res }),
      // Un stockage abîmé, ou écrit sous une autre forme, ne doit pas casser
      // l'écran. Au chargement, le stockage fait foi ; ensuite, c'est un autre
      // onglet qui a écrit : on garde sa propre période et on réunit les
      // résultats, pour que ni l'un ni l'autre ne perde un relevé.
      merge: (persisted, courant) => {
        const p = (persisted ?? {}) as { per?: unknown; res?: unknown };
        const lus = resultatsLus(p.res);
        if (hydrate) return { ...courant, res: reunir(courant.res, lus) };
        return { ...courant, per: periodeLue(p.per), res: lus };
      },
      onRehydrateStorage: () => (etat) => {
        if (!etat) return;
        // Ce qu'on vient de lire n'est pas à réécrire.
        dernierEcrit = { per: etat.per, res: etat.res };
        if (hydrate) return;
        hydrate = true;
        // Les annonces de résultats élagués lors d'une session précédente. Pas
        // aux relectures suivantes : l'autre onglet écrit peut-être les siennes.
        void oublierAnnoncesSauf(new Set(Object.keys(etat.res)));
      },
    },
  ),
);

if (typeof window !== "undefined") {
  // Un autre onglet a écrit : on reprend ses résultats. La relecture passe par
  // le `set` brut du middleware et n'écrit rien, donc pas d'écho entre onglets.
  window.addEventListener("storage", (e) => {
    if (e.key === CLE_STOCKAGE) void usePrix.persist.rehydrate();
  });
  // Une recherche de Logements part par `setSearching(true)`, puis vide sa
  // liste (`setLive(null, [], true)`) : ce second signe compte aussi quand le
  // drapeau était resté levé par une recherche quittée en route.
  if (useStay.getState().searching) chercheDepuis = Date.now();
  useStay.subscribe((s, avant) => {
    if (!s.searching) chercheDepuis = null;
    else if (
      !avant.searching ||
      (s.liveSources !== avant.liveSources && s.liveSources.length === 0)
    )
      chercheDepuis = Date.now();
    // Un autre groupe, ou d'autres dates quand la période suit le séjour : les
    // listes de l'écran changent, elles repartent de la première page comme à
    // tout changement de période ou de critère.
    const groupe = s.guests !== avant.guests || s.bedrooms !== avant.bedrooms;
    const dates = s.checkIn !== avant.checkIn || s.checkOut !== avant.checkOut;
    if (groupe || (dates && usePrix.getState().per === null)) usePrix.setState(PAGES0);
  });
}
