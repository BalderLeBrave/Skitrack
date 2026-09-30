import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cumulM,
  ecartKm,
  echelle,
  estDamee,
  lignePistes,
  parts,
  portionStation,
  regrouper,
  secteurDe,
  trier,
  type AireDetail,
  type DetailDomaine,
  type TronconDetail,
} from "./pistesDetail.ts";

const t = (o: Partial<TronconDetail>): TronconDetail => ({
  nom: null,
  ref: null,
  difficulte: null,
  longueurM: null,
  departM: null,
  arriveeM: null,
  hautM: null,
  basM: null,
  damage: null,
  eclairee: null,
  surface: false,
  bas: null,
  a: [0],
  ...o,
});

describe("détail des pistes : regroupement des tronçons", () => {
  it("réunit les tronçons d'un même nom et d'une même couleur, accents et casse compris", () => {
    const { pistes } = regrouper([
      t({ nom: "Remuaz Bas", difficulte: "intermediate", longueurM: 300, departM: 2005, arriveeM: 1950, hautM: 2005, basM: 1950 }),
      t({ nom: "remuaz bas", difficulte: "intermediate", longueurM: 680, departM: 1950, arriveeM: 1841, hautM: 1950, basM: 1841 }),
      t({ nom: "Rémuaz Bas", difficulte: "easy", longueurM: 100 }),
    ]);
    assert.equal(pistes.length, 2);
    const rouge = pistes.find((p) => p.couleur === "red")!;
    assert.deepEqual(
      [rouge.troncons, rouge.longueurM, rouge.departM, rouge.arriveeM, rouge.denivelleM],
      [2, 980, 2005, 1841, 164],
    );
  });

  it("garde les tronçons sans nom à part, un par un", () => {
    const { pistes, sansNom } = regrouper([t({ difficulte: "easy", longueurM: 50 }), t({ nom: "  ", longueurM: 80 }), t({ nom: "A", difficulte: "easy" })]);
    assert.equal(pistes.length, 1);
    assert.deepEqual(sansNom.map((p) => p.longueurM), [80, 50]);
  });

  it("une surface n'a pas de longueur, et ne compte pas zéro", () => {
    const { pistes } = regrouper([t({ nom: "Snowpark", surface: true, hautM: 2100, basM: 2050 })]);
    assert.equal(pistes[0]!.longueurM, null);
    assert.equal(pistes[0]!.denivelleM, 50);
  });
});

describe("détail des pistes : couleurs, damage, éclairage", () => {
  it("passe par difficultyToColor : expert, freeride et l'absence vont dans « autres »", () => {
    const { pistes } = regrouper(
      ["novice", "easy", "intermediate", "advanced", "expert", "freeride", null].map((d, i) => t({ nom: `P${i}`, difficulte: d })),
    );
    assert.deepEqual(
      pistes.map((p) => p.couleur),
      ["green", "blue", "red", "black", "other", "other", "other"],
    );
  });

  it("damée : bosses et hors-piste ne le sont pas, l'absence n'est rien", () => {
    assert.deepEqual(["classic", "classic+skating", "mogul", "backcountry", null].map(estDamee), [true, true, false, false, null]);
    const { pistes } = regrouper([t({ nom: "A", damage: "classic" }), t({ nom: "A", damage: null }), t({ nom: "B", eclairee: false }), t({ nom: "B", eclairee: null })]);
    assert.deepEqual(pistes.map((p) => [p.damee, p.eclairee]), [[true, null], [null, null]]);
  });
});

describe("détail des pistes : parts et tri", () => {
  it("les pour cent somment exactement à 100", () => {
    const { pistes } = regrouper(["novice", "easy", "easy", "intermediate", "advanced", "advanced", "freeride"].map((d, i) => t({ nom: `P${i}`, difficulte: d })));
    const p = parts(pistes);
    assert.equal(Object.values(p).reduce((s, x) => s + x.pct, 0), 100);
    assert.deepEqual([p.green.n, p.blue.n, p.red.n, p.black.n, p.other.n], [1, 2, 1, 2, 1]);
    assert.deepEqual(parts([]).green, { n: 0, pct: 0 });
  });

  it("trie par longueur, les valeurs absentes en fin de liste dans les deux sens", () => {
    const { pistes } = regrouper([t({ nom: "A", longueurM: 300 }), t({ nom: "B" }), t({ nom: "C", longueurM: 900 })]);
    assert.deepEqual(trier(pistes, "longueur", "desc").map((p) => p.nom), ["C", "A", "B"]);
    assert.deepEqual(trier(pistes, "longueur", "asc").map((p) => p.nom), ["A", "C", "B"]);
  });
});

describe("détail des pistes : échelle et écart", () => {
  it("osm_absent et osm_vide : pas de détail ; grain_domaine, km_court, segments : un bandeau", () => {
    assert.deepEqual(echelle("osm_absent", null, "Nistos"), { detail: false, bandeau: null });
    assert.deepEqual(echelle("osm_vide", "X", "Y"), { detail: false, bandeau: null });
    assert.equal(echelle("km_court", "Brévent/Flégère (Chamonix)", "Chamonix").bandeau, "Tracés du domaine Brévent/Flégère (Chamonix), pas de Chamonix entière.");
    assert.match(echelle("grain_domaine", "Espace Killy", "Tignes").bandeau ?? "", /déborde Tignes/);
    assert.deepEqual(echelle("ok", "Gresse en Vercors", "Gresse-en-Vercors"), { detail: true, bandeau: null });
  });

  it("l'écart de km se dit au-delà de 10 %, sans rien corriger", () => {
    assert.equal(ecartKm(105_000, 100), null);
    const e = ecartKm(115_400, 150)!;
    assert.equal(Math.round(e.ecart * 100), -23);
    assert.equal(e.texte, "Les tracés cumulent 115,4 km, Skiinfo en annonce 150 (−23 %).");
    assert.equal(ecartKm(1000, null), null);
    assert.equal(cumulM([t({ longueurM: 400 }), t({ surface: true }), t({ longueurM: 600 })]), 1000);
  });
});

