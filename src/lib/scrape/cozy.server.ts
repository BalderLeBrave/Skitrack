import type { Page } from "playwright";
import type { Listing } from "@/lib/listings";
import { sleep } from "./browser.server.ts";
import { allowsPath } from "./robots.ts";
import type { LiveSearchInput } from "./types";
import { annoncer, occupancyFromRecord } from "../stay/occupancy.ts";

function datedPlace(name: string): string {
  const n = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (n.includes("deux alpes") || /(?:^|[^a-z0-9])2[\s-]?alpes(?:$|[^a-z0-9])/.test(n)) {
    return "Les Deux Alpes station de ski, France";
  }
  return /,\s*france\s*$/i.test(name) ? name.trim() : `${name.trim()}, France`;
}

export function cozySearchUrl(input: LiveSearchInput): string {
  const rooms = Math.max(1, input.bedrooms);
  const place = encodeURIComponent(datedPlace(input.stationName));
  return `https://www.cozycozy.com/fr/search/${place}/${input.checkIn}/${input.checkOut}/${rooms}-${input.guests}-0/results`;
}

function httpUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  return null;
}

function isVrbo(blob: string): boolean {
  return /\b(abritel|vrbo|homeaway)\b/i.test(blob);
}

function isBooking(blob: string): boolean {
  return /\bbooking(?:\.com)?\b/i.test(blob);
}

function isHotelOnly(title: string): boolean {
  const t = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (/chambre d[' ]?hotes|maison d[' ]?hotes|private[ _-]?room/.test(t)) return true;
  if (/^h[oô]tel\b/.test(t) && !/appartement|chalet|maison|villa|residence|gite/.test(t)) return true;
  return false;
}

function isAirbnb(blob: string): boolean {
  return /\bairbnb\b/i.test(blob);
}

function providerHit(entry: Record<string, unknown>, kind: "abritel" | "booking" | "airbnb"): Record<string, unknown> | null {
  const hits = Array.isArray(entry.highlightedResults) ? entry.highlightedResults : [];
  for (const raw of hits) {
    if (!raw || typeof raw !== "object") continue;
    const h = raw as Record<string, unknown>;
    const blob = `${h.providerCode ?? ""} ${h.providerName ?? ""} ${h.deeplinkUrl ?? ""}`;
    if (kind === "abritel" && isVrbo(blob)) return h;
    if (kind === "booking" && isBooking(blob)) return h;
    if (kind === "airbnb" && isAirbnb(blob)) return h;
  }
  if ((kind === "abritel" || kind === "airbnb") && entry.provider && typeof entry.provider === "object") {
    const h = entry.provider as Record<string, unknown>;
    const blob = `${h.providerCode ?? ""} ${h.providerName ?? ""} ${h.deeplinkUrl ?? ""}`;
    if (kind === "abritel" && isVrbo(blob)) return h;
    if (kind === "airbnb" && isAirbnb(blob)) return h;
  }
  return null;
}

function unwrapDest(deeplink: string): string {
  const dest = deeplink.match(/[?&]dest=([^&]+)/i);
  if (dest) {
    try {
      return decodeURIComponent(dest[1]);
    } catch {
      /* dest illisible : on garde le lien tel quel */
    }
  }
  const tagged = deeplink.match(/destination:(https:\/\/[^&\s]+)/i);
  if (tagged) {
    try {
      return decodeURIComponent(tagged[1]);
    } catch {
      return tagged[1];
    }
  }
  return deeplink;
}

function canonicalAirbnb(deeplink: string, input: LiveSearchInput, platformId: string | null): string {
  const raw = unwrapDest(deeplink);
  const room =
    raw.match(/airbnb\.(?:fr|com)\/rooms\/(\d+)/i)?.[1] ??
    (platformId && /^\d+$/.test(platformId) ? platformId : null);
  if (room) {
    return `https://www.airbnb.fr/rooms/${room}?check_in=${input.checkIn}&check_out=${input.checkOut}&adults=${input.guests}`;
  }
  return raw.startsWith("http") ? raw : deeplink;
}

