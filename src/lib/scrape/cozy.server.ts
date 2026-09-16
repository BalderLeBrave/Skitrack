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
const PAGE_SIZE = 40;
/**
 * Deux bornes de sécurité, explicites, et ni l'une ni l'autre n'est une lecture
 * de la source : c'est `processedResultCount` qui commande l'arrêt normal.
 * Dix pages de quarante fiches par fournisseur couvrent largement une station.
 */
const MAX_PAGES = 10;
const BUDGET_MS = 12_000;
/** Une requête à la fois par domaine, et cette pause entre deux. */
const PAUSE_MS = 280;

async function pullPage(
  page: Page,
  searchId: string,
  filters: Omit<CozyFilters, "providerCodes">,
  codes: string[],
  offset: number,
): Promise<unknown> {
  return page.evaluate(
    async ({ sid, base, providerCodes, from, count }) =>
      fetch("/api/getResultList", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
    { sid: searchId, base: filters, providerCodes: codes, from: offset, count: PAGE_SIZE },
  );
}

/**
 * Le compteur de résultats publié par la charge, ou `null` s'il ne l'est pas.
 *
 * Il n'est remplacé par aucune valeur inventée : sans lui, la pagination
 * s'arrête sur la première page incomplète, ce qui est observable.
 */
function processedCount(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const n = (payload as { processedResultCount?: unknown }).processedResultCount;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/**
 * Un aller CozyCozy. Abritel et Booking sont demandés à l’API, sans défiler, et
 * page après page jusqu’au compteur qu’elle publie — une requête à la fois.
 */
export async function collectCozyPayloads(
  page: Page,
  input: LiveSearchInput,
  only?: readonly CozyProvider[],
): Promise<unknown[]> {
  await allowsPath("https://www.cozycozy.com", "/");
  const payloads: unknown[] = [];
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
    await page.goto(cozySearchUrl(input), { waitUntil: "domcontentloaded", timeout: 20_000 });
    const untilId = Date.now() + 10_000;
    while (!searchId && Date.now() < untilId) await sleep(40);
    if (!searchId) {
      console.warn("[cozy] pas de searchId");
      return payloads;
    }
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
    const readyUntil = Date.now() + 10_000;
    const codes = only && only.length > 0 ? only : PROVIDERS;
    for (const code of codes) {
      // La recherche Cozy se remplit en arrière-plan : la première page peut
      // revenir vide. On la redemande jusqu'à l'échéance — une requête à la
      // fois, là où les deux fournisseurs partaient ensemble sur le même
      // domaine.
      let first: unknown = null;
      for (;;) {
        await sleep(PAUSE_MS);
        first = await pullPage(page, searchId, base, [code], 0);
        if (entriesOf(first).length > 0) break;
        if (Date.now() >= readyUntil) break;
      }
      let got = entriesOf(first).length;
      if (got === 0) {
        console.warn(`[cozy] ${code} : aucune fiche`);
        continue;
      }
      payloads.push(first);
      // On demandait une page de quarante fiches, une seule fois, et on
      // laissait le reste à la source. Elle publie pourtant ce qu'elle a
      // traité : on va jusqu'à ce compteur, et à défaut jusqu'à la première
      // page incomplète, en tenant le même rythme entre deux appels.
      const announced = processedCount(first);
      const until = Date.now() + BUDGET_MS;
      for (let n = 1; n < MAX_PAGES && got >= PAGE_SIZE; n += 1) {
        if (announced != null && got >= announced) break;
        if (Date.now() >= until) break;
        await sleep(PAUSE_MS);
        const next = await pullPage(page, searchId, base, [code], got);
        const fresh = entriesOf(next).length;
        if (fresh === 0) break;
        payloads.push(next);
        got += fresh;
        if (fresh < PAGE_SIZE) break;
      }
      const cible = announced != null ? ` sur ${announced} annoncées` : " (compteur non publié)";
      console.info(`[cozy] ${code} ${got} fiches${cible}`);
    }
    console.info(`[cozy] ${payloads.length} paquets · ${entryCount(payloads)} fiches`);
  } finally {
    page.off("request", onReq);
  }
  return payloads;
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
