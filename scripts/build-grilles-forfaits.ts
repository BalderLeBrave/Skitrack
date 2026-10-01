/**
 * Les grilles de forfaits par période, migrées des prix déjà en dépôt.
 *
 *     node --experimental-strip-types scripts/build-grilles-forfaits.ts
 *
 * Écrit `src/lib/forfaits/grillesMigrees.json`.
 *
 * ## Ce qui est migré
 *
 * 1. Chaque domaine du **catalogue** qui porte un prix devient une grille à
 *    une période « saison entière ». Ses stations sont celles que
 *    `rattachementForfait` lui rattache aujourd'hui : rien ne change pour
 *    elles.
 * 2. Chaque station **sans prix au catalogue** est raccordée à sa fiche du
 *    référentiel Monde (`raccordement.ts`), et la grille de cette fiche
 *    (Skiinfo, skiresort, bergfex) devient la sienne. Les périodes datées de
 *    bergfex restent datées.
 *
 * La saisie de l'écran Forfaits vit dans le navigateur : elle se migre à la
 * lecture (`grilleDepuisSaisie`), pas ici.
 *
 * Toute grille migrée est de confiance faible. Le catalogue lui-même n'est
 * pas modifié.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { STATIONS } from "../src/lib/stations.ts";
import {
  deviseDuDomaine,
  FORFAIT_CATALOG,
  rattachementForfait,
} from "../src/lib/forfaits/catalog.ts";
import {
  grilleDepuisCatalogue,
  grillesDepuisVue,
  perimetre,
} from "../src/lib/forfaits/migration.ts";
import {
  raccorder,
  type DomaineMonde,
  type Raccordement,
} from "../src/lib/forfaits/raccordement.ts";
import {
  anomaliesGrille,
  type FichierGrilles,
  type GrilleTarifaire,
} from "../src/lib/forfaits/tarifsPeriode.ts";
import type { ForfaitVue } from "../src/lib/monde/vues.ts";

const RACINE = resolve(import.meta.dirname, "..");
const MONDE = resolve(RACINE, "src/lib/monde/data");
const SORTIE = resolve(RACINE, "src/lib/forfaits/grillesMigrees.json");

const lire = <T>(fichier: string): T =>
  JSON.parse(readFileSync(resolve(MONDE, fichier), "utf8")) as T;

type FicheFR = { id: string; nom: string; lat: number; lon: number };
const fichesFR = lire<FicheFR[]>("FR.json");
const vues = lire<{ vues: Record<string, { forfait: ForfaitVue | null }> }>(
  "vuesDomaines.json",
).vues;

/** La date du relevé de chaque source, telle que son fichier l'écrit. */
const releve = {
  skiinfo: lire<{ releve: string }>("forfaitsSkiinfo.json").releve,
  skiresort: lire<{ releve: string }>("forfaits.json").releve,
  bergfexDate: lire<{ releve: string }>("bergfex.json").releve,
  bergfexGrille: lire<{ releve: string }>("bergfexGrilles.json").releve,
  officiel: lire<{ releve: string }>("tarifsOfficiels.json").releve,
  proprietaire: lire<{ at: string }>("tarifsLus.json").at,
};

function releveDe(f: ForfaitVue): string | null {
  switch (f.source) {
    case "skiinfo":
      return releve.skiinfo;
    case "skiresort":
      return releve.skiresort;
    case "bergfex":
      return f.periodes?.length ? releve.bergfexDate : releve.bergfexGrille;
    case "officiel":
      return releve.officiel;
    case "proprietaire":
      return releve.proprietaire;
  }
}

const grilles: GrilleTarifaire[] = [];
const rejets: { id: string; anomalies: string[] }[] = [];
const ajouter = (g: GrilleTarifaire) => {
  const a = anomaliesGrille(g);
  if (a.length) rejets.push({ id: g.id, anomalies: a });
  else grilles.push(g);
};

/* ---------- 1. Catalogue ---------- */

const stationsDuDomaine = new Map<string, string[]>();
const sansPrix: typeof STATIONS = [];
for (const s of STATIONS) {
  const r = rattachementForfait(s.id, s.domain);
  if (r?.domaine.seed?.j6 != null) {
    const l = stationsDuDomaine.get(r.domaine.slug) ?? [];
    l.push(s.id);
    stationsDuDomaine.set(r.domaine.slug, l);
  } else sansPrix.push(s);
}
let catalogueSansGrille = 0;
for (const d of FORFAIT_CATALOG) {
  const g = grilleDepuisCatalogue(
    d,
    stationsDuDomaine.get(d.slug) ?? [],
    deviseDuDomaine(d.slug) ?? "EUR",
  );
  if (g) ajouter(g);
  else catalogueSansGrille += 1;
}

/* ---------- 2. Référentiel Monde, pour les stations sans prix ---------- */

