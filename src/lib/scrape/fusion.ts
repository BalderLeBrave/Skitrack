import type { Listing } from "@/lib/listings";

/**
 * La fusion d'une plateforme relevée deux fois : par CozyCozy et en direct.
 *
 * Elle sert à Airbnb (`releverAirbnb`, run.server.ts). Le relevé direct
 * d'Airbnb ne partait que si Cozy ne rendait rien, et rien ne réunissait les
 * deux ; or Cozy ne connaît qu'une trentaine d'Airbnb par station quand Airbnb
 * en publie plusieurs centaines (mesures du 23 septembre 2026). On relève donc
 * les deux, puis on dédoublonne ici. Booking se dédoublonne de la même façon :
 * le direct part après la réponse Cozy, une page à la fois, et s'arrête au
 * premier refus (`releverCozy`).
 *
 * La clé est l'identifiant **de la plateforme**, pas `Listing.id` : Cozy
 * numérote ses annonces par son propre `accommodationId` (`abnb-…`, `bk-…`),
 * le direct par celui d'Airbnb ou de Booking. Fusionner sur `Listing.id`
 * doublait donc chaque bien vu des deux côtés (114 sur 114 à Val Thorens).
 *
 * Quand un bien est des deux côtés, la fiche Cozy est gardée — elle porte
 * photos, capacité et lien daté — et le direct ne fait que combler ce qu'elle
 * n'a pas publié. Rien n'est écrasé : une valeur publiée par Cozy l'emporte,
 * et un champ vide des deux côtés le reste. Seule exception, la galerie : la
 * liste Cozy n'en porte que trois vignettes, et une galerie directe plus
 * longue la remplace.
 */

/** L'identifiant de la plateforme, ou `null` quand l'annonce n'en porte aucun de sûr. */
export function clePlateforme(l: Pick<Listing, "source" | "url" | "platformId">): string | null {
  const pid = l.platformId?.trim() ?? "";
  if (l.source === "Airbnb") {
    const room = l.url?.match(/airbnb\.[a-z.]+\/rooms\/(\d+)/i)?.[1] ?? (/^\d+$/.test(pid) ? pid : null);
    return room ? `airbnb:${room}` : null;
  }
  if (l.source === "Booking") {
    // Le slug de l'URL est le même chez Cozy et en direct. Le numéro d'hôtel
    // ne l'est que lorsque les deux l'ont publié : Cozy numérote souvent
    // autrement (`accommodationId`).
    const slug = l.url?.match(/\/hotel\/[a-z]{2}\/([^./?#]+)/i)?.[1]?.toLowerCase();
    if (slug) return `booking:${slug}`;
    return /^\d+$/.test(pid) ? `booking:${pid}` : null;
  }
  return null;
}

/** Les champs que le direct peut combler sur une fiche Cozy, quand elle les tait. */
const COMBLABLES = [
  "lat",
  "lon",
  "capacity",
  "bedrooms",
  "rooms",
  "beds",
  "baths",
  // La surface, quand une copie la publie (Cozy, Cimalpes, Alpissime,
  // Travelski, iResa, Ingénie, Arkiane) et que l'autre la tait.
  "surface",
  "propertyType",
  "photo",
  "photos",
  "locality",
  "placeName",
  // Ce que le bien publie de son contenu : Cozy ne porte ni description ni
  // équipements, le direct si (titres de la tuile Airbnb, fiche Booking).
  "description",
  "amenities",
  "equipementsPublies",
] as const satisfies readonly (keyof Listing)[];

/** Vide : rien, une liste vide, un texte blanc, ou des équipements tous
 *  « inconnu » — une liste qui ne dit rien ne masque pas celle qui dit. */
function vide(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (!Array.isArray(v)) return false;
  return v.every((x) => x != null && typeof x === "object" && (x as { valeur?: unknown }).valeur === "inconnu");
}

/** Une fiche enrichie qui dit quelque chose (ni absente, ni indisponible). */
function ficheLue(l: Listing): boolean {
  return l.fiche != null && l.fiche.indisponible !== true;
}

/** Le nombre de photos distinctes d'une annonce, photo principale comprise. */
function galerie(l: Pick<Listing, "photo" | "photos">): number {
  return new Set([...(l.photo ? [l.photo] : []), ...(l.photos ?? [])]).size;
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
  // La galerie : la plus longue des deux, photo principale comprise. La liste
  // Cozy ne porte que trois vignettes ; une tuile directe plus fournie les
  // remplace, entière, sans mêler les deux.
  if (galerie(direct) > galerie(out ?? cozy)) {
    set("photo", direct.photo ?? direct.photos?.[0] ?? null);
    set("photos", direct.photos ?? null);
  }
  // La note va avec son nombre d'avis : jamais l'une d'un relevé avec l'autre
  // de l'autre (`avisDe` lit les deux sur la même annonce).
  if (cozy.rating == null && cozy.reviewCount == null && direct.rating != null) {
    set("rating", direct.rating);
    set("reviewCount", direct.reviewCount ?? null);
    // Et son échelle : celle de Cozy (sur 100) ne vaut pas pour la note du direct.
    set("ratingScale", direct.ratingScale ?? null);
  }
  // La fiche lue du direct (Booking : page établissement) ; celle de Cozy, si
  // elle en a une lue, reste la sienne.
  if (!ficheLue(cozy) && ficheLue(direct)) set("fiche", direct.fiche);
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
