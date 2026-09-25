/**
 * Les annonces que chaque relevé a retenues, pour l'onglet « Par budget ».
 *
 * Une entrée IndexedDB par clé de résultat (`cleResultat`) : une grande
 * station en retient des centaines, et quarante stations dépasseraient le
 * quota de `localStorage`. Un cache en mémoire passe devant, et suffit seul
 * quand IndexedDB manque (rendu serveur, navigation privée, base bloquée ou
 * pleine) : rien n'échoue jamais chez l'appelant, au pire les annonces ne
 * survivent pas au rechargement.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { Listing } from "../listings";
import { remesurerRemontee, stationDeCle, versListing, type AnnonceRetenue } from "./calcul";

const BASE = "skitrack-prix";
const MAGASIN = "annonces";

const cache = new Map<string, AnnonceRetenue[]>();
/** Clés dont la mémoire sait tout (lues, écrites ou oubliées) : jamais relues. */
const connues = new Set<string>();
/** Les lectures en vol, par clé : une deuxième demande attend la première. */
const enLecture = new Map<string, Promise<void>>();
/** Rang de la dernière écriture de chaque clé : un élagage parti avant elle ne l'efface pas. */
const ecrites = new Map<string, number>();
let rang = 0;
/** Clés relues à l'ancien format (relevés faits avec la version du 25 septembre
 *  2026 au matin, PR #47) : leurs annonces n'ont pas de position, donc pas de
 *  pastille, et l'écran le dit. */
const anciennes = new Set<string>();

/** Les autres onglets de l'application : une clé écrite ou oubliée ici y est
 *  relue. Sans cela, un onglet ouvert sur « Par budget » gardait les annonces
 *  de l'ancien format pendant qu'un autre les relevait à nouveau, et proposait
 *  de relancer ce qui venait d'être fait. */
const CANAL = "skitrack-prix-annonces";
const canal: BroadcastChannel | null =
  typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CANAL);
canal?.addEventListener("message", (e: MessageEvent) => {
  const k = e.data;
  if (typeof k !== "string") return;
  connues.delete(k);
  void charger([k]);
});

/** Chaque changement d'une clé lui donne un cran neuf ; une vue ne se redessine
 *  que si l'une de ses clés a changé de cran. */
const crans = new Map<string, number>();
let tour = 0;
const abonnes = new Set<() => void>();

function signaler(cles: readonly string[]): void {
  if (cles.length === 0) return;
  for (const k of cles) crans.set(k, ++tour);
  for (const f of abonnes) f();
}

function abonner(f: () => void): () => void {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}

/* ---------- IndexedDB ---------- */

let ouverture: Promise<IDBDatabase | null> | null = null;

/** La base, ouverte une fois. `null` : pas d'IndexedDB ici, la mémoire seule. */
function ouvrir(): Promise<IDBDatabase | null> {
  ouverture ??= new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let fini = false;
    const rendre = (db: IDBDatabase | null) => {
      if (fini) {
        db?.close();
        return;
      }
      fini = true;
      resolve(db);
    };
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(BASE, 1);
    } catch {
      rendre(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MAGASIN)) db.createObjectStore(MAGASIN);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Une version plus récente s'ouvre ailleurs : on lui laisse la place.
      db.onversionchange = () => {
        db.close();
        ouverture = Promise.resolve(null);
      };
      rendre(db);
    };
    req.onerror = () => rendre(null);
    req.onblocked = () => rendre(null);
  });
  return ouverture;
}

/** Une transaction sur le magasin, jusqu'à sa fin. `false` : pas de base, ou transaction perdue. */
async function transaction(
  mode: IDBTransactionMode,
  faire: (m: IDBObjectStore) => void,
): Promise<boolean> {
  const db = await ouvrir();
  if (!db) return false;
  return new Promise((resolve) => {
    let tx: IDBTransaction | null = null;
    try {
      tx = db.transaction(MAGASIN, mode);
      tx.oncomplete = () => resolve(true);
      tx.onabort = () => resolve(false);
      tx.onerror = () => resolve(false);
      faire(tx.objectStore(MAGASIN));
    } catch {
      try {
        tx?.abort();
      } catch {
        // Déjà finie : rien à défaire.
      }
      resolve(false);
    }
  });
}

