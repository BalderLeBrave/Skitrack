import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { caseDe, colonne, matriceDe, POSTES, remplies, type Grille } from "./matrice.ts";

/** Une grille Skiinfo : quatre classes d'âge, un bloc saison à part. */
const skiinfo: Grille = {
  source: "skiinfo",
  devise: "EUR",
  categories: ["Enfant", "Junior", "Adulte", "Sénior"],
  lignes: [
    { libelle: "Forfait journée", prix: [26, 38, 45, 40] },
    { libelle: "Forfait journée (le week-end)", prix: [30, 42, 50, 44] },
    { libelle: "Forfait 1/2j (ou 4h si proposé)", prix: [20, 28, 34, 30] },
    { libelle: "Forfait semaine", prix: [130, 190, 230, 205] },
  ],
  saison: { categories: ["Enfant", "Junior", "Adulte", "Sénior"], prix: [370, 445, 590, 510] },
};

/** Une grille bergfex : une plage de dates, des durées en lignes. */
const bergfex: Grille = {
  source: "bergfex",
  devise: "EUR",
  dates: "20.12.25 - 10.04.26",
  categories: ["Adultes", "Enfants", "Jeunes", "Seniors"],
  lignes: [
    { libelle: "1 Jour", prix: [66, 55, null, 60] },
    { libelle: "1 Jour à partir de 12:30", prix: [57.5, null, null, null] },
    { libelle: "6 Jours", prix: [333, 259, null, 283.5] },
    { libelle: "Passeport saisonnier", prix: [1150, 575, null, 980] },
  ],
};

describe("colonne", () => {
  it("trouve l'adulte et l'enfant, quelle que soit la langue de la source", () => {
    assert.equal(colonne(["Enfant", "Junior", "Adulte"], "adulte"), 2);
    assert.equal(colonne(["Adultes", "Enfants"], "enfant"), 1);
    assert.equal(colonne(["Erwachsene", "Kinder"], "adulte"), 0);
    assert.equal(colonne(["Erwachsene", "Kinder"], "enfant"), 1);
  });

  it("ne prend ni le junior ni le senior pour un enfant", () => {
    // Un junior de 14 ans n'est pas l'enfant de 6 ans : les sources les
    // publient séparément, et les confondre ferait varier le prix annoncé.
    assert.equal(colonne(["Junior", "Jeune", "Sénior", "Étudiant"], "enfant"), -1);
    assert.equal(colonne(["Junior", "Sénior"], "adulte"), -1);
  });

  it("ignore la tranche d'âge écrite entre parenthèses", () => {
    assert.equal(colonne(["Enfant (2014-2018)", "Adulte (19-64)"], "adulte"), 1);
  });
});

describe("caseDe", () => {
  it("lit la journée entière, jamais la demi-journée ni le week-end", () => {
    const c = caseDe(skiinfo, "jourAdulte");
    assert.equal(c?.prix, 45);
    assert.equal(c?.libelle, "Forfait journée");
    assert.equal(c?.categorie, "Adulte");
    assert.equal(caseDe(bergfex, "jourAdulte")?.prix, 66);
  });

  it("garde le libellé publié : « 6 Jours » chez l'un, « Forfait semaine » chez l'autre", () => {
    // Ce ne sont pas tout à fait le même produit. On les range au même poste
    // — c'est ce qu'on nous demande — mais on n'efface pas la différence.
    assert.equal(caseDe(skiinfo, "sixJoursAdulte")?.libelle, "Forfait semaine");
    assert.equal(caseDe(bergfex, "sixJoursEnfant")?.libelle, "6 Jours");
    assert.equal(caseDe(bergfex, "sixJoursEnfant")?.prix, 259);
  });

  it("prend la saison dans son bloc chez Skiinfo, dans sa ligne chez bergfex", () => {
    assert.equal(caseDe(skiinfo, "saisonAdulte")?.prix, 590);
    assert.equal(caseDe(skiinfo, "saisonEnfant")?.prix, 370);
    assert.equal(caseDe(bergfex, "saisonAdulte")?.prix, 1150);
    assert.equal(caseDe(bergfex, "saisonAdulte")?.dates, "20.12.25 - 10.04.26");
  });

  it("lit zéro comme une absence, pas comme un forfait gratuit", () => {
    // Skiinfo remplit de 0 ce qu'il ne publie pas : 938 grilles portent une
    // ligne « Forfait semaine » entièrement nulle.
    const g: Grille = { ...skiinfo, lignes: [{ libelle: "Forfait journée", prix: [0, 0, 0, 0] }], saison: null };
    assert.equal(caseDe(g, "jourAdulte"), null);
    assert.equal(caseDe({ ...g, lignes: [{ libelle: "1 Jour", prix: [null, null, null, null] }] }, "jourAdulte"), null);
  });

  it("rend les montants nommés du tableau rempli à la main", () => {
    const g: Grille = {
      source: "proprietaire",
      devise: "CHF",
      categories: [],
      lignes: [],
      nommes: { sixJoursAdulte: { prix: 339, libelle: "Forfait 6 jours" } },
    };
    assert.equal(caseDe(g, "sixJoursAdulte")?.prix, 339);
    assert.equal(caseDe(g, "sixJoursAdulte")?.categorie, "Adulte");
    assert.equal(caseDe(g, "jourAdulte"), null);
  });
});

