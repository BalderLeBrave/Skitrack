import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  corpsOffresMsem,
  estLocationMsem,
  horsLocationMsem,
  joindreMsem,
  motifHorsLocationMsem,
  urlCatalogueMsem,
  urlOffresMsem,
} from "./msem.ts";

/**
 * Relevé du 13 septembre 2026 sur `services.msem.tech`, station 595 (Sainte-Foy
 * Tarentaise), canal OT-595, séjour du 6 au 13 février 2027 à huit personnes.
 *
 * Les deux premiers hébergements et leurs deux offres sont ceux de la centrale,
 * verbatim. Cinq cas leur sont ajoutés pour éprouver les bords, et ils sont
 * construits : un hébergement au catalogue que la centrale ne vend pas à ces
 * dates, une capacité déclarée à zéro comme l'Alpe d'Huez sait en produire, une
 * offre dont l'identifiant ne se retrouve pas au catalogue, un prix nul, et une
 * offre au catalogue dont le prix manque.
 *
 * `publicPrice` est nul partout au relevé ; il porte ici un nombre sur la fiche
 * construite, pour éprouver la lecture prudente de ce champ.
 *
 * `kind` a été ajouté aux deux entrées verbatim, avec leur valeur réelle au
 * catalogue relevé le 25 septembre 2026 (`MEUBLE` toutes deux). Les entrées
 * construites n'en portent pas : une nature absente n'écarte rien.
 */
