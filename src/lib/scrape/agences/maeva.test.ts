import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { agencesDe, lieuxDe } from "./couverture.ts";
import { chambres, lireRecherche, logementGarde, maevaListings, pagesAParcourir, pieces, requeteRecherche } from "./maeva.ts";
import type { LiveSearchInput } from "../types.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const lire = (f: string): unknown => JSON.parse(readFileSync(join(dir, "fixtures", f), "utf8"));

/**
 * Réponses réelles du 26 septembre 2026, réduites aux clés que le module lit :
 * Avoriaz à 2 adultes, catalogue FRANCE (les Alpages, dont un studio, et une
 * chambre d'hôtel Belambra à écarter) et catalogue SKI (le même 2 pièces, avec
 * sa formule forfait) ; du dimanche 7 au jeudi 11, une résidence de Morzine
 * que le site a rendue pour Avoriaz.
 */
const FRANCE = lireRecherche(lire("maeva-recherche-avoriaz-2.json"));
const SKI = lireRecherche(lire("maeva-recherche-avoriaz-ski-2.json"));
const DIM_JEU = lireRecherche(lire("maeva-recherche-avoriaz-dim-jeu.json"));

const AVORIAZ: LiveSearchInput = {
  stationId: "avoriaz",
  stationName: "Avoriaz",
  lat: 46.1914,
  lon: 6.7728,
  checkIn: "2027-02-06",
  checkOut: "2027-02-13",
  guests: 2,
  bedrooms: 0,
};
const CLES = { cles: [19] };

describe("Maeva : requêtes", () => {
  it("la recherche est celle de la page de résultats : dates, voyageurs, destination, catalogue", () => {
    const q = requeteRecherche(AVORIAZ, 19);
    assert.ok(q.url.startsWith("https://www.maeva.com/fr-fr/assets/dm.php?AJAX_NEW_DM=1&ACTION=recherche_resultats&initiator=btn_rechercher&acces_direct=1&date_debut=2027-02-06&date_fin=2027-02-13&nb_adults=2&trier_par=zerank&station_cle=19&page=1"));
    assert.match(q.url, /&CATALOGUE=FRANCE&/);
    const corps = new URLSearchParams(q.corps);
    assert.equal(corps.get("params[var_calendarDateDebut]"), "2027-02-06");
    assert.equal(corps.get("params[var_calendarDateFin]"), "2027-02-13");
    assert.equal(corps.get("params[nbPaxDetail][adultes]"), "2");
    assert.equal(corps.get("params[var_oboosearch]"), "19|station");
    assert.equal(corps.get("get_filtres"), "1");
    assert.equal(q.entetes["content-type"], "application/x-www-form-urlencoded; charset=UTF-8");
    assert.doesNotMatch(q.url + q.corps, /skitrack/i);
  });

  it("le catalogue SKI, et les pages suivantes comme le site les demande", () => {
    const q = requeteRecherche(AVORIAZ, 19, { page: 2, catalogue: "SKI" });
    assert.match(q.url, /station_activite_cle=225/);
    assert.match(q.url, /&CATALOGUE=SKI&/);
    const corps = new URLSearchParams(q.corps);
    assert.equal(corps.get("params[num_page]"), "2");
    assert.equal(corps.get("get_filtres"), "0");
    assert.equal(corps.get("is_init"), "false");
  });

  it("des dates ou une destination illisibles ne partent pas", () => {
    assert.throws(() => requeteRecherche({ ...AVORIAZ, checkIn: "06/02/2027" }, 19));
    assert.throws(() => requeteRecherche(AVORIAZ, 0));
  });

  it("30 résidences par page, bornées", () => {
    assert.equal(pagesAParcourir(181), 7);
    assert.equal(pagesAParcourir(21), 1);
    assert.equal(pagesAParcourir(null), 1);
    assert.equal(pagesAParcourir(10_000), 10);
  });
});

describe("Maeva : lecture", () => {
  it("résidences, position, type, note ; logements, prix, dates", () => {
    assert.deepEqual([FRANCE.total, FRANCE.recus], [21, 2]);
    const r = FRANCE.residences[0];
    assert.deepEqual([r.grpResCle, r.nom, r.type, r.typeCle, r.lat, r.lon, r.stationCle, r.lieu, r.note, r.avis], [
      "57404", "Résidence Les Alpages - maeva Home", "Location de particulier", "261", 46.19222143, 6.77676623, 19, "Avoriaz", 2.8, 39,
    ]);
    const p = r.produits.find((x) => x.produitCle === "121312")!;
    assert.deepEqual([p.libelle, p.typeProduit, p.places, p.chambres, p.prix, p.pension, p.debut, p.fin, p.nuits, p.dispo], [
      "2 Pièces 4 Personnes Budget", "2 Pièces", 4, 1, 1820, "Logement seul", "2027-02-06", "2027-02-13", 7, true,
    ]);
  });

  it("le catalogue SKI porte les formules forfait, par personne", () => {
    const p = SKI.residences[0].produits[0];
    assert.deepEqual(p.formules, [
      { formule: "2", nom: "Hébergement + forfait", prixParPersonne: 1143 },
      { formule: "3", nom: "Héb + forfait + matériel", prixParPersonne: 1246 },
    ]);
    assert.equal(SKI.residences[0].lat, 46.19222143, "les coordonnées en chaîne se lisent aussi");
  });

  it("une réponse illisible ne rend rien", () => {
    assert.deepEqual(lireRecherche(null), { residences: [], total: null, recus: 0 });
  });
});

