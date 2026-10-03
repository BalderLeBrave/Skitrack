import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { annoncesDansLeBudget, entreeApify, lireSortieApify, montantEuros } from "./airbnbApify.ts";

describe("Apify Airbnb : budget et entrée", () => {
  it("5 $ par recherche : 999 annonces au palier gratuit, rien au-delà", () => {
    assert.equal(annoncesDansLeBudget(0), 999);
    assert.equal(annoncesDansLeBudget(4.9), 19);
    assert.equal(annoncesDansLeBudget(5), 0);
    assert.equal(annoncesDansLeBudget(6), 0);
  });

  it("les pages rooms/, les dates, le groupe, en euros et en français", () => {
    assert.deepEqual(entreeApify(["41701345"], { checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 6 }), {
      startUrls: [{ url: "https://www.airbnb.fr/rooms/41701345" }],
      checkIn: "2027-02-06",
      checkOut: "2027-02-13",
      adults: 6,
      currency: "EUR",
      locale: "fr-FR",
    });
  });
});

describe("Apify Airbnb : la sortie de l'acteur", () => {
  it("capacité, chambres et lits du résumé, point, photos, total du séjour", () => {
    const f = lireSortieApify({
      id: "41701345",
      url: "https://www.airbnb.fr/rooms/41701345",
      personCapacity: 6,
      subDescription: { title: "Logement entier : appartement", items: ["6 voyageurs", "2 chambres", "3 lits", "1 salle de bain"] },
      coordinates: { latitude: 45.02298, longitude: 6.12571 },
      images: [{ imageUrl: "https://a0.muscache.com/im/pictures/a.jpg", caption: "" }, { imageUrl: "https://a0.muscache.com/im/pictures/b.jpg" }],
      price: { label: "1 234 € au total", price: "1 234 €", qualifier: "au total", breakDown: { total: { description: "Total", price: "1 234,50 €" } } },
    });
    assert.deepEqual(f, {
      id: "41701345",
      capacity: 6,
      bedrooms: 2,
      beds: 3,
      lat: 45.02298,
      lon: 6.12571,
      photo: "https://a0.muscache.com/im/pictures/a.jpg",
      photos: ["https://a0.muscache.com/im/pictures/a.jpg", "https://a0.muscache.com/im/pictures/b.jpg"],
      total: 1234.5,
      priceLabel: "1 234,50 € au total",
    });
  });

  it("un prix à la nuit n'est pas un total ; un studio a 0 chambre ; l'identifiant de l'URL", () => {
    const f = lireSortieApify({
      url: "https://www.airbnb.com/rooms/53997462?check_in=2027-02-06",
      subDescription: { items: ["Studio", "2 voyageurs"] },
      price: { price: "€120", qualifier: "par nuit" },
    });
    assert.equal(f?.id, "53997462");
    assert.equal(f?.bedrooms, 0);
    assert.equal(f?.total, null);
    assert.equal(f?.capacity, null);
  });

  it("rien qui ne nomme son annonce", () => {
    assert.equal(lireSortieApify({ personCapacity: 4 }), null);
    assert.equal(lireSortieApify(null), null);
  });

  it("montants : espaces fines, séparateurs de milliers et décimales", () => {
    assert.equal(montantEuros("1\u202f234,56 €"), 1234.56);
    assert.equal(montantEuros("€1,234.56"), 1234.56);
    assert.equal(montantEuros("2 231 €"), 2231);
    assert.equal(montantEuros("120 $"), null);
  });
});
