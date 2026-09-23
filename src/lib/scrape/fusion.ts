import type { Listing } from "@/lib/listings";

/**
 * La fusion d'une plateforme relevée deux fois : par CozyCozy et en direct.
 *
 * Elle sert à Airbnb (`releverAirbnb`, run.server.ts). Le relevé direct
 * d'Airbnb ne partait que si Cozy ne rendait rien, et rien ne réunissait les
 * deux ; or Cozy ne connaît qu'une trentaine d'Airbnb par station quand Airbnb
 * en publie plusieurs centaines (mesures du 23 septembre 2026). On relève donc
 * les deux, puis on dédoublonne ici. La clé Booking est prête pour le jour où
 * le relevé direct de Booking partira lui aussi à chaque recherche — ce qui
 * reste une décision du propriétaire (voir `releverCozy`).
 *
 * La clé est l'identifiant **de la plateforme**, pas `Listing.id` : Cozy
 * numérote ses annonces par son propre `accommodationId` (`abnb-…`, `bk-…`),
 * le direct par celui d'Airbnb ou de Booking. Fusionner sur `Listing.id`
 * doublait donc chaque bien vu des deux côtés (114 sur 114 à Val Thorens).
 *
 * Quand un bien est des deux côtés, la fiche Cozy est gardée — elle porte
 * photos, capacité et lien daté — et le direct ne fait que combler ce qu'elle
 * n'a pas publié. Rien n'est écrasé : une valeur publiée par Cozy l'emporte,
 * et un champ vide des deux côtés le reste.
 */

/** L'identifiant de la plateforme, ou `null` quand l'annonce n'en porte aucun de sûr. */
export function clePlateforme(l: Pick<Listing, "source" | "url" | "platformId">): string | null {
  const pid = l.platformId?.trim() ?? "";
  if (l.source === "Airbnb") {
    const room = l.url?.match(/airbnb\.[a-z.]+\/rooms\/(\d+)/i)?.[1] ?? (/^\d+$/.test(pid) ? pid : null);
    return room ? `airbnb:${room}` : null;
  }
  if (l.source === "Booking") return /^\d+$/.test(pid) ? `booking:${pid}` : null;
  return null;
}

/** Les champs que le direct peut combler sur une fiche Cozy, quand elle les tait. */
const COMBLABLES = [
  "lat",
  "lon",
  "guests",
  "bedrooms",
  "rooms",
  "beds",
  "baths",
  "propertyType",
  "photo",
  "photos",
  "locality",
  "placeName",
] as const satisfies readonly (keyof Listing)[];

function vide(v: unknown): boolean {
  return v == null || (Array.isArray(v) && v.length === 0) || v === "";
}

function combler(cozy: Listing, direct: Listing): Listing {
  let out: Listing | null = null;
  const set = <K extends keyof Listing>(k: K, v: Listing[K]) => {
    out ??= { ...cozy };
    out[k] = v;
  };
  for (const k of COMBLABLES) {
    if (vide(cozy[k]) && !vide(direct[k])) set(k, direct[k]);
  }
  // Un total à zéro veut dire « non publié » : le prix du direct le remplace
  // alors, avec sa devise et son statut, jamais un prix publié par Cozy.
  if (!(cozy.total > 0) && direct.total > 0) {
    set("total", direct.total);
    set("currency", direct.currency);
    set("priceIndicative", direct.priceIndicative ?? null);
    if (direct.priceLabel) set("priceLabel", direct.priceLabel);
  }
  if (!out) return cozy;
  const fused: Listing = out;
  fused.proven = `${cozy.proven} · complété par le relevé direct`;
  return fused;
}

export type Fusion = {
  listings: Listing[];
  /** Biens que seul le direct a vus. */
  ajoutees: number;
  /** Biens vus des deux côtés. */
  communes: number;
};

/**
 * Réunit les annonces Cozy et directes d'une même plateforme.
 *
 * L'ordre des fiches Cozy est conservé, les biens vus seulement en direct
 * suivent. Une annonce sans clé sûre n'est jamais fusionnée : mieux vaut un
 * doublon visible qu'un bien perdu sur une ressemblance.
 */
export function fusionner(cozy: readonly Listing[], direct: readonly Listing[]): Fusion {
  const parCle = new Map<string, Listing>();
  for (const l of direct) {
    const k = clePlateforme(l);
    if (k && !parCle.has(k)) parCle.set(k, l);
  }
  const vues = new Set<string>();
  let communes = 0;
  const listings: Listing[] = [];
  for (const l of cozy) {
    const k = clePlateforme(l);
    if (k && vues.has(k)) continue;
    if (k) vues.add(k);
    const d = k ? parCle.get(k) : undefined;
    if (d) communes += 1;
    listings.push(d ? combler(l, d) : l);
  }
  let ajoutees = 0;
  const dejaDirect = new Set<string>();
  for (const l of direct) {
    const k = clePlateforme(l);
    if (k && (vues.has(k) || dejaDirect.has(k))) continue;
    if (k) dejaDirect.add(k);
    ajoutees += 1;
    listings.push(l);
  }
  return { listings, ajoutees, communes };
}
