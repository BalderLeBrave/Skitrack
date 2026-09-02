/**
 * ITEA Chalet les Copains 38G253122 — 8 pers, 06/02 et 13/02 2027.
 * Tuile SERP : « À partir de 1 330 € par semaine » (teaser).
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
const CODE = "38G253122";
const WIDGET = `https://widget-fngf.itea.fr/fiche-${CODE}.html?WIDGET=RESAFNGF&KEY=FNGF-00M562O4&LANGUE=FR&NUMGITE=${CODE}`;
const FICHE =
  "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/chalet-les-copains-38g253122?adults=8&children=0&infants=0";

async function quoteWeek(page, deb, fin) {
  await page.goto(WIDGET, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2500);
  const fill = await page.evaluate(async ({ deb, fin }) => {
    const w = window;
    const cap = document.querySelector("#formule_selectCapacite");
    if (cap) {
      const opt = [...cap.options].find((o) => o.value === "8");
      cap.value = opt ? "8" : cap.options[cap.options.length - 1]?.value;
      cap.dispatchEvent(new Event("change", { bubbles: true }));
      if (typeof w.changeCapacitePourFormule === "function") w.changeCapacitePourFormule();
    }
    if (typeof w.setInputDateDeb === "function") w.setInputDateDeb(deb);
    await new Promise((r) => setTimeout(r, 800));
    if (typeof w.setInputDateFin === "function") w.setInputDateFin(fin);
    await new Promise((r) => setTimeout(r, 2800));
    if (typeof w.getTabPrixFormulesSejour === "function") w.getTabPrixFormulesSejour();
    else if (typeof w.lanceCalculPrixSejour === "function") w.lanceCalculPrixSejour();
    await new Promise((r) => setTimeout(r, 4000));
    const totalEl = document.querySelector(".sp_montantPrixTotal");
    const ctx = document.querySelector("#div_choixDates_packDivDatesTarifs");
    const img = document.querySelector("img[src*='photos']");
    return {
      start: document.querySelector("#inpt_resaDateDebCal")?.value,
      end: document.querySelector("#inpt_resaDateFinCal")?.value,
      cap: cap?.value,
      dataPrix: totalEl?.getAttribute("data-prix"),
      totalText: totalEl?.textContent?.trim(),
      loc: document.querySelector(".sp_prixLocation")?.textContent?.trim(),
      tax: document.querySelector(".sp_montantTaxe")?.textContent?.trim(),
      ident: ctx?.getAttribute("data-ident"),
      instance: ctx?.getAttribute("data-instance"),
      failed: /nous ne pouvons pas calculer/i.test(document.body.innerText),
      photo: img?.src,
      text: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 2500),
    };
  }, { deb, fin });
  const html = await page.content();
  writeFileSync(join(OUT, `gites_copains_${deb.replaceAll("/", "-")}.html`), html);
  return fill;
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
    viewport: { width: 900, height: 1400 },
  });
  await ctx.addInitScript(
    `(() => { try { Object.defineProperty(navigator, "webdriver", { get: () => undefined }) } catch {} })()`,
  );
  const page = await ctx.newPage();
  const fiche = { url: FICHE };
  try {
    const r = await page.goto(FICHE, { waitUntil: "domcontentloaded", timeout: 45_000 });
    fiche.http = r?.status();
    await page.waitForTimeout(2500);
    fiche.ld = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('script[type="application/ld+json"]').forEach((t) => {
        try {
          out.push(JSON.parse(t.textContent || "null"));
        } catch {}
      });
      return out;
    });
    fiche.type = await page.evaluate(() => document.querySelector(".g2f-accommodationTile-text-type, .g2f-type")?.textContent?.trim());
    fiche.text = await page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 2000));
  } catch (e) {
    fiche.error = String(e);
  }

  const w6 = await quoteWeek(page, "06/02/2027", "13/02/2027");
  const w13 = await quoteWeek(page, "13/02/2027", "20/02/2027");
  const report = { at: new Date().toISOString(), code: CODE, fiche, w6, w13 };
  writeFileSync(join(OUT, "gites-itea-copains.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ficheHttp: fiche.http,
    type: fiche.type,
    w6: { dataPrix: w6.dataPrix, totalText: w6.totalText, failed: w6.failed, ident: w6.ident, photo: w6.photo },
    w13: { dataPrix: w13.dataPrix, totalText: w13.totalText, failed: w13.failed },
    has4261: /4261/.test(JSON.stringify(report)),
    has1330: /1330/.test(JSON.stringify({ w6, w13 })),
  }, null, 2));
  await b.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
