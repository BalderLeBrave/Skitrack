#!/usr/bin/env node
/**
 * La page HTML de HomeToGo, quand urllib ne reçoit que le défi Cloudflare.
 *
 * Une session Chrome. Si la page est le widget Turnstile, un clic, puis la
 * même adresse une seconde fois dans cette session : c'est le navigateur qui
 * finit le défi, pas un second essai après un refus. Les requêtes s'enchaînent,
 * une à la fois. On ne sort pas de hometogo.fr.
 *
 * Une ligne JSON en entrée, une ligne JSON en sortie : `{ id, url, timeout }`.
 */

import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);

function hoteOk(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && (host === "www.hometogo.fr" || host.endsWith(".hometogo.fr"));
  } catch {
    return false;
  }
}

function chromeExe() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    return null;
  }
  const candidats = [process.env.CHROME_PATH, chromium.executablePath()].filter(Boolean);
  return candidats.find((p) => existsSync(p)) ?? null;
}

let contexte = null;
let chaine = Promise.resolve();

function enfiler(fn) {
  const cours = chaine.then(fn, fn);
  chaine = cours.then(
    () => undefined,
    () => undefined,
  );
  return cours;
}

async function session() {
  if (contexte) return contexte;
  const exe = chromeExe();
  if (!exe) throw new Error("navigateur introuvable");
  const { chromium } = require("playwright");
  const browser = await chromium.launch({
    headless: true,
    executablePath: exe,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  contexte = await browser.newContext({
    locale: "fr-FR",
    viewport: { width: 1366, height: 768 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  await contexte.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return contexte;
}

function estPage(html, title) {
  return html.includes('"locationId"') && html.length > 50_000 && !/instant|moment/i.test(title);
}

async function lirePage(page, url, budgetMs) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: budgetMs });
  const fin = Date.now() + budgetMs;
  let clique = false;
  while (Date.now() < fin) {
    const title = await page.title();
    const html = await page.content();
    if (estPage(html, title)) return html;
    if (!clique) {
      const cadre = page.frames().find((f) => /turnstile|challenge-platform/i.test(f.url()));
      const iframe = page.locator('iframe[src*="challenge-platform"], iframe[src*="turnstile"]').first();
      const boite = await iframe.boundingBox().catch(() => null);
      if (boite) {
        await page.mouse.click(boite.x + 28, boite.y + boite.height / 2);
        clique = true;
      } else if (cadre) {
        await cadre.locator("body").click({ timeout: 3_000 }).catch(() => undefined);
        clique = true;
      }
    }
    await page.waitForTimeout(700);
  }
  return page.content();
}

async function ouvrir(url, timeoutS) {
  if (!hoteOk(url)) return { ok: false, error: "url hors HomeToGo" };
  const budget = Math.max(3_000, Math.min(timeoutS * 1000, 25_000));
  const ctx = await session();
  const page = await ctx.newPage();
  try {
    let html = await lirePage(page, url, budget);
    let title = await page.title();
    if (!estPage(html, title)) html = await lirePage(page, url, Math.min(12_000, budget));
    title = await page.title();
    if (html.length > 2_000_000) return { ok: false, error: "réponse trop grande" };
    const defi = !estPage(html, title) && /Just a moment|Un instant/.test(html.slice(0, 3_000));
    return {
      ok: true,
      status: defi ? 403 : 200,
      cfMitigated: defi ? "challenge" : null,
      texte: html,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

const lignes = createInterface({ input: process.stdin });
lignes.on("line", (line) => {
  const brut = line.trim();
  if (!brut) return;
  let dem;
  try {
    dem = JSON.parse(brut);
  } catch {
    return;
  }
  const id = dem.id;
  enfiler(() => ouvrir(dem.url, Number(dem.timeout) || 20))
    .then((res) => {
      process.stdout.write(`${JSON.stringify({ id, ...res })}\n`);
    })
    .catch((err) => {
      const error = err instanceof Error ? err.message : String(err);
      process.stdout.write(`${JSON.stringify({ id, ok: false, error: error.slice(0, 160) })}\n`);
    });
});
