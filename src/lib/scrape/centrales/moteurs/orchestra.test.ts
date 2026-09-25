import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cartesOrchestra,
  dateOrchestra,
  ficheOrchestra,
  horsRegleOrchestra,
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

/**
 * Relevé du 25 septembre 2026 sur `www.laplagneresort.com`, Champagny-en-Vanoise.
 *
 * Deux cartes du catalogue, réduites aux morceaux que l'analyseur lit — lien,
 * identifiant, première photo, pastille de type —, chacun recopié tel quel à
 * l'espacement près ; l'image de remplacement en base64 est abrégée.
 *
 * Puis, pour chacune, les blocs « Information » et « Localisation » de sa
 * fiche `/location/…`, recopiés tels quels à trois retouches près : les lignes
 * ont perdu leur retrait, l'espace insécable est écrit par son échappement,
 * et le bouton « VOIR SUR LA CARTE » est ôté. Sur la vraie page, le bloc de
 * l'agence et celui des équipements les séparent.
 */
const CATALOGUE_TYPE = `
<div class="cpt-product-item is-clickable col-lg-4 col-md-6" data-link="/location/2-pieces-residence-le-chardonnet-ref-ccdt052-86645#ref_dd=03&ref_dmy=10/2026&ref_aj=0&ref_minMan=7,7&ref_mmd=8,8&ref_dpci=XXX">
<div class="cpt-favorite-button un-clickable " data-product-id="86645" >
<figure class="elem-image " > <img class="b-lazy" src="data:…" data-src="https://agence-rocblanc.locvacances.com/lv/images/lot/0000000030_01.jpg" alt="2 pièces - Résidence LE CHARDONNET - ref CCDT052 - 1"> </figure>
<div class="elem-product-tag "> <span class="tag">Appartement</span> </div>
</div>
<div class="cpt-product-item is-clickable col-lg-4 col-md-6" data-link="/location/6-pieces-residence-le-grand-bouquetin-ref-gb14-85914#ref_dd=03&ref_dmy=10/2026&ref_aj=0&ref_minMan=7,7&ref_mmd=8,8&ref_dpci=XXX">
<div class="cpt-favorite-button un-clickable " data-product-id="85914" >
<figure class="elem-image " > <img class="b-lazy" src="data:…" data-src="https://agence-rocblanc.locvacances.com/lv/images/lot/0000000409_01.jpg" alt="6 pièces - Résidence LE GRAND BOUQUETIN - ref GB14 - 1"> </figure>
<div class="elem-product-tag "> <span class="tag">Appartement</span> </div>
</div>`;

const FICHE_86645 = `<h3 class="title-content secondary">Information</h3>
<div class="txt-content">- <strong>Station :</strong>\u00a0Champagny en Vanoise<br>- <strong>Village :</strong>\u00a0CHAMPAGNY<br>- <strong>Référence du bien :</strong>\u00a0CCDT052<br>- <strong>Type de bien :</strong>\u00a02 pièces<br>- <strong>Capacité :</strong>\u00a06\u00a0Personnes<br>- <strong>Confort :</strong>\u00a0Premium</div>
<div id="desc-localisation" class="tab-content desc-bloc orx-accordion-item orx-accordion-container">
<div class="orx-accordion-title d-block d-md-none product-localization-trigger">
<div class="label">Localisation</div>
<span class="elem-orx-arrow">
</span>
</div>
<div class="orx-accordion-mask">
<div class="orx-accordion-content">
<div class="title-content text-uppercase d-none d-md-block">Localisation</div>
<h3 class="title-content secondary">Adresse</h3>
<div class="txt-content">160 Rue des Hauts du Crey<br>CHAMPAGNY<br>73350</div>
<h3 class="title-content secondary">Coordonnées</h3>
<div class="txt-content">45.45672911614459, 6.694965362548828</div>
<h3 class="title-content secondary">Quartier</h3>
<div class="txt-content">Champagny - Les Hauts du Crey</div>
<div class="cpt-product-localization " >
<div id="map_wrap" class="map-wrap" data-map-latlng='[45.456729,6.694965]' data-map-zoom="17"></div>`;

const FICHE_85914 = `<h3 class="title-content secondary">Information</h3>
<div class="txt-content">- <strong>Station :</strong>\u00a0Champagny en Vanoise<br>- <strong>Village :</strong>\u00a0CHAMPAGNY EN VANOISE<br>- <strong>Référence du bien :</strong>\u00a0GB14<br>- <strong>Type de bien :</strong>\u00a06 pièces<br>- <strong>Capacité :</strong>\u00a012\u00a0Personnes<br>- <strong>Confort :</strong>\u00a0Premium Grand Bouquetin</div>
<div id="desc-localisation" class="tab-content desc-bloc orx-accordion-item orx-accordion-container">
<div class="orx-accordion-title d-block d-md-none product-localization-trigger">
<div class="label">Localisation</div>
<span class="elem-orx-arrow">
</span>
</div>
<div class="orx-accordion-mask">
<div class="orx-accordion-content">
<div class="title-content text-uppercase d-none d-md-block">Localisation</div>
<h3 class="title-content secondary">Adresse</h3>
<div class="txt-content">1103 Rue de la Vanoise<br>CHAMPAGNY EN VANOISE<br>73350</div>
<h3 class="title-content secondary">Coordonnées</h3>
<div class="txt-content">45.456729, 6.699438</div>
<h3 class="title-content secondary">Quartier</h3>
<div class="txt-content">Champagny - Le Planay</div>
<div class="cpt-product-localization " >
<div id="map_wrap" class="map-wrap" data-map-latlng='[45.456729,6.699438]' data-map-zoom="17"></div>`;

