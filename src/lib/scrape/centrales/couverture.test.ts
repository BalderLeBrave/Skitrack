import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { couverture, phraseCouverture } from "./couverture.ts";

describe("couverture d'une centrale : point, capacité, chambres", () => {
  const annonces = [
    { lat: 45.687045, lon: 6.565435, guests: 10, bedrooms: 3, rooms: 4 },
    { lat: null, lon: null, guests: 8, bedrooms: null, rooms: 4 },
    // Un studio publie zéro chambre : c'est une chambre publiée, pas un trou.
    { lat: 46.27721, lon: 6.83957, guests: null, bedrooms: 0, rooms: 1 },
    // Zéro-zéro n'est pas un point.
    { lat: 0, lon: 0, guests: null, bedrooms: null, rooms: null },
  ];

  it("compte ce qui est là, et sépare chambres publiées et pièces seules", () => {
    assert.deepEqual(couverture(annonces), {
      total: 4,
      gps: 2,
      capacite: 2,
      chambres: 2,
      piecesSeules: 1,
      pointsPartages: 0,
    });
  });

  it("signale trois logements au même point, sans rien retirer", () => {
    // Deux logements d'un même chalet au même point, c'est ordinaire (Valloire,
    // « Gros Grenier A » et « C ») ; trois ou plus se signalent.
    const memePoint = { lat: 45.160057, lon: 6.418719, guests: 8, bedrooms: null, rooms: 4 };
    assert.equal(couverture([memePoint, memePoint]).pointsPartages, 0);
    const c = couverture([memePoint, memePoint, memePoint, ...annonces]);
    assert.equal(c.pointsPartages, 3);
    assert.equal(c.gps, 5);
  });

  it("se lit d'une ligne au journal", () => {
    assert.equal(
      phraseCouverture(couverture(annonces)),
      "GPS 2/4 · capacité 2/4 · chambres 2/4, pièces seules 1 · points partagés 0",
    );
  });

  it("une liste vide ne fait rien exploser", () => {
    assert.equal(
      phraseCouverture(couverture([])),
      "GPS 0/0 · capacité 0/0 · chambres 0/0, pièces seules 0 · points partagés 0",
    );
  });
});