describe("Maeva : ce que Skitrack garde", () => {
  it("ni chambre d'hôtel, ni hôtel, ni camping", () => {
    const belambra = FRANCE.residences[1];
    assert.equal(logementGarde(belambra, belambra.produits[0]), false);
    assert.equal(logementGarde({ typeCle: "258", type: "Hôtel" }, { typeProduit: "Studio", libelle: "Studio" }), false);
    assert.equal(logementGarde({ typeCle: "261", type: "Location de particulier" }, { typeProduit: "Studio", libelle: "Studio" }), true);
  });

  it("un studio n'a pas de chambre, quoi que la recherche écrive", () => {
    assert.equal(chambres({ typeProduit: "Studio", chambres: 1 }), 0);
    assert.equal(chambres({ typeProduit: "2 Pièces", chambres: 1 }), 1);
    assert.deepEqual([pieces("Studio"), pieces("3 Pièces"), pieces("Appartements")], [1, 3, null]);
  });
});

describe("Maeva : annonces", () => {
  it("hébergement seul : une annonce par logement gardé, total exact", () => {
    const ls = FRANCE.residences.flatMap((r) => maevaListings(r, AVORIAZ, CLES));
    assert.deepEqual(ls.map((l) => l.id), ["mae-123632", "mae-121312"]);
    const l = ls[1];
    assert.equal(l.source, "Maeva");
    assert.equal(l.title, "Résidence Les Alpages - maeva Home — 2 Pièces 4 Personnes Budget");
    assert.equal(l.total, 1820);
    assert.equal(l.priceLabel, "1 820 € logement seul");
    assert.deepEqual([l.priceIndicative, l.skiPassIncluded], [false, false]);
    assert.deepEqual([l.guests, l.bedrooms, l.rooms, l.propertyType], [4, 1, 2, "Location de particulier"]);
    assert.deepEqual([l.lat, l.lon, l.locality, l.placeName], [46.19222143, 6.77676623, "Avoriaz", "Résidence Les Alpages - maeva Home"]);
    assert.equal(l.url, "https://www.maeva.com/fr-fr/residence-les-alpages-maeva-home_57404.html?date_debut=2027-02-06&date_fin=2027-02-13");
    assert.equal(l.proven, "Maeva live 2027-02-06→2027-02-13");
    assert.equal(ls[0].bedrooms, 0, "le studio");
  });

  it("formule ski : une seconde annonce, forfait compris, prix par personne indicatif", () => {
    const ls = maevaListings(SKI.residences[0], AVORIAZ, { ...CLES, forfaits: true });
    assert.deepEqual(ls.map((l) => l.id), ["mae-121312", "mae-121312-forfait"]);
    const f = ls[1];
    assert.deepEqual([f.total, f.priceIndicative, f.skiPassIncluded], [0, true, true]);
    assert.equal(f.priceLabel, "Hébergement + forfait : dès 1 143 € / pers. / 7 nuits (2 adultes)");
    assert.equal(maevaListings(SKI.residences[0], AVORIAZ, CLES).length, 1, "sans `forfaits`, l'hébergement seul");
  });

  it("une résidence d'une station voisine, rendue par la recherche étendue, n'est pas gardée", () => {
    const dimJeu = { ...AVORIAZ, checkIn: "2027-02-07", checkOut: "2027-02-11" };
    assert.equal(maevaListings(DIM_JEU.residences[0], dimJeu, CLES).length, 0);
    assert.equal(maevaListings(DIM_JEU.residences[0], { ...dimJeu, stationId: "morzine" }, { cles: [68] }).length, 1);
  });

  it("un logement d'autres dates, ou trop petit, n'est pas une offre", () => {
    const r = FRANCE.residences[0];
    assert.equal(maevaListings(r, { ...AVORIAZ, checkIn: "2027-02-13", checkOut: "2027-02-20" }, CLES).length, 0);
    assert.equal(maevaListings(r, { ...AVORIAZ, guests: 6 }, CLES).length, 0);
  });
});

describe("Maeva : couverture", () => {
  it("une ou plusieurs destinations par station", () => {
    assert.deepEqual(lieuxDe("Maeva", "avoriaz"), ["19"]);
    assert.deepEqual(lieuxDe("Maeva", "courchevel"), ["30", "201311"]);
    assert.ok(agencesDe("avoriaz").includes("Maeva"));
    assert.ok(!agencesDe("station-inconnue").includes("Maeva"));
  });
});
