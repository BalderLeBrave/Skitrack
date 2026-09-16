import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appliquer, critereBloquant, predicats, SEUILS } from "./filtres.ts";
import { FILTERS_INITIAL, type Filters } from "./parcours.ts";
import { STATIONS } from "./stations.ts";

function filtres(patch: Partial<Filters> = {}): Filters {
  return { ...FILTERS_INITIAL, col: { ...FILTERS_INITIAL.col }, chips: {}, ...patch };
}

describe("prédicats de recherche", () => {
  it("l'altitude minimale porte sur le village, pas sur le sommet du domaine", () => {
    const preds = predicats({ q: "", massif: null, unit: "pct", filters: filtres({ v: 1800 }) });
    const retenues = appliquer(STATIONS, preds);
    assert.ok(retenues.length > 0, "le référentiel compte des villages à 1 800 m");
    for (const s of retenues) {
      assert.ok(s.villageM >= 1800, `${s.name} : village à ${s.villageM} m`);
    }
    // Le sommet ne suffit pas : une station haut perchée au village est rare,
    // une station au domaine haut ne l'est pas.
    const parSommet = STATIONS.filter((s) => (s.maxM ?? 0) >= 1800);
    assert.ok(
      parSommet.length > retenues.length * 2,
      "filtrer sur le sommet retiendrait bien plus de stations : les deux critères ne se confondent pas",
    );
  });

  it("un seuil actif écarte une station dont le champ n'est pas mesuré", () => {
    const preds = predicats({ q: "", massif: null, unit: "pct", filters: filtres({ km: 300 }) });
    for (const s of appliquer(STATIONS, preds)) {
      assert.notEqual(s.pistesKm, null);
    }
  });

  it("la recherche par nom ignore les accents", () => {
    const preds = predicats({ q: "megeve", massif: null, unit: "pct", filters: filtres() });
    const noms = appliquer(STATIONS, preds).map((s) => s.name);
    assert.ok(noms.some((n) => n.startsWith("Megève")), noms.join(" · "));
  });

  it("un filtre au repos n'écarte rien", () => {
    const preds = predicats({ q: "", massif: null, unit: "pct", filters: filtres() });
    assert.equal(preds.length, 0);
    assert.equal(appliquer(STATIONS, preds).length, STATIONS.length);
  });

  it("nomme le critère le plus restrictif quand le résultat est vide", () => {
    // Un village à 1 800 m laisse des stations ; un forfait à 10 €, aucune.
    const preds = predicats({
      q: "",
      massif: null,
      unit: "pct",
      filters: filtres({ v: 1800, pass: 10 }),
    });
    assert.equal(appliquer(STATIONS, preds).length, 0);
    const bloquant = critereBloquant(STATIONS, preds);
    assert.ok(bloquant, "un critère doit être désigné");
    assert.equal(bloquant.pred.id, "pass");
    assert.ok(bloquant.restantes > 0);
  });

  it("ne désigne aucun critère quand en retirer un ne suffirait pas", () => {
    // Village à 2 400 m et forfait à 10 € : ni l'un ni l'autre seul ne rend
    // quoi que ce soit, et l'écran doit le dire plutôt que d'en accuser un.
    const preds = predicats({
      q: "",
      massif: null,
      unit: "pct",
      filters: filtres({ v: 2400, pass: 10 }),
    });
    assert.equal(appliquer(STATIONS, preds).length, 0);
    assert.equal(critereBloquant(STATIONS, preds), null);
  });

  it("les bornes des curseurs sont déclarées une seule fois", () => {
    const cles = SEUILS.map((s) => s.k);
    assert.deepEqual(cles, ["v", "lo", "hi", "km", "pass"]);
    assert.equal(new Set(cles).size, cles.length);
  });
});

describe("un geste, un jeton", () => {
  it("le texte qui redit le massif ne fait pas un second prédicat", () => {
    const preds = predicats({ q: "Vanoise", massif: "Vanoise", unit: "pct", filters: filtres() });
    assert.deepEqual(
      preds.map((p) => p.id),
      ["massif"],
    );
  });

  it("le repli du texte ne dépend ni des accents ni de la casse", () => {
    const preds = predicats({ q: "  vanoise ", massif: "Vanoise", unit: "pct", filters: filtres() });
    assert.deepEqual(
      preds.map((p) => p.id),
      ["massif"],
    );
  });

  it("un texte qui dit autre chose que le massif garde son prédicat", () => {
    const preds = predicats({ q: "Tignes", massif: "Vanoise", unit: "pct", filters: filtres() });
    assert.deepEqual(
      preds.map((p) => p.id),
      ["q", "massif"],
    );
  });

  it("sans massif posé, le texte garde son prédicat", () => {
    const preds = predicats({ q: "Vanoise", massif: null, unit: "pct", filters: filtres() });
    assert.deepEqual(
      preds.map((p) => p.id),
      ["q"],
    );
  });
});
