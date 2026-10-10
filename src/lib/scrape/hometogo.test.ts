import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compteurPublie,
  lieuDepuisHtml,
  noteDe,
  offreEnListing,
  pageSuivante,
  prixAffiche,
  slugsLieu,
  avecDetailOuNon,
  idsSansDetail,
  lireDetailsEnRetard,
  lotsDe,
  continuerDomaine,
  estInterstitielCloudflare,
  AMORCE_HOMETOGO,
  carteNavigation,
  noeudNomme,
  noeudsDuNom,
  retenirLieu,
  DETAIL_NON_LU,
  LOT_DETAILS,
} from "./hometogo.ts";
import type { LiveSearchInput } from "./types.ts";

/**
 * Champs repris d'une réponse HomeToGo réelle (Les Deux Alpes, 9 octobre 2026) :
 * seulement les clés lues par le collecteur. Rien n'y est ajouté pour le test.
 */

const INPUT: LiveSearchInput = {
  stationId: "les-2-alpes",
  stationName: "Les 2 Alpes",
  lat: 45.01,
  lon: 6.12,
  checkIn: "2027-02-06",
  checkOut: "2027-02-13",
  guests: 8,
  bedrooms: 4,
};

const HTML = `<script id="location-data-json" type="application/json">{"data":{"locationId":"5460aec004a18","seoDocumentId":"81055cb257acb87e5e8899435d3c5318"}}</script>
"location":"France/Auvergne-Rhône-Alpes/Isère/Les Deux Alpes"`;

describe("lieu HomeToGo", () => {
  it("prend l'identifiant publié quand le dernier maillon est la station", () => {
    assert.deepEqual(lieuDepuisHtml(HTML, "Les 2 Alpes"), {
      locationId: "5460aec004a18",
      fsid: "81055cb257acb87e5e8899435d3c5318",
    });
  });

  it("refuse une page dont le lieu publié n'est pas la station", () => {
    assert.equal(lieuDepuisHtml(HTML, "Val Thorens"), null);
    assert.equal(lieuDepuisHtml("<html></html>", "Les 2 Alpes"), null);
  });

  it("lit la page rendue : chemin, locationId et fsid du lien, même échappés", () => {
    const rendu = `<link rel="preload" href="/search/5460aec004a18?fsid=81055cb257acb87e5e8899435d3c5318&_format=json">
"location":"France\\/Auvergne-Rhône-Alpes\\/Isère\\/Les Deux Alpes","locationId":"5460aec004a18"`;
    assert.deepEqual(lieuDepuisHtml(rendu, "Les 2 Alpes"), AMORCE_HOMETOGO);
    assert.equal(lieuDepuisHtml(rendu, "Tignes"), null);
  });

  it("essaie le slug en toutes lettres avant le chiffre", () => {
    assert.deepEqual(slugsLieu("Les 2 Alpes"), ["les-deux-alpes", "les-2-alpes"]);
  });
});

describe("compteur et page", () => {
  it("lit le compteur affiché, pas un nombre fabriqué", () => {
    assert.equal(compteurPublie({ totalCount: "4 490" }), 4490);
    assert.equal(compteurPublie({ totalCount: "46" }), 46);
    assert.equal(compteurPublie({ totalCountRaw: 50 }), null);
    assert.equal(compteurPublie({}), null);
  });

  it("avance tant que la source donne une page suivante", () => {
    assert.equal(
      pageSuivante({
        pagerFilter: { pager: { isLastPage: false, currentPage: 1, nextPageLink: { page: 2 } } },
      }),
      2,
    );
    assert.equal(
      pageSuivante({
        pagerFilter: { pager: { isLastPage: true, currentPage: 1, nextPageLink: { page: 1 } } },
      }),
      null,
    );
  });
});

describe("note et prix", () => {
  it("garde la note seulement quand l'échelle est écrite", () => {
    assert.deepEqual(
      noteDe({
        reviewCount: 2,
        value: "8,0",
        maxStarValue: "5,0",
        starValue: "4,0",
        starMessage: "Evaluation moyenne de l'hébergement : 4,0 sur 5.",
      }),
      { rating: 4, reviewCount: 2 },
    );
    assert.deepEqual(noteDe({ value: "8,0", reviewCount: 12 }), { rating: null, reviewCount: 12 });
  });

  it("lit un total en euros, et un « dès » n'en est pas un", () => {
    assert.deepEqual(prixAffiche("1 610 €"), { total: 1610, currency: "EUR", indicatif: false });
    assert.deepEqual(prixAffiche("1 610,50 €"), { total: 1610.5, currency: "EUR", indicatif: false });
    assert.deepEqual(prixAffiche("dès 43 €"), { total: 0, currency: "EUR", indicatif: true });
    assert.equal(prixAffiche("1610"), null);
  });
});

