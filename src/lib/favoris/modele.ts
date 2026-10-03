/**
 * Les favoris : des logements enregistrés dans des dossiers, comme les listes
 * d'Airbnb. Module pur ; le magasin persistant est `store.ts`.
 *
 * Une annonce n'existe nulle part ailleurs que dans le relevé du moment : la
 * liste en direct n'est pas gardée, et le relevé figé n'en tient qu'une
 * partie. Un favori garde donc **l'annonce entière** telle qu'on l'a
 * enregistrée (photo, prix, point), pour que son dossier se redessine après
 * un rechargement. Quand l'annonce repasse dans un relevé, `rafraichir`
 * remplace cette copie par la plus récente, sans perdre ce que la nouvelle
 * tait.
 *
 * Une annonce peut être dans plusieurs dossiers, une fois par dossier.
 */

import type { Listing } from "../listings.ts";

export type Dossier = {
  id: string;
  nom: string;
  /** ISO 8601. */
  creeLe: string;
  /** La dernière fois qu'on y a ajouté ou retiré un logement. */
  majLe: string;
};

/** Le séjour cherché quand le logement a été enregistré : ses prix valent pour lui. */
export type SejourFavori = { checkIn: string; checkOut: string; trav: number };

export type Favori = {
  annonceId: string;
  dossierId: string;
  ajouteLe: string;
  annonce: Listing;
  sejour: SejourFavori | null;
};

export type EtatFavoris = {
  dossiers: Dossier[];
  favoris: Favori[];
};

export const ETAT_VIDE: EtatFavoris = { dossiers: [], favoris: [] };

/** Au plus : un dossier se lit d'un coup d'œil, et la mémoire du navigateur est comptée. */
export const NOM_MAX = 60;
export const PHOTOS_GARDEES = 6;

/** Le nom d'un dossier : espaces repliés, borné ; `null` s'il est vide. */
export function nomDossier(nom: string): string | null {
  const n = nom.replace(/\s+/g, " ").trim().slice(0, NOM_MAX).trim();
  return n || null;
}

/** La copie gardée d'une annonce : sans la galerie entière, qui pèse et vieillit. */
export function copieAnnonce(l: Listing): Listing {
  return { ...l, photos: l.photos ? l.photos.slice(0, PHOTOS_GARDEES) : l.photos };
}

export function creerDossier(e: EtatFavoris, id: string, nom: string, maintenant: string): EtatFavoris {
  const n = nomDossier(nom);
  if (!n || e.dossiers.some((d) => d.id === id)) return e;
  return { ...e, dossiers: [...e.dossiers, { id, nom: n, creeLe: maintenant, majLe: maintenant }] };
}

export function renommerDossier(e: EtatFavoris, id: string, nom: string): EtatFavoris {
  const n = nomDossier(nom);
  if (!n) return e;
  return { ...e, dossiers: e.dossiers.map((d) => (d.id === id ? { ...d, nom: n } : d)) };
}

/** Supprime le dossier et ce qu'il contient ; les mêmes logements restent dans leurs autres dossiers. */
export function supprimerDossier(e: EtatFavoris, id: string): EtatFavoris {
  return { dossiers: e.dossiers.filter((d) => d.id !== id), favoris: e.favoris.filter((f) => f.dossierId !== id) };
}

function toucher(dossiers: Dossier[], id: string, maintenant: string): Dossier[] {
  return dossiers.map((d) => (d.id === id ? { ...d, majLe: maintenant } : d));
}

/** Enregistre l'annonce dans le dossier ; déjà dedans, sa copie est rafraîchie. */
export function enregistrer(
  e: EtatFavoris,
  annonce: Listing,
  dossierId: string,
  sejour: SejourFavori | null,
  maintenant: string,
): EtatFavoris {
  if (!e.dossiers.some((d) => d.id === dossierId)) return e;
  const copie = copieAnnonce(annonce);
  const deja = e.favoris.find((f) => f.annonceId === annonce.id && f.dossierId === dossierId);
  const favoris = deja
    ? e.favoris.map((f) => (f === deja ? { ...f, annonce: copie, sejour: sejour ?? f.sejour } : f))
    : [...e.favoris, { annonceId: annonce.id, dossierId, ajouteLe: maintenant, annonce: copie, sejour }];
  return { dossiers: toucher(e.dossiers, dossierId, maintenant), favoris };
}

/** Retire l'annonce d'un dossier, ou de tous (`dossierId` absent). */
export function retirer(e: EtatFavoris, annonceId: string, dossierId: string | null, maintenant: string): EtatFavoris {
  const touches = new Set<string>();
  const favoris = e.favoris.filter((f) => {
    const sort = f.annonceId === annonceId && (dossierId == null || f.dossierId === dossierId);
    if (sort) touches.add(f.dossierId);
    return !sort;
  });
  if (touches.size === 0) return e;
  let dossiers = e.dossiers;
  for (const id of touches) dossiers = toucher(dossiers, id, maintenant);
  return { dossiers, favoris };
}

