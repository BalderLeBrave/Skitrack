/**
 * Le socle géographique se vérifie contre les normes, pas contre lui-même.
 *
 * Trois des valeurs de `pays.ts` sont contrôlables sans réseau, parce que
 * l'ICU embarqué par Node porte CLDR, la liste ISO 4217 et la base IANA :
 * un nom de pays, un code de devise et un fuseau se comparent donc à une
 * source plutôt qu'à la mémoire de celui qui les a écrits. C'est ce qui a
 * rattrapé la devise de la Bulgarie, passée à l'euro le 1er janvier 2026.
 *
 * Ce qui ne se vérifie pas ici : que la liste des pays soit complète. Elle est
 * provisoire jusqu'à la phase 2, qui la confrontera au référentiel mondial.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cadreValide, CONTINENTS, continentById, type Cadre } from "./continents.ts";
import { PAYS, paysByCode, paysDuContinent } from "./pays.ts";

const nomFr = new Intl.DisplayNames(["fr"], { type: "region" });
const nomEn = new Intl.DisplayNames(["en"], { type: "region" });
const DEVISES_ISO = new Set(Intl.supportedValuesOf("currency"));

/** Un fuseau est valable si `Intl` l'accepte, pas s'il figure dans la liste.
 *  `Intl.supportedValuesOf` ne rend que les noms canoniques de l'ICU, qui sont
 *  les anciens : « Europe/Kyiv », « Asia/Kolkata » et
 *  « America/Argentina/Buenos_Aires » en sont absents alors que les trois sont
 *  acceptés et ramenés à « Europe/Kiev », « Asia/Calcutta » et
 *  « America/Buenos_Aires ». Ce sont les noms modernes qui sont écrits dans
 *  `pays.ts`, parce que ce sont ceux de la base IANA et des services météo. */
