/**
 * La fiche d'une annonce CozyCozy : ce que la page de Cozy affiche quand on
 * ouvre un logement, et que la liste de résultats ne porte pas.
 *
 * La liste (`getResultList`, `cozy.server.ts`) ne donne que trois vignettes
 * (`lightThumbnails.firstUrls` et `lastUrl`), la note et le nombre d'avis.
 * La fiche ouverte en demande trois autres, relevées le 16 octobre 2026 aux
 * 2 Alpes dans le code de la page (`backend.getDetails`, `getPhotos`,
 * `getReviews`) et sur leurs réponses :
 *
 * - `getDetails` `{uid, searchId}` : `description`, `amenities[{code, name}]`
 *   (libellés en français), `goodToKnow` (heures d'arrivée et de départ,
 *   animaux, fumeurs, fêtes), `space` (surface, chambres, salles de bain,
 *   capacité), `ratingScore` (sur 100) et `ratingCount` ;
 * - `getPhotos` `{uid, searchId}` : la galerie entière, `[{url, thumbnailUrl}]`
 *   (`url` en grand format) ; `lightThumbnails.count` de la liste en donne le
 *   nombre ;
 * - `getReviews` `{uid, searchId, maxCount, maxCountPerProvider, timeout}` :
 *   les avis, `score` sur 100, `title`, `pros`, `cons`, `reviewerName`, `date`
 *   en `[année, mois, jour, …]`. Vide pour Abritel, et pour la plupart des
 *   annonces Airbnb et Booking : la page de Cozy n'en montre alors que la
 *   note et le nombre (vu le 16 octobre sur des fiches à 43 et 60 avis).
 *
 * `uid` est celui de l'entrée de la liste (`"52576209-1272"`), `searchId`
 * celui de la recherche qui l'a rendue (`/api/launch`). Un `searchId` reste
 * valable bien après la recherche (plus de 40 minutes, vu le 16 octobre).
 *
 * Module pur : ce que la liste dit de chaque fiche (`refsCozy`), et ce que
 * les trois réponses donnent (`ficheCozy`). Le réseau est dans
 * `cozyFiches.server.ts`.
 */

import type { Listing } from "../listings.ts";
import { ficheDepuisBrut, type FicheEnrichie } from "../stay/ficheEnrichie.ts";

/** De quoi demander la fiche d'une annonce de la liste. */
export type RefCozy = {
  accommodationId: string;
  uid: string;
  searchId: string;
  /** `lightThumbnails.count` : le nombre de photos de la galerie entière. */
  photos: number | null;
};

/** Les trois réponses de la fiche, telles que Cozy les rend. */
export type ReponsesCozy = {
  details: unknown;
  photos?: unknown;
  avis?: unknown;
};

