/**
 * Communes, communes déléguées, villes et villages (GeoNames) de France,
 * et la station qu'ils désignent.
 *
 * Un lieu dans le polygone d'un domaine (OpenSkiMap) désigne ce domaine :
 * Lamoura est aux Rousses, même si le pin de Monts Jura est plus près.
 * Les villages déjà rattachés à une station (`villages.ts`) gardent cette
 * station. Chaque nom du classeur France Montagnes et chaque station
 * OpenSkiMap en activité en France y est aussi, même si l'orthographe
 * n'est pas celle du référentiel (« Avoriaz 1800 », « Gourrette »).
 * Tous les autres désignent la station la plus proche, sans limite
 * de distance : Paris désigne La Loge des Gardes, à 335 km.
 */

import { foldName } from "./carte.ts";
import { STATIONS, stationById } from "./stations.ts";
import { VILLAGES } from "./villages.ts";

type Fichier = { ids: string[]; lieux: [string, number, number, number][] };

/**
 * La liste (2 Mo, 77 000 lieux) n'est pas dans le paquet de départ, que
 * toutes les pages chargent : elle arrive au premier besoin
 * (`chargerCommunes`, le champ Destination), et son index se prépare à
 * l'arrivée, pas à la première frappe. Avant : aucune commune proposée.
 */
let fichier: Fichier | null = null;
let chargement: Promise<void> | null = null;
const abonnes = new Set<() => void>();

export function chargerCommunes(): Promise<void> {
  chargement ??= import("./communesProches.json", { with: { type: "json" } }).then(
    (m) => {
      fichier = m.default as Fichier;
      index();
      for (const f of abonnes) f();
    },
    (e: unknown) => {
      // Un échec de chargement se retente au besoin suivant.
      chargement = null;
      throw e;
    },
  );
  return chargement;
}

export function communesChargees(): boolean {
  return trie != null;
}

/** Prévient quand la liste est arrivée ; rend de quoi se désabonner. */
export function surCommunesChargees(f: () => void): () => void {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

export type CommuneTrouvee = {
  nom: string;
  stationId: string;
  /** Distance au repère de la station, en kilomètres. */
  km: number;
  /** Vrai quand le lieu est dans le domaine, pas seulement le plus proche. */
  domaine: boolean;
};

type Entree = CommuneTrouvee & { f: string };

let trie: Entree[] | null = null;

function index(): Entree[] {
  if (trie) return trie;
  if (!fichier) return [];
  const { ids, lieux } = fichier;
  const t = lieux.map(([nom, i, km, domaine]) => ({
    f: foldName(nom),
    nom,
    stationId: ids[i] ?? "",
    km,
    domaine: domaine === 1,
  }));
  t.sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : 0));
  trie = t;
  return trie;
}

/** Les lieux dont le nom replié commence par `q`, déjà triés. */
function aPartirDe(q: string): Entree[] {
  const t = index();
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (t[m].f < q) lo = m + 1;
    else hi = m;
  }
  const out: Entree[] = [];
  for (let i = lo; i < t.length && t[i].f.startsWith(q); i++) out.push(t[i]);
  return out;
}

/** Le nom est celui d'une station du référentiel. */
function stationDuNom(q: string): string | null {
  return STATIONS.find((s) => foldName(s.name) === q)?.id ?? null;
}

/** Le nom est un village déjà rattaché (`villages.ts`), pas le pin le plus proche. */
function villageImpose(q: string): string | null {
  for (const v of VILLAGES) {
    if (foldName(v.nom) === q) return v.station;
    for (const a of v.alias ?? []) if (foldName(a) === q) return v.station;
  }
  return null;
}

/** Une ligne qui contredit la station ou le village de ce nom. */
function contredit(e: Entree): boolean {
  const homonyme = stationDuNom(e.f);
  if (homonyme && homonyme !== e.stationId) return true;
  const impose = villageImpose(e.f);
  return impose != null && impose !== e.stationId;
}
function stationNommee(e: Entree, q: string): boolean {
  const s = stationById(e.stationId);
  if (!s) return false;
  const n = foldName(s.name);
  const d = foldName(s.domain ?? "");
  return n.includes(q) || d.includes(q) || (n.length >= 5 && q.includes(n));
}

/** Au-delà, le « domaine » est un polygone trop large : Névache n'est pas
 *  Saint-Colomban-des-Villards, à 44 km. */
const DOMAINE_KM = 12;

function dansLeDomaine(e: Entree): boolean {
  return e.domaine && e.km <= DOMAINE_KM;
}

function comparer(a: Entree, b: Entree, q: string): number {
  const ae = a.f === q ? 0 : 1;
  const be = b.f === q ? 0 : 1;
  if (ae !== be) return ae - be;
  if (a.f === q) {
    const an = stationNommee(a, q) ? 0 : 1;
    const bn = stationNommee(b, q) ? 0 : 1;
    if (an !== bn) return an - bn;
  }
  if (dansLeDomaine(a) !== dansLeDomaine(b)) return dansLeDomaine(a) ? -1 : 1;
  return a.km - b.km || a.nom.localeCompare(b.nom, "fr");
}
export function communesPour(q: string): CommuneTrouvee[] {
  if (q.length < 3) return [];
  const hits = aPartirDe(q).slice().sort((a, b) => comparer(a, b, q));
  const vus = new Set<string>();
  const out: CommuneTrouvee[] = [];
  for (const h of hits) {
    const cle = `${h.stationId}|${h.f}`;
    if (vus.has(cle) || !h.stationId || contredit(h)) continue;
    vus.add(cle);
    out.push({ nom: h.nom, stationId: h.stationId, km: h.km, domaine: dansLeDomaine(h) });
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * La station d'un lieu nommé en toutes lettres, ou `null`.
 * Plusieurs homonymes : celui dont la station porte ce nom, sinon le plus
 * proche d'une station. Avant `chargerCommunes` : les seuls noms de station
 * et de village rattaché.
 */
export function stationIdDeLaCommune(texte: string): string | null {
  const q = foldName(texte);
  if (q.length < 3) return null;
  // « La Norma » est la station, même si un relevé l'a posée sur Valfréjus.
  // « Lanslevillard » reste Val Cenis, pas Bessans dont le pin est plus près.
  const homonyme = stationDuNom(q);
  if (homonyme) return homonyme;
  const impose = villageImpose(q);
  if (impose) return impose;
  let best: Entree | null = null;
  for (const e of aPartirDe(q)) {
    if (e.f !== q || !e.stationId) continue;
    if (!best || comparer(e, best, q) < 0) best = e;
  }
  return best?.stationId ?? null;
}
