/**
 * Ce que les filtres du monde doivent tenir.
 *
 * Une seule idée en dessous de toutes ces assertions : **une valeur absente
 * n'est pas un zéro.** Un seuil l'écarte, un tri la range en dernier, un
 * dénivelé ne se calcule pas à moitié, et le filtre de couleur ne garde que ce
 * qui est connu. Chaque fois qu'on contourne cette règle, on invente une
 * mesure — et un écran qui invente ment mieux qu'il n'informe.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Repartition } from "./couleurs.ts";
import {
  AUCUN_FILTRE,
  chercher,
  denivele,
  filtresActifs,
  passeFiltres,
  SEUILS_MONDE,
  trier,
} from "./filtres.ts";
import { domainesPays, type DomaineMonde } from "./monde.ts";

/** Un domaine minimal : tout ce qui n'est pas dit est absent, comme dans le
 *  référentiel lui-même. */
function domaine(p: Partial<DomaineMonde> & { id: string }): DomaineMonde {
  return {
    nom: p.id,
    pays: ["FR"],
    region: null,
    iso3166_2: null,
    localite: null,
    lat: 45,
    lon: 6,
    km: null,
    n: null,
    nOther: null,
    lifts: null,
    counts: null,
    kms: null,
    minM: null,
    maxM: null,
    sites: [],
    wikidata: null,
    sources: [],
    ...p,
  };
}

const MESURE: Repartition = {
  pct: { vert: 10, bleu: 40, rouge: 40, noir: 10 },
  source: "openskimap",
  partage: "mesure",
  partVerte: null,
  partVerteDomaines: null,
};

describe("le dénivelé se calcule, ou ne se calcule pas", () => {
  it("il faut les deux altitudes", () => {
    assert.equal(denivele(domaine({ id: "a", minM: 1200, maxM: 2800 })), 1600);
    assert.equal(denivele(domaine({ id: "b", maxM: 2800 })), null);
    assert.equal(denivele(domaine({ id: "c", minM: 1200 })), null);
    assert.equal(denivele(domaine({ id: "d" })), null);
  });

  it("un sommet seul ne vaut pas un dénivelé égal au sommet", () => {
    // Le piège de `(maxM ?? 0) - (minM ?? 0)` : il rendrait 2 800 m de
    // dénivelé, soit davantage que la Grave, pour un domaine dont on ne sait
    // rien du bas.
    const d = domaine({ id: "piege", maxM: 2800 });
    assert.notEqual(denivele(d), 2800);
    assert.equal(denivele(d), null);
  });
});

describe("un seuil porte sur une valeur mesurée", () => {
  it("le non relevé est écarté, pas compté pour zéro", () => {
    const sansKm = domaine({ id: "sans" });
    const avecKm = domaine({ id: "avec", km: 40 });
    assert.equal(passeFiltres(sansKm, { ...AUCUN_FILTRE, km: 10 }), false);
    assert.equal(passeFiltres(avecKm, { ...AUCUN_FILTRE, km: 10 }), true);
  });

  it("sans seuil, le non relevé reste dans la liste", () => {
    // C'est l'autre moitié de la règle : on écarte quand on filtre, jamais
    // d'office. Un domaine sans mesure existe.
    assert.equal(passeFiltres(domaine({ id: "sans" }), AUCUN_FILTRE), true);
  });

  it("un zéro relevé est un zéro, et il ne passe pas un seuil", () => {
    assert.equal(passeFiltres(domaine({ id: "z", km: 0 }), { ...AUCUN_FILTRE, km: 10 }), false);
    assert.equal(passeFiltres(domaine({ id: "z", km: 0 }), AUCUN_FILTRE), true);
  });

  it("le dénivelé filtre sur le calcul, pas sur une moitié de couple", () => {
    const f = { ...AUCUN_FILTRE, denivM: 1000 };
    assert.equal(passeFiltres(domaine({ id: "a", minM: 1000, maxM: 2500 }), f), true);
    assert.equal(passeFiltres(domaine({ id: "b", maxM: 2500 }), f), false);
  });
});

