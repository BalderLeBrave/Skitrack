import type { Listing } from "@/lib/listings";

/**
 * Un même logement, vendu sur plusieurs plateformes.
 *
 * Le relevé rend une annonce par plateforme : le même studio d'Avoriaz sort une
 * fois chez Abritel, une fois chez Booking, parfois une troisième chez Airbnb,
 * et l'écran les montrait côte à côte comme trois logements. On les réunit ici
 * en un logement, avec ses offres ; la moins chère se montre, les autres se
 * listent dans la fiche avec leur écart.
 *
 * **Deux preuves, et seulement deux.**
 *
 * 1. CozyCozy regroupe lui-même les offres d'un logement sous un identifiant
 *    (`accommodationId`), que le collecteur écrit dans l'identifiant de
 *    l'annonce (`abr-<id>`, `bk-<id>`, `abnb-<id>`). Deux annonces Cozy de
 *    même identifiant et de capacité compatible sont le même logement : 167 à
 *    Avoriaz, relevé du 23 septembre 2026, presque toutes de titre, capacité
 *    et position identiques.
 * 2. Hors de Cozy — un Airbnb relevé en direct face à son annonce Abritel —,
 *    le même titre exact sur deux plateformes, à moins de `RAYON_M`, avec une
 *    capacité compatible. 130 paires à Avoriaz, presque toutes à moins de 5 m.
 *
 * **Ce qui n'est jamais regroupé.** Un titre qu'une même plateforme porte deux
 * fois : c'est un type de logement (« Studio 2 personnes confort » dans une
 * résidence), pas un logement, et 154 titres l'étaient à Avoriaz. Deux offres
 * d'une même plateforme dans un même logement : ce sont deux logements. Et
 * rien sur la seule proximité : les lots d'une résidence partagent un point.
 * Mieux vaut un doublon visible qu'un logement perdu dans un autre.
 */

/** Distance au-delà de laquelle deux titres identiques ne sont pas le même bien. */
export const RAYON_M = 150;
/** Un titre plus court est trop commun pour prouver quoi que ce soit. */
const TITRE_MIN = 12;

export type Logement = {
  /** L'offre montrée par défaut : la moins chère des offres tarifées. */
  principale: Listing;
  /**
   * Toutes les offres du logement, la principale en tête, puis par prix
   * croissant ; celles qui n'ont pas publié de prix à la fin.
   */
  offres: Listing[];
};

/** L'identifiant de logement que CozyCozy a donné à l'annonce, ou `null`. */
export function cleCozy(l: Pick<Listing, "id" | "proven">): string | null {
  if (!/^CozyCozy\b/.test(l.proven ?? "")) return null;
  const m = /^(?:abnb|abr|bk)-(.+)$/.exec(l.id);
  return m ? m[1] : null;
}

export function titreNormalise(t: string): string {
  return t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Les clés de titre d'une annonce : son titre normalisé, et ce même titre
 * privé de la référence que Booking ajoute à la fin (« … - Fr-1-123-45 »).
 * Sans la seconde, 473 logements vus chez Booking et ailleurs restaient en
 * double à Avoriaz, 383 d'entre eux au même prix à l'euro près.
 */
export function clesTitre(t: string): string[] {
  const plein = titreNormalise(t);
  return [...new Set([plein, plein.replace(/ fr 1 \d+ \d+$/, "")])];
}

function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.hypot(x, y) * 6_371_000;
}

/**
 * Deux offres peuvent-elles décrire le même bien ? Une capacité égale quand
 * les deux la publient, des chambres à une près — un studio s'écrit « 0
 * chambre » chez Airbnb et « 1 chambre » chez Abritel.
 *
 * Cozy lui-même n'y échappe pas : il range sous un même identifiant une offre
 * Booking de 4 personnes et 1 chambre, et l'offre Abritel de toute la
 * résidence, 6 personnes et 3 chambres, à 76 336 € (Avoriaz, 23 septembre
 * 2026).
 */
function capaciteCompatible(a: Listing, b: Listing): boolean {
  if (a.guests != null && b.guests != null && a.guests !== b.guests) return false;
  if (a.bedrooms != null && b.bedrooms != null && Math.abs(a.bedrooms - b.bedrooms) > 1) return false;
  return true;
}

