import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { etatTarif, forfaitConfirmLabel } from "./age.ts";
import { emptyRow, markFailure } from "./store.ts";

const MAINTENANT = Date.parse("2026-09-14T12:00:00.000Z");
const RELEVE = "2026-08-11T12:00:00.000Z";

describe("ce qu'un écran écrit d'un tarif", () => {
  it("sépare fraîcheur, fiabilité et cause technique", () => {
    const row = markFailure(
      emptyRow("tignes", { j6: 330, fetchedAt: RELEVE, status: "ok" }),
      "HTTP 403",
      "2026-09-14T11:00:00.000Z",
    );
    const e = etatTarif(row, MAINTENANT);
    assert.match(e.fraicheur ?? "", /relevé le 11\/08\/2026/);
    assert.match(e.fraicheur ?? "", /il y a \d+ (jours|mois)/);
    assert.equal(e.fiabiliteLbl, "tarif à confirmer");
    assert.equal(e.cause, "HTTP 403");
    // La cause n'entre jamais dans la fraîcheur ni dans la fiabilité.
    assert.ok(!e.fraicheur?.includes("403"));
    assert.ok(!e.fiabiliteLbl.includes("403"));
  });

  it("un tarif ancien reste affiché avec sa date, il n'est pas remplacé par une erreur", () => {
    const row = markFailure(
      emptyRow("tignes", { j6: 330, fetchedAt: RELEVE, status: "ok" }),
      "HTTP 500",
      "2026-09-14T11:00:00.000Z",
    );
    assert.equal(row.j6, 330, "le montant survit à l'échec");
    assert.equal(row.fetchedAt, RELEVE, "la date de relevé ne bouge pas");
    assert.equal(etatTarif(row, MAINTENANT).chiffre, true);
  });

  it("un tarif jamais obtenu invite à le saisir, sans code HTTP", () => {
    const row = markFailure(emptyRow("x"), "HTTP 403", "2026-09-14T11:00:00.000Z");
    const e = etatTarif(row, MAINTENANT);
    assert.equal(e.fiabiliteLbl, "tarif à saisir");
    assert.equal(e.fraicheur, null);
    assert.ok(!e.fiabiliteLbl.includes("403"));
    assert.equal(e.cause, "HTTP 403", "la cause part au détail repliable");
  });

  it("un échec ne promeut pas une estimation en relevé", () => {
    const est = emptyRow("x", { j6: 300, status: "estimé" });
    assert.equal(markFailure(est, "HTTP 500", "2026-09-14T11:00:00.000Z").status, "estimé");
  });

  it("une saisie manuelle reste une saisie manuelle", () => {
    const row = emptyRow("x", { j6: 299, status: "manuel", locked: true, fetchedAt: RELEVE });
    assert.equal(etatTarif(row, MAINTENANT).fiabiliteLbl, "tarif saisi manuellement");
    assert.equal(markFailure(row, "HTTP 500", RELEVE).status, "manuel");
  });

  it("un tarif confirmé n'affiche aucune mention de fiabilité", () => {
    const row = emptyRow("x", { j6: 330, status: "ok", fetchedAt: RELEVE });
    assert.equal(forfaitConfirmLabel(row, MAINTENANT), null);
  });

  // Ce que `refresh.server.ts` fait d'une graine du catalogue : la ligne porte
  // ses prix, « ok », `parseKind` « referentiel ».
  const graine = (slug: string, j1: number | null, j6: number, enf6: number | null) =>
    emptyRow(slug, { j1, j6, enf6, fetchedAt: RELEVE, status: "ok", parseKind: "referentiel" });

  it("un 6 jours seul relevé, journée et enfant estimés, ne se dit pas « tarif confirmé »", () => {
    // Portes du Soleil : 292 € relevés ; 55 € et 234 € étaient calculés.
    const e = etatTarif(graine("avoriaz-1800", null, 292, null), MAINTENANT);
    assert.equal(e.fiabilite, "partiel");
    assert.notEqual(e.fiabiliteLbl, "tarif confirmé");
    assert.match(e.fiabiliteLbl, /estimés/);
    assert.match(e.fraicheur ?? "", /relevé le 11\/08\/2026/, "le 6 jours garde sa date");
    assert.equal(forfaitConfirmLabel(graine("avoriaz-1800", null, 292, null), MAINTENANT), e.fiabiliteLbl);
  });

  it("une graine dont tous les prix sont relevés reste confirmée", () => {
    // Espace Killy : ses prix ne suivent pas les rapports du calcul.
    assert.equal(etatTarif(graine("tignes-val-d-isere", 65, 335, 268), MAINTENANT).fiabilite, "confirme");
  });

  it("un relevé de la page officielle est confirmé, même pour un domaine estimé", () => {
    const lu = emptyRow("avoriaz-1800", {
      j1: 58,
      j6: 300,
      enf6: 240,
      fetchedAt: RELEVE,
      status: "ok",
      parseKind: "table",
    });
    assert.equal(etatTarif(lu, MAINTENANT).fiabilite, "confirme");
  });
});
