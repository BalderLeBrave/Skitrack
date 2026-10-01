import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { agencesDe, lieuxDe } from "./couverture.ts";
import {
  aDetailler,
  dateFr,
  datesConformes,
  entetesFiche,
  etablissementGarde,
  libellePrix,
  lireFiche,
  lireRecherche,
  madameVacancesListings,
  rechercheComprise,
  typePublie,
  urlFiche,
  urlRecherche,
  voyageurs,
} from "./madameVacances.ts";
import type { LiveSearchInput } from "../types.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const fx = (f: string) => readFileSync(join(dir, "fixtures", f), "utf8");

/**
 * Réponses réelles du 26 septembre 2026, réduites à ce que le module lit
 * (balisage du site gardé) : la recherche des Deux Alpes (l'Alba, Au Cœur des
 * Ours, et l'Hôtel Ibiza à écarter), l'appel AJAX d'Au Cœur des Ours (un type
 * libre, un complet), et celui de l'Alba du dimanche 7 au jeudi 11 (aucun type).
 */
const RECHERCHE = lireRecherche(fx("mv-recherche-les-deux-alpes-2p.html"));
const OURS = lireFiche(fx("mv-fiche-au-coeur-des-ours-2p.json"));
const ALBA_DIM_JEU = lireFiche(fx("mv-fiche-residence-l-alba-dim-jeu.json"));

const DEUX_ALPES: LiveSearchInput = {
  stationId: "les-2-alpes",
  stationName: "Les 2 Alpes",
  lat: 45.009,
  lon: 6.122,
  checkIn: "2027-02-06",
  checkOut: "2027-02-13",
  guests: 2,
  bedrooms: 0,
};

describe("Madame Vacances : requêtes", () => {
  it("la recherche est celle du formulaire de l'accueil, dates en jj/mm/aaaa", () => {
    assert.equal(
      urlRecherche(DEUX_ALPES, "148"),
      "https://www.madamevacances.com/recherche/?id_lieu=148&total_months=24&id=148&id2=&callcenter=&force_date=1&univers=&region=&station=148&date_debut=06%2F02%2F2027&date_fin=13%2F02%2F2027&nbp=2&id_desti=",
    );
  });

  it("les voyageurs sont bornés comme le sélecteur du site", () => {
    assert.deepEqual([voyageurs(0), voyageurs(2), voyageurs(30)], [1, 2, 16]);
  });

  it("des dates ou une station illisibles n'entrent pas dans l'adresse", () => {
    assert.throws(() => urlRecherche(DEUX_ALPES, "148&x=1"));
    assert.throws(() => dateFr("2027-02-30"));
    assert.throws(() => urlRecherche({ ...DEUX_ALPES, checkOut: "2027-02-06" }, "148"));
  });

  it("l'appel AJAX est celui que la fiche envoie, dates en ISO", () => {
    const e = RECHERCHE.etablissements.find((x) => x.id === "14387")!;
    assert.equal(
      urlFiche(e, DEUX_ALPES, "148"),
      "https://www.madamevacances.com/locations/france/alpes-du-nord/les-deux-alpes/au-coeur-des-ours/?method=ajax&formule=&id=14387&id_lieu=16%2C148%2C14387&total_months_room=24&date_debut=2027-02-06&date_fin=2027-02-13&nbp=2&tri=asc",
    );
    assert.equal(
      entetesFiche(e, DEUX_ALPES).referer,
      "https://www.madamevacances.com/locations/france/alpes-du-nord/les-deux-alpes/au-coeur-des-ours/?date_debut=06/02/2027&duree=7&nbp=2",
    );
  });
});

