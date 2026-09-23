import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  blocage,
  deviseFromGitesHtml,
  listingDeFiche,
  nombreDeResultats,
  occupancyFromGitesHtml,
  pageSuivante,
  prixDuTableau,
  scrapeGites,
  searchUrl,
  totalPublie,
  trierParDistance,
  type Fiche,
  type Tile,
} from "./gites.server.ts";
import { COMMUNES_GITES, communeGites } from "./gitesCommunes.ts";
import { lieuFromGitesHtml, lieuGitesEnCache, retenirLieuGites, viderCacheGitesGps } from "./gitesGps.server.ts";
import type { LiveSearchInput } from "./types.ts";

/**
 * Le dépôt ne contient **aucune** page de résultats Gîtes de France ni aucun
 * tableau de prix ITEA enregistré. Les fragments ci-dessous sont donc
 * construits à partir des seules clés que le collecteur lit — `numberOfGuests`,
 * `numberOfBedrooms`, `geo`, `addressLocality`, `sp_montantPrixTotal`,
 * `data-prix` — et d'elles seules. Aucun champ n'y est inventé pour faire
 * passer un test, et ces tests prouvent le comportement du lecteur, pas la
 * forme réelle des pages : c'est précisément pourquoi les lectures visées sont
 * défensives et rendent `null` quand elles ne reconnaissent rien.
 *
 * Ce qui est éprouvé tient en trois phrases : **le collecteur relève, il ne
 * trie pas** (une capacité absente ou plus petite que la demande ne fait plus
 * disparaître une annonce, un prix absent non plus) ; **ce qui est publié se
 * pose** (commune, type, lieu, libellé de prix) ; **ce qui n'est pas reconnu
 * vaut `null`**, jamais zéro.
 */

const INPUT: LiveSearchInput = {
  stationId: "les-2-alpes",
  stationName: "Les 2 Alpes",
  lat: 45.0106,
  lon: 6.1226,
  checkIn: "2027-02-06",
  checkOut: "2027-02-13",
  guests: 8,
  bedrooms: 4,
};

function tuile(extra: Partial<Tile> = {}): Tile {
  return {
    title: "Le Petit Gîte",
    url: "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/le-petit-gite-38g40102",
    typeLabel: "Gîte",
    capacite: "",
    photo: null,
    lat: null,
    lon: null,
    ...extra,
  };
}

function fiche(extra: Partial<Fiche> = {}): Fiche {
  return {
    total: 0,
    currency: null,
    priceLabel: null,
    occupancy: { guests: null, bedrooms: null, rooms: null },
    lieu: { lat: null, lon: null, locality: null },
    platformId: null,
    ...extra,
  };
}

describe("compteur de résultats", () => {
  it("lit le nombre annoncé par le moteur", () => {
    assert.equal(nombreDeResultats(["Locations en Isère", "28 résultats"]), 28);
    assert.equal(nombreDeResultats(["1 234 logements"]), 1234);
    assert.equal(nombreDeResultats(["12 hébergements trouvés"]), 12);
  });

  it("lit un attribut qui ne porte que le nombre", () => {
    assert.equal(nombreDeResultats(["42"]), 42);
  });

  it("rend null quand rien ne ressemble à un compteur", () => {
    assert.equal(nombreDeResultats(["Votre séjour au ski", "Trier par prix"]), null);
    assert.equal(nombreDeResultats([]), null);
  });

  it("ne prend pas un nombre de nuits ou de personnes pour un compteur", () => {
    assert.equal(nombreDeResultats(["7 nuits, 8 personnes"]), null);
  });
});

describe("page suivante", () => {
  it("ajoute le paramètre de pagination Drupal sans toucher au reste", () => {
    const u = pageSuivante("https://www.gites-de-france.com/fr/search?towns=50301&travelers=8", 1);
    assert.ok(u);
    const parsed = new URL(u);
    assert.equal(parsed.searchParams.get("page"), "1");
    assert.equal(parsed.searchParams.get("towns"), "50301");
  });
});

describe("tableau de prix ITEA", () => {
  const ligne = (libelle: string, prix: string) =>
    `<tr><td>${libelle}</td><td><span class="sp_montantPrixTotal" data-prix="${prix}">${prix.replace(".", ",")} &euro;</span></td></tr>`;

  it("retient la formule la moins chère, pas la première venue", () => {
    const tab = `<table>${ligne("Semaine complète", "1898.40")}${ligne("Court séjour 7 nuits", "1727.44")}</table>`;
    const prix = prixDuTableau(tab);
    assert.equal(prix?.total, 1727.44);
    assert.match(prix?.label ?? "", /Court séjour/);
  });

  it("rend le libellé publié et la devise qu'il porte", () => {
    const prix = prixDuTableau(`<table>${ligne("Semaine du 06/02 au 13/02", "727.44")}</table>`);
    assert.equal(prix?.total, 727.44);
    assert.equal(prix?.label, "Semaine du 06/02 au 13/02 727,44 €");
    assert.equal(prix?.currency, "EUR");
  });

  it("ne prend pas une ligne de ménage ou de caution pour un total de séjour", () => {
    const tab = `<table>${ligne("Forfait ménage", "90.00")}${ligne("Caution", "400.00")}${ligne("Semaine", "1551.44")}</table>`;
    assert.equal(prixDuTableau(tab)?.total, 1551.44);
  });

  it("rend null quand rien n'est reconnu, plutôt qu'un zéro", () => {
    assert.equal(prixDuTableau("<table><tr><td>Nous consulter</td></tr></table>"), null);
    assert.equal(prixDuTableau(""), null);
  });

  it("lit un montant même sans ligne de tableau autour", () => {
    assert.equal(
      prixDuTableau('<div data-prix="812.00" class="sp_montantPrixTotal">812,00 €</div>')?.total,
      812,
    );
  });
});

