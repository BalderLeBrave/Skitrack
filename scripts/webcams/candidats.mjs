// Étape 3 du relevé des webcams (docs/WEBCAMS.md) : les caméras candidates
// de chaque station.
//
//   node scripts/webcams/candidats.mjs [dossier]
//
// Skaping (plan du site) et Webcam-HD (groupes), avec les corrections à la
// main des rapprochements automatiques, et les caméras que la table donne
// déjà. Écrit `candidats.json`, et `urls.txt` : les adresses à passer au banc.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dossier, lireJson } from "./commun.mjs";
const dir = dossier(process.argv[2]);
const st = lireJson(path.join(dir, "stations.json"));
const ids = new Set(st.map((s) => s.id));
const sk = lireJson(path.join(dir, "skaping-match.json"));
const whd = lireJson(path.join(dir, "whd-groupes.json"));
const locs = [...readFileSync(path.join(dir, "skaping-sitemap.xml"), "utf8").matchAll(/<loc>(https:\/\/www\.skaping\.com\/([^<]+))<\/loc>/g)].map((m) => m[1]);
const skSite = (site) => locs.filter((u) => u.startsWith(`https://www.skaping.com/${site}/`));

// Faux rapprochements : le site ne concerne pas ces stations.
const RETIRER = { nancy: ["romme"], megeve: ["megevette"], orcieres: ["serre-eyraud"], morzine: ["avoriaz"] };
// Sites Skaping que le nom ne rapproche pas.
const AJOUTER = {
  "val-d-arly": ["praz-sur-arly", "flumet-st-nicolas-la-chapelle"],
  revard: ["savoie-grand-revard"], "la-feclaz": ["savoie-grand-revard"], saintmartindebelleville: ["saint-martin-de-belleville"],
  menuires: ["les-menuires"], "monetier-les-bains": ["serre-chevalier-le-monetier"], "ballon-d-alsace": ["le-ballon-dalsace"],
  jaillet: ["megeve", "combloux"], "collet-d-allevard": ["le-collet-dallevard"],
  "les-sybelles": ["le-corbier", "la-toussuire", "saint-sorlin-darves", "st-jean-darves", "saint-colomban-villards", "les-bottieres"],
  "jura-sur-leman": ["les-rousses"], arbeost: ["val-dazun"], sambuy: ["la-sambuy"], "sappey-en-chartreuse": ["le-sappey-en-chartreuse"], "tete-des-saix": ["samoens", "samoens-1600"],
};
const URLS_EN_PLUS = {
  "portes-du-soleil": { "https://www.skaping.com/portes-du-soleil/morzine": ["morzine"], "https://www.skaping.com/portes-du-soleil/les-gets": ["les-gets"], "https://www.skaping.com/portes-du-soleil/avoriaz/arare": ["avoriaz"], "https://www.skaping.com/portes-du-soleil/chatel/torgon/plan-de-croix": ["chatel"] },
  "lac-serre-poncon": { "https://www.skaping.com/lac-serre-poncon/reallon/chabrieres": ["reallon"], "https://www.skaping.com/lac-serre-poncon/crevoux/station": ["crevoux"] },
  grandlac: { "https://www.skaping.com/grandlac/revard": ["savoie-grand-revard"], "https://www.skaping.com/grandlac/revardinfoneige": ["savoie-grand-revard"] },
};

const cand = new Map();
const add = (id, url, fournisseur, titre = "") => {
  if (!ids.has(id)) { console.warn("station inconnue", id); return; }
  if (!cand.has(id)) cand.set(id, new Map());
  const k = url.replace(/\/+$/, "");
  if (!cand.get(id).has(k)) cand.get(id).set(k, { url, fournisseur, titre });
};
for (const [site, r] of Object.entries(sk)) {
  const stations = r.stations.filter((x) => !(RETIRER[site] ?? []).includes(x));
  for (const id of stations) for (const u of r.urls) add(id, u, "Skaping");
}
for (const [site, stations] of Object.entries(AJOUTER)) for (const id of stations) for (const u of skSite(site)) add(id, u, "Skaping");
for (const m of Object.values(URLS_EN_PLUS)) for (const [u, stations] of Object.entries(m)) for (const id of stations) add(id, u, "Skaping");
for (const [g, r] of Object.entries(whd)) {
  const stations = r.stations.filter((x) => !(RETIRER[g] ?? []).includes(x));
  for (const id of stations) for (const c of r.cams) add(id, c.url, "Webcam-HD", c.titre);
}
// Second sondage Webcam-HD, par noms courts.
const whd2 = lireJson(path.join(dir, "whd-groupes-2.json"));
const RETIRER2 = { "les-alpes": ["serre-chevalier-briancon", "seyne-les-alpes"], "la-chapelle": ["flumet-st-nicolas-la-chapelle"] };
for (const [g, r] of Object.entries(whd2)) {
  const stations = r.stations.filter((x) => !(RETIRER2[g] ?? []).includes(x));
  for (const id of stations) for (const c of r.cams) add(id, c.url, "Webcam-HD", c.titre);
}
// Caméras d'un groupe qui regardent une station voisine.
const titreWhd = (u) => Object.values(whd).flatMap((g) => g.cams).find((c) => c.url === u)?.titre ?? "";
for (const [u, ids2] of Object.entries({
  "https://app.webcam-hd.com/les-saisies/hauteluce-chozal": ["hauteluce-val-joly"],
  "https://app.webcam-hd.com/les-saisies/hauteluce-mtblanc": ["hauteluce-val-joly"],
  "https://app.webcam-hd.com/les-saisies/bisanne-1500": ["bisanne-1500"],
  "https://app.webcam-hd.com/valmorel/doucy-combelouviere": ["doucy"],
  "https://app.webcam-hd.com/webcam-station-la-plagne/champagny-la-rossa": ["champagny-en-vanoise"],
  "https://app.webcam-hd.com/webcam-station-la-plagne/montchavin-telebuffette": ["les-coches"],
  "https://app.webcam-hd.com/webcam-station-la-plagne/Aime-2000": ["aime-2000"],
  "https://app.webcam-hd.com/webcam-station-la-plagne/colorado": ["plagne-centre"],
  "https://app.webcam-hd.com/webcam-station-la-plagne/montalbert": ["la-plagne-montalbert"],
  "https://app.webcam-hd.com/webcam-station-la-plagne/montchavin": ["montchavin-les-coches"],
  "https://app.webcam-hd.com/vars/sainte-marie": ["vars-sainte-marie"],
  "https://app.webcam-hd.com/vars/crevoux": ["crevoux"],
})) for (const id of ids2) add(id, u, "Webcam-HD", titreWhd(u));
// Les caméras de la table actuelle restent candidates.
for (const s of st) for (const u of s.camsPropres) add(s.id, u, "table actuelle");
const out = Object.fromEntries([...cand].map(([id, m]) => [id, [...m.values()]]));
writeFileSync(path.join(dir, "candidats.json"), JSON.stringify(out, null, 1));
const urls = new Set(Object.values(out).flat().map((c) => c.url));
writeFileSync(path.join(dir, "urls.txt"), [...urls].join("\n") + "\n");
console.log("stations avec candidats", cand.size, "/", st.length, "; adresses uniques", urls.size);
console.log("sans candidat :", st.filter((s) => !cand.has(s.id)).map((s) => s.id).join(" "));
