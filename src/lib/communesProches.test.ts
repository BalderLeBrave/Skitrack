import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { foldName } from "./carte.ts";
import { chargerCommunes, communesChargees, communesPour, stationIdDeLaCommune } from "./communesProches.ts";
import { FM_STATIONS } from "./franceMontagnes.data.ts";
import { STATIONS } from "./stations.ts";

/** Le même ordre que la barre : le nom du référentiel, sinon le lieu. */
function resolu(nom: string): string | null {
  const q = foldName(nom);
  return STATIONS.find((s) => foldName(s.name) === q)?.id ?? stationIdDeLaCommune(nom);
}

describe("avant le chargement de la liste", () => {
  it("aucune commune, mais les stations et les villages rattachés se trouvent", () => {
    assert.equal(communesChargees(), false);
    assert.deepEqual(communesPour(foldName("Lamoura")), []);
    assert.equal(stationIdDeLaCommune("Lamoura"), null);
    assert.equal(stationIdDeLaCommune("Val Claret"), "tignes");
  });
});

describe("communes, villes et villages", () => {
  before(() => chargerCommunes());

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

  it("le référentiel l'emporte sur un pin plus proche", () => {
    assert.equal(stationIdDeLaCommune("La Norma"), "la-norma");
    assert.equal(stationIdDeLaCommune("Lanslevillard"), "val-cenis");
    assert.equal(stationIdDeLaCommune("Le Barioz Alpin"), "les-7-laux");
    assert.equal(stationIdDeLaCommune("Chantemerle"), "serre-chevalier");
    const norma = communesPour(foldName("La Norma")).filter((c) => foldName(c.nom) === "la norma");
    assert.ok(norma.every((c) => c.stationId === "la-norma"));
    const lans = communesPour(foldName("Lanslevillard")).filter((c) => foldName(c.nom) === "lanslevillard");
    assert.ok(lans.every((c) => c.stationId === "val-cenis"));
  });
  it("un homonyme ne vole pas le nom de la station", () => {
    assert.equal(stationIdDeLaCommune("Les Rousses"), "les-rousses");
    assert.equal(stationIdDeLaCommune("La Grave"), "la-grave-la-meije");
    assert.equal(communesPour(foldName("La Grave"))[0]?.stationId, "la-grave-la-meije");
  });
  it("un domaine trop loin ne gagne pas sur la station proche", () => {
    assert.equal(stationIdDeLaCommune("Névache"), "serre-chevalier");
    const [c] = communesPour(foldName("Névache")).filter((x) => foldName(x.nom) === "nevache");
    assert.equal(c?.stationId, "serre-chevalier");
    assert.equal(c?.domaine, false);
  });
  it("une saisie trop courte ne choisit rien", () => {
    assert.equal(stationIdDeLaCommune("la"), null);
    assert.deepEqual(communesPour("la"), []);
  });
});
