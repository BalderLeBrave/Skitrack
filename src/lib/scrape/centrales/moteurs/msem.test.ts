import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { corpsOffresMsem, joindreMsem, urlCatalogueMsem, urlOffresMsem } from "./msem.ts";

/**
 * Relevé du 13 septembre 2026 sur `services.msem.tech`, station 595 (Sainte-Foy
 * Tarentaise), canal OT-595, séjour du 6 au 13 février 2027 à huit personnes.
 *
 * Les deux premiers hébergements et leurs deux offres sont ceux de la centrale,
 * verbatim. Quatre cas leur sont ajoutés pour éprouver les bords, et ils sont
 * construits : un hébergement au catalogue que la centrale ne vend pas à ces
 * dates, une capacité déclarée à zéro comme l'Alpe d'Huez sait en produire, une
 * offre dont l'identifiant ne se retrouve pas au catalogue, et un prix nul.
 */
const RELEVE = {
  "catalogue": {
    "accomodations": [
      {
        "id": 200717,
        "name": "Appartement B12 - Le Grand Bois",
        "slug": "appartement-b12-residence-grand-bois",
        "maxCapacity": 8,
        "nbRooms": 5,
        "lat": 45.57944802385294,
        "lng": 6.893016220805123,
        "image": "https://images.msem.tech/production/lodging/CR-595-GRANDBOISB12/12275490-medium.jpg",
        "images": [
          {
            "src": "https://images.msem.tech/production/lodging/CR-595-GRANDBOISB12/12275490-medium.jpg"
          }
        ],
        "location": {
          "merchant": "CR-595-GRANDBOISB12",
          "address1": "326 route du Grand Bois",
          "address2": "Sainte Foy Station",
          "cp": "73640",
          "city": "SAINTE FOY TARENTAISE",
          "lat": 45.57944802385294,
          "lng": 6.893016220805123
        }
      },
      {
        "id": 192890,
        "name": "Appartement Soldanelle - Les Charmettes",
        "slug": "soldanelle-appartement-dans-petite-residence",
        "maxCapacity": 8,
        "nbRooms": 3,
        "lat": 45.57596206665039,
        "lng": 6.893974304199219,
        "image": "https://images.msem.tech/production/lodging/CR-595-120/27207-medium.jpg",
        "images": [
          {
            "src": "https://images.msem.tech/production/lodging/CR-595-120/27207-medium.jpg"
          }
        ],
        "location": {
          "merchant": "CR-595-SOLDANELLE",
          "address1": "Résidence Les Charmettes",
          "address2": "Bonconseil Dessous",
          "cp": "73640",
          "city": "Ste Foy Tarentaise",
          "lat": 45.57596206665039,
          "lng": 6.893974304199219
        }
      },
      {
        "id": 999999,
        "name": "Au catalogue, pas vendable",
        "slug": "pas-vendable",
        "maxCapacity": 4,
        "nbRooms": 2,
        "lat": 45.59,
        "lng": 6.88,
        "image": "https://images.msem.tech/x.jpg"
      },
      {
        "id": 424242,
        "name": "HORIZON - 3 pieces - 8 pers.",
        "slug": "horizon",
        "maxCapacity": 0,
        "nbRooms": 3,
        "lat": 45.09,
        "lng": 6.06,
        "image": "https://images.msem.tech/h.jpg",
        "location": {
          "address1": "rue du Poutat",
          "cp": "38750",
          "city": "L'Alpe d'Huez"
        }
      }
    ]
  },
  "offres": {
    "192890": {
      "price": 2259.58,
      "publicPrice": null
    },
    "200717": {
      "price": 4951.26,
      "publicPrice": null
    },
    "424242": {
      "price": 3651.2000000000003,
      "publicPrice": null
    },
    "777777": {
      "price": 900,
      "publicPrice": null
    },
    "888888": {
      "price": 0,
      "publicPrice": null
    }
  }
} as const;

