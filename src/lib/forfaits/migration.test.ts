import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agesDepuisTexte,
  categorieDepuisLibelle,
  dateFrancaise,
  dureeDepuisLibelle,
  grilleDepuisCatalogue,
  grilleDepuisSaisie,
  grillesDepuisVue,
  perimetre,
  plagesBergfex,
  saisonDepuisTexte,
} from "./migration.ts";
import { FORFAIT_CATALOG, rattachementForfait } from "./catalog.ts";
import { anomaliesGrille, type FichierGrilles } from "./tarifsPeriode.ts";
import type { DomainForfait } from "./types.ts";
import type { ForfaitVue } from "../monde/vues.ts";
import { STATIONS } from "../stations.ts";

const dir = dirname(fileURLToPath(import.meta.url));

function domaine(
  patch: Partial<DomainForfait> = {},
  seed: Record<string, unknown> = {},
): DomainForfait {
  return {
    id: 1,
    slug: "val-thorens-orelle",
    name: "Val Thorens – Orelle",
    massif: "Alpes du Nord",
    region: "Savoie",
    minM: 1800,
    maxM: 3230,
    villageM: 2300,
    km: 150,
    lifts: 29,
    glacier: true,
    pass: "Les 3 Vallées",
    lat: 45.3,
    lon: 6.58,
    country: "FR",
    website: "https://www.valthorens.com/",
    websiteVerified: true,
    stationIds: ["val-thorens"],
    ...patch,
    seed: {
      j1: null,
      j6: 359,
      enf6: null,
      saison: null,
      zone: "Les 3 Vallées (600 km)",
      maj: "2026-08-11",
      majLabel: "11 août 2026",
      estime: { j1: 68, enf6: 287 },
      ...seed,
    } as DomainForfait["seed"],
  };
}

function vue(patch: Partial<ForfaitVue>): ForfaitVue {
  return {
    source: "skiinfo",
    cle: "alpes-du-sud/orcieres",
    nom: "Orcières Merlette",
    km: 0.2,
    devise: "EUR",
    deviseSource: "page",
    deviseDuPays: null,
    misAJour: null,
    categories: [],
    lignes: [],
    saison: null,
    periodes: null,
    ...patch,
  };
}

describe("migration : lecture des libellés", () => {
  it("durées publiées", () => {
    const d = (l: string) => dureeDepuisLibelle(l).duree;
    assert.deepEqual(d("6 Jours"), { type: "jours", jours: 6 });
    assert.deepEqual(d("Forfait 2 jour"), { type: "jours", jours: 2 });
    assert.deepEqual(d("12 Jours"), { type: "jours", jours: 12 });
    assert.deepEqual(d("Forfait journée"), { type: "jours", jours: 1 });
    assert.deepEqual(d("Forfait journalier Haute saison"), { type: "jours", jours: 1 });
    assert.deepEqual(d("Forfait semaine"), { type: "semaine" });
    assert.deepEqual(d("Hebdomadaire"), { type: "semaine" });
    assert.deepEqual(d("Passeport saisonnier"), { type: "saison" });
    assert.deepEqual(d("4 Heures"), { type: "partielle", heures: 4, des: null });
    assert.deepEqual(d("Forfait 1/2j (ou 4h si proposé)"), {
      type: "partielle",
      heures: null,
      des: null,
    });
    assert.deepEqual(d("1 Jour à partir de 12:30"), {
      type: "partielle",
      heures: null,
      des: "12:30",
    });
    assert.deepEqual(d("1 Jour à 13:00"), { type: "partielle", heures: null, des: "13:00" });
    assert.deepEqual(d("Montée et descente"), { type: "autre" });
  });

  it("le tarif du week-end est restreint, pas une journée ordinaire", () => {
    assert.deepEqual(dureeDepuisLibelle("Forfait journée (le week-end)"), {
      duree: { type: "jours", jours: 1 },
      restriction: "le week-end",
    });
    assert.equal(dureeDepuisLibelle("Forfait journée").restriction, null);
  });

  it("catégories publiées", () => {
    assert.equal(categorieDepuisLibelle("Adultes"), "adulte");
    assert.equal(categorieDepuisLibelle("Enfants"), "enfant");
    assert.equal(categorieDepuisLibelle("Jeunes"), "junior");
    assert.equal(categorieDepuisLibelle("Junior"), "junior");
    assert.equal(categorieDepuisLibelle("Sénior"), "senior");
    assert.equal(categorieDepuisLibelle("Âge d'or"), "senior");
    assert.equal(categorieDepuisLibelle("Étudiant"), "etudiant");
    assert.equal(categorieDepuisLibelle("Tribu"), "famille");
    assert.equal(categorieDepuisLibelle("Piéton"), "autre");
  });

  it("bornes d'âge, jamais tirées d'années de naissance", () => {
    assert.deepEqual(agesDepuisTexte("5-12"), { min: 5, max: 12 });
    assert.deepEqual(agesDepuisTexte("5 -18"), { min: 5, max: 18 });
    assert.deepEqual(agesDepuisTexte("70+"), { min: 70, max: null });
    assert.deepEqual(agesDepuisTexte("65-"), { min: 65, max: null });
    assert.equal(agesDepuisTexte("2010-2020"), null);
    assert.equal(agesDepuisTexte(null), null);
  });

  it("plages bergfex, une ou deux par grille", () => {
    assert.deepEqual(plagesBergfex("20.12.25 - 10.04.26"), [
      { debut: "2025-12-20", fin: "2026-04-10" },
    ]);
    assert.deepEqual(plagesBergfex("29.11.25 - 12.12.25 25.04.26 - 03.05.26"), [
      { debut: "2025-11-29", fin: "2025-12-12" },
      { debut: "2026-04-25", fin: "2026-05-03" },
    ]);
  });

  it("dates et saisons écrites en toutes lettres", () => {
    assert.equal(dateFrancaise("27 nov. 2025"), "2025-11-27");
    assert.equal(dateFrancaise("11 janv. 2024"), "2024-01-11");
    assert.equal(dateFrancaise("3 févr. 2026"), "2026-02-03");
    assert.equal(dateFrancaise(null), null);
    assert.equal(saisonDepuisTexte("2025-2026 Tarif valable jusqu'au 29 mars"), "2025-26");
    assert.equal(saisonDepuisTexte("2025-2027"), null);
  });
});

