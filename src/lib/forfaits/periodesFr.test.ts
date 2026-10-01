import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { periodeDepuisTexte, plagesEcrites, saisonsCitees, zonesCitees } from "./periodesFr.ts";

const S = "2026-27";
const plages = (t: string) => periodeDepuisTexte(t, S)?.plages ?? null;

describe("périodes écrites en français", () => {
  it("dates en toutes lettres, mois partagé, année déduite de la saison", () => {
    assert.deepEqual(plages("Du 21 au 27 novembre 2026"), [
      { debut: "2026-11-21", fin: "2026-11-27" },
    ]);
    assert.deepEqual(plages("Du 28 novembre au 11 décembre 2026"), [
      { debut: "2026-11-28", fin: "2026-12-11" },
    ]);
    assert.deepEqual(plages("du 20 décembre au 2 janvier"), [
      { debut: "2026-12-20", fin: "2027-01-02" },
    ]);
    assert.deepEqual(plages("19 déc. 2026 – 08 janv. 2027"), [
      { debut: "2026-12-19", fin: "2027-01-08" },
    ]);
    assert.deepEqual(plages("09 janv. – 05 févr. 2027"), [
      { debut: "2027-01-09", fin: "2027-02-05" },
    ]);
  });

  it("dates numériques, jours de semaine et plusieurs plages sur une ligne", () => {
    assert.deepEqual(
      plages(
        "Haute saison : du Samedi 19/12/26 au Samedi 02/01/27 – du Samedi 06/02/27 au Samedi 06/03/27",
      ),
      [
        { debut: "2026-12-19", fin: "2027-01-02" },
        { debut: "2027-02-06", fin: "2027-03-06" },
      ],
    );
    assert.deepEqual(plages("MOYENNE SAISON Du 12/12 au 18/12/26 et du 20/03/27 au 26/03/27"), [
      { debut: "2026-12-12", fin: "2026-12-18" },
      { debut: "2027-03-20", fin: "2027-03-26" },
    ]);
    assert.deepEqual(plages("20.12.25 - 03.01.26 07.02.26 - 07.03.26"), [
      { debut: "2025-12-20", fin: "2026-01-03" },
      { debut: "2026-02-07", fin: "2026-03-07" },
    ]);
  });

  it("bornes ouvertes : ouverture, fermeture, à partir de, avant le", () => {
    assert.deepEqual(plages("de l’ouverture au Vendredi 18/12/26"), [
      { debut: "2026-08-01", fin: "2026-12-18" },
    ]);
    assert.deepEqual(plages("du Dimanche 07/03/27 à la fermeture de la station"), [
      { debut: "2027-03-07", fin: "2027-07-31" },
    ]);
    assert.deepEqual(plages("20 mars – fin de saison"), [
      { debut: "2027-03-20", fin: "2027-07-31" },
    ]);
    assert.deepEqual(plages("Avant le 19 décembre 2026"), [
      { debut: "2026-08-01", fin: "2026-12-18" },
    ]);
    assert.equal(periodeDepuisTexte("Avant le 19 décembre 2026", S)?.ouverte, true);
    assert.equal(periodeDepuisTexte("Du 21 au 27 novembre 2026", S)?.ouverte, false);
  });

  it("une date limite d'achat n'est pas une période de ski", () => {
    assert.equal(plages("Réservez avant le 30 novembre : jusqu'à -15%"), null);
    assert.deepEqual(plagesEcrites("Early booking jusqu'au 30/11/2026", S), []);
  });

  it("un âge n'est pas une date", () => {
    assert.equal(plages("ENFANT (5/11 inclus)"), null);
    assert.equal(plages("ADULTE (12/74 ans inclus)"), null);
    assert.equal(plages("Enfant / Sénior 8 – 18 et 65 – 74 ans"), null);
  });

  it("vacances nommées, par le calendrier scolaire, zones comprises", () => {
    const hiver = periodeDepuisTexte("Vacances de février", S);
    assert.deepEqual(hiver, {
      plages: [{ debut: "2027-02-06", fin: "2027-03-07" }],
      nature: "vacances",
      ouverte: false,
    });
    assert.deepEqual(plages("vacances de Noël"), [{ debut: "2026-12-19", fin: "2027-01-03" }]);
    assert.deepEqual(plages("vacances d'hiver zone B"), [
      { debut: "2027-02-20", fin: "2027-03-07" },
    ]);
    assert.deepEqual(zonesCitees("zones A et C"), ["A", "C"]);
    const hors = plages("hors vacances scolaires")!;
    assert.ok(hors.some((p) => p.debut === "2027-01-04" && p.fin === "2027-02-05"));
    assert.ok(!hors.some((p) => p.debut <= "2027-02-15" && p.fin >= "2027-02-15"));
  });

  it("« haute saison » sans date ne se traduit pas", () => {
    assert.equal(periodeDepuisTexte("HAUTE SAISON", S), null);
    assert.equal(periodeDepuisTexte("Hiver 2026-2027", S), null);
  });

  it("les saisons citées sur une page", () => {
    assert.deepEqual(
      saisonsCitees("LES TARIFS hiver2026-2027 ; Ouverture 2025-2026 ; saison 26/27"),
      ["2025-26", "2026-27"],
    );
    assert.deepEqual(saisonsCitees("du 2026-2028"), []);
  });
});
