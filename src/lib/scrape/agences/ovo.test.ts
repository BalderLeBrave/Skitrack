import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { agencesDe, lieuxDe } from "./couverture.ts";
import { entetesRecherche, lienBien, lireRecherche, ovoListings, typeDuChemin, uniques, urlRecherche } from "./ovo.ts";
import type { LiveSearchInput } from "../types.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const lire = (f: string): unknown => JSON.parse(readFileSync(join(dir, "fixtures", f), "utf8"));

/**
 * Réponses réelles du 26 septembre 2026, réduites aux champs que le module
 * lit (deux photos par bien, sans nom de propriétaire) : La Clusaz à 2 adultes
 * (les 14 biens), à 6 (trois d'entre eux), les destinations voisines du
 * dimanche 7 au jeudi 11 (cinq biens) et tout le catalogue (trois biens).
 */
const CLUSAZ_2 = lire("ovo-recherche-la-clusaz-2p.json");
const CLUSAZ_6 = lire("ovo-recherche-la-clusaz-6p.json");
const VOISINES_DIM_JEU = lire("ovo-recherche-voisines-dim-jeu-2p.json");
const TOUT_2 = lire("ovo-recherche-tout-2p.json");

const CLUSAZ: LiveSearchInput = {
  stationId: "la-clusaz",
  stationName: "La Clusaz",
  lat: 45.904,
  lon: 6.423,
  checkIn: "2027-02-06",
  checkOut: "2027-02-13",
  guests: 2,
  bedrooms: 0,
};
const SIX = { ...CLUSAZ, guests: 6 };
const DIM_JEU = { ...CLUSAZ, checkIn: "2027-02-07", checkOut: "2027-02-11" };

describe("Ovo Network : requêtes", () => {
  it("la recherche porte dates, voyageurs, destination, une seule page, sans destinations voisines", () => {
    const u = new URL(urlRecherche(CLUSAZ, "1"));
    assert.equal(u.origin + u.pathname, "https://www.ovonetwork.com/ajax");
    const p = u.searchParams;
    assert.equal(p.get("action"), "web/portal/search");
    assert.equal(p.get("page"), "0");
    assert.equal(p.get("pageSize"), "500");
    assert.equal(p.get("df"), "2027-02-06");
    assert.equal(p.get("dt"), "2027-02-13");
    assert.equal(p.get("noocc"), "2");
    assert.equal(p.get("adults"), "2");
    assert.equal(p.get("destination"), "1");
    assert.equal(p.get("dest_linked"), "0");
    assert.equal(p.get("prop_type"), "0", "les filtres neutres partent comme le site les envoie");
  });

  it("reprend l'ordre des paramètres du site, sans rien qui nomme l'application", () => {
    const q = urlRecherche(CLUSAZ, "1").split("?")[1];
    assert.ok(q.startsWith("action=web/portal/search&page=0&pageSize=500&df=2027-02-06&dt=2027-02-13&noocc=2&accueilvelo=0"));
    assert.ok(q.endsWith("&sort=0&lang=fr&adults=2&children=0&babies=0&hold_uids="));
    assert.doesNotMatch(q, /skitrack/i);
  });

  it("refuse des dates ou une destination illisibles", () => {
    assert.throws(() => urlRecherche({ ...CLUSAZ, checkIn: "2027-02-06&x=1" }, "1"));
    assert.throws(() => urlRecherche({ ...CLUSAZ, checkOut: "2027-02-06" }, "1"), "départ = arrivée");
    assert.throws(() => urlRecherche(CLUSAZ, "1&destination=0"));
  });

  it("le Referer est la page de recherche du site", () => {
    assert.equal(
      entetesRecherche(SIX, "1").referer,
      "https://www.ovonetwork.com/fr/rechercher?destination=1&dest_linked=0&df=2027-02-06&dt=2027-02-13&noocc=6&adults=6&children=0&babies=0",
    );
  });
});

