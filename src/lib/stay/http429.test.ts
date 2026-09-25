import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  estHoteAirbnb,
  estRefus,
  estStatutRalenti,
  htmlEstBloque,
  retryAfterMs,
} from "./http429.ts";

describe("429 Airbnb", () => {
  it("lit Retry-After en secondes", () => {
    assert.equal(retryAfterMs({ "Retry-After": "8" }), 8_000);
    assert.equal(retryAfterMs(new Headers({ "retry-after": "3" })), 3_000);
  });

  it("plafonne une attente trop longue", () => {
    assert.equal(retryAfterMs({ "Retry-After": "120" }, 0, 12_000), 12_000);
  });

  it("double sans en-tête", () => {
    assert.equal(retryAfterMs(null, 0), 2_000);
    assert.equal(retryAfterMs(undefined, 1), 4_000);
    assert.equal(retryAfterMs({}, 2), 8_000);
  });

  it("reconnaît l'hôte Airbnb", () => {
    assert.equal(estHoteAirbnb("https://www.airbnb.fr/rooms/1"), true);
    assert.equal(estHoteAirbnb("https://www.airbnb.com/rooms/1"), true);
    assert.equal(estHoteAirbnb("https://www.booking.com/hotel/fr/x.html"), false);
  });

  it("reconnaît 429 et 503", () => {
    assert.equal(estStatutRalenti(429), true);
    assert.equal(estStatutRalenti(503), true);
    assert.equal(estStatutRalenti(404), false);
  });

  it("compte le 403 comme un refus, pas le 404 ni le 202", () => {
    assert.equal(estRefus(403), true);
    assert.equal(estRefus(429), true);
    assert.equal(estRefus(503), true);
    assert.equal(estRefus(404), false);
    assert.equal(estRefus(202), false);
    assert.equal(estStatutRalenti(403), false);
  });

  it("voit une page titre 429", () => {
    assert.equal(htmlEstBloque("<title>429 Too Many Requests</title>"), true);
    assert.equal(htmlEstBloque("<title>Annonce · Airbnb</title>"), false);
  });
});
