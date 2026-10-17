/**
 * Le repli « relevé 3 sept. » (`applyDump`), hors ligne. Se lance avec le
 * résolveur de l'application (`--import ./scripts/echantillon/enregistrer.mjs`).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import { RELEVE_2A } from "../listings.ts";
import type { LiveSearchInput, SourceReport } from "./types.ts";
import { applyDump, horsFrance, runLiveSearch } from "./run.server.ts";

/** Le séjour du relevé figé des Deux Alpes. */
const SEJOUR: LiveSearchInput = {
  stationId: "les-2-alpes",
  stationName: "Les 2 Alpes",
  lat: 45.0122,
  lon: 6.1255,
  checkIn: "2027-02-06",
  checkOut: "2027-02-13",
  guests: 4,
  bedrooms: 0,
};

const releve = (source: string) => RELEVE_2A.filter((l) => l.source === source).length;

describe("applyDump : le repli du relevé figé", () => {
  it("une source muette reprend tout son relevé, pas sa première annonce", () => {
    const listings: Listing[] = [];
    applyDump(SEJOUR, [], listings, new Set(["Airbnb"]));
    assert.ok(releve("Airbnb") > 1);
    assert.equal(listings.length, releve("Airbnb"));
    assert.equal(new Set(listings.map((l) => l.id)).size, listings.length);
    assert.ok(listings.every((l) => l.proven.includes("repli relevé 3 sept.")));
  });

  it("chaque source permise, entière", () => {
    const listings: Listing[] = [];
    applyDump(SEJOUR, [], listings, new Set(["Centrale", "Gîtes de France"]));
    assert.equal(listings.filter((l) => l.source === "Centrale").length, releve("Centrale"));
    assert.equal(listings.filter((l) => l.source === "Gîtes de France").length, releve("Gîtes de France"));
  });

  it("une source servie en direct ne reprend rien ; une source en échec reprend tout", () => {
    const rapport = (source: SourceReport["source"], ok: boolean, count: number): SourceReport => ({ source, ok, count, ms: 0 });
    const listings: Listing[] = [];
    applyDump(SEJOUR, [rapport("Airbnb", true, 3), rapport("Centrale", false, 0)], listings, new Set(["Airbnb", "Centrale"]));
    assert.equal(listings.filter((l) => l.source === "Airbnb").length, 0);
    assert.equal(listings.filter((l) => l.source === "Centrale").length, releve("Centrale"));
  });

  it("hors du séjour du relevé, rien", () => {
    const listings: Listing[] = [];
    applyDump({ ...SEJOUR, checkIn: "2027-02-13", checkOut: "2027-02-20" }, [], listings, new Set(["Airbnb"]));
    assert.equal(listings.length, 0);
  });
});

describe("un domaine européen hors France", () => {
  const ISCHGL: LiveSearchInput = { ...SEJOUR, stationId: "at-silvretta-arena-ischgl-samnaun", stationName: "Ischgl", country: "AT", lat: 47.01, lon: 10.29 };

  it("seul un pays autre que la France est « hors France »", () => {
    assert.equal(horsFrance(ISCHGL), true);
    assert.equal(horsFrance(SEJOUR), false);
    assert.equal(horsFrance({ country: "FR" }), false);
  });

  it("Gîtes de France, les centrales, HomeToGo et les agences ne demandent rien à leur site", async () => {
    for (const part of ["gites", "centrales", "hometogo", "agences"] as const) {
      const r = await runLiveSearch(ISCHGL, part);
      assert.deepEqual(r.listings, []);
      assert.ok(r.sources.every((s) => s.ok && s.count === 0 && /hors de France/.test(s.note ?? "")), part);
    }
  });
});
