import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aPrecharger,
  defilementRuban,
  indexBoucle,
  lireMolette,
  MOLETTE0,
  MOLETTE_PAUSE_MS,
  rangCourant,
  sensGlisse,
  voisinDansListe,
} from "./visionneuse.ts";

describe("indexBoucle", () => {
  it("après la dernière photo vient la première", () => {
    assert.equal(indexBoucle(12, 12), 0);
  });
  it("avant la première vient la dernière", () => {
    assert.equal(indexBoucle(-1, 12), 11);
  });
  it("un rang dans la galerie ne bouge pas", () => {
    assert.equal(indexBoucle(3, 12), 3);
  });
  it("une galerie vide rend 0", () => {
    assert.equal(indexBoucle(5, 0), 0);
  });
});

describe("aPrecharger", () => {
  it("la suivante, la précédente et celle d'après", () => {
    assert.deepEqual(aPrecharger(3, 12), [4, 2, 5]);
  });
  it("en boucle aux deux bouts", () => {
    assert.deepEqual(aPrecharger(0, 12), [1, 11, 2]);
    assert.deepEqual(aPrecharger(11, 12), [0, 10, 1]);
  });
  it("sans doublon ni la photo affichée dans une petite galerie", () => {
    assert.deepEqual(aPrecharger(0, 2), [1]);
    assert.deepEqual(aPrecharger(1, 3), [2, 0]);
  });
  it("rien à charger pour une photo seule", () => {
    assert.deepEqual(aPrecharger(0, 1), []);
    assert.deepEqual(aPrecharger(0, 0), []);
  });
});

describe("rangCourant", () => {
  const photos = ["a", "b", "c", "d"];
  it("suit la photo par son adresse", () => {
    assert.equal(rangCourant(photos, "c", 0), 2);
  });
  it("une photo précédente sortie : la même photo reste affichée", () => {
    assert.equal(rangCourant(["a", "c", "d"], "c", 2), 1);
  });
  it("la photo affichée sortie : la suivante prend son rang", () => {
    assert.equal(rangCourant(["a", "b", "d"], "c", 2), 2);
  });
  it("la dernière sortie : on reste sur la nouvelle dernière", () => {
    assert.equal(rangCourant(["a", "b"], "c", 2), 1);
  });
  it("sans adresse, le rang de repli", () => {
    assert.equal(rangCourant(photos, null, 1), 1);
    assert.equal(rangCourant([], "a", 3), 0);
  });
});

describe("voisinDansListe", () => {
  const liste = ["a", "b", "c"];
  it("le précédent et le suivant", () => {
    assert.equal(voisinDansListe(liste, ["b"], -1), "a");
    assert.equal(voisinDansListe(liste, ["b"], 1), "c");
  });
  it("rien aux extrémités", () => {
    assert.equal(voisinDansListe(liste, ["a"], -1), null);
    assert.equal(voisinDansListe(liste, ["c"], 1), null);
  });
  it("une offre qui n'est pas dans la liste se situe par son logement", () => {
    assert.equal(voisinDansListe(liste, ["b-booking", "b"], 1), "c");
  });
  it("un logement hors de la liste n'a pas de voisin", () => {
    assert.equal(voisinDansListe(liste, ["z"], 1), null);
  });
});

describe("lireMolette", () => {
  it("de petits pas s'additionnent jusqu'au seuil", () => {
    let r = lireMolette(MOLETTE0, 25, 2, 1000, false);
    assert.equal(r.pas, 0);
    assert.equal(r.pris, true);
    r = lireMolette(r.m, 25, 0, 1010, false);
    assert.equal(r.pas, 0);
    r = lireMolette(r.m, 25, 0, 1020, false);
    assert.equal(r.pas, 1);
  });
  it("vers la gauche, la photo précédente", () => {
    assert.equal(lireMolette(MOLETTE0, -80, 0, 1000, false).pas, -1);
  });
  it("l'élan qui suit un pas est absorbé", () => {
    const r = lireMolette(MOLETTE0, 80, 0, 1000, false);
    const elan = lireMolette(r.m, 80, 0, 1000 + MOLETTE_PAUSE_MS - 1, false);
    assert.equal(elan.pas, 0);
    assert.equal(elan.pris, true);
    assert.equal(lireMolette(elan.m, 80, 0, 1000 + MOLETTE_PAUSE_MS + 1, false).pas, 1);
  });
  it("dans la fenêtre, la molette verticale reste au défilement de la fiche", () => {
    const r = lireMolette(MOLETTE0, 0, 120, 1000, false);
    assert.equal(r.pas, 0);
    assert.equal(r.pris, false);
  });
  it("en plein écran, la molette verticale change de photo", () => {
    assert.equal(lireMolette(MOLETTE0, 0, 120, 1000, true).pas, 1);
  });
  it("un geste interrompu repart de zéro", () => {
    const r = lireMolette(MOLETTE0, 40, 0, 1000, false);
    assert.equal(lireMolette(r.m, 40, 0, 2000, false).pas, 0);
  });
});

describe("sensGlisse", () => {
  it("vers la gauche, la photo suivante ; vers la droite, la précédente", () => {
    assert.equal(sensGlisse(-80, 5), 1);
    assert.equal(sensGlisse(80, 5), -1);
  });
  it("un geste court ou surtout vertical ne change rien", () => {
    assert.equal(sensGlisse(-20, 0), 0);
    assert.equal(sensGlisse(-60, 90), 0);
  });
});

describe("defilementRuban", () => {
  it("ne bouge pas quand la vignette est en vue", () => {
    assert.equal(defilementRuban(100, 500, 200, 80, 16), 100);
  });
  it("recule pour une vignette cachée à gauche", () => {
    assert.equal(defilementRuban(300, 500, 200, 80, 16), 184);
  });
  it("avance pour une vignette cachée à droite", () => {
    assert.equal(defilementRuban(0, 500, 480, 80, 16), 76);
  });
  it("ne descend jamais sous zéro", () => {
    assert.equal(defilementRuban(40, 500, 4, 80, 16), 0);
  });
});
