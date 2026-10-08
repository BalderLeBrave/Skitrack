import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { controlerGrille, tarifReference } from "./controle.ts";
import type { GrilleTarifaire, Periode, Tarif } from "./tarifsPeriode.ts";

const t = (jours: number, prix: number, patch: Partial<Tarif> = {}): Tarif => ({
  duree: { type: "jours", jours },
  libelleDuree: `${jours} jour${jours > 1 ? "s" : ""}`,
  categorie: "adulte",
  libelleCategorie: "Adulte",
  ages: null,
  prix,
  devise: "EUR",
  canal: "caisse",
  restriction: null,
  ...patch,
});

const periode = (
  libelle: string,
  tarifs: Tarif[],
  debut = "2026-12-19",
  fin = "2027-04-10",
): Periode => ({
  libelle,
  debut,
  fin,
  saisonEntiere: false,
  tarifs,
});

const grille = (periodes: Periode[], patch: Partial<GrilleTarifaire> = {}): GrilleTarifaire => ({
  id: "officiel:test:station:2026-27",
  saison: "2026-27",
  perimetre: { type: "station", cle: "station:test", nom: "Test" },
  stationIds: ["test"],
  periodes,
  source: {
    origine: "officiel",
    url: "https://test/tarifs",
    libelle: "Page tarifs officielle, test",
  },
  scrapeLe: "2026-09-30",
  confiance: "haute",
  notes: [],
  ...patch,
});

describe("contrôle qualité d'une grille", () => {
  it("une grille plausible passe telle quelle", () => {
    const g = grille([periode("Hiver", [t(1, 55), t(2, 105), t(6, 290)])]);
    const c = controlerGrille(g);
    assert.deepEqual(c.rejets, []);
    assert.deepEqual(c.alertes, []);
    assert.deepEqual(c.grille, g);
  });

  it("hors bornes : le tarif est rejeté et le rejet dit pourquoi", () => {
    const c = controlerGrille(
      grille([
        periode("Hiver", [
          t(1, 3.5),
          t(6, 290),
          t(6, 700, { categorie: "adulte", libelleCategorie: "Adulte 2" }),
        ]),
      ]),
    );
    assert.equal(c.rejets.length, 2);
    assert.match(c.rejets[0], /1 jour adulte à 3,5 €, hors des bornes 5 à 120 €/);
    assert.match(c.rejets[1], /6 jours adulte à 700 €, hors des bornes 30 à 600 €/);
    assert.deepEqual(
      c.grille?.periodes[0].tarifs.map((x) => x.prix),
      [290],
    );
  });

  it("les petites stations passent : journée à 6 €, 6 jours à 65 €", () => {
    const c = controlerGrille(grille([periode("Hiver", [t(1, 6), t(6, 65)])]));
    assert.deepEqual(c.rejets, []);
    assert.equal(c.grille?.periodes[0].tarifs.length, 2);
  });

  it("les bornes ne visent que l'adulte ordinaire", () => {
    const c = controlerGrille(
      grille([
        periode("Hiver", [
          t(1, 12, { categorie: "enfant", libelleCategorie: "Enfant" }),
          t(1, 10, { restriction: "promotion" }),
          t(6, 290),
        ]),
      ]),
    );
    assert.deepEqual(c.rejets, []);
  });

  it("un 6 jours pas plus cher que la journée : grille rejetée", () => {
    const c = controlerGrille(grille([periode("Hiver", [t(1, 60), t(6, 60)])]));
    assert.equal(c.grille, null);
    assert.match(
      c.rejets[0],
      /6 jours \(60 €\) pas plus cher que la journée \(60 €\) en Adulte ; grille rejetée/,
    );
  });

  it("une durée plus longue moins chère qu'une plus courte : ce tarif seul est rejeté", () => {
    const c = controlerGrille(grille([periode("Hiver", [t(1, 55), t(6, 290), t(21, 28)])]));
    assert.deepEqual(
      c.grille?.periodes[0].tarifs.map((x) => x.prix),
      [55, 290],
    );
    assert.match(c.rejets[0], /21 jours Adulte à 28 €, moins cher qu'une durée plus courte/);
  });

  it("plusieurs jours ou la saison moins chers que la journée, sous un autre libellé : rejetés seuls", () => {
    // Flaine, relevé du 4 octobre 2026 : une option lue comme un forfait.
    const c = controlerGrille(
      grille([
        periode("Saison entière", [
          t(1, 60.7, { libelleCategorie: "Normal De 15 à 74 ans" }),
          t(7, 29, { libelleDuree: "2 à 7 jours consécutifs", libelleCategorie: "Tarif unique" }),
          { ...t(1, 59, { libelleCategorie: "Tarif unique" }), duree: { type: "saison" }, libelleDuree: "Saison" },
          t(6, 330, { libelleCategorie: "Normal De 15 à 74 ans" }),
        ]),
      ]),
    );
    assert.deepEqual(
      c.grille?.periodes[0].tarifs.map((x) => x.prix),
      [60.7, 330],
    );
    assert.equal(c.rejets.length, 2);
    assert.match(c.rejets[0], /2 à 7 jours consécutifs Tarif unique à 29 €, moins cher que la journée adulte \(60,7 €\)/);
    assert.match(c.rejets[1], /Saison Tarif unique à 59 €/);
  });

  it("le plancher de la journée ne vise que l'adulte ordinaire", () => {
    const c = controlerGrille(
      grille([
        periode("Hiver", [
          t(1, 55),
          t(6, 40, { categorie: "enfant", libelleCategorie: "Enfant" }),
          t(6, 45, { restriction: "promotion" }),
          t(6, 290),
        ]),
      ]),
    );
    assert.deepEqual(c.rejets, []);
  });

  it("la haute saison moins chère que la basse : grille rejetée", () => {
    const c = controlerGrille(
      grille([
        periode("HAUTE SAISON", [t(1, 40), t(6, 200)]),
        periode("BASSE SAISON", [t(1, 45), t(6, 220)], "2027-03-20", "2027-04-11"),
      ]),
    );
    assert.equal(c.grille, null);
    assert.match(
      c.rejets[0],
      /moins cher en « HAUTE SAISON » \(40 €\) qu'en « BASSE SAISON » \(45 €\)/,
    );
  });

  it("un écart de plus de 30 % avec la grille précédente est signalé, pas rejeté", () => {
    const precedente = grille([periode("Saison entière", [t(6, 335)])], {
      saison: "2026-27",
      confiance: "faible",
      source: { origine: "catalogue", url: null, libelle: "Catalogue des forfaits" },
    });
    const c = controlerGrille(grille([periode("Hiver", [t(1, 78), t(6, 468)])]), precedente);
    assert.equal(c.alertes.length, 1);
    assert.match(c.alertes[0], /écart de 40 % sur le 6 jours adulte/);
    assert.equal(c.grille?.confiance, "moyenne");
    assert.ok(c.grille?.notes.some((n) => n.startsWith("Écart de 40 %")));
    assert.deepEqual(
      controlerGrille(grille([periode("Hiver", [t(6, 360)])]), precedente).alertes,
      [],
    );
  });

  it("le tarif de référence : le 6 jours adulte le plus élevé, à défaut la journée", () => {
    assert.deepEqual(
      tarifReference(grille([periode("A", [t(6, 300)]), periode("B", [t(6, 350)])])),
      { jours: 6, prix: 350 },
    );
    assert.deepEqual(tarifReference(grille([periode("A", [t(1, 50)])])), { jours: 1, prix: 50 });
  });
});