/**
 * Remplace la copie des favoris par l'annonce relevée de nouveau. Un champ
 * que la nouvelle tait (photo, point, capacité) garde l'ancienne valeur ; un
 * prix nul ne remplace pas un prix relevé. Le prix ne change que pour le
 * séjour du favori (`sejour`, celui du relevé) : un prix relevé pour
 * d'autres dates ou un autre groupe n'est pas le sien. Rend l'état tel quel
 * si rien ne change.
 */
export function rafraichir(e: EtatFavoris, annonces: readonly Listing[], sejour: SejourFavori | null = null): EtatFavoris {
  if (e.favoris.length === 0 || annonces.length === 0) return e;
  const parId = new Map(annonces.map((l) => [l.id, l]));
  let change = false;
  const favoris = e.favoris.map((f) => {
    const neuve = parId.get(f.annonceId);
    if (!neuve) return f;
    const memeSejour = f.sejour == null || (sejour != null && memeSejourFavori(f.sejour, sejour));
    const fusion = copieAnnonce(fusionner(f.annonce, memeSejour ? neuve : sansPrix(neuve)));
    if (memeAnnonce(fusion, f.annonce)) return f;
    change = true;
    return { ...f, annonce: fusion };
  });
  return change ? { ...e, favoris } : e;
}

function memeSejourFavori(a: SejourFavori, b: SejourFavori): boolean {
  return a.checkIn === b.checkIn && a.checkOut === b.checkOut && a.trav === b.trav;
}

/** Les champs de prix d'une annonce, qui ne valent que pour son séjour. */
const CHAMPS_PRIX = ["total", "priceLabel", "priceIndicative", "pricedCheckIn", "pricedCheckOut", "skiPassIncluded"] as const;

function sansPrix(l: Listing): Listing {
  const out: Listing = { ...l, total: 0 };
  for (const k of CHAMPS_PRIX) if (k !== "total") delete (out as Record<string, unknown>)[k];
  return out;
}

function fusionner(ancienne: Listing, neuve: Listing): Listing {
  const out: Listing = { ...ancienne, ...neuve };
  for (const k of Object.keys(ancienne) as (keyof Listing)[]) {
    if ((neuve[k] === null || neuve[k] === undefined) && ancienne[k] != null) {
      (out as Record<string, unknown>)[k] = ancienne[k];
    }
  }
  if (!(neuve.total > 0) && ancienne.total > 0) {
    out.total = ancienne.total;
    out.priceLabel = ancienne.priceLabel;
  }
  return out;
}

function memeAnnonce(a: Listing, b: Listing): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Les dossiers où l'annonce est enregistrée. */
export function dossiersDe(e: EtatFavoris, annonceId: string): Dossier[] {
  const ids = new Set(e.favoris.filter((f) => f.annonceId === annonceId).map((f) => f.dossierId));
  return e.dossiers.filter((d) => ids.has(d.id));
}

/** Le contenu d'un dossier, le dernier enregistré d'abord. */
export function contenu(e: EtatFavoris, dossierId: string): Favori[] {
  return e.favoris.filter((f) => f.dossierId === dossierId).sort((a, b) => b.ajouteLe.localeCompare(a.ajouteLe));
}

/** Les logements enregistrés, chacun une fois, quel que soit le nombre de dossiers. */
export function nombreFavoris(e: EtatFavoris): number {
  return new Set(e.favoris.map((f) => f.annonceId)).size;
}

/** Les dossiers, le dernier modifié d'abord. */
export function dossiersRecents(e: EtatFavoris): Dossier[] {
  return [...e.dossiers].sort((a, b) => b.majLe.localeCompare(a.majLe));
}

/** Les photos de couverture d'un dossier : celles de ses derniers logements, trois au plus. */
export function couverture(e: EtatFavoris, dossierId: string): string[] {
  return contenu(e, dossierId)
    .map((f) => f.annonce.photo)
    .filter((p): p is string => Boolean(p))
    .slice(0, 3);
}

/** Lit un état gardé, en écartant ce qui ne tient pas debout. */
export function etatLu(brut: unknown): EtatFavoris {
  const o = brut && typeof brut === "object" ? (brut as Partial<EtatFavoris>) : {};
  const dossiers = Array.isArray(o.dossiers)
    ? o.dossiers.filter((d): d is Dossier => Boolean(d && typeof d.id === "string" && typeof d.nom === "string"))
    : [];
  const ids = new Set(dossiers.map((d) => d.id));
  const favoris = Array.isArray(o.favoris)
    ? o.favoris.filter(
        (f): f is Favori =>
          Boolean(f && typeof f.annonceId === "string" && ids.has(f.dossierId) && f.annonce && typeof f.annonce === "object"),
      )
    : [];
  return { dossiers, favoris };
}