/** Ce que la base rend pour une clé, en annonces entières, ou rien. Un relevé
 *  enregistré à l'ancien format, réduit à quatorze champs, se relit aussi :
 *  `versListing` le complète, la station tirée de la clé. Une annonce située
 *  retrouve la remontée la plus proche (`remesurerRemontee`) : celles
 *  enregistrées jusqu'au correctif du 25 septembre 2026 ne lisaient que la
 *  liste de gares de leur station, incomplète pour plusieurs d'entre elles. */
function annoncesLues(v: unknown, cle: string): AnnonceRetenue[] | null {
  if (!Array.isArray(v)) return null;
  const stationId = stationDeCle(cle);
  return v.flatMap((a) => {
    const l = versListing(a, stationId);
    return l ? [remesurerRemontee(l)] : [];
  });
}

/** L'ancien format ne portait pas le champ `lat` ; le format actuel le porte
 *  toujours, fût-il nul. */
function aLAncienFormat(v: unknown): boolean {
  return Array.isArray(v) && v.some((a) => !!a && typeof a === "object" && !("lat" in a));
}

/** Lit un lot de clés en une transaction, et range ce qui manque encore en mémoire. */
async function lireLot(cles: readonly string[]): Promise<void> {
  const lues = new Map<string, AnnonceRetenue[]>();
  const vieilles = new Set<string>();
  await transaction("readonly", (m) => {
    for (const k of cles) {
      const req = m.get(k);
      req.onsuccess = () => {
        const a = annoncesLues(req.result, k);
        if (a) lues.set(k, a);
        if (aLAncienFormat(req.result)) vieilles.add(k);
      };
    }
  });
  // Écrite ou oubliée pendant la lecture : la mémoire a le dernier mot.
  const neuves = cles.filter((k) => !connues.has(k));
  // La base fait foi : une clé relue à la demande d'un autre onglet remplace
  // ce que la mémoire en gardait, ou l'efface.
  for (const k of neuves) {
    connues.add(k);
    const a = lues.get(k);
    if (a) cache.set(k, a);
    else cache.delete(k);
    if (a && vieilles.has(k)) anciennes.add(k);
    else anciennes.delete(k);
  }
  signaler(neuves);
}

function charger(cles: readonly string[]): Promise<void> {
  const attendre: Promise<void>[] = [];
  const manquantes: string[] = [];
  for (const k of new Set(cles)) {
    if (connues.has(k)) continue;
    const vol = enLecture.get(k);
    if (vol) attendre.push(vol);
    else manquantes.push(k);
  }
  if (manquantes.length > 0) {
    const lecture = lireLot(manquantes).finally(() => {
      for (const k of manquantes) enLecture.delete(k);
    });
    for (const k of manquantes) enLecture.set(k, lecture);
    attendre.push(lecture);
  }
  return Promise.all(attendre).then(() => undefined);
}

/* ---------- API ---------- */

/** Remplace les annonces d'une clé. La mémoire suit aussitôt, la base ensuite. */
export async function ecrireAnnonces(cle: string, a: readonly AnnonceRetenue[]): Promise<void> {
  const copie = [...a];
  cache.set(cle, copie);
  anciennes.delete(cle);
  connues.add(cle);
  ecrites.set(cle, ++rang);
  signaler([cle]);
  const ok = await transaction("readwrite", (m) => {
    m.put(copie, cle);
  });
  if (ok) canal?.postMessage(cle);
}

/** Retire les annonces d'une clé : un relevé en échec n'en a aucune, et celles
 *  d'un relevé plus ancien ne valent plus. À distinguer d'une liste vide, qui
 *  dit qu'un relevé fait n'a rien retenu. */
export async function oublierAnnonces(cle: string): Promise<void> {
  cache.delete(cle);
  anciennes.delete(cle);
  connues.add(cle);
  signaler([cle]);
  const ok = await transaction("readwrite", (m) => {
    m.delete(cle);
  });
  if (ok) canal?.postMessage(cle);
}

/** `null` : rien d'écrit pour cette clé. */
export async function lireAnnonces(cle: string): Promise<AnnonceRetenue[] | null> {
  await charger([cle]);
  return cache.get(cle) ?? null;
}

/** Oublie toute clé hors de `garder`, en mémoire comme dans la base. Une clé
 *  écrite après l'appel reste : elle vient d'un résultat plus récent que `garder`. */
