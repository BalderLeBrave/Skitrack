// Étape 2 du relevé des webcams (docs/WEBCAMS.md) : les lecteurs Skaping.
//
//   node scripts/webcams/skaping.mjs [dossier]
//
// Télécharge le plan du site des lecteurs (`sitemap.players.xml`, une
// requête) et rapproche chaque site Skaping des stations par leur nom, leur
// identifiant ou leur commune. Écrit `skaping-sitemap.xml` et
// `skaping-match.json`. Les rapprochements faux ou manquants se corrigent à
// l'étape suivante (`candidats.mjs`).

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { UA, dossier, ecrireJson, lireJson, plier } from "./commun.mjs";

const dir = dossier(process.argv[2]);
const r = await fetch("https://www.skaping.com/sitemap.players.xml", { headers: { "user-agent": UA } });
if (!r.ok) throw new Error(`plan du site Skaping : HTTP ${r.status}`);
writeFileSync(path.join(dir, "skaping-sitemap.xml"), await r.text());

const st = lireJson(path.join(dir, "stations.json"));
const cle = (s) => plier(s).replace(/\bsaint\b/g, "st").replace(/[^a-z0-9]+/g, "");
const locs = [
  ...readFileSync(path.join(dir, "skaping-sitemap.xml"), "utf8").matchAll(
    /<loc>(https:\/\/www\.skaping\.com\/([^<]+))<\/loc>/g,
  ),
].map((m) => ({ url: m[1], chemin: m[2] }));
const sites = new Map();
for (const l of locs) {
  const site = l.chemin.split("/")[0];
  if (!sites.has(site)) sites.set(site, []);
  sites.get(site).push(l.url);
}
const cles = st.map((s) => ({ id: s.id, k: [...new Set([cle(s.id), cle(s.nom), cle(s.commune)].filter((x) => x.length >= 4))] }));
const res = {};
for (const [site, urls] of sites) {
  const p = cle(site);
  const hits = cles
    .filter((c) => c.k.some((k) => k === p || (p.length >= 5 && (k.startsWith(p) || p.startsWith(k)))))
    .map((c) => c.id);
  if (hits.length) res[site] = { stations: hits, urls };
}
ecrireJson(path.join(dir, "skaping-match.json"), res);
console.log(`${locs.length} lecteurs, ${Object.keys(res).length} sites rapprochés d'une station`);