function canonicalAbritel(deeplink: string, input: LiveSearchInput): string {
  const m = deeplink.match(/destination:(https:\/\/(?:www\.)?(?:abritel\.fr|vrbo\.com)[^&\s]+)/i);
  const raw = m ? decodeURIComponent(m[1]) : deeplink;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "vrbo.com" || host === "abritel.fr") u.hostname = "www.abritel.fr";
    for (const k of ["mpd", "mpe", "mpb", "mpa", "mpq", "label", "camref"]) u.searchParams.delete(k);
    u.searchParams.set("startDate", input.checkIn);
    u.searchParams.set("chkin", input.checkIn);
    u.searchParams.set("endDate", input.checkOut);
    u.searchParams.set("chkout", input.checkOut);
    u.searchParams.set("adults", String(input.guests));
    return u.toString();
  } catch {
    return raw;
  }
}

function coord(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v !== 0) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return null;
}

function deeplinkOf(h: Record<string, unknown>): string {
  if (typeof h.deeplinkUrl === "string" && h.deeplinkUrl.trim()) return h.deeplinkUrl.trim();
  if (typeof h.deeplink === "string" && h.deeplink.trim()) return h.deeplink.trim();
  const nested = h.deeplink;
  if (nested && typeof nested === "object" && typeof (nested as { url?: unknown }).url === "string") {
    return (nested as { url: string }).url.trim();
  }
  return "";
}

function deviseOf(priceObj: Record<string, unknown> | undefined): string {
  const code = priceObj?.currencyCode ?? priceObj?.currency;
  return typeof code === "string" ? code.trim() : "";
}

function prixOf(h: Record<string, unknown>): { total: number; indicative: boolean; devise: string } {
  const priceObj = (h.totalPrice ?? h.price) as Record<string, unknown> | undefined;
  const indicative = priceObj?.indicative === true;
  const stayRaw = priceObj?.value ?? h.eurPriceValue;
  const total = !indicative && typeof stayRaw === "number" && stayRaw > 0 ? Math.round(stayRaw) : 0;
  return { total, indicative, devise: deviseOf(priceObj) };
}

function coordsOf(e: Record<string, unknown>): { lat: number | null; lon: number | null } {
  const loc = (e.location ?? {}) as Record<string, unknown>;
  const coords = (e.coordinates ?? loc.coordinates ?? loc) as Record<string, unknown>;
  return {
    lat: coord(coords.latitude) ?? coord(coords.lat),
    lon: coord(coords.longitude) ?? coord(coords.lon) ?? coord(coords.lng),
  };
}

function photosOf(e: Record<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: unknown) => {
    const u = httpUrl(v);
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };
  const thumbs = (e.lightThumbnails ?? {}) as Record<string, unknown>;
  if (Array.isArray(thumbs.firstUrls)) for (const u of thumbs.firstUrls) push(u);
  push(thumbs.lastUrl);
  push(e.thumbnailUrl);
  push(e.photo);
  if (Array.isArray(e.photos)) {
    for (const raw of e.photos) {
      if (typeof raw === "string") push(raw);
      else if (raw && typeof raw === "object") {
        const p = raw as Record<string, unknown>;
        push(p.url ?? p.thumbnailUrl ?? p.originalUrl);
      }
    }
  }
  return out;
}

function lieuOf(e: Record<string, unknown>): string | null {
  for (const v of [e.locationText, e.cityName]) {
    if (typeof v === "string" && v.trim()) return v.replace(/\s+/g, " ").trim();
  }
  const loc = e.location;
  if (loc && typeof loc === "object") {
    const city = (loc as { city?: unknown }).city;
    if (typeof city === "string" && city.trim()) return city.trim();
  }
  return null;
}

