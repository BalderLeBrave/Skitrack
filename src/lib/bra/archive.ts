/**
 * L'archive publique des bulletins d'avalanche, sur data.gouv.fr.
 *
 * Météo-France dépose chaque bulletin, en PDF et en XML, dans une arborescence
 * datée, sous Licence Ouverte 2.0 : aucune clé, aucun compte. Le XML est celui
 * que sert l'API « Données Publiques BRA », attributs compris ; `parseBulletin`
 * le lit tel quel.
 *
 *   https://files.data.gouv.fr/meteofrance/data/BULLETIN/BRA/AAAA/MM/JJ/xml/<Massif>_<AAAAMMJJhhmmss>.xml
 *
 * Le nom de fichier porte le massif sous une graphie à lui (« Orlu
 * St-Barthelemy », « Pays-Basque », « Devoluy ») : on le rapproche de
 * `MF_CODES` par une forme repliée, puis on vérifie l'attribut `ID` du fichier
 * lu, qui est le code du massif. Un fichier d'un autre massif est refusé.
 *
 * Module pur : lecture des index et choix du fichier. Le réseau est dans
 * `fetch.server.ts`.
 */

import { MF_CODES } from "./massifs.ts";

export const ARCHIVE_BRA = "https://files.data.gouv.fr/meteofrance/data/BULLETIN/BRA";

/** Minuscules, sans accents, « saint » abrégé comme dans les noms de fichier,
 *  sans séparateurs : « Orlu-Saint-Barthélemy » et « Orlu St-Barthelemy »
 *  donnent la même forme. */
export function plierNomMassif(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bsaint\b/g, "st")
    .replace(/[^a-z0-9]+/g, "");
}

const CODE_PAR_NOM = new Map(Object.entries(MF_CODES).map(([nom, code]) => [plierNomMassif(nom), code]));

/** Le code Météo-France d'un nom de massif tel que l'archive l'écrit. */
export function codeDuNomArchive(nom: string): number | null {
  return CODE_PAR_NOM.get(plierNomMassif(nom)) ?? null;
}

export type FichierBra = {
  /** Nom du massif tel qu'écrit dans le nom de fichier, décodé. */
  nom: string;
  code: number | null;
  /** `AAAAMMJJhhmmss`, heure de Paris, telle que dans le nom de fichier. */
  horodatage: string;
  url: string;
};

/** Les fichiers XML d'un index journalier (`…/AAAA/MM/JJ/xml/`). */
export function lireIndexJour(html: string, base = "https://files.data.gouv.fr"): FichierBra[] {
  const out: FichierBra[] = [];
  const vus = new Set<string>();
  for (const m of html.matchAll(/href="([^"]*\/xml\/([^"/]+?)_(\d{14})\.xml)"/g)) {
    const href = m[1]!;
    // Seule l'arborescence du BRA est suivie : un lien vers un autre hôte ou
    // un autre dossier, dans un index altéré, ne serait pas lu.
    if (!href.startsWith("/meteofrance/data/BULLETIN/BRA/") && !href.startsWith(`${ARCHIVE_BRA}/`)) continue;
    if (vus.has(href)) continue;
    vus.add(href);
    let nom: string;
    try {
      nom = decodeURIComponent(m[2]!);
    } catch {
      nom = m[2]!;
    }
    out.push({
      nom,
      code: codeDuNomArchive(nom),
      horodatage: m[3]!,
      url: href.startsWith("http") ? href : `${base}${href.startsWith("/") ? "" : "/"}${href}`,
    });
  }
  return out;
}

/** Le bulletin le plus récent d'un massif dans un index, s'il y en a un.
 *  Un massif peut en publier deux le même jour : une mise à jour du matin,
 *  puis celui de l'après-midi. */
export function dernierDuMassif(fichiers: readonly FichierBra[], code: number): FichierBra | null {
  let meilleur: FichierBra | null = null;
  for (const f of fichiers) {
    if (f.code !== code) continue;
    if (!meilleur || f.horodatage > meilleur.horodatage) meilleur = f;
  }
  return meilleur;
}

/** Les sous-dossiers numériques d'un index (`2026/`, `06/`, `07/`), croissants. */
export function lireSousDossiers(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="[^"]*\/(\d{2,4})\/"/g)) out.add(m[1]!);
  return [...out].sort();
}

/** `AAAA/MM/JJ` du jour de Paris, `decalage` jours avant `maintenant`. */
export function cheminJour(maintenant: Date, decalage = 0): string {
  const d = new Date(maintenant.getTime() - decalage * 86_400_000);
  const parties = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const v = (t: string) => parties.find((p) => p.type === t)?.value ?? "";
  return `${v("year")}/${v("month")}/${v("day")}`;
}

/** « 7 juin 2026 » pour un chemin `2026/06/07`. */
export function jourLisible(chemin: string): string | null {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(chemin);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
