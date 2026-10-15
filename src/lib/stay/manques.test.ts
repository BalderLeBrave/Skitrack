import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import { equipements } from "./equipements.ts";
import { CHAMPS, manquesDe } from "./manques.ts";

function annonce(p: Partial<Listing> = {}): Listing {
  return {
    id: "x",
    stationId: "les-2-alpes",
    title: "Appartement",
    source: "Centrale",
    total: 900,
    currency: "EUR",
    capacity: 4,
    bedrooms: 1,
    available: true,
    photo: "https://exemple.test/p.jpg",
    url: "https://exemple.test/fiche",
    lat: 45.01,
    lon: 6.12,
    proven: "test",
    description: "Au pied des pistes.",
    amenities: equipements({ wifi: "oui" }),
    ...p,
  };
}

const fiche = (p: Partial<NonNullable<Listing["fiche"]>> = {}): NonNullable<Listing["fiche"]> => ({
  description: null,
  equipements: [],
  avis: null,
  conditions: null,
  sourceFiche: "booking",
  ...p,
});

describe("manquesDe : ce qui manque, lu comme l'écran", () => {
  it("une annonce complète : rien", () => {
    assert.deepEqual(manquesDe(annonce()), []);
  });

  it("une annonce vide : tout, dans l'ordre des champs", () => {
    const vide = annonce({
      total: 0,
      capacity: null,
      bedrooms: null,
      photo: null,
      url: null,
      lat: null,
      lon: null,
      description: null,
      amenities: null,
    });
    assert.deepEqual(manquesDe(vide), [...CHAMPS]);
  });

  it("équipements : tous « inconnu », ou une fiche lue qui n'en publie pas, c'est un manque", () => {
    assert.deepEqual(manquesDe(annonce({ amenities: equipements({}) })), ["equipements"]);
    // La fiche lue décide seule : les douze clés du collecteur ne comptent plus.
    assert.deepEqual(manquesDe(annonce({ fiche: fiche({ description: "Chalet" }) })), [
      "equipements",
    ]);
    // Une fiche indisponible ne dit rien : l'annonce garde les siens.
    assert.deepEqual(manquesDe(annonce({ fiche: fiche({ indisponible: true }) })), []);
    // Une liste publiée sans fiche suffit.
    assert.deepEqual(
      manquesDe(annonce({ amenities: null, equipementsPublies: [{ libelle: "Télévision" }] })),
      [],
    );
  });

  it("description : celle de la fiche compte, un texte blanc non", () => {
    assert.deepEqual(manquesDe(annonce({ description: "   " })), ["description"]);
    assert.deepEqual(
      manquesDe(
        annonce({
          description: null,
          fiche: fiche({
            description: "Chalet",
            equipements: [{ id: "wifi", libelle: "Wifi", present: true }],
          }),
        }),
      ),
      [],
    );
  });

  it("chambres : des pièces publiées bouchent le trou, comme pour l'écran ; un GPS triangulé non", () => {
    assert.deepEqual(manquesDe(annonce({ bedrooms: null, rooms: 2 })), []);
    assert.deepEqual(manquesDe(annonce({ bedrooms: null, rooms: 0 })), ["chambres"]);
    assert.deepEqual(manquesDe(annonce({ gpsSource: "triangule" })), ["gps"]);
  });
});