describe("détail des pistes : station et domaine", () => {
  // Un domaine de tête qui contient deux domaines publiés, et un domaine
  // partagé par deux stations sans secteur publié.
  const aires: AireDetail[] = [
    { id: "3v", nom: "Les Trois Vallées", n: 100 },
    { id: "vto", nom: "Val Thorens - Orelle", n: 40 },
    { id: "vt", nom: "Val Thorens", n: 30 },
    { id: "men", nom: "Les Ménuires", n: 25 },
  ];
  const detail = (troncons: TronconDetail[], a = aires): DetailDomaine => ({
    domaine: a[0]!.id,
    nom: a[0]!.nom,
    le: "2026-09-22",
    source: "test",
    aires: a,
    troncons,
  });

  it("le secteur est le plus petit domaine sous celui du tableau", () => {
    const x = t({ a: [0, 1, 2] });
    assert.equal(secteurDe(x, aires, "3v"), "Val Thorens");
    assert.equal(secteurDe(x, aires, "vt"), null);
    assert.equal(secteurDe(t({ a: [0] }), aires, "3v"), null);
  });

  it("deux pistes de même nom dans deux secteurs restent deux pistes", () => {
    const ts = [t({ nom: "Verte", difficulte: "easy", a: [0, 2] }), t({ nom: "Verte", difficulte: "easy", a: [0, 3] })];
    assert.equal(regrouper(ts).pistes.length, 1);
    const { pistes } = regrouper(ts, (x) => secteurDe(x, aires, "3v"));
    assert.deepEqual(pistes.map((p) => p.secteur).sort(), ["Les Ménuires", "Val Thorens"]);
  });

  it("une station seule dans son domaine publié garde toutes ses pistes, et rien d'autre", () => {
    const d = detail([t({ nom: "A", a: [0, 1, 2] }), t({ nom: "B", a: [0, 3] }), t({ nom: "C", a: [0, 1] })]);
    const r = portionStation(d, "val-thorens", { fichier: "3v", aire: "vt", voisines: ["val-thorens"] }, { "val-thorens": "vt" }, []);
    assert.deepEqual([r.troncons.map((x) => x.nom), r.proximite, r.nonRattaches], [["A"], 0, 0]);
  });

  it("le domaine publié d'une voisine lui revient, le reste va à la plus proche", () => {
    const tv: AireDetail[] = [
      { id: "tv", nom: "Tignes - Val d'Isère", n: 50 },
      { id: "chap", nom: "Sous-domaine", n: 5 },
    ];
    const tignes = { id: "tignes", lat: 45.469, lon: 6.906 };
    const valdi = { id: "val-disere", lat: 45.448, lon: 6.98 };
    const d = detail(
      [
        t({ nom: "Près de Tignes", bas: [6.905, 45.47], a: [0] }),
        t({ nom: "Près de Val d'Isère", bas: [6.979, 45.449], a: [0] }),
        t({ nom: "Voisine publiée", bas: [6.905, 45.47], a: [0, 1] }),
        t({ nom: "Sans position", a: [0] }),
      ],
      tv,
    );
    const entree = { fichier: "tv", aire: "tv", voisines: ["autre", "tignes", "val-disere"] };
    const aireDe = { tignes: "tv", "val-disere": "tv", autre: "chap" };
    const r = portionStation(d, "tignes", entree, aireDe, [tignes, valdi, { id: "autre", lat: 0, lon: 0 }]);
    assert.deepEqual([r.troncons.map((x) => x.nom), r.proximite, r.nonRattaches], [["Près de Tignes"], 1, 1]);
    const v = portionStation(d, "val-disere", entree, aireDe, [tignes, valdi]);
    assert.deepEqual(v.troncons.map((x) => x.nom), ["Près de Val d'Isère"]);
  });

  it("un domaine absent du fichier ne donne rien", () => {
    const r = portionStation(detail([t({ nom: "A" })]), "x", { fichier: "3v", aire: "inconnu", voisines: ["x"] }, {}, []);
    assert.equal(r.troncons.length, 0);
  });
});

describe("détail des pistes : ligne du comparateur", () => {
  it("dit le nombre de pistes et les km de Skiinfo, avec l'échelle", () => {
    assert.equal(lignePistes({ n: 86, km: 150, grain: "station" }), "86\u00a0pistes · 150\u00a0km (Skiinfo, station)");
    assert.equal(lignePistes({ n: 1, km: 2.5, grain: "valley" }), "1\u00a0piste · 2,5\u00a0km (Skiinfo, vallée)");
    assert.equal(lignePistes({ n: null, km: 40, grain: "station" }), "40\u00a0km (Skiinfo, station)");
    assert.equal(lignePistes({ n: null, km: null, grain: "station" }), null);
    assert.equal(lignePistes(undefined), null);
  });
});
