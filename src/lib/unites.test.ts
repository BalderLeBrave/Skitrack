/**
 * Ce qu'un convertisseur doit faire, et surtout ce qu'il doit refuser.
 *
 * Le refus passe en premier parce que c'est lui qui protège : un
 * convertisseur complaisant est pire qu'un affichage sans unité, puisqu'il
 * donne un chiffre faux avec l'air d'avoir raison.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  altitude,
  convertir,
  dansLeSysteme,
  dimensionDe,
  en,
  memeDimension,
  mesure,
  mesureDans,
  mesureN,
  uniteDe,
} from "./unites.ts";

describe("ce qui ne se convertit pas", () => {
  it("une longueur ne devient jamais une surface", () => {
    assert.equal(convertir({ valeur: 358.3, unite: "km" }, "ha"), null);
    assert.equal(convertir({ valeur: 2152, unite: "ha" }, "km"), null);
    assert.equal(en({ valeur: 2152, unite: "acre" }, "mi"), null);
  });

  it("le cas qui a motivé ce refus est celui du relevé", () => {
    // Skiinfo donne le domaine de Zermatt en 358,3 km de pistes et celui de
    // Vail en 2 152 hectares de terrain. Les deux s'appellent « domaine
    // skiable » et ne mesurent pas la même chose.
    const zermatt = { valeur: 358.3, unite: "km" } as const;
    const vail = { valeur: 2152, unite: "ha" } as const;
    assert.equal(memeDimension(zermatt.unite, vail.unite), false);
    assert.equal(convertir(vail, zermatt.unite), null);
  });

  it("une unité absente ne vaut pas accord", () => {
    assert.equal(memeDimension("km", null), false);
    assert.equal(memeDimension(null, null), false);
    assert.equal(memeDimension(undefined, "ha"), false);
  });
});

describe("ce qui se convertit", () => {
  it("les longueurs, par les définitions exactes", () => {
    // Le mille international vaut 1 609,344 m depuis 1959.
    assert.equal(en({ valeur: 1, unite: "mi" }, "m"), 1609.344);
    assert.equal(en({ valeur: 1, unite: "km" }, "m"), 1000);
    assert.equal(en({ valeur: 1, unite: "ft" }, "m"), 0.3048);
    const cent = en({ valeur: 100, unite: "km" }, "mi") as number;
    assert.ok(Math.abs(cent - 62.1371) < 0.001);
  });

  it("les surfaces, de même", () => {
    assert.equal(en({ valeur: 1, unite: "ha" }, "km2"), 0.01);
    const acres = en({ valeur: 100, unite: "ha" }, "acre") as number;
    assert.ok(Math.abs(acres - 247.105) < 0.01);
  });

  it("l'aller-retour ne perd rien", () => {
    for (const [a, b] of [["km", "mi"], ["m", "ft"], ["ha", "acre"]] as const) {
      const depart = { valeur: 137.5, unite: a };
      const retour = convertir(convertir(depart, b)!, a)!;
      assert.ok(Math.abs(retour.valeur - depart.valeur) < 1e-9, `${a} → ${b} → ${a}`);
    }
  });

  it("la conversion du relevé Skiinfo retombe sur ce que le site affiche", () => {
    // Le JSON-LD de Zermatt publie 5 315 ft et 12 792 ft ; la page écrit
    // 1 620 m et 3 899 m. C'est ce qui prouve que le site stocke du métrique.
    assert.equal(Math.round(en({ valeur: 5315, unite: "ft" }, "m") as number), 1620);
    assert.equal(Math.round(en({ valeur: 12792, unite: "ft" }, "m") as number), 3899);
    assert.equal(Math.round(en({ valeur: 886, unite: "acre" }, "ha") as number), 359);
  });
});

describe("écrire une mesure", () => {
  it("chaque unité porte son symbole et sa précision", () => {
    assert.equal(mesure({ valeur: 1620, unite: "m" }), "1 620 m");
    assert.equal(mesure({ valeur: 358.3, unite: "km" }), "358,3 km");
    assert.equal(mesure({ valeur: 2152, unite: "ha" }), "2 152 ha");
    assert.equal(mesure({ valeur: 886, unite: "acre" }), "886 acres");
    assert.equal(mesure({ valeur: 3.59, unite: "km2" }), "3,6 km²");
  });

  it("l'espace des milliers est simple, comme pour les sommes", () => {
    assert.equal(mesure({ valeur: 12345, unite: "m" }).includes(String.fromCharCode(0x202f)), false);
    assert.equal(mesure({ valeur: 12345, unite: "m" }), "12 345 m");
  });

  it("une mesure absente s'écrit « – », ou `null` si l'écran préfère", () => {
    assert.equal(mesure(null), "–");
    assert.equal(mesure({ valeur: Number.NaN, unite: "km" }), "–");
    assert.equal(mesureN(null), null);
    assert.equal(mesureN({ valeur: 12, unite: "km" }), "12 km");
  });
});

describe("basculer de système", () => {
  it("le métrique reste le défaut, y compris pour les États-Unis", () => {
    // L'audit du 18 septembre pose ce choix en toutes lettres. Ce module rend
    // possible d'en changer ; il ne change pas le défaut.
    assert.equal(uniteDe("metrique", "longueur"), "km");
    assert.equal(uniteDe("metrique", "surface"), "ha");
    assert.equal(uniteDe("metrique", "altitude"), "m");
  });

  it("l'impérial emploie milles, acres et pieds", () => {
    assert.equal(uniteDe("imperial", "longueur"), "mi");
    assert.equal(uniteDe("imperial", "surface"), "acre");
    assert.equal(uniteDe("imperial", "altitude"), "ft");
  });

  it("une bascule garde la dimension", () => {
    const km = dansLeSysteme({ valeur: 100, unite: "km" }, "imperial");
    assert.equal(dimensionDe(km.unite), "longueur");
    assert.equal(km.unite, "mi");
    const ha = dansLeSysteme({ valeur: 100, unite: "ha" }, "imperial");
    assert.equal(dimensionDe(ha.unite), "surface");
    assert.equal(ha.unite, "acre");
  });

  it("un domaine s'écrit dans l'un ou l'autre système", () => {
    assert.equal(mesureDans({ valeur: 358.3, unite: "km" }, "metrique"), "358,3 km");
    assert.equal(mesureDans({ valeur: 358.3, unite: "km" }, "imperial"), "222,6 mi");
    assert.equal(mesureDans({ valeur: 2152, unite: "ha" }, "imperial"), "5 318 acres");
  });

  it("une altitude se dit en mètres ou en pieds, jamais en kilomètres", () => {
    assert.equal(altitude(1620), "1 620 m");
    assert.equal(altitude(1620, "imperial"), "5 315 ft");
    assert.equal(altitude(null), "–");
  });
});
