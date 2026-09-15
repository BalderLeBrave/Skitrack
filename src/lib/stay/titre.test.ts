import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { titreDepuisUrl, titreEstFichier, titrePublie } from "./titre.ts";

describe("titre d'annonce, pas nom de fichier", () => {
  it("reconnaît l'alt photo des centrales Ingénie", () => {
    assert.equal(titreEstFichier("_clients_223886005_photos_86a_5156059"), true);
    assert.equal(titreEstFichier("08-bleuet-52-2024-w-2362382"), true);
    assert.equal(titreEstFichier("location_51_007.jpg"), true);
    assert.equal(titreEstFichier("img-5247-4335448"), true);
    assert.equal(titreEstFichier("f79151fb-44d5-4339-9ce8-865b4d1b818c-3244257"), true);
  });

  it("garde le nom véritable", () => {
    assert.equal(titreEstFichier("CHALET NEVE Chalet 8 personnes"), false);
    assert.equal(titreEstFichier("LES BLEUETS N°52 Appartement 8 personnes"), false);
    assert.equal(titreEstFichier("Chalet - Chalet Santa Claus"), false);
  });

  it("relit le slug de la fiche", () => {
    assert.equal(
      titreDepuisUrl(
        "https://reservation.les2alpes.com/chalet-neve-chalet-8-personnes-les-2-alpes.html?cid=5",
      ),
      "chalet neve chalet 8 personnes les 2 alpes",
    );
  });

  it("prend le h1, pas le suffixe de la station", () => {
    assert.equal(
      titrePublie("LES BLEUETS N°52 Appartement 8 personnes - Les 2 Alpes : location appartement"),
      "LES BLEUETS N°52 Appartement 8 personnes",
    );
    assert.equal(titrePublie("<!-- --><a>CHALET NEVE Chalet 8 personnes</a>"), "CHALET NEVE Chalet 8 personnes");
    assert.equal(titrePublie("_clients_223886005_photos_86a_5156059"), null);
  });

  it("décode les entités HTML du nom publié", () => {
    assert.equal(titrePublie("Chalet Centaur&eacute;e (ou Chalet Sabot de V&eacute;nus)"), "Chalet Centaurée (ou Chalet Sabot de Vénus)");
    assert.equal(titrePublie("La P&acirc;ture"), "La Pâture");
    assert.equal(titrePublie("G&icirc;tes de France&reg;"), "Gîtes de France®");
  });
});