describe("offre", () => {
  it("relève le détail publié : nom, total exact, capacité, avis, équipements", () => {
    const row = offreEnListing(
      {
        id: "4fe03c3d34a6d703",
        objectName: null,
        name: "Merveilleux appartement de vacances | Vue montagne",
        type: "Appartement",
        persons: 10,
        bedrooms: 5,
        bathrooms: 3,
        petFriendly: true,
        geoLocation: { lat: 45.009, lon: 6.121 },
        locationShorted: "Mont-de-Lans, Isère, France",
        price: {
          exact: true,
          mode: "totalPrice",
          totalRaw: 6321,
          currency: "EUR",
          display: "6 321 €",
        },
        ratings: {
          reviewCount: 2,
          value: "8,0",
          maxStarValue: "5,0",
          starValue: "4,0",
          starMessage: "Evaluation moyenne de l'hébergement : 4,0 sur 5.",
        },
        description: { unit: { content: "Grand appartement 7 pièces de 99m² pour 10 personnes." } },
        amenities: { icons: [{ label: "Cheminée" }, { label: "Accès internet" }] },
        images: [{ large: "//cdn.hometogo.net/large/v1/a.jpg" }],
        actions: { conversion: { first: { link: "/rental/4fe03c3d34a6d703?clickId=abc&arrival=2027-02-06&duration=7&location=5460aec004a18&pricetype=totalPrice" } } },
      },
      INPUT,
      "5460aec004a18",
      7,
    );
    assert.ok(row);
    assert.equal(row.source, "HomeToGo");
    assert.equal(row.total, 6321);
    assert.equal(row.currency, "EUR");
    assert.equal(row.capacity, 10);
    assert.equal(row.bedrooms, 5);
    assert.equal(row.baths, 3);
    assert.equal(row.rating, 4);
    assert.equal(row.reviewCount, 2);
    assert.equal(row.propertyType, "Appartement");
    assert.match(row.description ?? "", /99m²/);
    assert.equal(row.photo, "https://cdn.hometogo.net/large/v1/a.jpg");
    assert.equal(row.locality, "Mont-de-Lans, Isère, France");
    assert.match(row.url ?? "", /^https:\/\/www\.hometogo\.fr\/rental\/4fe03c3d34a6d703\?/);
    assert.doesNotMatch(row.url ?? "", /clickId/);
    assert.equal(row.amenities?.find((a) => a.cle === "wifi")?.valeur, "oui");
    assert.equal(row.amenities?.find((a) => a.cle === "animaux")?.valeur, "oui");
    assert.equal(row.amenities?.find((a) => a.cle === "piscine")?.valeur, "inconnu");
  });

  it("laisse de côté un squelette sans titre", () => {
    assert.equal(
      offreEnListing({ id: "abc", geoLocation: { lat: 1, lon: 2 } }, INPUT, "5460aec004a18", 7),
      null,
    );
  });

  it("ne prend pas un prix dont l'exactitude n'est pas publiée comme total", () => {
    const row = offreEnListing(
      {
        id: "abc123",
        title: "Chalet",
        price: { exact: false, mode: "totalPrice", totalRaw: 14, currency: "EUR", display: "14 €" },
      },
      INPUT,
      "5460aec004a18",
      7,
    );
    assert.equal(row?.total, 0);
    assert.equal(row?.priceIndicative, true);
    assert.equal(row?.priceLabel, "14 €");
  });

  it("lit le montant affiché quand totalRaw n'est pas publié", () => {
    const row = offreEnListing(
      {
        id: "abc123",
        title: "Chalet",
        price: { exact: true, mode: "totalPrice", currency: "EUR", display: "6 321 €" },
      },
      INPUT,
      "5460aec004a18",
      7,
    );
    assert.equal(row?.total, 6321);
    assert.equal(row?.pricedCheckIn, INPUT.checkIn);
    assert.equal(row?.pricedCheckOut, INPUT.checkOut);
    assert.equal(typeof row?.scannedAt, "number");
  });

  it("date un total exact, et ne date pas une offre sans prix", () => {
    const date = offreEnListing(
      {
        id: "abc123",
        title: "Chalet",
        price: { exact: true, mode: "totalPrice", totalRaw: 6321, currency: "EUR", display: "6 321 €" },
      },
      INPUT,
      "5460aec004a18",
      7,
    );
    assert.equal(date?.pricedCheckIn, "2027-02-06");
    assert.equal(date?.pricedCheckOut, "2027-02-13");
    assert.ok(date?.scannedAt != null && Date.now() - date.scannedAt < 5_000);
    const sans = offreEnListing({ id: "abc123", title: "Chalet" }, INPUT, "5460aec004a18", 7);
    assert.equal(sans?.total, 0);
    assert.equal(sans?.pricedCheckIn, undefined);
    assert.equal(sans?.scannedAt, undefined);
  });
});

