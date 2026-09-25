import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  capacitesFeratel,
  capacitesFraiches,
  categoriesInconnuesFeratel,
  compteFeratel,
  corpsRechercheFeratel,
  FERATEL_PAR_PAGE,
  horsRegleFeratel,
  lireFeratel,
  sessionFeratel,
  typeEcarteFeratel,
  typeFeratel,
  urlRechercheFeratel,
  urlResultatsFeratel,
  urlServicesFeratel,
  verserCapacites,
} from "./feratel.ts";

/**
 * Relevé du 13 septembre 2026 sur `webapi.deskline.net`, centrale « laclusaz »,
 * séjour du 6 au 13 février 2027 à huit personnes.
 *
 * Les deux premiers hébergements sont ceux du service, réduits à leurs premiers
 * services et produits. Le troisième est construit : il porte un service et un
 * produit dont le prix vaut zéro, ce qui est l'état d'un hébergement que la
 * centrale connaît mais ne vend pas à ces dates.
 */
const RELEVE = {
  "data": [
    {
      "id": "f3e59a25-776c-487c-be9f-0759a20678d2",
      "name": "Les Aigles 1",
      "images": [
        {
          "id": "c1e84303-c8bb-4d32-b39d-79286e6bc6ac",
          "urls": [
            "//resc.deskline.net/images/FRA/1/c1e84303-c8bb-4d32-b39d-79286e6bc6ac/vue_ens%c3%a9tage_cuisine.jpg"
          ]
        }
      ],
      "location": {
        "coordinate": {
          "lat": 45.904779,
          "long": 6.426132
        }
      },
      "services": [
        {
          "id": "33c0ac7c-2208-4fe3-ae30-565a01be813a",
          "name": "Appartement, douche ou baignoire, WC, confort",
          "products": [
            {
              "id": "f486a204-a684-4f92-a069-0141936503d7",
              "name": "Les Aigles 1",
              "price": {
                "value": 2424.0
              }
            }
          ]
        }
      ]
    },
    {
      "id": "840ad88f-4f04-49b5-b7da-150ec7093770",
      "name": "Lodge Balmaz",
      "images": [
        {
          "id": "34966ba2-1d27-4b9a-b021-bbb0f085f9ef",
          "urls": [
            "//resc.deskline.net/images/FRA/1/34966ba2-1d27-4b9a-b021-bbb0f085f9ef/BALMAZ_2.jpg"
          ]
        }
      ],
      "location": {
        "coordinate": null
      },
      "services": [
        {
          "id": "527bc0a6-3d50-4318-b875-8b7406ba91dc",
          "name": "Chalet, douche ou baignoire, WC, confort",
          "products": [
            {
              "id": "f383d5a4-deed-4e77-b188-b6b5cb820aa7",
              "name": "Lodge Balmaz",
              "price": {
                "value": 17139.6
              }
            }
          ]
        }
      ]
    },
    {
      "id": "sans-prix",
      "name": "Connu mais pas vendu à ces dates",
      "services": [
        {
          "id": "s0",
          "name": "Chalet",
          "products": [
            {
              "id": "p0",
              "name": "x",
              "price": {
                "value": 0
              }
            }
          ]
        }
      ]
    }
  ]
} as const;

