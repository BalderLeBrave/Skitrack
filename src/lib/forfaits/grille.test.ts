import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cle, durees, DUREES_BASE, fusionnerReleve, grilleVide, lire, saisonDe, CATEGORIES } from "./grille.ts";
import { emptyRow } from "./store.ts";

const REL = emptyRow("tignes", {
  j1: 62,
  j6: 330,
  enf6: 264,
  sourceUrl: "https://exemple.test/tarifs",
  fetchedAt: "2026-09-14T10:00:00.000Z",
  status: "ok",
});

describe("grille tarifaire", () => {
  it("les catégories sont une constante partagée, sans doublon", () => {
    const cles = CATEGORIES.map((c) => c.cle);
    assert.deepEqual(cles, ["enfant", "adulte", "senior"]);
    assert.equal(new Set(cles).size, cles.length);
  });

  it("les durées de base vont de la demi-journée à sept jours, puis s'étendent", () => {
    assert.deepEqual([...DUREES_BASE], [0.5, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(durees(7), [0.5, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(durees(10).slice(-3), [8, 9, 10]);
    assert.equal(durees(999).at(-1), 21, "l'extension est bornée");
  });

  it("la saison bascule au 1er août", () => {
    assert.equal(saisonDe(new Date("2026-09-14T00:00:00Z")), "2026-27");
    assert.equal(saisonDe(new Date("2027-07-31T00:00:00Z")), "2026-27");
    assert.equal(saisonDe(new Date("2027-08-01T00:00:00Z")), "2027-28");
  });

  it("un relevé remplit les cases qu'il connaît, avec sa source et sa date", () => {
    const { grille, conflits } = fusionnerReleve(grilleVide("tignes", "2026-27"), REL);
    assert.deepEqual(conflits, []);
    assert.equal(lire(grille, 6, "adulte").prix, 330);
    assert.equal(lire(grille, 6, "adulte").statut, "releve");
    assert.equal(lire(grille, 6, "adulte").source, "https://exemple.test/tarifs");
    assert.equal(lire(grille, 6, "enfant").prix, 264);
    assert.equal(lire(grille, 1, "adulte").prix, 62);
    // Ce que l'extraction ne sait pas lire reste vide, il n'est pas deviné.
    assert.equal(lire(grille, 3, "adulte").prix, null);
    assert.equal(lire(grille, 6, "senior").statut, "absent");
  });

  it("une valeur saisie à la main n'est jamais écrasée par un relevé", () => {
    const g = grilleVide("tignes", "2026-27");
    g.cases[cle(6, "adulte")] = {
      prix: 299,
      devise: "EUR",
      source: "saisie manuelle",
      dateReleve: "2026-09-01T00:00:00.000Z",
      statut: "manuel",
    };
    const { grille, conflits } = fusionnerReleve(g, REL);
    assert.equal(lire(grille, 6, "adulte").prix, 299, "la saisie tient");
    assert.equal(lire(grille, 6, "adulte").statut, "manuel");
    assert.deepEqual(conflits, [{ duree: 6, categorie: "adulte", ancien: 299, nouveau: 330 }]);
    // Les autres cases, elles, se remplissent normalement.
    assert.equal(lire(grille, 6, "enfant").prix, 264);
  });

  it("une saisie manuelle identique au relevé ne produit pas de conflit", () => {
    const g = grilleVide("tignes", "2026-27");
    g.cases[cle(6, "adulte")] = {
      prix: 330,
      devise: "EUR",
      source: "saisie manuelle",
      dateReleve: "2026-09-01T00:00:00.000Z",
      statut: "manuel",
    };
    assert.deepEqual(fusionnerReleve(g, REL).conflits, []);
  });

  it("une estimation est marquée comme telle", () => {
    const est = emptyRow("x", { j6: 300, status: "estimé", fetchedAt: null });
    const { grille } = fusionnerReleve(grilleVide("x", "2026-27"), est);
    assert.equal(lire(grille, 6, "adulte").statut, "estime");
  });
});
