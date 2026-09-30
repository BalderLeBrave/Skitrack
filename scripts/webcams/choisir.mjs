// Étape 6 du relevé des webcams (docs/WEBCAMS.md) : les caméras retenues.
//
//   node scripts/webcams/choisir.mjs [dossier] [aujourd'hui AAAA-MM-JJ]
//
// Lit `stations.json`, `candidats.json` et les résultats du banc (tout fichier
// `banc*.jsonl` du dossier, dans l'ordre des noms : une adresse passée deux
// fois garde son dernier passage). Écarte ce que le banc a vu bloqué, refusé,
// en erreur, ou dont la dernière image a plus d'un an ; range le reste par
// intérêt (sommet et panorama, puis pistes, puis village, puis le reste),
// une caméra coupée pour l'intersaison derrière celles qui tournent. Toutes
// les caméras retenues d'une station sont gardées. Écrit `choix.json`.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dossier, lireJson } from "./commun.mjs";
const dir = dossier(process.argv[2]);
const jour = process.argv[3] ?? lireJson(path.join(dir, "releve.json")).le;
const aujourdhui = new Date(`${jour}T12:00:00Z`).getTime();
const st = lireJson(path.join(dir, "stations.json"));
const nomDe = new Map(st.map((s) => [s.id, s.nom]));
const cand = lireJson(path.join(dir, "candidats.json"));
const banc = new Map();
for (const f of readdirSync(dir).filter((f) => /^banc.*\.jsonl$/.test(f)).sort()) {
  for (const l of readFileSync(path.join(dir, f), "utf8").split(/\r?\n/).filter(Boolean)) {
    const r = JSON.parse(l);
    banc.set(r.url, r);
  }
}
const plier = (s) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const net = (s) => plier(s).replace(/[^a-z0-9]+/g, " ").trim();
const GENERIQUES = new Set(["la", "le", "les", "de", "d", "du", "des", "saint", "st", "sainte", "ste", "sur", "en", "station", "et", "l", "village"]);
const MOIS = { jan: 0, fev: 1, mar: 2, avr: 3, mai: 4, juin: 5, juil: 6, aou: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function dateImage(texte) {
  const t = plier(texte);
  let m = /(\d{1,2}) (jan|fev|mar|avr|mai|juin|juil|aou|sep|oct|nov|dec)\w* (\d{4})/.exec(t);
  if (m) return Date.UTC(+m[3], MOIS[m[2]], +m[1]);
  m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return null;
}

function etatDe(url) {
  const r = banc.get(url);
  if (!r) return { ok: false, raison: "non passée au banc" };
  if (r.erreur) return { ok: false, raison: `erreur : ${r.erreur.slice(0, 80)}` };
  if (r.bloque) return { ok: false, raison: "bloquée dans le cadre" };
  if (r.refus?.length) return { ok: false, raison: `refus : ${JSON.stringify(r.refus).slice(0, 120)}` };
  const texte = r.texte ?? "";
  const deconnectee = /webcam d[ée]connect|hibernation|hors service|momentan[ée]ment indisponible|camera offline/i.test(texte);
  let d = dateImage(texte);
  // Une page Skaping redirigée vers `?archives=<base64 d'un horodatage>`
  // montre une image d'archive : sa date est celle-là.
  const arch = /[?&]archives=([A-Za-z0-9+/=]+)/.exec(r.frameUrl ?? "");
  if (arch) {
    const t = Number(Buffer.from(arch[1], "base64").toString());
    if (t > 1e9) d = t * 1000;
  }
  const age = d == null ? null : Math.round((aujourdhui - d) / 86400000);
  if (age != null && age > 365) return { ok: false, raison: `dernière image vieille de ${age} jours` };
  return { ok: true, deconnectee, age, titre: r.titre ?? "", texte };
}

// Les stations entre lesquelles une même adresse a été proposée.
const stationsDe = new Map();
for (const [id, cs] of Object.entries(cand))
  for (const c of cs) {
    if (!stationsDe.has(c.url)) stationsDe.set(c.url, { c, ids: new Set() });
    const x = stationsDe.get(c.url);
    x.ids.add(id);
    if (c.titre && !x.c.titre) x.c = c;
  }
const jetons = (id) => id.split("-").filter((t) => !GENERIQUES.has(t));

/** La station d'une caméra proposée à plusieurs : celle dont les mots propres
 *  touchent le plus l'adresse et le titre, puis la plus générale. */
// Caméras d'un site qui couvre plusieurs domaines : la vallée de Chamonix.
const ATTRIBUTION = {
  "https://www.skaping.com/chamonix/tete-de-balme": "le-tour",
  "https://www.skaping.com/chamonix/balme/charamillon": "le-tour",
  "https://www.skaping.com/chamonix/plateau-de-lognan": "argentiere",
  "https://www.skaping.com/argentiere/grandsmontets": "argentiere",
  "https://www.skaping.com/chamonix/les-houches": "les-houches",
};
function attribuer(url, ids, titre) {
  if (ATTRIBUTION[url]) return ATTRIBUTION[url];
  const liste = [...ids];
  if (liste.length === 1) return liste[0];
  const communs = liste.map(jetons).reduce((a, b) => a.filter((t) => b.includes(t)));
  const hay = ` ${net(`${url} ${titre}`)} `;
  const propres = liste.map((id) => ({ id, j: jetons(id).filter((t) => !communs.includes(t) && (t.length >= 4 || /^\d+$/.test(t))) }));
  const scores = propres.map((p) => ({ ...p, n: p.j.filter((t) => hay.includes(` ${t} `) || hay.includes(t)).length }));
  const max = Math.max(...scores.map((p) => p.n));
  let pool = scores.filter((p) => p.n === max);
  if (max === 0) {
    const compact = hay.replace(/ /g, "");
    const nommes = scores.filter((p) => compact.includes(p.id.replace(/-/g, "")) || compact.includes(net(nomDe.get(p.id)).replace(/ /g, "")));
    const generaux = scores.filter((p) => p.j.length === 0);
    if (nommes.length) pool = nommes;
    else if (generaux.length) pool = generaux;
  }
  return pool.sort((a, b) => a.j.length - b.j.length || a.id.length - b.id.length)[0].id;
}

function rang(label, url, e) {
  const t = ` ${net(`${label} ${url.replace(/^https?:\/\/[^/]+/, "")}`)} `;
  let r = 2;
  if (/sommet| pic |pointe|panoram|crete| col |glacier| dome | tete | cime |aiguille|signal| roc | mont |3 vallees| [123] ?\d{3} ?m /.test(t)) r = 0;
  else if (/piste|front|domaine|station|centre|snowpark|telesiege| ts | tsd |telecabine|funitel|telepherique|depart|arrivee|liaison|stade/.test(t)) r = 1;
  else if (/village|place|eglise|omnibus/.test(t)) r = 2;
  if (/ lac |nordique|cascade|plage| port |luge|patinoire|golf|base nautique|base de loisirs|mairie|restaurant|tyrolienne|office|ecole|bikepark|chantier|parking|piscine/.test(t)) r = 3;
  if (/ video /.test(t)) r += 0.5;
  // Coupée pour l’intersaison ou image ancienne : derrière les caméras en
  // service de même intérêt, devant une caméra sans intérêt pour le ski.
  if (e.deconnectee || (e.age != null && e.age > 60)) r += 1.5;
  return r;
}

const ALT = /^(\d[\d\s\u00a0\u202f.]*)\s?m$/i;
function libelle(c, e, ids) {
  const noms = new Set([...ids].flatMap((id) => [net(nomDe.get(id) ?? ""), net(id.replace(/-/g, " "))]));
  const decouper = (t) =>
    t
      .split(/\s+[-–|]\s+|\s*\|\s*/)
      .map((p) => p.replace(/^webcams?\s*:?\s*/i, "").replace(/\bwebcams?\b/gi, "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  const garder = (parts) => parts.filter((p) => !noms.has(net(p)) && !/^(vid[eé]o|m[ée]t[ée]o|historique|photo)$/i.test(p));
  let parts = garder(decouper(c.titre || e.titre || ""));
  // Un titre qui n’est que le nom de la station reste meilleur que le texte
  // de la page, en capitales et suivi de la date.
  if (!parts.length && c.titre) parts = decouper(c.titre);
  if (!parts.length || parts.every((p) => ALT.test(p))) {
    const alt = parts.find((p) => ALT.test(p));
    const debut = (e.texte ?? "").split(/Il y a|LE \d{2}\/|\d{1,2} (?:JAN|F[EÉ]V|MAR|AVR|MAI|JUIN|JUIL|AO[UÛ]|SEP|OCT|NOV|D[EÉ]C)/i)[0];
    const autres = garder(decouper(debut)).filter((p) => !ALT.test(p) && !/d[ée]connect|hibernation|retour prochainement/i.test(p));
    parts = autres.length ? [autres[autres.length - 1], ...(alt ? [alt] : [])] : alt ? [alt] : [];
  }
  let l = parts.filter((p) => !ALT.test(p)).pop() ?? "";
  const alt = parts.find((p) => ALT.test(p));
  if (alt) {
    const a = `${Number(alt.replace(/[^\d]/g, "")).toLocaleString("fr-FR")} m`;
    l = l ? `${l}, ${a}` : `Vue à ${a}`;
  }
  if (!l) l = decodeURIComponent(c.url.split("/").filter(Boolean).pop() ?? "").replace(/[-_]+/g, " ");
  if (l === l.toUpperCase()) l = l.toLowerCase().replace(/(^|[\s'’(-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  return l.charAt(0).toUpperCase() + l.slice(1);
}

function fournisseurDe(c, url) {
  if (c.fournisseur !== "table actuelle") return c.fournisseur;
  if (url.includes("skaping")) return "Skaping";
  if (url.includes("webcam-hd")) return "Webcam-HD";
  if (url.includes("roundshot")) return "Roundshot";
  if (url.includes("viewsurf")) return "Viewsurf";
  if (url.includes("vision-environnement")) return "Vision Environnement";
  return "autre";
}

const choix = {};
const refus = {};
const parStation = new Map();
for (const [url, { c, ids }] of stationsDe) {
  const e = etatDe(url);
  if (!e.ok) {
    for (const id of ids) (refus[id] ??= []).push(`${url} : ${e.raison}`);
    continue;
  }
  const id = attribuer(url, ids, e.titre);
  const label = libelle(c, e, ids);
  if (!parStation.has(id)) parStation.set(id, []);
  parStation.get(id).push({ url, label, fournisseur: fournisseurDe(c, url), r: rang(label, url, e), age: e.age, deconnectee: e.deconnectee });
}
for (const [id, tous] of parStation) {
  tous.sort((a, b) => a.r - b.r);
  const vus = new Set();
  const cs = tous.filter((x) => {
    const k = net(x.label);
    if (vus.has(k)) return false;
    vus.add(k);
    return true;
  });
  choix[id] = cs;
}
writeFileSync(path.join(dir, "choix.json"), JSON.stringify({ choix, refus }, null, 1));
console.log("stations avec au moins une caméra :", Object.keys(choix).length, "; caméras retenues :", Object.values(choix).flat().length);
for (const [id, cs] of Object.entries(choix).sort())
  console.log(id.padEnd(30), cs.map((x) => `${x.label}${x.deconnectee ? " [coupée]" : ""}${x.age != null && x.age > 60 ? ` [${x.age} j]` : ""}`).join(" | "));
