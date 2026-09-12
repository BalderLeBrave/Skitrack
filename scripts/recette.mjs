#!/usr/bin/env node
/**
 * Harnais de recette : pilote l'application dans Chromium et relève ce qu'elle
 * dit à l'écran ET dans la console.
 *
 *   node scripts/recette.mjs --base http://127.0.0.1:8080 --json <fichier>
 *   node scripts/recette.mjs --only /stations/val-thorens --wide-only
 *
 * Pourquoi pas `scripts/browser-smoke.mjs` : il passe ses chemins de sortie à
 * `browser-guard.mjs`, qui les borne à `/workspace`. C'est juste dans le bac à
 * sable Linux du projet, faux sous Windows, où la copie de travail vit ailleurs.
 * Plutôt que de modifier le garde-fou d'un autre outil pour les besoins d'une
 * recette, ce harnais est autonome et n'écrit que sous `docs/recette/`.
 *
 * Il ne juge rien. Il collecte, capture, et rend du JSON : le jugement est le
 * travail du rapport.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

function flag(name, fallback = null) {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  if (i !== -1 && args[i + 1] && !args[i + 1].startsWith("--")) return args[i + 1];
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : fallback;
}
const has = (name) => process.argv.slice(2).includes(`--${name}`);

const BASE = flag("base", "http://127.0.0.1:8080").replace(/\/$/, "");
const OUT = flag("out", "docs/recette/captures");
const JSON_OUT = flag("json", null);
const ONLY = flag("only", null);
const SETTLE = Number(flag("settle", "2500"));

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];

/** Les écrans à parcourir. `note` dit ce qu'on cherche à voir. */
const ROUTES = [
  { path: "/", slug: "accueil", note: "accueil" },
  { path: "/carte", slug: "carte", note: "carte des stations" },
  { path: "/stations/val-thorens", slug: "station-val-thorens", note: "grande station, domaine relié" },
  { path: "/stations/puyvalador", slug: "station-puyvalador", note: "petite station isolée" },
  { path: "/stations/larche", slug: "station-larche", note: "sans fichier photo local" },
  { path: "/stations/le-chazelet", slug: "station-le-chazelet", note: "sans fichier photo local" },
  { path: "/stations/ventron", slug: "station-ventron", note: "0 remontée, 0,1 km annoncés" },
  { path: "/stations/station-qui-nexiste-pas", slug: "station-inconnue", note: "identifiant inconnu" },
  { path: "/comparer", slug: "comparer", note: "comparer" },
  { path: "/logements", slug: "logements", note: "logements" },
  { path: "/forfaits", slug: "forfaits", note: "forfaits" },
  { path: "/altitudes", slug: "altitudes", note: "altitudes" },
  { path: "/traces", slug: "traces", note: "traces" },
  { path: "/reservation", slug: "reservation", note: "réservation" },
  { path: "/openskimap", slug: "openskimap", note: "openskimap" },
];

const routes = ONLY ? ROUTES.filter((r) => r.path === ONLY || r.slug === ONLY) : ROUTES;
const viewports = has("wide-only") ? [VIEWPORTS[0]] : has("narrow-only") ? [VIEWPORTS[1]] : VIEWPORTS;

mkdirSync(OUT, { recursive: true });

/** Texte visible, compacté : ce qu'un lecteur lit vraiment. */
async function visibleText(page) {
  try {
    return (await page.innerText("body")).replace(/\s+\n/g, "\n").trim();
  } catch {
    return "";
  }
}

const results = [];
const browser = await chromium.launch();

/**
 * Scénarios : les états qu'un simple chargement d'URL ne montre pas.
 * Capture dans la fenêtre seulement (pas `fullPage`) : c'est le premier écran
 * qui compte pour juger un état vide ou une liste qui déborde.
 */