describe("Ovo Network : lecture de la recherche", () => {
  it("La Clusaz, 2 adultes : 14 biens, 12 réservables aux dates demandées", () => {
    const r = lireRecherche(CLUSAZ_2, CLUSAZ);
    assert.equal(r.total, 14);
    assert.equal(r.recus, 14);
    assert.equal(r.complet, true);
    assert.equal(r.combines, 0);
    assert.equal(r.biens.length, 14);
    assert.equal(r.biens.filter((b) => b.reservable).length, 12);
    assert.ok(r.biens.every((b) => b.lat != null && b.lon != null && b.photos.length > 0 && b.capacite != null));
  });

  it("un bien aux dates demandées : total, capacité, chambres, type, GPS", () => {
    const b = lireRecherche(CLUSAZ_2, CLUSAZ).biens.find((x) => x.id === "1719");
    assert.ok(b);
    assert.deepEqual(
      [b.nom, b.type, b.capacite, b.chambres, b.sdb, b.total, b.prixAffiche, b.taxe, b.lat, b.lon, b.autresDates],
      ["Dorealp", "Appartement", 6, 3, 2, 4376.4, "4 376 €", "incluse", 45.90702, 6.44175, null],
    );
    assert.equal(b.chemin, "/fr/appartements/france/la-clusaz/dorealp");
    assert.ok(b.photos[0].startsWith("https://ovo-img.imgix.net/image_library/1719-Dorealp/wm/"));
  });

  it("dates déplacées par le site : le total est celui des dates demandées (orig_dates), la proposition reste à part", () => {
    const b = lireRecherche(CLUSAZ_2, CLUSAZ).biens.find((x) => x.id === "1646");
    assert.ok(b);
    assert.equal(b.nom, "Chalet Hollygotty");
    assert.equal(b.reservable, true);
    assert.equal(b.total, 8405.4);
    assert.deepEqual(b.autresDates, { du: "2027-02-07", au: "2027-02-14", total: 4890.4 });
  });

  it("un bien que le site ne propose qu'à d'autres dates n'est pas une offre", () => {
    const b = lireRecherche(CLUSAZ_2, CLUSAZ).biens.find((x) => x.id === "748");
    assert.ok(b);
    assert.equal(b.reservable, false);
    assert.equal(b.total, 12216.4, "le site chiffre les dates demandées même quand elles ne sont pas libres");
    assert.equal(b.autresDates?.du, "2027-02-07");
    assert.equal(ovoListings([b], CLUSAZ).length, 0);
  });

  it("6 adultes : la taxe de séjour en plus", () => {
    const h = lireRecherche(CLUSAZ_6, SIX).biens.find((b) => b.id === "1646");
    assert.equal(h?.total, 8506.2, "8 405,40 € + 4 adultes × 7 nuits × 3,60 €");
  });

  it("dimanche → jeudi : les biens qui n'ouvrent qu'au samedi ne sont pas réservables", () => {
    const r = lireRecherche(VOISINES_DIM_JEU, DIM_JEU);
    assert.deepEqual(r.biens.filter((b) => b.reservable).map((b) => b.id), ["2143"]);
    const refuses = r.biens.filter((b) => !b.reservable);
    assert.deepEqual(refuses.map((b) => b.id).sort(), ["1694", "871", "993", "994"]);
    assert.ok(refuses.every((b) => b.autresDates?.du === "2027-02-06"));
    // 4 nuits au prix de la semaine : seule la taxe de séjour diffère.
    assert.equal(r.biens.find((b) => b.id === "2143")?.total, 4079.2);
  });

  it("tout le catalogue : tarif sur demande, taxe à l'arrivée, commune sans taxe", () => {
    const { biens } = lireRecherche(TOUT_2, CLUSAZ);
    const villa = biens.find((b) => b.id === "2912");
    assert.equal(villa?.surDemande, true);
    assert.equal(villa?.total, null);
    assert.equal(biens.find((b) => b.id === "2240")?.taxe, "a-l-arrivee");
    assert.equal(biens.find((b) => b.id === "871")?.taxe, "aucune");
  });

  it("le type se lit dans la rubrique du lien", () => {
    assert.equal(typeDuChemin("/fr/chalets/france/la-clusaz/chalet-hollygotty"), "Chalet");
    assert.equal(typeDuChemin("/fr/villas/france/thones/chalet-65bis"), "Villa");
    assert.equal(typeDuChemin("/fr/appartements/france/la-clusaz/dorealp"), "Appartement");
    assert.equal(typeDuChemin("/fr/autre/france/x/y"), null);
  });

  it("deux destinations pour une station : chaque bien une fois", () => {
    const a = lireRecherche(CLUSAZ_2, CLUSAZ).biens;
    assert.equal(uniques([a, a.slice(0, 3)]).length, a.length);
  });

  it("une réponse illisible ne rend rien", () => {
    assert.deepEqual(lireRecherche(null, CLUSAZ), { biens: [], total: null, recus: 0, combines: 0, complet: true });
    assert.equal(lireRecherche({ listings: [{ id: "x" }, { name: "sans id" }] }, CLUSAZ).biens.length, 0);
  });
});

