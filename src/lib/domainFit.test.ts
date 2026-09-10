import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attachAccess, formatLift } from "./access.ts";
import {
  domainFit,
  linkedSkiStations,
  nearestStationPin,
  otherDomainMessage,
  stationIdFromText,
  winterBarrier,
} from "./domainFit.ts";
import { stationById } from "./stations.ts";

const val = () => stationById("val-disere")!;
const pastourelle = {
  id: "p5797537a",
  stationId: "val-disere",
  title: "Maison de vacances « La Pastourelle 1 », au pied des pistes",
  source: "Abritel" as const,
  total: 1,
  currency: "EUR" as const,
  guests: 8,
  bedrooms: 4,
  available: true as const,
  photo: null,
  url: "https://www.abritel.fr/location-vacances/p5797537a",
  lat: 45.371686,
  lon: 7.046794,
  locality: "Bonneval-sur-Arc",
  proven: "fixture Iseran",
};

describe("domaine skiable ≠ rayon kilométrique", () => {
  it("Le Fornet est Val d’Isère, pas Bonneval", () => {
    assert.equal(stationIdFromText("Chalet au Fornet"), "val-disere");
    const fornet = nearestStationPin(45.450318, 7.011062);
    assert.equal(fornet.station.id, "val-disere");
    const fit = domainFit({ lat: 45.450318, lon: 7.011062, title: "Le Fornet" }, val());
    assert.equal(fit.verdict, "in");
  });

  it("Pastourelle / Bonneval n’est pas Val d’Isère : Iseran fermé", () => {
    const fit = domainFit(pastourelle, val());
    assert.equal(fit.nearestStationId, "bonneval-sur-arc");
    assert.equal(fit.verdict, "other");
    assert.equal(fit.winterBarrier, "Col de l'Iseran");
    assert.ok((fit.distToSearchedPinM ?? 0) > 4000);
    const msg = otherDomainMessage(fit, "Val d'Isère")!;
    assert.ok(msg.includes("Bonneval"));
    assert.ok(msg.includes("Iseran"));
    assert.ok(!msg.toLowerCase().includes("fornet") || msg.includes("Pas"));
  });

  it("attachAccess : pas 5000 m des remontées de Val d’Isère", () => {
    const row = attachAccess(pastourelle, val());
    assert.equal(row.domainFit, "other");
    assert.equal(row.nearestDomainName, "Bonneval sur Arc");
    assert.equal(row.distToLiftM, null);
    assert.equal(formatLift(row), "Remontée non mesurée");
    assert.ok((row.searchedLiftM ?? 0) > 4000);
    assert.ok((row.distToNearestDomainM ?? 9999) < 400);
  });

  it("Tignes reste relié à Val d’Isère (Espace Killy)", () => {
    assert.ok(linkedSkiStations("val-disere").has("tignes"));
    assert.ok(!linkedSkiStations("val-disere").has("bonneval-sur-arc"));
    const fit = domainFit({ lat: 45.469, lon: 6.907, title: "Tignes le Lac" }, val());
    assert.equal(fit.verdict, "linked");
    assert.equal(winterBarrier("val-disere", "tignes"), null);
  });

  it("texte Bonneval sans GPS suffit à écarter", () => {
    const fit = domainFit(
      { title: "La Pastourelle 1", locality: "Bonneval-sur-Arc" },
      val(),
    );
    assert.equal(fit.verdict, "other");
    assert.equal(fit.nearestStationId, "bonneval-sur-arc");
  });
});
