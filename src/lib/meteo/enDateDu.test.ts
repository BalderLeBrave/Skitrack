import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fuseauStation, meteoEnDateDu } from "./enDateDu.ts";

describe("mention de la prévision", () => {
  it("date à la française, heure locale de la station", () => {
    // 14 h 50 UTC le 30 septembre 2026 : 16 h 50 à Paris (heure d'été).
    assert.equal(meteoEnDateDu(new Date("2026-09-30T14:50:00Z"), "Europe/Paris"), "Météo en date du 30/09/2026 à 16h50");
    // En hiver, une heure d'écart seulement ; minuit s'écrit 00h.
    assert.equal(meteoEnDateDu(new Date("2027-01-31T23:05:00Z"), "Europe/Paris"), "Météo en date du 01/02/2027 à 00h05");
  });

  it("le fuseau est celui du pays de la station, Paris à défaut", () => {
    assert.equal(fuseauStation("FR"), "Europe/Paris");
    assert.equal(fuseauStation("CH"), "Europe/Zurich");
    assert.equal(fuseauStation(null), "Europe/Paris");
  });

  it("ni fournisseur, ni altitude, ni tiret cadratin", () => {
    const t = meteoEnDateDu(new Date("2026-09-30T14:50:00Z"), "Europe/Paris");
    for (const interdit of ["Open-Meteo", "modélisé", " m ", "—"]) assert.ok(!t.includes(interdit), `${interdit} : ${t}`);
  });
});