describe("matriceDe", () => {
  it("prend chaque case à la première grille qui la publie", () => {
    const m = matriceDe([bergfex, skiinfo], "EUR");
    assert.equal(m.jourAdulte?.source, "bergfex");
    assert.equal(m.jourAdulte?.prix, 66);
    // bergfex ne publie pas de jeune ici ; l'enfant, si.
    assert.equal(m.sixJoursEnfant?.source, "bergfex");
    assert.equal(remplies(m), 6);
  });

  it("complète depuis la grille suivante ce que la première ne publie pas", () => {
    const partielle: Grille = { ...bergfex, lignes: [bergfex.lignes[0]!] };
    const m = matriceDe([partielle, skiinfo], "EUR");
    assert.equal(m.jourAdulte?.source, "bergfex");
    assert.equal(m.sixJoursAdulte?.source, "skiinfo");
    assert.equal(m.saisonEnfant?.source, "skiinfo");
    assert.equal(m.saisonEnfant?.prix, 370);
  });

  it("écarte les grilles d'une autre devise, et celles sans devise", () => {
    // Mettre une couronne à côté d'un euro dans un même tableau ferait lire
    // un prix pour un autre.
    const suisse: Grille = { ...skiinfo, devise: "CHF" };
    assert.equal(remplies(matriceDe([suisse], "EUR")), 0);
    assert.equal(remplies(matriceDe([{ ...skiinfo, devise: null }], null)), 0);
    assert.equal(remplies(matriceDe([suisse], "CHF")), 6);
  });

  it("rend une matrice complète de six cases, même vide", () => {
    const m = matriceDe([], "EUR");
    assert.deepEqual(Object.keys(m).sort(), [...POSTES].sort());
    assert.ok(POSTES.every((p) => m[p] === null));
    assert.equal(remplies(m), 0);
  });
});

describe("le relevé réel", () => {
  it("ne porte aucune case à zéro, et chacune nomme sa source et son libellé", async () => {
    const { vues } = (await import("./data/vuesDomaines.json", { with: { type: "json" } })).default as {
      vues: Record<string, { forfait: { devise: string | null; matrice?: Record<string, { prix: number; libelle: string; categorie: string; source: string } | null> } | null }>;
    };
    let cases = 0;
    let complets = 0;
    for (const [id, v] of Object.entries(vues)) {
      const m = v.forfait?.matrice;
      if (!m) continue;
      if (POSTES.every((p) => m[p])) complets++;
      for (const p of POSTES) {
        const c = m[p];
        if (!c) continue;
        cases++;
        assert.ok(c.prix > 0, `${id}/${p} : prix ${c.prix}`);
        assert.ok(c.libelle && c.categorie, `${id}/${p} : sans libellé ni colonne`);
        assert.ok(
          ["bergfex", "skiinfo", "skiresort", "officiel", "proprietaire"].includes(c.source),
          `${id}/${p} : source ${c.source}`,
        );
        // Une case ne vaut que dans la devise du forfait qui la porte.
        assert.ok(v.forfait?.devise, `${id}/${p} : une case sans devise`);
      }
    }
    assert.ok(cases > 3000, `${cases} cases`);
    assert.ok(complets >= 500, `${complets} domaines aux six tarifs`);
  });
});
