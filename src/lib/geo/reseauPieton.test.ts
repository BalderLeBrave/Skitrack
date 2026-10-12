import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  champDepuisGares,
  cheminVersGare,
  construireReseau,
  empriseAutour,
  emprisesAutour,
  fichierValide,
  garesAutour,
  lireReseau,
  marcheVersGare,
  metres,
  requeteOverpass,
  voiePietonne,
  type ElementOverpass,
  type GareSource,
} from "./reseauPieton.ts";

/*
 * Le village de l'essai, autour de 45° N, 6° E (1e-4 degré : 11 m en
 * latitude, 7,9 m en longitude).
 *
 *   4 ─────────────── 3        L, le logement, juste sous la rue 4–3 ;
 *   ┆ (piste)         │        la gare G, en bas à gauche. Entre les deux,
 *   ┆                 │        un torrent : pas de passage, sauf la piste
 *   G ··· 1 ───────── 2        de descente 4–5, où l'on ne marche pas.
 *
 * À vol d'oiseau, L est à 211 m de G. À pied : la rue jusqu'en 3, puis 2,
 * puis 1, puis le parvis jusqu'à G, soit 689 m.
 */
const node = (id: number, lat: number, lon: number): ElementOverpass => ({ type: "node", id, lat, lon });
const way = (id: number, nodes: number[], tags: Record<string, string>): ElementOverpass => ({
  type: "way",
  id,
  nodes,
  tags,
});

const ELEMENTS: ElementOverpass[] = [
  node(1, 45.0, 6.001),
  node(2, 45.0, 6.003),
  node(3, 45.002, 6.003),
  node(4, 45.002, 6.0),
  node(5, 45.0001, 6.0),
  node(10, 45.01, 6.02),
  node(11, 45.01, 6.021),
  node(20, 45.002, 6.0015),
  node(21, 45.0005, 6.0015),
  // Une rue en U, en deux voies qui se touchent en 3.
  way(100, [1, 2, 3], { highway: "residential", name: "Rue du Torrent" }),
  way(101, [3, 4], { highway: "footway" }),
  // La piste de descente qui coupe par le torrent : écartée.
  way(102, [4, 5], { highway: "path", "piste:type": "downhill" }),
  // Un chemin privé et une voie express qui couperaient aussi : écartés.
  way(103, [20, 21], { highway: "service", access: "private" }),
  way(104, [21, 1], { highway: "trunk" }),
  // Un sentier isolé, loin de toute gare : retiré.
  way(105, [10, 11], { highway: "path" }),
  // Une voie qui cite un nœud absent de la réponse : le nœud est ignoré.
  way(106, [999, 999], { highway: "footway" }),
];

const G: GareSource = { n: "Diable", k: "gondola", lat: 45.0, lon: 6.0, olat: 45.01, olon: 6.01 };
const L = { lat: 45.0019, lon: 6.0002 };

function bati(gares: GareSource[] = [G]) {
  const { fichier, bilan } = construireReseau({
    elements: ELEMENTS,
    gares,
    station: "essai",
    nom: "Essai",
    le: "2026-10-12",
    source: "essai",
  });
  // Le fichier passe par JSON, comme sur le disque.
  const reseau = lireReseau(JSON.parse(JSON.stringify(fichier)));
  return { fichier, bilan, reseau, champ: champDepuisGares(reseau) };
}

describe("voiePietonne", () => {
  it("garde les rues, chemins et escaliers ; écarte autoroutes et voies express", () => {
    for (const h of ["footway", "path", "steps", "residential", "service", "track", "tertiary", "corridor"]) {
      assert.equal(voiePietonne({ highway: h }), true, h);
    }
    for (const h of ["motorway", "motorway_link", "trunk", "trunk_link", "construction", "proposed"]) {
      assert.equal(voiePietonne({ highway: h }), false, h);
    }
    assert.equal(voiePietonne(undefined), false);
    assert.equal(voiePietonne({ "piste:type": "downhill" }), false);
  });
  it("écarte foot=no, l'accès privé sans permission piétonne, la route fermée l'hiver", () => {
    assert.equal(voiePietonne({ highway: "footway", foot: "no" }), false);
    assert.equal(voiePietonne({ highway: "service", access: "private" }), false);
    assert.equal(voiePietonne({ highway: "service", access: "private", foot: "yes" }), true);
    assert.equal(voiePietonne({ highway: "secondary", seasonal: "summer" }), false);
    assert.equal(voiePietonne({ highway: "secondary", motorroad: "yes" }), false);
    assert.equal(voiePietonne({ highway: "path", sac_scale: "alpine_hiking" }), false);
    assert.equal(voiePietonne({ highway: "path", sac_scale: "hiking" }), true);
  });
  it("une piste de ski n'est pas un chemin ; une route qui en porte une reste une route", () => {
    assert.equal(voiePietonne({ highway: "path", "piste:type": "downhill" }), false);
    assert.equal(voiePietonne({ highway: "track", "piste:type": "nordic;downhill" }), false);
    assert.equal(voiePietonne({ highway: "path", "piste:type": "hike" }), true);
    assert.equal(voiePietonne({ highway: "residential", "piste:type": "downhill" }), true);
  });
});

