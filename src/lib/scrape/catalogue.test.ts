import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { coordonneesPlausibles, ficheDepuisHtml, ficheParlante, normaliserFiche } from "./catalogue.ts";

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
      f.tarifs.map((t) => [t.montant, t.unite, t.plancher]),
      [
        [650, "semaine", false],
        [1190, "sejour", true],
      ],
      "la caution n'est pas un tarif ; une fourchette est un plancher, sur plusieurs semaines",
    );
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
    assert.deepEqual(f.tarifs.map((t) => [t.montant, t.unite, t.plancher]), [
      [420, "semaine", true],
      [980, "semaine", false],
    ]);
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
    assert.deepEqual(f.tarifs.map((t) => [t.montant, t.unite, t.plancher]), [
      [220, "sejour", false],
      [690, "semaine", false],
    ]);
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
});