describe("migration : catalogue", () => {
  it("un prix du catalogue devient une période « saison entière », confiance faible", () => {
    const g = grilleDepuisCatalogue(domaine(), ["val-thorens", "les-menuires"], "EUR")!;
    assert.equal(g.saison, "2026-27");
    assert.equal(g.confiance, "faible");
    assert.equal(g.periodes.length, 1);
    assert.equal(g.periodes[0].saisonEntiere, true);
    assert.equal(g.periodes[0].debut, "2026-08-01");
    assert.equal(g.periodes[0].fin, "2027-07-31");
    assert.deepEqual(g.stationIds, ["les-menuires", "val-thorens"]);
    assert.equal(g.source.url, "https://www.valthorens.com/");
    assert.equal(g.scrapeLe, "2026-08-11");
    assert.deepEqual(g.perimetre, {
      type: "domaine",
      cle: "domaine:3-vallees",
      nom: "Les 3 Vallées",
    });
    assert.deepEqual(anomaliesGrille(g), []);
  });

  it("rien n'est perdu : chaque prix et chaque estimation, les estimations marquées", () => {
    const g = grilleDepuisCatalogue(
      domaine({}, { j1: 71, enf6: 292, saison: 1290, estime: null }),
      [],
      "EUR",
    )!;
    const t = g.periodes[0].tarifs.map(
      (x) => `${x.libelleDuree}|${x.categorie}|${x.prix}|${x.estime ? "estimé" : "relevé"}`,
    );
    assert.deepEqual(t, [
      "1 jour|adulte|71|relevé",
      "6 jours|adulte|359|relevé",
      "6 jours|enfant|292|relevé",
      "Saison|adulte|1290|relevé",
    ]);
    const e = grilleDepuisCatalogue(domaine(), [], "EUR")!;
    assert.deepEqual(
      e.periodes[0].tarifs
        .filter((x) => x.estime)
        .map((x) => `${x.libelleDuree}|${x.categorie}|${x.prix}`),
      ["1 jour|adulte|68", "6 jours|enfant|287"],
    );
  });

  it("un domaine sans pass est un forfait de station ; un domaine sans prix ne donne rien", () => {
    const g = grilleDepuisCatalogue(
      domaine({ slug: "la-norma", name: "La Norma", pass: null }),
      [],
      "EUR",
    )!;
    assert.deepEqual(g.perimetre, { type: "station", cle: "station:la-norma", nom: "La Norma" });
    assert.equal(grilleDepuisCatalogue(domaine({}, { j6: null, estime: null }), [], "EUR"), null);
    assert.equal(
      grilleDepuisCatalogue(domaine({}, { j6: null }), [], "EUR"),
      null,
      "une estimation seule n'est pas un prix",
    );
  });

  it("le même domaine relié porte la même clé, quelle que soit l'écriture", () => {
    assert.equal(
      perimetre("domaine", "Les 3 Vallées", "a").cle,
      perimetre("domaine", "Les Trois Vallées", "b").cle,
    );
  });
});

