import type { Page } from "playwright";
import type { Listing } from "@/lib/listings";
import { SCRAPE_UA } from "./browser.server";
import { allowsPath } from "./robots";
import type { LiveSearchInput } from "./types";

const KEY = "FNGF-00M562O4";

function townsId(name: string): string | null {
  const n = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (n.includes("deux alpes") || /(?:^|[^a-z0-9])2[\s-]?alpes(?:$|[^a-z0-9])/.test(n)) {
    return "50301";
  }
  if (n.includes("karellis") || n.includes("montricher")) return "64400";
  if (/angles-sur-correze/.test(n)) return null;
  if (/\bles angles\b/.test(n) || n.includes("les-angles")) return "61540";
  if (/vars-sur-roseix/.test(n)) return null;
  if (/\bvars\b/.test(n) || n.includes("foret blanche")) return "38123";
  return null;
}

function searchUrl(input: LiveSearchInput): string {
  const u = new URL("https://www.gites-de-france.com/fr/search");
  const towns = townsId(input.stationName);
  if (towns) {
    u.searchParams.set("towns", towns);
    u.searchParams.set("travelers", String(input.guests));
  } else {
    u.searchParams.set("destination", input.stationName);
    u.searchParams.set("adults", String(input.guests));
  }
  u.searchParams.set("date-start", input.checkIn);
  u.searchParams.set("date-end", input.checkOut);
  u.searchParams.set("f[0]", "type:36172");
  return u.toString();
}

function codeFromUrl(url: string): string | null {
  const m = url.match(/(\d{2}g\d{3,})/i);
  return m ? m[1].toUpperCase() : null;
}

function widgetUrl(code: string): string {
  const u = new URL(`https://widget-fngf.itea.fr/fiche-${code}.html`);
  u.searchParams.set("WIDGET", "RESAFNGF");
  u.searchParams.set("KEY", KEY);
  u.searchParams.set("LANGUE", "FR");
  u.searchParams.set("NUMGITE", code);
  return u.toString();
}

function isoToFr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

type Tile = {
  title: string;
  url: string;
  guests: number | null;
  bedrooms: number | null;
  photo: string | null;
};

