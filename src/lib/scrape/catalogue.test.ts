import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coordonneesPlausibles,
  ficheDepuisHtml,
  ficheParlante,
  normaliserFiche,
  natureTarif,
  photosNettes,
  retirerDecorDuSite,
  retirerPlanchers,
  type FicheCatalogue,
} from "./catalogue.ts";

const QUAND = "2026-10-11T00:00:00.000Z";

describe("catalogue des centrales sans connecteur", () => {
  it("lit une fiche Diffusio telle que Sancy la publie", () => {
    const html = `<html><head><meta property="og:title" content="Le Cantou d&#039;Emile"></head><body>
      <div class="capacite"><h3>Capacité</h3><ul><li>Capacité : 6 personnes</li><li>2 chambres</li><li>1 lit(s) double(s)</li></ul></div>
      <div class="listeTarifs"><p>Semaine : 650 € + taxe de séjour</p><p>3 semaines : 1190 à 1980 €.</p><p>Caution : 300 €</p></div>
      <div id="carte" data-lat="45.57756" data-lng="2.792383"></div>
      <img src="/themes/lae-site/php/diffusio/assets/medias/gdf.svg"><img src="https://cdn.laetis.fr/i/sancy/detail/4966779.jpg">
    </body></html>`;
    const f = ficheDepuisHtml(html, "https://www.sancy.com/fr/fiche/hebergement-locatif/le-cantou_TFO2800860/", QUAND);
    assert.equal(f.titre, "Le Cantou d'Emile");
    assert.equal(f.capacite, 6);
    assert.equal(f.chambres, 2);
    assert.equal(f.lat, 45.57756);
    assert.equal(f.lon, 2.792383);
    assert.deepEqual(f.photos, ["https://cdn.laetis.fr/i/sancy/detail/4966779.jpg"]);
    assert.deepEqual(
      f.tarifs.map((t) => [t.montant, t.unite]),
      [[650, "semaine"]],
      "la caution n'est pas un tarif ; une fourchette n'est pas un prix",
    );
    assert.equal(f.planchersEcartes, 1);
    assert.equal(f.totalSejour, null, "une grille n'est pas un total daté");
    assert.ok(ficheParlante(f));
  });

  it("ne déduit pas les chambres des pièces", () => {
    const f = ficheDepuisHtml("<h1>Appartement 3 pièces 6 personnes</h1>", "https://x.fr/hebergements/a/", QUAND);
    assert.equal(f.pieces, 3);
    assert.equal(f.capacite, 6);
    assert.equal(f.chambres, null);
  });

  it("borne ce que Firecrawl renvoie", () => {
    const f = normaliserFiche(
      {
        titre: "  Chalet  ",
        capacite_personnes: 120,
        chambres: 3,
        latitude: 0,
        longitude: 0,
        photos: ["/a.jpg", "javascript:alert(1)", "/logo.png", "/a.jpg"],
        tarifs: [
          { libelle: "À partir de 420 €", montant_eur: 420, unite: "semaine" },
          { libelle: "Semaine vacances de Noël", montant_eur: 980 },
          { libelle: "Draps", montant_eur: 3 },
        ],
        total_sejour: { montant_eur: 1450, arrivee: "2027-02-13", depart: "2027-02-20", libelle: "Total" },
      },
      "https://www.chioula.fr/hebergement/chalet",
      "firecrawl",
      QUAND,
    );
    assert.equal(f.titre, "Chalet");
    assert.equal(f.capacite, null, "120 personnes : hors bornes");
    assert.equal(f.chambres, 3);
    assert.equal(f.lat, null, "0,0 n'est pas en France");
    assert.deepEqual(f.photos, ["https://www.chioula.fr/a.jpg"]);
    assert.deepEqual(
      f.tarifs.map((t) => [t.montant, t.unite]),
      [[980, "semaine"]],
      "« À partir de 420 € » n'est pas un prix",
    );
    assert.equal(f.planchersEcartes, 1);
    assert.deepEqual(f.totalSejour, { montant: 1450, arrivee: "2027-02-13", depart: "2027-02-20", nuits: 7 });
  });

  it("refuse un total sans dates ou « à partir de »", () => {
    const sansDates = normaliserFiche({ total_sejour: { montant_eur: 900, arrivee: "", depart: "" } }, "https://x.fr", "firecrawl");
    assert.equal(sansDates.totalSejour, null);
    const plancher = normaliserFiche(
      { total_sejour: { montant_eur: 900, arrivee: "2027-01-02", depart: "2027-01-09", libelle: "dès 900 €" } },
      "https://x.fr",
      "firecrawl",
    );
    assert.equal(plancher.totalSejour, null);
  });

  it("cadre France", () => {
    assert.ok(coordonneesPlausibles(42.8, 0.1));
    assert.ok(!coordonneesPlausibles(6.8, 45.9), "lat/lon inversées");
  });

  it("une page muette n'est pas une fiche", () => {
    assert.ok(!ficheParlante(ficheDepuisHtml("<h1>Nos hébergements</h1>", "https://x.fr/hebergements/", QUAND)));
  });
});