describe("MSEM : joindre le catalogue et les offres datées", () => {
  const fiches = joindreMsem(RELEVE.catalogue, RELEVE.offres);

  it("ne rend que ce que la centrale vend vraiment", () => {
    // Cinq offres, quatre hébergements au catalogue, trois annonces : l'offre
    // orpheline, le prix nul et l'hébergement invendu tombent tous les trois.
    assert.equal(Object.keys(RELEVE.offres).length, 5);
    assert.equal(RELEVE.catalogue.accomodations.length, 4);
    assert.deepEqual(fiches.map((f) => f.id).sort(), ["192890", "200717", "424242"]);
  });

  it("une capacité déclarée à zéro n'est pas une capacité", () => {
    // « HORIZON, 3 pièces, 8 pers. » : le nom annonce huit personnes, la
    // centrale rend un prix pour huit, et son champ de capacité vaut zéro.
    // Le recopier ferait écarter le logement par le filtre « capacité ≥ 8 »
    // alors que la centrale vient de dire qu'elle le vend.
    const horizon = fiches.find((f) => f.id === "424242");
    assert.equal(horizon?.capacite, null);
    const soldanelle = fiches.find((f) => f.id === "192890");
    assert.equal(soldanelle?.capacite, 8);
  });

  it("le prix est arrondi au centime", () => {
    // La centrale rend des flottants : 3 651,20 lui sort en 3651.2000000000003.
    assert.equal(fiches.find((f) => f.id === "424242")?.total, 3651.2);
    assert.equal(fiches.find((f) => f.id === "192890")?.total, 2259.58);
  });

  it("les pièces sont lues, et restent des pièces", () => {
    // `nbRooms` compte les pièces, jamais les chambres : un deux-pièces a une
    // chambre. Le champ est rendu tel quel, sous son vrai nom.
    assert.equal(fiches.find((f) => f.id === "424242")?.pieces, 3);
  });

  it("coordonnées, photo, adresse et slug remontent", () => {
    const horizon = fiches.find((f) => f.id === "424242");
    assert.equal(horizon?.slug, "horizon");
    assert.equal(horizon?.commune, "L'Alpe d'Huez");
    assert.ok(horizon?.adresse?.includes("rue du Poutat"));
    assert.ok(horizon?.photo?.startsWith("https://images.msem.tech/"));
    assert.ok(horizon?.lat != null && Math.abs(horizon.lat - 45.09) < 0.01);
  });

  it("le catalogue s'appelle sans dates, les offres avec", () => {
    // C'est le partage qui explique tout le moteur : le catalogue ne bouge pas
    // avec la demande, les prix n'existent que datés.
    const cat = new URL(urlCatalogueMsem("https://services.msem.tech", 595, "OT-595"));
    assert.equal(cat.pathname, "/api/lodging/resort/595/OT-595");
    assert.equal(cat.searchParams.get("language"), "fr");
    assert.equal(cat.searchParams.get("start"), null);

    assert.equal(
      urlOffresMsem("https://services.msem.tech/", 595),
      "https://services.msem.tech/api/lodging/resort/595/offers",
    );
    const corps = corpsOffresMsem("OT-595", { checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 8 });
    assert.equal(corps.start, "2027-02-06");
    assert.equal(corps.end, "2027-02-13");
    assert.equal(corps.adults, 8);
    // Aucun enfant déclaré : la demande compte des voyageurs, et inventer des
    // âges changerait le prix sans qu'on sache dans quel sens.
    assert.equal(corps.children, 0);
    assert.deepEqual(corps.agesChildren, []);
  });

  it("un catalogue ou des offres absents ne font rien exploser", () => {
    assert.deepEqual(joindreMsem(null, null), []);
    assert.deepEqual(joindreMsem(RELEVE.catalogue, {}), []);
    assert.deepEqual(joindreMsem({ accomodations: [] }, RELEVE.offres), []);
  });
});
