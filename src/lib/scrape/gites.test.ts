import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  blocage,
  deviseFromGitesHtml,
  avisFromGitesHtml,
  descriptionFromGitesHtml,
  listingDeFiche,
  listingDeTuile,
  ficheAvecDevis,
  couvrirTuiles,
  lireFichesEnRetard,
  nombreDeResultats,
  occupancyFromGitesHtml,
  pageSuivante,
  prixDuTableau,
  scrapeGites,
  searchUrl,
  situerAnnoncesGites,
  totalPublie,
  trierParDistance,
  type Fiche,
  type Tile,
} from "./gites.server.ts";
import { COMMUNES_GITES, communeGites } from "./gitesCommunes.ts";
import { lieuFromGitesHtml, lieuGitesEnCache, retenirLieuGites, viderCacheGitesGps } from "./gitesGps.server.ts";
import type { LiveSearchInput } from "./types.ts";
import { equipementsDe, noteSur5De } from "../stay/ficheEnrichie.ts";

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
    occupancy: { capacity: null, bedrooms: null, rooms: null },
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
    assert.equal(occ.capacity, 9);
    assert.equal(occ.bedrooms, 3);
  });

  it("rend null, et non zéro, quand la fiche ne les publie pas", () => {
    const occ = occupancyFromGitesHtml("<html><body>rien</body></html>");
    assert.equal(occ.capacity, null);
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
    assert.equal(l.capacity, 4);
    assert.equal(l.total, 512);
  });

  it("sort aussi quand aucune capacité n'est publiée, sans nombre inventé", () => {
    const l = listingDeFiche(tuile(), fiche({ total: 512 }), "38G40102", INPUT);
    assert.equal(l.capacity, null);
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
    assert.equal(l.lat, null);
  });

  it("sans GPS de fiche, garde le point publié par la carte de recherche", () => {
    const l = listingDeFiche(
      tuile({ lat: 45.02, lon: 6.14 }),
      fiche({ lieu: { lat: null, lon: null, locality: "Venosc" } }),
      "38G40102",
      INPUT,
    );
    assert.equal(l.lat, 45.02);
    assert.equal(l.lon, 6.14);
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

  it("rend les pièces comme des pièces ; les chambres s'en dérivent, et le disent", () => {
    const l = listingDeFiche(
      tuile({ title: "Le Petit Gîte, 3 pièces" }),
      fiche({ total: 900 }),
      "38G40102",
      INPUT,
    );
    assert.equal(l.rooms, 3);
    assert.equal(l.bedrooms, 2);
    assert.equal(l.bedroomsSource, "derived_from_type");
  });

  it("un devis garde l'avis et la description déjà lus sur la fiche", () => {
    const base = fiche({
      description: "Grand gîte aménagé",
      avis: { noteSource: "5", echelleSource: null, nombre: "2", extraits: [] },
      occupancy: { capacity: 8, bedrooms: 3, rooms: null },
      lieu: { lat: 45.01, lon: 6.12, locality: "Venosc" },
      platformId: "38G40102.G",
    });
    const apres = ficheAvecDevis(base, { total: 727.44, currency: "EUR", label: "Semaine 727,44 €" });
    assert.equal(apres.total, 727.44);
    assert.equal(apres.currency, "EUR");
    assert.equal(apres.priceLabel, "Semaine 727,44 €");
    assert.equal(apres.description, "Grand gîte aménagé");
    assert.deepEqual(apres.avis, base.avis);
    assert.equal(apres.platformId, "38G40102.G");
    assert.equal(apres.occupancy.capacity, 8);
    assert.equal(apres.lieu.locality, "Venosc");
    const l = listingDeFiche(tuile(), apres, "38G40102", INPUT);
    assert.equal(l.total, 727.44);
    assert.equal(l.fiche?.avis?.nombre, 2);
    assert.equal(l.description, "Grand gîte aménagé");
  });

  it("une tuile dont la fiche ITEA n'est pas lue sort quand même, sans rien inventer", () => {
    const l = listingDeTuile(
      tuile({
        capacite: "6 personnes",
        lat: 45.01,
        lon: 6.12,
        photo: "https://www.gites-de-france.com/x.jpg",
        typeLabel: "Gîte",
      }),
      "38G40102",
      INPUT,
    );
    assert.equal(l.id, "38G40102");
    assert.equal(l.source, "Gîtes de France");
    assert.equal(l.total, 0);
    assert.equal(l.currency, "EUR");
    assert.equal(l.capacity, 6);
    assert.equal(l.propertyType, "Gîte");
    assert.equal(l.photo, "https://www.gites-de-france.com/x.jpg");
    assert.equal(l.lat, 45.01);
    assert.equal(l.lon, 6.12);
    assert.equal(l.description, undefined);
    assert.equal(l.amenities, undefined);
    assert.equal(l.fiche, undefined);
    assert.equal(l.rating, undefined);
    assert.equal(l.reviewCount, undefined);
    assert.equal(l.priceLabel, undefined);
    assert.match(l.proven, /fiche ITEA non lue/);
    assert.match(l.proven, /position publiée par la recherche/);
    assert.match(l.url ?? "", /adults=8/);
    assert.match(l.url ?? "", /date-start=2027-02-06/);
  });

  it("sans ligne « N personnes », la tuile n'invente pas de capacité", () => {
    const l = listingDeTuile(tuile({ title: "Le Petit Gîte", capacite: "" }), "38G40102", INPUT);
    assert.equal(l.capacity, null);
    assert.equal(l.bedrooms, null);
    assert.doesNotMatch(l.proven, /position publiée/);
  });
});

