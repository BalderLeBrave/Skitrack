import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_DECOUVERTES, ordreCandidats, pagesDecouvertes } from "./pagesTarifs.ts";
import { forfaitDepuisFirecrawl } from "./firecrawlForfait.ts";

describe("pages tarifs découvertes par sitemap", () => {
  it("retenue, puis découvertes, puis devinées, sans doublon", () => {
    assert.deepEqual(
      ordreCandidats("https://x.fr/forfaits", ["https://x.fr/ski/tarifs", "https://x.fr/forfaits"], ["https://x.fr/", "https://x.fr/forfaits"]),
      ["https://x.fr/forfaits", "https://x.fr/ski/tarifs", "https://x.fr/"],
    );
  });

  it("borne et filtre les pages d'un domaine", () => {
    const d = { at: null, source: "test", pages: { a: ["https://a.fr/1", "ftp://a.fr/2", "https://a.fr/3", "https://a.fr/4", "https://a.fr/5", "https://a.fr/6"] } };
    const p = pagesDecouvertes("a", d);
    assert.equal(p.length, MAX_DECOUVERTES);
    assert.ok(!p.some((u) => u.startsWith("ftp:")));
    assert.deepEqual(pagesDecouvertes("inconnu", d), []);
  });
});

describe("forfait lu par Firecrawl", () => {
  it("garde une grille plausible", () => {
    assert.deepEqual(forfaitDepuisFirecrawl({ adulte_1_jour: 65, adulte_6_jours: "335,00", enfant_6_jours: 268 }), {
      j1: 65,
      j6: 335,
      enf6: 268,
      kind: "firecrawl",
    });
  });
  it("écarte les « à partir de » et les incohérences", () => {
    assert.equal(forfaitDepuisFirecrawl({ adulte_1_jour: 39, a_partir_de: true }), null);
    assert.deepEqual(forfaitDepuisFirecrawl({ adulte_1_jour: 65, adulte_6_jours: 60, enfant_6_jours: 500 }), {
      j1: 65,
      j6: null,
      enf6: 500,
      kind: "firecrawl",
    });
    assert.equal(forfaitDepuisFirecrawl({ adulte_1_jour: 5 }), null);
  });
});

import { grilleCoherente } from "./pagesTarifs.ts";
describe("grille cohérente", () => {
  it("écarte les lectures relevées le 11 octobre 2026", () => {
    assert.equal(grilleCoherente({ j1: 67, j6: 90, enf6: null }), false);
    assert.equal(grilleCoherente({ j1: 46, j6: 46, enf6: null }), false);
    assert.equal(grilleCoherente({ j1: 65, j6: 335, enf6: 400 }), false);
    assert.equal(grilleCoherente({ j1: 21, j6: null, enf6: null }), false, "La Plagne : pas une journée adulte");
    assert.equal(grilleCoherente({ j1: 399, j6: null, enf6: null }), false, "Grand Tourmalet : une saison");
  });
  it("garde une grille plausible ou partielle", () => {
    assert.equal(grilleCoherente({ j1: 65, j6: 335, enf6: 268 }), true);
    assert.equal(grilleCoherente({ j1: 46, j6: null, enf6: null }), true);
  });
});
