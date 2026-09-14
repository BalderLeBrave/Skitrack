import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { braCodeOf, braMassifOf, publieUnBra, rattachementBra, reperesBra } from "./massifs.ts";
import { STATIONS } from "../stations.ts";

describe("bra massifs FR", () => {
  it("rattache les stations mises en avant", () => {
    assert.equal(braMassifOf("Les 2 Alpes"), "Oisans");
    assert.equal(braCodeOf("Les 2 Alpes"), 15);
    assert.equal(braMassifOf("Chamonix-Mont-Blanc"), "Mont-Blanc");
    assert.equal(braCodeOf("Tignes"), 6);
    assert.equal(braMassifOf("Val Thorens"), "Vanoise");
    assert.equal(braMassifOf("Alpe d'Huez"), "Grandes-Rousses");
    assert.equal(braMassifOf("La Clusaz"), "Aravis");
  });

  it("le mot-clé doit être un mot, pas un fragment", () => {
    const reperes = reperesBra(STATIONS);
    const parNom = (nom: string) =>
      rattachementBra({ name: nom, massif: "Alpes du Nord" }, reperes).massif;
    // « Le Chinaillon » contenait « aillon » et recevait le bulletin des Bauges.
    assert.notEqual(parNom("Le Chinaillon"), "Bauges");
    // « Megevette » contenait « megeve » et recevait celui du Mont-Blanc.
    assert.notEqual(parNom("Megevette"), "Mont-Blanc");
  });

  it("le domaine rattache les sous-stations que leur nom ne trahit pas", () => {
    const r = rattachementBra({ name: "Arc 1600", massif: "Alpes du Nord", domain: "Les Arcs" });
    assert.equal(r.massif, "Haute-Tarentaise");
    assert.equal(r.voie, "domaine");
  });

  it("hors zone BRA, l'absence est légitime et se dit", () => {
    const r = rattachementBra({ name: "Gérardmer", massif: "Vosges", lat: 48, lon: 6.9 });
    assert.equal(r.horsZone, true);
    assert.equal(r.code, null);
  });

  it("la couverture de la zone BRA dépasse 95 %", () => {
    const reperes = reperesBra(STATIONS);
    const zone = STATIONS.filter((s) => publieUnBra(s.massif));
    const couvertes = zone.filter((s) => rattachementBra(s, reperes).code != null);
    assert.ok(zone.length > 250, `zone BRA : ${zone.length} stations`);
    assert.ok(
      couvertes.length / zone.length > 0.95,
      `couverture ${couvertes.length}/${zone.length}`,
    );
  });

  it("un rattachement déduit annonce sa voie", () => {
    const reperes = reperesBra(STATIONS);
    const voies = new Set(
      STATIONS.filter((s) => publieUnBra(s.massif)).map((s) => rattachementBra(s, reperes).voie),
    );
    assert.ok(voies.has("nom"));
    assert.ok(voies.has("domaine"));
    assert.ok(voies.has("proximite"));
  });
});
