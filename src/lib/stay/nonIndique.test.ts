import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { champsNonIndiques } from "./nonIndique.ts";
import { cimalpesListings, lireRecherche } from "../scrape/agences/cimalpes.ts";

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
  it("la surface n'est pas listée : l'annonce ne la porte que si son collecteur la pose", () => {
    // Réponse réelle de Cimalpes (Val Thorens, 26 septembre 2026) : ses cartes
    // publient 85, 34 et 28 m², que le collecteur lit sans les poser sur
    // l'annonce. « Non indiqué par Cimalpes : surface » serait faux.
    const recherche = readFileSync(
      new URL("../scrape/agences/fixtures/cimalpes-recherche-val-thorens.json", import.meta.url),
      "utf8",
    );
    const { cartes } = lireRecherche(recherche);
    assert.deepEqual(
      cartes.map((c) => c.surface),
      [85, 34, 28],
    );
    const annonces = cimalpesListings(cartes, {
      stationId: "val-thorens",
      stationName: "Val Thorens",
      lat: 45.297,
      lon: 6.58,
      checkIn: "2027-02-06",
      checkOut: "2027-02-13",
      guests: 2,
      bedrooms: 0,
    });
    assert.equal(annonces.length, 3);
    const ditesMuettes = annonces.filter((l) => {
      const champs: string[] = champsNonIndiques(l);
      return champs.includes("surface");
    });
    assert.deepEqual(
      ditesMuettes.map((l) => l.title),
      [],
    );
    // Le `null` que pose CozyCozy (`surfaceText` vide) ne prouve pas davantage
    // que Booking, Abritel ou Airbnb la taisent.
    const surfaceNulle = { ...PLEINE, surface: null };
    assert.deepEqual(champsNonIndiques(surfaceNulle), []);
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
