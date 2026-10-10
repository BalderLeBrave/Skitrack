/**
 * HomeToGo, lu comme CozyCozy : une recherche, toutes ses pages jusqu'au
 * compteur publié, puis le détail des offres que la liste ne remplit pas.
 *
 * Rien n'est inventé. Un champ absent reste vide. La note n'est gardée que
 * lorsque la page écrit son échelle (« 4,0 sur 5 », ou `starValue` avec
 * `maxStarValue` à 5). Un « 8,0 » sans échelle n'est pas une note.
 *
 * Les URL autorisées (robots.txt, User-agent *) sont
 * `/search/*fsid=*&_format=json` et `/searchdetails/*fsid=*`.
 */

import type { Listing } from "@/lib/listings";
import { depuisListe, equipements } from "../stay/equipements.ts";
import { annoncer } from "../stay/occupancy.ts";
import { texteDeHtml } from "../stay/texteHtml.ts";
import { eurosPublie } from "../stay/tarif.ts";

export const ORIGINE_HOMETOGO = "https://www.hometogo.fr";

/**
 * Un HTTP 403 dont le corps est le défi Cloudflare (« Just a moment »),
 * pas une réponse de HomeToGo. Ce n'est pas un refus : on ne ferme pas l'hôte.
 */
export function estInterstitielCloudflare(status: number, cfMitigated: string | null, texte: string): boolean {
  if (status !== 403 && status !== 503) return false;
  if ((cfMitigated ?? "").trim().toLowerCase() === "challenge") return true;
  const tete = texte.slice(0, 1500);
  return tete.includes("Just a moment...") && tete.includes("challenges.cloudflare.com");
}

/** Offres demandées ensemble à `/searchdetails` : le lot du site (12). */
export const LOT_DETAILS = 12;
/** Garde-fou, pas une lecture de la source. L'arrêt normal est la dernière page. */
export const PAGES_MAX = 30;
/** Phrase d'une offre rendue sans que `/searchdetails` ait été lu. */
export const DETAIL_NON_LU = "détail HomeToGo non lu";

/** Les identifiants dont le détail n'a pas été lu, dans l'ordre reçu. */
export function idsSansDetail(ids: readonly string[], detailles: ReadonlySet<string>): string[] {
  return ids.filter((id) => id && !detailles.has(id));
}

/** Découpe en lots de `taille`, le lot du site par défaut. */
export function lotsDe(ids: readonly string[], taille = LOT_DETAILS): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += taille) out.push(ids.slice(i, i + taille));
  return out;
}

/** Le détail n'a pas été lu : la phrase le dit. Déjà lue, l'annonce ne change pas. */
export function avecDetailOuNon(l: Listing, detailLu: boolean): Listing {
  if (detailLu || l.proven.includes(DETAIL_NON_LU)) return l;
  return { ...l, proven: `${l.proven} · ${DETAIL_NON_LU}` };
}

/**
 * Les lots de détail qu'une recherche n'a pas eu le temps de lire.
 *
 * Une pause avant chaque lot. Un refus ou l'échéance arrête, sans second
 * essai et sans lot suivant. `noter` ne voit que les offres qu'un lot a
 * publiées.
 */
export async function lireDetailsEnRetard(
  lots: readonly (readonly string[])[],
  opts: {
    tirer: (ids: readonly string[]) => Promise<Record<string, unknown>[] | "refus" | "échéance">;
    noter: (ids: readonly string[], offres: readonly Record<string, unknown>[]) => void;
    attendre: (ms: number) => Promise<void>;
    maintenant: () => number;
    echeance: number;
    pauseMs: number;
  },
): Promise<"fin" | "refus" | "échéance"> {
  for (const lot of lots) {
    if (opts.maintenant() >= opts.echeance) return "échéance";
    await opts.attendre(opts.pauseMs);
    if (opts.maintenant() >= opts.echeance) return "échéance";
    const tour = await opts.tirer(lot);
    if (tour === "refus") return "refus";
    if (tour === "échéance") return "échéance";
    opts.noter(lot, tour);
  }
  return "fin";
}

