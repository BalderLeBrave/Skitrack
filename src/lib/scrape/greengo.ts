/**
 * GreenGo : hébergements écoresponsables, publiés sur greengo.voyage.
 *
 * Partie pure : requêtes GraphQL et lecture des réponses, sans réseau. Le
 * relevé lui-même est dans `greengo.server.ts`.
 *
 * Étude du 24 septembre 2026 (Avoriaz, 6→13/02/2027, 2 adultes) :
 * - la recherche datée et les prix ne passent que par l'API GraphQL
 *   `operations.greengo.voyage/graphql`, qui répond en HTTP simple, sans
 *   jeton ni cookie. Son robots.txt dit « Disallow: / », et les CGVU
 *   (art. 16.2.2, 17.1.2) proscrivent la réutilisation automatisée : la
 *   politique du dépôt (robots lu, journalisé, extraction quand même) est
 *   celle du propriétaire ;
 * - la recherche ne donne, par hôte, qu'un prix « à partir de » par nuit,
 *   le minimum de ses logements. Le total exact du séjour, logement par
 *   logement, et la réservabilité aux dates viennent du détail de l'hôte
 *   (`DynamicHABF` côté site), une requête par hôte ;
 * - aucune offre Airbnb, Booking, Abritel ou Gîtes de France n'y est
 *   revendue : GreenGo n'a que son propre inventaire.
 */

import type { Listing } from "@/lib/listings";
import type { LiveSearchInput } from "./types";

export const GREENGO_SITE = "https://www.greengo.voyage";
export const GREENGO_API = "https://operations.greengo.voyage/graphql";
/**
 * Les noms d'opération que le site envoie lui-même. Le nom part dans chaque
 * requête (corps et texte) : « SkitrackRecherche » nommait l'application
 * alors que l'en-tête est celui d'un navigateur.
 */
export const OPERATION_RECHERCHE = "ClassicHostingSearchHostingAdverts";
export const OPERATION_DETAIL = "DynamicHABF";
const IMAGES = "https://images.greengo.voyage/canonical/";

/** Un point de la recherche : l'emprise carrée de `rayonKm` autour de la station. */
export function emprise(lat: number, lon: number, rayonKm: number) {
  const dLat = rayonKm / 111;
  const dLon = rayonKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return { sw: { lat: lat - dLat, lng: lon - dLon }, ne: { lat: lat + dLat, lng: lon + dLon } };
}

/** La configuration de séjour, écrite en littéral GraphQL (dates et nombres vérifiés). */
function sejour(input: LiveSearchInput): string {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!date.test(input.checkIn) || !date.test(input.checkOut)) throw new Error("dates illisibles");
  const adultes = Math.max(1, Math.trunc(input.guests));
  return `{numberOfAdults:${adultes},numberOfChildren:0,numberOfBabies:0,numberOfPets:0,checkInOutDateRange:{start:"${input.checkIn}",end:"${input.checkOut}"}}`;
}

function nombre(n: number): string {
  if (!Number.isFinite(n)) throw new Error("coordonnée illisible");
  return n.toFixed(6);
}

/**
 * La recherche : hôtes réservables aux dates dans l'emprise, 42 par page.
 * Les champs passent par un fragment : le nœud est une union.
 */
export function requeteRecherche(input: LiveSearchInput, rayonKm: number, offset: number): string {
  const b = emprise(input.lat, input.lon, rayonKm);
  const s = sejour(input);
  return `query ${OPERATION_RECHERCHE} { publicAdverts { classicSearch(mapBounds:{sw:{lat:${nombre(b.sw.lat)},lng:${nombre(b.sw.lng)}},ne:{lat:${nombre(b.ne.lat)},lng:${nombre(b.ne.lng)}}}, baseBookingConfigWithOptionalCheckInOutDateRange:${s}, filters:{}, includeMultiAccommodationBookableHostingAdverts:true) { bookableHostingAdverts(first:42, offset:${Math.max(0, Math.trunc(offset))}) { totalCount edges { node { __typename ... on HostingAdvertPublicSliceInterface { id name currentProductSlug formattedLocation postalCode addressFromGmaps { city } coordinates { lat lng } orderedImageNormalizedPaths coarseBookingInformation(baseBookingConfigWithOptionalCheckInOutDateRange:${s}) { minPricePerNightInformation { minPricePerNightRoundedToInt isTheOnlyPriceRounded } } } } } } } } }`;
}

