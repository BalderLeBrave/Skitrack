/**
 * Le relevé des grilles de forfaits, période par période, sur les pages
 * officielles des stations.
 *
 *     node --experimental-strip-types scripts/releve-grilles-forfaits.ts
 *     node --experimental-strip-types scripts/releve-grilles-forfaits.ts --source tignes-val-d-isere,auron
 *     node --experimental-strip-types scripts/releve-grilles-forfaits.ts --essai 5
 *     node --experimental-strip-types scripts/releve-grilles-forfaits.ts --sans-navigateur
 *     RELEVE_CHROMIUM=/opt/pw-browsers/chromium node --experimental-strip-types scripts/releve-grilles-forfaits.ts
 *
 * Écrit `src/lib/forfaits/grillesOfficielles.json`, rapport de fin compris.
 * Chaque grille retenue est confrontée aux témoins de ses stations (Skiinfo,
 * skiresort.fr, skipass.com : `temoins-forfaits.ts`, relevés en dépôt) : un
 * écart de plus de 30 % est rapporté, rien n'est modifié.
 *
 * ## Politesse
 *
 * La politique du relevé, déjà en place (`src/lib/scrape/politesse.ts`) :
 * `robots.txt` lu et respecté pour chaque page, `Crawl-delay` appliqué, une
 * requête à la fois par hôte, deux secondes au moins entre deux, en-tête de
 * navigateur. Les boutiques en JavaScript sont rendues par Playwright **sans
 * aucun masquage** : ni drapeau qui cache l'automatisation, ni
 * `navigator.webdriver` retouché. Un défi anti-robot, un captcha ou un refus
 * arrêtent la page, et le rapport le dit : rien n'est contourné.
 *
 * ## Ce qui est gardé
 *
 * Une grille déjà relevée n'est jamais effacée par un échec : les grilles du
 * relevé précédent que celui-ci ne remplace pas restent, avec leur date.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { STATIONS } from "../src/lib/stations.ts";
import { rattachementForfait } from "../src/lib/forfaits/catalog.ts";
import {
  CAUSE_LBL,
  fusionnerAvecPrecedent,
  releverGrilles,
  type Acces,
  type CauseEchec,
} from "../src/lib/forfaits/releve.ts";
import { SOURCES_TARIFS, type PerimetreSource } from "../src/lib/forfaits/sourcesTarifs.ts";
import { chargerTemoins, verifierAvecTemoins } from "./temoins-forfaits.ts";
import {
  saisonDeJour,
  type FichierGrilles,
  type GrilleTarifaire,
} from "../src/lib/forfaits/tarifsPeriode.ts";
import { texteConfrontation } from "../src/lib/forfaits/verification.ts";
import {
  dansLaFile,
  demander,
  demanderOctets,
  UA_RELEVE,
  verdictPoli,
} from "../src/lib/scrape/politesse.ts";

const RACINE = resolve(import.meta.dirname, "..");
const SORTIE = resolve(RACINE, "src/lib/forfaits/grillesOfficielles.json");
const MIGREES = resolve(RACINE, "src/lib/forfaits/grillesMigrees.json");

/* ---------- Options ---------- */

const args = process.argv.slice(2);
const option = (nom: string) => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : undefined;
};
const choisies = option("--source")
  ?.split(",")
  .map((s) => s.trim());
const essai = Number(option("--essai") ?? 0);
const sansNavigateur = args.includes("--sans-navigateur");

let sources = SOURCES_TARIFS.filter((s) => !choisies || choisies.includes(s.id));
if (essai > 0) sources = sources.slice(0, essai);
if (!sources.length) {
  console.error(`Aucune source : ${choisies?.join(", ")}`);
  process.exit(1);
}

/* ---------- Stations ---------- */

const idsConnus = new Set(STATIONS.map((s) => s.id));
const parDomaine = new Map<string, string[]>();
for (const s of STATIONS) {
  const slug = rattachementForfait(s.id, s.domain)?.domaine.slug;
  if (slug) parDomaine.set(slug, [...(parDomaine.get(slug) ?? []), s.id]);
}
const inconnues = new Set<string>();
function stationsDe(p: PerimetreSource): string[] {
  const out = (p.catalogue ?? []).flatMap((slug) => parDomaine.get(slug) ?? []);
  for (const id of p.stations ?? []) {
    if (idsConnus.has(id)) out.push(id);
    else inconnues.add(id);
  }
  return out;
}