describe("fiche ITEA", () => {
  it("lit capacité et chambres publiées", () => {
    const occ = occupancyFromGitesHtml('{"numberOfGuests":"9","numberOfBedrooms":3}');
    assert.equal(occ.guests, 9);
    assert.equal(occ.bedrooms, 3);
  });

  it("rend null, et non zéro, quand la fiche ne les publie pas", () => {
    const occ = occupancyFromGitesHtml("<html><body>rien</body></html>");
    assert.equal(occ.guests, null);
    assert.equal(occ.bedrooms, null);
  });

  it("lit la devise publiée, null sinon", () => {
    assert.equal(deviseFromGitesHtml('"priceCurrency":"EUR"'), "EUR");
    assert.equal(deviseFromGitesHtml("<html></html>"), null);
  });

  it("lit le lieu du JSON-LD", () => {
    const lieu = lieuFromGitesHtml(
      '{"geo":{"latitude":"45.0106","longitude":"6.1226"},"addressLocality":"Les Deux Alpes"}',
    );
    assert.equal(lieu.lat, 45.0106);
    assert.equal(lieu.lon, 6.1226);
    assert.equal(lieu.locality, "Les Deux Alpes");
  });

  it("garde la commune quand les coordonnées manquent", () => {
    const lieu = lieuFromGitesHtml('{"addressLocality":"Venosc"}');
    assert.equal(lieu.lat, null);
    assert.equal(lieu.lon, null);
    assert.equal(lieu.locality, "Venosc");
  });

  it("rend tout à null quand la fiche ne publie ni lieu ni commune", () => {
    assert.deepEqual(lieuFromGitesHtml("<html></html>"), {
      lat: null,
      lon: null,
      locality: null,
    });
  });

  it("retient un lieu lu, et le rend sans relire la fiche", () => {
    viderCacheGitesGps();
    retenirLieuGites("38G40102", { lat: 45.0106, lon: 6.1226, locality: "Venosc" });
    assert.deepEqual(lieuGitesEnCache("38G40102"), {
      lat: 45.0106,
      lon: 6.1226,
      locality: "Venosc",
    });
    assert.deepEqual(lieuGitesEnCache("38g40102"), {
      lat: 45.0106,
      lon: 6.1226,
      locality: "Venosc",
    });
    viderCacheGitesGps();
    assert.equal(lieuGitesEnCache("38G40102"), null);
  });
});

describe("annonce Gîtes de France", () => {
  it("sort avec une capacité plus petite que la demande, au lieu de disparaître", () => {
    const l = listingDeFiche(
      tuile({ capacite: "4 personnes" }),
      fiche({ total: 512, currency: "EUR" }),
      "38G40102",
      INPUT,
    );
    assert.equal(l.guests, 4);
    assert.equal(l.total, 512);
  });

  it("sort aussi quand aucune capacité n'est publiée, sans nombre inventé", () => {
    const l = listingDeFiche(tuile(), fiche({ total: 512 }), "38G40102", INPUT);
    assert.equal(l.guests, null);
    assert.equal(l.bedrooms, null);
  });

  it("rend une annonce sans prix avec un total à zéro, et le dit", () => {
    const l = listingDeFiche(tuile(), fiche(), "38G40102", INPUT);
    assert.equal(l.total, 0);
    assert.equal(l.priceLabel, null);
    assert.match(l.proven, /aucun prix publié/);
  });

  it("pose le lieu lu sur la fiche, commune comprise", () => {
    const l = listingDeFiche(
      tuile(),
      fiche({ total: 727.44, lieu: { lat: 45.0106, lon: 6.1226, locality: "Les Deux Alpes" } }),
      "38G40102",
      INPUT,
    );
    assert.equal(l.lat, 45.0106);
    assert.equal(l.lon, 6.1226);
    assert.equal(l.locality, "Les Deux Alpes");
    assert.match(l.proven, /GPS ITEA/);
  });

  it("pose la commune même sans coordonnées", () => {
    const l = listingDeFiche(
      tuile(),
      fiche({ lieu: { lat: null, lon: null, locality: "Venosc" } }),
      "38G40102",
      INPUT,
    );
    assert.equal(l.locality, "Venosc");
    assert.doesNotMatch(l.proven, /GPS ITEA/);
  });

  it("porte le type publié, le libellé de prix, la devise et l'identifiant ITEA", () => {
    const l = listingDeFiche(
      tuile({ typeLabel: "Gîte" }),
      fiche({
        total: 1551.44,
        currency: "EUR",
        priceLabel: "Semaine du 06/02 au 13/02 1 551,44 €",
        platformId: "38G550149.G",
      }),
      "38G550149",
      INPUT,
    );
    assert.equal(l.propertyType, "Gîte");
    assert.equal(l.priceLabel, "Semaine du 06/02 au 13/02 1 551,44 €");
    assert.equal(l.currency, "EUR");
    assert.equal(l.platformId, "38G550149.G");
  });

  it("rend les pièces comme des pièces, jamais comme des chambres", () => {
    const l = listingDeFiche(
      tuile({ title: "Le Petit Gîte, 3 pièces" }),
      fiche({ total: 900 }),
      "38G40102",
      INPUT,
    );
    assert.equal(l.rooms, 3);
    assert.equal(l.bedrooms, null);
  });
});