describe("les couleurs se filtrent sur ce qui est connu", () => {
  const parts = new Map<string, Repartition>([["connu", MESURE]]);

  it("« seulement les domaines dont la répartition est connue »", () => {
    const f = { ...AUCUN_FILTRE, avecCouleurs: true };
    assert.equal(passeFiltres(domaine({ id: "connu" }), f, parts), true);
    assert.equal(passeFiltres(domaine({ id: "inconnu" }), f, parts), false);
  });

  it("un seuil de noir écarte le domaine sans répartition", () => {
    // Et non : « il a 0 % de noir ». On ne sait pas ce qu'il a.
    const f = { ...AUCUN_FILTRE, noirPct: 5 };
    assert.equal(passeFiltres(domaine({ id: "connu" }), f, parts), true);
    assert.equal(passeFiltres(domaine({ id: "inconnu" }), f, parts), false);
  });

  it("sans table de répartitions, les critères de couleur n'inventent rien", () => {
    const f = { ...AUCUN_FILTRE, avecCouleurs: true };
    assert.equal(passeFiltres(domaine({ id: "connu" }), f), false);
  });
});

describe("le compteur de filtres actifs", () => {
  it("compte les seuils posés et la bascule", () => {
    assert.equal(filtresActifs(AUCUN_FILTRE), 0);
    assert.equal(filtresActifs({ ...AUCUN_FILTRE, km: 20 }), 1);
    assert.equal(filtresActifs({ ...AUCUN_FILTRE, km: 20, avecCouleurs: true }), 2);
  });

  it("chaque seuil de la table est comptable", () => {
    for (const s of SEUILS_MONDE) {
      assert.equal(filtresActifs({ ...AUCUN_FILTRE, [s.k]: s.step }), 1, s.k);
    }
  });
});

describe("le tri range le non mesuré en dernier, dans les deux sens", () => {
  it("les domaines sans la valeur triée passent après", () => {
    const lot = [
      domaine({ id: "sans", nom: "Sans" }),
      domaine({ id: "petit", nom: "Petit", km: 5 }),
      domaine({ id: "grand", nom: "Grand", km: 200 }),
    ];
    assert.deepEqual(
      trier(lot, "km").map((d) => d.id),
      ["grand", "petit", "sans"],
    );
  });

  it("un non mesuré ne se glisse jamais en tête", () => {
    // C'est ce que ferait `(km ?? 0)` sur un tri décroissant inversé, et c'est
    // ce qui ferait passer un téléski de village pour le plus grand domaine.
    const lot = [domaine({ id: "sans" }), domaine({ id: "mesure", km: 1 })];
    assert.equal(trier(lot, "km")[0]?.id, "mesure");
    assert.equal(trier(lot, "remontees")[0]?.id, "mesure");
  });

  it("le tri par nom suit l'alphabet français", () => {
    const lot = [domaine({ id: "z", nom: "Zermatt" }), domaine({ id: "e", nom: "Élan" })];
    assert.deepEqual(
      trier(lot, "nom").map((d) => d.nom),
      ["Élan", "Zermatt"],
    );
  });
});

describe("la recherche", () => {
  const lot = [
    domaine({ id: "1", nom: "Val d'Isère" }),
    domaine({ id: "2", nom: "Zermatt", region: "Valais" }),
    domaine({ id: "3", nom: "Niseko United", localite: "Hokkaido" }),
  ];

  it("ignore les accents, la casse et l'apostrophe", () => {
    assert.equal(chercher(lot, "val d isere")[0]?.id, "1");
    assert.equal(chercher(lot, "VAL D'ISERE")[0]?.id, "1");
  });

  it("porte aussi sur la région et la localité", () => {
    assert.equal(chercher(lot, "valais")[0]?.id, "2");
    assert.equal(chercher(lot, "hokkaido")[0]?.id, "3");
  });

  it("une recherche vide rend tout le lot", () => {
    assert.equal(chercher(lot, "   ").length, 3);
  });
});

describe("sur le référentiel réel", () => {
  it("les filtres tournent sur un vrai pays sans rien inventer", async () => {
    const at = await domainesPays("AT");
    assert.ok(at.length > 100, "l'Autriche porte des centaines de domaines");

    // Le tri décroissant met en tête un domaine mesuré, et le non mesuré en
    // queue — sur des données réelles, où les deux existent.
    const parKm = trier(at, "km");
    assert.notEqual(parKm[0]?.km, null);
    const sansKm = at.filter((d) => d.km == null);
    if (sansKm.length) {
      assert.equal(parKm[parKm.length - 1]?.km, null);
    }

    // Un seuil ne garde que du mesuré, jamais un `null` requalifié en zéro.
    const grands = at.filter((d) => passeFiltres(d, { ...AUCUN_FILTRE, km: 50 }));
    assert.ok(grands.length > 0);
    assert.ok(grands.every((d) => d.km != null && d.km >= 50));
  });
});
