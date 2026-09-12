import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLASSEUR, CLASSEUR_DUPLICATES, CLASSEUR_ID_COLLISIONS, DOMAIN_FIXES } from "./classeur.ts";
import {
  addedByClasseur,
  DEPOT_IDS,
  isDepotId,
  outsideClasseur,
  stationFromStoredId,
  storedIdOfStation,
} from "./stationMigration.ts";
import { DEPOT_STATIONS, STATIONS } from "./stations.ts";

describe("bascule vers le classeur", () => {
  it("volumes : 284 lignes de classeur, 195 appariées, 36 hors classeur, 320 au total", () => {
    assert.equal(CLASSEUR.length, 284);
    // Le doublon « Chamonix-Mont-Blanc » a été retiré du classeur source : si
    // cette liste se remplit, une ligne en double est réapparue.
    assert.deepEqual(CLASSEUR_DUPLICATES, []);
    // « Praloup » du classeur est une autre ligne que « Pra Loup 1600 », déjà
    // appariée. Le suffixe est le code INSEE de la commune, stable.
    assert.deepEqual(CLASSEUR_ID_COLLISIONS, ["Praloup → praloup-04226"]);
    assert.equal(CLASSEUR.filter((e) => e.depotId).length, 195);
    assert.equal(addedByClasseur().length, 89);
    assert.equal(outsideClasseur().length, 36);
    assert.equal(STATIONS.length, 320);
    assert.equal(DEPOT_STATIONS.length, 231);
  });

  it("aucun identifiant du dépôt ne bouge : les 231 résolvent encore", () => {
    assert.equal(DEPOT_IDS.length, 231);
    for (const id of DEPOT_IDS) {
      const s = stationFromStoredId(id);
      assert.ok(s, `${id} ne résout plus`);
      assert.equal(s.id, id);
      assert.equal(storedIdOfStation(s), id);
      assert.equal(s.origin, "depot");
    }
  });

  it("aucune station ajoutée ne réutilise un identifiant du dépôt", () => {
    for (const s of addedByClasseur()) {
      assert.equal(isDepotId(s.id), false, s.id);
      assert.equal(storedIdOfStation(s), null, s.id);
    }
  });

  it("identifiants uniques sur tout le référentiel", () => {
    assert.equal(new Set(STATIONS.map((s) => s.id)).size, STATIONS.length);
  });

  it("le-granier-vallee-des-entremonts survit, distinct du « Le Granier » du classeur", () => {
    const granier = stationFromStoredId("le-granier-vallee-des-entremonts");
    assert.ok(granier, "la station a disparu du référentiel");
    assert.equal(granier.origin, "depot");
    assert.equal(granier.inClasseur, false);
    // Ce qu'elle garde.
    assert.ok(granier.demM != null);
    assert.equal(granier.lat, 45.4632);
    // Ce qu'elle n'a pas, faute de domaine rattaché — affiché, pas comblé.
    assert.equal(granier.domain, null);
    assert.equal(granier.lifts, null);
    assert.equal(granier.colorShare, null);
    assert.equal(granier.distToPisteKm, null);
    // La ligne homonyme du classeur est une autre station, à 9,2 km.
    const other = STATIONS.filter((s) => s.name === "Le Granier" && s.id !== granier.id);
    assert.equal(other.length, 1);
    assert.equal(other[0].origin, "classeur");
    const km = Math.hypot((other[0].lat - granier.lat) * 111, (other[0].lon - granier.lon) * 78);
    assert.ok(km > 8 && km < 11, `${km.toFixed(1)} km`);
  });

  it("les trois rattachements corrigés tiennent, et le classeur dit encore autre chose", () => {
    // Si l'une de ces assertions tombe, le classeur a été corrigé en amont et
    // l'entrée correspondante de DOMAIN_FIXES est devenue inutile.
    for (const [fmName, expected] of Object.entries(DOMAIN_FIXES)) {
      const entry = CLASSEUR.find((e) => e.fm.fmName === fmName);
      assert.ok(entry, `${fmName} a disparu du classeur`);
      assert.equal(entry.domain, expected, fmName);
      assert.notEqual(entry.fm.domain, expected, `${fmName} : correction devenue inutile`);
    }
    const auris = STATIONS.find((s) => s.id === "auris-en-oisans")!;
    assert.equal(auris.domain, "Alpe d'Huez Grand Domaine");
  });

  it("aucune valeur estimée : les champs de domaine sont nuls hors classeur", () => {
    for (const s of outsideClasseur()) {
      assert.equal(s.domain, null, s.id);
      assert.equal(s.pistesKm, null, s.id);
      assert.equal(s.lifts, null, s.id);
      assert.equal(s.segments, null, s.id);
      assert.equal(s.colorShare, null, s.id);
      assert.equal(s.distToPisteKm, null, s.id);
    }
    // Et toute valeur présente porte son échelle.
    for (const s of STATIONS) {
      assert.equal(s.pistesKm != null, s.pistesKmScale != null, s.id);
      assert.equal(s.lifts != null, s.liftsScale != null, s.id);
      assert.equal(s.colorShare != null, s.colorScale != null, s.id);
      if (s.colorScale) assert.equal(s.colorScale, "domaine", s.id);
    }
  });
});