describe("Deskline / Feratel : lire une recherche datée", () => {
  const fiches = lireFeratel(RELEVE);

  it("rend aussi l'hébergement dont aucun produit n'a de prix", () => {
    // Il était supprimé. Or le service l'a mis dans les résultats d'une
    // recherche datée : « connu, pas de prix publié à ces dates » est un
    // renseignement, et zéro est la façon dont le dépôt l'écrit.
    assert.equal(RELEVE.data.length, 3);
    assert.equal(fiches.length, 3);
    const muet = fiches.find((f) => f.id === "sans-prix");
    assert.equal(muet?.total, 0);
    // Faute de produit tarifé, il est quand même nommé par ce que la centrale
    // publie : son service et son produit.
    assert.equal(muet?.service, "Chalet");
    assert.equal(muet?.produit, "x");
  });

  it("lit le nom et l'identifiant du produit vendu", () => {
    // La projection les demande depuis toujours — `products{id,name,…}` — et
    // personne ne s'en servait. Le produit est ce qui est vendu ; l'hébergement
    // n'est que ce qui le contient.
    const aigles = fiches.find((f) => f.titre === "Les Aigles 1");
    assert.equal(aigles?.produit, "Les Aigles 1");
    assert.equal(aigles?.produitId, "f486a204-a684-4f92-a069-0141936503d7");
  });

  it("rend toute la galerie, une adresse par image", () => {
    // `urls` liste les rendus d'une même image : en prendre plusieurs
    // compterait deux fois la même photo.
    const aigles = fiches.find((f) => f.titre === "Les Aigles 1");
    assert.equal(aigles?.photos.length, 1);
    assert.equal(aigles?.photo, aigles?.photos[0]);
    assert.deepEqual(fiches.find((f) => f.id === "sans-prix")?.photos, []);
  });

  it("garde le moins cher des produits d'un hébergement", () => {
    // Un hébergement porte plusieurs services, et chaque service plusieurs
    // produits. Ce qu'on montre est ce qu'il en coûte d'y dormir.
    const aigles = fiches.find((f) => f.titre === "Les Aigles 1");
    assert.equal(aigles?.total, 2424);
    assert.equal(fiches.find((f) => f.titre === "Lodge Balmaz")?.total, 17139.6);
  });

  it("lit les coordonnées sous le nom que le service leur donne", () => {
    // Le champ s'appelle `long` et non `lng`. Se tromper de nom rend une carte
    // vide sans rien casser d'autre, et c'est le genre de panne qu'on ne voit
    // pas tout de suite.
    const aigles = fiches.find((f) => f.titre === "Les Aigles 1");
    assert.ok(aigles?.lat != null && Math.abs(aigles.lat - 45.904779) < 0.0001);
    assert.ok(aigles?.lon != null && Math.abs(aigles.lon - 6.426132) < 0.0001);
  });

  it("complète le protocole des adresses de photo", () => {
    // Le service les rend relatives au protocole : « //resc.deskline.net/… ».
    for (const f of fiches) {
      for (const p of f.photos) assert.ok(p.startsWith("https://"), p);
    }
  });

  it("la page suivante se demande par son numéro", () => {
    // Le connecteur ne lisait que la page zéro, et soixante hébergements
    // exactement en revenaient : c'était le plafond d'une page.
    const u = new URL(urlResultatsFeratel("https://exemple.test", "laclusaz", "abc-123", 2));
    assert.equal(u.searchParams.get("pageNo"), "2");
    assert.equal(u.searchParams.get("pageSize"), String(FERATEL_PAR_PAGE));
  });

  it("la recherche n'existe pas sans dates", () => {
    // C'est ce qui fait que ces prix sont datés par construction : le service
    // refuse de créer une recherche qui n'en porte pas.
    const c = corpsRechercheFeratel({ checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 8 });
    const g = (c.searchObject as Record<string, Record<string, unknown>>).searchGeneral;
    assert.equal(g.dateFrom, "2027-02-06T00:00:00");
    assert.equal(g.dateTo, "2027-02-13T00:00:00");
    const a = (c.searchObject as Record<string, Record<string, unknown>>).searchAccommodation;
    const lignes = a.searchLines as { units: number; adults: number; children: number }[];
    // Un seul logement pour tout le groupe, et non plusieurs chambres : c'est
    // ce que veut dire « huit voyageurs » ici.
    assert.equal(lignes[0]?.units, 1);
    assert.equal(lignes[0]?.adults, 8);
    assert.equal(lignes[0]?.children, 0);
  });

  it("les deux URL du moteur sont bien formées", () => {
    assert.equal(urlRechercheFeratel("https://exemple.test/"), "https://exemple.test/searches");
    const u = new URL(urlResultatsFeratel("https://exemple.test", "laclusaz", "abc-123"));
    assert.equal(u.pathname, "/laclusaz/fr/accommodations/searchresults/abc-123");
    assert.equal(u.searchParams.get("currency"), "EUR");
    assert.equal(u.searchParams.get("pageSize"), "200");
    assert.match(u.searchParams.get("fields") ?? "", /coordinate\{lat,long\}/);
  });

  it("l'identifiant de corrélation ne prétend rien", () => {
    // Une lettre et un horodatage. Il n'ouvre rien et ne prouve rien.
    assert.equal(sessionFeratel(1789300000000), "S1789300000000");
  });

  it("une réponse vide ou absente ne fait rien exploser", () => {
    assert.deepEqual(lireFeratel(null), []);
    assert.deepEqual(lireFeratel({ data: [] }), []);
    assert.deepEqual(lireFeratel({}), []);
  });
});

