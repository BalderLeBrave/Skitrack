/**
 * Partager un dossier de favoris par un lien.
 *
 * Les dossiers ne vivent que dans le navigateur (`lib/favoris/store.ts`) :
 * le lien porte donc le dossier lui-même, compressé dans l'ancre
 * (`/favoris/<id>#partage=…`), qui ne part jamais au serveur. Chaque annonce y
 * perd sa fiche lue et sa description, qui pèsent, et garde trois photos.
 */

import type { Favori, SejourFavori } from "@/lib/favoris/modele";
import type { Listing } from "@/lib/listings";

export type DossierPartage = {
  nom: string;
  /** ISO 8601 : quand le lien a été fait. */
  le: string;
  favoris: { annonce: Listing; sejour: SejourFavori | null; ajouteLe: string }[];
};

const CLE = "partage=";
/** `z` : JSON compressé (deflate brut) ; `j` : JSON seul, sans `CompressionStream`. */
type Format = "z" | "j";

function versBase64Url(octets: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function depuisBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function passer(octets: Uint8Array, flux: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const sortie = new Blob([octets as BlobPart]).stream().pipeThrough(flux);
  return new Uint8Array(await new Response(sortie).arrayBuffer());
}

function allegee(l: Listing): Listing {
  return { ...l, fiche: null, description: null, photos: l.photos ? l.photos.slice(0, 3) : l.photos };
}

export async function encoderPartage(nom: string, favoris: readonly Favori[]): Promise<string> {
  const d: DossierPartage = {
    nom,
    le: new Date().toISOString(),
    favoris: favoris.map((f) => ({ annonce: allegee(f.annonce), sejour: f.sejour, ajouteLe: f.ajouteLe })),
  };
  const brut = new TextEncoder().encode(JSON.stringify(d));
  if (typeof CompressionStream === "function") {
    return `z${versBase64Url(await passer(brut, new CompressionStream("deflate-raw")))}`;
  }
  return `j${versBase64Url(brut)}`;
}

/** Le dossier d'une ancre `#partage=…`, ou `null` : ancre absente, abîmée ou illisible. */
export async function lirePartage(ancre: string): Promise<DossierPartage | null> {
  const i = ancre.indexOf(CLE);
  if (i < 0) return null;
  const code = ancre.slice(i + CLE.length).split("&")[0] ?? "";
  const format = code[0] as Format | undefined;
  try {
    let octets = depuisBase64Url(code.slice(1));
    if (format === "z") {
      if (typeof DecompressionStream !== "function") return null;
      octets = await passer(octets, new DecompressionStream("deflate-raw"));
    } else if (format !== "j") return null;
    const d = JSON.parse(new TextDecoder().decode(octets)) as Partial<DossierPartage>;
    if (typeof d.nom !== "string" || !Array.isArray(d.favoris)) return null;
    const favoris = d.favoris.filter(
      (f) => f != null && typeof f === "object" && typeof f.annonce?.id === "string" && typeof f.annonce?.title === "string",
    );
    return { nom: d.nom, le: typeof d.le === "string" ? d.le : "", favoris };
  } catch {
    return null;
  }
}

export function lienPartage(id: string, code: string): string {
  return `${window.location.origin}/favoris/${encodeURIComponent(id)}#${CLE}${code}`;
}
