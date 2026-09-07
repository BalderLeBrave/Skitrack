/**
 * Quote ITEA générique — plusieurs ids, deux semaines, 8 pers.
 * POST gereResa.php (dump gites-itea-8p.json), pas un if (id === Copains).
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "/tmp/skitrack/docs/diagnostics/dumps";
mkdirSync(OUT, { recursive: true });
const SHELL =
  "/opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const CODES = [
  "38G253122", // Copains
  "38G253101", // Pré-Forent
  "38G52734", // Centaurée
  "38G52200", // Feuillardiers
  "38G52202", // Lys Lodge
  "38G253115", // La Mansio (possible groupe)
  "38G549050", // Brindille (possible chambre)
];

const WEEKS = [
  { check_in: "2027-02-06", check_out: "2027-02-13", deb: "06/02/2027", fin: "13/02/2027" },
  { check_in: "2027-02-13", check_out: "2027-02-20", deb: "13/02/2027", fin: "20/02/2027" },
];

function widgetUrl(code) {
  return `https://widget-fngf.itea.fr/fiche-${code}.html?WIDGET=RESAFNGF&KEY=FNGF-00M562O4&LANGUE=FR&NUMGITE=${code}`;
}

function parseEuro(raw) {
  if (!raw) return null;
  const n = Number(String(raw).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

async function main() {
  const b = await chromium.launch({
    executablePath: SHELL,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
  });
  const ctx = await b.newContext({
    userAgent: UA,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    viewport: { width: 900, height: 1200 },
  });
  await ctx.addInitScript(
    `(() => { try { Object.defineProperty(navigator, "webdriver", { get: () => undefined }) } catch {} })()`,
  );
  const page = await ctx.newPage();
  const catalog = [];

  for (const code of CODES) {
    const row = { code, widget: widgetUrl(code), quotes: [], error: null };
    try {
      const r = await page.goto(widgetUrl(code), { waitUntil: "domcontentloaded", timeout: 45_000 });
      row.http = r?.status() ?? 0;
      await page.waitForTimeout(1800);
      const meta = await page.evaluate(() => {
        const box = document.querySelector("#div_choixDates_packDivDatesTarifs");
        const og = document.querySelector('meta[property="og:url"]')?.getAttribute("content") || "";
        const title = document.querySelector("h1, .titreFiche, .nomGite")?.textContent?.replace(/\s+/g, " ").trim() || "";
        const typeEl =
          document.querySelector(".typeHebergement, .natureGite, .g2f-accommodationTile-text-type, .libelleType")
            ?.textContent?.replace(/\s+/g, " ")
            .trim() || "";
        const cap = document.querySelector("#formule_selectCapacite");
        const opts = cap ? [...cap.options].map((o) => o.value) : [];
        const img = document.querySelector("img[src*='photos']");
        const from = document.querySelector(".prixSansDate, .prixAPartirDe")?.textContent?.replace(/\s+/g, " ").trim() || "";
        const lat = document.querySelector("[data-lat]")?.getAttribute("data-lat");
        const lng = document.querySelector("[data-lng]")?.getAttribute("data-lng");
        const ident = box?.getAttribute("data-ident") || "";
        const instance = box?.getAttribute("data-instance") || "";
        const exercice = box?.getAttribute("data-exercice") || "";
        const bedrooms = (document.body.innerText.match(/(\d+)\s*chambres?/i) || [])[1];
        const guestsTxt = (document.body.innerText.match(/(\d+)\s*personnes?/i) || [])[1];
        return {
          og,
          title,
          typeEl,
          guestsMax: opts.length ? Number(opts[opts.length - 1]) : null,
          guestsOptions: opts,
          photo: img?.src || null,
          weeklyFromText: from,
          lat: lat ? Number(lat) : null,
          lng: lng ? Number(lng) : null,
          ident,
          instance,
          exercice,
          bedrooms: bedrooms ? Number(bedrooms) : null,
          guestsTxt: guestsTxt ? Number(guestsTxt) : null,
        };
      });
      Object.assign(row, meta);
      const weekly = meta.weeklyFromText.match(/(\d[\d\s]*)\s*€/);
      row.weekly_from = weekly ? parseEuro(weekly[1].replace(/\s/g, "")) : null;

      for (const week of WEEKS) {
        const quote = { ...week, guests: 8, stay: null, lodging: null, tax: null, available: false, body: "" };
        try {
          const body = await page.evaluate(async (args) => {
            const box = document.querySelector("#div_choixDates_packDivDatesTarifs");
            const ident = box?.getAttribute("data-ident") || args.ident;
            const instance = box?.getAttribute("data-instance") || args.instance;
            let exercice = box?.getAttribute("data-exercice") || args.exercice;
            const post = async (type, extra = {}) => {
              const params = new URLSearchParams({
                nbAdultes: String(args.adults),
                dateDeb: args.deb,
                dateFin: args.fin,
                instance,
                ident,
                exercice,
                estpresentsurfiche: "true",
                type,
                ...extra,
              });
              const res = await fetch("/lib_2/ajax/gereResa.php", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params.toString(),
              });
              return { status: res.status, text: await res.text() };
            };
            const exo = await post("getExerciceByDateFin");
            try {
              const j = JSON.parse(exo.text);
              if (j.exercice) exercice = String(j.exercice);
            } catch {
              /* HTML ou vide */
            }
            const tab = await post("getHTMLTabPrixFormulesSejour");
            return tab;
          }, {
            deb: week.deb,
            fin: week.fin,
            adults: 8,
            ident: meta.ident,
            instance: meta.instance,
            exercice: meta.exercice,
          });
          quote.http = body.status;
          quote.body = (body.text || "").slice(0, 2500);
          const stay = (body.text || "").match(/sp_montantPrixTotal[^>]*data-prix="([\d.]+)"/i);
          const loc = (body.text || "").match(/sp_montantLocation[^>]*>([\d\s.,]+)/i);
          const tax = (body.text || "").match(/sp_montantTaxeSejour[^>]*>([\d\s.,]+)/i);
          if (stay) {
            quote.stay = parseEuro(stay[1]);
            quote.available = quote.stay != null;
          }
          if (loc) quote.lodging = parseEuro(loc[1]);
          if (tax) quote.tax = parseEuro(tax[1]);
          if (!quote.stay && /contactSiNonVendable|nous ne pouvons pas calculer/i.test(body.text || "")) {
            quote.available = false;
            quote.reason = "not_fillable";
          }
        } catch (e) {
          quote.error = String(e?.message || e);
        }
        row.quotes.push(quote);
      }
    } catch (e) {
      row.error = String(e?.message || e);
    }
    catalog.push(row);
    console.log(JSON.stringify({
      code: row.code,
      type: row.typeEl,
      og: row.og,
      weekly_from: row.weekly_from,
      guestsMax: row.guestsMax,
      bedrooms: row.bedrooms,
      quotes: row.quotes.map((q) => ({ week: q.check_in, stay: q.stay, available: q.available, reason: q.reason })),
      error: row.error,
    }));
  }

  writeFileSync(join(OUT, "gites-itea-catalog.json"), JSON.stringify({ at: new Date().toISOString(), catalog }, null, 2));
  await b.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
