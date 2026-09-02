/**
 * Dump the Gîtes de France listing quote widget (Chalet Maradri).
 *
 * SERP tiles publish a cached « À partir de N € par semaine » (gites_towns_50301.html).
 * The user-confirmed stay total is only after filling dates + occupancy + Rechercher.
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

const URL =
  "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/chalet-maradri-38g20200?adults=8&children=0&infants=0";

async function main() {
  const b = await chromium.launch({
    executablePath: SHELL,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });
  const ctx = await b.newContext({
    userAgent: UA,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    viewport: { width: 1440, height: 900 },
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
        post: (req.postData() || "").slice(0, 800),
      });
    }
  });
  page.on("response", async (res) => {
    const req = res.request();
    const t = req.resourceType();
    if (t === "xhr" || t === "fetch") {
      let body = "";
      try {
        body = (await res.text()).slice(0, 1500);
      } catch {
        body = "";
      }
      xhr.push({
        when: "res",
        status: res.status(),
        url: res.url().slice(0, 400),
        body,
      });
    }
  });

  const report = { at: new Date().toISOString(), url: URL, steps: [] };
  try {
    const resp = await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    report.http = resp?.status();
    report.title = await page.title();
    await page.waitForTimeout(4000);
    const html = await page.content();
    writeFileSync(join(OUT, "gites_maradri.html"), html);
    report.bytes = html.length;
    report.cf = /attention required|you have been blocked/i.test(html);

    report.form = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll("input, select, button, textarea")].map(
        (el) => ({
          tag: el.tagName,
          type: el.getAttribute("type"),
          name: el.getAttribute("name"),
          id: el.id,
          cls: el.className?.toString?.().slice(0, 160),
          placeholder: el.getAttribute("placeholder"),
          value: el.value?.toString?.().slice(0, 80),
          text: (el.textContent || "").trim().slice(0, 80),
        }),
      );
      const priceBits = [...document.querySelectorAll("[class*='price'], [class*='tarif'], [class*='total']")]
        .slice(0, 30)
        .map((el) => ({
          cls: el.className?.toString?.().slice(0, 120),
          text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
        }));
      return {
        inputs: inputs.slice(0, 80),
        priceBits,
        bodySnippet: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 2500),
      };
    });

    // Try filling Drupal date fields if they exist.
    const fill = await page.evaluate(() => {
      const start =
        document.querySelector('input[name="date-start"], input[name="arrival"], #edit-date-start');
      const end =
        document.querySelector('input[name="date-end"], input[name="departure"], #edit-date-end');
      const adults = document.querySelector('input[name="adults"], #edit-adults');
      const out = {
        start: start ? start.outerHTML.slice(0, 400) : null,
        end: end ? end.outerHTML.slice(0, 400) : null,
        adults: adults ? adults.outerHTML.slice(0, 400) : null,
      };
      if (start) {
        start.removeAttribute("readonly");
        start.value = "2027-02-06";
        start.dispatchEvent(new Event("input", { bubbles: true }));
        start.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (end) {
        end.removeAttribute("readonly");
        end.value = "2027-02-13";
        end.dispatchEvent(new Event("input", { bubbles: true }));
        end.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (adults) {
        adults.value = "8";
        adults.dispatchEvent(new Event("input", { bubbles: true }));
        adults.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return out;
    });
    report.fill = fill;

    const searchBtn = page.locator(
      'button:has-text("Rechercher"), input[type="submit"][value*="Rechercher"], button[type="submit"]',
    );
    report.searchCount = await searchBtn.count();
    if ((await searchBtn.count()) > 0) {
      await searchBtn.first().click({ timeout: 8000 }).catch((e) => {
        report.clickError = String(e).slice(0, 200);
      });
      await page.waitForTimeout(5000);
    }
    report.afterUrl = page.url();
    report.afterTitle = await page.title();
    const afterHtml = await page.content();
    writeFileSync(join(OUT, "gites_maradri_after.html"), afterHtml);
    report.afterText = await page.evaluate(() =>
      (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 3500),
    );
    report.priceAfter = await page.evaluate(() => {
      const t = document.body?.innerText || "";
      const m = t.match(/2[\s\u00a0]?448[^\n]{0,40}|1[\s\u00a0]?700[^\n]{0,40}|€[^\n]{0,40}/g);
      return m ? m.slice(0, 20) : [];
    });
  } catch (e) {
    report.error = String(e).slice(0, 600);
  } finally {
    report.xhr = xhr.slice(0, 80);
    writeFileSync(join(OUT, "gites-fiche-price.json"), JSON.stringify(report, null, 2));
    await b.close();
  }
  console.log(JSON.stringify({ http: report.http, cf: report.cf, error: report.error, xhr: xhr.length, after: report.priceAfter, searchCount: report.searchCount }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