function objet(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function texte(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function idTexte(v: unknown): string | null {
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return v.trim();
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return String(v);
  return null;
}

function adresse(v: unknown): string | null {
  const t = texte(v);
  if (!t) return null;
  if (t.startsWith("//")) return `https:${t}`;
  return /^https:\/\//i.test(t) ? t : null;
}

/**
 * Ce que chaque entrée de la liste dit de sa fiche : son `uid`, le
 * `searchId` de la page (que `collecterCozy` pose sur chaque page), et le
 * nombre de photos. Les entrées des bandeaux (`groups`) comptent aussi.
 */
export function refsCozy(payloads: readonly unknown[]): RefCozy[] {
  const out = new Map<string, RefCozy>();
  for (const p of payloads) {
    const page = objet(p);
    const searchId = texte(page?.searchId);
    if (!page || !searchId || !Array.isArray(page.entries)) continue;
    const prendre = (e: unknown) => {
      const o = objet(e);
      const accommodationId = idTexte(o?.accommodationId);
      const uid = texte(o?.uid);
      if (!o || !accommodationId || !uid) return;
      const vignettes = objet(o.lightThumbnails);
      const n = vignettes?.count;
      out.set(accommodationId, {
        accommodationId,
        uid,
        searchId,
        photos: typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null,
      });
    };
    for (const e of page.entries) {
      prendre(e);
      const groups = objet(e)?.groups;
      if (Array.isArray(groups)) for (const g of groups) prendre(g);
    }
  }
  return [...out.values()];
}

/**
 * L'hébergement Cozy d'une annonce que `cozyListings` a rendue : `abr-`,
 * `bk-` ou `abnb-` suivi de l'`accommodationId`, et une provenance
 * « CozyCozy … ». Le préfixe seul ne suffit pas : les relevés directs
 * numérotent aussi `abnb-<chambre>` et `bk-<hôtel>`, et un numéro commun
 * poserait sur l'annonce la fiche d'un autre logement. `null` pour toute
 * autre annonce.
 */
export function hebergementCozy(l: Pick<Listing, "id" | "proven">): string | null {
  if (!/^CozyCozy /.test(l.proven ?? "")) return null;
  return /^(?:abr|bk|abnb)-(\d+)$/.exec(l.id)?.[1] ?? null;
}

/** « 15:00 » tel quel ; une heure illisible n'est pas reprise. */
function heure(v: unknown): string | null {
  const t = texte(v);
  return t && /^\d{1,2}[:h]\d{2}$/.test(t) ? t.replace("h", ":") : null;
}

function ouiNon(v: unknown): "oui" | "non" | null {
  return v === true ? "oui" : v === false ? "non" : null;
}

/** `[2026, 8, 19, 0, 0, 0, 0]` : le 19 août 2026. */
function dateAvis(v: unknown): string | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const [a, m, j] = v;
  if (![a, m, j].every((x) => typeof x === "number" && Number.isInteger(x))) return null;
  if (m < 1 || m > 12 || j < 1 || j > 31) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
}

/** Le titre, les points forts puis les points faibles, chacun tel que publié. */
function texteAvis(r: Record<string, unknown>): string | null {
  const parts = [texte(r.title), texte(r.text), texte(r.pros), texte(r.cons)].filter((x): x is string => x != null);
  if (!parts.length) return null;
  return parts.map((p) => (/[.!?…]$/.test(p) ? p : `${p}.`)).join(" ");
}

/** La galerie de `getPhotos` : les grands formats, sinon les vignettes. */
export function galerieCozy(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const o = objet(x);
    const u = adresse(o?.url) ?? adresse(o?.thumbnailUrl);
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

/**
 * La fiche enrichie que publient les trois réponses, et la galerie entière.
 * Une réponse vide (`{}`, la recherche expirée côté Cozy) ne donne rien.
 */
export function ficheCozy(
  r: ReponsesCozy,
  opts: { url?: string | null; recupereLe?: string } = {},
): { fiche: FicheEnrichie | null; photos: string[] } {
  const d = objet(r.details) ?? {};
  const equipements = (Array.isArray(d.amenities) ? d.amenities : [])
    .map((a) => objet(a))
    .map((a) => texte(a?.name))
    .filter((x): x is string => x != null)
    .map((libelle) => ({ libelle, present: true }));
  const bon = objet(d.goodToKnow);
  const conditions = bon
    ? {
        arrivee: heure(bon.checkInTime),
        depart: heure(bon.checkOutTime),
        animaux: ouiNon(bon.petsAllowed),
        fumeurs: ouiNon(bon.smokingAllowed),
        fetes: ouiNon(bon.partyAllowed),
      }
    : null;
  const score = typeof d.ratingScore === "number" && d.ratingScore > 0 && d.ratingScore <= 100 ? d.ratingScore : null;
  const nombre = typeof d.ratingCount === "number" && Number.isInteger(d.ratingCount) ? d.ratingCount : null;
  const avisBruts = objet(r.avis)?.reviews;
  const extraits = (Array.isArray(avisBruts) ? avisBruts : [])
    .map((x) => objet(x))
    .filter((x): x is Record<string, unknown> => x != null)
    .map((x) => ({
      auteur: texte(x.reviewerName),
      date: dateAvis(x.date),
      noteSource: typeof x.score === "number" && x.score > 0 && x.score <= 100 ? x.score : null,
      texte: texteAvis(x),
    }))
    .filter((x) => x.texte != null);
  const avis =
    score != null || nombre || extraits.length
      ? { noteSource: score, echelleSource: 100, nombre, extraits }
      : null;
  const fiche = ficheDepuisBrut(
    { description: texte(d.description), equipements, conditions, avis },
    "cozy",
    opts,
  );
  return { fiche, photos: galerieCozy(r.photos) };
}