export function nuits(checkIn: string, checkOut: string): number | null {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  const n = Math.round((b - a) / 86_400_000);
  return n >= 1 && n <= 90 ? n : null;
}

/** Slugs à essayer pour une station. « Les 2 Alpes » est publié « les-deux-alpes ». */
export function slugsLieu(nom: string): string[] {
  const base = nom
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  const deux = base.replace(/(^|-)2(?=-|$)/g, "$1deux");
  const chiffre = deux.replace(/(^|-)deux(?=-|$)/g, (_m, a: string) => `${a}2`);
  return [...new Set([deux, base, chiffre].filter((s) => s.length > 0))];
}

export function plierLieu(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\b2\b/g, "deux")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type LieuHomeToGo = { locationId: string; fsid: string };

/**
 * L'identifiant de lieu et le `fsid` publiés dans la page de la station,
 * seulement si le dernier maillon du lieu publié est cette station.
 */
export function lieuDepuisHtml(html: string, stationName: string): LieuHomeToGo | null {
  const bloc = html.match(/<script[^>]*id="location-data-json"[^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!bloc) return null;
  let data: { locationId?: unknown; seoDocumentId?: unknown } | null = null;
  try {
    const parsed = JSON.parse(bloc) as { data?: { locationId?: unknown; seoDocumentId?: unknown } };
    data = parsed.data ?? null;
  } catch {
    return null;
  }
  const locationId = typeof data?.locationId === "string" ? data.locationId.trim() : "";
  const fsid = typeof data?.seoDocumentId === "string" ? data.seoDocumentId.trim() : "";
  if (!/^[0-9a-f]{8,}$/i.test(locationId) || !/^[0-9a-f]{8,}$/i.test(fsid)) return null;
  const chemin = html.match(/"location":"([^"]+)"/)?.[1] ?? "";
  const dernier = chemin.split("/").pop() ?? "";
  if (!dernier || plierLieu(dernier) !== plierLieu(stationName)) return null;
  return { locationId, fsid };
}

/** Le compteur affiché (`"4 490"`, `"46"`), ou `null` s'il n'est pas un nombre. */
export function compteurPublie(summary: unknown): number | null {
  if (!summary || typeof summary !== "object") return null;
  const brut = (summary as { totalCount?: unknown }).totalCount;
  if (typeof brut !== "string") return null;
  const chiffres = brut.replace(/[\s\u00a0\u202f]/g, "");
  if (!/^\d+$/.test(chiffres)) return null;
  const n = Number(chiffres);
  return Number.isSafeInteger(n) ? n : null;
}

export function pageSuivante(filters: unknown): number | null {
  const pager = (filters as { pagerFilter?: { pager?: Record<string, unknown> } } | null)?.pagerFilter?.pager;
  if (!pager || pager.isLastPage === true) return null;
  const cur = pager.currentPage;
  const next = (pager.nextPageLink as { page?: unknown } | undefined)?.page;
  if (typeof next !== "number" || typeof cur !== "number" || next <= cur) return null;
  return next;
}

export function offresDe(json: unknown): Record<string, unknown>[] {
  const list = json && typeof json === "object" ? (json as { offers?: unknown }).offers : null;
  if (!Array.isArray(list)) return [];
  return list.filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === "object");
}

function texte(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s || null;
}

function titreDe(o: Record<string, unknown>): string {
  for (const k of ["objectName", "name", "generalTitle", "h1", "title"]) {
    const t = texte(o[k]);
    if (t) return t;
  }
  return "";
}

function nombre(v: unknown, max = 50): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  return n >= 0 && n <= max ? n : null;
}