describe("emprise et requête Overpass", () => {
  it("l'emprise s'élargit de la marge, en mètres", () => {
    const b = empriseAutour([{ lat: 45, lon: 6 }], 1000)!;
    assert.ok(Math.abs(metres(45, 6, b.n, 6) - 1000) < 10);
    assert.ok(Math.abs(metres(45, 6, 45, b.e) - 1000) < 10);
    assert.equal(empriseAutour([], 1000), null);
  });
  it("une emprise par repère, avec ses seules gares proches", () => {
    const e = emprisesAutour(
      [
        { lat: 45, lon: 6 },
        { lat: 45.2, lon: 6 },
      ],
      [{ lat: 45.01, lon: 6 }],
      3000,
      0,
    );
    assert.equal(e.length, 2);
    assert.ok(e[0].n >= 45.01);
    assert.equal(e[1].n, 45.2);
  });
  it("la requête nomme les types retenus et chaque emprise", () => {
    const q = requeteOverpass([{ s: 45, o: 6, n: 45.1, e: 6.1 }]);
    assert.match(q, /^\[out:json\]/);
    assert.match(q, /\(45,6,45\.1,6\.1\)/);
    assert.match(q, /footway\|path/);
    assert.doesNotMatch(q, /motorway/);
    assert.match(q, /out body qt;$/);
  });
});

describe("garesAutour", () => {
  const pool = [
    { n: "Diable", k: "gondola", lat: 45.0, lon: 6.0 },
    { n: "Diable", k: "gondola", lat: 45.01, lon: 6.01 },
    { n: "Diable", k: "gondola", lat: 45.0, lon: 6.0 },
    { n: "Lointain", k: "chair_lift", lat: 45.5, lon: 6.0 },
  ];
  it("les gares à portée d'un repère, sans doublon, avec l'autre gare de l'appareil", () => {
    const g = garesAutour([{ lat: 45.0, lon: 6.0 }], pool, 3000);
    assert.equal(g.length, 2);
    assert.deepEqual(g[0], { n: "Diable", k: "gondola", lat: 45.0, lon: 6.0, olat: 45.01, olon: 6.01 });
    assert.equal(g[1].olat, 45.0);
  });
});

describe("construireReseau", () => {
  it("garde les voies piétonnes, branche la gare, retire le morceau sans gare", () => {
    const { fichier, bilan } = bati();
    assert.equal(bilan.voiesLues, 7);
    assert.equal(bilan.voiesRetenues, 3);
    assert.equal(bilan.gares, 1);
    assert.equal(bilan.garesNonBranchees, 0);
    assert.equal(bilan.morceauxRetires, 1);
    // Nœuds 1, 2, 3, 4 et la gare : le sentier isolé est parti.
    assert.equal(fichier.n.length / 2, 5);
    assert.equal(fichier.g[0].n, "Diable");
    assert.ok(fichierValide(fichier));
  });
  it("une gare trop loin de toute voie n'est pas branchée", () => {
    const loin = { ...G, n: "Sommet", lat: 45.05, lon: 6.05 };
    const { bilan, fichier } = bati([G, loin]);
    assert.equal(bilan.gares, 1);
    assert.equal(bilan.garesNonBranchees, 1);
    assert.deepEqual(
      fichier.g.map((g) => g.n),
      ["Diable"],
    );
  });
  it("une gare au milieu d'un tronçon y devient un nœud", () => {
    const milieu = { ...G, n: "Milieu", lat: 45.0003, lon: 6.002 };
    const { reseau, champ } = bati([G, milieu]);
    const m = marcheVersGare(reseau, champ, 45.0, 6.0025)!;
    assert.equal(reseau.gares[m.gare].n, "Milieu");
    // 39 m le long de la rue, puis 33 m de parvis.
    assert.ok(Math.abs(m.m - 73) <= 3, String(m.m));
  });
  it("un fichier mal formé n'est pas lu", () => {
    assert.equal(fichierValide(null), false);
    assert.equal(fichierValide({ v: 2, n: [], w: [], g: [] }), false);
    assert.equal(fichierValide({ v: 1, n: [1], w: [], g: [] }), false);
    assert.equal(fichierValide("<!doctype html>"), false);
  });
});

