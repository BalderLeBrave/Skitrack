import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import { completudeOf } from "./completude.ts";
import { airbnbIdOf, enrichirListing } from "./enrichir.ts";

function fiche(extra: Partial<Listing> = {}): Listing {
  return {
    id: "x",
    stationId: "les-2-alpes",
    title: "Appartement",
    source: "Booking",
    total: 1800,
    currency: "EUR",
    guests: null,
    bedrooms: null,
    available: true,
    photo: null,
    url: null,
    lat: 45.01,
    lon: 6.12,
    proven: "test",
    ...extra,
  };
}

describe("enrichir : ce que la fiche porte déjà, ailleurs que dans le champ", () => {
  it("relit la capacité d'un titre muet dans les champs dédiés", () => {
    const l = enrichirListing(fiche({ title: "Duplex T3 8 personnes, 3 chambres" }));
    assert.equal(l.guests, 8);
    assert.equal(l.bedrooms, 3);
    assert.equal(l.rooms, 3);
  });

  it("relit un F3 comme trois pièces", () => {
    assert.equal(enrichirListing(fiche({ title: "F3 pied des pistes" })).rooms, 3);
  });

  it("accueille 10 et capacité 8 sont des lectures, pas des inventions", () => {
    assert.equal(enrichirListing(fiche({ title: "Chalet pouvant accueillir 10" })).guests, 10);
    assert.equal(enrichirListing(fiche({ title: "Capacité : 8" })).guests, 8);
  });

  it("la première photo de la galerie devient la vignette", () => {
    const l = enrichirListing(fiche({ photos: ["https://example.test/a.jpg", "https://example.test/b.jpg"] }));
    assert.equal(l.photo, "https://example.test/a.jpg");
  });

  it("ne touche pas à un champ déjà publié", () => {
    const l = enrichirListing(fiche({ guests: 6, title: "8 personnes" }));
    assert.equal(l.guests, 6);
  });

  it("lit l'identifiant Airbnb dans une photo Hosting-", () => {
    assert.equal(
      airbnbIdOf({
        photo:
          "https://a0.muscache.com/im/pictures/miso/Hosting-27623894/original/f09c2e09-9c61-4a8a-a3a2-d7481a14b78e.jpeg",
      }),
      "27623894",
    );
    const l = enrichirListing(
      fiche({
        source: "Airbnb",
        photo:
          "https://a0.muscache.com/im/pictures/hosting/Hosting-1757046953983158073/original/2f989533-ba5c-40ee-8701-eae2ab2a7052.jpeg",
      }),
    );
    assert.equal(l.url, "https://www.airbnb.fr/rooms/1757046953983158073");
    assert.equal(l.platformId, "1757046953983158073");
  });

  it("décode un Hosting- en base64 StaySupplyListing", () => {
    assert.equal(
      airbnbIdOf({
        photo:
          "https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6MTI3MDI5NzA3ODg4MjcxMTg2Nw%3D%3D/original/9f943686-ca09-4ef4-aa4c-8cdd21d1af19.jpeg",
      }),
      "1270297078882711867",
    );
  });

  it("ne fabrique pas de lien Airbnb sans identifiant, et n'écrase pas une URL publiée", () => {
    const muet = enrichirListing(
      fiche({
        source: "Airbnb",
        photo: "https://a0.muscache.com/im/pictures/19655484-1232-4234-9f94-133a8df1a28d.jpg",
      }),
    );
    assert.equal(muet.url, null);
    const deja = enrichirListing(
      fiche({
        source: "Airbnb",
        url: "https://www.airbnb.fr/rooms/1",
        photo:
          "https://a0.muscache.com/im/pictures/miso/Hosting-27623894/original/x.jpeg",
      }),
    );
    assert.equal(deja.url, "https://www.airbnb.fr/rooms/1");
  });

  it("une tuile Airbnb muette devient complète dès que photo et titre parlent", () => {
    const avant = fiche({
      id: "abnb-6-8-cosy",
      source: "Airbnb",
      title: "Les Deux-Alpes, appartement 6-8 pers, cosy, calme",
      total: 2231,
      guests: null,
      bedrooms: 3,
      photo:
        "https://a0.muscache.com/im/pictures/miso/Hosting-27623894/original/f09c2e09-9c61-4a8a-a3a2-d7481a14b78e.jpeg",
      url: null,
      lat: 45.022,
      lon: 6.1247,
    });
    assert.equal(completudeOf(avant).ok, false);
    assert.ok(completudeOf(avant).trous.includes("url"));
    assert.ok(completudeOf(avant).trous.includes("capacite"));
    const cosy = enrichirListing(avant);
    assert.equal(cosy.guests, 8);
    assert.equal(cosy.url, "https://www.airbnb.fr/rooms/27623894");
    assert.equal(completudeOf(cosy).ok, true);
    const jardin = enrichirListing(
      fiche({
        source: "Airbnb",
        title: "Le Jardin Alpin : Les 2 Alpes",
        bedrooms: 4,
        photo: "https://a0.muscache.com/im/pictures/19655484-1232-4234-9f94-133a8df1a28d.jpg",
      }),
    );
    assert.equal(jardin.url, null);
    assert.equal(jardin.guests, null);
    assert.ok(completudeOf(jardin).trous.includes("url"));
    assert.ok(completudeOf(jardin).trous.includes("capacite"));
  });
});
