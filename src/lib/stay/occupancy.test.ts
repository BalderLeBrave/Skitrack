import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  annoncer,
  bedroomsFromRooms,
  occupancyFromRecord,
  occupancyFromText,
  occupancyOfListing,
} from "./occupancy.ts";

describe("occupancy : ce que la source a écrit, rien de plus", () => {
  it("lit une capacité nette", () => {
    assert.deepEqual(occupancyFromText("Demi chalet de gauche 8 personnes Les renoncules 2"), {
      guests: 8,
      bedrooms: null,
    });
  });

  it("refuse le titre à deux logements", () => {
    // 6 ou 12 : choisir c'est inventer.
    assert.deepEqual(occupancyFromText("2 appartements de 6 personnes face à face"), {
      guests: null,
      bedrooms: null,
    });
    assert.deepEqual(occupancyFromText("2-appartements-de-6-personnes"), {
      guests: null,
      bedrooms: null,
    });
  });

  it("prend le haut d'une fourchette 7/8", () => {
    assert.equal(occupancyFromText("Capacité 7/8 personnes").guests, 8);
    assert.equal(occupancyFromText("Appartement 3 pièces 7-8 pers.").guests, 8);
    assert.equal(occupancyFromText("Les Deux-Alpes, appartement 6-8 pers, cosy, calme").guests, 8);
    assert.equal(occupancyFromText("Grand appartement pied des pistes 13-15 personnes").guests, 15);
  });

  it("traduit les pièces en chambres, pas le contraire", () => {
    assert.equal(bedroomsFromRooms(3), 2);
    assert.equal(bedroomsFromRooms(1), 0);
    assert.equal(bedroomsFromRooms(null), null);
    assert.deepEqual(occupancyFromText("Appartement 3 pièces 8 personnes"), {
      guests: 8,
      bedrooms: 2,
    });
  });

  it("un studio n'a pas de chambre", () => {
    assert.deepEqual(occupancyFromText("STUDIO CABINE 4 pers."), { guests: 4, bedrooms: 0 });
  });

  it("T3 vaut deux chambres", () => {
    assert.equal(occupancyFromText("T3 6 personnes").bedrooms, 2);
  });

  it("8 couchages est une capacité, 6 lits n'en est pas une", () => {
    assert.equal(occupancyFromText("Appartement : 8 couchages face aux pistes").guests, 8);
    assert.deepEqual(occupancyFromText("6 lits · 3 chambres"), { guests: null, bedrooms: 3 });
  });

  it("lit un slug à tirets, la même phrase que le titre", () => {
    assert.equal(
      occupancyFromText("l-olympe-n11-appartement-8-personnes-les-2-alpes.html").guests,
      8,
    );
    assert.deepEqual(
      occupancyFromText("vacanceole-l-edelweiss-appartement-2-pieces-cabine-8-personnes"),
      { guests: 8, bedrooms: 1 },
    );
  });

  it("le champ publié l'emporte sur le titre", () => {
    const o = annoncer({ guests: 10, bedrooms: 4 }, "8 personnes · 2 chambres");
    assert.deepEqual(o, { guests: 10, bedrooms: 4 });
  });

  it("le titre complète un JSON muet", () => {
    const o = annoncer({ guests: null, bedrooms: null }, "Chalet 10 personnes 4 chambres");
    assert.deepEqual(o, { guests: 10, bedrooms: 4 });
  });

  it("relit titre et URL d'une fiche déjà construite", () => {
    assert.deepEqual(
      occupancyOfListing({
        guests: null,
        bedrooms: 3,
        title: "Les Deux-Alpes, appartement 6-8 pers, cosy, calme",
        url: null,
      }),
      { guests: 8, bedrooms: 3 },
    );
    assert.deepEqual(
      occupancyOfListing({
        guests: 8,
        bedrooms: null,
        title: "Vacancéole - l'Edelweiss-",
        url: "https://reservation.les2alpes.com/vacanceole-l-edelweiss-appartement-2-pieces-cabine-8-personnes-les-2-alpes.html",
      }),
      { guests: 8, bedrooms: 1 },
    );
  });

  it("lit les clés structurées d'une fiche Cozy / Airbnb", () => {
    assert.deepEqual(
      occupancyFromRecord({
        name: "Chalet",
        subTitleDetails: { guestCapacity: 8, bedRoomCount: 3 },
      }),
      { guests: 8, bedrooms: 3 },
    );
    assert.deepEqual(
      occupancyFromRecord({ personCapacity: "6", bedroomCount: 0 }),
      { guests: 6, bedrooms: 0 },
    );
  });

  it("lit occupancy.maxPersons d'une fiche Booking", () => {
    assert.deepEqual(
      occupancyFromRecord({ occupancy: { maxPersons: 8 }, numberOfBedrooms: 3 }),
      { guests: 8, bedrooms: 3 },
    );
  });

  it("lit personCapacity dans loggingContext Airbnb", () => {
    assert.equal(
      occupancyFromRecord({
        loggingContext: { eventDataLogging: { personCapacity: 8 } },
      }).guests,
      8,
    );
  });
});