describe("champ de distances et marche d'un logement", () => {
  const { reseau, champ } = bati();

  it("un Dijkstra depuis la gare : chaque nœud sait sa distance", () => {
    const g = reseau.gares[0].i;
    assert.equal(champ.dist[g], 0);
    assert.equal(champ.gare[g], 0);
    for (let i = 0; i < reseau.lat.length; i++) assert.ok(Number.isFinite(champ.dist[i]));
  });

  it("le logement fait le tour par la rue, pas par la piste : 689 m, pas 211", () => {
    const droit = metres(L.lat, L.lon, G.lat, G.lon);
    assert.ok(Math.abs(droit - 211) < 3, String(droit));
    const m = marcheVersGare(reseau, champ, L.lat, L.lon)!;
    assert.equal(m.par, "voie");
    assert.equal(reseau.gares[m.gare].n, "Diable");
    // 11 m jusqu'à la rue, 220 m jusqu'en 3, 222 m jusqu'en 2, 157 m jusqu'en 1, 79 m de parvis.
    assert.ok(Math.abs(m.m - 689) <= 5, String(m.m));
    assert.ok(Math.abs(m.horsVoieM - 11) <= 1, String(m.horsVoieM));
  });

  it("près de la gare, par son parvis : la ligne droite", () => {
    const m = marcheVersGare(reseau, champ, 45.0003, 6.0)!;
    assert.ok(Math.abs(m.m - 33) <= 1, String(m.m));
  });

  it("à 50 m ou moins d'une gare, on y va tout droit plutôt que par le coin de la rue", () => {
    const coin: GareSource = { n: "Coin", k: "chair_lift", lat: 45.002, lon: 6.003, olat: null, olon: null };
    const deux = bati([G, coin]);
    const m = marcheVersGare(deux.reseau, deux.champ, 45.0017, 6.0027)!;
    assert.equal(m.par, "tout-droit");
    assert.equal(deux.reseau.gares[m.gare].n, "Coin");
    assert.ok(Math.abs(m.m - 41) <= 1, String(m.m));
  });

  it("hors réseau (plus de 200 m de toute voie) : rien", () => {
    assert.equal(marcheVersGare(reseau, champ, 45.01, 6.0), null);
    assert.equal(marcheVersGare(reseau, champ, Number.NaN, 6.0), null);
  });

  it("jamais sous la ligne droite", () => {
    for (const [lat, lon] of [
      [45.0005, 6.0012],
      [45.0015, 6.0028],
      [45.0021, 6.0001],
    ]) {
      const m = marcheVersGare(reseau, champ, lat, lon);
      if (m) assert.ok(m.m >= Math.round(metres(lat, lon, G.lat, G.lon)));
    }
  });

  it("le chemin part du logement, suit la rue et finit à la gare", () => {
    const c = cheminVersGare(reseau, champ, L.lat, L.lon)!;
    assert.deepEqual(c[0], L);
    assert.equal(c[c.length - 1].lat, G.lat);
    assert.equal(c[c.length - 1].lon, G.lon);
    let long = 0;
    for (let k = 1; k < c.length; k++) long += metres(c[k - 1].lat, c[k - 1].lon, c[k].lat, c[k].lon);
    const m = marcheVersGare(reseau, champ, L.lat, L.lon)!;
    assert.ok(Math.abs(long - m.m) <= 2, `${long} / ${m.m}`);
    // Il passe par le coin 2 (45.0, 6.003).
    assert.ok(c.some((p) => Math.abs(p.lat - 45.0) < 1e-6 && Math.abs(p.lon - 6.003) < 1e-6));
  });

  it("la plus proche à pied l'emporte, même plus loin à vol d'oiseau", () => {
    // Une seconde gare au coin 3, de l'autre côté de la rue.
    const coin: GareSource = { n: "Coin", k: "chair_lift", lat: 45.0021, lon: 6.003, olat: null, olon: null };
    const deux = bati([G, coin]);
    const m = marcheVersGare(deux.reseau, deux.champ, L.lat, L.lon)!;
    assert.equal(deux.reseau.gares[m.gare].n, "Coin");
    assert.ok(m.m < 260, String(m.m));
  });
});