describe("Madame Vacances : recherche", () => {
  it("Les Deux Alpes, 2 pers. : trois établissements, dates comprises", () => {
    assert.deepEqual(RECHERCHE.etablissements.map((e) => e.id), ["14474", "14387", "14338"]);
    assert.equal(rechercheComprise(RECHERCHE, DEUX_ALPES), true);
    assert.equal(rechercheComprise(RECHERCHE, { ...DEUX_ALPES, checkIn: "2027-02-07", checkOut: "2027-02-11" }), false);
  });

  it("l'établissement porte son point, son type, sa station, ses dates et ses photos", () => {
    const e = RECHERCHE.etablissements.find((x) => x.id === "14387")!;
    assert.equal(e.nom, "Au Coeur des Ours");
    assert.equal(e.chemin, "/locations/france/alpes-du-nord/les-deux-alpes/au-coeur-des-ours/");
    assert.deepEqual([e.type, e.lieu, e.lat, e.lon, e.du, e.au], ["Appartement", "Les Deux Alpes", 45.017657, 6.125397, "2027-02-06", "2027-02-13"]);
    assert.equal(e.photos[0], "https://www.madamevacances.com/photos/etab/14387/660x365/les_deux_alpes_au_coeur_des_ours_exterieur_2_.jpg");
  });

  it("l'hôtel se reconnaît à son chemin, et n'est pas à détailler", () => {
    const h = RECHERCHE.etablissements.find((x) => x.id === "14338")!;
    assert.equal(h.hotel, true);
    assert.deepEqual(aDetailler(RECHERCHE, DEUX_ALPES).map((e) => e.id), ["14474", "14387"]);
  });

  it("montagne seulement : ni hôtel, ni Valjoly, ni Chambéry, ni la mer", () => {
    const loc = (chemin: string) => ({ chemin, hotel: chemin.startsWith("/hotels/") });
    assert.equal(etablissementGarde(loc("/locations/france/alpes-du-nord/les-deux-alpes/residence-l-alba/")), true);
    assert.equal(etablissementGarde(loc("/hotels/france/alpes-du-nord/les-deux-alpes/hotel-ibiza/")), false);
    assert.equal(etablissementGarde(loc("/locations/france/alpes-du-nord/valjoly/residence-x/")), false);
    assert.equal(etablissementGarde(loc("/locations/france/alpes-du-nord/chambery/residence-y/")), false);
    assert.equal(etablissementGarde(loc("/locations/france/cote-atlantique/biarritz/residence-z/")), false);
  });

  it("des résultats datés du 6 au 13 ne répondent pas à une demande du 7 au 11", () => {
    const e = RECHERCHE.etablissements[0];
    assert.equal(datesConformes(e, DEUX_ALPES), true);
    assert.equal(datesConformes(e, { checkIn: "2027-02-07", checkOut: "2027-02-11" }), false);
  });
});

describe("Madame Vacances : fiche", () => {
  it("Au Cœur des Ours, 2 pers. : un type vendu et un complet, avec leurs champs", () => {
    assert.deepEqual([OURS.disponibles, OURS.nuits, OURS.du, OURS.au], [1, 7, "2027-02-06", "2027-02-13"]);
    const [libre, complet] = OURS.logements;
    assert.deepEqual(
      [libre.id, libre.libelle, libre.capacite, libre.chambres, libre.pieces, libre.sdb, libre.total, libre.prixBarre, libre.complet, libre.formule],
      ["11728", "Appartement 3 pièces, 6 personnes", 6, 2, 3, 1, 2191, 2267, false, "LOC"],
    );
    assert.equal(libre.photos.length, 2);
    assert.deepEqual([complet.id, complet.complet, complet.total, complet.capacite, complet.chambres], ["11729", true, null, 8, 3]);
  });

  it("du dimanche au jeudi : aucun type, et les dates que la réponse a servies", () => {
    assert.deepEqual([ALBA_DIM_JEU.logements.length, ALBA_DIM_JEU.disponibles, ALBA_DIM_JEU.du, ALBA_DIM_JEU.au], [0, 0, "2027-02-07", "2027-02-11"]);
  });

  it("une réponse illisible rend une fiche vide", () => {
    assert.deepEqual(lireFiche("pas du json").logements, []);
    assert.deepEqual(lireFiche({ resultat: 3 }).logements, []);
  });
});