/** Une note sur 5, seulement quand l'échelle est écrite. */
export function noteDe(ratings: unknown): { rating: number | null; reviewCount: number | null } {
  if (!ratings || typeof ratings !== "object") return { rating: null, reviewCount: null };
  const r = ratings as Record<string, unknown>;
  const reviewCount =
    typeof r.reviewCount === "number" && Number.isFinite(r.reviewCount) && r.reviewCount >= 0
      ? Math.trunc(r.reviewCount)
      : null;
  const msg = typeof r.starMessage === "string" ? r.starMessage : "";
  const sur = /(\d+(?:[.,]\d+)?)\s*sur\s*5\b/i.exec(msg);
  if (sur) {
    const n = Number(sur[1]!.replace(",", "."));
    if (n >= 0 && n <= 5) return { rating: n, reviewCount };
  }
  const max = typeof r.maxStarValue === "string" ? r.maxStarValue.trim().replace(",", ".") : "";
  if (max === "5" || max === "5.0") {
    const brut =
      typeof r.starValue === "string"
        ? Number(r.starValue.replace(",", "."))
        : typeof r.stars === "number"
          ? r.stars
          : NaN;
    if (brut >= 0 && brut <= 5) return { rating: brut, reviewCount };
  }
  return { rating: null, reviewCount };
}

function deviseDe(symbole: string): string | null {
  if (symbole.includes("€")) return "EUR";
  if (symbole.includes("$")) return "USD";
  if (symbole.includes("£")) return "GBP";
  return null;
}

/** Un prix écrit « 1 610 € » ou « 1 610,50 € ». « dès » ou « à partir » n'est pas un total. */
export function prixAffiche(display: string): { total: number; currency: string; indicatif: boolean } | null {
  const devise = deviseDe(display);
  if (!devise) return null;
  const indicatif = /à partir|dès|\bfrom\b/i.test(display);
  let total: number | null = null;
  if (devise === "EUR") {
    // La virgule décimale reste une virgule : « 1 610,50 € » n'est pas 161 050.
    total = eurosPublie(display);
  } else {
    const chiffres = display.replace(/[^\d]/g, "");
    const n = chiffres ? Number(chiffres) : NaN;
    total = Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  if (total == null || !(total > 0)) return null;
  return indicatif ? { total: 0, currency: devise, indicatif: true } : { total, currency: devise, indicatif: false };
}

function prixDe(o: Record<string, unknown>): { total: number; currency: string; indicatif: boolean | null; label: string | null } {
  const price = o.price;
  if (price && typeof price === "object") {
    const p = price as Record<string, unknown>;
    const label = texte(p.display) ?? texte(p.total);
    const devise = typeof p.currency === "string" && /^[A-Z]{3}$/.test(p.currency) ? p.currency : label ? deviseDe(label) : null;
    const brut = typeof p.totalRaw === "number" && p.totalRaw > 0 ? Math.round(p.totalRaw) : null;
    if (p.mode === "totalPrice" && p.exact === true && devise) {
      if (brut != null) return { total: brut, currency: devise, indicatif: null, label };
      // `totalRaw` absent : le montant affiché (« 6 321 € ») est quand même publié.
      const lu = label ? prixAffiche(label) : null;
      if (lu && !lu.indicatif && lu.total > 0) return { total: lu.total, currency: lu.currency, indicatif: null, label };
    }
    if (p.mode === "totalPrice" && p.exact === false) {
      return { total: 0, currency: devise || "EUR", indicatif: true, label };
    }
  }
  const display = texte((o.lowestPriceInfo as { display?: unknown } | undefined)?.display);
  if (display) {
    const lu = prixAffiche(display);
    if (lu) return { total: lu.total, currency: lu.currency, indicatif: lu.indicatif ? true : null, label: display };
  }
  return { total: 0, currency: "EUR", indicatif: null, label: null };
}

function httpUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.startsWith("//")) return `https:${s}`;
  if (/^https?:\/\//i.test(s)) return s;
  return null;
}

function photosDe(o: Record<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: unknown) => {
    const u = httpUrl(v);
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };
  const images = o.images;
  if (Array.isArray(images)) {
    for (const raw of images) {
      if (!raw || typeof raw !== "object") continue;
      const p = raw as Record<string, unknown>;
      push(p.large ?? p.medium ?? p.small ?? p.thumbnail);
    }
  }
  const links = o.imageLinks;
  if (links && typeof links === "object") {
    const p = links as Record<string, unknown>;
    push(p.large ?? p.medium ?? p.small);
  }
  return out;
}

