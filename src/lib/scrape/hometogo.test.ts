import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compteurPublie,
  lieuDepuisHtml,
  noteDe,
  offreEnListing,
  pageSuivante,
  prixAffiche,
  slugsLieu,
} from "./hometogo.ts";
import type { LiveSearchInput } from "./types.ts";

/**
 * Champs repris d'une réponse HomeToGo réelle (Les Deux Alpes, 9 octobre 2026) :
 * seulement les clés lues par le collecteur. Rien n'y est ajouté pour le test.
 */

const INPUT: LiveSearchInput = {
  stationId: "les-2-alpes",
  stationName: "Les 2 Alpes",
  lat: 45.01,
  lon: 6.12,
  checkIn: "2027-02-06",
  checkOut: "2027-02-13",
  guests: 8,
  bedrooms: 4,
};

const HTML = `<script id="location-data-json" type="application/json">{"data":{"locationId":"5460aec004a18","seoDocumentId":"81055cb257acb87e5e8899435d3c5318"}}</script>
"location":"France/Auvergne-Rhône-Alpes/Isère/Les Deux Alpes"`;

describe("lieu HomeToGo", () => {
  it("prend l'identifiant publié quand le dernier maillon est la station", () => {
    assert.deepEqual(lieuDepuisHtml(HTML, "Les 2 Alpes"), {
      locationId: "5460aec004a18",
      fsid: "81055cb257acb87e5e8899435d3c5318",
    });
  });

  it("refuse une page dont le lieu publié n'est pas la station", () => {
    assert.equal(lieuDepuisHtml(HTML, "Val Thorens"), null);
    assert.equal(lieuDepuisHtml("<html></html>", "Les 2 Alpes"), null);
  });

  it("essaie le slug en toutes lettres avant le chiffre", () => {
    assert.deepEqual(slugsLieu("Les 2 Alpes"), ["les-deux-alpes", "les-2-alpes"]);
  });
});

describe("compteur et page", () => {
  it("lit le compteur affiché, pas un nombre fabriqué", () => {
    assert.equal(compteurPublie({ totalCount: "4 490" }), 4490);
    assert.equal(compteurPublie({ totalCount: "46" }), 46);
    assert.equal(compteurPublie({ totalCountRaw: 50 }), null);
    assert.equal(compteurPublie({}), null);
  });

  it("avance tant que la source donne une page suivante", () => {
    assert.equal(
      pageSuivante({
        pagerFilter: { pager: { isLastPage: false, currentPage: 1, nextPageLink: { page: 2 } } },
      }),
      2,
    );
    assert.equal(
      pageSuivante({
        pagerFilter: { pager: { isLastPage: true, currentPage: 1, nextPageLink: { page: 1 } } },
      }),
      null,
    );
  });
});

describe("note et prix", () => {
  it("garde la note seulement quand l'échelle est écrite", () => {
    assert.deepEqual(
      noteDe({
        reviewCount: 2,
        value: "8,0",
        maxStarValue: "5,0",
        starValue: "4,0",
        starMessage: "Evaluation moyenne de l'hébergement : 4,0 sur 5.",
      }),
      { rating: 4, reviewCount: 2 },
    );
    assert.deepEqual(noteDe({ value: "8,0", reviewCount: 12 }), { rating: null, reviewCount: 12 });
  });

  it("lit un total en euros, et un « dès » n'en est pas un", () => {
    assert.deepEqual(prixAffiche("1 610 €"), { total: 1610, currency: "EUR", indicatif: false });
    assert.deepEqual(prixAffiche("dès 43 €"), { total: 0, currency: "EUR", indicatif: true });
    assert.equal(prixAffiche("1610"), null);
  });
});

describe("offre", () => {
  it("relève le détail publié : nom, total exact, capacité, avis, équipements", () => {
    const row = offreEnListing(
      {
        id: "4fe03c3d34a6d703",
        objectName: null,
        name: "Merveilleux appartement de vacances | Vue montagne",
        type: "Appartement",
        persons: 10,
        bedrooms: 5,
        bathrooms: 3,
        petFriendly: true,
        geoLocation: { lat: 45.009, lon: 6.121 },
        locationShorted: "Mont-de-Lans, Isère, France",
        price: {
          exact: true,
          mode: "totalPrice",
          totalRaw: 6321,
          currency: "EUR",
          display: "6 321 €",
        },
        ratings: {
          reviewCount: 2,
          value: "8,0",
          maxStarValue: "5,0",
          starValue: "4,0",
          starMessage: "Evaluation moyenne de l'hébergement : 4,0 sur 5.",
        },
        description: { unit: { content: "Grand appartement 7 pièces de 99m² pour 10 personnes." } },
        amenities: { icons: [{ label: "Cheminée" }, { label: "Accès internet" }] },
        images: [{ large: "//cdn.hometogo.net/large/v1/a.jpg" }],
        actions: { conversion: { first: { link: "/rental/4fe03c3d34a6d703?clickId=abc&arrival=2027-02-06&duration=7&location=5460aec004a18&pricetype=totalPrice" } } },
      },
      INPUT,
      "5460aec004a18",
      7,
    );
    assert.ok(row);
    assert.equal(row.source, "HomeToGo");
    assert.equal(row.total, 6321);
    assert.equal(row.currency, "EUR");
    assert.equal(row.capacity, 10);
    assert.equal(row.bedrooms, 5);
    assert.equal(row.baths, 3);
    assert.equal(row.rating, 4);
    assert.equal(row.reviewCount, 2);
    assert.equal(row.propertyType, "Appartement");
    assert.match(row.description ?? "", /99m²/);
    assert.equal(row.photo, "https://cdn.hometogo.net/large/v1/a.jpg");
    assert.equal(row.locality, "Mont-de-Lans, Isère, France");
    assert.match(row.url ?? "", /^https:\/\/www\.hometogo\.fr\/rental\/4fe03c3d34a6d703\?/);
    assert.doesNotMatch(row.url ?? "", /clickId/);
    assert.equal(row.amenities?.find((a) => a.cle === "wifi")?.valeur, "oui");
    assert.equal(row.amenities?.find((a) => a.cle === "animaux")?.valeur, "oui");
    assert.equal(row.amenities?.find((a) => a.cle === "piscine")?.valeur, "inconnu");
  });

  it("laisse de côté un squelette sans titre", () => {
    assert.equal(
      offreEnListing({ id: "abc", geoLocation: { lat: 1, lon: 2 } }, INPUT, "5460aec004a18", 7),
      null,
    );
  });

  it("ne prend pas un prix dont l'exactitude n'est pas publiée comme total", () => {
    const row = offreEnListing(
      {
        id: "abc123",
        title: "Chalet",
        price: { exact: false, mode: "totalPrice", totalRaw: 14, currency: "EUR", display: "14 €" },
      },
      INPUT,
      "5460aec004a18",
      7,
    );
    assert.equal(row?.total, 0);
    assert.equal(row?.priceIndicative, true);
    assert.equal(row?.priceLabel, "14 €");
  });
});
