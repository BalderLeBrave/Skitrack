import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "/tmp/skitrack/docs/diagnostics/dumps";
mkdirSync(OUT, { recursive: true });
const SHELL =
  "/opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const url =
  "https://www.cozycozy.com/fr/search/Les%20Deux%20Alpes%20station%20de%20ski%2C%20France/2027-02-13/2027-02-20/4-8-0/results";

const b = await chromium.launch({
  executablePath: SHELL,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const ctx = await b.newContext({ userAgent: UA, locale: "fr-FR", viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(`Object.defineProperty(navigator, 'webdriver', { get: () => undefined });`);
const page = await ctx.newPage();
const apis = [];
page.on("response", async (res) => {
  const u = res.url();
  if (!/cozycozy.com\/api\/(getResultList|getResults|launch|searchInputLocation)/.test(u)) return;
  let body = "";
  try {
    body = (await res.text()).slice(0, 8000);
  } catch {
    /* */
  }
  apis.push({ url: u.slice(0, 200), status: res.status(), body });
});
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(20_000);
const dump = await page.evaluate(() => {
  const all = [...document.querySelectorAll("*")].filter((n) =>
    /pour 7 nuits|Voir l’offre|Voir l'offre/i.test(n.innerText || "") && (n.innerText || "").length < 800,
  );
  const interesting = all
    .slice(0, 12)
    .map((n) => ({
      tag: n.tagName,
      className: String(n.className || "").slice(0, 160),
      attrs: [...n.attributes].map((a) => a.name + "=" + a.value.slice(0, 80)).slice(0, 8),
      text: (n.innerText || "").replace(/\s+/g, " ").slice(0, 240),
    }));
  const byClass = {};
  for (const n of document.querySelectorAll("[class]")) {
    const c = String(n.className);
    if (/result|offer|card|item|price|listing/i.test(c)) {
      byClass[c.slice(0, 120)] = (byClass[c.slice(0, 120)] || 0) + 1;
    }
  }
  return {
    title: document.title,
    countPhrase: (document.body.innerText.match(/\d+\s+offres trouvées[^.\n]*/i) || [null])[0],
    interesting,
    byClass,
  };
});
await b.close();
writeFileSync(join(OUT, "cozy-dated-cards.json"), JSON.stringify({ url, dump, apis }, null, 2));
console.log("count", dump.countPhrase);
console.log("class keys", Object.keys(dump.byClass).slice(0, 40));
console.log("interesting", dump.interesting.slice(0, 6));
console.log("apis", apis.map((a) => a.url + " " + a.status + " " + a.body.slice(0, 80)));
