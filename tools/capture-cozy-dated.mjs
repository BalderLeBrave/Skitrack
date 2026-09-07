import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "/tmp/skitrack/docs/diagnostics/dumps";
mkdirSync(OUT, { recursive: true });
const SHELL =
  "/opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const STEALTH = `
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr', 'en'] });
`;

const targets = [
  [
    "d2a_user",
    "https://www.cozycozy.com/fr/search/Les%20Deux%20Alpes%20station%20de%20ski%2C%20France/2027-02-13/2027-02-20/4-8-0/results",
  ],
  [
    "meribel_user",
    "https://www.cozycozy.com/fr/search/M%C3%A9ribel%2C%20France/2027-02-13/2027-02-20/4-8-0/results",
  ],
  [
    "karellis_fr",
    "https://www.cozycozy.com/fr/search/Les%20Karellis%2C%20France/2027-02-13/2027-02-20/4-8-0/results",
  ],
  [
    "vars_fr",
    "https://www.cozycozy.com/fr/search/Vars%2C%20France/2027-02-13/2027-02-20/4-8-0/results",
  ],
  [
    "angles_fr",
    "https://www.cozycozy.com/fr/search/Les%20Angles%2C%20France/2027-02-13/2027-02-20/4-8-0/results",
  ],
];

const report = { at: new Date().toISOString(), items: [] };

const b = await chromium.launch({
  executablePath: SHELL,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const ctx = await b.newContext({
  userAgent: UA,
  locale: "fr-FR",
  viewport: { width: 1440, height: 900 },
});
await ctx.addInitScript(STEALTH);

for (const [id, url] of targets) {
  const page = await ctx.newPage();
  const xhr = [];
  page.on("response", async (res) => {
    const u = res.url();
    if (/\.(png|jpe?g|css|woff2?|gif|svg|ico)(\?|$)/i.test(u)) return;
    if (/google-analytics|gtag|facebook|hotjar|sentry/i.test(u)) return;
    const ct = res.headers()["content-type"] || "";
    let body = "";
    try {
      if (/json/i.test(ct) || /getResultList|searchInput|graphql|api\.|launch/i.test(u)) {
        body = (await res.text()).slice(0, 600);
      }
    } catch {
      /* */
    }
    xhr.push({ url: u.slice(0, 280), status: res.status(), ct: ct.slice(0, 80), body });
  });
  const item = { id, url, http: null, title: "", error: null, xhr: [] };
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    item.http = res?.status() ?? null;
    await page.waitForTimeout(18_000);
    item.title = await page.title();
    item.finalUrl = page.url();
    const html = await page.content();
    const text = await page.locator("body").innerText().catch(() => "");
    item.evaled = await page.evaluate(() => {
      const cls = (sel) => document.querySelectorAll(sel).length;
      const cards = [...document.querySelectorAll("article, [class*='result'], [class*='Result'], [class*='offer']")]
        .slice(0, 8)
        .map((n) => ({
          tag: n.tagName,
          className: String(n.className || "").slice(0, 120),
          text: (n.innerText || "").replace(/\s+/g, " ").slice(0, 180),
        }));
      return {
        hoj: cls("article.hoj_seo_card, .hoj_seo_card"),
        resultItem: cls("[class*='ResultItem'], .ResultItemPriceTotal, [class*='result-item']"),
        joliRoot: cls("joli-root"),
        routerOutlet: cls("router-outlet"),
        articles: cls("article"),
        comparing: /Juste une seconde|comparons/i.test(document.body.innerText || ""),
        prices: (document.body.innerText || "").match(/\d[\d\s.,]*\s*€(?:\s*\/\s*nuit)?/gi)?.slice(0, 12) || [],
        cards,
      };
    });
    item.bodyPreview = text.replace(/\s+/g, " ").slice(0, 900);
    item.htmlBytes = html.length;
    item.xhr = xhr.filter((x) => !/\.(js)(\?|$)/i.test(x.url) || /main|api|search|result/i.test(x.url)).slice(0, 40);
    item.apiHits = xhr
      .filter((x) => /getResultList|searchInput|launch|graphql|\/api\//i.test(x.url))
      .map((x) => ({ url: x.url, status: x.status, body: x.body?.slice(0, 400) }));
  } catch (e) {
    item.error = String(e).slice(0, 400);
    item.xhr = xhr.slice(0, 20);
  } finally {
    await page.close();
  }
  report.items.push(item);
  console.log(id, item.http, item.finalUrl, item.evaled?.hoj, item.evaled?.comparing, item.apiHits?.length, item.error || "");
}

await b.close();
writeFileSync(join(OUT, "cozy-dated-results.json"), JSON.stringify(report, null, 2));
console.log("wrote", join(OUT, "cozy-dated-results.json"));
