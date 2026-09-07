import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "/tmp/skitrack/docs/diagnostics/dumps";
mkdirSync(OUT, { recursive: true });
const SHELL =
  "/opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const targets = [
  ["gites_angles_61540", "https://www.gites-de-france.com/fr/search?towns=61540&travelers=8&date-start=2027-02-13&date-end=2027-02-20"],
  ["gites_karellis_64400", "https://www.gites-de-france.com/fr/search?towns=64400&travelers=8&date-start=2027-02-13&date-end=2027-02-20"],
  ["gites_vars_38123", "https://www.gites-de-france.com/fr/search?towns=38123&travelers=8&date-start=2027-02-13&date-end=2027-02-20"],
];

const report = { at: new Date().toISOString(), items: [] };
const b = await chromium.launch({
  executablePath: SHELL,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const ctx = await b.newContext({ userAgent: UA, locale: "fr-FR", viewport: { width: 1440, height: 900 } });

for (const [id, url] of targets) {
  const page = await ctx.newPage();
  const item = { id, url, http: null, title: "", error: null };
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 50000 });
    item.http = res?.status() ?? null;
    item.finalUrl = page.url();
    item.title = await page.title();
    await page.waitForTimeout(8000);
    item.evaled = await page.evaluate(() => {
      const tiles = document.querySelectorAll(".js-search-tile, .gite-card");
      const text = document.body.innerText || "";
      const count = (text.match(/(\d+)\s*R[ée]sultats?/i) || [null, null])[1];
      const cards = [...tiles].slice(0, 6).map((n) => (n.innerText || "").replace(/\s+/g, " ").slice(0, 180));
      return {
        jsSearchTile: document.querySelectorAll(".js-search-tile").length,
        giteCard: document.querySelectorAll(".gite-card").length,
        countPhrase: count,
        pers: (text.match(/\d+\s*personnes?/gi) || []).length,
        chambres: (text.match(/\d+\s*chambres?/gi) || []).length,
        cards,
        cf: /just a moment|Attention Required/i.test(text),
        oups: /Oups/i.test(text),
      };
    });
  } catch (e) {
    item.error = String(e).slice(0, 300);
  } finally {
    await page.close();
  }
  report.items.push(item);
  console.log(id, item.http, item.evaled?.jsSearchTile, item.evaled?.countPhrase, item.error);
}

await b.close();
writeFileSync(join(OUT, "gites-towns-reds.json"), JSON.stringify(report, null, 2));
console.log("DONE");