/**
 * Relevé du 25 septembre 2026 sur `webapi.deskline.net`, centrale « laclusaz »,
 * séjour du 6 au 13 février 2027 à quatre personnes, avec la projection
 * élargie (`categories`, `town`, `district`, `rooms`, `bedrooms`).
 *
 * Cinq hébergements du service, réduits à ce que l'analyseur lit : sans
 * galerie, et l'hôtel à deux de ses trois services. Les valeurs sont celles de
 * la réponse.
 */
const RELEVE_PIECES = {
  "data": [
    {
      "id": "c3cd6d6f-b0b9-4a13-8500-011034198c98",
      "name": "Verte Vallée 11",
      "categories": [
        { "id": "ec3c8e0c-961c-4cfd-900e-1f2875acce63", "name": "Location" },
        { "id": "3b0b7981-384b-4a04-97cb-a175a816a55a", "name": "Studio" }
      ],
      "location": {
        "coordinate": { "lat": 45.9060171, "long": 6.4411 },
        "town": "La Clusaz",
        "district": "Vallée des Confins"
      },
      "services": [
        {
          "id": "74b3a4e9-27fe-4977-87d1-d3adb6be3373",
          "name": "Studio VERTE VALLEE",
          "rooms": 1,
          "bedrooms": 0,
          "products": [
            { "id": "aa8c0be8-f2a1-4de0-9092-75c11b32af79", "name": "Verte Vallée 11", "price": { "value": 1087 } }
          ]
        }
      ]
    },
    {
      "id": "52c8a211-c5eb-4448-b50e-088b388a6951",
      "name": "Lodge Helios",
      "categories": [
        { "id": "ec3c8e0c-961c-4cfd-900e-1f2875acce63", "name": "Location" },
        { "id": "a8ab6cf7-1b88-4ec3-baae-c7193780b174", "name": "Chalet individuel" }
      ],
      "location": { "coordinate": null, "town": "La Clusaz", "district": "Vallée des Confins" },
      "services": [
        {
          "id": "e557a479-b5a5-4ad5-9e38-44c53cdc62bc",
          "name": "Chalet, douche ou baignoire, WC, confort",
          "rooms": 4,
          "bedrooms": 3,
          "products": [
            { "id": "b9ce1acd-ecf6-4964-b331-384386221e97", "name": "Lodge Helios", "price": { "value": 4663.8 } }
          ]
        }
      ]
    },
    {
      "id": "1d9f92a4-a6b5-47ea-aa94-15cf6a7d1dd4",
      "name": "Hôtel Beaulieu",
      "categories": [{ "id": "ab4f2086-f06d-4dac-8b99-09eda5577c67", "name": "Hôtel" }],
      "location": {
        "coordinate": { "lat": 45.907263, "long": 6.427597 },
        "town": "La Clusaz",
        "district": "Haut du centre village"
      },
      "services": [
        {
          "id": "20c53b38-337f-4ae4-8087-e159f543e7c5",
          "name": "Chambre familiale, douche, WC, confort",
          "rooms": 0,
          "bedrooms": 0,
          "products": [
            {
              "id": "b9e07889-f031-4c35-a51e-5fde6f091690",
              "name": "Chambre 4 personnes - PDJ inclus",
              "price": { "value": 3721.6 }
            }
          ]
        },
        {
          "id": "d7377fd0-3819-4bde-9798-6a41c8ab141f",
          "name": "Appartement hôtelier, douche ou baignoire, WC, confort",
          "rooms": 0,
          "bedrooms": 0,
          "products": [
            {
              "id": "753c7368-75a8-439f-8183-858f8d7d39a1",
              "name": "Appartement Privilège - PDJ inclus",
              "price": { "value": 5523.6 }
            }
          ]
        }
      ]
    },
    {
      "id": "d00714ee-63bd-4e03-90f7-412a08578a6a",
      "name": "Résidence MGM - Hameau de l'Ours T4 Prestige",
      "categories": [
        { "id": "ec3c8e0c-961c-4cfd-900e-1f2875acce63", "name": "Location" },
        { "id": "9683cb46-ba0c-485a-abce-2d3d0af38c86", "name": "Résidence de tourisme" }
      ],
      "location": {
        "coordinate": { "lat": 45.8767133, "long": 6.4041596 },
        "town": "Manigod",
        "district": "Col de la Croix Fry"
      },
      "services": [
        {
          "id": "15cdcabe-489b-478d-93fc-0a0f480edd0c",
          "name": "Appartement, douche ou baignoire, WC, confort",
          "rooms": 0,
          "bedrooms": 3,
          "products": [
            {
              "id": "0cc6c193-3bb4-4db1-bd5d-a1c7bc16ee4d",
              "name": "Appartement 4 pièces - séjour 7 nuits",
              "price": { "value": 4349.8 }
            }
          ]
        }
      ]
    },
    {
      "id": "fdbd1acc-7813-411a-a748-7d0b6257cded",
      "name": "Granges B7",
      "categories": [
        { "id": "ec3c8e0c-961c-4cfd-900e-1f2875acce63", "name": "Location" },
        { "id": "2745c486-7458-4125-92c1-8354d922d2f5", "name": "Appartement" }
      ],
      "location": {
        "coordinate": { "lat": 45.9064233127654, "long": 6.43120982093507 },
        "town": "La Clusaz",
        "district": "Haut du centre village"
      },
      "services": [
        {
          "id": "c9f2101f-b91d-4503-a904-16bbdc1962fc",
          "name": "Studio GRANGE B7",
          "rooms": 2,
          "bedrooms": 1,
          "products": [
            { "id": "6cb3f686-f686-4b7a-a734-dee7f8eb43b4", "name": "Granges B7", "price": { "value": 1520 } }
          ]
        }
      ]
    }
  ]
} as const;