describe("Madame Vacances : annonces", () => {
  const ours = RECHERCHE.etablissements.find((x) => x.id === "14387")!;

  it("une annonce par type vendu, avec les conventions communes", () => {
    const ls = madameVacancesListings(ours, OURS, DEUX_ALPES);
    assert.equal(ls.length, 1);
    const l = ls[0];
    assert.equal(l.id, "mv-14387-11728");
    assert.equal(l.source, "Madame Vacances");
    assert.equal(l.title, "Au Coeur des Ours — Appartement 3 pièces, 6 personnes");
    assert.equal(l.total, 2191);
    assert.deepEqual([l.capacity, l.bedrooms, l.rooms, l.baths, l.propertyType], [6, 2, 3, 1, "Appartement"]);
    assert.deepEqual([l.lat, l.lon, l.locality, l.placeName], [45.017657, 6.125397, "Les Deux Alpes", "Au Coeur des Ours"]);
    assert.equal(l.priceLabel, "2191 € / logt, 7 nuits — prix barré 2267 € — frais obligatoires en sus : frais de dossier, taxe de séjour");
    assert.equal(l.skiPassIncluded, false);
    assert.equal(l.priceIndicative, false);
    assert.equal(l.platformId, "11728");
    assert.equal(l.url, "https://www.madamevacances.com/locations/france/alpes-du-nord/les-deux-alpes/au-coeur-des-ours/?date_debut=06/02/2027&duree=7&nbp=2");
    assert.equal(l.proven, "Madame Vacances live 2027-02-06→2027-02-13");
  });

  it("un hôtel n'est jamais rendu, même avec une fiche", () => {
    const hotel = RECHERCHE.etablissements.find((x) => x.id === "14338")!;
    assert.equal(madameVacancesListings(hotel, OURS, DEUX_ALPES).length, 0);
  });

  it("une fiche servie pour d'autres dates n'est pas rendue", () => {
    assert.equal(madameVacancesListings(ours, { ...OURS, du: "2027-02-13", au: "2027-02-20" }, DEUX_ALPES).length, 0);
  });

  it("une formule inconnue : on ne sait pas si le forfait est compris", () => {
    const brut = fx("mv-fiche-au-coeur-des-ours-2p.json").replaceAll('data-base_product_code=\\"LOC\\"', 'data-base_product_code=\\"LOCFORFAIT\\"');
    const [l] = madameVacancesListings(ours, lireFiche(brut), DEUX_ALPES);
    assert.equal(l.skiPassIncluded, null);
    assert.equal(l.priceLabel, "2191 € / logt, 7 nuits — prix barré 2267 €");
  });

  it("formule LOCT : taxe de séjour incluse ; conditions autres que standard écrites avec les mots du site", () => {
    assert.equal(
      libellePrix({ total: 4425, prixBarre: null, conditions: "Conditions standards", formule: "LOCT" }, 7),
      "4425 € / logt, 7 nuits — frais obligatoires en sus : frais de dossier (taxe de séjour incluse)",
    );
    assert.equal(
      libellePrix({ total: 3000, prixBarre: null, conditions: "FLEXIBLE Annulation sans frais", formule: "LOC" }, 7),
      "3000 € / logt, 7 nuits — FLEXIBLE Annulation sans frais — frais obligatoires en sus : frais de dossier, taxe de séjour",
    );
    assert.equal(libellePrix({ total: null, prixBarre: null, conditions: null, formule: "LOC" }, 7), null);
  });

  it("le type : les mots du libellé, sinon ceux de l'établissement, jamais « Hotel »", () => {
    assert.equal(typePublie("Studio 4 personnes", "Appartement"), "Studio");
    assert.equal(typePublie("Chalet 12 personnes", "Chalet"), "Chalet");
    assert.equal(typePublie("2 pièces 4 personnes", "Appartement"), "Appartement");
    assert.equal(typePublie("Chambre double", "Hotel"), null);
  });
});

describe("Madame Vacances : couverture", () => {
  it("Les 2 Alpes ont leur station du site ; les sous-stations de La Plagne prennent La Plagne", () => {
    assert.deepEqual(lieuxDe("Madame Vacances", "les-2-alpes"), ["148"]);
    assert.deepEqual(lieuxDe("Madame Vacances", "plagne-centre"), ["142"]);
    assert.ok(agencesDe("les-2-alpes").includes("Madame Vacances"));
    assert.ok(!agencesDe("avoriaz").includes("Madame Vacances"));
  });
});
