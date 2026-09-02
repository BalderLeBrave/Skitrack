/**
 * Captures round 3 — points encore rouges.
 * Gîtes autocomplete JSON, XHR MSEM Valberg/Écrins, Karellis JSON,
 * Clusaz reservation, CozyCozy bootstrap plus long.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "/tmp/skitrack/docs/diagnostics/dumps";
mkdirSync(OUT, { recursive: true });
const SHELL =
  "/opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const STEALTH = `(() => { try { Object.defineProperty(navigator, "webdriver", { get: () => undefined }) } catch {} })()`;

const report = { at: new Date().toISOString(), items: [] };

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
    viewport: { width: 1440, height: 900 },
  });
  await ctx.addInitScript(STEALTH);
  return { b, ctx };
}

async function gitesAutocomplete() {
  const { b, ctx } = await launch();
  const page = await ctx.newPage();
  const item = { id: "gites_autocomplete_fetch" };
  try {
    await page.goto("https://www.gites-de-france.com/fr/search", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(2500);
    const fetched = await page.evaluate(async () => {
      const qs = ["Les%202%20Alpes", "2%20Alpes", "Deux%20Alpes"];
      const out = [];
      for (const q of qs) {
        const urls = [
          `/fr/g2f_autocomplete?q=${q}`,
          `/fr/g2f_autocomplete?search=${q}`,
          `/fr/g2f_autocomplete/${q}`,
        ];
        for (const u of urls) {
          try {
            const r = await fetch(u, {
              credentials: "same-origin",
              headers: { Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest" },
            });
            const text = await r.text();
            out.push({ u, status: r.status, ctype: r.headers.get("content-type"), text: text.slice(0, 8000) });
          } catch (e) {
            out.push({ u, error: String(e) });
          }
        }
      }
      return out;
    });
    item.fetched = fetched.map((f) => ({
      u: f.u,
      status: f.status,
      error: f.error,
      ctype: f.ctype,
      preview: (f.text || "").slice(0, 600),
    }));
    const ok = fetched.find((f) => f.status === 200 && f.text && !/cloudflare|attention required/i.test(f.text));
    if (ok?.text) save("gites_autocomplete.json", ok.text);
    item.ok = Boolean(ok);
  } catch (e) {
    item.error = String(e).slice(0, 400);
  } finally {
    await b.close();
  }
  report.items.push(item);
}

async function spyMsem(id, url, extraWait = 10_000) {
  const { b, ctx } = await launch();
  const page = await ctx.newPage();
  const calls = [];
  page.on("response", async (res) => {
    const u = res.url();
    if (/msem\.tech|lodging\/resort|widget\.msem/i.test(u)) {
      let body = "";
      try {
        body = (await res.text()).slice(0, 1200);
      } catch {
        body = "";
      }
      calls.push({ url: u, status: res.status(), body });
    }
  });
  const item = { id, url };
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(extraWait);
    const lodging = page.locator('a[href*="hebergement"], a[href*="reservation"], button:has-text("Réserver"), a:has-text("Réserver")').first();
    if ((await lodging.count()) > 0) {
      await lodging.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(6000);
    }
    item.finalUrl = page.url();
    item.title = await page.title();
    item.calls = calls.slice(0, 30);
    const html = await page.content();
    save(`${id}.html`, html);
    const m = [...html.matchAll(/lodging\/resort\/(\d+)\/([A-Za-z0-9_-]+)/g)].map((x) => `${x[1]}/${x[2]}`);
    item.parsedResorts = [...new Set(m)];
    const cfg = html.match(/"resort"\s*:\s*(\d+)[\s\S]{0,80}"channel"\s*:\s*"([^"]+)"/);
    if (cfg) item.cfg = { resort: cfg[1], channel: cfg[2] };
  } catch (e) {
    item.error = String(e).slice(0, 400);
  } finally {
    await b.close();
  }
  report.items.push(item);
}

async function karellisJson() {
  const { b, ctx } = await launch();
  const page = await ctx.newPage();
  const item = { id: "karellis_resa" };
  try {
    const resp = await page.goto("https://www.karellis-reservation.com/", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    item.http = resp?.status();
    await page.waitForTimeout(3500);
    const html = await page.content();
    save("karellis_resa.html", html);
    item.title = await page.title();
    item.bytes = html.length;
    item.ingenie = (html.match(/ingenie/gi) || []).length;
    item.msem = (html.match(/msem/gi) || []).length;
    item.opensystem = (html.match(/open-system|for-system|osform/gi) || []).length;
    const jsons = await page.evaluate(async () => {
      const urls = [
        "/wp-content/themes/wp-hospitality-1/json/destination-endpoint.php",
        "/wp-content/themes/wp-hospitality-1/json/destination-endpoint-params.php",
      ];
      const out = [];
      for (const u of urls) {
        try {
          const r = await fetch(u, { credentials: "same-origin" });
          out.push({ u, status: r.status, text: (await r.text()).slice(0, 4000) });
        } catch (e) {
          out.push({ u, error: String(e) });
        }
      }
      return out;
    });
    item.jsons = jsons.map((j) => ({ u: j.u, status: j.status, error: j.error, preview: (j.text || "").slice(0, 500) }));
    const first = jsons.find((j) => j.text);
    if (first?.text) save("karellis_destination.json", first.text);
  } catch (e) {
    item.error = String(e).slice(0, 400);
  } finally {
    await b.close();
  }
  report.items.push(item);
}

async function clusazResa() {
  const { b, ctx } = await launch();
  const page = await ctx.newPage();
  const item = { id: "clusaz_hebergements" };
  try {
    const resp = await page.goto("https://www.laclusaz.com/reservation/hebergements", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    item.http = resp?.status();
    await page.waitForTimeout(4000);
    const html = await page.content();
    save("clusaz_hebergements.html", html);
    item.title = await page.title();
    item.bytes = html.length;
    item.markers = {
      gardeners: (html.match(/gardeners|e-liberty/gi) || []).length,
      recaptcha: (html.match(/recaptcha/gi) || []).length,
      msem: (html.match(/msem/gi) || []).length,
      ingenie: (html.match(/ingenie/gi) || []).length,
      opensystem: (html.match(/open-system|for-system/gi) || []).length,
    };
  } catch (e) {
    item.error = String(e).slice(0, 400);
  } finally {
    await b.close();
  }
  report.items.push(item);
}

async function cozyLong() {
  const { b, ctx } = await launch();
  const page = await ctx.newPage();
  const xhrs = [];
  page.on("response", (res) => {
    const u = res.url();
    if (/cozycozy\.com/i.test(u) && !/gtm|hotjar|google|inmobi|ahrefs|fonts|static/i.test(u)) {
      xhrs.push({ url: u, status: res.status() });
    }
  });
  const item = { id: "cozy_long" };
  try {
    const url =
      "https://www.cozycozy.com/fr/s/les-2-alpes?checkin=2027-02-13&checkout=2027-02-20&adults=8&e=4";
    let resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    item.http = resp?.status();
    await page.waitForTimeout(12_000);
    item.url = page.url();
    item.title = await page.title();
    const html = await page.content();
    save("cozycozy_slug.html", html);
    item.bytes = html.length;
    item.offer = (html.match(/\/offer/g) || []).length;
    item.joli = html.includes("joli-root");
    item.xhrs = xhrs.slice(0, 40);
    if ((html.match(/\/offer/g) || []).length === 0) {
      const url2 =
        "https://www.cozycozy.com/fr/search?location=Les%202%20Alpes&checkin=2027-02-13&checkout=2027-02-20&adults=8&nights=7&e=4";
      resp = await page.goto(url2, { waitUntil: "networkidle", timeout: 45_000 }).catch(() => null);
      await page.waitForTimeout(8000);
      const html2 = await page.content();
      save("cozycozy_networkidle.html", html2);
      item.fallback = {
        url: page.url(),
        bytes: html2.length,
        offer: (html2.match(/\/offer/g) || []).length,
        xhrs: xhrs.slice(0, 40),
      };
    }
  } catch (e) {
    item.error = String(e).slice(0, 400);
  } finally {
    await b.close();
  }
  report.items.push(item);
}

const main = async () => {
  console.log("start red-points-3");
  await gitesAutocomplete();
  console.log("gites", JSON.stringify(report.items.at(-1)).slice(0, 500));
  await spyMsem("msem_ecrins", "https://www.paysdesecrins.com/");
  console.log("ecrins", JSON.stringify(report.items.at(-1)).slice(0, 500));
  await spyMsem("msem_valberg", "https://www.valberg.com/");
  console.log("valberg", JSON.stringify(report.items.at(-1)).slice(0, 500));
  await spyMsem("msem_valberg_heberg", "https://www.valberg.com/hebergements/");
  console.log("valberg_heb", JSON.stringify(report.items.at(-1)).slice(0, 500));
  await karellisJson();
  console.log("karellis", JSON.stringify(report.items.at(-1)).slice(0, 500));
  await clusazResa();
  console.log("clusaz", JSON.stringify(report.items.at(-1)).slice(0, 500));
  await cozyLong();
  console.log("cozy", JSON.stringify(report.items.at(-1)).slice(0, 500));
  save("capture-red-points-3.json", report);
  console.log("DONE", report.items.length);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
