import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import { photosDeResidence } from "./photoResidence.ts";

function annonce(p: Partial<Listing> & Pick<Listing, "id" | "source" | "title">): Listing {
  return {
    stationId: "la-plagne",
    total: 1000,
    currency: "EUR",
    capacity: 4,
    bedrooms: 1,
    available: true,
    photo: null,
    url: null,
    lat: null,
    lon: null,
    proven: "relevé",
    ...p,
  };
}
const sp = (id: string, residence: string, p: Partial<Listing> = {}) =>
  annonce({ id, source: "Ski-Planet", title: `${residence} — Appartement 2 pièces 4 personnes`, ...p });

describe("photo d'une résidence Ski-Planet reprise d'une autre source", () => {
  it("le nom propre de la résidence dans le titre d'une autre annonce : sa photo, dite", () => {
    const r = photosDeResidence([
      sp("sp-1", "Résidence Le Serro Torre"),
      annonce({ id: "mv-1", source: "Maeva", title: "Résidence Serro Torre - 2 pièces 5 personnes", photo: "https://x/serro.jpg" }),
    ]);
    assert.deepEqual(r.get("sp-1"), { photo: "https://x/serro.jpg", proven: "photo : même résidence, publiée par Maeva" });
  });

  it("pas une annonce qui a déjà sa photo, pas un autre bâtiment (« Les Quirlies II »)", () => {
    const r = photosDeResidence([
      sp("sp-1", "Résidence les Quirlies"),
      sp("sp-2", "Résidence Le Serro Torre", { photo: "https://x/sp.jpg" }),
      annonce({ id: "a-1", source: "Booking", title: "Les Quirlies II, appartement 6 pers", photo: "https://x/q2.jpg" }),
      annonce({ id: "a-2", source: "Booking", title: "Serro Torre", photo: "https://x/s.jpg" }),
    ]);
    assert.equal(r.size, 0);
  });

  it("pas un nom contenu dans celui d'une autre résidence Ski-Planet (« Les Hauts Ecrins »)", () => {
    const r = photosDeResidence([
      sp("sp-1", "Résidence Les Ecrins"),
      sp("sp-2", "Résidence Les Hauts Ecrins", { photo: "https://x/he.jpg" }),
      annonce({ id: "a-1", source: "Abritel", title: "Studio aux Hauts Ecrins", photo: "https://x/he2.jpg" }),
    ]);
    assert.equal(r.has("sp-1"), false);
  });

  it("un nom court d'un seul mot : seulement avec les deux points, proches", () => {
    const sansPoint = photosDeResidence([
      sp("sp-1", "Résidence Soleil"),
      annonce({ id: "a-1", source: "Booking", title: "Résidence Soleil", photo: "https://x/s.jpg", lat: 45.5, lon: 6.7 }),
    ]);
    assert.equal(sansPoint.size, 0);
    const proches = photosDeResidence([
      sp("sp-1", "Résidence Soleil", { lat: 45.5, lon: 6.7 }),
      annonce({ id: "a-1", source: "Booking", title: "Résidence Soleil", photo: "https://x/s.jpg", lat: 45.501, lon: 6.7 }),
    ]);
    assert.equal(proches.get("sp-1")?.photo, "https://x/s.jpg");
  });

  it("deux résidences du même nom, loin l'une de l'autre : rien", () => {
    const r = photosDeResidence([
      sp("sp-1", "Résidence Le Serro Torre"),
      annonce({ id: "a-1", source: "Booking", title: "Le Serro Torre", photo: "https://x/1.jpg", lat: 45.5, lon: 6.7 }),
      annonce({ id: "a-2", source: "Abritel", title: "Le Serro Torre", photo: "https://x/2.jpg", lat: 45.52, lon: 6.7 }),
    ]);
    assert.equal(r.size, 0);
  });
});