async function extractTiles(page: Page): Promise<Tile[]> {
  return page.evaluate(() => {
    const out: Tile[] = [];
    const seen = new Set<string>();
    const tiles = document.querySelectorAll(".js-search-tile");
    const nodes = tiles.length > 0 ? tiles : document.querySelectorAll(".g2f-accommodationTile");
    nodes.forEach((node) => {
      const anchors = Array.from(node.querySelectorAll("a[href]")) as HTMLAnchorElement[];
      const link =
        (node.querySelector("a.g2f-accommodationTile-link") as HTMLAnchorElement | null) ||
        (node.querySelector("a.g2f-accommodationTile-image") as HTMLAnchorElement | null) ||
        anchors.find((a) => /\d{2}g\d{3,}/i.test(a.getAttribute("href") || a.href)) ||
        null;
      const href = link?.href;
      if (!href || !/\d{2}g\d{3,}/i.test(href)) return;
      if (/gite[-_]de[-_]groupe|gite[-_]de[-_]sejour|chambre[-_]d[-_]hotes/i.test(href)) return;
      if (/\/account\//i.test(href)) return;
      if (seen.has(href)) return;
      seen.add(href);
      const title =
        node.querySelector("h2, h3, a.g2f-accommodationTile-link")?.textContent?.trim() ||
        link?.getAttribute("title")?.trim() ||
        "";
      if (title.length < 3) return;
      const typeLabel =
        node.querySelector(".g2f-accommodationTile-text-type")?.textContent?.replace(/\s+/g, " ").trim() ||
        "";
      if (/chambre/i.test(typeLabel) && /h[oô]te/i.test(typeLabel)) return;
      if (/groupe/i.test(typeLabel)) return;
      const cap =
        node.querySelector(".g2f-accommodationTile-text-capacity")?.textContent?.replace(/\s+/g, " ") ||
        node.textContent ||
        "";
      const gm = /(\d+)\s*(?:personnes?|voyageurs?)/i.exec(cap);
      const bm = /(\d+)\s*chambres?/i.exec(cap);
      const img = node.querySelector("img") as HTMLImageElement | null;
      const rawPhoto =
        img?.getAttribute("data-src") ||
        img?.getAttribute("data-lazy") ||
        img?.currentSrc ||
        img?.src ||
        "";
      let photo: string | null = null;
      if (/^https?:/i.test(rawPhoto)) photo = rawPhoto;
      else if (rawPhoto.startsWith("//")) photo = `https:${rawPhoto}`;
      else if (rawPhoto.startsWith("/") && !/placeholder|pictos|sprite|1x1/i.test(rawPhoto)) {
        photo = `https://www.gites-de-france.com${rawPhoto}`;
      }
      out.push({
        title,
        url: href.split("?")[0],
        guests: gm ? Number(gm[1]) : null,
        bedrooms: bm ? Number(bm[1]) : null,
        photo: photo && /^https?:/.test(photo) ? photo : null,
      });
    });
    return out;
  });
}

async function quoteStay(code: string, checkIn: string, checkOut: string, guests: number): Promise<number | null> {
  const html = await fetch(widgetUrl(code), {
    headers: { "Accept-Language": "fr-FR", "User-Agent": SCRAPE_UA },
  }).then((r) => r.text());
  const ident = html.match(/data-ident="([^"]+)"/)?.[1];
  const instance = html.match(/data-instance="([^"]+)"/)?.[1];
  const exercice0 = html.match(/data-exercice="([^"]+)"/)?.[1];
  if (!ident || !instance || !exercice0) return null;
  if (!/\.G$/i.test(ident)) return null;
  const post = async (exercice: string, type: string) => {
    const body = new URLSearchParams({
      nbAdultes: String(guests),
      dateDeb: isoToFr(checkIn),
      dateFin: isoToFr(checkOut),
      instance,
      ident,
      exercice,
      estpresentsurfiche: "true",
      type,
    });
    const res = await fetch("https://widget-fngf.itea.fr/lib_2/ajax/gereResa.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://widget-fngf.itea.fr",
        Referer: widgetUrl(code),
      },
      body,
    });
    return res.text();
  };
  let exercice = exercice0;
  try {
    const exo = JSON.parse(await post(exercice, "getExerciceByDateFin")) as { exercice?: string };
    if (exo.exercice) exercice = String(exo.exercice);
  } catch {
    /* HTML */
  }
  const tab = await post(exercice, "getHTMLTabPrixFormulesSejour");
  if (/contactSiNonVendable/.test(tab)) return null;
  const m = tab.match(/sp_montantPrixTotal[^>]*data-prix="([\d.]+)"/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export async function scrapeGites(page: Page, input: LiveSearchInput): Promise<Listing[]> {
  await allowsPath("https://www.gites-de-france.com", "/");
  const url = searchUrl(input);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 22_000 });
  await page
    .waitForSelector(".js-search-tile, .g2f-accommodationTile", { timeout: 10_000 })
    .catch(() => null);
  const tiles = await extractTiles(page);
  const fit = tiles.filter((t) => {
    if (t.guests != null && t.guests < input.guests) return false;
    if (input.bedrooms > 0 && t.bedrooms != null && t.bedrooms < input.bedrooms) return false;
    return Boolean(codeFromUrl(t.url));
  });
  const need = fit.slice(0, 16);
  const out: Listing[] = [];
  const workers = 8;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, need.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= need.length) return;
        const tile = need[i];
        const code = codeFromUrl(tile.url);
        if (!code) continue;
        try {
          const total = await quoteStay(code, input.checkIn, input.checkOut, input.guests);
          if (total == null) continue;
          out.push({
            id: code,
            stationId: input.stationId,
            title: tile.title,
            source: "Gîtes de France",
            total,
            currency: "EUR",
            guests: tile.guests,
            bedrooms: tile.bedrooms,
            available: true,
            photo: tile.photo,
            url: `${tile.url}?adults=${input.guests}&date-start=${input.checkIn}&date-end=${input.checkOut}`,
            lat: null,
            lon: null,
            proven: `Devis ITEA live ${input.checkIn}→${input.checkOut}, ${input.guests} pers.`,
          });
        } catch {
          /* une fiche rate */
        }
      }
    }),
  );
  return out.sort((a, b) => a.total - b.total);
}
