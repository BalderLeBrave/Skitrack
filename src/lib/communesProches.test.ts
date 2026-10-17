import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { foldName } from "./carte.ts";
import { communesPour, stationIdDeLaCommune } from "./communesProches.ts";
import { FM_STATIONS } from "./franceMontagnes.data.ts";
import { STATIONS } from "./stations.ts";

/** Le même ordre que la barre : le nom du référentiel, sinon le lieu. */
function resolu(nom: string): string | null {
  const q = foldName(nom);
  return STATIONS.find((s) => foldName(s.name) === q)?.id ?? stationIdDeLaCommune(nom);
}

describe("communes, villes et villages", () => {
  it("Lamoura est le domaine des Rousses", () => {
    assert.equal(stationIdDeLaCommune("Lamoura"), "les-rousses");
    const [c] = communesPour(foldName("Lamoura"));
    assert.equal(c?.nom, "Lamoura");
    assert.equal(c?.stationId, "les-rousses");
    assert.equal(c?.domaine, true);
  });

  it("Prémanon est aux Rousses, Lélex à Monts Jura", () => {
    assert.equal(stationIdDeLaCommune("Prémanon"), "les-rousses");
    assert.equal(stationIdDeLaCommune("Lélex"), "monts-jura");
  });

  it("Val Claret et Plagne Centre gardent leur station, pas le pin voisin", () => {
    assert.equal(stationIdDeLaCommune("Val Claret"), "tignes");
    assert.equal(stationIdDeLaCommune("Plagne Centre"), "la-plagne");
  });

  it("une ville loin de tout domaine propose la station la plus proche, avec la distance", () => {
    assert.equal(stationIdDeLaCommune("Paris"), "la-loge-des-gardes");
    const [c] = communesPour(foldName("Paris"));
    assert.equal(c?.domaine, false);
    assert.ok((c?.km ?? 0) > 300);
  });

  it("chaque station du classeur France Montagnes se trouve, même sous une autre orthographe", () => {
    assert.equal(resolu("Avoriaz 1800"), "avoriaz");
    assert.equal(resolu("Gourrette"), "gourette");
    assert.equal(resolu("Les Arcs Bourg St Maurice"), "les-arcs-bourg-st-maurice");
    assert.equal(resolu("Autrans Méaudres en Vercors"), "autrans");
    const manquent = FM_STATIONS.filter((f) => !resolu(f.fmName)).map((f) => f.fmName);
    assert.deepEqual(manquent, []);
  });

  it("un homonyme ne vole pas le nom de la station", () => {
    assert.equal(stationIdDeLaCommune("Les Rousses"), "les-rousses");
    assert.equal(stationIdDeLaCommune("La Grave"), "la-grave-la-meije");
    assert.equal(communesPour(foldName("La Grave"))[0]?.stationId, "la-grave-la-meije");
  });
  it("une saisie trop courte ne choisit rien", () => {
    assert.equal(stationIdDeLaCommune("la"), null);
    assert.deepEqual(communesPour("la"), []);
  });
});
