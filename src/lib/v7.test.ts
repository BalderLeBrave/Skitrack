import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aStation } from "./v7.ts";
import { GPS_FIXES } from "./classeur.ts";
import { STATIONS, stationById } from "./stations.ts";

describe("aStation", () => {
  it("contracte l'article défini pluriel", () => {
    assert.equal(aStation("Les 2 Alpes"), "aux 2 Alpes");
    assert.equal(aStation("Les Arcs"), "aux Arcs");
  });

  it("contracte l'article défini masculin", () => {
    assert.equal(aStation("Le Collet d'Allevard"), "au Collet d'Allevard");
  });

  it("garde l'élision devant une voyelle", () => {
    assert.equal(aStation("L'Alpe d'Huez"), "à l'Alpe d'Huez");
    // Le référentiel écrit « Alpe d'Huez » sans article : l'élision se pose.
    assert.equal(aStation("Alpe d'Huez"), "à l'Alpe d'Huez");
  });

  it("laisse l'article féminin en place", () => {
    assert.equal(aStation("La Plagne"), "à La Plagne");
  });

  it("n'invente rien sur un nom sans article", () => {
    assert.equal(aStation("Chamonix"), "à Chamonix");
    assert.equal(aStation(""), "");
  });
});

describe("positions des stations", () => {
  it("chaque correction GPS désigne une station du référentiel", () => {
    for (const id of Object.keys(GPS_FIXES)) {
      assert.ok(stationById(id), `GPS_FIXES cite « ${id} », absent du référentiel`);
    }
  });

  it("une station corrigée à la main porte bien sa position relevée", () => {
    for (const [id, gps] of Object.entries(GPS_FIXES)) {
      const s = stationById(id);
      if (!s) continue;
      // Les stations à fiche Skiinfo gardent leur pin mesuré : la correction à
      // la main ne sert qu'à celles que le classeur pose au centre de la commune.
      if (s.origin === "depot") continue;
      assert.equal(s.lat, gps.lat, `${id} : latitude non reprise`);
      assert.equal(s.lon, gps.lon, `${id} : longitude non reprise`);
      assert.equal(s.posRelevee, true, `${id} : devrait être dite relevée`);
    }
  });

  it("une station sans relevé ni correction est dite approximative", () => {
    const approx = STATIONS.filter((s) => !s.posRelevee);
    assert.ok(approx.length > 0, "aucune station approximative : le drapeau ne sert plus");
    for (const s of approx) {
      assert.equal(s.origin, "classeur");
      assert.ok(!GPS_FIXES[s.id], `${s.id} est corrigée et ne devrait pas être approximative`);
    }
  });
});
