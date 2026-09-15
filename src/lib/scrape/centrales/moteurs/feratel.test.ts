import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  corpsRechercheFeratel,
  FERATEL_PAR_PAGE,
  lireFeratel,
  sessionFeratel,
  urlRechercheFeratel,
  urlResultatsFeratel,
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
    assert.equal(u.searchParams.get("pageSize"), "60");
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
