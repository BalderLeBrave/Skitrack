/**
 * Ce qu'une annonce doit porter pour servir dans Skitrack, et ce qui manque.
 *
 * Le collecteur ne jette plus une fiche incomplète : c'est l'écran qui la
 * montre, et qui dit le trou. Un `total` à 0 n'est pas un prix, une capacité
 * `null` n'est pas zéro personne, un GPS absent n'est pas « loin des pistes ».
 */

import { tr } from "../i18n/tr.ts";

export const TROUS = ["prix", "capacite", "chambres", "gps", "photo", "url"] as const;
export type Trou = (typeof TROUS)[number];

export type Completude = {
  ok: boolean;
  trous: Trou[];
};

export type SujetCompletude = {
  total: number;
  capacity: number | null;
  bedrooms: number | null;
  rooms?: number | null;
  lat: number | null;
  lon: number | null;
  /** `triangule` : un point posé par l'écran (`placerSansPoint`), pas publié. */
  gpsSource?: string | null;
  photo: string | null;
  photos?: string[] | null;
  url: string | null;
};

export function completudeOf(l: SujetCompletude): Completude {
  const trous: Trou[] = [];
  if (!(l.total > 0)) trous.push("prix");
  if (l.capacity == null) trous.push("capacite");
  if (l.bedrooms == null && (l.rooms == null || l.rooms <= 0)) trous.push("chambres");
  // Une position triangulée ne bouche pas le trou : aucune source ne l'a publiée.
  if (l.lat == null || l.lon == null || l.gpsSource === "triangule") trous.push("gps");
  if (galerieOf(l).length === 0) trous.push("photo");
  if (!l.url) trous.push("url");
  return { ok: trous.length === 0, trous };
}

export function trouLbl(t: Trou): string {
  switch (t) {
    case "prix":
      return tr("prix non publié");
    case "capacite":
      return tr("capacité non renseignée");
    case "chambres":
      return tr("chambres non renseignées");
    case "gps":
      return tr("GPS manquant");
    case "photo":
      return tr("photo manquante");
    case "url":
      return tr("lien manquant");
  }
}

/** Photos de la tuile, première d'abord, sans doublon. */
export function galerieOf(l: { photo: string | null; photos?: string[] | null }): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of [l.photo, ...(l.photos ?? [])]) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export function trouCourt(t: Trou): string {
  switch (t) {
    case "prix":
      return tr("sans prix");
    case "capacite":
      return tr("sans capacité");
    case "chambres":
      return tr("sans nombre de chambres");
    case "gps":
      return tr("sans GPS");
    case "photo":
      return tr("sans photo");
    case "url":
      return tr("sans lien");
  }
}

export function trousCompte(rows: SujetCompletude[]): Record<Trou, number> {
  const n: Record<Trou, number> = {
    prix: 0,
    capacite: 0,
    chambres: 0,
    gps: 0,
    photo: 0,
    url: 0,
  };
  for (const l of rows) {
    for (const t of completudeOf(l).trous) n[t] += 1;
  }
  return n;
}

/** « 8 sans GPS, 4 sans capacité » — vide si tout est plein. */
export function trousPhrase(rows: SujetCompletude[]): string {
  const n = trousCompte(rows);
  return TROUS.filter((t) => n[t] > 0)
    .map((t) => `${n[t]} ${trouCourt(t)}`)
    .join(", ");
}