describe("suite ITEA : la fiche des dates, après la tuile", () => {
  it("une fiche déjà lue remplace la tuile du même gîte, et rien d'autre", () => {
    const tuileL = listingDeTuile(tuile({ capacite: "6 personnes" }), "38G40102", INPUT);
    const autre = listingDeTuile(
      tuile({ title: "L'autre", url: "https://www.gites-de-france.com/fr/x-73g10001" }),
      "73G10001",
      INPUT,
    );
    const ficheL = listingDeFiche(
      tuile({ capacite: "6 personnes" }),
      fiche({ description: "Au calme", total: 900, currency: "EUR" }),
      "38G40102",
      INPUT,
    );
    const couvert = couvrirTuiles([tuileL, autre], [ficheL]);
    assert.equal(couvert.length, 2);
    assert.equal(couvert[0]?.description, "Au calme");
    assert.equal(couvert[0]?.total, 900);
    assert.equal(couvert[1]?.id, "73G10001");
    assert.match(couvert[1]?.proven ?? "", /fiche ITEA non lue/);
  });

  it("un refus ITEA arrête la suite, sans relancer la fiche suivante", async () => {
    const appels: string[] = [];
    const bilan = await lireFichesEnRetard(
      [
        { tile: tuile(), code: "38G40102" },
        { tile: tuile({ url: "https://www.gites-de-france.com/fr/x-73g10001" }), code: "73G10001" },
      ],
      INPUT,
      1_000_000,
      {
        maintenant: () => 0,
        attendre: async () => undefined,
        relever: async (code) => {
          appels.push(code);
          throw new Error("ITEA HTTP 429");
        },
      },
    );
    assert.deepEqual(appels, ["38G40102"]);
    assert.equal(bilan.arret, "refus");
    assert.equal(bilan.listings.length, 0);
  });

  it("trois échecs d'affilée arrêtent ; un hors-périmètre n'en est pas un", async () => {
    const appels: string[] = [];
    const reste = ["38G40102", "73G10001", "74G10002", "05G10003", "06G10004"].map((code) => ({
      tile: tuile({ url: `https://www.gites-de-france.com/fr/x-${code.toLowerCase()}` }),
      code,
    }));
    const bilan = await lireFichesEnRetard(reste, INPUT, 1_000_000, {
      maintenant: () => 0,
      attendre: async () => undefined,
      relever: async (code) => {
        appels.push(code);
        if (code === "38G40102") return null;
        throw new Error("délai");
      },
    });
    assert.deepEqual(appels, ["38G40102", "73G10001", "74G10002", "05G10003"]);
    assert.equal(bilan.arret, "refus");
    assert.equal(bilan.listings.length, 0);
  });

  it("pose la description de la fiche, et le total seulement s'il est publié pour ces dates", async () => {
    const notes: string[] = [];
    const bilan = await lireFichesEnRetard(
      [{ tile: tuile({ capacite: "8 personnes" }), code: "38G40102" }],
      INPUT,
      1_000_000,
      {
        maintenant: () => 0,
        attendre: async () => undefined,
        noter: (l) => notes.push(l.id),
        relever: async () =>
          fiche({
            description: "Grand gîte aménagé",
            total: 0,
            avis: { noteSource: null, echelleSource: null, nombre: "3", extraits: [] },
          }),
      },
    );
    assert.deepEqual(notes, ["38G40102"]);
    assert.equal(bilan.arret, "fin");
    assert.equal(bilan.listings[0]?.description, "Grand gîte aménagé");
    assert.equal(bilan.listings[0]?.fiche?.avis?.nombre, 3);
    assert.equal(bilan.listings[0]?.total, 0);
    assert.match(bilan.listings[0]?.proven ?? "", /aucun prix publié à ces dates/);
  });

  it("passée l'échéance, aucune fiche n'est demandée", async () => {
    let appels = 0;
    const bilan = await lireFichesEnRetard([{ tile: tuile(), code: "38G40102" }], INPUT, 10, {
      maintenant: () => 10,
      attendre: async () => undefined,
      relever: async () => {
        appels += 1;
        return null;
      },
    });
    assert.equal(appels, 0);
    assert.equal(bilan.arret, "échéance");
  });
});