function canonicalBooking(deeplink: string, input: LiveSearchInput): string {
  try {
    const u = new URL(deeplink);
    if (!/(^|\.)booking\.com$/i.test(u.hostname)) return deeplink;
    u.hostname = "www.booking.com";
    u.searchParams.delete("label");
    u.searchParams.delete("aid");
    u.searchParams.set("checkin", input.checkIn);
    u.searchParams.set("checkout", input.checkOut);
    u.searchParams.set("group_adults", String(input.guests));
    u.searchParams.set("no_rooms", String(Math.max(1, input.bedrooms)));
    u.searchParams.set("selected_currency", "EUR");
    return u.toString();
  } catch {
    return deeplink;
  }
}

function entryCount(payloads: unknown[]): number {
  let n = 0;
  for (const p of payloads) {
    if (p && typeof p === "object" && Array.isArray((p as { entries?: unknown }).entries)) {
      n += (p as { entries: unknown[] }).entries.length;
    }
  }
  return n;
}

function entriesOf(json: unknown): unknown[] {
  if (json && typeof json === "object" && Array.isArray((json as { entries?: unknown }).entries)) {
    return (json as { entries: unknown[] }).entries;
  }
  return [];
}

type CozyFilters = {
  noBounds: boolean;
  price: [number, number];
  instantBooking: boolean;
  combinedTypeCodes: unknown[];
  starRatings: unknown[];
  minRating: number;
  ratingRequired: boolean;
  amenityCodes: unknown[];
  minBedRoomCount: number;
  minBathRoomCount: number;
  cityCodes: unknown[];
  areaCodes: unknown[];
  minResponseTime: null;
  updateBounds: boolean;
  breakfast: boolean;
  minCancellationCategory: number;
  providerCodes?: string[];
};

const PROVIDERS = ["airbnb", "abritel", "booking"] as const;
export type CozyProvider = (typeof PROVIDERS)[number];
/**
 * Deux cents fiches par requête : le serveur les accepte (mesuré le
 * 23 septembre 2026, 100 à 200 ms par page). Avec des pages de quarante et un
 * plafond de dix pages, on s'arrêtait à 400 fiches par fournisseur, publicités
 * comprises : à Avoriaz, 322 annonces Abritel sur 1 504, et le studio que le
 * propriétaire cherchait était 461e.
 */
const PAGE_SIZE = 200;
/**
 * Garde-fou, pas une lecture de la source : 3 000 fiches par fournisseur. Le
 * cas le plus lourd mesuré (Abritel à Avoriaz, 0 chambre) en demande 1 692,
 * soit neuf pages. L'arrêt normal est le compteur `filteredCount`.
 */
const MAX_PAGES = 15;
/** Une requête à la fois par domaine, et cette pause entre deux. */
const PAUSE_MS = 300;
/** La recherche Cozy se remplit en arrière-plan : on l'attend au plus ce temps. */
const ATTENTE_COMPLETE_MS = 10_000;
/** Taille de la petite page qui sert à sonder l'avancement de la recherche. */
const SONDE = 10;
/** Échéance par défaut d'un aller, quand l'appelant n'en donne pas. */
const ECHEANCE_DEFAUT_MS = 40_000;
/** Le plus long qu'une seule requête peut durer, même loin de l'échéance. */
const DELAI_REQUETE_MS = 15_000;

async function pullPage(
  page: Page,
  searchId: string,
  filters: Omit<CozyFilters, "providerCodes">,
  codes: string[],
  offset: number,
  count: number,
  delaiMs: number,
): Promise<unknown> {
  // Le délai s'applique dans la page, à la requête elle-même : une course
  // côté Node la laisserait courir chez Cozy, et la suivante partirait avant
  // la fin de la précédente. Sans délai, une requête qui pendait retenait tout
  // l'aller, et avec lui le relevé Airbnb direct qui l'attend.
  return page.evaluate(
    async ({ sid, base, providerCodes, from, count, delai }) =>
      fetch("/api/getResultList", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(delai),
        body: JSON.stringify({
          searchId: sid,
          sorting: "ranking",
          offset: from,
          count,
          filters: { ...base, providerCodes },
          estimateBounds: null,
          processNewResults: true,
          columnCount: 3,
          excludeAds: false,
          prefixAccommodationIds: [],
        }),
      }).then((r) => r.json()),
    { sid: searchId, base: filters, providerCodes: codes, from: offset, count, delai: delaiMs },
  );
}