describe("domaine", () => {
  it("une page illisible n'arrête pas la station suivante ; un refus ou l'échéance, si", () => {
    assert.equal(continuerDomaine(null, false), true);
    assert.equal(continuerDomaine("HTTP 400", false), true);
    assert.equal(continuerDomaine("réponse illisible", false), true);
    assert.equal(continuerDomaine("échéance", false), false);
    assert.equal(continuerDomaine("HTTP 429", true), false);
    assert.equal(continuerDomaine("HTTP 403", true), false);
    assert.equal(continuerDomaine("interstitiel Cloudflare", false), true);
  });

  it("un défi Cloudflare n'est pas un refus de HomeToGo", () => {
    assert.equal(estInterstitielCloudflare(403, "challenge", "<title>Just a moment...</title>"), true);
    assert.equal(
      estInterstitielCloudflare(403, null, "<title>Just a moment...</title> challenges.cloudflare.com"),
      true,
    );
    assert.equal(estInterstitielCloudflare(403, null, "<html>forbidden</html>"), false);
    assert.equal(estInterstitielCloudflare(200, "challenge", "Just a moment... challenges.cloudflare.com"), false);
    assert.equal(estInterstitielCloudflare(429, "challenge", "Just a moment..."), false);
  });
});

const NAV = {
  filters: {
    destination_navigation: {
      sublocations: {
        nodes: [
          { id: "5931591661956", label: "Alpes du Nord", link: { fsid: AMORCE_HOMETOGO.fsid } },
          { id: "5460aebfe6f31", label: "Isère", link: { fsid: AMORCE_HOMETOGO.fsid } },
          { id: "606f3cfb62002", label: "Les Deux Alpes", link: { fsid: AMORCE_HOMETOGO.fsid } },
          { id: "5460aec004a18", label: "Les Deux Alpes", link: { fsid: AMORCE_HOMETOGO.fsid } },
          { id: "53903dd5ae712", label: "Chamonix-Mont-Blanc", link: { fsid: AMORCE_HOMETOGO.fsid } },
          { id: "pas-un-id", label: "Fantôme", link: { fsid: AMORCE_HOMETOGO.fsid } },
        ],
      },
    },
  },
  topSuggestions: { suggestions: [{ id: "5460aeb1b0bf2", trail: "", shortTitle: "France" }] },
  analyticsSnowPlow: { search: { location: "France/Auvergne-Rhône-Alpes/Isère/Les Deux Alpes" } },
  searchSummary: { locationCountRaw: 2237 },
};

describe("lieu via la recherche JSON autorisée", () => {
  it("l'amorce est la paire publiée par la page Les Deux Alpes", () => {
    assert.deepEqual(lieuDepuisHtml(HTML, "Les 2 Alpes"), AMORCE_HOMETOGO);
  });

  it("lit les nœuds, la racine et le chemin, et écarte un identifiant illisible", () => {
    const carte = carteNavigation(NAV);
    assert.equal(carte.racine, "5460aeb1b0bf2");
    assert.equal(carte.trail, "France/Auvergne-Rhône-Alpes/Isère/Les Deux Alpes");
    assert.equal(carte.locationCount, 2237);
    assert.equal(carte.noeuds.some((n) => n.label === "Fantôme"), false);
    assert.equal(noeudNomme(carte.noeuds, "Alpes du Nord")?.id, "5931591661956");
  });

  it("« Les 2 Alpes » vise les deux lieux publiés sous ce nom, pas un choix unique", () => {
    const carte = carteNavigation(NAV);
    assert.deepEqual(
      noeudsDuNom(carte.noeuds, "Les 2 Alpes").map((n) => n.id),
      ["606f3cfb62002", "5460aec004a18"],
    );
  });

  it("un seul préfixe relie Chamonix à Chamonix-Mont-Blanc ; deux préfixes ne choisissent pas", () => {
    const carte = carteNavigation(NAV);
    assert.equal(noeudNomme(carte.noeuds, "Chamonix")?.id, "53903dd5ae712");
    const deux = [
      ...carte.noeuds,
      { id: "11111111", label: "Chamonix Sud", fsid: AMORCE_HOMETOGO.fsid },
    ];
    assert.equal(noeudNomme(deux, "Chamonix"), null);
  });

  it("deux homonymes : le chemin le plus court, puis le plus petit compteur publié", () => {
    const fsid = AMORCE_HOMETOGO.fsid;
    assert.equal(
      retenirLieu(
        [
          {
            locationId: "5460aec53a52f",
            fsid,
            trail: "France/Auvergne-Rhône-Alpes/Savoie/Saint-Martin-de-Belleville/Val Thorens",
            locationCount: 4356,
          },
          {
            locationId: "5adf3059cf03a",
            fsid,
            trail: "France/Auvergne-Rhône-Alpes/Savoie/Val Thorens",
            locationCount: 699,
          },
        ],
        "Val Thorens",
      )?.locationId,
      "5adf3059cf03a",
    );
    assert.equal(
      retenirLieu(
        [
          {
            locationId: "606f3cfb62002",
            fsid,
            trail: "France/Auvergne-Rhône-Alpes/Isère/Les Deux Alpes",
            locationCount: 2300,
          },
          {
            locationId: "5460aec004a18",
            fsid,
            trail: "France/Auvergne-Rhône-Alpes/Isère/Les Deux Alpes",
            locationCount: 2237,
          },
        ],
        "Les 2 Alpes",
      )?.locationId,
      "5460aec004a18",
    );
    assert.equal(retenirLieu([], "Tignes"), null);
  });
});

