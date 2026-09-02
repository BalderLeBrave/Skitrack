/**
 * Fill ITEA widget dates (dump-proven fields) and capture verifDates / prix séjour.
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
const WIDGET =
  "https://widget-fngf.itea.fr/fiche-38G20200.html?WIDGET=RESAFNGF&KEY=FNGF-00M562O4&LANGUE=FR&NUMGITE=38G20200";

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
  const xhr = [];
  page.on("request", (req) => {
    const t = req.resourceType();
    if (t === "xhr" || t === "fetch") {
      xhr.push({
        when: "req",
        method: req.method(),
        url: req.url().slice(0, 400),
        post: (req.postData() || "").slice(0, 1200),
      });
    }
  });
  page.on("response", async (res) => {
    const req = res.request();
    if (req.resourceType() !== "xhr" && req.resourceType() !== "fetch") return;
    let body = "";
    try {
      body = (await res.text()).slice(0, 4000);
    } catch {
      body = "";
    }
    xhr.push({ when: "res", status: res.status(), url: res.url().slice(0, 400), body });
  });

  const report = { at: new Date().toISOString() };
  const resp = await page.goto(WIDGET, { waitUntil: "domcontentloaded", timeout: 45_000 });
  report.http = resp?.status();
  await page.waitForTimeout(2500);

  // Calendar planning (availability of days).
  report.planning = await page.evaluate(async () => {
    const ident = document.querySelector("#div_choixDates_packDivDatesTarifs")?.getAttribute("data-ident");
    const r = await fetch("/lib_2/ajax/gereCalendrier.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `action=getPlanningDebPourDatepicker&ident=${encodeURIComponent(ident || "")}`,
    });
    const text = await r.text();
    return { status: r.status, ident, text: text.slice(0, 2500) };
  });

  // Fill dates the way the widget expects (DD/MM/YYYY) + 8 personnes, then lanceCalculPrixSejour.
  report.fill = await page.evaluate(async () => {
    const start = document.querySelector("#inpt_resaDateDebCal");
    const end = document.querySelector("#inpt_resaDateFinCal");
    const cap = document.querySelector("#formule_selectCapacite");
    if (cap) {
      cap.value = "8";
      cap.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (typeof window.setInputDateDeb === "function") {
      window.setInputDateDeb("06/02/2027");
    } else if (start) {
      start.value = "06/02/2027";
    }
    await new Promise((r) => setTimeout(r, 400));
    if (typeof window.setInputDateFin === "function") {
      window.setInputDateFin("13/02/2027");
    } else if (end) {
      end.value = "13/02/2027";
    }
    await new Promise((r) => setTimeout(r, 800));
    if (typeof window.lanceCalculPrixSejour === "function") {
      window.lanceCalculPrixSejour();
    } else if (typeof window.getTabPrixFormulesSejour === "function") {
      window.getTabPrixFormulesSejour();
    }
    return {
      start: start?.value,
      end: end?.value,
      cap: cap?.value,
      hasLance: typeof window.lanceCalculPrixSejour === "function",
      hasGetTab: typeof window.getTabPrixFormulesSejour === "function",
      hasSetFin: typeof window.setInputDateFin === "function",
    };
  });

  await page.waitForTimeout(6000);
  report.afterText = await page.evaluate(() =>
    (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 4000),
  );
  report.priceHtml = await page.evaluate(() => {
    const n = document.querySelector(".tarifFicheApartirDe, .div_infosPrixSejour, .sp_prixLocation");
    return n ? n.innerHTML.slice(0, 1500) : null;
  });
  const html = await page.content();
  writeFileSync(join(OUT, "gites_itea_dated.html"), html);
  report.has2448 = /2448/.test(report.afterText + html + JSON.stringify(xhr));
  report.has1700 = /1700/.test(report.afterText + html);
  report.xhr = xhr.filter((x) => /gereResa|gereCalendrier|verifDates|Prix/i.test(x.url + (x.post || ""))).slice(0, 40);
  writeFileSync(join(OUT, "gites-itea-dates.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      http: report.http,
      fill: report.fill,
      has2448: report.has2448,
      has1700: report.has1700,
      priceHtml: report.priceHtml,
      after: report.afterText?.slice(0, 400),
      xhrN: report.xhr.length,
      planningHead: report.planning?.text?.slice(0, 300),
    }, null, 2),
  );
  await b.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