export async function oublierAnnoncesSauf(garder: ReadonlySet<string>): Promise<void> {
  const depart = rang;
  const garde = (k: IDBValidKey) =>
    typeof k === "string" && (garder.has(k) || (ecrites.get(k) ?? 0) > depart);

  const parties = [...cache.keys()].filter((k) => !garde(k));
  for (const k of parties) {
    cache.delete(k);
    anciennes.delete(k);
  }
  // Une lecture en vol ne ramènera pas en mémoire ce qu'on oublie.
  const coupees = [...enLecture.keys()].filter((k) => !garde(k) && !connues.has(k));
  for (const k of coupees) connues.add(k);
  signaler([...parties, ...coupees]);

  await transaction("readwrite", (m) => {
    const req = m.getAllKeys();
    req.onsuccess = () => {
      for (const k of req.result) if (!garde(k)) m.delete(k);
    };
  });
}

type Sejour = { checkIn: string; checkOut: string };

function pourSejour(a: Listing, sejour: Sejour | undefined): boolean {
  return !!sejour && a.pricedCheckIn === sejour.checkIn && a.pricedCheckOut === sejour.checkOut;
}

/** `a` passe devant `b` : tarifée pour le séjour quand `b` ne l'est pas, sinon plus récente. */
function passeDevant(a: Listing, b: Listing, sejour: Sejour | undefined): boolean {
  const ici = pourSejour(a, sejour);
  if (ici !== pourSejour(b, sejour)) return ici;
  return (a.scannedAt ?? 0) > (b.scannedAt ?? 0);
}

/**
 * Une annonce retenue par un relevé, cherchée dans toutes les clés en mémoire :
 * un logement choisi dans l'onglet budget n'est ni dans les annonces en direct
 * ni dans le relevé figé, et Réservation doit le retrouver. La même annonce
 * peut sortir de plusieurs relevés (autres dates, autre groupe) : celle
 * tarifée pour `sejour` passe devant, puis la plus récemment relevée.
 */
export function annonceEnMemoire(id: string, sejour?: Sejour): Listing | undefined {
  let trouvee: Listing | undefined;
  for (const liste of cache.values()) {
    for (const a of liste) {
      if (a.id === id && (!trouvee || passeDevant(a, trouvee, sejour))) trouvee = a;
    }
  }
  return trouvee;
}

/* ---------- Vue ---------- */

export type VueAnnonces = {
  parCle: ReadonlyMap<string, readonly AnnonceRetenue[]>;
  /** Toutes les clés demandées ont été lues. */
  pret: boolean;
  /** Clés demandées relues à l'ancien format : leurs annonces n'ont pas de position. */
  anciennes: readonly string[];
};

/** Séparateur des clés : une clé de résultat n'a jamais de saut de ligne. */
const SEP = "\n";

function decouper(liste: string): string[] {
  return liste === "" ? [] : liste.split(SEP);
}

function signature(cles: readonly string[]): string {
  return cles.map((k) => crans.get(k) ?? 0).join(",");
}

function construire(cles: readonly string[]): VueAnnonces {
  const parCle = new Map<string, readonly AnnonceRetenue[]>();
  let pret = true;
  const vieilles: string[] = [];
  for (const k of cles) {
    const a = cache.get(k);
    if (a) parCle.set(k, a);
    if (a && anciennes.has(k)) vieilles.push(k);
    if (!connues.has(k)) pret = false;
  }
  return { parCle, pret, anciennes: vieilles };
}

/**
 * Charge les clés demandées (cache mémoire d'abord), et se met à jour quand la
 * boucle écrit une station. `pret` : toutes les clés demandées ont été lues.
 */
export function useAnnonces(cles: readonly string[]): VueAnnonces {
  // Une chaîne, pas le tableau : un tableau neuf au même contenu ne relance rien.
  const liste = cles.join(SEP);
  const memo = useRef<{ liste: string; sig: string; vue: VueAnnonces } | null>(null);
  const lire = useCallback(() => {
    const ks = decouper(liste);
    const sig = signature(ks);
    const m = memo.current;
    if (m && m.liste === liste && m.sig === sig) return m.vue;
    const vue = construire(ks);
    memo.current = { liste, sig, vue };
    return vue;
  }, [liste]);
  const vue = useSyncExternalStore(abonner, lire, lire);
  useEffect(() => {
    void charger(decouper(liste));
  }, [liste]);
  return vue;
}