/**
 * Le nombre de fiches que la source dit avoir pour **ce** filtre, ou `null`.
 *
 * On lisait `processedResultCount`, que le commentaire donnait pour l'arrêt
 * normal. C'est en réalité le total des offres brutes traitées, tous
 * fournisseurs confondus (4 360 à Avoriaz pour 1 504 Abritel), et il grimpe
 * pendant que la recherche se remplit : il n'arrêtait jamais rien. Le compteur
 * du filtre demandé est `filteredCount`.
 */
function filteredCountOf(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const n = (payload as { filteredCount?: unknown }).filteredCount;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

function allProcessedOf(payload: unknown): boolean {
  return Boolean(payload && typeof payload === "object" && (payload as { allProcessed?: unknown }).allProcessed === true);
}

/**
 * Le compteur du filtre, seulement quand la recherche est complète : avant,
 * il ment (0 puis 33 pour Airbnb dans les quatre premières secondes). Un
 * compteur relevé trop tôt passerait, dans le rapport, pour ce que la source
 * annonce.
 */
function compteurFiable(payload: unknown): number | null {
  return allProcessedOf(payload) ? filteredCountOf(payload) : null;
}

/**
 * Les identifiants de fiches d'une page, tels que la source les compte.
 *
 * Une page mêle trois sortes d'entrées : des fiches (`result`), des publicités
 * (`sponsoredResult`, sans `accommodationId`) et des bandeaux (`resultStrip`)
 * dont les `groups` portent des fiches — parfois absentes du premier niveau et
 * pourtant comptées dans `filteredCount`. L'union des fiches et des groupes
 * égale exactement le compteur, sur les seize paginations complètes relevées.
 */
export function idsFiches(entries: readonly unknown[]): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (v && typeof v === "object") {
      const id = idText((v as { accommodationId?: unknown }).accommodationId);
      if (id) out.push(id);
    }
  };
  for (const e of entries) {
    push(e);
    const groups = e && typeof e === "object" ? (e as { groups?: unknown }).groups : null;
    if (Array.isArray(groups)) for (const g of groups) push(g);
  }
  return out;
}

export type Horloge = { maintenant: () => number; attendre: (ms: number) => Promise<void> };
const HORLOGE: Horloge = { maintenant: () => Date.now(), attendre: sleep };

/** Une page demandée à la source, à partir d'un rang et pour un nombre de fiches. */
export type Tirage = (offset: number, count: number) => Promise<unknown>;

/**
 * Attend que la recherche Cozy ait fini de se remplir (`allProcessed`), en
 * relisant une petite page au rythme de la politesse.
 *
 * Avant cela, les compteurs mentent par défaut : celui d'Airbnb vaut 0 jusqu'à
 * environ 4 s, puis 33. `allProcessed` passe à vrai entre 5 et 9 s après le
 * lancement, et il est commun à toute la recherche : une seule attente suffit
 * pour tous les fournisseurs. Rend vrai si la recherche est complète, faux si
 * l'attente s'est épuisée — la pagination s'arrêtera alors sur la page
 * incomplète, comme avant.
 */
export async function attendreRecherche(
  tirer: Tirage,
  echeance: number,
  horloge: Horloge = HORLOGE,
): Promise<boolean> {
  const fin = Math.min(horloge.maintenant() + ATTENTE_COMPLETE_MS, echeance);
  for (;;) {
    await horloge.attendre(PAUSE_MS);
    if (allProcessedOf(await tirer(0, SONDE))) return true;
    if (horloge.maintenant() >= fin) return false;
  }
}

export type Pagination = {
  pages: unknown[];
  /** Fiches distinctes relevées. */
  releves: number;
  /**
   * Le `filteredCount` de la dernière page lue sur une recherche complète, ou
   * `null` s'il n'est pas publié ou pas encore fiable.
   */
  annonces: number | null;
  /** Pourquoi la pagination s'est arrêtée : écrit dans le journal. */
  arret: string;
};

