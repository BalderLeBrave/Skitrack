import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ForfaitVue } from "../monde/vues.ts";
import { budgetEurope, prixEurope } from "./europe.ts";

const c = (prix: number) => ({ prix, libelle: "x", categorie: "x", source: "skiinfo" as const });
const ZERMATT = {
  devise: "CHF",
  misAJour: "28 août 2025",
  matrice: {
    jourAdulte: c(96),
    jourEnfant: c(48),
    sixJoursAdulte: c(376),
    sixJoursEnfant: c(188),
    saisonAdulte: c(1750),
    saisonEnfant: null,
  },
} as unknown as ForfaitVue;

describe("forfaits d'un domaine européen", () => {
  it("un jour : la journée ; six : le forfait six jours ; entre les deux : les journées additionnées", () => {
    assert.equal(prixEurope(ZERMATT, 1, "Adulte")?.prix, 96);
    assert.equal(prixEurope(ZERMATT, 6, "Adulte")?.prix, 376);
    assert.equal(prixEurope(ZERMATT, 4, "Adulte")?.prix, 384);
    assert.equal(prixEurope(ZERMATT, 8, "Enfant")?.prix, 188 + 2 * 48);
  });

  it("le budget du groupe reste dans la devise publiée", () => {
    const b = budgetEurope(ZERMATT, 6, 2, 1)!;
    assert.equal(b.total, 2 * 376 + 188);
    assert.equal(b.devise, "CHF");
    assert.equal(b.enfantsAuTarifAdulte, false);
    assert.match(b.periode ?? "", /28 août 2025/);
    assert.match(budgetEurope(ZERMATT, 4, 2, 0)!.periode ?? "", /journées additionnées/);
  });

  it("sans tarif publié, sans devise ou sans jour de ski : rien", () => {
    assert.equal(budgetEurope(null, 6, 2, 0), null);
    assert.equal(budgetEurope({ ...ZERMATT, devise: null }, 6, 2, 0), null);
    assert.equal(budgetEurope(ZERMATT, null, 2, 0), null);
    assert.equal(budgetEurope({ ...ZERMATT, matrice: undefined }, 6, 2, 0), null);
  });
});
