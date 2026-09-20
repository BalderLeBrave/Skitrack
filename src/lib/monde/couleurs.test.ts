/**
 * Ce que la chaîne des sources doit tenir.
 *
 * Deux exigences, et la seconde compte autant que la première : la meilleure
 * source disponible l'emporte, et **la valeur dit toujours d'où elle vient**.
 * Une estimation qui se fait passer pour une mesure est pire qu'une absence,
 * parce qu'une absence se voit.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  depuisOpenSkiMap,
  depuisSkiinfo,
  depuisSkiresort,
  mentionSource,
  partVerteDuPays,
  repartition,
} from "./couleurs.ts";
import PART from "./data/partVerte.json" with { type: "json" };

describe("la part du vert se mesure, elle ne se suppose pas", () => {
  it("les conventions nationales sortent des données", () => {
    // L'Autriche, la Suisse, l'Italie et l'Allemagne classent en bleu, rouge
    // et noir : leur part de vert est résiduelle. La France et les pays
    // nordiques emploient le vert largement.
    assert.ok(partVerteDuPays("AT").part < 0.1, "Autriche");
    assert.ok(partVerteDuPays("CH").part < 0.1, "Suisse");
    assert.ok(partVerteDuPays("FR").part > 0.25, "France");
    assert.ok(partVerteDuPays("NO").part > 0.45, "Norvège");
    // Et l'écart entre les deux extrêmes est d'un ordre de grandeur, ce qui
    // condamne tout partage uniforme.
    assert.ok(partVerteDuPays("NO").part / partVerteDuPays("AT").part > 5);
  });

  it("chaque part dit sur combien de domaines elle repose", () => {
    for (const [cc, e] of Object.entries(PART.pays)) {
      assert.ok(e.domaines >= 10, `${cc} : ${e.domaines} domaines`);
      assert.ok(e.part >= 0 && e.part <= 1, `${cc} : part ${e.part}`);
    }
  });

  it("un pays sans échantillon retombe sur la part mondiale, et le dit", () => {
    const inconnu = partVerteDuPays("ZZ");
    assert.deepEqual(inconnu, PART.monde);
    assert.equal(partVerteDuPays(null), PART.monde);
  });
});

describe("l'ordre des sources", () => {
  const osm = { green: 10, blue: 30, red: 40, black: 20 };
  const ski = { vertes: 5, bleues: 25, rouges: 50, noires: 20 };
  const sr = { faciles: 40, moyennes: 40, difficiles: 20 };

  it("OpenSkiMap l'emporte sur les deux autres", () => {
    const r = repartition({ openskimap: osm, skiinfo: ski, skiresort: sr, pays: "FR" })!;
    assert.equal(r.source, "openskimap");
    assert.equal(r.partage, "mesure");
    assert.deepEqual(r.pct, { vert: 10, bleu: 30, rouge: 40, noir: 20 });
  });

  it("Skiinfo prend le relais quand OpenSkiMap n'a rien", () => {
    const r = repartition({ openskimap: null, skiinfo: ski, skiresort: sr, pays: "FR" })!;
    assert.equal(r.source, "skiinfo");
    assert.equal(r.partage, "mesure");
  });

  it("skiresort ne vient qu'en dernier, et se déclare estimé", () => {
    const r = repartition({ skiresort: sr, pays: "FR" })!;
    assert.equal(r.source, "skiresort");
    assert.equal(r.partage, "estime");
    assert.ok(r.partVerte != null && r.partVerteDomaines != null);
  });

  it("aucune source, aucune répartition — et surtout pas de zéros", () => {
    assert.equal(repartition({ pays: "FR" }), null);
    assert.equal(repartition({ openskimap: { green: 0, blue: 0, red: 0, black: 0 } }), null);
    assert.equal(depuisSkiinfo(null), null);
    assert.equal(depuisSkiresort({ faciles: 0, moyennes: 0, difficiles: 0 }, "FR"), null);
  });
});

describe("le partage des pistes faciles", () => {
  const sr = { faciles: 100, moyennes: 0, difficiles: 0 };

  it("suit le pays, et non une moitié arbitraire", () => {
    const fr = depuisSkiresort(sr, "FR")!;
    const at = depuisSkiresort(sr, "AT")!;
    assert.ok(fr.pct.vert > at.pct.vert * 4, `FR ${fr.pct.vert} % contre AT ${at.pct.vert} %`);
    // Nulle part le partage ne tombe sur cinquante-cinquante.
    assert.notEqual(fr.pct.vert, 50);
    assert.notEqual(at.pct.vert, 50);
  });

  it("ne touche ni au rouge ni au noir, qui restent mesurés", () => {
    const r = depuisSkiresort({ faciles: 50, moyennes: 30, difficiles: 20 }, "AT")!;
    assert.equal(r.pct.rouge, 30);
    assert.equal(r.pct.noir, 20);
    assert.equal(r.pct.vert + r.pct.bleu, 50);
  });

  it("la mention dit au lecteur ce qu'il regarde", () => {
    assert.equal(mentionSource(depuisOpenSkiMap({ green: 1, blue: 2, red: 3, black: 4 })), "relevé OpenSkiMap");
    const m = mentionSource(depuisSkiresort(sr, "AT"))!;
    assert.match(m, /skiresort\.fr/);
    assert.match(m, /séparés à \d+ %/);
    assert.match(m, /mesurée sur \d+ domaines/);
    assert.equal(mentionSource(null), null);
  });
});