function fuseauAccepte(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("fr", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

describe("continents", () => {
  it("les six continents attendus, sans doublon d'identifiant", () => {
    assert.equal(CONTINENTS.length, 6);
    const ids = CONTINENTS.map((c) => c.id);
    assert.deepEqual(
      [...ids].sort(),
      ["afrique", "amerique-nord", "amerique-sud", "asie", "europe", "oceanie"],
    );
    assert.equal(new Set(ids).size, ids.length);
  });

  it("chacun porte un nom dans les deux langues et un cadrage valide", () => {
    for (const c of CONTINENTS) {
      assert.ok(c.nomFr.length > 0, `${c.id} sans nom français`);
      assert.ok(c.nomEn.length > 0, `${c.id} sans nom anglais`);
      assert.ok(cadreValide(c.cadre), `${c.id} : cadrage invalide ${JSON.stringify(c.cadre)}`);
    }
  });

  it("`continentById` rend le continent, et rien pour un identifiant inconnu", () => {
    assert.equal(continentById("europe")?.nomFr, "Europe");
    assert.equal(continentById("atlantide"), undefined);
  });
});

describe("cadreValide", () => {
  const cas: [string, Cadre, boolean][] = [
    ["cadrage ordinaire", [5.97, 45.83, 10.45, 47.78], true],
    ["ouest à l'est de l'est", [10, 45, 6, 47], false],
    ["sud au nord du nord", [6, 47, 10, 45], false],
    ["hors des bornes du globe", [-181, 45, 10, 47], false],
    ["hauteur nulle", [6, 45, 10, 45], false],
    ["valeur non finie", [Number.NaN, 45, 10, 47], false],
  ];
  for (const [quoi, cadre, attendu] of cas) {
    it(quoi, () => assert.equal(cadreValide(cadre), attendu));
  }
});

describe("pays", () => {
  it("aucun code en double", () => {
    const codes = PAYS.map((p) => p.code);
    assert.equal(new Set(codes).size, codes.length);
  });

  it("chaque code est un ISO 3166-1 alpha-2 que l'ICU reconnaît", () => {
    for (const p of PAYS) {
      assert.match(p.code, /^[A-Z]{2}$/, `${p.code} n'est pas au format alpha-2`);
      // `DisplayNames` rend le code lui-même quand il ne connaît pas la région.
      assert.notEqual(nomFr.of(p.code), p.code, `${p.code} : région inconnue de l'ICU`);
    }
  });

  it("les noms sont ceux de CLDR, dans les deux langues", () => {
    for (const p of PAYS) {
      assert.equal(p.nomFr, nomFr.of(p.code), `${p.code} : nom français hors CLDR`);
      assert.equal(p.nomEn, nomEn.of(p.code), `${p.code} : nom anglais hors CLDR`);
    }
  });

  it("chaque devise est un code ISO 4217", () => {
    for (const p of PAYS) {
      assert.match(p.devise, /^[A-Z]{3}$/, `${p.code} : devise mal formée`);
      assert.ok(DEVISES_ISO.has(p.devise), `${p.code} : ${p.devise} hors ISO 4217`);
    }
  });

  it("chaque fuseau est accepté par la base IANA", () => {
    for (const p of PAYS) {
      assert.ok(p.fuseau.includes("/"), `${p.code} : ${p.fuseau} n'est pas un identifiant de zone`);
      assert.ok(fuseauAccepte(p.fuseau), `${p.code} : ${p.fuseau} refusé`);
    }
  });

  it("chaque pays est rattaché à un continent qui existe", () => {
    for (const p of PAYS) {
      assert.ok(continentById(p.continent), `${p.code} : continent « ${p.continent} » inconnu`);
    }
  });

  it("chaque cadrage est valide", () => {
    for (const p of PAYS) {
      assert.ok(cadreValide(p.cadre), `${p.code} : cadrage invalide ${JSON.stringify(p.cadre)}`);
    }
  });

  it("chaque pays nomme son découpage régional dans les deux langues", () => {
    for (const p of PAYS) {
      assert.ok(p.decoupageFr.length > 0, `${p.code} sans découpage français`);
      assert.ok(p.decoupageEn.length > 0, `${p.code} sans découpage anglais`);
    }
  });

  it("les six continents sont peuplés, et la somme rend la liste entière", () => {
    let total = 0;
    for (const c of CONTINENTS) {
      const n = paysDuContinent(c.id).length;
      assert.ok(n > 0, `${c.id} n'a aucun pays`);
      total += n;
    }
    assert.equal(total, PAYS.length);
  });

  it("`paysDuContinent` trie par nom français", () => {
    const noms = paysDuContinent("europe").map((p) => p.nomFr);
    assert.deepEqual(noms, [...noms].sort((a, b) => a.localeCompare(b, "fr")));
  });

  it("`paysByCode` accepte la minuscule et rejette l'inconnu", () => {
    assert.equal(paysByCode("CH")?.nomFr, "Suisse");
    assert.equal(paysByCode("ch")?.nomFr, "Suisse");
    assert.equal(paysByCode("XX"), undefined);
    assert.equal(paysByCode(null), undefined);
  });

  it("la France garde le massif comme découpage, et l'euro", () => {
    const fr = paysByCode("FR");
    assert.equal(fr?.decoupageFr, "massif");
    assert.equal(fr?.devise, "EUR");
    assert.equal(fr?.continent, "europe");
  });

  it("les pays transcontinentaux portent le rattachement documenté", () => {
    // La consigne tranche par l'emplacement des stations. Le résultat n'est pas
    // celui de la convention politique pour ces trois-là, et ce test est là
    // pour qu'un changement soit délibéré plutôt que discret.
    assert.equal(paysByCode("TR")?.continent, "asie");
    assert.equal(paysByCode("GE")?.continent, "asie");
    assert.equal(paysByCode("KZ")?.continent, "asie");
  });

  it("la Russie est absente, et c'est une décision, pas un oubli", () => {
    // Écartée du référentiel le 21 septembre 2026. La règle de cette liste est
    // « les pays ayant au moins une station retenue » : sans station, pas de
    // fiche. L'exclusion elle-même vit dans `scripts/build-monde.py`, et
    // `monde.test.ts` vérifie que l'index en publie le compte.
    assert.equal(paysByCode("RU"), undefined);
  });
});