describe("recherche localisée", () => {
  it("cherche par code de commune, jamais par un texte que le moteur ignore", () => {
    const url = searchUrl(INPUT, "50301");
    assert.match(url, /towns=50301/);
    assert.doesNotMatch(url, /destination=/);
  });

  it("sans code de commune, refuse avant toute requête", async () => {
    const page = new Proxy({}, { get: () => () => assert.fail("aucune requête ne doit partir") });
    await assert.rejects(
      scrapeGites(page as never, { ...INPUT, stationId: "tignes", stationName: "Tignes" }),
      /pas d'identifiant de commune Gîtes de France pour Tignes/,
    );
  });

  it("Val Thorens et les Menuires partagent la commune des Belleville", () => {
    assert.equal(communeGites("val-thorens")?.towns, "64611");
    assert.equal(communeGites("les-menuires")?.towns, "64611");
    assert.equal(communeGites("les-2-alpes")?.towns, "50301");
    assert.equal(communeGites("tignes"), null);
    for (const [id, c] of Object.entries(COMMUNES_GITES)) {
      assert.match(c.towns, /^\d+$/, id);
      assert.ok(c.preuve.length > 10, `${id} : un code sans preuve n'entre pas dans la table`);
    }
  });
});

describe("blocage du site", () => {
  it("reconnaît un refus Cloudflare, par statut, en-tête ou titre", () => {
    assert.equal(blocage({ status: 403, cfMitigated: null, titre: "Attention Required! | Cloudflare" }), "bloqué (403)");
    assert.equal(blocage({ status: 403, cfMitigated: "challenge", titre: "Just a moment..." }), "bloqué (défi challenge)");
    assert.equal(blocage({ status: 200, cfMitigated: null, titre: "Just a moment..." }), "bloqué (page de défi)");
  });

  it("appelle une panne serveur par son nom, pas « bloqué »", () => {
    assert.equal(blocage({ status: 503, cfMitigated: null, titre: "Service Unavailable" }), "HTTP 503");
  });

  it("laisse passer une page ordinaire", () => {
    assert.equal(blocage({ status: 200, cfMitigated: null, titre: "Location gîtes Les Deux Alpes" }), null);
    assert.equal(blocage({ status: null, cfMitigated: null, titre: null }), null);
  });
});

describe("total publié", () => {
  it("préfère le titre de tri, puis la facette", () => {
    assert.equal(totalPublie({ titreTri: "94 Résultats", facette: "93", resultats: 90 }), 94);
    assert.equal(totalPublie({ titreTri: null, facette: "94", resultats: 90 }), 94);
    assert.equal(totalPublie({ titreTri: "43 786 Résultats", facette: null, resultats: 5000 }), 43786);
  });

  it("ne prend pas la liste plafonnée à 5 000 pour un total", () => {
    assert.equal(totalPublie({ titreTri: null, facette: null, resultats: 5000 }), null);
    assert.equal(totalPublie({ titreTri: null, facette: null, resultats: 94 }), 94);
    assert.equal(totalPublie({ titreTri: "Trier par", facette: null, resultats: null }), null);
  });
});

describe("budget de fiches", () => {
  it("interroge d'abord les gîtes les plus proches de la station, les inconnus à la fin", () => {
    const pin = { lat: 45.0134, lon: 6.1252 };
    const loin = tuile({ title: "Auris", lat: 45.05, lon: 6.08 });
    const pres = tuile({ title: "Mont-de-Lans", lat: 45.018, lon: 6.127 });
    const inconnu1 = tuile({ title: "Inconnu 1" });
    const inconnu2 = tuile({ title: "Inconnu 2" });
    assert.deepEqual(
      trierParDistance([inconnu1, loin, inconnu2, pres], pin).map((t) => t.title),
      ["Mont-de-Lans", "Auris", "Inconnu 1", "Inconnu 2"],
    );
  });
});