describe("migration : référentiel Monde", () => {
  it("bergfex daté : une période par plage, libellé d'origine, tarifs par durée et catégorie", () => {
    const [g, ...reste] = grillesDepuisVue(
      vue({
        source: "bergfex",
        cle: "val-disere",
        periodes: [
          {
            dates: "13.12.25 - 24.04.26",
            categories: ["Adultes", "Enfants", "Seniors"],
            lignes: [
              { libelle: "1 Jour", prix: [75, 62, 62] },
              { libelle: "6 Jours", prix: [390, 322, null] },
            ],
          },
          {
            dates: "29.11.25 - 12.12.25 25.04.26 - 03.05.26",
            categories: ["Adultes", "Enfants", "Seniors"],
            lignes: [{ libelle: "1 Jour", prix: [64, 54, 54] }],
          },
        ],
      }),
      {
        mondeId: "fr-tignes-val-d-isere",
        perimetre: perimetre("domaine", "Tignes - Val d'Isère", "fr-tignes-val-d-isere"),
        stationIds: ["tignes"],
        releveLe: "2026-09-21T20:44:56.772Z",
      },
    );
    assert.equal(reste.length, 0);
    assert.equal(g.saison, "2025-26");
    assert.equal(g.source.url, "https://www.bergfex.fr/val-disere/preise/");
    assert.deepEqual(
      g.periodes.map((p) => [p.debut, p.fin, p.libelle, p.saisonEntiere]),
      [
        ["2025-11-29", "2025-12-12", "29.11.25 - 12.12.25 25.04.26 - 03.05.26", false],
        ["2025-12-13", "2026-04-24", "13.12.25 - 24.04.26", false],
        ["2026-04-25", "2026-05-03", "29.11.25 - 12.12.25 25.04.26 - 03.05.26", false],
      ],
    );
    const coeur = g.periodes[1].tarifs;
    assert.equal(coeur.length, 5, "le senior 6 jours non publié n'est pas inventé");
    assert.deepEqual(
      coeur.map((t) => `${t.libelleDuree}|${t.categorie}|${t.prix}`),
      [
        "1 Jour|adulte|75",
        "1 Jour|enfant|62",
        "1 Jour|senior|62",
        "6 Jours|adulte|390",
        "6 Jours|enfant|322",
      ],
    );
    assert.deepEqual(anomaliesGrille(g), []);
  });

  it("Skiinfo : zéro n'est pas un prix, âges et week-end repris, saison de la mise à jour", () => {
    const [g] = grillesDepuisVue(
      vue({
        misAJour: "15 déc. 2025",
        categories: [
          { nom: "Enfant", ages: "5-17" },
          { nom: "Adulte", ages: "18-64" },
          { nom: "Sénior", ages: "65-74" },
        ],
        lignes: [
          { libelle: "Forfait journée", prix: [38.5, 46, 0] },
          { libelle: "Forfait journée (le week-end)", prix: [null, 50, null] },
          { libelle: "Forfait semaine", prix: [216.5, 255, 239] },
        ],
        saison: {
          libelle: "2025-2026 Tarif valable jusqu'au 12 déc. 2025",
          validite: null,
          categories: [{ nom: "Adulte", ages: "18-64" }],
          prix: [489],
        },
      }),
      {
        mondeId: "fr-orcieres",
        perimetre: perimetre("station", "Orcières", "fr-orcieres"),
        stationIds: ["orcieres"],
        releveLe: "2026-09-21T15:58:01.853Z",
      },
    );
    assert.equal(g.saison, "2025-26");
    assert.equal(g.periodes.length, 1);
    assert.equal(g.periodes[0].saisonEntiere, true);
    const t = g.periodes[0].tarifs;
    assert.ok(!t.some((x) => x.prix === 0));
    const adulte = t.find((x) => x.categorie === "adulte" && x.libelleDuree === "Forfait journée")!;
    assert.deepEqual(adulte.ages, { min: 18, max: 64 });
    assert.equal(adulte.libelleCategorie, "Adulte 18-64");
    assert.equal(t.find((x) => x.restriction === "le week-end")?.prix, 50);
    assert.deepEqual(
      t.find((x) => x.duree.type === "semaine" && x.categorie === "adulte")?.prix,
      255,
    );
    assert.equal(t.find((x) => x.duree.type === "saison")?.prix, 489);
    assert.equal(g.source.url, "https://www.skiinfo.fr/alpes-du-sud/orcieres/forfaits-de-ski");
  });

  it("une grille sans aucune date est rangée à la saison du relevé, et c'est écrit", () => {
    const [g] = grillesDepuisVue(
      vue({
        source: "skiresort",
        cle: "val-cenis",
        categories: [
          { nom: "Enfant", ages: null },
          { nom: "Adulte", ages: null },
        ],
        lignes: [{ libelle: "Forfait journalier Haute saison", prix: [41, 49.5] }],
      }),
      {
        mondeId: "fr-val-cenis",
        perimetre: perimetre("station", "Val Cenis", "fr-val-cenis"),
        stationIds: ["val-cenis"],
        releveLe: "2026-09-21T13:52:27.064Z",
      },
    );
    assert.equal(g.saison, "2026-27");
    assert.match(g.notes.join(" "), /saison du relevé/);
    assert.deepEqual(
      g.periodes[0].tarifs.map((x) => x.duree),
      [
        { type: "jours", jours: 1 },
        { type: "jours", jours: 1 },
      ],
    );
  });

  it("une vue sans devise ou sans prix ne donne aucune grille", () => {
    const ctx = {
      mondeId: "x",
      perimetre: perimetre("station", "X", "x"),
      stationIds: ["x"],
      releveLe: "2026-09-21",
    };
    assert.deepEqual(
      grillesDepuisVue(
        vue({
          devise: null,
          lignes: [{ libelle: "Forfait journée", prix: [40] }],
          categories: [{ nom: "Adulte", ages: null }],
        }),
        ctx,
      ),
      [],
    );
    assert.deepEqual(
      grillesDepuisVue(
        vue({
          lignes: [{ libelle: "Forfait journée", prix: [0] }],
          categories: [{ nom: "Adulte", ages: null }],
        }),
        ctx,
      ),
      [],
    );
  });
});

