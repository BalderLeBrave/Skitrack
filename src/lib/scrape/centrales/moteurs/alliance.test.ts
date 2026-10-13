import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blocSuivant,
  dansPolygone,
  lireCatalogueAlliance,
  lireDisposAlliance,
  lireZoneAlliance,
  logementsAlliance,
  requeteAlliance,
  suiteAlliance,
  urlRechercheAlliance,
  zoneDeChemins,
} from "./alliance.ts";

const CATALOGUE = `AllianceReseaux.OsCatalogue.prototype['GetVueInfo-OsForm-1-2-3'] = function() { return {
  "id": 1423,
  "items": [
    { "cle": "OSMB-58385-2", "titre": "Le Portail", "lat": 45.46, "lng": 6.44 },
    { "cle": "HRIT-1", "titre": "Hôtel Le Grand Truc", "lat": 45.25, "lng": 6.26 },
    { "cle": "OSCH-9", "titre": "Camping des Cimes", "lat": 45.2, "lng": 6.2 },
    { "cle": "OSMB-1", "titre": "Studio 4 personnes", "lat": 0, "lng": 0 }
  ]
} };`;

const DISPOS = `({"total":4,"resume":{"daterech":"samedi 06 février 2027","nbadultes":2,"nbnuitees":7},"ConversationId":"abc","rsBlockIndex":1,"items":[
  {"dispo":1,"cle":"OSMB-58385-2","prix":1386},
  {"dispo":1,"cle":"HRIT-1","prix":900},
  {"dispo":1,"cle":"OSCH-9","prix":400},
  {"dispo":-1,"cle":"OSMB-1","prix":0},
  {"dispo":1,"cle":"INCONNU","prix":500}
]})`;

describe("Alliance : la recherche publiée par le widget", () => {
  it("assemble la requête mesurée, métier 1 et personnes dans le champ usePax", () => {
    const q = requeteAlliance({
      login: "valmorel",
      vue: 1423,
      arrivee: "2027-02-06",
      nuits: 7,
      personnes: 4,
    });
    assert.equal(q, "|0|20|valmorel|||1423|0|0||1|7|2027-02-06|0||*|0|4||*");
    const url = new URL(urlRechercheAlliance(q));
    assert.equal(url.hostname, "etape-rest.for-system.com");
    assert.equal(url.searchParams.get("ref"), "json-catalogue-etape16v5");
    assert.equal(url.searchParams.get("q"), q);
  });

  it("met le rectangle publié dans le champ polygone, et nulle part ailleurs", () => {
    const zone = zoneDeChemins("0,0,0 2,0,0 2,1,0 0,1,0");
    assert.equal(zone.rectangle, "0 0,2 0,2 1,0 1,0 0");
    assert.equal(dansPolygone(1, 0.5, zone.points), true);
    assert.equal(dansPolygone(3, 0.5, zone.points), false);
    const q = requeteAlliance({
      login: "n-py",
      vue: 1381,
      arrivee: "2027-02-06",
      nuits: 7,
      personnes: 4,
      polygone: zone.rectangle,
    });
    assert.equal(q, `|0|20|n-py|${zone.rectangle}||1381|0|0||1|7|2027-02-06|0||*|0|4||*`);
  });

  it("un fichier de contour sans tracé lève, il ne devient pas une recherche sans borne", () => {
    const source = `AllianceReseaux.OsCarte.prototype["x"] = function(options) { return { "pol":{ "paths":"0,0,0 1,0,0 1,1,0 0,1,0" } } };`;
    const zone = lireZoneAlliance(source);
    assert.equal(dansPolygone(0.5, 0.5, zone.points), true);
    assert.throws(() => zoneDeChemins("0,0,0 1,0,0"), /tracé/);
    assert.throws(() => lireZoneAlliance("<html>vide</html>"), /tracé|illisible|sans objet/);
  });

  it("lit le catalogue et ne garde que les séjours vendus, nommés, hors hôtel et camping", () => {
    const catalogue = lireCatalogueAlliance(CATALOGUE);
    assert.equal(catalogue.id, 1423);
    assert.equal(catalogue.articles.length, 4);
    const reponse = lireDisposAlliance(DISPOS);
    assert.equal(reponse.nuits, 7);
    assert.equal(reponse.conversation, "abc");
    assert.equal(reponse.rs, 1);
    const { gardes, ecartes } = logementsAlliance(catalogue, reponse);
    assert.deepEqual(gardes.map((g) => g.cle), ["OSMB-58385-2"]);
    assert.equal(gardes[0]?.total, 1386);
    assert.equal(gardes[0]?.lat, 45.46);
    assert.equal(ecartes.get("hôtel"), 1);
    assert.equal(ecartes.get("camping"), 1);
  });

  it("un point 0,0 n'est pas une position", () => {
    const catalogue = lireCatalogueAlliance(CATALOGUE);
    assert.equal(catalogue.articles.find((a) => a.cle === "OSMB-1")?.lat, null);
  });

  it("le bloc suivant avance, et s'arrête quand la réponse ne progresse plus", () => {
    assert.equal(blocSuivant(0, 1), 1);
    assert.equal(blocSuivant(1, -1), null);
    assert.equal(blocSuivant(1, 1), null);
  });

  it("une réponse sans objet lève, elle ne devient pas un séjour vide", () => {
    assert.throws(() => lireDisposAlliance("<html>erreur</html>"), /illisible|sans objet/);
  });

  it("une page suivante hors séjour s'arrête ; la première lève", () => {
    assert.equal(suiteAlliance(0), "lever");
    assert.equal(suiteAlliance(1), "arreter");
  });
});