/**
 * Toutes les pages d'un filtre, une requête à la fois, jusqu'au compteur que
 * la source publie.
 *
 * Le rang de la page suivante avance du nombre d'entrées reçues, publicités
 * comprises : c'est ainsi que la source numérote. Le compteur est relu à chaque
 * page et ne sert d'arrêt qu'une fois la recherche complète ; avant, seule une
 * page vide ou incomplète arrête. L'échéance rend ce qui est lu, sans erreur.
 */
export async function paginerFournisseur(
  tirer: Tirage,
  echeance: number,
  horloge: Horloge = HORLOGE,
): Promise<Pagination> {
  const pages: unknown[] = [];
  const ids = new Set<string>();
  let offset = 0;
  let annonces: number | null = null;
  let arret = `garde-fou ${MAX_PAGES} pages`;
  for (let n = 0; n < MAX_PAGES; n += 1) {
    if (horloge.maintenant() >= echeance) {
      arret = "échéance";
      break;
    }
    await horloge.attendre(PAUSE_MS);
    const page = await tirer(offset, PAGE_SIZE);
    const entries = entriesOf(page);
    // Relu à chaque page, même vide : une recherche complète sans rien pour ce
    // fournisseur publie 0, et c'est ce 0-là qu'on rapporte, pas « inconnu ».
    annonces = compteurFiable(page) ?? annonces;
    if (entries.length === 0) {
      arret = "page vide";
      break;
    }
    pages.push(page);
    offset += entries.length;
    const avant = ids.size;
    for (const id of idsFiches(entries)) ids.add(id);
    if (annonces != null && ids.size >= annonces) {
      arret = "compteur atteint";
      break;
    }
    if (entries.length < PAGE_SIZE) {
      arret = "page incomplète";
      break;
    }
    if (ids.size === avant) {
      arret = "page sans fiche nouvelle";
      break;
    }
  }
  return { pages, releves: ids.size, annonces, arret };
}

/**
 * Le nombre d'annonces que Cozy dit avoir pour ce fournisseur, relu sur la
 * dernière page qu'on lui a demandée ; `null` s'il n'est pas publié — jamais un
 * zéro de remplacement.
 */
export function cozyAnnonces(payloads: readonly unknown[], provider: CozyProvider): number | null {
  for (let i = payloads.length - 1; i >= 0; i -= 1) {
    const p = payloads[i];
    if (p && typeof p === "object" && (p as { fournisseur?: unknown }).fournisseur === provider) {
      return compteurFiable(p);
    }
  }
  return null;
}

/** Un aller Cozy, avec, par fournisseur, ce qu'il annonce et pourquoi on s'est arrêté. */
export type CollecteCozy = {
  payloads: unknown[];
  /** `filteredCount` d'une recherche complète, `0` compris ; `null` si inconnu. */
  annonces: Partial<Record<CozyProvider, number | null>>;
  /**
   * Le motif d'arrêt de chaque fournisseur demandé (« compteur atteint »,
   * « page vide », « échéance »…). Absent : le fournisseur n'a pas été
   * interrogé du tout — l'échéance est tombée avant son tour.
   */
  arrets: Partial<Record<CozyProvider, string>>;
};

/**
 * Un aller CozyCozy : une recherche, puis, fournisseur par fournisseur, toutes
 * ses pages jusqu'au compteur publié — une requête à la fois.
 *
 * Chaque page rendue porte `fournisseur`, le filtre qu'on a demandé (ajouté
 * ici, ce n'est pas une donnée de la source) : `cozyAnnonces` s'en sert.
 * `echeance` est un instant absolu (`Date.now()`) ; à l'échéance, l'aller
 * rend ce qu'il a déjà lu.
 */
export async function collectCozyPayloads(
  page: Page,
  input: LiveSearchInput,
  only?: readonly CozyProvider[],
  echeance: number = Date.now() + ECHEANCE_DEFAUT_MS,
): Promise<unknown[]> {
  return (await collecterCozy(page, input, only, echeance)).payloads;
}