describe("Deskline / Feratel : pièces, chambres, type et lieu que la liste publie", () => {
  const fiches = lireFeratel(RELEVE_PIECES);
  const par = (titre: string) => fiches.find((f) => f.titre === titre);

  it("la projection demande pièces, chambres, catégories, commune et quartier", () => {
    // Champs acceptés par le service le 25 septembre 2026. `maxPersons`,
    // `size` et `occupancy` rendent 400 : ils n'y sont pas.
    const u = new URL(urlResultatsFeratel("https://exemple.test", "laclusaz", "abc-123"));
    const champs = u.searchParams.get("fields") ?? "";
    assert.ok(champs.includes("services{id,name,rooms,bedrooms,products{"), champs);
    assert.ok(champs.includes("categories{id,name}"), champs);
    assert.ok(champs.includes("location{coordinate{lat,long},town,district}"), champs);
    assert.doesNotMatch(champs, /maxPersons|occupancy|size/);
  });

  it("un studio publie une pièce et zéro chambre, et ce zéro est vrai", () => {
    assert.equal(par("Verte Vallée 11")?.pieces, 1);
    assert.equal(par("Verte Vallée 11")?.chambres, 0);
    assert.equal(par("Lodge Helios")?.pieces, 4);
    assert.equal(par("Lodge Helios")?.chambres, 3);
  });

  it("zéro pièce vaut « non renseigné », et le zéro chambre qui l'accompagne aussi", () => {
    // Les services de l'hôtel écrivent tous `rooms: 0, bedrooms: 0` : ce n'est
    // pas un logement sans pièce, c'est une case vide.
    assert.equal(par("Hôtel Beaulieu")?.pieces, null);
    assert.equal(par("Hôtel Beaulieu")?.chambres, null);
    // Des chambres publiées sans pièces restent lues.
    const mgm = par("Résidence MGM - Hameau de l'Ours T4 Prestige");
    assert.equal(mgm?.pieces, null);
    assert.equal(mgm?.chambres, 3);
  });

  it("le champ est lu tel quel, même quand le nom du service dit « Studio »", () => {
    // « Studio GRANGE B7 » publie deux pièces et une chambre. Le champ est ce
    // que la centrale renseigne ; le nom, ce qu'elle affiche.
    assert.equal(par("Granges B7")?.service, "Studio GRANGE B7");
    assert.equal(par("Granges B7")?.pieces, 2);
    assert.equal(par("Granges B7")?.chambres, 1);
  });

  it("pièces et chambres sont celles du service qui porte le prix retenu", () => {
    const beaulieu = par("Hôtel Beaulieu");
    assert.equal(beaulieu?.total, 3721.6);
    assert.equal(beaulieu?.service, "Chambre familiale, douche, WC, confort");
  });

  it("lit commune et quartier, y compris pour un logement sans coordonnées", () => {
    const helios = par("Lodge Helios");
    assert.equal(helios?.lat, null);
    assert.equal(helios?.commune, "La Clusaz");
    assert.equal(helios?.quartier, "Vallée des Confins");
    // La centrale de La Clusaz vend aussi à Manigod : la commune publiée le dit.
    assert.equal(par("Résidence MGM - Hameau de l'Ours T4 Prestige")?.commune, "Manigod");
  });

  it("le type est la catégorie publiée, sans « Location », qui ne dit pas ce qu'on loue", () => {
    assert.deepEqual(par("Verte Vallée 11")?.categories, ["Location", "Studio"]);
    assert.equal(typeFeratel(par("Verte Vallée 11")?.categories ?? []), "Studio");
    assert.equal(typeFeratel(par("Lodge Helios")?.categories ?? []), "Chalet individuel");
    // Vu au même relevé : « Studio » et « Appartement » ensemble.
    assert.equal(typeFeratel(["Studio", "Appartement"]), "Studio, Appartement");
    assert.equal(typeFeratel(["Location"]), "Location");
    assert.equal(typeFeratel([]), null);
  });

  it("écarte l'hôtel par sa catégorie, jamais par le nom d'un service", () => {
    assert.equal(typeEcarteFeratel(par("Hôtel Beaulieu")?.categories ?? []), "hôtel");
    // Vu : « Hôtel » avec « Location » (Hôtel Les Sapins).
    assert.equal(typeEcarteFeratel(["Hôtel", "Location"]), "hôtel");
    for (const t of [
      "Verte Vallée 11",
      "Lodge Helios",
      "Résidence MGM - Hameau de l'Ours T4 Prestige",
      "Granges B7",
    ]) {
      assert.equal(typeEcarteFeratel(par(t)?.categories ?? []), null, t);
    }
    // Les autres catégories du relevé sont gardées.
    for (const c of [
      "Appartement",
      "Appartement dans chalet",
      "Demi-Chalet",
      "Résidence de tourisme",
    ]) {
      assert.equal(typeEcarteFeratel([c]), null, c);
    }
  });

  it("la règle du propriétaire, sur des catégories construites", () => {
    // Construites : aucune n'a paru à La Clusaz le 25 septembre 2026.
    for (const c of [
      "Camping",
      "Chambre d'hôtes",
      "Chambres d’hôtes",
      "Gîte d'étape",
      "Refuge",
      "Hébergement insolite",
      "Yourte",
      "Cabane dans les arbres",
    ]) {
      assert.ok(typeEcarteFeratel([c]), c);
    }
    for (const c of ["Gîte", "Meublé de tourisme", "Maison"]) {
      assert.equal(typeEcarteFeratel([c]), null, c);
    }
  });

  it("le nom de l'hébergement ne juge que le camping", () => {
    const helios = par("Lodge Helios");
    assert.ok(helios);
    assert.equal(horsRegleFeratel(helios), null);
    assert.equal(horsRegleFeratel({ ...helios, titre: "Camping Le Plan du Fernuy" }), "camping");
    // Un nom n'est pas un type : ni refuge, ni bulle.
    assert.equal(horsRegleFeratel({ ...helios, titre: "Chalet Le Refuge des Bulles" }), null);
  });

  it("une catégorie inconnue est gardée, et nommée ; « Location » seulement seule", () => {
    assert.equal(typeEcarteFeratel(["Location", "Loft"]), null);
    assert.deepEqual(categoriesInconnuesFeratel(["Location", "Loft"]), ["Loft"]);
    assert.deepEqual(categoriesInconnuesFeratel(["Location"]), ["Location"]);
    // Les catégories du relevé sont toutes connues.
    for (const t of ["Verte Vallée 11", "Lodge Helios", "Granges B7"]) {
      assert.deepEqual(categoriesInconnuesFeratel(par(t)?.categories ?? []), [], t);
    }
  });

  it("un relevé sans ces champs se lit comme avant, sans rien inventer", () => {
    // Le relevé du 13 septembre ne les demandait pas.
    const aigles = lireFeratel(RELEVE).find((f) => f.titre === "Les Aigles 1");
    assert.equal(aigles?.pieces, null);
    assert.equal(aigles?.chambres, null);
    assert.deepEqual(aigles?.categories, []);
    assert.equal(aigles?.commune, null);
    assert.equal(aigles?.quartier, null);
  });
});