/* ---------- Grilles précédentes ---------- */

const lireFichier = (chemin: string): GrilleTarifaire[] =>
  existsSync(chemin) ? (JSON.parse(readFileSync(chemin, "utf8")) as FichierGrilles).grilles : [];
const anciennes = lireFichier(SORTIE);
const precedentes = [...anciennes, ...lireFichier(MIGREES)];

/* ---------- Témoins : Skiinfo, skiresort.fr, skipass.com, relevés en dépôt ---------- */

const temoins = chargerTemoins();
const verifier = (g: GrilleTarifaire) =>
  verifierAvecTemoins(g, temoins)
    .filter((c) => c.alerte)
    .map(texteConfrontation);

/* ---------- Accès au réseau ---------- */

/** Les signes d'une page de défi anti-robot, et non d'une page de tarifs. */
const DEFI =
  /<title>\s*(?:just a moment|attention required|access denied|un instant)|cf-chl-|challenge-platform|px-captcha|captcha-delivery|datadome|<title>[^<]*captcha/i;

type Navigateur = {
  fermer(): Promise<void>;
  rendre(url: string, signal: AbortSignal): Promise<{ status: number; html: string }>;
};
let navigateur: Promise<Navigateur> | null = null;

/**
 * Chromium, lancé comme il vient : aucun des réglages qui masquent
 * l'automatisation (`browser.server.ts` en pose pour les logements ; le relevé
 * des forfaits n'en veut pas).
 *
 * `RELEVE_CHROMIUM` désigne un Chromium déjà installé quand celui qu'attend la
 * version de Playwright du dépôt manque (conteneur dont les navigateurs ne
 * suivent pas cette version).
 */
function ouvrirNavigateur(): Promise<Navigateur> {
  navigateur ??= import("playwright").then(async ({ chromium }) => {
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.RELEVE_CHROMIUM || undefined,
    });
    const ctx = await browser.newContext({
      locale: "fr-FR",
      userAgent: UA_RELEVE,
      viewport: { width: 1280, height: 900 },
    });
    // Rien à lire dans les images, les vidéos ni les polices : on ne les
    // charge pas, pour peser le moins possible sur le site.
    await ctx.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "media" || type === "font") void route.abort();
      else void route.continue();
    });
    return {
      fermer: () => browser.close(),
      async rendre(url, signal) {
        const page = await ctx.newPage();
        const fermer = () => void page.close().catch(() => undefined);
        signal.addEventListener("abort", fermer, { once: true });
        try {
          const rep = await page.goto(url, { waitUntil: "networkidle", timeout: 40_000 });
          return { status: rep?.status() ?? 0, html: await page.content() };
        } finally {
          signal.removeEventListener("abort", fermer);
          fermer();
        }
      },
    };
  });
  return navigateur;
}

