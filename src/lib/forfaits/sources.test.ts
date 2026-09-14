import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ECHECS_AVANT_ARRET,
  echec,
  noter,
  reactiver,
  refuse,
  sourceNeuve,
  succes,
  tentable,
  JOURNAL_MAX,
} from "./sources.ts";

const T = "2026-09-14T10:00:00.000Z";

describe("voie de récupération d'un tarif", () => {
  it("une source neuve est tentable automatiquement", () => {
    assert.equal(tentable(sourceNeuve("tignes")), true);
  });

  it("trois échecs consécutifs désactivent la source", () => {
    let e = sourceNeuve("tignes");
    for (let i = 1; i < ECHECS_AVANT_ARRET; i += 1) {
      e = echec(e, "HTTP 500", T);
      assert.equal(e.desactivee, false, `${i} échec(s) ne doit pas désactiver`);
      assert.equal(tentable(e), true);
    }
    e = echec(e, "HTTP 500", T);
    assert.equal(e.desactivee, true);
    assert.equal(tentable(e), false);
  });

  it("un relevé réussi remet le compteur à zéro", () => {
    let e = echec(echec(sourceNeuve("tignes"), "x", T), "x", T);
    assert.equal(e.echecs, 2);
    e = succes(e, "https://exemple.test/tarifs", T);
    assert.equal(e.echecs, 0);
    assert.equal(e.desactivee, false);
    assert.equal(e.url, "https://exemple.test/tarifs");
  });

  it("un 403 ferme la voie automatique sans la compter comme un échec à réessayer", () => {
    const e = refuse(sourceNeuve("tignes"), "https://exemple.test/tarifs", "HTTP 403", T);
    assert.equal(e.voie, "manuelle");
    assert.equal(e.echecs, 0, "un refus n'est pas une panne à réessayer");
    assert.equal(e.desactivee, false);
    assert.equal(tentable(e), false, "la source n'est plus relancée automatiquement");
    assert.equal(e.url, "https://exemple.test/tarifs", "le lien officiel est conservé pour la saisie");
  });

  it("la réactivation manuelle relance une source désactivée", () => {
    let e = sourceNeuve("tignes");
    for (let i = 0; i < ECHECS_AVANT_ARRET; i += 1) e = echec(e, "x", T);
    assert.equal(tentable(e), false);
    e = reactiver(e);
    assert.equal(e.desactivee, false);
    assert.equal(tentable(e), true);
  });

  it("le journal est borné et garde la tentative la plus récente en tête", () => {
    let e = sourceNeuve("tignes");
    for (let i = 0; i < JOURNAL_MAX + 5; i += 1) {
      e = noter(e, { at: T, url: `https://exemple.test/${i}`, issue: "panne", statut: 500, message: `n°${i}` });
    }
    assert.equal(e.journal.length, JOURNAL_MAX);
    assert.equal(e.journal[0]?.message, `n°${JOURNAL_MAX + 4}`);
  });
});
