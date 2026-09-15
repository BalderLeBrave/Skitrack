import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cartesOrchestra,
  dateOrchestra,
  nuitsOrchestra,
  prixOrchestra,
  urlCalendrierOrchestra,
  urlCatalogueOrchestra,
} from "./orchestra.ts";

/**
 * Relevé du 13 septembre 2026 sur `www.laplagneresort.com`, destination
 * Champagny-en-Vanoise, logement 86645.
 *
 * Le catalogue est réduit à deux cartes, dont le balisage est celui du site.
 * Le calendrier est celui du logement, réduit à une bande de capacité, deux
 * durées et deux jours, avec une entrée « PAR » ajoutée à la main : c'est la
 * ville de départ qui vend le voyage avec l'hébergement, et son prix est bien
 * plus bas. La lire à la place de « XXX » donnerait un total faux, moins cher,
 * et rien ne le signalerait.
 */
const CATALOGUE = `
<div class="cpt-product-item is-clickable col-lg-4 col-md-6" data-link="/location/2-pieces-residence-le-chardonnet-ref-ccdt052-86645#ref_dd=19&ref_dmy=09/2026&ref_aj=0&ref_minMan=7,7&ref_mmd=8,8&ref_dpci=XXX" <div class="cpt-favorite-button un-clickable " data-product-id="86645" <img class="b-lazy" src="data:…" data-src="https://agence-rocblanc.locvacances.com/lv/images/lot/0000000030_01.jpg" alt="2 pièces - Résidence LE CHARDONNET - ref CCDT052 - 1"></div>
<div class="cpt-product-item is-clickable col-lg-4 col-md-6" data-link="/location/6-pieces-residence-le-grand-bouquetin-ref-gb14-85914#ref_dd=19&ref_dmy=09/2026&ref_aj=0&ref_minMan=7,7&ref_mmd=8,8&ref_dpci=XXX" <div class="cpt-favorite-button un-clickable " data-product-id="85914" <img class="b-lazy" src="data:…" data-src="https://agence-rocblanc.locvacances.com/lv/images/lot/0000000409_01.jpg" alt="6 pièces - Résidence LE GRAND BOUQUETIN - ref GB14 - 1"></div>
`;

const CALENDRIER = {
 "product": {
  "code": "86645"
 },
 "availabilities": {
  "XXX": {
   "1-6": {
    "8-7": {
     "02-2027": {
      "13": {
       "price": 1980,
       "departureCity": "XXX",
       "byHousing": true,
       "nightNb": 7,
       "departureDate": 1802473200000,
       "categories": {
        "ccdt052": {
         "price": 1980,
         "categoryLabel": "Logement 1 à 6 personnes",
         "categoryCode": "ccdt052",
         "maxPax": 6,
         "minPax": 1,
         "status": "Available"
        }
       },
       "maxPax": 6,
       "day": "13",
       "minPax": 1,
       "status": "Available",
       "dayNb": 8
      },
      "06": {
       "price": 1730,
       "departureCity": "XXX",
       "byHousing": true,
       "nightNb": 7,
       "departureDate": 1801868400000,
       "categories": {
        "ccdt052": {
         "price": 1730,
         "categoryLabel": "Logement 1 à 6 personnes",
         "categoryCode": "ccdt052",
         "maxPax": 6,
         "minPax": 1,
         "status": "Available"
        }
       },
       "maxPax": 6,
       "day": "06",
       "minPax": 1,
       "status": "Available",
       "dayNb": 8
      }
     }
    },
    "15-14": {
     "02-2027": {
      "13": {
       "price": 3890,
       "departureCity": "XXX",
       "byHousing": true,
       "nightNb": 14,
       "departureDate": 1802473200000,
       "categories": {
        "ccdt052": {
         "price": 3890,
         "categoryLabel": "Logement 1 à 6 personnes",
         "categoryCode": "ccdt052",
         "maxPax": 6,
         "minPax": 1,
         "status": "Available"
        }
       },
       "maxPax": 6,
       "day": "13",
       "minPax": 1,
       "status": "Available",
       "dayNb": 15
      },
      "06": {
       "price": 3710,
       "departureCity": "XXX",
       "byHousing": true,
       "nightNb": 14,
       "departureDate": 1801868400000,
       "categories": {
        "ccdt052": {
         "price": 3710,
         "categoryLabel": "Logement 1 à 6 personnes",
         "categoryCode": "ccdt052",
         "maxPax": 6,
         "minPax": 1,
         "status": "Available"
        }
       },
       "maxPax": 6,
       "day": "06",
       "minPax": 1,
       "status": "Available",
       "dayNb": 15
      }
     }
    }
   }
  },
  "PAR": {
   "0-6": {
    "8-7": {
     "02-2027": {
      "06": {
       "price": 763,
       "departureCity": "PAR",
       "nightNb": 7,
       "maxPax": 6,
       "minPax": 0,
       "status": "Available",
       "dayNb": 8
      }
     }
    }
   }
  }
 }
};

const DEMANDE = { checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 4 };