export async function collecterCozy(
  page: Page,
  input: LiveSearchInput,
  only?: readonly CozyProvider[],
  echeance: number = Date.now() + ECHEANCE_DEFAUT_MS,
): Promise<CollecteCozy> {
  await allowsPath("https://www.cozycozy.com", "/");
  const payloads: unknown[] = [];
  const annonces: CollecteCozy["annonces"] = {};
  const arrets: CollecteCozy["arrets"] = {};
  let searchId: string | null = null;
  const onReq = (req: { url: () => string; postData: () => string | null }) => {
    if (!/\/api\/launch/.test(req.url())) return;
    try {
      const body = JSON.parse(req.postData() || "{}") as { searchId?: string };
      if (typeof body.searchId === "string") searchId = body.searchId;
    } catch {
      /* ignore */
    }
  };
  page.on("request", onReq);
  try {
    const reste = Math.max(1_000, echeance - Date.now());
    await page.goto(cozySearchUrl(input), { waitUntil: "domcontentloaded", timeout: Math.min(20_000, reste) });
    const untilId = Math.min(Date.now() + 10_000, echeance);
    while (!searchId && Date.now() < untilId) await sleep(40);
    if (!searchId) {
      console.warn("[cozy] pas de searchId");
      return { payloads, annonces, arrets };
    }
    const sid: string = searchId;
    const base: Omit<CozyFilters, "providerCodes"> = {
      noBounds: true,
      price: [-0.5, 9007199254740991],
      instantBooking: false,
      combinedTypeCodes: [],
      starRatings: [],
      minRating: 0,
      ratingRequired: false,
      amenityCodes: [],
      minBedRoomCount: Math.max(0, input.bedrooms),
      minBathRoomCount: 0,
      cityCodes: [],
      areaCodes: [],
      minResponseTime: null,
      updateBounds: false,
      breakfast: false,
      minCancellationCategory: 0,
    };
    const codes = only && only.length > 0 ? only : PROVIDERS;
    const tirage =
      (code: CozyProvider): Tirage =>
      (offset, count) =>
        pullPage(page, sid, base, [code], offset, count, Math.max(1_000, Math.min(DELAI_REQUETE_MS, echeance - Date.now())));
    // Une seule attente pour toute la recherche : `allProcessed` est commun
    // aux fournisseurs. Sans elle, le premier fournisseur lisait des
    // compteurs encore vides.
    const complete = await attendreRecherche(tirage(codes[0]), echeance);
    if (!complete) console.warn("[cozy] recherche encore incomplète — arrêt sur la page incomplète");
    for (const code of codes) {
      if (Date.now() >= echeance) break;
      const res = await paginerFournisseur(tirage(code), echeance);
      for (const p of res.pages) {
        payloads.push(p && typeof p === "object" ? { ...(p as object), fournisseur: code } : p);
      }
      annonces[code] = res.annonces;
      arrets[code] = res.arret;
      const cible = res.annonces != null ? ` sur ${res.annonces} annoncées` : " (compteur non publié)";
      console.info(`[cozy] ${code} ${res.releves} fiches${cible} — ${res.arret}`);
    }
    console.info(`[cozy] ${payloads.length} paquets · ${entryCount(payloads)} fiches`);
  } finally {
    page.off("request", onReq);
  }
  return { payloads, annonces, arrets };
}

/** Un décompte publié, ou `null`. Jamais un zéro de remplacement. */
function compte(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = Math.trunc(v);
    return n >= 0 && n <= 50 ? n : null;
  }
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return compte(Number(v.trim()));
  return null;
}

/**
 * Rang de tri : un total à zéro dit « prix non publié », jamais « gratuit ».
 * Ces annonces se rangent donc après les prix, et non en tête de liste.
 */
export function rangPrix(l: Pick<Listing, "total">): number {
  return l.total > 0 ? l.total : Number.MAX_SAFE_INTEGER;
}

