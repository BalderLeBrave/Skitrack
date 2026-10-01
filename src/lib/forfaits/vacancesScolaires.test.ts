import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CALENDRIER,
  horsVacances,
  lendemain,
  plageVacances,
  vacancesDeSaison,
  veille,
} from "./vacancesScolaires.ts";

describe("calendrier des vacances scolaires", () => {
  it("les vacances vont du samedi du départ à la veille de la reprise", () => {
    assert.deepEqual(plageVacances("2026-27", "noel"), { debut: "2026-12-19", fin: "2027-01-03" });
  });

  it("sans précision, la plage couvre les trois zones", () => {
    // Zone C du 6 au 22 février, zone A du 13 février au 1er mars, zone B du
    // 20 février au 8 mars 2027 (arrêté du 22 octobre 2025).
    assert.deepEqual(plageVacances("2026-27", "hiver"), { debut: "2027-02-06", fin: "2027-03-07" });
    assert.deepEqual(plageVacances("2026-27", "hiver", ["A"]), {
      debut: "2027-02-13",
      fin: "2027-02-28",
    });
    assert.deepEqual(plageVacances("2026-27", "printemps"), {
      debut: "2027-04-03",
      fin: "2027-05-02",
    });
  });

  it("chaque saison connue a ses quatre vacances pour les trois zones", () => {
    for (const [saison, annee] of Object.entries(CALENDRIER)) {
      for (const [nom, zones] of Object.entries(annee)) {
        for (const [zone, v] of Object.entries(zones)) {
          assert.ok(v.depart < v.reprise, `${saison} ${nom} ${zone}`);
          assert.equal(
            new Date(`${v.depart}T12:00:00Z`).getUTCDay(),
            6,
            `${saison} ${nom} ${zone} : départ un samedi`,
          );
        }
      }
    }
  });

  it("hors vacances : le complément dans la fenêtre donnée", () => {
    const h = horsVacances("2026-27", { debut: "2026-12-01", fin: "2027-04-30" }, ["A"]);
    assert.deepEqual(h, [
      { debut: "2026-12-01", fin: "2026-12-18" },
      { debut: "2027-01-04", fin: "2027-02-12" },
      { debut: "2027-03-01", fin: "2027-04-09" },
      { debut: "2027-04-26", fin: "2027-04-30" },
    ]);
  });

  it("une saison hors calendrier ne se devine pas", () => {
    assert.equal(plageVacances("2030-31", "noel"), null);
    assert.deepEqual(vacancesDeSaison("2030-31"), []);
    assert.deepEqual(horsVacances("2030-31", { debut: "2030-12-01", fin: "2031-04-30" }), []);
  });

  it("veille et lendemain traversent mois et années", () => {
    assert.equal(veille("2027-03-01"), "2027-02-28");
    assert.equal(lendemain("2026-12-31"), "2027-01-01");
  });
});
