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
      rooms: null,
    });
  });

  it("refuse le titre à deux logements", () => {
    // 6 ou 12 : choisir c'est inventer.
    assert.deepEqual(occupancyFromText("2 appartements de 6 personnes face à face"), {
      guests: null,
      bedrooms: null,
      rooms: null,
    });
    assert.deepEqual(occupancyFromText("2-appartements-de-6-personnes"), {
      guests: null,
      bedrooms: null,
      rooms: null,
    });
  });

  it("N°505 Appartement 8 personnes n'est pas cinq cent cinq logements", () => {
    assert.equal(occupancyFromText("LE PRINCE DES ECRINS 505 Appartement 8 personnes").guests, 8);
    assert.equal(occupancyFromText("LE JANDRI 02S01 Appartement 8 personnes").guests, 8);
    assert.equal(
      occupancyOfListing({
        guests: null,
        bedrooms: null,
        title: "LE PRINCE DES ECRINS 505 Appartement 8 personnes",
        url: "https://reservation.les2alpes.com/le-prince-des-ecrins-n505-appartement-8-personnes-les-2-alpes.html",
      }).guests,
      8,
    );
  });

  it("prend le haut d'une fourchette 7/8", () => {
    assert.equal(occupancyFromText("Capacité 7/8 personnes").guests, 8);
    assert.equal(occupancyFromText("Appartement 3 pièces 7-8 pers.").guests, 8);
    assert.equal(occupancyFromText("Les Deux-Alpes, appartement 6-8 pers, cosy, calme").guests, 8);
    assert.equal(occupancyFromText("Grand appartement pied des pistes 13-15 personnes").guests, 15);
  });

  it("les pièces se lisent comme des pièces, et ne deviennent des chambres qu'à la comparaison", () => {
    // La conversion existe toujours — le filtre s'en sert — mais elle n'est
    // plus écrite dans `bedrooms` : « 3 pièces » n'est pas « 2 chambres »
    // publiées, et la vignette ne doit pas prétendre le contraire.
    assert.equal(bedroomsFromRooms(3), 2);
    assert.equal(bedroomsFromRooms(1), 0);
    assert.equal(bedroomsFromRooms(null), null);
    assert.deepEqual(occupancyFromText("Appartement 3 pièces 8 personnes"), {
      guests: 8,
      bedrooms: null,
      rooms: 3,
    });
    // Des chambres publiées restent des chambres publiées.
    assert.deepEqual(occupancyFromText("Chalet 10 personnes 4 chambres"), {
      guests: 10,
      bedrooms: 4,
      rooms: null,
    });
  });

  it("un studio est une pièce et aucune chambre, et les deux sont publiés", () => {
    assert.deepEqual(occupancyFromText("STUDIO CABINE 4 pers."), {
      guests: 4,
      bedrooms: 0,
      rooms: 1,
    });
  });

  it("T3 vaut trois pièces", () => {
    assert.equal(occupancyFromText("T3 6 personnes").rooms, 3);
    assert.equal(occupancyFromText("T3 6 personnes").bedrooms, null);
  });

  it("8 couchages est une capacité, 6 lits n'en est pas une", () => {
    assert.equal(occupancyFromText("Appartement : 8 couchages face aux pistes").guests, 8);
    assert.deepEqual(occupancyFromText("6 lits · 3 chambres"), {
      guests: null,
      bedrooms: 3,
      rooms: null,
    });
  });

  it("lit un slug à tirets, la même phrase que le titre", () => {
    assert.equal(
      occupancyFromText("l-olympe-n11-appartement-8-personnes-les-2-alpes.html").guests,
      8,
    );
    assert.deepEqual(
      occupancyFromText("vacanceole-l-edelweiss-appartement-2-pieces-cabine-8-personnes"),
      { guests: 8, bedrooms: null, rooms: 2 },
    );
  });

  it("le champ publié l'emporte sur le titre", () => {
    const o = annoncer({ guests: 10, bedrooms: 4 }, "8 personnes · 2 chambres");
    assert.deepEqual(o, { guests: 10, bedrooms: 4, rooms: null });
  });

  it("le titre complète un JSON muet", () => {
    const o = annoncer({ guests: null, bedrooms: null }, "Chalet 10 personnes 4 chambres");
    assert.deepEqual(o, { guests: 10, bedrooms: 4, rooms: null });
  });

  it("relit titre et URL d'une fiche déjà construite", () => {
    assert.deepEqual(
      occupancyOfListing({
        guests: null,
        bedrooms: 3,
        title: "Les Deux-Alpes, appartement 6-8 pers, cosy, calme",
        url: null,
      }),
      { guests: 8, bedrooms: 3, rooms: null },
    );
    assert.deepEqual(
      occupancyOfListing({
        guests: 8,
        bedrooms: null,
        title: "Vacancéole - l'Edelweiss-",
        url: "https://reservation.les2alpes.com/vacanceole-l-edelweiss-appartement-2-pieces-cabine-8-personnes-les-2-alpes.html",
      }),
      { guests: 8, bedrooms: null, rooms: 2 },
    );
  });

  it("lit les clés structurées d'une fiche Cozy / Airbnb", () => {
    assert.deepEqual(
      occupancyFromRecord({
        name: "Chalet",
        subTitleDetails: { guestCapacity: 8, bedRoomCount: 3 },
      }),
      { guests: 8, bedrooms: 3, rooms: null },
    );
    assert.deepEqual(
      occupancyFromRecord({ personCapacity: "6", bedroomCount: 0 }),
      { guests: 6, bedrooms: 0, rooms: null },
    );
  });

  it("lit occupancy.maxPersons d'une fiche Booking", () => {
    assert.deepEqual(
      occupancyFromRecord({ occupancy: { maxPersons: 8 }, numberOfBedrooms: 3 }),
      { guests: 8, bedrooms: 3, rooms: null },
    );
  });

  it("lit sleeps et maxOccupancy comme une capacité publiée", () => {
    assert.deepEqual(occupancyFromRecord({ sleeps: 8, bedroomCount: 3 }), {
      guests: 8,
      bedrooms: 3,
      rooms: null,
    });
    assert.equal(occupancyFromRecord({ maxOccupancy: 10 }).guests, 10);
  });

  it("lit personCapacity dans loggingContext Airbnb", () => {
    assert.equal(
      occupancyFromRecord({
        loggingContext: { eventDataLogging: { personCapacity: 8 } },
      }).guests,
      8,
    );
  });

  it("lit l'abréviation 8p / 10 P d'une tuile, pas un 2p cabine", () => {
    assert.equal(occupancyFromText("8p · 3 chambres").guests, 8);
    assert.equal(occupancyFromText("10 P").guests, 10);
    assert.equal(occupancyFromText("Appartement 8p 80m²").guests, 8);
    assert.equal(occupancyFromText("Superbe Appartement 8P pied des pistes (Réf 32)").guests, 8);
    assert.equal(occupancyFromText("Chalet 10p sauna /superbe vue").guests, 10);
    assert.equal(occupancyFromText("2p cabine").guests, null);
    assert.equal(occupancyFromText("Appartement 2 pièces cabine").guests, null);
    assert.equal(occupancyFromText("2 pièces · 4 pers.").guests, 4);
  });

  it("accueille, capacité, F3 et 3 ch. sont des lectures", () => {
    assert.equal(occupancyFromText("Chalet pouvant accueillir 10").guests, 10);
    assert.equal(occupancyFromText("Capacité : 8").guests, 8);
    assert.equal(occupancyFromText("F3 pied des pistes").rooms, 3);
    assert.equal(occupancyFromText("Appartement 3 ch. sud").bedrooms, 3);
    assert.equal(occupancyFromText("Grand chalet").bedrooms, null);
  });

  it("sleeps 8, cap. 8 et capacity 8 sont des lectures", () => {
    assert.equal(occupancyFromText("Cabin sleeps 8 near the slopes").guests, 8);
    assert.equal(occupancyFromText("Appartement cap. 8 pied des pistes").guests, 8);
    assert.equal(occupancyFromText("capacity 10 with sauna").guests, 10);
    assert.equal(occupancyFromText("cape of 8 mountains").guests, null);
  });

  it("lit un slug de photo comme un titre", () => {
    assert.equal(
      occupancyOfListing({
        guests: null,
        bedrooms: null,
        title: "L'OLYMPE N°11",
        url: null,
        photo:
          "https://reservation.les2alpes.com/medias/images/prestations/l-olympe-appartement-8-personnes-10.jpeg",
      }).guests,
      8,
    );
  });
});
