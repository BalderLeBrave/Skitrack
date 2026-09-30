// Étape 4 du relevé des webcams (docs/WEBCAMS.md) : le banc d'essai.
//
// Affiche chaque adresse comme l'application le fait (iframe aux mêmes
// attributs, ou <img> pour une image), depuis une page servie sur 127.0.0.1,
// dans un Chromium sans fenêtre (Playwright), et rend ce qui s'est passé.
//
//   node scripts/webcams/banc.mjs <captures> --lot <urls.txt> > banc.jsonl
//   node scripts/webcams/banc.mjs <captures> <url> [<url>...]
//   node scripts/webcams/banc.mjs <captures> --image <url> ...   (image fixe)
//   node scripts/webcams/banc.mjs <captures> --referer <url> ... (sans no-referrer)
//
// Sortie : une ligne JSON par adresse sur stdout, et une capture PNG par
// adresse dans <captures>. Trois bancs au plus tournent à la fois sur la
// machine (jetons dans le dossier temporaire) : on peut couper `urls.txt` en
// lots et les lancer en parallèle.
import http from "node:http";
import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { UA } from "./commun.mjs";

const args = process.argv.slice(2);
const sortie = args.shift();
if (!sortie) {
  console.error("usage : node scripts/webcams/banc.mjs <captures> [--image] [--referer] (--lot <fichier> | <url>...)");
  process.exit(2);
}
mkdirSync(sortie, { recursive: true });
let image = false;
let referer = false;
const urls = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--image") image = true;
  else if (a === "--referer") referer = true;
  else if (a === "--lot")
    urls.push(...readFileSync(args[++i], "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  else urls.push(a);
}

const echap = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
function page(u) {
  const corps = image
    ? `<img id="cam" src="${echap(u)}" ${referer ? "" : 'referrerpolicy="no-referrer"'} style="width:100%;height:100%;object-fit:contain;background:#222">`
    : `<iframe id="cam" src="${echap(u)}" ${referer ? "" : 'referrerpolicy="no-referrer"'} sandbox="allow-scripts allow-same-origin" allowfullscreen style="width:100%;height:100%;border:0"></iframe>`;
  return `<!doctype html><meta charset="utf-8"><title>banc</title><body style="margin:0;background:#111"><div style="width:960px;height:540px">${corps}</div></body>`;
}

// Trois navigateurs au plus sur la machine, tous agents confondus : la mémoire
// libre ne tient pas davantage. Un jeton est un fichier créé en exclusif ; un
// jeton de plus de dix minutes est celui d'un banc mort, on le reprend.
const VERROUS = path.join(os.tmpdir(), "skitrack-banc-webcams");
mkdirSync(VERROUS, { recursive: true });
let jeton = null;
while (!jeton) {
  for (let i = 0; i < 3 && !jeton; i++) {
    const f = path.join(VERROUS, `place-${i}`);
    try {
      closeSync(openSync(f, "wx"));
      jeton = f;
    } catch {
      try {
        if (Date.now() - statSync(f).mtimeMs > 10 * 60 * 1000) unlinkSync(f);
      } catch {
        // Le jeton vient d'être rendu par un autre banc : on retentera.
      }
    }
  }
  if (!jeton) await new Promise((r) => setTimeout(r, 1500));
}
const rendre = () => {
  try {
    if (jeton) unlinkSync(jeton);
  } catch {
    // Déjà rendu.
  }
  jeton = null;
};
process.on("exit", rendre);
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

let courante = "";
const serveur = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(page(courante));
});
await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
const port = serveur.address().port;

const nav = await chromium.launch({ headless: true });
const ctx = await nav.newContext({
  viewport: { width: 960, height: 540 },
  locale: "fr-FR",
  userAgent: UA,
});

let n = 0;
for (const u of urls) {
  n++;
  courante = u;
  const p = await ctx.newPage();
  const erreurs = [];
  const refus = [];
  p.on("console", (m) => {
    if (m.type() === "error") erreurs.push(m.text().slice(0, 200));
  });
  p.on("response", async (r) => {
    try {
      if (r.request().resourceType() !== "document" || r.frame() === p.mainFrame()) return;
      const h = r.headers();
      const xfo = h["x-frame-options"];
      const csp = h["content-security-policy"];
      const fa = csp && /frame-ancestors[^;]*/i.exec(csp)?.[0];
      if (xfo || fa) refus.push({ url: r.url().slice(0, 160), status: r.status(), xfo: xfo ?? null, frameAncestors: fa ?? null });
      else if (r.status() >= 400) refus.push({ url: r.url().slice(0, 160), status: r.status() });
    } catch {
      // Réponse d'un cadre déjà fermé : rien à en dire.
    }
  });
  const t0 = Date.now();
  const res = { url: u, mode: image ? "image" : "iframe", referer };
  try {
    await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (image) {
      await p.waitForFunction(() => {
        const i = document.getElementById("cam");
        return i && i.complete;
      }, null, { timeout: 20000 }).catch(() => {});
      res.image = await p.evaluate(() => {
        const i = document.getElementById("cam");
        return { complete: i.complete, largeur: i.naturalWidth, hauteur: i.naturalHeight };
      });
      res.charge = res.image.largeur > 0;
    } else {
      const el = await p.$("#cam");
      const frame = await el.contentFrame();
      await frame?.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(6000);
      const f = await el.contentFrame();
      res.frameUrl = f ? f.url().slice(0, 200) : null;
      res.bloque = !f || /^chrome-error:|^about:blank$/.test(f?.url() ?? "");
      try {
        res.titre = f ? (await f.title()).slice(0, 120) : null;
        res.texte = f
          ? (await f.evaluate(() => document.body?.innerText ?? "")).replace(/\s+/g, " ").trim().slice(0, 300)
          : null;
        res.medias = f
          ? await f.evaluate(() => ({
              video: document.querySelectorAll("video").length,
              img: [...document.images].filter((i) => i.naturalWidth >= 400).length,
              canvas: document.querySelectorAll("canvas").length,
              iframes: document.querySelectorAll("iframe").length,
            }))
          : null;
      } catch (e) {
        res.lectureImpossible = String(e).slice(0, 120);
      }
      res.charge = !res.bloque;
    }
    res.ms = Date.now() - t0;
    const nom = `${String(n).padStart(3, "0")}-${u.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 80)}.png`;
    const cap = path.join(sortie, nom);
    await p.screenshot({ path: cap });
    res.capture = cap;
  } catch (e) {
    res.erreur = String(e).slice(0, 200);
  }
  res.refus = refus;
  res.consoleErreurs = erreurs.slice(0, 5);
  console.log(JSON.stringify(res));
  await p.close();
}
await nav.close();
serveur.close();
rendre();
