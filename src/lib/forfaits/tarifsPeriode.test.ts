import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { saisonDe } from "./grille.ts";
import {
  anomaliesGrille,
  bornesSaison,
  grillesDeStation,
  LIBELLE_SAISON_ENTIERE,
  periodeSaisonEntiere,
  saisonDeJour,
  type GrilleTarifaire,
  type Tarif,
} from "./tarifsPeriode.ts";

const sixJoursAdulte = (prix: number): Tarif => ({
  duree: { type: "jours", jours: 6 },
  libelleDuree: "6 jours",
  categorie: "adulte",
  libelleCategorie: "Adulte",
  ages: null,
  prix,
  devise: "EUR",
  canal: "caisse",
  restriction: null,
});

function grille(patch: Partial<GrilleTarifaire>): GrilleTarifaire {
  return {
    id: "g",
    saison: "2026-27",
    perimetre: { type: "station", cle: "station:meribel", nom: "Méribel" },
    stationIds: ["meribel"],
    periodes: [periodeSaisonEntiere("2026-27", [sixJoursAdulte(356)])!],
    source: { origine: "officiel", url: "https://example.test/tarifs", libelle: "site officiel" },
    scrapeLe: "2026-09-30",
    confiance: "haute",
    notes: [],
    ...patch,
  };
}

describe("grille tarifaire : saison", () => {
  it("la saison bascule le 1er août, comme saisonDe", () => {
    for (const d of ["2026-07-31", "2026-08-01", "2026-12-20", "2027-02-06", "2027-04-30"]) {
      assert.equal(saisonDeJour(d), saisonDe(new Date(`${d}T12:00:00Z`)), d);
    }
    assert.equal(saisonDeJour("2026-07-31"), "2025-26");
    assert.equal(saisonDeJour("2026-08-01"), "2026-27");
    assert.equal(saisonDeJour("pas une date"), null);
  });

  it("les bornes d'une saison vont du 1er août au 31 juillet", () => {
    assert.deepEqual(bornesSaison("2026-27"), { debut: "2026-08-01", fin: "2027-07-31" });
    assert.deepEqual(bornesSaison("2099-00"), { debut: "2099-08-01", fin: "2100-07-31" });
    assert.equal(bornesSaison("2026-2027"), null);
    assert.equal(bornesSaison("2026-28"), null);
  });

  it("une période « saison entière » couvre toute la saison et le dit", () => {
    const p = periodeSaisonEntiere("2026-27", [sixJoursAdulte(300)])!;
    assert.equal(p.libelle, LIBELLE_SAISON_ENTIERE);
    assert.equal(p.saisonEntiere, true);
    assert.equal(p.debut, "2026-08-01");
    assert.equal(p.fin, "2027-07-31");
  });
});

describe("grille tarifaire : périmètre", () => {
  it("une station porte à la fois le forfait de la station et celui du domaine relié", () => {
    const station = grille({ id: "meribel" });
    const domaine = grille({
      id: "3v",
      perimetre: { type: "domaine", cle: "domaine:3-vallees", nom: "Les 3 Vallées" },
      stationIds: ["meribel", "val-thorens"],
      periodes: [periodeSaisonEntiere("2026-27", [sixJoursAdulte(421)])!],
    });
    const ailleurs = grille({ id: "tignes", stationIds: ["tignes"] });
    const g = grillesDeStation("meribel", [station, domaine, ailleurs]);
    assert.deepEqual(
      g.map((x) => x.perimetre.type),
      ["station", "domaine"],
    );
    assert.deepEqual(
      grillesDeStation("val-thorens", [station, domaine, ailleurs]).map((x) => x.id),
      ["3v"],
    );
  });
});

describe("grille tarifaire : contrôle de forme", () => {
  it("une grille correcte ne signale rien", () => {
    assert.deepEqual(anomaliesGrille(grille({})), []);
  });

  it("signale une période inversée, hors saison, vide ou un prix nul", () => {
    const g = grille({
      periodes: [
        {
          libelle: "inversée",
          debut: "2027-01-10",
          fin: "2027-01-01",
          saisonEntiere: false,
          tarifs: [sixJoursAdulte(300)],
        },
        {
          libelle: "hors saison",
          debut: "2027-12-20",
          fin: "2028-01-02",
          saisonEntiere: false,
          tarifs: [sixJoursAdulte(300)],
        },
        {
          libelle: "vide",
          debut: "2027-01-01",
          fin: "2027-01-02",
          saisonEntiere: false,
          tarifs: [],
        },
        {
          libelle: "gratuit",
          debut: "2027-01-01",
          fin: "2027-01-02",
          saisonEntiere: false,
          tarifs: [sixJoursAdulte(0)],
        },
      ],
    });
    const a = anomaliesGrille(g).join(" | ");
    assert.match(a, /« inversée » : début après la fin/);
    assert.match(a, /« hors saison » : hors de la saison 2026-27/);
    assert.match(a, /« vide » : aucun tarif/);
    assert.match(a, /« gratuit » : prix non positif/);
  });

  it("signale une saison illisible et une grille sans période", () => {
    const a = anomaliesGrille(grille({ saison: "2026", periodes: [] }));
    assert.ok(a.some((x) => x.startsWith("saison illisible")));
    assert.ok(a.includes("aucune période"));
  });
});