describe("Ovo Network : annonces", () => {
  it("12 annonces pour La Clusaz, source, lien daté, hébergement seul", () => {
    const listings = ovoListings(lireRecherche(CLUSAZ_2, CLUSAZ).biens, CLUSAZ);
    assert.equal(listings.length, 12);
    const l = listings.find((x) => x.platformId === "1646");
    assert.ok(l);
    assert.equal(l.id, "ovo-1646");
    assert.equal(l.source, "Ovo Network");
    assert.equal(l.stationId, "la-clusaz");
    assert.equal(l.total, 8405.4);
    assert.equal(l.currency, "EUR");
    assert.equal(l.guests, 8);
    assert.equal(l.bedrooms, 4);
    assert.equal(l.baths, 3);
    assert.equal(l.propertyType, "Chalet");
    assert.equal(l.priceLabel, "8 405 € · Taxes et frais inclus");
    assert.equal(l.priceIndicative, false);
    assert.equal(l.url, "https://www.ovonetwork.com/fr/chalets/france/la-clusaz/chalet-hollygotty?df=2027-02-06&dt=2027-02-13&adults=2&children=0&babies=0");
    assert.equal(l.lat, 45.8897);
    assert.equal(l.rating, 4.6);
    assert.equal(l.reviewCount, 39);
    assert.equal(l.proven, "Ovo Network live 2027-02-06→2027-02-13");
    assert.ok(listings.every((x) => x.skiPassIncluded === false));
  });

  it("le lien d'un bien déplacé porte les dates demandées, pas celles du site", () => {
    assert.equal(
      lienBien("/fr/chalets/france/la-clusaz/chalet-alpachic", SIX),
      "https://www.ovonetwork.com/fr/chalets/france/la-clusaz/chalet-alpachic?df=2027-02-06&dt=2027-02-13&adults=6&children=0&babies=0",
    );
  });

  it("tarif sur demande : l'annonce reste, prix non publié ; le chalet suisse est écarté", () => {
    const listings = ovoListings(lireRecherche(TOUT_2, CLUSAZ).biens, CLUSAZ);
    const villa = listings.find((l) => l.platformId === "2912");
    assert.equal(villa?.total, 0);
    assert.equal(villa?.priceIndicative, null);
    assert.equal(villa?.priceLabel, "Pas de tarif, merci de nous contacter");
    assert.equal(listings.find((l) => l.platformId === "2240"), undefined);
    assert.equal(listings.find((l) => l.platformId === "871")?.priceLabel, "6 765 € · Pas de taxe de séjour");
  });
});

describe("Ovo Network : couverture", () => {
  it("La Clusaz prend deux destinations, une station non couverte aucune", () => {
    assert.deepEqual(lieuxDe("Ovo Network", "la-clusaz"), ["1", "15"]);
    assert.deepEqual(lieuxDe("Ovo Network", "avoriaz"), []);
    assert.ok(agencesDe("la-clusaz").includes("Ovo Network"));
    assert.ok(!agencesDe("avoriaz").includes("Ovo Network"));
  });
});