function descriptionDe(o: Record<string, unknown>): string | null {
  const bloc = o.description;
  if (!bloc || typeof bloc !== "object") return null;
  const d = bloc as { unit?: { content?: unknown }; object?: { content?: unknown } };
  return texteDeHtml(typeof d.unit?.content === "string" ? d.unit.content : null) ?? texteDeHtml(typeof d.object?.content === "string" ? d.object.content : null);
}

function libellesEquipements(o: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const t = texte(v);
    if (t) out.push(t);
  };
  const amenities = o.amenities;
  if (amenities && typeof amenities === "object") {
    const a = amenities as { icons?: unknown; common?: unknown; fishing?: { label?: unknown } };
    if (Array.isArray(a.icons)) for (const it of a.icons) if (it && typeof it === "object") push((it as { label?: unknown }).label);
    if (Array.isArray(a.common)) for (const it of a.common) if (it && typeof it === "object") push((it as { label?: unknown }).label);
    push(a.fishing?.label);
  }
  return out;
}

function urlDe(o: Record<string, unknown>, input: LiveSearchInput, locationId: string, nuitsSejour: number): string {
  const id = texte(o.id) ?? "";
  const link = (o.actions as { conversion?: { first?: { link?: unknown } } } | undefined)?.conversion?.first?.link;
  const garder = ["location", "arrival", "duration", "persons", "adults", "bedrooms", "pricetype"];
  try {
    const brut = typeof link === "string" && link.startsWith("/") ? new URL(link, ORIGINE_HOMETOGO) : new URL(`/rental/${id}`, ORIGINE_HOMETOGO);
    const u = new URL(brut.pathname, ORIGINE_HOMETOGO);
    for (const k of garder) {
      const v = brut.searchParams.get(k);
      if (v) u.searchParams.set(k, v);
    }
    if (!u.searchParams.get("location")) u.searchParams.set("location", locationId);
    if (!u.searchParams.get("arrival")) u.searchParams.set("arrival", input.checkIn);
    if (!u.searchParams.get("duration")) u.searchParams.set("duration", String(nuitsSejour));
    if (!u.searchParams.get("persons")) u.searchParams.set("persons", String(input.guests));
    if (!u.searchParams.get("pricetype")) u.searchParams.set("pricetype", "totalPrice");
    return u.toString();
  } catch {
    return `${ORIGINE_HOMETOGO}/rental/${id}`;
  }
}

function lieuDe(o: Record<string, unknown>): string | null {
  return texte(o.locationShorted) ?? texte(o.locationTrailHeader) ?? texte(o.locationTrailHeading);
}

/**
 * Une offre HomeToGo, liste ou détail, devenue annonce.
 * `null` quand la source n'a pas publié de titre : un squelette (id et point)
 * n'est pas une annonce.
 */
