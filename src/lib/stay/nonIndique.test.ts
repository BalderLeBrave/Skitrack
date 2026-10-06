import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { champsNonIndiques } from "./nonIndique.ts";

const PLEINE = {
  total: 4016,
  capacity: 7,
  bedrooms: 3,
  rooms: null,
  isStudio: null,
  beds: 5,
  baths: 2,
  propertyType: "Appartement",
  description: "Grand appartement au centre.",
  rating: 4.8,
  reviewCount: 23,
  lat: 46.18,
  lon: 6.7,
  photo: "https://a0.muscache.com/im/pictures/a.jpg",
  photos: null,
  url: "https://www.airbnb.fr/rooms/1",
};

describe("champsNonIndiques", () => {
  it("rien quand tout est publié", () => {
    assert.deepEqual(champsNonIndiques(PLEINE), []);
  });
  it("les champs vides, dans l'ordre de la fiche", () => {
    assert.deepEqual(
      champsNonIndiques({ ...PLEINE, baths: null, rating: null, reviewCount: null, url: null }),
      ["sallesDeBain", "note", "avis", "lien"],
    );
  });
  it("une description absente n'est pas listée : elle ne s'affiche pas du tout", () => {
    const sansDescription = { ...PLEINE, description: "  " };
    assert.deepEqual(champsNonIndiques(sansDescription), []);
  });
  it("un prix à 0 n'est pas publié", () => {
    assert.deepEqual(champsNonIndiques({ ...PLEINE, total: 0 }), ["prix"]);
  });
  it("un studio a ses chambres, des pièces en tiennent lieu", () => {
    assert.deepEqual(champsNonIndiques({ ...PLEINE, bedrooms: null, isStudio: true }), []);
    assert.deepEqual(champsNonIndiques({ ...PLEINE, bedrooms: null, rooms: 3 }), []);
    assert.deepEqual(champsNonIndiques({ ...PLEINE, bedrooms: null }), ["chambres"]);
  });
  it("une position à moitié n'est pas une position", () => {
    assert.deepEqual(champsNonIndiques({ ...PLEINE, lon: null }), ["position"]);
  });
  it("des photos sans la première comptent", () => {
    assert.deepEqual(champsNonIndiques({ ...PLEINE, photo: null, photos: ["https://x/1.jpg"] }), []);
    assert.deepEqual(champsNonIndiques({ ...PLEINE, photo: null, photos: [] }), ["photos"]);
  });
});