describe("Deskline / Feratel : une grande page, parce que le service ne tourne pas les pages", () => {
  it("demande deux cents résultats d'un coup", () => {
    // Relevé du 25 septembre 2026 à La Clusaz, quatre personnes : 183
    // résultats annoncés. `pageNo=1`, `page=1` et le lien `links.next`
    // rendaient tous les soixante hébergements de la page 0 ; `pageSize=200`
    // rendait les 183 en une page, chacun une fois.
    assert.equal(FERATEL_PAR_PAGE, 200);
    const u = new URL(urlResultatsFeratel("https://exemple.test", "laclusaz", "abc-123", 0));
    assert.equal(u.searchParams.get("pageSize"), "200");
    assert.equal(u.searchParams.get("pageNo"), "0");
  });

  it("lit le compte que le service annonce", () => {
    // `paging` tel que la page 0 de soixante le publiait, verbatim.
    const page0 = {
      data: [],
      paging: { pageNo: 0, pageSize: 60, pageCount: 4, totalRecordCount: 183 },
    };
    assert.equal(compteFeratel(page0), 183);
    assert.equal(compteFeratel({ data: [], paging: { totalRecordCount: 0 } }), 0);
  });

  it("sans compte publié, rien n'est inventé", () => {
    // Le gabarit du 13 septembre n'en porte pas.
    assert.equal(compteFeratel(RELEVE), null);
    assert.equal(compteFeratel(null), null);
    assert.equal(compteFeratel({ data: [], paging: null }), null);
    assert.equal(compteFeratel({ data: [], paging: { totalRecordCount: "beaucoup" } }), null);
    assert.equal(compteFeratel({ data: [], paging: { totalRecordCount: -1 } }), null);
  });
});