export function offreEnListing(
  o: Record<string, unknown>,
  input: LiveSearchInput,
  locationId: string,
  nuitsSejour: number,
): Listing | null {
  const id = texte(o.id);
  const title = titreDe(o);
  if (!id || !title) return null;
  const description = descriptionDe(o);
  const occ = annoncer(
    {
      capacity: nombre(o.persons),
      bedrooms: nombre(o.bedrooms),
      source: "structured",
    },
    title,
    description,
  );
  const prix = prixDe(o);
  const { rating, reviewCount } = noteDe(o.ratings);
  const gallery = photosDe(o);
  const lieu = lieuDe(o);
  const typePublie = texte(o.type);
  const geo = o.geoLocation && typeof o.geoLocation === "object" ? (o.geoLocation as { lat?: unknown; lon?: unknown }) : null;
  const lat = typeof geo?.lat === "number" && Number.isFinite(geo.lat) ? geo.lat : null;
  const lon = typeof geo?.lon === "number" && Number.isFinite(geo.lon) ? geo.lon : null;
  const libs = libellesEquipements(o);
  const lus = libs.length ? depuisListe(libs.map((texte) => ({ texte }))) : {};
  if (o.petFriendly === true) lus.animaux = "oui";
  if (o.petFriendly === false) lus.animaux = "non";
  const equip = libs.length || typeof o.petFriendly === "boolean" ? equipements(lus) : null;
  return {
    id: `htg-${id}`,
    stationId: input.stationId,
    title,
    source: "HomeToGo",
    total: prix.total,
    currency: prix.currency,
    capacity: occ.capacity,
    bedrooms: occ.bedrooms,
    rooms: occ.rooms,
    capacityStandard: occ.capacityStandard,
    capacitySource: occ.capacitySource,
    bedroomsSource: occ.bedroomsSource,
    isStudio: occ.isStudio,
    baths: nombre(o.bathrooms),
    propertyType: typePublie && typePublie.toLowerCase() !== title.toLowerCase() ? typePublie : null,
    description,
    amenities: equip,
    available: true,
    photo: gallery[0] ?? null,
    photos: gallery.length > 0 ? gallery : null,
    priceIndicative: prix.indicatif,
    priceLabel: prix.label,
    platformId: id,
    url: urlDe(o, input, locationId, nuitsSejour),
    lat,
    lon,
    locality: lieu,
    placeName: lieu,
    rating,
    reviewCount,
    proven: `HomeToGo live ${input.checkIn}→${input.checkOut}`,
    // Le filtre « disponible » ne garde qu'un total daté. Sans ces champs,
    // la suite de détails remplaçait l'annonce et l'écran la retirait.
    ...(prix.total > 0
      ? { pricedCheckIn: input.checkIn, pricedCheckOut: input.checkOut, scannedAt: Date.now() }
      : {}),
  };
}

/** Le détail complète la liste : ses champs publiés recouvrent, le reste reste. */
export function fondreOffre(liste: Record<string, unknown>, detail: Record<string, unknown> | null): Record<string, unknown> {
  if (!detail) return liste;
  return { ...liste, ...detail, id: liste.id ?? detail.id };
}

/**
 * La station suivante d'un grand domaine est-elle encore interrogée ?
 *
 * Un refus (403, 429, 503) ou l'échéance arrête : on ne relance pas.
 * Une page illisible d'une station n'empêche pas de lire la suivante.
 */
export function continuerDomaine(raison: string | null, refus: boolean): boolean {
  if (refus) return false;
  if (raison == null) return true;
  return raison !== "échéance";
}

/**
 * Paire publiée par la page Les Deux Alpes le 9 octobre 2026
 * (`location-data-json` : `locationId` et `seoDocumentId`).
 * Elle ouvre `/search/{id}?fsid=…&_format=json`, l'URL que robots.txt
 * autorise, quand la page HTML n'est qu'un interstitiel Cloudflare.
 * Ce n'est pas une clé fabriquée. Si cette recherche ne rend pas de JSON,
 * on s'arrête : on ne retente pas un 403.
 */
export const AMORCE_HOMETOGO: LieuHomeToGo = {
  locationId: "5460aec004a18",
  fsid: "81055cb257acb87e5e8899435d3c5318",
};

const ID_LIEU = /^[0-9a-f]{8,}$/i;

export type NoeudLieu = { id: string; label: string; fsid: string };

export type CarteNavigation = {
  noeuds: NoeudLieu[];
  /** Suggestion dont le trail publié est vide : le pays, pas une région choisie. */
  racine: string | null;
  /** Chemin publié (`analyticsSnowPlow.search.location`). */
  trail: string | null;
  locationCount: number | null;
};

