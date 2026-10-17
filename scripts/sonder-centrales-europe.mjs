#!/usr/bin/env node
/**
 * Le tour des centrales de réservation de tous les domaines européens hors
 * France (`src/lib/monde/data`), lancé depuis un poste qui atteint leurs
 * sites. Même méthode que `docs/centrales/audit.md` et
 * `docs/centrales/europe/audit.md`, sans moteur de recherche :
 *
 * 1. le site officiel du domaine (`sites`, OpenSkiMap / Wikidata) ;
 * 2. les liens « hébergement / Unterkunft / alloggi… » qu'il publie ;
 * 3. la page vers laquelle ils mènent, et l'empreinte du moteur qui la fait
 *    tourner (`centrales-empreintes.mjs`), citée comme preuve.
 *
 * Poli : `robots.txt` est lu pour chaque hôte et respecté ; une requête à la
 * fois par hôte, deux secondes entre deux ; quatre hôtes au plus en même
 * temps. Lecture seule : aucun formulaire n'est soumis.
 *
 *   node scripts/sonder-centrales-europe.mjs                 # tout, reprend où il s'est arrêté
 *   node scripts/sonder-centrales-europe.mjs --pays AT,CH    # quelques pays
 *   node scripts/sonder-centrales-europe.mjs --max 50        # un essai
 *
 * Un domaine resté injoignable (réseau coupé, DNS) est repris au lancement
 * suivant ; les autres ne sont pas redemandés.
 *
 * Sortie : `docs/centrales/europe/sondage.json`, écrite au fil de l'eau. Un
 * domaine déjà sondé n'est pas redemandé (`--refaire` pour tout reprendre).
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cheminPermis,
  interditsRobots,
  liensHebergement,
  moteurDe,
} from "./centrales-empreintes.mjs";

const racine = fileURLToPath(new URL("..", import.meta.url));
const arg = (nom) => {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : null;
};
const SORTIE = arg("--sortie") ?? join(racine, "docs/centrales/europe/sondage.json");
const UA = "SkiTrack-releve-centrales/1.0 (lecture seule ; robots.txt respecte)";
const PAUSE_HOTE_MS = Number(process.env.SONDAGE_PAUSE_MS ?? 2_000);
const PARALLELE = 4;
const DELAI_MS = 15_000;

const paysVoulus =
  arg("--pays")
    ?.split(",")
    .map((s) => s.trim().toUpperCase()) ?? null;
const max = Number(arg("--max") ?? Infinity);
const refaire = process.argv.includes("--refaire");

// Les domaines, comme `src/lib/europe.ts` les sert : hors France, un par identifiant.
const dir = arg("--donnees") ?? join(racine, "src/lib/monde/data");
const domaines = [];
const vus = new Set();
for (const f of readdirSync(dir).sort()) {
  const m = /^([A-Z]{2})\.json$/.exec(f);
  if (!m || m[1] === "FR" || (paysVoulus && !paysVoulus.includes(m[1]))) continue;
  for (const d of JSON.parse(readFileSync(join(dir, f), "utf8"))) {
    if ((d.pays?.[0] ?? m[1]) === "FR" || vus.has(d.id)) continue;
    vus.add(d.id);
    domaines.push({
      id: d.id,
      nom: d.nom,
      pays: d.pays?.[0] ?? m[1],
      km: d.km ?? 0,
      sites: d.sites ?? [],
    });
  }
}
domaines.sort((a, b) => b.km - a.km);

const sortie =
  existsSync(SORTIE) && !refaire ? JSON.parse(readFileSync(SORTIE, "utf8")) : { domaines: {} };
sortie.releve = new Date().toISOString().slice(0, 10);
sortie.methode =
  "Sondage automatique : site officiel du domaine, liens d'hébergement qu'il publie, empreinte du moteur dans la page de réservation. robots.txt respecté.";
const enregistrer = () => writeFileSync(SORTIE, JSON.stringify(sortie, null, 1));

// Un hôte, une file : jamais deux requêtes à la fois, deux secondes entre deux.
const files = new Map();
const robots = new Map();
function surHote(host, travail) {
  const avant = files.get(host) ?? Promise.resolve();
  const suite = avant
    .then(travail, travail)
    .finally(() => new Promise((r) => setTimeout(r, PAUSE_HOTE_MS)));
  files.set(
    host,
    suite.catch(() => {}),
  );
  return suite;
}

async function brut(url) {
  const r = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(DELAI_MS),
  });
  return { ok: r.ok, statut: r.status, url: r.url, texte: r.ok ? await r.text() : "" };
}

async function permis(url) {
  const u = new URL(url);
  if (!robots.has(u.host)) {
    robots.set(
      u.host,
      surHote(u.host, () => brut(`${u.protocol}//${u.host}/robots.txt`))
        .then((r) => (r.ok ? interditsRobots(r.texte) : []))
        .catch(() => []),
    );
  }
  return cheminPermis(u.pathname + u.search, await robots.get(u.host));
}

async function lire(url) {
  if (!(await permis(url))) return { interdit: true };
  return surHote(new URL(url).host, () => brut(url));
}

async function sonder(d) {
  const site = d.sites.find((s) => /^https?:\/\//.test(s));
  if (!site) return { centrale: null, motif: "site officiel inconnu du référentiel" };
  let accueil;
  try {
    accueil = await lire(site);
  } catch (e) {
    return { site, centrale: null, motif: `site injoignable : ${e.cause?.code ?? e.name}` };
  }
  if (accueil.interdit)
    return { site, centrale: null, motif: "robots.txt interdit la page d'accueil" };
  if (!accueil.ok) return { site, centrale: null, motif: `site : HTTP ${accueil.statut}` };
  const surAccueil = moteurDe(accueil.texte);
  const liens = liensHebergement(accueil.texte, accueil.url);
  const pages = [];
  for (const l of liens) {
    let p;
    try {
      p = await lire(l.url);
    } catch {
      pages.push({ url: l.url, erreur: true });
      continue;
    }
    if (p.interdit) {
      pages.push({ url: l.url, interdit: true });
      continue;
    }
    pages.push({ url: l.url, statut: p.statut });
    const m = p.ok ? moteurDe(p.texte) : null;
    if (m) return { site, pages, centrale: { url: p.url, hote: new URL(p.url).host, ...m } };
  }
  if (surAccueil)
    return {
      site,
      pages,
      centrale: { url: accueil.url, hote: new URL(accueil.url).host, ...surAccueil },
    };
  if (pages.length) {
    const p = pages.find((x) => x.statut && x.statut < 400);
    return {
      site,
      pages,
      centrale: p
        ? {
            url: p.url,
            hote: new URL(p.url).host,
            moteur: "inconnu",
            preuve: "aucune empreinte connue dans la page",
          }
        : null,
      motif: p ? undefined : "liens d'hébergement injoignables ou interdits",
    };
  }
  return {
    site,
    centrale: null,
    motif:
      "aucun lien d'hébergement sur la page d'accueil (page peut-être construite en JavaScript)",
  };
}

// Un domaine resté en erreur réseau se redemande au lancement suivant.
const aReprendre = (x) => !x || /^(site injoignable|erreur)/.test(x.motif ?? "");
const aFaire = domaines.filter((d) => refaire || aReprendre(sortie.domaines[d.id])).slice(0, max);
console.log(`${aFaire.length} domaines à sonder sur ${domaines.length}`);
let fait = 0;
async function ouvrier() {
  while (aFaire.length) {
    const d = aFaire.shift();
    const r = await sonder(d).catch((e) => ({ centrale: null, motif: `erreur : ${e.message}` }));
    sortie.domaines[d.id] = { nom: d.nom, pays: d.pays, km: d.km, ...r };
    fait += 1;
    if (fait % 10 === 0) {
      enregistrer();
      console.log(`${fait} sondés`);
    }
  }
}
await Promise.all(Array.from({ length: PARALLELE }, ouvrier));
const compte = {};
for (const x of Object.values(sortie.domaines)) {
  const k = x.centrale?.moteur ?? "sans centrale";
  compte[k] = (compte[k] ?? 0) + 1;
}
sortie.moteurs = compte;
enregistrer();
console.log(compte);
