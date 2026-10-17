import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { convertir, lireTauxBce, poserAffichage } from "./affichage.ts";
import { montant, montantCents } from "../devises.ts";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope><Cube><Cube time='2026-10-16'>
<Cube currency='USD' rate='1.1000'/><Cube currency='GBP' rate='0.8500'/><Cube currency='CHF' rate='0.9400'/>
</Cube></Cube></gesmes:Envelope>`;

describe("taux BCE et devise d'affichage", () => {
  afterEach(() => poserAffichage(null, null));

  it("lit le fichier quotidien de la BCE", () => {
    const t = lireTauxBce(XML);
    assert.equal(t?.date, "2026-10-16");
    assert.deepEqual(t?.parEuro, { USD: 1.1, GBP: 0.85, CHF: 0.94 });
    assert.equal(lireTauxBce("<html>"), null);
  });

  it("convertit par l'euro, et ne convertit pas sans devise choisie, ni vers elle-même, ni sans taux", () => {
    const t = lireTauxBce(XML)!;
    assert.equal(convertir(100, "EUR", t, "GBP"), 85);
    assert.ok(Math.abs(convertir(94, "CHF", t, "USD")! - 110) < 1e-9);
    assert.equal(convertir(100, "EUR", t, null), null);
    assert.equal(convertir(100, "GBP", t, "GBP"), null);
    assert.equal(convertir(100, "ISK", t, "EUR"), null, "un taux que la BCE ne publie pas");
  });

  it("sans devise choisie, un prix s'écrit dans la sienne ; choisie, converti et précédé de « ≈ »", () => {
    assert.equal(montant(96, "CHF"), "96 CHF");
    poserAffichage("EUR", lireTauxBce(XML));
    assert.match(montant(94, "CHF"), /^≈ 100\s€$/);
    assert.match(montantCents(12.5, "EUR")!, /^12,50\s€$/, "déjà en euros : inchangé");
    assert.equal(montant(null, "CHF"), "–");
  });
});