describe("détail en retard", () => {
  it("repère les identifiants encore sans détail", () => {
    assert.deepEqual(idsSansDetail(["a", "b", "", "c"], new Set(["b"])), ["a", "c"]);
  });

  it("découpe au lot du site, le dernier peut être plus court", () => {
    const ids = Array.from({ length: LOT_DETAILS + 1 }, (_, i) => `id${i}`);
    const lots = lotsDe(ids);
    assert.equal(lots.length, 2);
    assert.equal(lots[0]?.length, LOT_DETAILS);
    assert.deepEqual(lots[1], [`id${LOT_DETAILS}`]);
  });

  it("marque une offre non détaillée, une seule fois", () => {
    const row = offreEnListing({ id: "abc123", title: "Chalet" }, INPUT, "5460aec004a18", 7);
    assert.ok(row);
    const marquee = avecDetailOuNon(row, false);
    assert.match(marquee.proven, new RegExp(DETAIL_NON_LU));
    assert.equal(avecDetailOuNon(marquee, false), marquee);
    assert.equal(avecDetailOuNon(row, true), row);
  });

  it("un refus n'appelle ni le lot suivant ni noter", async () => {
    const vus: string[][] = [];
    const notes: string[] = [];
    const arret = await lireDetailsEnRetard([["a"], ["b"]], {
      tirer: async (ids) => {
        vus.push([...ids]);
        return "refus";
      },
      noter: (ids) => notes.push(ids.join(",")),
      attendre: async () => undefined,
      maintenant: () => 0,
      echeance: 10,
      pauseMs: 1,
    });
    assert.equal(arret, "refus");
    assert.deepEqual(vus, [["a"]]);
    assert.deepEqual(notes, []);
  });

  it("une échéance avant le premier lot n'appelle pas tirer", async () => {
    let appels = 0;
    const arret = await lireDetailsEnRetard([["a"]], {
      tirer: async () => {
        appels += 1;
        return [];
      },
      noter: () => undefined,
      attendre: async () => undefined,
      maintenant: () => 20,
      echeance: 10,
      pauseMs: 1,
    });
    assert.equal(arret, "échéance");
    assert.equal(appels, 0);
  });

  it("une échéance après la pause n'appelle pas tirer", async () => {
    let t = 0;
    let appels = 0;
    const arret = await lireDetailsEnRetard([["a"]], {
      tirer: async () => {
        appels += 1;
        return [];
      },
      noter: () => undefined,
      attendre: async () => {
        t = 20;
      },
      maintenant: () => t,
      echeance: 10,
      pauseMs: 1,
    });
    assert.equal(arret, "échéance");
    assert.equal(appels, 0);
  });

  it("un lot réussi est noté, puis le suivant est lu", async () => {
    const notes: string[] = [];
    const arret = await lireDetailsEnRetard([["a"], ["b"]], {
      tirer: async (ids) => [{ id: ids[0] }],
      noter: (ids, offres) => notes.push(`${ids.join(",")}:${offres.length}`),
      attendre: async () => undefined,
      maintenant: () => 0,
      echeance: 10,
      pauseMs: 1,
    });
    assert.equal(arret, "fin");
    assert.deepEqual(notes, ["a:1", "b:1"]);
  });
});