/** Le détail d'un hôte : ses logements, leur total exact aux dates, et ce qui les rend non réservables. */
export function requeteDetail(input: LiveSearchInput, slug: string): string {
  const s = sejour(input);
  const adultes = Math.max(1, Math.trunc(input.guests));
  const dates = `{start:"${input.checkIn}",end:"${input.checkOut}"}`;
  return `query ${OPERATION_DETAIL} { publicAdverts { hostingAdvert(productSlug:${JSON.stringify(slug)}) { __typename ... on HostingAdvertPublicSliceInterface { id currentProductSlug } ... on HostingAdvertFromSingleAccommodationPublicSlice { singleAccommodation { ...Logement } } ... on HostingAdvertFromEstablishmentPublicSlice { accommodationsInEstablishment(baseBookingConfigWithOptionalCheckInOutDateRange:${s}) { ...Logement } } } } } fragment Logement on AccommodationPublicSlice { id currentProductSlug name maxNumberOfTravellers numberOfBedrooms totalNumberOfBeds numberOfBathrooms orderedImageNormalizedPaths bookingPricing(checkInOutDateRange:${dates}, accommodationServicesSelected:[], numberOfChildren:0, numberOfAdults:${adultes}, promotionalVoucherIds:[], useGreengoCreditsIfPossible:false) { __typename ... on BookingPricing { totalPrice { forStayRounded forStayUnrounded } } } nonbookableReasons(baseBookingConfigWithOptionalCheckInOutDateRange:${s}) { __typename } }`;
}

export type HoteGreenGo = {
  id: string;
  /** Un seul logement (et non un établissement) : l'hôte et son logement ne font qu'un. */
  unique: boolean;
  nom: string;
  slug: string;
  lieu: string | null;
  lat: number | null;
  lon: number | null;
  photos: string[];
  /** Le prix « à partir de » par nuit, minimum des logements de l'hôte. */
  minParNuit: number | null;
};

export type LogementGreenGo = {
  id: string;
  nom: string;
  capacite: number | null;
  chambres: number | null;
  lits: number | null;
  sdb: number | null;
  photos: string[];
  /** Total du séjour, tout compris, ou `null` s'il n'est pas publié. */
  total: number | null;
  reservable: boolean;
};

function texte(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim() : null;
}

function entier(v: unknown, max = 50): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

function coord(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v !== 0 ? v : null;
}