describe("relevé du 11 octobre 2026 : corrections", () => {
  it("un court séjour n'est pas un prix à la nuit, un supplément n'est pas un loyer", () => {
    const f = normaliserFiche(
      {
        tarifs: [
          { libelle: "Court séjour (base 4 nuits) : 220 €", montant_eur: 220, unite: "nuit" },
          { libelle: "15 € / semaine.", montant_eur: 15 },
          { libelle: "Tarifs des semaines de février : 690 €", montant_eur: 690 },
        ],
      },
      "https://www.sancy.com/fr/fiche/hebergement-locatif/x/",
      "lecture",
    );
    assert.deepEqual(f.tarifs.map((t) => [t.montant, t.unite]), [
      [220, "sejour"],
      [690, "semaine"],
    ]);
    assert.equal(f.planchersEcartes, 0, "« Tarifs des semaines » n'est pas un « dès »");
  });

  it("l'office de tourisme ne donne ni son nom ni sa position à la fiche", () => {
    const html = `<script type="application/ld+json">{"@type":"TouristInformationCenter","name":"Haut-Giffre Tourisme","geo":{"latitude":46.08,"longitude":6.67}}</script>
      <meta property="og:title" content="Chalet du Bois Lombard - Haut-Giffre Tourisme"><h1>Chalet du Bois Lombard</h1>`;
    const f = ficheDepuisHtml(html, "https://www.haut-giffre.fr/chambres-hotes-et-gites/chalet-du-bois-lombard/", QUAND);
    assert.equal(f.titre, "Chalet du Bois Lombard - Haut-Giffre Tourisme");
    assert.equal(f.lat, null);
  });
});