/**
 * Relevé du 25 septembre 2026, même recherche (La Clusaz, 6 au 13 février
 * 2027, quatre personnes). L'hébergement « Odalys Evasion - Résidence Mendi
 * Alde », d'abord tel que la liste le publie (trois de ses six services), puis
 * le détail de ses services (`urlServicesFeratel`) pour les mêmes trois
 * produits. Valeurs de la réponse ; `maxPersons` et les enfants sont gardés
 * pour montrer qu'ils ne sont pas lus.
 */
const MENDI_ALDE_LISTE = {
  "data": [
    {
      "id": "d41b2c08-0483-450c-9c58-a94ae851bb48",
      "name": "Odalys Evasion - Résidence Mendi Alde",
      "dbCode": "FRA",
      "services": [
        {
          "id": "b6acb273-f45f-4a5b-bdf5-3b7f485ad3f9",
          "name": "Appartement, douche ou baignoire, WC, confort",
          "rooms": 4,
          "bedrooms": 3,
          "products": [
            { "id": "86ca0291-d268-4dc3-8a18-da4a15f6bf86", "name": "4 pièces 8 personnes (env. 70 m²)", "price": { "value": 5791.8 } }
          ]
        },
        {
          "id": "cca2edc1-e4b8-43a1-865c-40e668dda7a0",
          "name": "Appartement, douche ou baignoire, WC, confort",
          "rooms": 2,
          "bedrooms": 1,
          "products": [
            { "id": "ecce1c13-db67-4e98-b0c6-4586e62074fc", "name": "2 pièces 4 personnes (33 à 38 m²)", "price": { "value": 2991.8 } }
          ]
        },
        {
          "id": "2c3be8a9-47a3-4607-b107-8c99be6b0abb",
          "name": "Appartement, douche ou baignoire, WC, confort",
          "rooms": 3,
          "bedrooms": 2,
          "products": [
            { "id": "6860a4d7-2031-40da-b163-27c7fd6c1efb", "name": "3 pièces 6 personnes (45 à 50 m²)", "price": { "value": 3721.8 } }
          ]
        }
      ]
    }
  ]
} as const;

