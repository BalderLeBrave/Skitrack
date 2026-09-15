import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { completudeOf, galerieOf, trouLbl, trousPhrase } from "./completude.ts";

function sujet(extra: Partial<Parameters<typeof completudeOf>[0]> = {}) {
  return {
    total: 1800,
    guests: 8,
    bedrooms: 3,
    rooms: null,
    lat: 45.01,
    lon: 6.12,
    photo: "https://example.test/a.jpg",
    url: "https://example.test/a",
    ...extra,
  };
}

describe("completude : ce qui manque se nomme, un zéro n'est pas un prix", () => {
  it("une fiche pleine n'a aucun trou", () => {
    const c = completudeOf(sujet());
    assert.equal(c.ok, true);
    assert.deepEqual(c.trous, []);
  });

  it("un total à 0 est un prix non publié, pas un séjour gratuit", () => {
    const c = completudeOf(sujet({ total: 0 }));
    assert.equal(c.ok, false);
    assert.ok(c.trous.includes("prix"));
    assert.equal(trouLbl("prix"), "prix non publié");
  });

  it("des pièces publiées tiennent lieu de chambres sur la fiche", () => {
    const c = completudeOf(sujet({ bedrooms: null, rooms: 3 }));
    assert.equal(c.ok, true);
    assert.ok(!c.trous.includes("chambres"));
  });

  it("ni chambres ni pièces : le trou se dit", () => {
    const c = completudeOf(sujet({ bedrooms: null, rooms: null }));
    assert.ok(c.trous.includes("chambres"));
  });

  it("GPS, photo, lien, capacité : chaque absence a son nom", () => {
    const c = completudeOf(
      sujet({ guests: null, lat: null, lon: null, photo: null, url: null, total: 0, bedrooms: null }),
    );
    assert.deepEqual(c.trous, ["prix", "capacite", "chambres", "gps", "photo", "url"]);
  });

  it("la galerie déduplique, photo d'abord", () => {
    assert.deepEqual(galerieOf({ photo: "a.jpg", photos: ["a.jpg", "b.jpg", "b.jpg"] }), ["a.jpg", "b.jpg"]);
    assert.deepEqual(galerieOf({ photo: null, photos: null }), []);
  });

  it("une galerie sans vignette n'est pas une photo manquante", () => {
    const c = completudeOf(sujet({ photo: null, photos: ["https://example.test/b.jpg"] }));
    assert.ok(!c.trous.includes("photo"));
  });

  it("nomme les trous d'un relevé, pas un zéro global", () => {
    const phrase = trousPhrase([
      sujet(),
      sujet({ lat: null, lon: null, url: null }),
      sujet({ guests: null, total: 0 }),
    ]);
    assert.equal(phrase, "1 sans prix, 1 sans capacité, 1 sans GPS, 1 sans lien");
  });
});