describe("Gîtes : tout logement a une position", () => {
  const ctx = {
    reperes: [{ nom: "Vénosc", lat: 45.001, lon: 6.111 }],
    station: { nom: "Les 2 Alpes", lat: INPUT.lat, lon: INPUT.lon },
  };

  it("le GPS de la fiche ne bouge pas, et n'est pas dit triangulé", () => {
    const l = listingDeFiche(
      tuile({ lat: 44, lon: 5 }),
      fiche({ lieu: { lat: 45.0106, lon: 6.1226, locality: "Les Deux Alpes" } }),
      "38G40102",
      INPUT,
    );
    const [sit] = situerAnnoncesGites([l], ctx);
    assert.equal(sit?.lat, 45.0106);
    assert.equal(sit?.lon, 6.1226);
    assert.equal(sit?.gpsSource, undefined);
    assert.match(sit?.proven ?? "", /GPS ITEA/);
    assert.doesNotMatch(sit?.proven ?? "", /triangul/);
  });

  it("la carte de recherche, sans GPS de fiche, est une position triangulée", () => {
    const l = listingDeTuile(tuile({ lat: 45.02, lon: 6.14, capacite: "6 personnes" }), "38G40102", INPUT);
    const [sit] = situerAnnoncesGites([l], ctx);
    assert.equal(sit?.lat, 45.02);
    assert.equal(sit?.lon, 6.14);
    assert.equal(sit?.gpsSource, "triangule");
    assert.match(sit?.proven ?? "", /carte de recherche/);
  });

  it("sans aucun point, le barycentre des GPS publiés du même lieu", () => {
    const a = listingDeFiche(
      tuile(),
      fiche({ lieu: { lat: 45.02, lon: 6.1, locality: "Venosc" } }),
      "38G40101",
      INPUT,
    );
    const b = listingDeFiche(
      tuile({ url: "https://www.gites-de-france.com/fr/x-38g40103" }),
      fiche({ lieu: { lat: 45.04, lon: 6.2, locality: "Vénosc" } }),
      "38G40103",
      INPUT,
    );
    const muet = {
      ...listingDeTuile(tuile({ url: "https://www.gites-de-france.com/fr/x-38g40102", title: "Sans point" }), "38G40102", INPUT),
      locality: "Venosc",
    };
    const sits = situerAnnoncesGites([a, b, muet], ctx);
    const cible = sits.find((x) => x.id === "38G40102");
    assert.equal(cible?.lat, 45.03);
    assert.equal(cible?.lon, 6.15);
    assert.equal(cible?.gpsSource, "triangule");
    assert.match(cible?.proven ?? "", /barycentre de 2 gîtes/);
    assert.equal(sits.find((x) => x.id === "38G40101")?.gpsSource, undefined);
  });

  it("un seul GPS voisin ne suffit pas : le repère du lieu, sinon la station", () => {
    const seul = listingDeFiche(
      tuile(),
      fiche({ lieu: { lat: 45.02, lon: 6.1, locality: "Venosc" } }),
      "38G40101",
      INPUT,
    );
    const muet = {
      ...listingDeTuile(tuile({ url: "https://www.gites-de-france.com/fr/x-38g40102" }), "38G40102", INPUT),
      locality: "Vénosc",
    };
    const sits = situerAnnoncesGites([seul, muet], ctx);
    const sit = sits.find((x) => x.id === "38G40102");
    assert.equal(sit?.lat, 45.001);
    assert.equal(sit?.lon, 6.111);
    assert.match(sit?.proven ?? "", /repère « Vénosc »/);
    const nu = listingDeTuile(tuile({ url: "https://www.gites-de-france.com/fr/x-38g40104", title: "Nu" }), "38G40104", INPUT);
    const [station] = situerAnnoncesGites([nu], ctx);
    assert.equal(station?.lat, INPUT.lat);
    assert.equal(station?.lon, INPUT.lon);
    assert.equal(station?.gpsSource, "triangule");
    assert.match(station?.proven ?? "", /station Les 2 Alpes/);
    assert.match(station?.proven ?? "", /aucun point publié/);
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

describe("Gîtes de France : la fiche enrichie, depuis le JSON-LD déjà lu", () => {
  const html = readFileSync(new URL("./fixtures/itea-fiche-38G253122.html", import.meta.url), "utf8");

  it("la note sans bestRating n'a pas d'échelle : pas de note sur 5, le nombre d'avis reste", () => {
    const avis = avisFromGitesHtml(html)!;
    assert.deepEqual(avis, { noteSource: "5", echelleSource: null, nombre: "2", extraits: [] });
    const description = descriptionFromGitesHtml(html);
    const fiche = { total: 0, currency: "EUR", priceLabel: null, occupancy: { capacity: 14, bedrooms: 5, rooms: null }, lieu: { lat: null, lon: null, locality: null }, platformId: null, description, avis };
    const tile = { title: "Chalet les Copains", url: "https://www.gites-de-france.com/fr/x", photo: null, capacite: "14 personnes", typeLabel: "Gîte" };
    const l = listingDeFiche(tile as never, fiche as never, "38G253122", { stationId: "les-2-alpes", stationName: "Les 2 Alpes", lat: 45, lon: 6, checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 8, bedrooms: 0 });
    assert.equal(l.fiche!.sourceFiche, "gites");
    assert.equal(l.fiche!.description, description);
    assert.deepEqual([l.fiche!.avis!.noteSur5, l.fiche!.avis!.nombre, l.fiche!.avis!.noteSource], [null, 2, 5]);
    assert.deepEqual(l.fiche!.equipements, [], "pas d'équipement tiré de la description");
    assert.equal(equipementsDe(l), null);
    assert.equal(noteSur5De(l), null);
  });
});

describe("Gîtes de France : la description de la fiche ITEA et les équipements qu'elle nomme", () => {
  // Fiche ITEA réelle du 6 octobre 2026 : Chalet les Copains, Les Deux Alpes.
  const html = readFileSync(new URL("./fixtures/itea-fiche-38G253122.html", import.meta.url), "utf8");

  it("la description du JSON-LD, entités décodées", () => {
    const d = descriptionFromGitesHtml(html) ?? "";
    assert.match(d, /^Sandrine et Jullien vous ouvrent les portes du Chalet les Copains : grand Gîte aménagé pour 14 personnes/);
    assert.ok(!/&[a-z]+;/.test(d), d);
  });

  it("passe à l'annonce, avec les équipements nommés : sauna, terrasse, cheminée, lave-vaisselle, local skis", () => {
    const description = descriptionFromGitesHtml(html);
    const fiche = { total: 0, currency: "EUR", priceLabel: null, occupancy: { capacity: 14, bedrooms: 5, rooms: null }, lieu: { lat: null, lon: null, locality: null }, platformId: null, description };
    const tile = { title: "Chalet les Copains", url: "https://www.gites-de-france.com/fr/x", photo: null, capacite: "14 personnes", typeLabel: "Gîte" };
    const l = listingDeFiche(tile as never, fiche as never, "38G253122", { stationId: "les-2-alpes", stationName: "Les 2 Alpes", lat: 45, lon: 6, checkIn: "2027-02-06", checkOut: "2027-02-13", guests: 8, bedrooms: 0 });
    assert.equal(l.description, description);
    const oui = (l.amenities ?? []).filter((e) => e.valeur === "oui").map((e) => e.cle);
    for (const c of ["saunaSpa", "balcon", "cheminee", "laveVaisselle", "casierSkis"]) assert.ok(oui.includes(c as never), c);
    assert.equal(l.amenities?.some((e) => e.valeur === "non"), false);
  });
});
