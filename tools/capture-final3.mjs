import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "/tmp/skitrack/docs/diagnostics/dumps/probe-final3";
mkdirSync(OUT, { recursive: true });
const SHELL =
  "/opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function save(name, content) {
  writeFileSync(join(OUT, name), typeof content === "string" ? content : JSON.stringify(content, null, 2));
}

async function launch() {
  const b = await chromium.launch({
    executablePath: SHELL,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
  });
  const ctx = await b.newContext({
    userAgent: UA,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    viewport: { width: 1440, height: 1100 },
  });
  await ctx.addInitScript(
    `(() => { try { Object.defineProperty(navigator, "webdriver", { get: () => undefined }) } catch {} })()`,
  );
  return { b, ctx };
}

const report = { at: new Date().toISOString(), items: [] };

async function capture(id, url, wait = 12000) {
  const { b, ctx } = await launch();
  const page = await ctx.newPage();
  const xhr = [];
  page.on("response", async (res) => {
    const u = res.url();
    if (
      /wp-json|divi-ajax|divi-machine|search-filter|admin-ajax|tsc_|filter|heberg|elloha|GetCalendar|Search|g2f_autocomplete|hoj_/i.test(u) &&
      !/\.(css|png|jpg|jpeg|woff2?|gif|svg|js)(\?|$)/i.test(u)
    ) {
      let body = "";
      try { body = (await res.text()).slice(0, 400); } catch {}
      xhr.push({ url: u.slice(0, 280), status: res.status(), bytes: body.length, body });
    }
  });
  const item = { id, url, http: null, finalUrl: "", title: "", error: null, xhr: [], htmlBytes: 0 };
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 50_000 });
    item.http = res?.status() ?? null;
    item.finalUrl = page.url();
    item.title = await page.title();
    await page.waitForTimeout(wait);
    const html = await page.content();
    item.htmlBytes = html.length;
    save(`${id}.html`, html);
    const evaled = await page.evaluate(() => {
      const q = (sel) => document.querySelectorAll(sel).length;
      const cards = [];
      const nodes = document.querySelectorAll(".item-ts, .result-ts .item-ts, article, .dmach-grid-item, .dmach-post, .et_pb_post, .sf-result-item");
      for (const n of [...nodes].slice(0, 20)) {
        const a = n.querySelector("a[href*='/hebergement/']") || n.querySelector("a[href]");
        cards.push({
          tag: n.tagName,
          cls: n.className.toString().slice(0, 120),
          text: (n.innerText || "").slice(0, 280),
          href: a ? a.href : null,
        });
      }
      const heb = [...document.querySelectorAll("a[href*='/hebergement/']")].map((a) => a.href);
      const text = document.body.innerText || "";
      return {
        itemTs: q(".item-ts"),
        resultTs: q(".result-ts"),
        dmach: q(".dmach-post, .dmach-grid-item"),
        etPost: q(".et_pb_post"),
        articles: q("article"),
        hebUnique: [...new Set(heb)].length,
        hebSample: [...new Set(heb)].slice(0, 12),
        pers: (text.match(/\d+\s*pers/gi) || []).length,
        ch: (text.match(/\d+\s*ch\b/gi) || []).length,
        apartir: (text.match(/à partir de/gi) || []).length,
        resultPhrase: (text.match(/\d+\s*r[ée]sultat[s]?/i) || [null])[0],
        cards,
        bodyHead: text.slice(0, 600),
      };
    });
    item.evaled = evaled;
    item.xhr = xhr.slice(0, 40);
  } catch (e) {
    item.error = String(e).slice(0, 400);
  } finally {
    await b.close();
  }
  report.items.push(item);
  console.log(id, item.http, item.htmlBytes, item.evaled?.itemTs, item.evaled?.hebUnique, item.evaled?.resultPhrase, item.error);
  return item;
}

await capture("angles_tous_live", "https://lesangles.com/tous-les-hebergements/", 14000);
await capture("cozy_karellis_live", "https://www.cozycozy.com/fr/location-vacances-les-karellis", 8000);
await capture("cozy_vars_live", "https://www.cozycozy.com/fr/location-vacances-vars", 8000);
await capture("cozy_angles_live", "https://www.cozycozy.com/fr/location-vacances-les-angles", 8000);

save("capture-final3.json", report);
console.log("DONE", report.items.map((i) => ({ id: i.id, http: i.http, bytes: i.htmlBytes, err: i.error })));
