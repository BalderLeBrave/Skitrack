/**
 * Dump ITEA booking widget for Chalet Maradri (38G20200).
 * Parent fiche: « A partir de 1700 € /semaine » in iframe widget-fngf.itea.fr.
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

const TRIES = [
  WIDGET,
  `${WIDGET}&DATEDEB=06/02/2027&DATEFIN=13/02/2027&NBPERS=8`,
  `${WIDGET}&datedeb=2027-02-06&datefin=2027-02-13&nbpers=8`,
  `${WIDGET}&date-start=2027-02-06&date-end=2027-02-13&adults=8`,
  `${WIDGET}&ARRIVEE=06/02/2027&DEPART=13/02/2027&PERSONNES=8`,
];

async function dumpUrl(page, url, id) {
  const xhr = [];
  const onReq = (req) => {
    const t = req.resourceType();
    if (t === "xhr" || t === "fetch" || t === "document") {
      xhr.push({
        when: "req",
        method: req.method(),
        type: t,
        url: req.url().slice(0, 500),
        post: (req.postData() || "").slice(0, 600),
      });
    }
  };
  const onRes = async (res) => {
    const req = res.request();
    const t = req.resourceType();
    if (t === "xhr" || t === "fetch") {
      let body = "";
      try {
        body = (await res.text()).slice(0, 2000);
      } catch {
        body = "";
      }
      xhr.push({ when: "res", status: res.status(), url: res.url().slice(0, 500), body });
    }
  };
  page.on("request", onReq);
  page.on("response", onRes);
  const item = { id, url };
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    item.http = resp?.status();
    item.finalUrl = page.url();
    item.title = await page.title();
    await page.waitForTimeout(3500);
    const html = await page.content();
    writeFileSync(join(OUT, `${id}.html`), html);
    item.bytes = html.length;
    item.text = await page.evaluate(() =>
      (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 4000),
    );
    item.fields = await page.evaluate(() =>
      [...document.querySelectorAll("input, select, button, textarea")].slice(0, 60).map((el) => ({
        tag: el.tagName,
        type: el.getAttribute("type"),
        name: el.getAttribute("name"),
        id: el.id,
        cls: el.className?.toString?.().slice(0, 120),
        placeholder: el.getAttribute("placeholder"),
        value: el.value?.toString?.().slice(0, 80),
        text: (el.textContent || "").trim().slice(0, 80),
      })),
    );
    item.has2448 = /2448/.test(item.text + html);
    item.has1700 = /1700/.test(item.text + html);
    item.scripts = await page.evaluate(() =>
      [...document.querySelectorAll("script[src]")].map((s) => s.getAttribute("src")).slice(0, 20),
    );
  } catch (e) {
    item.error = String(e).slice(0, 400);
  }
  page.off("request", onReq);
  page.off("response", onRes);
  item.xhr = xhr.filter((x) => /itea|dispon|tarif|prix|resa|gite/i.test(x.url)).slice(0, 40);
  item.xhrAll = xhr.slice(0, 30);
  return item;
}

async function fillWidget(page) {
  const report = { step: "fill" };
  try {
    await page.selectOption('select[name*="mois"], select.pika-select-month', { label: "février" }).catch(() => {});
    await page.selectOption('select.pika-select-year', "2027").catch(() => {});
    report.afterNav = await page.evaluate(() => {
      const months = [...document.querySelectorAll("select")].map((s) => ({
        name: s.name,
        id: s.id,
        cls: s.className?.toString?.().slice(0, 80),
        value: s.value,
      }));
      return { months, text: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 1500) };
    });

    // Click day 6 then 13 if visible.
    const days = page.locator("button.pika-day, td a, .day, [data-day]");
    report.dayCount = await days.count();
    const clickDay = async (n) => {
      const loc = page.locator(`button.pika-day:has-text("${n}"), [data-day="${n}"]`);
      const c = await loc.count();
      if (c > 0) {
        await loc.first().click();
        return true;
      }
      return false;
    };
    report.clicked6 = await clickDay("6");
    await page.waitForTimeout(400);
    report.clicked13 = await clickDay("13");

    // Occupancy
    const adults = page.locator('input[name="adults"], input[name="nbpers"], input[name="personnes"], select[name="nbpers"]');
    if ((await adults.count()) > 0) {
      await adults.first().fill("8").catch(async () => {
        await adults.first().selectOption("8").catch(() => {});
      });
    }

    const search = page.locator(
      'button:has-text("Rechercher"), input[value*="Rechercher"], button:has-text("Vérifier"), button:has-text("Calculer")',
    );
    report.searchCount = await search.count();
    if ((await search.count()) > 0) {
      await search.first().click();
      await page.waitForTimeout(4000);
    }
    report.afterText = await page.evaluate(() =>
      (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 4000),
    );
    const html = await page.content();
    writeFileSync(join(OUT, "gites_itea_filled.html"), html);
    report.has2448 = /2448/.test(report.afterText + html);
    report.has1700 = /1700/.test(report.afterText + html);
  } catch (e) {
    report.error = String(e).slice(0, 400);
  }
  return report;
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
  const report = { at: new Date().toISOString(), items: [] };
  for (const [i, url] of TRIES.entries()) {
    const item = await dumpUrl(page, url, `gites_itea_${i}`);
    report.items.push({
      id: item.id,
      http: item.http,
      has2448: item.has2448,
      has1700: item.has1700,
      text: item.text,
      fields: item.fields,
      scripts: item.scripts,
      xhr: item.xhr,
      error: item.error,
      url: item.url,
    });
    console.log(JSON.stringify({ i, http: item.http, has1700: item.has1700, has2448: item.has2448, fields: item.fields?.length, text: item.text?.slice(0, 180) }));
  }
  report.fill = await fillWidget(page);
  console.log("FILL", JSON.stringify({ has2448: report.fill.has2448, has1700: report.fill.has1700, search: report.fill.searchCount, err: report.fill.error, text: report.fill.afterText?.slice(0, 300) }));
  writeFileSync(join(OUT, "gites-itea.json"), JSON.stringify(report, null, 2));
  await b.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