if (has("scenarios")) {
  const shots = [];
  const snap = async (page, name) => {
    const file = join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    shots.push(file);
    return file;
  };

  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: "fr-FR",
      timezoneId: "Europe/Paris",
    });

    // Carte : premier écran, puis recherche sans résultat.
    const carte = await ctx.newPage();
    await carte.goto(`${BASE}/carte`, { waitUntil: "domcontentloaded" });
    await carte.waitForTimeout(SETTLE);
    await snap(carte, `sc-carte-arrivee-${vp.name}`);
    const search = carte.locator('input[type="search"]').first();
    if (await search.count()) {
      await search.fill("zzzzz-aucune-station");
      await carte.waitForTimeout(1200);
      await snap(carte, `sc-carte-sans-resultat-${vp.name}`);
      console.log(
        `[scenario] /carte sans résultat ${vp.name} : ${JSON.stringify(
          (await carte.innerText("body")).replace(/\s+/g, " ").slice(0, 400),
        )}`,
      );
    } else {
      console.log(`[scenario] /carte ${vp.name} : pas de champ de recherche trouvé`);
    }
    await carte.close();

    // Accueil : la grille de cartes, là où les photos manquantes se voient.
    const home = await ctx.newPage();
    await home.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await home.waitForTimeout(SETTLE);
    const grid = home.locator("text=Les plus grands domaines").first();
    if (await grid.count()) {
      await grid.scrollIntoViewIfNeeded();
      await home.waitForTimeout(600);
    }
    await snap(home, `sc-accueil-cartes-${vp.name}`);
    await home.close();

    await ctx.close();
  }
  await browser.close();
  for (const s of shots) console.log(s);
  process.exit(0);
}

for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });

  for (const route of routes) {
    const page = await context.newPage();
    const consoleErrors = [];
    const consoleWarnings = [];
    const pageErrors = [];
    const failedRequests = [];
    const badResponses = [];

    page.on("console", (msg) => {
      const line = `${msg.text()}`.slice(0, 400);
      if (msg.type() === "error") consoleErrors.push(line);
      else if (msg.type() === "warning") consoleWarnings.push(line);
    });
    page.on("pageerror", (err) => pageErrors.push(String(err?.stack ?? err).slice(0, 600)));
    page.on("requestfailed", (req) =>
      failedRequests.push(`${req.method()} ${req.url().slice(0, 200)} — ${req.failure()?.errorText}`),
    );
    page.on("response", (res) => {
      if (res.status() >= 400) badResponses.push(`${res.status()} ${res.url().slice(0, 200)}`);
    });

    const url = `${BASE}${route.path}`;
    let status = null;
    let navError = null;
    const started = Date.now();
    try {
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      status = res?.status() ?? null;
      await page.waitForTimeout(SETTLE);
    } catch (err) {
      navError = String(err?.message ?? err).slice(0, 300);
    }

    const shot = join(OUT, `${route.slug}-${vp.name}.png`);
    mkdirSync(dirname(shot), { recursive: true });
    try {
      await page.screenshot({ path: shot, fullPage: true });
    } catch {
      try {
        await page.screenshot({ path: shot });
      } catch {
        /* page trop cassée pour être capturée */
      }
    }

    const text = await visibleText(page);
    const imgs = await page
      .evaluate(() =>
        Array.from(document.images).map((i) => ({
          src: i.currentSrc || i.src,
          ok: i.complete && i.naturalWidth > 0,
          alt: i.alt,
        })),
      )
      .catch(() => []);

    results.push({
      viewport: vp.name,
      path: route.path,
      slug: route.slug,
      note: route.note,
      status,
      navError,
      ms: Date.now() - started,
      shot,
      textLength: text.length,
      text,
      images: imgs,
      brokenImages: imgs.filter((i) => !i.ok),
      consoleErrors,
      consoleWarnings: consoleWarnings.slice(0, 12),
      pageErrors,
      failedRequests,
      badResponses,
    });

    await page.close();
  }
  await context.close();
}

await browser.close();

const payload = { base: BASE, at: new Date().toISOString(), results };
if (JSON_OUT) {
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2), "utf8");
}

for (const r of results) {
  const flags = [
    r.navError ? `NAV:${r.navError}` : null,
    r.status && r.status >= 400 ? `HTTP ${r.status}` : null,
    r.pageErrors.length ? `${r.pageErrors.length} exception(s)` : null,
    r.consoleErrors.length ? `${r.consoleErrors.length} erreur(s) console` : null,
    r.failedRequests.length ? `${r.failedRequests.length} requête(s) en échec` : null,
    r.badResponses.length ? `${r.badResponses.length} réponse(s) >=400` : null,
    r.brokenImages.length ? `${r.brokenImages.length} image(s) cassée(s)` : null,
    r.textLength < 40 ? `écran quasi vide (${r.textLength} car.)` : null,
  ].filter(Boolean);
  console.log(
    `${r.viewport.padEnd(9)} ${r.path.padEnd(34)} ${String(r.status ?? "—").padEnd(4)} ${
      flags.length ? flags.join(" | ") : "rien à signaler"
    }`,
  );
}