/** Ce que la recherche JSON autorisée publie pour trouver un lieu. */
export function carteNavigation(json: unknown): CarteNavigation {
  const vide: CarteNavigation = { noeuds: [], racine: null, trail: null, locationCount: null };
  if (!json || typeof json !== "object") return vide;
  const o = json as Record<string, unknown>;
  const nodes = (
    ((o.filters as { destination_navigation?: { sublocations?: { nodes?: unknown } } } | undefined)
      ?.destination_navigation?.sublocations?.nodes) ?? []
  ) as unknown;
  const noeuds: NoeudLieu[] = [];
  if (Array.isArray(nodes)) {
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      const node = n as { id?: unknown; label?: unknown; link?: { fsid?: unknown } };
      const id = typeof node.id === "string" ? node.id.trim() : "";
      const label = typeof node.label === "string" ? node.label.replace(/\s+/g, " ").trim() : "";
      const fsid = typeof node.link?.fsid === "string" ? node.link.fsid.trim() : "";
      if (!ID_LIEU.test(id) || !ID_LIEU.test(fsid) || !label) continue;
      noeuds.push({ id, label, fsid });
    }
  }
  let racine: string | null = null;
  const sugs = (o.topSuggestions as { suggestions?: unknown } | undefined)?.suggestions;
  if (Array.isArray(sugs)) {
    for (const s of sugs) {
      if (!s || typeof s !== "object") continue;
      const sug = s as { trail?: unknown; id?: unknown };
      const id = typeof sug.id === "string" ? sug.id.trim() : "";
      if (sug.trail === "" && ID_LIEU.test(id)) {
        racine = id;
        break;
      }
    }
  }
  const trailBrut = (
    o.analyticsSnowPlow as { search?: { location?: unknown } } | undefined
  )?.search?.location;
  const trail = typeof trailBrut === "string" && trailBrut.trim() ? trailBrut.trim() : null;
  const compte = (o.searchSummary as { locationCountRaw?: unknown } | undefined)?.locationCountRaw;
  const locationCount = typeof compte === "number" && Number.isFinite(compte) && compte >= 0 ? compte : null;
  return { noeuds, racine, trail, locationCount };
}

/**
 * Les nœuds dont le libellé publié est ce nom.
 * Égalité d'abord (« Les 2 Alpes » = « Les Deux Alpes »).
 * Sinon un seul préfixe (« Chamonix » → « Chamonix-Mont-Blanc »).
 * Deux préfixes : rien, on ne choisit pas.
 */
export function noeudsDuNom(noeuds: readonly NoeudLieu[], nom: string): NoeudLieu[] {
  const cible = plierLieu(nom);
  if (!cible) return [];
  const exact: NoeudLieu[] = [];
  const vus = new Set<string>();
  for (const n of noeuds) {
    if (vus.has(n.id) || plierLieu(n.label) !== cible) continue;
    vus.add(n.id);
    exact.push(n);
  }
  if (exact.length > 0) return exact;
  const prefixe: NoeudLieu[] = [];
  for (const n of noeuds) {
    if (vus.has(n.id)) continue;
    const l = plierLieu(n.label);
    if (l.startsWith(`${cible} `) || cible.startsWith(`${l} `)) {
      vus.add(n.id);
      prefixe.push(n);
    }
  }
  return prefixe.length === 1 ? prefixe : [];
}

export function noeudNomme(noeuds: readonly NoeudLieu[], nom: string): NoeudLieu | null {
  const t = noeudsDuNom(noeuds, nom);
  return t.length === 1 ? t[0]! : null;
}

export type CandidatLieu = {
  locationId: string;
  fsid: string;
  trail: string;
  locationCount: number | null;
};

/**
 * Parmi les pages dont le dernier maillon publié est la station :
 * le chemin le plus court, puis le plus petit `locationCountRaw`.
 * Deux lieux homonymes ne sont pas fondus au hasard.
 */
export function retenirLieu(candidats: readonly CandidatLieu[], nom: string): CandidatLieu | null {
  const cible = plierLieu(nom);
  if (!cible) return null;
  const bons = candidats.filter((c) => plierLieu(c.trail.split("/").pop() ?? "") === cible);
  if (bons.length === 0) return null;
  const profondeur = (c: CandidatLieu) => c.trail.split("/").filter(Boolean).length;
  return [...bons].sort((a, b) => {
    const d = profondeur(a) - profondeur(b);
    if (d !== 0) return d;
    const ca = a.locationCount ?? Number.MAX_SAFE_INTEGER;
    const cb = b.locationCount ?? Number.MAX_SAFE_INTEGER;
    if (ca !== cb) return ca - cb;
    return a.locationId < b.locationId ? -1 : a.locationId > b.locationId ? 1 : 0;
  })[0]!;
}