/**
 * Deux annonces de même titre sont-elles le même bien ? Il faut en plus une
 * position connue des deux côtés, et proche.
 */
function memeBien(a: Listing, b: Listing): boolean {
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return false;
  if (distanceM({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }) > RAYON_M) return false;
  return capaciteCompatible(a, b);
}

/** Rang de prix : ce qui n'est pas publié passe après, jamais en tête. */
function parPrix(a: Listing, b: Listing): number {
  const pa = a.total > 0 ? a.total : null;
  const pb = b.total > 0 ? b.total : null;
  if (pa == null && pb == null) return 0;
  if (pa == null) return 1;
  if (pb == null) return -1;
  // Deux devises ne se comparent pas : l'euro, monnaie de l'écran, d'abord.
  if (a.currency !== b.currency) return a.currency === "EUR" ? -1 : b.currency === "EUR" ? 1 : 0;
  return pa - pb;
}

/**
 * Réunit les annonces d'un même logement. L'ordre des logements rendus est
 * celui de la première de leurs annonces dans l'entrée : un tri fait avant
 * reste valable.
 */
export function regrouper(listings: readonly Listing[]): Logement[] {
  const n = listings.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  // Les plateformes de chaque groupe, tenues à la racine : c'est ce qui
  // interdit d'y faire entrer une seconde offre d'une même plateforme.
  const sources = listings.map((l) => new Set<string>([l.source]));
  const racine = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const unir = (i: number, j: number) => {
    const a = racine(i);
    const b = racine(j);
    if (a === b) return;
    for (const s of sources[b]) if (sources[a].has(s)) return;
    const [haut, bas] = a < b ? [a, b] : [b, a];
    parent[bas] = haut;
    for (const s of sources[bas]) sources[haut].add(s);
  };

  // 1. Les groupes que CozyCozy a formés.
  const parCle = new Map<string, number>();
  listings.forEach((l, i) => {
    const k = cleCozy(l);
    if (k == null) return;
    const j = parCle.get(k);
    if (j == null) parCle.set(k, i);
    else if (capaciteCompatible(listings[j], l)) unir(j, i);
  });

  // 2. Le même titre exact sur deux plateformes, au même endroit.
  const parTitre = new Map<string, number[]>();
  listings.forEach((l, i) => {
    for (const t of clesTitre(l.title)) {
      if (t.length < TITRE_MIN || !t.includes(" ")) continue;
      const liste = parTitre.get(t);
      if (liste) liste.push(i);
      else parTitre.set(t, [i]);
    }
  });
  for (const idx of parTitre.values()) {
    if (idx.length < 2) continue;
    // Un titre qu'une plateforme porte deux fois désigne un type, pas un bien.
    const vus = new Set<string>();
    let ambigu = false;
    for (const i of idx) {
      const s = listings[i].source;
      if (vus.has(s)) ambigu = true;
      vus.add(s);
    }
    if (ambigu) continue;
    for (let a = 0; a < idx.length; a += 1) {
      for (let b = a + 1; b < idx.length; b += 1) {
        if (memeBien(listings[idx[a]], listings[idx[b]])) unir(idx[a], idx[b]);
      }
    }
  }

  const groupes = new Map<number, Listing[]>();
  const ordre: number[] = [];
  listings.forEach((l, i) => {
    const r = racine(i);
    const g = groupes.get(r);
    if (g) g.push(l);
    else {
      groupes.set(r, [l]);
      ordre.push(r);
    }
  });
  return ordre.map((r) => {
    const offres = [...(groupes.get(r) as Listing[])].sort(parPrix);
    return { principale: offres[0], offres };
  });
}

/**
 * L'écart d'une offre avec la principale, en unité de devise, ou `null` quand
 * il ne se calcule pas : prix non publié d'un côté ou de l'autre, ou devises
 * différentes.
 */
export function ecartAvecPrincipale(offre: Listing, principale: Listing): number | null {
  if (!(offre.total > 0) || !(principale.total > 0)) return null;
  if (offre.currency !== principale.currency) return null;
  return offre.total - principale.total;
}

/** L'étiquette de la carte d'annonce : « Abritel », ou « Airbnb + 2 ». */
export function sourcesLbl(g: Logement): string {
  const autres = g.offres.length - 1;
  return autres > 0 ? `${g.principale.source} + ${autres}` : g.principale.source;
}