/** Construit : le bloc de l'agence, sans son téléphone, seul. */
const AGENCE = `<h3 class="title-content secondary">Agence Immobilière</h3>
<div class="txt-content">CHAMPAGNY Agence by Roc Blanc<br>Le Reclaz<br>598 Rue de la Vanoise<br>73350 CHAMPAGNY EN VANOISE</div>`;

const RIEN = {
  capacite: null,
  typeDeBien: null,
  pieces: null,
  village: null,
  adresse: null,
  lat: null,
  lon: null,
};

describe("Orchestra : le type de la carte, la capacité et le lieu de la fiche", () => {
  it("lit la pastille de type de chaque carte", () => {
    const c = cartesOrchestra(CATALOGUE_TYPE);
    assert.equal(c.length, 2);
    for (const x of c) assert.equal(x.type, "Appartement");
    // L'ancien gabarit de test ne porte pas la pastille : rien n'est inventé.
    for (const x of cartesOrchestra(CATALOGUE)) assert.equal(x.type, null);
  });

  it("lit la capacité, le type de bien, le village, l'adresse et le point de la fiche", () => {
    assert.deepEqual(ficheOrchestra(FICHE_86645), {
      capacite: 6,
      typeDeBien: "2 pièces",
      pieces: 2,
      village: "CHAMPAGNY",
      adresse: "160 Rue des Hauts du Crey, CHAMPAGNY, 73350",
      lat: 45.45672911614459,
      lon: 6.694965362548828,
    });
    assert.deepEqual(ficheOrchestra(FICHE_85914), {
      capacite: 12,
      typeDeBien: "6 pièces",
      pieces: 6,
      village: "CHAMPAGNY EN VANOISE",
      adresse: "1103 Rue de la Vanoise, CHAMPAGNY EN VANOISE, 73350",
      lat: 45.456729,
      lon: 6.699438,
    });
  });

  it("le point en clair d'abord, celui de la carte ensuite ; hors de France, aucun", () => {
    const sansTexte = FICHE_86645.replace(
      /<h3[^>]*>Coordonnées<\/h3>\s*<div[^>]*>[^<]*<\/div>/,
      "",
    );
    const f = ficheOrchestra(sansTexte);
    assert.equal(f.lat, 45.456729);
    assert.equal(f.lon, 6.694965);
    const zero = FICHE_86645.replace("45.45672911614459, 6.694965362548828", "0, 0").replace(
      "[45.456729,6.694965]",
      "[0,0]",
    );
    assert.equal(ficheOrchestra(zero).lat, null);
    assert.equal(ficheOrchestra(zero).lon, null);
  });

  it("ne lit rien hors des deux blocs, ni l'adresse de l'agence", () => {
    // Le moteur de réservation de la fiche répète les bandes de capacité
    // (« {minPax}-{maxPax} personnes ») : sans le bloc, la capacité reste vide.
    const sansBlocs = FICHE_86645.replace(">Information<", ">Autre chose<").replace(
      'id="desc-localisation"',
      'id="desc-autre"',
    );
    assert.deepEqual(ficheOrchestra(sansBlocs), RIEN);
    assert.deepEqual(ficheOrchestra(AGENCE), RIEN);
    assert.deepEqual(ficheOrchestra(""), RIEN);
  });

  it("garde un appartement ; une carte sans type n'est pas jugée", () => {
    for (const c of cartesOrchestra(CATALOGUE_TYPE)) assert.equal(horsRegleOrchestra(c), null);
    assert.equal(horsRegleOrchestra({ type: null }), null);
    // Construit : aucune carte d'hôtel n'a été relevée, la règle est celle de
    // `regleTypes.ts`.
    assert.equal(horsRegleOrchestra({ type: "Hôtel" }), "hôtel");
  });

  it("un type inconnu est gardé ; le nom ne juge que le camping", () => {
    // Construits : la règle commune (`regleTypes.ts`) sur une carte.
    assert.equal(horsRegleOrchestra({ type: "Loft" }), null);
    const carte = { type: "Appartement", titre: "Chalet Les Bulles", chemin: "/location/x-1" };
    assert.equal(horsRegleOrchestra(carte), null);
    assert.equal(horsRegleOrchestra({ ...carte, titre: "Camping Le Bettex" }), "camping");
  });
});
