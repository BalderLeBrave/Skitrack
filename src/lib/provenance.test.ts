import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dateLbl, instantLbl, periodeLbl, provenancePhrase, sourcePhrase, type SujetProvenance } from "./provenance.ts";

function sujet(extra: Partial<SujetProvenance> = {}): SujetProvenance {
  return { source: "Airbnb", total: 2231, proven: "", scannedAt: null, pricedCheckIn: null, pricedCheckOut: null, ...extra };
}

describe("dates en toutes lettres", () => {
  it("écrit le jour, le mois et l'année", () => {
    assert.equal(dateLbl("2026-09-03"), "3 septembre 2026");
    assert.equal(dateLbl("2027-02-01"), "1er février 2027");
    assert.equal(dateLbl("pas une date"), null);
  });
  it("factorise le mois et l'année d'une période", () => {
    assert.equal(periodeLbl("2027-02-06", "2027-02-13"), "du 6 au 13 février 2027");
    assert.equal(periodeLbl("2027-02-27", "2027-03-06"), "du 27 février au 6 mars 2027");
    assert.equal(periodeLbl("2026-12-30", "2027-01-06"), "du 30 décembre 2026 au 6 janvier 2027");
  });
  it("donne l'heure de Paris", () => {
    assert.equal(instantLbl(Date.UTC(2026, 8, 24, 12, 5)), "le 24 septembre 2026 à 14 h 05");
  });
});

describe("provenancePhrase", () => {
  it("relevé en direct : plateforme, heure et dates", () => {
    const p = provenancePhrase(
      sujet({
        proven: "StaySearchResult live 2027-02-06→2027-02-13",
        scannedAt: Date.UTC(2026, 8, 24, 12, 5),
        pricedCheckIn: "2027-02-06",
        pricedCheckOut: "2027-02-13",
      }),
    );
    assert.equal(p, "Prix relevé sur Airbnb le 24 septembre 2026 à 14 h 05, du 6 au 13 février 2027.");
  });

  it("relevé figé : date du relevé, voyageurs et GPS", () => {
    const p = provenancePhrase(
      sujet({ source: "Gîtes de France", total: 727.44, proven: "ITEA gites-web 2026-09-03, 6–13 fév. 2027, 8 pers. · GPS ITEA" }),
    );
    assert.equal(
      p,
      "Prix relevé sur Gîtes de France le 3 septembre 2026, pour 8 personnes. La position sur la carte est celle publiée par Gîtes de France.",
    );
  });

  it("les dates du séjour ne passent pas pour la date du relevé", () => {
    const p = provenancePhrase(sujet({ source: "Booking", proven: "Booking live 2027-02-06→2027-02-13" }));
    assert.equal(p, "Prix relevé sur Booking, du 6 au 13 février 2027.");
  });

  it("repli : dit qu'il n'y a rien eu en direct", () => {
    const p = provenancePhrase(
      sujet({
        source: "Gîtes de France",
        proven: "ITEA gites-web 2026-09-03, 6–13 fév. 2027, 8 pers. — repli relevé 3 sept. (live vide ou non branché)",
        scannedAt: Date.UTC(2026, 8, 24, 12, 5),
      }),
    );
    assert.equal(
      p,
      "Pas de résultat en direct sur Gîtes de France : ce prix est repris du relevé du 3 septembre 2026, pour 8 personnes.",
    );
  });

  it("centrale : nomme la centrale quand la trace la donne", () => {
    const p = provenancePhrase(
      sujet({ source: "Centrale", proven: "Tignes Réservation (Ingénie, tignes.example) 2027-02-06→2027-02-13, 8 pers." }),
    );
    assert.equal(p, "Prix relevé auprès de la centrale Tignes Réservation, pour 8 personnes, du 6 au 13 février 2027.");
  });

  it("comparateur et prix absent", () => {
    const p = provenancePhrase(sujet({ total: 0, proven: "CozyCozy Airbnb live 2027-02-06→2027-02-13" }));
    assert.equal(p, "Annonce relevée sur Airbnb via le comparateur CozyCozy, du 6 au 13 février 2027.");
  });
});

describe("sourcePhrase", () => {
  it("type, plateforme et référence", () => {
    assert.equal(
      sourcePhrase(sujet({ propertyType: "Appartement", platformId: "12345" })),
      "Logement de type « Appartement » proposé sur Airbnb (réf. 12345).",
    );
    assert.equal(sourcePhrase(sujet({ source: "Abritel" })), "Logement proposé sur Abritel.");
  });
  it("centrale nommée par la trace", () => {
    assert.equal(
      sourcePhrase(sujet({ source: "Centrale", proven: "Les Arcs (Arkiane, lesarcs.example) 2027-02-06→2027-02-13, 8 pers." })),
      "Logement proposé par la centrale Les Arcs.",
    );
  });
  it("centrale sans nom lisible", () => {
    assert.equal(
      sourcePhrase(sujet({ source: "Centrale", proven: "station-web Ingénie 2026-09-03" })),
      "Logement proposé par la centrale de réservation de la station.",
    );
  });
});