function images(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((p): p is string => typeof p === "string" && p.trim() !== "").map((p) => `${IMAGES}${p.trim()}`);
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Les hôtes d'une page de recherche, le compteur qu'elle publie, et le nombre
 * de nœuds reçus — c'est lui qui dit si la page était pleine, pas le nombre
 * d'hôtes lisibles.
 */
export function lireRecherche(json: unknown): { hotes: HoteGreenGo[]; total: number | null; noeuds: number } {
  const bha = obj(obj(obj(obj(obj(json)?.data)?.publicAdverts)?.classicSearch)?.bookableHostingAdverts);
  const total = typeof bha?.totalCount === "number" ? bha.totalCount : null;
  const edges = Array.isArray(bha?.edges) ? bha.edges : [];
  const hotes: HoteGreenGo[] = [];
  for (const edge of edges) {
    const n = obj(obj(edge)?.node);
    const id = texte(n?.id);
    const slug = texte(n?.currentProductSlug);
    const nom = texte(n?.name);
    if (!n || !id || !slug || !nom) continue;
    const c = obj(n.coordinates);
    const min = obj(obj(n.coarseBookingInformation)?.minPricePerNightInformation)?.minPricePerNightRoundedToInt;
    hotes.push({
      id,
      unique: n.__typename === "HostingAdvertFromSingleAccommodationPublicSlice",
      nom,
      slug,
      lieu: texte(obj(n.addressFromGmaps)?.city) ?? texte(n.formattedLocation),
      lat: coord(c?.lat),
      lon: coord(c?.lng),
      photos: images(n.orderedImageNormalizedPaths),
      minParNuit: typeof min === "number" && min > 0 ? min : null,
    });
  }
  return { hotes, total, noeuds: edges.length };
}

/** Les logements d'un hôte, depuis son détail. */
export function lireDetail(json: unknown): LogementGreenGo[] {
  const h = obj(obj(obj(obj(json)?.data)?.publicAdverts)?.hostingAdvert);
  if (!h) return [];
  const bruts = h.singleAccommodation != null ? [h.singleAccommodation] : Array.isArray(h.accommodationsInEstablishment) ? h.accommodationsInEstablishment : [];
  const out: LogementGreenGo[] = [];
  for (const b of bruts) {
    const u = obj(b);
    const id = texte(u?.id);
    if (!u || !id) continue;
    const prix = obj(obj(u.bookingPricing)?.totalPrice);
    const brut = typeof prix?.forStayUnrounded === "string" ? Number(prix.forStayUnrounded) : Number.NaN;
    const total = Number.isFinite(brut) && brut > 0 ? Math.round(brut) : typeof prix?.forStayRounded === "number" && prix.forStayRounded > 0 ? prix.forStayRounded : null;
    out.push({
      id,
      nom: texte(u.name) ?? "",
      capacite: entier(u.maxNumberOfTravellers),
      chambres: entier(u.numberOfBedrooms),
      lits: entier(u.totalNumberOfBeds),
      sdb: entier(u.numberOfBathrooms),
      photos: images(u.orderedImageNormalizedPaths),
      total,
      // Une liste de raisons vide : réservable aux dates et pour ces voyageurs.
      reservable: Array.isArray(u.nonbookableReasons) && u.nonbookableReasons.length === 0,
    });
  }
  return out;
}

export function lienHote(slug: string, input: LiveSearchInput): string {
  const q = new URLSearchParams({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    numberOfAdults: String(Math.max(1, Math.trunc(input.guests))),
  });
  return `${GREENGO_SITE}/hote/${encodeURIComponent(slug)}?${q}`;
}

/**
 * Les annonces d'un hôte. Détail lu : un logement réservable, une annonce,
 * avec son total exact. Détail non lu (échéance) : une annonce pour l'hôte,
 * prix non publié (`total: 0`) — le filtre de l'écran la compte comme telle.
 * Un logement non réservable aux dates n'est pas une offre : il est écarté.
 */
export function greengoListings(
  hote: HoteGreenGo,
  logements: LogementGreenGo[] | null,
  input: LiveSearchInput,
): Listing[] {
  const url = lienHote(hote.slug, input);
  const commun = {
    stationId: input.stationId,
    source: "GreenGo" as const,
    currency: "EUR",
    available: true as const,
    url,
    lat: hote.lat,
    lon: hote.lon,
    locality: hote.lieu,
    placeName: hote.lieu,
    proven: `GreenGo live ${input.checkIn}→${input.checkOut}`,
  };
  if (logements == null) {
    return [
      {
        ...commun,
        id: `gg-${hote.id}`,
        title: hote.nom,
        total: 0,
        priceIndicative: hote.minParNuit != null ? true : null,
        priceLabel: hote.minParNuit != null ? `dès ${hote.minParNuit} € la nuit` : null,
        guests: null,
        bedrooms: null,
        photo: hote.photos[0] ?? null,
        photos: hote.photos.length ? hote.photos : null,
        platformId: hote.id,
      },
    ];
  }
  const plusieurs = logements.length > 1;
  return logements
    .filter((u) => u.reservable)
    .map((u) => {
      const photos = u.photos.length ? u.photos : hote.photos;
      const titre = plusieurs && u.nom && u.nom !== hote.nom ? `${hote.nom} — ${u.nom}` : hote.nom;
      return {
        ...commun,
        // Même identifiant que l'annonce sans détail pour un hôte à logement
        // unique : sinon un logement retenu pour la réservation disparaissait
        // au relevé suivant, selon que le détail avait été lu ou non.
        id: hote.unique ? `gg-${hote.id}` : `gg-${u.id}`,
        title: titre,
        total: u.total ?? 0,
        guests: u.capacite,
        bedrooms: u.chambres,
        beds: u.lits,
        baths: u.sdb,
        photo: photos[0] ?? null,
        photos: photos.length ? photos : null,
        platformId: u.id,
      };
    });
}