const acces: Acces = {
  async robots(url) {
    const v = await verdictPoli(url);
    return { autorise: v.autorise, regle: v.regle, delaiMs: v.delaiMs };
  },
  async html(url, delaiMs) {
    const r = await demander(url, undefined, delaiMs);
    return { status: r.status, html: r.text };
  },
  async navigateur(url, delaiMs) {
    if (sansNavigateur)
      return { status: 0, html: "", blocage: "navigateur désactivé (--sans-navigateur)" };
    const nav = await ouvrirNavigateur();
    const r = await dansLaFile(url, (signal) => nav.rendre(url, signal), {
      delaiMs,
      timeoutMs: 45_000,
    });
    const defi = DEFI.exec(r.html);
    return {
      ...r,
      blocage: defi ? `défi anti-robot (${defi[0].replace(/<[^>]*>/g, "").trim()})` : null,
    };
  },
  async pdf(url, delaiMs) {
    const r = await demanderOctets(url, undefined, delaiMs);
    if (!r.ok) return { status: r.status, pages: [] };
    const entete = new TextDecoder().decode(r.octets.slice(0, 5));
    if (entete !== "%PDF-") throw new Error(`pas un PDF (${r.type ?? "type inconnu"})`);
    const { extractText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(r.octets);
    const { text } = await extractText(doc, { mergePages: false });
    return { status: r.status, pages: text };
  },
};

/* ---------- Relevé ---------- */

const maintenant = new Date().toISOString();
const saison = saisonDeJour(maintenant.slice(0, 10))!;
console.log(`Relevé des grilles de forfaits, saison ${saison} : ${sources.length} source(s)`);
const { grilles, rapport } = await releverGrilles(sources, acces, {
  saison,
  maintenant,
  stationsDe,
  precedentes,
  journal: (l) => console.log(`  ${l}`),
  verifier,
});
// `navigateur` est ouvert dans une fermeture : TypeScript le croit encore nul.
// Un navigateur qui n'a pas pu s'ouvrir a déjà été compté en échec, page par
// page : il ne doit pas empêcher d'écrire les grilles et le rapport.
const ouvert = navigateur as Promise<Navigateur> | null;
if (ouvert) await ouvert.then((n) => n.fermer()).catch(() => undefined);

// Une grille qu'un témoin contredit de plus de moitié a presque toujours été
// mal lue (prix enfant, débutant ou assurance pris pour l'adulte) : elle est
// mise de côté, écrite à part dans le fichier, et l'application garde la
// grille précédente. Entre 30 et 50 %, elle est gardée et rapportée.
const ECART_MIS_DE_COTE = 0.5;
const contredite = (g: GrilleTarifaire) =>
  verifierAvecTemoins(g, temoins).some((c) => c.comparaisons.some((x) => x.ecart > ECART_MIS_DE_COTE));
const misesDeCote = grilles.filter(contredite);
const retenues = grilles.filter((g) => !contredite(g));
const toutes = fusionnerAvecPrecedent(retenues, anciennes);
const entete = JSON.stringify({
  genere: maintenant.slice(0, 10),
  regle:
    "grilles lues sur les pages officielles, robots.txt respecté, contrôlées avant écriture ; une grille déjà relevée n'est jamais effacée par un échec",
  rapport,
}).slice(0, -1);
writeFileSync(
  SORTIE,
  `${entete},"misesDeCote":${JSON.stringify(misesDeCote.map((g) => g.id))},"grilles":[\n${toutes.map((g) => JSON.stringify(g)).join(",\n")}\n]}\n`,
);

/* ---------- Rapport ---------- */

console.log(`\nÉcrit ${SORTIE}`);
console.log(`Pages : ${rapport.pagesLues} lues sur ${rapport.pages}`);
console.log(
  `Grilles relevées : ${rapport.grilles} (${rapport.periodes} périodes), ${toutes.length - retenues.length} gardée(s) d'un relevé précédent`,
);
if (misesDeCote.length) {
  console.log(`\nMises de côté, contredites de plus de ${ECART_MIS_DE_COTE * 100} % par un témoin (${misesDeCote.length})`);
  for (const g of misesDeCote) console.log(`  ${g.id}`);
}
console.log(`Stations couvertes par ce relevé : ${rapport.stationsCouvertes}`);
for (const [cause, liste] of Object.entries(rapport.echecs) as [CauseEchec, string[]][]) {
  console.log(`\nÉchecs : ${CAUSE_LBL[cause]} (${liste.length})`);
  for (const l of liste) console.log(`  ${l}`);
}
if (rapport.rejets.length) {
  console.log(`\nRejets du contrôle qualité (${rapport.rejets.length})`);
  for (const r of rapport.rejets) console.log(`  ${r}`);
}
if (rapport.alertes.length) {
  console.log(`\nÀ vérifier (${rapport.alertes.length})`);
  for (const a of rapport.alertes) console.log(`  ${a}`);
}
if (rapport.verifications.length) {
  console.log(`\nÉcarts de plus de 30 % avec un témoin (${rapport.verifications.length})`);
  for (const v of rapport.verifications) console.log(`  ${v}`);
}
if (rapport.problemes.length)
  console.log(`\nLectures incomplètes : ${rapport.problemes.length} (détail dans le fichier)`);
if (inconnues.size)
  console.log(`\nStations inconnues du référentiel, ignorées : ${[...inconnues].join(", ")}`);