const RELEVE = {
  "catalogue": {
    "accomodations": [
      {
        "id": 200717,
        "name": "Appartement B12 - Le Grand Bois",
        "slug": "appartement-b12-residence-grand-bois",
        "kind": "MEUBLE",
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
        "kind": "MEUBLE",
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
        "images": [
          { "src": "https://images.msem.tech/h.jpg" },
          { "src": "//images.msem.tech/h2.jpg" }
        ],
        "location": {
          "address1": "rue du Poutat",
          "cp": "38750",
          "city": "L'Alpe d'Huez"
        }
      },
      {
        "id": 555555,
        "name": "Vendu sans montant",
        "slug": "sans-montant",
        "maxCapacity": 6,
        "nbRooms": 2,
        "lat": 45.1,
        "lng": 6.07,
        "image": "https://images.msem.tech/s.jpg"
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
      "publicPrice": 3900
    },
    "555555": {
      "price": null,
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

  it("ne rend que ce que la centrale connaît, prix ou pas", () => {
    // Six offres, cinq hébergements au catalogue, quatre annonces. Ne tombent
    // que les deux offres orphelines — un prix sans nom, sans adresse et sans
    // lien n'est pas une annonce — et l'hébergement que la centrale ne vend
    // pas à ces dates, qui n'a pas d'offre du tout.
    assert.equal(Object.keys(RELEVE.offres).length, 6);
    assert.equal(RELEVE.catalogue.accomodations.length, 5);
    assert.deepEqual(fiches.map((f) => f.id).sort(), ["192890", "200717", "424242", "555555"]);
  });

  it("une offre sans montant sort quand même, à zéro", () => {
    // Zéro veut dire « la centrale n'a pas publié de prix », jamais
    // « gratuit ». Supprimer l'annonce ferait disparaître un renseignement :
    // la centrale a bien répondu pour ces dates, sans montant.
    const sansMontant = fiches.find((f) => f.id === "555555");
    assert.equal(sansMontant?.total, 0);
    assert.equal(sansMontant?.titre, "Vendu sans montant");
    assert.equal(sansMontant?.capacite, 6);
    assert.equal(sansMontant?.pieces, 2);
  });

  it("le prix public est rendu quand il est publié, et jamais deviné", () => {
    // La centrale le laisse vide presque partout ; il n'est rendu que s'il
    // porte un nombre, et rien n'en déduit une remise.
    assert.equal(fiches.find((f) => f.id === "424242")?.prixPublic, 3900);
    assert.equal(fiches.find((f) => f.id === "192890")?.prixPublic, null);
  });

  it("toutes les photos de la galerie remontent, pas seulement la première", () => {
    const horizon = fiches.find((f) => f.id === "424242");
    assert.deepEqual(horizon?.photos, [
      "https://images.msem.tech/h.jpg",
      "https://images.msem.tech/h2.jpg",
    ]);
    // La vignette reste la première, et le protocole des adresses relatives
    // est complété : « //images.msem.tech/… » n'est pas une adresse.
    assert.equal(horizon?.photo, "https://images.msem.tech/h.jpg");
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

/**
 * Relevé du 25 septembre 2026 sur `services.msem.tech`, station 125 (l'Alpe
 * d'Huez), canal OT-125 : le catalogue, 955 hébergements.
 *
 * Cinq hébergements réels, réduits aux champs que l'analyseur lit (la
 * galerie à ses deux premières photos) : un `HOTEL` dont la capacité est
 * celle de tout l'établissement, une `CHAMBRE_HOTE`, une `RESIDENCE`, un
 * `MEUBLE` dont la capacité et les pièces valent zéro, et un `MEUBLE` au
 * point `0, 0`. La chambre d'hôtes (7545) est celle d'un particulier : elle
 * est réduite à son nom, son slug, sa nature, sa capacité et ses pièces, sans
 * adresse, ni point, ni photo. Les offres, elles, sont **construites** : la
 * sonde n'a pas demandé de prix, et il en faut une par hébergement pour qu'il
 * soit joint.
 */
const ALPE = {
  "catalogue": {
    "accomodations": [
      {
        "id": 191878,
        "name": "Le Castillan",
        "slug": "le-castillan-2",
        "kind": "HOTEL",
        "maxCapacity": 73,
        "nbRooms": 0,
        "lat": 45.09189987182617,
        "lng": 6.062910079956055,
        "image": "https://images.msem.tech/production/lodging/HOT-125-132916-01/8787053-medium.jpg",
        "location": {
          "address1": "268 route de la Poste",
          "address2": null,
          "cp": "38750",
          "city": null,
          "lat": 45.09189987182617,
          "lng": 6.062910079956055
        }
      },
      {
        "id": 7545,
        "name": "Chalet Hysope",
        "slug": "chalet-hysope",
        "kind": "CHAMBRE_HOTE",
        "maxCapacity": 4,
        "nbRooms": 0
      },
      {
        "id": 221166,
        "name": "Pierre & Vacances L'Ours Blanc - 2 pièces - 4 personnes - 25 m² - MAEVA",
        "slug": "residence-pierre-and-vacances-l-ours-blanc-appartement-4-personnes-1-chambre-exposition-sud",
        "kind": "RESIDENCE",
        "maxCapacity": 4,
        "nbRooms": 2,
        "lat": 45.0906365,
        "lng": 6.0676014,
        "image": "https://images.msem.tech/production/lodging/AM-MAEVA-125-129859/13053254-medium.jpg",
        "images": [
          { "src": "https://images.msem.tech/production/lodging/AM-MAEVA-125-129859/13053254-medium.jpg" },
          { "src": "https://images.msem.tech/production/lodging/AM-MAEVA-125-129859/13053253-medium.jpg" }
        ],
        "location": {
          "address1": "Résidence Pierre&Vacances L'Ours Blanc 65, avenue des Jeux",
          "address2": null,
          "cp": "38750",
          "city": "Alpe d'Huez",
          "lat": 45.0906365,
          "lng": 6.0676014
        }
      },
      {
        "id": 192152,
        "name": "VAL D'YS - 3 pièces - 8 pers. - 83 m2 - Agence Giverdon Immobilier",
        "slug": "val-dys3-pieces8-pers83-m2agence-giverdon-immobilier",
        "kind": "MEUBLE",
        "maxCapacity": 0,
        "nbRooms": 0,
        "lat": 45.092491149902344,
        "lng": 6.064209938049316,
        "image": "https://images.msem.tech/production/lodging/AM-125-003-40/11217667-medium.jpg",
        "location": {
          "address1": null,
          "address2": null,
          "cp": "38750",
          "city": "L'ALPE D'HUEZ",
          "lat": 45.092491149902344,
          "lng": 6.064209938049316
        }
      },
      {
        "id": 206320,
        "name": "Menandière - La Ménandière - 3 pièces - 6 personnes - 68m² - Alpe d'Huez Houses",
        "slug": "spils-house-t4-a-la-menandiere-vue-magnifique-alpe-d-huez-houses",
        "kind": "MEUBLE",
        "maxCapacity": 2,
        "nbRooms": 3,
        "lat": 0,
        "lng": 0,
        "image": "https://images.msem.tech/production/lodging/AM-125-002-74/12892445-medium.jpg",
        "location": {
          "address1": "Résidence La Ménandière 275 Avenue Des Jeux",
          "address2": null,
          "cp": "38750",
          "city": "L'ALPE D'HUEZ",
          "lat": 0,
          "lng": 0
        }
      }
    ]
  },
  "offres": {
    "191878": { "price": 5000, "publicPrice": null },
    "7545": { "price": 1500, "publicPrice": null },
    "221166": { "price": 1200, "publicPrice": null },
    "192152": { "price": 2000, "publicPrice": null },
    "206320": { "price": 1800, "publicPrice": null }
  }
} as const;

describe("MSEM : la location seulement, et ce que le catalogue ne dit pas", () => {
  const fiches = joindreMsem(ALPE.catalogue, ALPE.offres);
  const par = (id: string) => fiches.find((f) => f.id === id);

  it("écarte l'hôtel et la chambre d'hôtes, garde le meublé et la résidence", () => {
    assert.deepEqual(fiches.map((f) => f.id).sort(), ["192152", "206320", "221166"]);
    // Le journal dit ce qui a été écarté, et pourquoi.
    assert.deepEqual(horsLocationMsem(ALPE.catalogue, ALPE.offres), { HOTEL: 1, CHAMBRE_HOTE: 1 });
  });

  it("les natures relevées : trois gardées, trois écartées", () => {
    assert.equal(estLocationMsem({ kind: "MEUBLE" }), true);
    assert.equal(estLocationMsem({ kind: "RESIDENCE" }), true);
    assert.equal(estLocationMsem({ kind: "HOUSE" }), true);
    assert.equal(estLocationMsem({ kind: "HOTEL" }), false);
    assert.equal(estLocationMsem({ kind: "CAMPING" }), false);
    assert.equal(estLocationMsem({ kind: "CHAMBRE_HOTE" }), false);
  });

  it("une nature inconnue est écartée, une nature absente ne l'est pas", () => {
    // Construit : aucune de ces formes n'a été relevée.
    assert.equal(motifHorsLocationMsem({ kind: "REFUGE" }), "REFUGE");
    assert.equal(estLocationMsem({}), true);
    assert.equal(estLocationMsem({ kind: null }), true);
    assert.equal(estLocationMsem({ kind: "" }), true);
  });

  it("capacité et pièces à zéro restent vides : le titre dira le reste", () => {
    // « VAL D'YS - 3 pièces - 8 pers. » : la centrale écrit 0 dans les deux
    // champs. Zéro est un champ vide, pas une valeur.
    const valdys = par("192152");
    assert.equal(valdys?.capacite, null);
    assert.equal(valdys?.pieces, null);
    assert.equal(valdys?.commune, "L'ALPE D'HUEZ");
  });

  it("aucune clé de chambres : rien n'est déduit des pièces", () => {
    // La résidence annonce 2 pièces ; elle n'a pas de champ de chambres, et
    // la fiche n'en porte pas.
    const ours = par("221166");
    assert.equal(ours?.pieces, 2);
    assert.equal(ours?.capacite, 4);
    assert.equal("chambres" in (ours ?? {}), false);
  });

  it("un point écrit 0, 0 aux deux niveaux reste vide", () => {
    const menandiere = par("206320");
    assert.equal(menandiere?.lat, null);
    assert.equal(menandiere?.lon, null);
    // L'adresse, elle, est là : c'est le recours d'un géocodage.
    assert.ok(menandiere?.adresse?.includes("275 Avenue Des Jeux"));
  });

  it("la capacité déclarée est reprise telle quelle, même quand le titre dit autre chose", () => {
    // « 3 pièces - 6 personnes » au titre, `maxCapacity: 2` au catalogue. On
    // rend ce que le champ dit ; l'écart est celui de la centrale.
    assert.equal(par("206320")?.capacite, 2);
  });
});

/**
 * Relevé du 25 septembre 2026 sur `services.msem.tech`, les huit autres
 * catalogues du registre. Cinq hébergements réels, réduits aux champs que le
 * filtre lit et à la capacité et aux pièces ; adresses, points et photos
 * retirés, dont ceux d'un particulier (192970). Les offres sont
 * **construites** : la sonde n'a pas demandé de prix.
 *
 * - 227541 et 227539, Pays des Écrins (30015/PDE) : un mobil-home rangé sous
 *   `CAMPING`, et un chalet du même camping rangé sous `MEUBLE` ;
 * - 220148, Flaine (320/OT-320) : une chambre de village club en pension
 *   complète, rangée sous `HOTEL` ;
 * - 192970, Villard-de-Lans (30002/OTVDL) : un appartement dont le nom
 *   commence par « LE REFUGE » ;
 * - 210234, Isola 2000 (386/ISOLA) : un studio rangé sous `HOUSE`, la seule
 *   occurrence de cette nature.
 */
const AUTRES = {
  "catalogue": {
    "accomodations": [
      {
        "id": 227541,
        "name": "Camping-Caravaneige l'Iscle de Prelles *** - Mobilhome Confort Titania - 26 m² / 2 chambres -  Terrasse 12m² & Tonnelle 9 m² 6 personnes",
        "slug": "camping-caravaneige-l-iscle-de-prelles-mobilhome-confort-titania-26-m-2-chambres-terrasse-12m-and-tonnelle-9-m-6-personnes",
        "kind": "CAMPING",
        "maxCapacity": 6,
        "nbRooms": 2
      },
      {
        "id": 227539,
        "name": "Camping-Caravaneige l'Iscle de Prelles *** - Chalet Grand Confort Type Modulo 28 - 28 m² / 2 chambres - Terrasse couverte 15 m² 6 personnes",
        "slug": "camping-caravaneige-l-iscle-de-prelles-chalet-grand-confort-type-modulo-28-28-m-2-chambres-terrasse-couverte-15-m-6-personnes",
        "kind": "MEUBLE",
        "maxCapacity": 6,
        "nbRooms": 2
      },
      {
        "id": 220148,
        "name": "Village Club MMV Le Flaine **** - Pension complète - Chambre 3 Personnes - pension complète",
        "slug": "village-club-mmv-le-flaine-pension-complete-chambre-3-personnes-pension-complete",
        "kind": "HOTEL",
        "maxCapacity": 3,
        "nbRooms": 2
      },
      {
        "id": 192970,
        "name": "LE REFUGE DU BALCON - LES AROLLES-3 pièces 2 cabines- 8 personnes-73m2- Plain-pied (RDC 16 K)",
        "slug": "les-arolles-3-pieces-2-cabines-8-personnes-73m2-rdc-16-k",
        "kind": "MEUBLE",
        "maxCapacity": 8,
        "nbRooms": 5
      },
      {
        "id": 210234,
        "name": "Studio rénové, balcon sud – galerie marchande accessible directement",
        "slug": "studio-renove-balcon-sud-galerie-marchande-accessible-directement",
        "kind": "HOUSE",
        "maxCapacity": 4,
        "nbRooms": 1
      }
    ]
  },
  "offres": {
    "227541": { "price": 700, "publicPrice": null },
    "227539": { "price": 900, "publicPrice": null },
    "220148": { "price": 1500, "publicPrice": null },
    "192970": { "price": 1400, "publicPrice": null },
    "210234": { "price": 600, "publicPrice": null }
  }
} as const;

describe("MSEM : camping, village club et maison, sur les autres catalogues", () => {
  const fiches = joindreMsem(AUTRES.catalogue, AUTRES.offres);

  it("garde l'appartement et la maison, écarte le camping et le village club", () => {
    assert.deepEqual(fiches.map((f) => f.id).sort(), ["192970", "210234"]);
    assert.deepEqual(horsLocationMsem(AUTRES.catalogue, AUTRES.offres), {
      CAMPING: 1,
      "nom de camping": 1,
      HOTEL: 1,
    });
  });

  it("le chalet d'un camping est écarté par son nom, l'appartement « refuge » ne l'est pas", () => {
    const [, chalet, , refuge] = AUTRES.catalogue.accomodations;
    assert.equal(motifHorsLocationMsem(chalet), "nom de camping");
    assert.equal(motifHorsLocationMsem(refuge), null);
  });

  it("la maison garde sa capacité et ses pièces", () => {
    const studio = fiches.find((f) => f.id === "210234");
    assert.equal(studio?.capacite, 4);
    assert.equal(studio?.pieces, 1);
  });
});
