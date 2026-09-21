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
  mentionRattachement,
  mentionSource,
  partVerteDuPays,
  releveRattachements,
  repartition,
  repartitionDuDomaine,
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

describe("le recours par rattachement", () => {
  it("un domaine mesuré par OpenSkiMap garde sa mesure", async () => {
    // Le rattachement est un recours, pas un arbitre : une fiche voisine ne
    // remplace jamais un relevé de tronçons.
    const r = repartitionDuDomaine(
      { id: "x", pays: ["AT"], counts: { green: 1, blue: 8, red: 8, black: 3 } },
      {
        s: "skiinfo",
        ref: "ailleurs",
        nom: "Ailleurs",
        km: 0.4,
        skiinfo: { vertes: 90, bleues: 5, rouges: 3, noires: 2 },
      },
    );
    assert.equal(r?.source, "openskimap");
    assert.equal(r?.partage, "mesure");
  });

  it("sans mesure, le rattachement Skiinfo sert, et se dit tel quel", () => {
    const r = repartitionDuDomaine(
      { id: "x", pays: ["AT"], counts: null },
      {
        s: "skiinfo",
        ref: "voisin",
        nom: "Voisin",
        km: 0.4,
        skiinfo: { vertes: 10, bleues: 40, rouges: 40, noires: 10 },
      },
    );
    assert.equal(r?.source, "skiinfo");
    assert.equal(r?.partage, "mesure");
  });

  it("le rattachement skiresort reste une estimation, et le dit", () => {
    const r = repartitionDuDomaine(
      { id: "x", pays: ["AT"], counts: null },
      {
        s: "skiresort",
        ref: "voisin",
        nom: "Voisin",
        km: 2.1,
        skiresort: { faciles: 10, moyennes: 20, difficiles: 5 },
      },
    );
    assert.equal(r?.source, "skiresort");
    assert.equal(r?.partage, "estime");
    // La part employée est celle du pays du domaine, pas une moitié.
    assert.equal(r?.partVerte, partVerteDuPays("AT").part);
  });

  it("aucune source, aucune répartition — et surtout pas un zéro", () => {
    assert.equal(repartitionDuDomaine({ id: "x", pays: ["AT"], counts: null }, undefined), null);
  });

  it("la mention dit la fiche et la distance", () => {
    const m = mentionRattachement({
      s: "skiinfo",
      ref: "zermatt",
      nom: "Zermatt",
      km: 2.14,
      skiinfo: { vertes: 0, bleues: 25, rouges: 50, noires: 25 },
    });
    assert.ok(m?.includes("Zermatt"));
    assert.ok(m?.includes("2,1"), `la distance doit paraître : ${m}`);
    assert.ok(m?.includes("Skiinfo"));
  });

  it("un rattachement au même point ne s'annonce pas « à 0 km »", () => {
    const m = mentionRattachement({
      s: "skiresort",
      ref: "x",
      nom: "X",
      km: 0.02,
      skiresort: { faciles: 1, moyennes: 1, difficiles: 1 },
    });
    assert.ok(m?.includes("au même point"), m ?? "");
  });
});

describe("le fichier de rattachement, tel qu'il est écrit", () => {
  it("ne porte que des domaines qu'OpenSkiMap ne mesure pas", async () => {
    const releve = await releveRattachements();
    const n = Object.keys(releve.rattachements).length;
    assert.equal(n, releve.rattachesSkiinfo + releve.rattachesSkiresort);
    // Quatre cent et quelques depuis que le référentiel s'arrête aux domaines
    // nommés : le recours servait surtout aux téléskis sans appellation, qui
    // n'y sont plus.
    assert.ok(n > 300, `le recours doit servir : ${n}`);
  });

  it("aucun rattachement au-delà du rayon annoncé", () => {
    // Le rayon est la seule chose que la jointure affirme. Un rattachement
    // hors rayon serait une supposition muette.
    return releveRattachements().then((releve) => {
      for (const [id, r] of Object.entries(releve.rattachements)) {
        assert.ok(r.km <= releve.rayonKm, `${id} rattaché à ${r.km} km`);
      }
    });
  });

  it("les couleurs du référentiel passent les neuf dixièmes", async () => {
    const releve = await releveRattachements();
    const couverts =
      releve.mesuresOpenSkiMap + releve.rattachesSkiinfo + releve.rattachesSkiresort;
    const part = couverts / releve.domaines;
    assert.ok(part > 0.88, `couverture ${(part * 100).toFixed(1)} %`);
    // Et l'absence reste une absence : elle n'est pas comblée pour faire 100 %.
    assert.ok(couverts < releve.domaines, "il reste des domaines sans couleur, et c'est écrit");
  });
});