/** Un identifiant publié, nombre ou chaîne, ramené au texte. */
function idText(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Les fiches Abritel et Booking d'un aller CozyCozy.
 *
 * Le collecteur ne trie plus : ni sur le prix, ni sur la capacité. Une annonce
 * dont la source n'a pas publié le total, ou qui l'annonce en « à partir de »,
 * ou qui ne dit pas combien elle couche, sort avec le champ vide — `total: 0`
 * pour un prix non publié, `null` pour le reste. Le filtre de l'écran
 * (`stay/lodgingFilter.ts`) sait distinguer « non annoncé » de « ne convient
 * pas », et compte ce qu'il masque ; ici, ces annonces disparaissaient sans
 * que personne puisse le savoir. Restent écartés les hôtels, que la source
 * met elle-même hors périmètre, et les doublons.
 */
export function cozyListings(
  payloads: unknown[],
  input: LiveSearchInput,
  source: "Abritel" | "Booking" | "Airbnb",
): Listing[] {
  const kind = source === "Abritel" ? "abritel" : source === "Airbnb" ? "airbnb" : "booking";
  const out: Listing[] = [];
  const seen = new Set<string>();
  for (const json of payloads) {
    if (!json || typeof json !== "object") continue;
    const list = Array.isArray((json as { entries?: unknown }).entries)
      ? ((json as { entries: unknown[] }).entries)
      : [];
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw as Record<string, unknown>;
      const h = providerHit(e, kind);
      if (!h) continue;
      const { total, indicative, devise } = prixOf(h);
      const name = typeof e.name === "string" ? e.name.replace(/\s+/g, " ").trim() : "";
      if (!name) continue;
      if ((kind === "booking" || kind === "airbnb") && isHotelOnly(name)) continue;
      const deeplink = deeplinkOf(h);
      if (!deeplink) continue;
      if (kind === "booking" && !deeplink.includes("booking.com")) continue;
      const details = (e.subTitleDetails ?? {}) as Record<string, unknown>;
      const occ = annoncer(
        occupancyFromRecord({ ...e, subTitleDetails: details, ...h }),
        name,
        typeof e.subTitle === "string" ? e.subTitle : "",
        typeof h.text === "string" ? h.text : "",
      );
      const baths = compte(details.bathRoomCount ?? h.bathRoomCount);
      const beds = compte(details.bedCount ?? h.bedCount);
      const { lat, lon } = coordsOf(e);
      const gallery = photosOf(e);
      const lieu = lieuOf(e);
      const typePublie = typeof e.title === "string" ? e.title.replace(/\s+/g, " ").trim() : "";
      const id = String(e.accommodationId ?? h.accommodationId ?? h.externalId ?? deeplink);
      const platformId = idText(h.externalId ?? h.unitId);
      const listingId = kind === "booking" ? `bk-${id}` : kind === "airbnb" ? `abnb-${id}` : `abr-${id}`;
      if (seen.has(listingId)) continue;
      seen.add(listingId);
      const url =
        kind === "abritel"
          ? canonicalAbritel(deeplink, input)
          : kind === "airbnb"
            ? canonicalAirbnb(deeplink, input, platformId)
            : canonicalBooking(deeplink, input);
      if (kind === "airbnb" && !/airbnb\.(?:fr|com)\/rooms\/\d+/i.test(url)) continue;
      out.push({
        id: listingId,
        stationId: input.stationId,
        title: name,
        source,
        total,
        currency: devise || "EUR",
        guests: occ.guests,
        bedrooms: occ.bedrooms,
        rooms: occ.rooms,
        beds,
        baths,
        propertyType: typePublie && typePublie.toLowerCase() !== name.toLowerCase() ? typePublie : null,
        available: true,
        photo: gallery[0] ?? null,
        photos: gallery.length > 0 ? gallery : null,
        priceIndicative: indicative ? true : null,
        platformId,
        url,
        lat,
        lon,
        locality: lieu,
        placeName: lieu,
        proven: `CozyCozy ${source} live ${input.checkIn}→${input.checkOut}`,
      });
    }
  }
  return out.sort((a, b) => rangPrix(a) - rangPrix(b));
}