const MENDI_ALDE_SERVICES = {
  "data": [
    {
      "id": "cca2edc1-e4b8-43a1-865c-40e668dda7a0",
      "maxPersons": 7,
      "products": [
        {
          "id": "ecce1c13-db67-4e98-b0c6-4586e62074fc",
          "occupancy": { "minAdults": 1, "maxAdults": 4, "minChildren": 0, "maxChildren": 3, "minBed": 1, "maxBed": 4 }
        }
      ]
    },
    {
      "id": "2c3be8a9-47a3-4607-b107-8c99be6b0abb",
      "maxPersons": 11,
      "products": [
        {
          "id": "6860a4d7-2031-40da-b163-27c7fd6c1efb",
          "occupancy": { "minAdults": 1, "maxAdults": 6, "minChildren": 0, "maxChildren": 5, "minBed": 1, "maxBed": 6 }
        }
      ]
    },
    {
      "id": "b6acb273-f45f-4a5b-bdf5-3b7f485ad3f9",
      "maxPersons": 15,
      "products": [
        {
          "id": "86ca0291-d268-4dc3-8a18-da4a15f6bf86",
          "occupancy": { "minAdults": 1, "maxAdults": 8, "minChildren": 0, "maxChildren": 7, "minBed": 1, "maxBed": 8 }
        }
      ]
    }
  ],
  "paging": { "pageNo": 0, "pageSize": 32767, "pageCount": 1, "totalRecordCount": 6 }
} as const;

