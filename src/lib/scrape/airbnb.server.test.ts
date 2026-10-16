/**
 * La sortie du worker Airbnb lue côté Node (`fromPyairbnbPayload`), hors
 * ligne. Se lance avec le résolveur de l'application
 * (`--import ./scripts/echantillon/enregistrer.mjs`).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LiveSearchInput } from "./types.ts";
import { fromPyairbnbPayload } from "./airbnb.server.ts";

const SEJOUR: LiveSearchInput = {
  stationId: "les-2-alpes",
  stationName: "Les 2 Alpes",
  lat: 45.0122,
  lon: 6.1255,
  checkIn: "2026-12-19",
  checkOut: "2026-12-26",
  guests: 4,
  bedrooms: 0,
};

/** Une ligne telle que le worker la rend (scrape/airbnb/map.py, stay_to_listing). */
const ligne = (extra: Record<string, unknown>) => ({
  id: "40088811",
  name: "Chalet des neiges",
  subtitle: "Les Deux Alpes",
  priceLabel: "2 215 € au total",
  lat: 45.01,
  lng: 6.12,
  url: "https://www.airbnb.fr/rooms/40088811",
  ...extra,
});

describe("Airbnb : le total que le worker a jugé", () => {
  it("un 0 du worker (prix d'autres dates, « 20–27 déc. » pour le 19→26) reste « non publié »", () => {
    const [l] = fromPyairbnbPayload({ listings: [ligne({ total: 0, textes: ["Chalet des neiges", "20–27 déc."] })] }, SEJOUR);
    assert.equal(l?.total, 0);
  });

  it("un total publié reste le sien ; sans total chiffré, le libellé se lit encore", () => {
    assert.equal(fromPyairbnbPayload({ listings: [ligne({ total: 2215 })] }, SEJOUR)[0]?.total, 2215);
    assert.equal(fromPyairbnbPayload({ listings: [ligne({})] }, SEJOUR)[0]?.total, 2215);
  });
});
