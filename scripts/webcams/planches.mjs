// Étape 5 du relevé des webcams (docs/WEBCAMS.md) : les planches contact.
//
//   node scripts/webcams/planches.mjs <banc.jsonl> <captures> <sortie>
//
// Les captures du banc, douze par image, avec le numéro, l'adresse et le
// titre de la page, pour les regarder d'un coup d'œil. Ce qu'on y voit
// d'anormal (image noire, page d'accueil au lieu de la caméra, caméra d'une
// autre station) se corrige dans `choisir.mjs` ou `generer.mjs`.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const [fichier, captures, sortie] = process.argv.slice(2);
mkdirSync(sortie, { recursive: true });
const lignes = readFileSync(fichier, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
// Une capture relevée ailleurs se retrouve par son nom, dans <captures>.
const vus = lignes
  .filter((r) => r.capture && !r.bloque && !r.erreur)
  .map((r) => ({ ...r, capture: path.resolve(captures, path.basename(r.capture)) }));
const echap = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const index = [];
const nav = await chromium.launch();
const p = await nav.newPage({ viewport: { width: 1320, height: 900 } });
for (let i = 0; i < vus.length; i += 12) {
  const lot = vus.slice(i, i + 12);
  const cases = lot
    .map((r, j) => {
      const n = i + j + 1;
      index.push({ n, url: r.url, titre: r.titre, capture: r.capture });
      return `<figure><img src="${pathToFileURL(r.capture).href}"><figcaption><b>${n}</b> ${echap(r.url.replace(/^https:\/\/(www\.)?/, ""))}<br>${echap(r.titre)}</figcaption></figure>`;
    })
    .join("");
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;font:11px/1.25 system-ui;display:grid;grid-template-columns:repeat(4,320px);gap:10px;padding:10px}figure{margin:0}img{width:320px;height:180px;object-fit:cover;display:block;background:#ccc}figcaption{height:28px;overflow:hidden}</style>${cases}`;
  const f = path.join(sortie, `planche-${String(i / 12 + 1).padStart(2, "0")}.html`);
  writeFileSync(f, html);
  await p.goto(pathToFileURL(f).href);
  await p.waitForTimeout(300);
  await p.screenshot({ path: f.replace(/\.html$/, ".png"), fullPage: true });
}
writeFileSync(path.join(sortie, "index.json"), JSON.stringify(index, null, 1));
await nav.close();
console.log(vus.length, "captures sur", lignes.length, "lignes ;", Math.ceil(vus.length / 12), "planches");
