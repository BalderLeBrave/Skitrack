/**
 * Crédit des photos de station.
 *
 * Ce module ne reprend rien : il n'existait pas. Les 231 photos du relevé sont
 * publiées par deux sources, et la seule information fiable dont l'application
 * dispose sur l'origine d'une image est **l'hôte de l'URL relevée** dans
 * `skiinfo.photos.json`. Le crédit s'en déduit, ce qui couvre les 231 sans
 * qu'aucune liste ne soit à tenir à jour, et sans qu'une station ajoutée
 * demain sorte sans crédit.
 *
 * Ce que la dérivation ne sait pas dire, c'est le nom de l'auteur : l'hôte dit
 * qui publie, pas qui a pris la photo. `photo-credits.overrides.json` sert à
 * cela, une entrée à la fois, quand l'auteur est connu et vérifié. Le même
 * fichier porte `removed`, qui retire une photo lorsque sa source le demande :
 * la ligne reste, avec la raison, pour que personne ne la remette par
 * inadvertance au prochain rafraîchissement du relevé.
 *
 * Un hôte inconnu ne produit aucun crédit, et l'écran n'affiche rien : un
 * crédit deviné est un crédit faux.
 */

import overridesRaw from "./photo-credits.overrides.json" with { type: "json" };
import { SKIINFO_PHOTOS } from "./skiinfo.ts";
import { resolveStationPhoto } from "./stationPhoto.ts";

export type PhotoSource = {
  /** Nom affiché de la source qui publie la photo. */
  name: string;
  /** Page d'accueil de la source, pour qui veut la retrouver. */
  home: string;
};

export type PhotoCredit = {
  source: PhotoSource;
  /** Auteur nommé, quand il est connu et déclaré. Sinon `null`. */
  author: string | null;
  /** Station dont la photo est empruntée. `null` quand c'est la sienne. */
  borrowedFrom: string | null;
  /** Ligne prête à afficher : « Photo Skiinfo » ou « Photo Untel / Skiinfo ». */
  label: string;
};

export type PhotoOverride = {
  author?: string | null;
  /** Retirée à la demande de la source : rien n'est affiché, rien n'est chargé. */
  removed?: boolean;
  /** Pourquoi, en clair, pour la prochaine personne qui lit ce fichier. */
  note?: string;
};

/** Hôtes relevés dans `skiinfo.photos.json`, et ce qu'ils désignent. */
const HOSTS: Record<string, PhotoSource> = {
  "cdn.bfldr.com": { name: "Skiinfo", home: "https://www.skiinfo.fr/" },
  "img1.onthesnow.com": { name: "OnTheSnow", home: "https://www.onthesnow.fr/" },
};

const OVERRIDES: Record<string, PhotoOverride> = (
  overridesRaw as { rows: Record<string, PhotoOverride> }
).rows;

/** Source d'un hôte. `null` si l'hôte n'est pas connu : on n'invente pas. */
export function sourceForHost(host: string): PhotoSource | null {
  return HOSTS[host.toLowerCase()] ?? null;
}

/** Source d'une URL relevée. `null` si l'URL est illisible ou l'hôte inconnu. */
export function sourceForUrl(url: string | null | undefined): PhotoSource | null {
  if (!url) return null;
  try {
    return sourceForHost(new URL(url).host);
  } catch {
    return null;
  }
}

/** Retirée à la demande de sa source : ni photo, ni crédit. */
export function isPhotoRemoved(stationId: string): boolean {
  return OVERRIDES[stationId]?.removed === true;
}

/**
 * Crédit de la photo d'une station.
 *
 * `null` quand la station n'a pas de photo relevée, quand l'hôte n'est pas
 * reconnu, ou quand la photo a été retirée. L'écran n'affiche alors rien.
 */
export function photoCreditFor(stationId: string): PhotoCredit | null {
  if (isPhotoRemoved(stationId)) return null;
  // Le crédit porte sur le fichier **affiché**. Quand la station emprunte la
  // photo de son domaine, c'est celle du donneur qu'il faut créditer, et
  // l'emprunt doit se lire : présenter la photo de La Plagne comme celle
  // d'Aime 2000 serait faux, même si le domaine est le même.
  const resolved = resolveStationPhoto(stationId);
  if (!resolved) return null;
  const creditedId = resolved.fromId ?? stationId;
  if (isPhotoRemoved(creditedId)) return null;
  const source = sourceForUrl(SKIINFO_PHOTOS[creditedId]);
  if (!source) return null;
  const author = OVERRIDES[creditedId]?.author ?? null;
  const base = author ? `Photo ${author} / ${source.name}` : `Photo ${source.name}`;
  return {
    source,
    author,
    borrowedFrom: resolved.fromName,
    label: resolved.fromName ? `${base} · ${resolved.fromName}, même domaine` : base,
  };
}

/** Couverture de la dérivation, pour l'audit : combien de photos sans crédit. */
export function photoCreditCoverage(): {
  total: number;
  credites: number;
  sansCredit: string[];
  retirees: string[];
} {
  const sansCredit: string[] = [];
  const retirees: string[] = [];
  let credites = 0;
  for (const id of Object.keys(SKIINFO_PHOTOS)) {
    if (isPhotoRemoved(id)) {
      retirees.push(id);
      continue;
    }
    if (photoCreditFor(id)) credites += 1;
    else sansCredit.push(id);
  }
  return { total: Object.keys(SKIINFO_PHOTOS).length, credites, sansCredit, retirees };
}
