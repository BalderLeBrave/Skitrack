import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { foldName } from "./carte.ts";
import { domainFit } from "./domainFit.ts";
import {
  chargerEurope,
  domainesEuropePour,
  europeChargee,
  idEuropeen,
  stationEurope,
} from "./europe.ts";
import { STATIONS, stationById } from "./stations.ts";

describe("avant le chargement des pays", () => {
  it("la France seule est servie", () => {
    assert.equal(europeChargee(), false);
    assert.deepEqual(domainesEuropePour("ischgl"), []);
    assert.equal(stationEurope("at-ischgl"), undefined);
    assert.ok(STATIONS.every((s) => s.country === "FR"));
  });
});

describe("domaines européens hors France", () => {
  before(() => chargerEurope());

  it("un identifiant porte son pays, la France n'en est pas", () => {
    assert.equal(idEuropeen("at-ischgl"), true);
    assert.equal(idEuropeen("fr-avoriaz"), false);
    assert.equal(idEuropeen("tignes"), false);
  });

  it("Ischgl se trouve par son nom, et stationById le connaît", () => {
    const [e] = domainesEuropePour(foldName("Ischgl"));
    assert.ok(e, "Ischgl proposé");
    assert.equal(e.station.country, "AT");
    assert.equal(stationById(e.station.id)?.name, e.station.name);
    assert.ok(e.station.lat > 46 && e.station.lat < 48);
  });

  it("aucun domaine français n'entre, aucune station française n'est masquée", () => {
    assert.equal(stationById("tignes")?.country, "FR");
    for (const { station } of domainesEuropePour(foldName("val"), 500))
      assert.notEqual(station.country, "FR");
  });

  it("une ville ou un village désigne le domaine le plus proche, avec la distance", () => {
    const [k] = domainesEuropePour(foldName("Kitzbühel"));
    assert.equal(k?.station.id, "at-kitzski");
    assert.equal(k?.lieu, "Kitzbühel");
    assert.ok((k?.km ?? 99) <= 5);
  });

  it("deux domaines du même nom dans le même pays n'en font qu'un", () => {
    const arlberg = domainesEuropePour(foldName("Ski Arlberg")).filter((e) => !e.lieu);
    assert.equal(arlberg.length, 1);
  });

  it("une altitude non relevée vaut 0 (non mesurée), jamais une estimation", () => {
    assert.deepEqual(domainesEuropePour("ze"), [], "moins de trois lettres : rien");
    const s = domainesEuropePour(foldName("Zermatt"))[0]?.station;
    assert.ok(s);
    assert.equal(s.villageM, 0);
  });

  it("hors de France, une annonce à moins de 12 km est au domaine, au-delà non rattachée", () => {
    const s = domainesEuropePour(foldName("Ischgl"))[0]!.station;
    const pres = domainFit({ lat: s.lat + 0.02, lon: s.lon }, s);
    assert.equal(pres.verdict, "in");
    assert.equal(pres.nearestStationId, s.id);
    const loin = domainFit({ lat: s.lat + 0.5, lon: s.lon }, s);
    assert.equal(loin.verdict, "unknown");
    assert.equal(loin.motif, "trop-loin");
    assert.equal(domainFit({}, s).motif, "sans-lieu");
  });
});