import { retirerPositionsDuSite } from "./catalogue.ts";
describe("positions communes à tout un site", () => {
  const fiche = (lat: number, lon: number) => normaliserFiche({ latitude: lat, longitude: lon }, "https://x.fr/h", "lecture", QUAND);
  it("retire la position de l'office, portée par toutes les fiches", () => {
    const f = Array.from({ length: 6 }, () => fiche(46.0827566, 6.6751137));
    assert.equal(retirerPositionsDuSite(f), 6);
    assert.ok(f.every((x) => x.lat == null));
  });
  it("garde une résidence de plusieurs appartements", () => {
    const f = [...Array.from({ length: 8 }, () => fiche(45.506104, 2.862574)), ...Array.from({ length: 20 }, (_, i) => fiche(45.5 + i / 100, 2.8))];
    assert.equal(retirerPositionsDuSite(f), 0);
  });

  it("une photo par image, la plus grande ; ni vignette, ni menu, ni avatar", () => {
    const w = "https://www.haut-giffre.fr/wp-content/uploads/wpetourisme/";
    assert.deepEqual(
      photosNettes([`${w}11287648-diaporama-752x480.jpg`, `${w}11287648-diaporama-1200x766.jpg`, `${w}5940080-diaporama-250x140.jpg`, `${w}toutourisme-89x70.jpg`, `${w}feder-1-0x80.jpg`]),
      [`${w}11287648-diaporama-1200x766.jpg`, `${w}5940080-diaporama-250x140.jpg`],
    );
    const f = normaliserFiche(
      { photos: ["https://font-romeu.fr/wp-content/uploads/2022/04/Rando-menu.jpg", "https://secure.gravatar.com/avatar/a594?s=96", "https://font-romeu.fr/wp-content/uploads/2021/10/8046134.jpg"] },
      "https://font-romeu.fr/hebergements/chalet-montana/",
      "lecture",
      QUAND,
    );
    assert.deepEqual(f.photos, ["https://font-romeu.fr/wp-content/uploads/2021/10/8046134.jpg"]);
  });

  it("l'auteur de la page n'est pas le titre de la fiche (beuil.fr)", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"Person","name":"Administrateur SICTIAM"},{"@type":"LodgingBusiness","name":"Gîte nature montagne"}]}</script>`;
    assert.equal(ficheDepuisHtml(html, "https://beuil.fr/gite-nature-montagne-9710/", QUAND).titre, "Gîte nature montagne");
  });

  it("lit la position d'une carte Leaflet ou d'un lien d'itinéraire", () => {
    const leaflet = `<h1>Chalet 6 personnes</h1><script>var m = L.marker([42.5043, 2.0367]).addTo(carte);</script>`;
    const f = ficheDepuisHtml(leaflet, "https://font-romeu.fr/hebergements/a/", QUAND);
    assert.deepEqual([f.lat, f.lon], [42.5043, 2.0367]);
    const lien = `<h1>Gîte 4 personnes</h1><a href="https://www.google.com/maps/dir/?api=1&amp;destination=46.0757,6.7246">Itinéraire</a>`;
    const g = ficheDepuisHtml(lien, "https://www.haut-giffre.fr/chambres-hotes-et-gites/a/", QUAND);
    assert.deepEqual([g.lat, g.lon], [46.0757, 6.7246]);
    const objet = `<h1>Studio 2 personnes</h1><script>window.fiche = {"lat":"46.2601","lng":"6.5703"};</script>`;
    assert.deepEqual([ficheDepuisHtml(objet, "https://x.fr/a", QUAND).lat, ficheDepuisHtml(objet, "https://x.fr/a", QUAND).lon], [46.2601, 6.5703]);
    const ailleurs = `<h1>Studio</h1><script>L.marker([40.7128, -74.006])</script>`;
    assert.equal(ficheDepuisHtml(ailleurs, "https://x.fr/a", QUAND).lat, null, "hors de France : écartée");
  });

  it("retire le décor du site : logo commun, nom du site en fin de titre", () => {
    const fiche = (i: number, photos: string[]): FicheCatalogue => ({
      ...normaliserFiche({ titre: `Chalet ${i} - Haut-Giffre Tourisme` }, `https://x.fr/h/${i}/`, "lecture", QUAND),
      photos,
    });
    const fiches = Array.from({ length: 12 }, (_, i) => fiche(i, [`https://x.fr/p/${i}.jpg`, "https://x.fr/feder.jpg"]));
    fiches.push({ ...fiche(12, ["https://x.fr/p/12.jpg"]), titre: "Résidence Odalys - Le Buet" });
    const r = retirerDecorDuSite(fiches);
    assert.equal(r.photos, 12);
    assert.deepEqual(fiches[0].photos, ["https://x.fr/p/0.jpg"]);
    assert.equal(fiches[0].titre, "Chalet 0");
    assert.equal(fiches[12].titre, "Résidence Odalys - Le Buet", "une fin de titre propre au logement reste");
    assert.deepEqual(r.decor, { photos: ["https://x.fr/feder.jpg"], finsTitre: ["Haut-Giffre Tourisme"] });
    // Relevé suivant : une seule fiche relue, le décor connu s'applique encore.
    const seule = [fiche(20, ["https://x.fr/p/20.jpg", "https://x.fr/feder.jpg"])];
    retirerDecorDuSite(seule, r.decor);
    assert.deepEqual(seule[0].photos, ["https://x.fr/p/20.jpg"]);
    assert.equal(seule[0].titre, "Chalet 20");
  });

  it("aucun « à partir de », aucune fourchette, aucun supplément n'est un prix", () => {
    for (const l of [
      "À partir de 420 €",
      "Forfait cure à partir 950€. selon période (nous consulter)",
      "Dès 380 € la semaine",
      "Min 2 nuits - nuit supp. entre 80€ et 92€/nuit",
      "Le tarif varie entre 550€ et 780€ la semaine selon la période",
      "2 nuits min, nuit supplémentaire : de 60€/nuit à 70€/nuit",
      "WE : de 180 € (Basse Saison) à 300 € (Haute Saison)",
      "à partir de — 3 semaines : 1190 à 1980 €.",
    ]) {
      assert.equal(natureTarif(l), "plancher", l);
    }
    for (const l of ["De 3 à 6 ans : 23 € par enfant, par jour,", "Petit déjeuner : 15 €", "Caution : 300 €"]) {
      assert.equal(natureTarif(l), "hors-loyer", l);
    }
    for (const l of [
      "Semaine : 650 € + taxe de séjour",
      "Tarif 700 € la semaine à partir du 1er mai",
      "De 3 à 4 nuits : 62 €/nuit/personne",
      "Minimum 2 nuits, 350€ la nuit supp.",
      "Week-end 2 nuits : 490 €, 3 nuits : 650 € et 4 nuits : 790 € jusqu'à 8 personnes",
    ]) {
      assert.equal(natureTarif(l), "ferme", l);
    }
  });

  it("remet à la règle une fiche d'un relevé antérieur", () => {
    const vieille = {
      ...normaliserFiche({}, "https://x.fr/h/", "lecture", QUAND),
      tarifs: [
        { libelle: "Semaine : 650 €", montant: 650, unite: "semaine" as const },
        { libelle: "à partir de — 1190 à 1980 €", montant: 1190, unite: "sejour" as const, plancher: true },
        { libelle: "Petit déjeuner : 15 €", montant: 15, unite: "autre" as const },
      ],
    };
    const f = retirerPlanchers(vieille);
    assert.deepEqual(f.tarifs, [{ libelle: "Semaine : 650 €", montant: 650, unite: "semaine" }]);
    assert.equal(f.planchersEcartes, 1);
  });
});