describe("Orchestra : lire le catalogue et le calendrier", () => {
  it("lit les logements du catalogue, titre nettoyé de son rang de photo", () => {
    const c = cartesOrchestra(CATALOGUE);
    assert.equal(c.length, 2);
    const premier = c.find((x) => x.id === "86645");
    // Le texte de remplacement dit « … - ref CCDT052 - 1 », où le 1 est le rang
    // de la photo et non une partie du nom.
    assert.equal(premier?.titre, "2 pièces - Résidence LE CHARDONNET - ref CCDT052");
    assert.ok(premier?.chemin?.startsWith("/location/"));
    assert.ok(premier?.photo?.startsWith("https://"));
    // Le lien du catalogue traîne une ancre de dates : elle ne doit pas y rester.
    assert.ok(!premier?.chemin?.includes("#"));
  });

  it("lit le prix de la ville qui vend l'hébergement seul", () => {
    // « PAR » vend le voyage avec le logement : 763 € contre 1 730 €. Prendre
    // la mauvaise ville donnerait un prix deux fois trop bas, et plausible.
    const o = prixOrchestra(CALENDRIER, DEMANDE);
    assert.equal(o?.total, 1730);
  });

  it("rend la bande tarifaire pour ce qu'elle est, et non pour une capacité", () => {
    // `maxPax` vaut six parce que la bande s'appelle « 1-6 » et que la
    // catégorie dit « Logement 1 à 6 personnes » : c'est jusqu'à combien de
    // personnes ce tarif se vend, pas combien le logement en couche. Le
    // connecteur l'écrivait dans `guests`.
    const o = prixOrchestra(CALENDRIER, DEMANDE);
    assert.equal(o?.bandeMin, 1);
    assert.equal(o?.bandeMax, 6);
    assert.equal(o?.categorie, "Logement 1 à 6 personnes");
  });

  it("lit les drapeaux qui disent ce que le prix couvre", () => {
    // Sans eux, rien ne distingue un total de séjour d'un prix par personne,
    // ni ne prouve que le montant couvre les sept nuits demandées.
    const o = prixOrchestra(CALENDRIER, DEMANDE);
    assert.equal(o?.parLogement, true);
    assert.equal(o?.nuits, 7);
    assert.equal(o?.codeProduit, "ccdt052");
  });

  it("une durée publiée qui ne couvre pas le séjour est écartée", () => {
    // La clé « 8-7 » est une convention qu'on écrit ; `nightNb` est un nombre
    // que le calendrier écrit. Quand les deux se contredisent, on ne prend pas
    // le prix de quatorze nuits pour celui de sept.
    const menteur = {
      availabilities: {
        XXX: { "1-6": { "8-7": { "02-2027": { "06": { price: 1730, nightNb: 14, status: "Available" } } } } },
      },
    };
    assert.equal(prixOrchestra(menteur, DEMANDE), null);
  });

  it("un jour libre sans prix reste une réponse, à zéro", () => {
    // « Listée sans prix » est un renseignement ; la supprimer n'en est pas un.
    // Une bande tarifée l'emporte toujours sur une bande muette.
    const muet = {
      availabilities: {
        XXX: { "1-6": { "8-7": { "02-2027": { "06": { nightNb: 7, byHousing: true, status: "Available" } } } } },
      },
    };
    const o = prixOrchestra(muet, DEMANDE);
    assert.equal(o?.total, 0);
    assert.equal(o?.parLogement, true);
  });

  it("le prix suit la durée", () => {
    const sept = prixOrchestra(CALENDRIER, DEMANDE);
    const quatorze = prixOrchestra(CALENDRIER, { ...DEMANDE, checkOut: "2027-02-20" });
    assert.equal(sept?.total, 1730);
    assert.equal(quatorze?.total, 3710);
    assert.ok((quatorze?.total ?? 0) > (sept?.total ?? 0) * 2 - 1);
  });

  it("un groupe hors de la bande de capacité ne trouve rien", () => {
    // La bande dit « 1-6 ». À huit, ce logement n'est pas vendable, et le
    // calendrier ne doit pas rendre le prix d'une bande voisine.
    assert.equal(prixOrchestra(CALENDRIER, { ...DEMANDE, guests: 8 }), null);
  });

  it("un autre jour ou un autre mois ne trouve rien non plus", () => {
    assert.equal(prixOrchestra(CALENDRIER, { checkIn: "2027-02-07", checkOut: "2027-02-14", guests: 4 }), null);
    assert.equal(prixOrchestra(CALENDRIER, { checkIn: "2027-03-06", checkOut: "2027-03-13", guests: 4 }), null);
  });

  it("les deux URL du moteur sont bien formées", () => {
    // La page de destination ne porte aucun paramètre : plus économique que
    // la recherche groupée, qui porte un Disallow /*serp? lu et ignoré.
    const cat = new URL(urlCatalogueOrchestra("https://exemple.test/", "champagny-en-vanoise"));
    assert.equal(cat.pathname, "/destinations/champagny-en-vanoise");
    assert.equal(cat.search, "");

    const cal = new URL(urlCalendrierOrchestra("https://exemple.test", "86645", DEMANDE));
    assert.equal(cal.pathname, "/ajax/bookingEngine/86645");
    assert.equal(cal.searchParams.get("departureCity"), "XXX");
    assert.equal(cal.searchParams.get("minNight"), "7");
    assert.equal(cal.searchParams.get("minDay"), "8");
    assert.equal(cal.searchParams.get("departureDate"), "06-02-2027");
    assert.equal(dateOrchestra("2027-02-06"), "06-02-2027");
    assert.equal(nuitsOrchestra("2027-02-06", "2027-02-13"), 7);
  });

  it("un calendrier absent ou vide ne fait rien exploser", () => {
    assert.equal(prixOrchestra(null, DEMANDE), null);
    assert.equal(prixOrchestra({}, DEMANDE), null);
    assert.equal(prixOrchestra({ availabilities: {} }, DEMANDE), null);
    assert.deepEqual(cartesOrchestra("<html></html>"), []);
  });
});
