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

function providerHit(entry: Record<string, unknown>, kind: "abritel" | "booking"): Record<string, unknown> | null {
  const hits = Array.isArray(entry.highlightedResults) ? entry.highlightedResults : [];
  for (const raw of hits) {
    if (!raw || typeof raw !== "object") continue;
    const h = raw as Record<string, unknown>;
    const blob = `${h.providerCode ?? ""} ${h.providerName ?? ""} ${h.deeplinkUrl ?? ""}`;
    if (kind === "abritel" ? isVrbo(blob) : isBooking(blob)) return h;
  }
  if (kind === "abritel" && entry.provider && typeof entry.provider === "object") {
    const h = entry.provider as Record<string, unknown>;
    const blob = `${h.providerCode ?? ""} ${h.providerName ?? ""} ${h.deeplinkUrl ?? ""}`;
    if (isVrbo(blob)) return h;
  }
  return null;
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

const PROVIDERS = ["abritel", "booking"] as const;
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
export async function collectCozyPayloads(page: Page, input: LiveSearchInput): Promise<unknown[]> {
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
    for (const code of PROVIDERS) {
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
  source: "Abritel" | "Booking",
): Listing[] {
  const kind = source === "Abritel" ? "abritel" : "booking";
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
      const priceObj = h.totalPrice as Record<string, unknown> | undefined;
      // Un « à partir de » n'est pas un total de séjour : il ressort à zéro,
      // c'est-à-dire « prix non publié » au sens de `Listing.total`, avec le
      // drapeau qui dit pourquoi. Supprimer l'annonce n'apprenait rien.
      const indicative = priceObj?.indicative === true;
      const stayRaw = priceObj?.value ?? h.eurPriceValue;
      const total =
        !indicative && typeof stayRaw === "number" && stayRaw > 0 ? Math.round(stayRaw) : 0;
      // La devise était écrite en dur. On la lit quand la source la publie à
      // côté du montant ; EUR reste le défaut, faute de charge enregistrée.
      const devise = typeof priceObj?.currency === "string" ? priceObj.currency.trim() : "";
      const name = typeof e.name === "string" ? e.name.replace(/\s+/g, " ").trim() : "";
      if (!name) continue;
      if (kind === "booking" && isHotelOnly(name)) continue;
      const deeplink = typeof h.deeplinkUrl === "string" ? h.deeplinkUrl : "";
      if (!deeplink) continue;
      if (kind === "booking" && !deeplink.includes("booking.com")) continue;
      const details = (e.subTitleDetails ?? {}) as Record<string, unknown>;
      const occ = annoncer(
        occupancyFromRecord({ ...e, subTitleDetails: details, ...h }),
        name,
        typeof e.subTitle === "string" ? e.subTitle : "",
      );
      // Le décompte de salles de bain a son filtre chez la source
      // (`minBathRoomCount`), donc son champ ; aucune charge CozyCozy n'est
      // enregistrée dans le dépôt pour en prouver le nom sur la fiche, d'où
      // cette lecture facultative, qui reste `null` si la clé est absente.
      const baths = compte(details.bathRoomCount);
      const coords = (e.coordinates ?? {}) as Record<string, unknown>;
      const lat = coord(coords.latitude) ?? coord(coords.lat);
      const lon = coord(coords.longitude) ?? coord(coords.lon) ?? coord(coords.lng);
      const thumbs = (e.lightThumbnails ?? {}) as Record<string, unknown>;
      const first = Array.isArray(thumbs.firstUrls) ? thumbs.firstUrls : [];
      // Toutes les vignettes publiées sortent, la première en tête ; seule
      // celle-là était gardée. `firstUrls` n'est qu'un aperçu : sa longueur
      // n'est pas le nombre de photos du bien, et on n'en pose aucun.
      const gallery = first.map(httpUrl).filter((u): u is string => u !== null);
      const id = String(e.accommodationId ?? h.accommodationId ?? h.externalId ?? deeplink);
      // `id` reste celui de CozyCozy : il est stable et c'est lui qui
      // dédoublonne. L'identifiant du bien chez Abritel ou Booking partait
      // avec lui ; il a désormais son champ.
      const platformId = idText(h.externalId);
      const listingId = kind === "booking" ? `bk-${id}` : `abr-${id}`;
      if (seen.has(listingId)) continue;
      seen.add(listingId);
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
        baths,
        available: true,
        photo: gallery[0] ?? httpUrl(e.photo),
        photos: gallery.length > 0 ? gallery : null,
        priceIndicative: indicative ? true : null,
        platformId,
        url: kind === "abritel" ? canonicalAbritel(deeplink, input) : canonicalBooking(deeplink, input),
        lat,
        lon,
        proven: `CozyCozy ${source} live ${input.checkIn}→${input.checkOut}`,
      });
    }
  }
  return out.sort((a, b) => rangPrix(a) - rangPrix(b));
}
