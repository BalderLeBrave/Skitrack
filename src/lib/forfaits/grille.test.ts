import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  cle,
  durees,
  DUREES_BASE,
  fusionnerReleve,
  grilleVide,
  lire,
  saisonDe,
  SOURCE_ESTIMATION,
  useGrilles,
  CATEGORIES,
} from "./grille.ts";
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

  // La graine des Portes du Soleil telle que le serveur la rend : 292 €
  // relevés, journée et enfant nuls depuis le 26 septembre 2026.
  const PDS = emptyRow("avoriaz-1800", {
    j6: 292,
    sourceUrl: "https://www.avoriaz.com/",
    fetchedAt: "2026-08-11T12:00:00.000Z",
    status: "ok",
    parseKind: "referentiel",
  });

  it("journée et enfant calculés du 6 jours s'écrivent « estimé », jamais « relevé »", () => {
    const { grille } = fusionnerReleve(grilleVide("avoriaz-1800", "2026-27"), PDS);
    assert.deepEqual([lire(grille, 6, "adulte").prix, lire(grille, 6, "adulte").statut], [292, "releve"]);
    assert.deepEqual([lire(grille, 1, "adulte").prix, lire(grille, 1, "adulte").statut], [55, "estime"]);
    assert.deepEqual([lire(grille, 6, "enfant").prix, lire(grille, 6, "enfant").statut], [234, "estime"]);
    assert.equal(lire(grille, 1, "adulte").source, SOURCE_ESTIMATION);
    assert.equal(lire(grille, 1, "adulte").dateReleve, null, "une estimation n'a pas de date de relevé");
  });

  it("une grille déjà enregistrée perd ses « relevé » calculés, pas ses vrais relevés ni ses saisies", () => {
    // Ce que l'appareil garde d'avant : 55 € et 234 € écrits « relevé ».
    const avant = fusionnerReleve(grilleVide("avoriaz-1800", "2026-27"), {
      ...PDS,
      j1: 55,
      enf6: 234,
      parseKind: "referentiel",
    }).grille;
    assert.equal(lire(avant, 6, "enfant").statut, "releve");
    const apres = fusionnerReleve(avant, PDS).grille;
    assert.equal(lire(apres, 1, "adulte").statut, "estime");
    assert.equal(lire(apres, 6, "enfant").statut, "estime");

    const g = grilleVide("avoriaz-1800", "2026-27");
    const le1er = "2026-09-01T00:00:00.000Z";
    g.cases[cle(6, "enfant")] = {
      prix: 240,
      devise: "EUR",
      source: "https://www.avoriaz.com/tarifs",
      dateReleve: le1er,
      statut: "releve",
    };
    g.cases[cle(1, "adulte")] = {
      prix: 57,
      devise: "EUR",
      source: "saisie manuelle",
      dateReleve: le1er,
      statut: "manuel",
    };
    const garde = fusionnerReleve(g, PDS).grille;
    assert.deepEqual([lire(garde, 6, "enfant").prix, lire(garde, 6, "enfant").statut], [240, "releve"]);
    assert.deepEqual([lire(garde, 1, "adulte").prix, lire(garde, 1, "adulte").statut], [57, "manuel"]);
  });

  it("un 6 jours relevé depuis sur la page n'emporte pas l'estimation de l'ancien", () => {
    const lu = { ...PDS, j6: 300, parseKind: "table", sourceUrl: "https://www.avoriaz.com/tarifs" };
    const { grille } = fusionnerReleve(grilleVide("avoriaz-1800", "2026-27"), lu);
    assert.equal(lire(grille, 6, "adulte").prix, 300);
    assert.equal(lire(grille, 1, "adulte").prix, null);
    assert.equal(lire(grille, 6, "enfant").prix, null);
  });

  it("l'annulation défait une saisie, pas une frappe", () => {
    const { poser, annulerDerniere } = useGrilles.getState();
    // La case porte déjà 60 €, puis l'utilisateur tape « 345 » : `poser` est
    // appelée à chaque caractère.
    poser("t", "2026", 1, "adulte", 60);
    poser("t", "2026", 2, "adulte", 110); // on change de case : la saisie est close
    poser("t", "2026", 1, "adulte", 3);
    poser("t", "2026", 1, "adulte", 34);
    poser("t", "2026", 1, "adulte", 345);
    annulerDerniere();
    const g = useGrilles.getState().grilles["t|2026"];
    assert.equal(g?.cases[cle(1, "adulte")]?.prix, 60, "l'annulation doit rendre la valeur d'avant la saisie");
  });

  it("un relevé qui réécrit la case rend l'annulation caduque", () => {
    const { poser, appliquerReleve, annulerDerniere } = useGrilles.getState();
    // Case vide côté grille, puis un relevé la remplit : il n'y a plus rien à
    // défaire sur cette case, et la défaire retirerait le relevé.
    poser("u", "2026", 1, "adulte", 50);
    poser("u", "2026", 1, "adulte", null); // la case redevient vide
    appliquerReleve("u", "2026", emptyRow("u", { j1: 55, status: "ok" }));
    const apres = () => useGrilles.getState().grilles["u|2026"]?.cases[cle(1, "adulte")]?.prix;
    assert.equal(apres(), 55);
    annulerDerniere();
    assert.equal(apres(), 55, "le relevé ne doit pas être défait par une annulation périmée");
  });

  it("la dernière saisie n'est pas persistée", () => {
    // Sans `partialize`, `derniere` revenait du stockage local : au lancement
    // suivant, « Annuler la dernière saisie » défaisait une saisie de la veille
    // et pouvait écraser un relevé obtenu entre-temps. Le magasin persisté
    // n'étant pas gréé hors navigateur, l'invariant se lit à la source.
    const texte = readFileSync(new URL("./grille.ts", import.meta.url), "utf8");
    assert.match(texte, /partialize:\s*\(s\)\s*=>\s*\(\{\s*grilles:\s*s\.grilles\s*\}\)/);
  });
});