const domainesMonde: DomaineMonde[] = fichesFR.map((f) => ({
  id: f.id,
  nom: f.nom,
  lat: f.lat,
  lon: f.lon,
}));
const nomMonde = new Map(fichesFR.map((f) => [f.id, f.nom]));
const aUneGrille = (id: string) => vues[id]?.forfait != null;

const raccordements = new Map<string, Raccordement>();
const sansFiche: string[] = [];
const ficheSansGrille: string[] = [];
const parFiche = new Map<string, { stations: string[]; parDomaine: boolean }>();
for (const s of sansPrix) {
  const r = raccorder(s, domainesMonde, aUneGrille);
  if (!r) {
    sansFiche.push(s.id);
    continue;
  }
  raccordements.set(s.id, r);
  if (!aUneGrille(r.id)) {
    ficheSansGrille.push(`${s.id} (${nomMonde.get(r.id)})`);
    continue;
  }
  const e = parFiche.get(r.id) ?? { stations: [], parDomaine: false };
  e.stations.push(s.id);
  if (r.par === "domaine" && (s.domain ?? "") !== s.name) e.parDomaine = true;
  parFiche.set(r.id, e);
}
for (const [id, e] of parFiche) {
  const f = vues[id]!.forfait!;
  const nom = nomMonde.get(id) ?? f.nom ?? id;
  // Une fiche qui couvre plusieurs stations, ou que la station désigne comme
  // son domaine, est un domaine relié ; sinon, c'est la station seule.
  const type = e.stations.length > 1 || e.parDomaine ? "domaine" : "station";
  const issues = grillesDepuisVue(f, {
    mondeId: id,
    perimetre: perimetre(type, nom, id),
    stationIds: e.stations,
    releveLe: releveDe(f),
  });
  // Une grille faite de zéros (Skiinfo, quand rien n'est publié) ne donne
  // aucun prix : la station reste sans grille, et le rapport le dit.
  if (!issues.length)
    ficheSansGrille.push(`${e.stations.join(", ")} (${nom}, aucun montant publié)`);
  for (const g of issues) ajouter(g);
}

/* ---------- Écriture et rapport ---------- */

grilles.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const fichier: FichierGrilles = {
  genere: new Date().toISOString().slice(0, 10),
  regle:
    "prix existants repris sans calcul : une période « saison entière » quand la source ne date rien, les périodes publiées sinon ; confiance faible pour toute grille migrée",
  grilles,
};
// Une grille par ligne : le fichier reste compact (il est chargé par l'écran)
// et une différence entre deux migrations se lit grille par grille.
const entete = JSON.stringify({ genere: fichier.genere, regle: fichier.regle }).slice(0, -1);
const lignes = fichier.grilles.map((g) => JSON.stringify(g));
writeFileSync(SORTIE, `${entete},"grilles":[\n${lignes.join(",\n")}\n]}\n`);

const couvertes = new Set(grilles.flatMap((g) => g.stationIds));
const parOrigine: Record<string, number> = {};
for (const g of grilles) parOrigine[g.source.origine] = (parOrigine[g.source.origine] ?? 0) + 1;
const niveaux: Record<string, number> = {};
for (const r of raccordements.values()) niveaux[r.par] = (niveaux[r.par] ?? 0) + 1;
const loin = [...raccordements]
  .filter(([, r]) => r.km > 5 && aUneGrille(r.id))
  .map(([sid, r]) => `${sid} vers ${nomMonde.get(r.id)} (${r.km.toFixed(1)} km, ${r.par})`);

console.log(`Écrit ${SORTIE}`);
console.log(
  `Grilles : ${grilles.length} (${Object.entries(parOrigine)
    .map(([k, n]) => `${k} ${n}`)
    .join(", ")})`,
);
console.log(`Stations couvertes : ${couvertes.size} sur ${STATIONS.length}`);
console.log(`Domaines du catalogue sans prix : ${catalogueSansGrille}`);
console.log(
  `Stations sans prix au catalogue : ${sansPrix.length}, raccordées ${raccordements.size} (${Object.entries(
    niveaux,
  )
    .map(([k, n]) => `${k} ${n}`)
    .join(", ")})`,
);
console.log(
  `Fiche Monde sans grille (${ficheSansGrille.length}) : ${ficheSansGrille.join(", ") || "aucune"}`,
);
console.log(`Sans fiche Monde (${sansFiche.length}) : ${sansFiche.join(", ") || "aucune"}`);
console.log(`Raccordements à plus de 5 km, à vérifier (${loin.length}) :\n  ${loin.join("\n  ")}`);
if (rejets.length) {
  console.log(`Grilles rejetées (${rejets.length}) :`);
  for (const r of rejets) console.log(`  ${r.id} : ${r.anomalies.join(" ; ")}`);
}