describe("Deskline / Feratel : la capacité, dans le détail des services", () => {
  it("l'adresse du détail est celle que le composant appelle", () => {
    const u = new URL(
      urlServicesFeratel(
        "https://webapi.deskline.net/",
        "laclusaz",
        "FRA",
        "d41b2c08-0483-450c-9c58-a94ae851bb48",
        "3cd97fab-d8f7-47ce-bde7-b8c1a2005d66",
      ),
    );
    assert.equal(
      u.pathname,
      "/laclusaz/fr/accommodations/FRA/d41b2c08-0483-450c-9c58-a94ae851bb48/services/searchresults/3cd97fab-d8f7-47ce-bde7-b8c1a2005d66",
    );
    assert.equal(u.searchParams.get("fields"), "id,products{id,occupancy{maxAdults,maxBed}}");
    assert.equal(u.searchParams.get("currency"), "EUR");
    assert.equal(u.searchParams.get("pageNo"), "0");
  });

  it("la liste donne la base qui entre dans cette adresse", () => {
    assert.equal(lireFeratel(MENDI_ALDE_LISTE)[0]?.base, "FRA");
    const u = new URL(urlResultatsFeratel("https://exemple.test", "laclusaz", "abc"));
    assert.match(u.searchParams.get("fields") ?? "", /^id,name,dbCode,/);
    // Le gabarit du 13 septembre ne la demandait pas.
    assert.equal(lireFeratel(RELEVE)[0]?.base, null);
  });

  it("maxAdults et maxBed valent la capacité que le nom du produit annonce", () => {
    const c = capacitesFeratel(MENDI_ALDE_SERVICES);
    assert.deepEqual(c.get("ecce1c13-db67-4e98-b0c6-4586e62074fc"), { adultes: 4, lits: 4 });
    assert.deepEqual(c.get("6860a4d7-2031-40da-b163-27c7fd6c1efb"), { adultes: 6, lits: 6 });
    assert.deepEqual(c.get("86ca0291-d268-4dc3-8a18-da4a15f6bf86"), { adultes: 8, lits: 8 });
    // `maxPersons` (7, 11, 15) additionne adultes et enfants : il n'est pas lu.
    for (const v of c.values()) assert.ok(v.adultes !== 7 && v.adultes !== 11 && v.adultes !== 15);
  });

  it("la capacité est celle du produit vendu, le moins cher", () => {
    const f = lireFeratel(MENDI_ALDE_LISTE)[0];
    assert.equal(f?.total, 2991.8);
    assert.equal(f?.produit, "2 pièces 4 personnes (33 à 38 m²)");
    assert.deepEqual(capacitesFeratel(MENDI_ALDE_SERVICES).get(f?.produitId ?? ""), {
      adultes: 4,
      lits: 4,
    });
    // Pièces et chambres restent celles du service de ce produit.
    assert.equal(f?.pieces, 2);
    assert.equal(f?.chambres, 1);
  });

  it("zéro, une valeur absente ou un produit sans identifiant ne donnent rien", () => {
    const vide = capacitesFeratel({
      data: [
        {
          products: [
            { id: "a", occupancy: { maxAdults: 0, maxBed: 0 } },
            { id: "b", occupancy: null },
            { id: null, occupancy: { maxAdults: 4, maxBed: 4 } },
            { id: "c", occupancy: { maxAdults: 5 } },
          ],
        },
      ],
    });
    assert.deepEqual([...vide], [["c", { adultes: 5, lits: null }]]);
    assert.equal(capacitesFeratel(null).size, 0);
  });
});

describe("Deskline / Feratel : la mémoire des capacités, produit par produit", () => {
  const JOUR = 24 * 3600 * 1000;
  const TTL = 30 * JOUR;

  it("une lecture date ce qu'elle publie, et ne rajeunit pas le reste", () => {
    const t0 = Date.UTC(2026, 8, 1);
    const premiere = verserCapacites(undefined, capacitesFeratel(MENDI_ALDE_SERVICES), t0, TTL);
    assert.equal(premiere.size, 3);
    // Vingt jours plus tard, une autre recherche ne liste que le 2 pièces.
    const t1 = t0 + 20 * JOUR;
    const deux = "ecce1c13-db67-4e98-b0c6-4586e62074fc";
    const quatre = "86ca0291-d268-4dc3-8a18-da4a15f6bf86";
    const seconde = verserCapacites(premiere, new Map([[deux, { adultes: 4, lits: 4 }]]), t1, TTL);
    assert.equal(seconde.get(deux)?.lueA, t1);
    assert.equal(seconde.get(quatre)?.lueA, t0);
    assert.equal(seconde.get(quatre)?.adultes, 8);
    // Trente jours après la première lecture, le 4 pièces n'est plus su ; le
    // 2 pièces, relu, l'est encore.
    const t2 = t0 + 30 * JOUR;
    const fraiches = capacitesFraiches(seconde, t2, TTL);
    assert.equal(fraiches.has(quatre), false);
    assert.equal(fraiches.get(deux)?.adultes, 4);
    // Une nouvelle lecture ne le fait pas revenir : il est purgé.
    assert.equal(verserCapacites(seconde, new Map(), t2, TTL).has(quatre), false);
  });

  it("une valeur relue remplace l'ancienne", () => {
    const t0 = Date.UTC(2026, 8, 1);
    const avant = verserCapacites(undefined, new Map([["p", { adultes: 6, lits: 6 }]]), t0, TTL);
    const apres = verserCapacites(avant, new Map([["p", { adultes: 4, lits: 4 }]]), t0 + JOUR, TTL);
    assert.deepEqual(apres.get("p"), { adultes: 4, lits: 4, lueA: t0 + JOUR });
    assert.equal(capacitesFraiches(undefined, t0, TTL).size, 0);
  });
});