describe("migration : saisie de l'écran Forfaits", () => {
  it("les cases saisies deviennent une période « saison entière »", () => {
    const g = grilleDepuisSaisie(
      {
        slug: "la-norma",
        saison: "2026-27",
        dureeMax: 7,
        cases: {
          "6.0|adulte": {
            prix: 228.2,
            devise: "EUR",
            source: "saisie manuelle",
            dateReleve: "2026-09-29T10:00:00.000Z",
            statut: "manuel",
          },
          "0.5|enfant": {
            prix: 20,
            devise: "EUR",
            source: "saisie manuelle",
            dateReleve: "2026-09-30T10:00:00.000Z",
            statut: "manuel",
          },
          "1.0|adulte": {
            prix: null,
            devise: "EUR",
            source: null,
            dateReleve: null,
            statut: "absent",
          },
        },
      },
      undefined,
      ["la-norma"],
    )!;
    assert.equal(g.confiance, "faible");
    assert.equal(g.source.origine, "saisie");
    assert.equal(g.scrapeLe, "2026-09-30T10:00:00.000Z");
    assert.deepEqual(
      g.periodes[0].tarifs.map((t) => [t.duree, t.categorie, t.prix]),
      [
        [{ type: "jours", jours: 6 }, "adulte", 228.2],
        [{ type: "partielle", heures: null, des: null }, "enfant", 20],
      ],
    );
  });
});

describe("migration : le fichier produit", () => {
  const fichier = JSON.parse(
    readFileSync(join(dir, "grillesMigrees.json"), "utf8"),
  ) as FichierGrilles;

  it("chaque prix du catalogue s'y retrouve, dans la grille de son domaine", () => {
    for (const d of FORFAIT_CATALOG) {
      const s = d.seed;
      if (!s || s.j6 == null) continue;
      const g = fichier.grilles.find((x) => x.id.startsWith(`catalogue:${d.slug}:`));
      assert.ok(g, d.slug);
      const prix = g.periodes.flatMap((p) => p.tarifs.filter((t) => !t.estime).map((t) => t.prix));
      for (const v of [s.j1, s.j6, s.enf6, s.saison])
        if (v != null) assert.ok(prix.includes(v), `${d.slug} : ${v}`);
    }
  });

  it("chaque station qui avait un prix garde la grille de son forfait", () => {
    for (const s of STATIONS) {
      const r = rattachementForfait(s.id, s.domain);
      if (r?.domaine.seed?.j6 == null) continue;
      const g = fichier.grilles.find((x) => x.id.startsWith(`catalogue:${r.domaine.slug}:`));
      assert.ok(g?.stationIds.includes(s.id), s.id);
    }
  });

  it("toute grille migrée est de confiance faible et bien formée", () => {
    for (const g of fichier.grilles) {
      assert.equal(g.confiance, "faible", g.id);
      assert.deepEqual(anomaliesGrille(g), [], g.id);
    }
  });

  it("aucun tiret cadratin dans ce qui peut s'afficher", () => {
    for (const g of fichier.grilles) {
      const texte = [g.source.libelle, ...g.notes, ...g.periodes.map((p) => p.libelle)].join(" ");
      assert.ok(!texte.includes("\u2014"), g.id);
    }
  });
});
