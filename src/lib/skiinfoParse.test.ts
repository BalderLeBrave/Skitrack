import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyParsed, isFranceCountry, parseSkiinfoPage, stationSkiinfoUrl } from "./skiinfoParse.ts";
import { SKIINFO } from "./skiinfo.ts";
import { formatSkiinfoAge, isStale, seedLive } from "./skiinfoStore.ts";

const html = readFileSync(new URL("./fixtures/skiinfo-2alpes.html", import.meta.url), "utf8");

describe("mise à jour Skiinfo", () => {
  it("lit le bloc Domaine skiable 2 Alpes (96, 220 km, 19/49/18/15, 1300–3600)", () => {
    const p = parseSkiinfoPage(html);
    assert.equal(p.n, 96);
    assert.equal(p.km, 220);
    assert.equal(p.longestKm, 16);
    assert.deepEqual(p.pct, { green: 19, blue: 49, red: 18, black: 15 });
    assert.equal(p.minM, 1300);
    assert.equal(p.maxM, 3600);
    assert.equal(p.hasMix, true);
    assert.equal(isFranceCountry(p.country), true);
    assert.ok(p.photoUrl?.includes("cdn.bfldr.com"));
    assert.ok(!p.photoUrl?.includes("resort_header"));
  });

  it("page station-de-ski, pas d’invention si le bloc manque, hors FR refusé", () => {
    assert.equal(
      stationSkiinfoUrl("https://www.skiinfo.fr/alpes-du-nord/les-2-alpes/plans-des-pistes"),
      "https://www.skiinfo.fr/alpes-du-nord/les-2-alpes/station-de-ski",
    );
    const empty = parseSkiinfoPage("<html></html>");
    assert.equal(empty.hasMix, false);
    assert.equal(empty.n, null);
    assert.equal(empty.km, null);
    assert.equal(isFranceCountry("CH"), false);
    assert.equal(isFranceCountry("FR-FR"), true);
    const seed = SKIINFO["les-2-alpes"]!;
    const kept = applyParsed(seed, empty, "2026-09-10");
    assert.equal(kept.n, seed.n);
    assert.equal(kept.km, seed.km);
  });

  it("seed = à actualiser ; ok récent = pas stale", () => {
    const seed = seedLive(SKIINFO["les-2-alpes"]!);
    assert.equal(isStale(seed), true);
    const fresh = { ...seed, status: "ok" as const, fetchedAt: new Date().toISOString() };
    assert.equal(isStale(fresh), false);
    assert.equal(formatSkiinfoAge(fresh, Date.parse(fresh.fetchedAt!) + 10_000), "à l’instant");
  });
});
