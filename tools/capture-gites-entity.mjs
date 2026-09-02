import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "/tmp/skitrack/docs/diagnostics/dumps";
const SHELL =
  "/opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function go(id, url) {
  const b = await chromium.launch({
    executablePath: SHELL,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
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
  const item = { id, url };
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    item.http = resp?.status();
    await page.waitForTimeout(5000);
    const html = await page.content();
    writeFileSync(join(OUT, `${id}.html`), html);
    item.title = await page.title();
    item.finalUrl = page.url();
    item.bytes = html.length;
    item.giteCard = (html.match(/gite-card/gi) || []).length;
    item.noResults = html.includes("g2f-searchResult-noResults");
    item.article = (html.match(/<article/gi) || []).length;
    item.ldjson = (html.match(/application\/ld\+json/gi) || []).length;
    const ou = html.match(/Oups ![^<]{0,120}/);
    item.oups = ou ? ou[0] : null;
    const eid = html.match(/name="entity_id"[^>]*value="([^"]*)"/);
    const et = html.match(/name="entity_type"[^>]*value="([^"]*)"/);
    item.form = { entity_id: eid?.[1] ?? null, entity_type: et?.[1] ?? null };
  } catch (e) {
    item.error = String(e).slice(0, 400);
  } finally {
    await b.close();
  }
  return item;
}

const base = "https://www.gites-de-france.com/fr/search";
const q = "destination=Les+2+Alpes&date-start=2027-02-13&date-end=2027-02-20&adults=8";
const jobs = [
  ["gites_entity_poi497", `${base}?${q}&entity_id=497&entity_type=pois`],
  ["gites_entity_town50301", `${base}?${q}&entity_id=50301&entity_type=towns`],
  ["gites_entity_poi424697", `${base}?${q}&entity_id=424697&entity_type=pois`],
];

const report = { at: new Date().toISOString(), items: [] };
for (const [id, url] of jobs) {
  const item = await go(id, url);
  report.items.push(item);
  console.log(JSON.stringify(item));
}
writeFileSync(join(OUT, "capture-gites-entity.json"), JSON.stringify(report, null, 2));
