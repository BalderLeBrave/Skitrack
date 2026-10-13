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
  conditionHivernale,
  requeteOverpass,
  restrictionsConditionnelles,
  sensVoie,
  voiePietonne,
  voieRoutiere,
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
    assert.match(q, /\|trunk\|/);
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

/*
 * En voiture. Une boucle à sens uniques au-dessus de la rue du bas :
 *
 *   4 ◀────────────── 3        la rue du haut va de 3 vers 4, celle de
 *   │                 ▲        droite de 2 vers 3, celle de gauche de 4
 *   ▼                 │        vers 1 (écrite 1 → 4, `oneway=-1`) ; la rue
 *   G ··· 1 ───────── 2        du bas, dans les deux sens. Q, sur la rue de
 *                              droite, juste au-dessus de 2.
 *
 * Une route damée (piste de descente) relie 4 à la gare, un chemin relie 2
 * à la gare : ni l'une ni l'autre ne se prend en voiture.
 */
const ROUTES: ElementOverpass[] = [
  node(1, 45.0, 6.001),
  node(2, 45.0, 6.003),
  node(3, 45.002, 6.003),
  node(4, 45.002, 6.001),
  node(6, 45.0, 6.0002),
  way(200, [1, 2], { highway: "residential" }),
  way(201, [2, 3], { highway: "residential", oneway: "yes" }),
  way(202, [3, 4], { highway: "residential", oneway: "yes" }),
  way(203, [1, 4], { highway: "residential", oneway: "-1" }),
  way(204, [4, 6], { highway: "residential", "piste:type": "downhill" }),
  way(205, [2, 6], { highway: "footway" }),
];
const Q = { lat: 45.0003, lon: 6.00302 };

function batiRoute(elements: ElementOverpass[] = ROUTES) {
  const { fichier, bilan } = construireReseau({
    elements,
    gares: [G],
    station: "essai",
    nom: "Essai",
    le: "2026-10-12",
    source: "essai",
    mode: "voiture",
  });
  const reseau = lireReseau(JSON.parse(JSON.stringify(fichier)));
  return { fichier, bilan, reseau, champ: champDepuisGares(reseau) };
}

const longueur = (c: { lat: number; lon: number }[]) => {
  let m = 0;
  for (let k = 1; k < c.length; k++) m += metres(c[k - 1].lat, c[k - 1].lon, c[k].lat, c[k].lon);
  return m;
};

describe("voieRoutiere et sensVoie", () => {
  it("garde les routes ; écarte chemins, sentiers, pistes forestières et escaliers", () => {
    for (const h of ["residential", "service", "tertiary", "primary", "trunk", "living_street"]) {
      assert.equal(voieRoutiere({ highway: h }), true, h);
    }
    for (const h of ["footway", "path", "track", "steps", "pedestrian", "motorway", "cycleway"]) {
      assert.equal(voieRoutiere({ highway: h }), false, h);
    }
    assert.equal(voieRoutiere(undefined), false);
  });
  it("l'accès le plus précis l'emporte ; la route damée ou fermée l'hiver est écartée", () => {
    assert.equal(voieRoutiere({ highway: "service", access: "private" }), false);
    assert.equal(voieRoutiere({ highway: "service", access: "private", motor_vehicle: "yes" }), true);
    assert.equal(voieRoutiere({ highway: "residential", motor_vehicle: "no" }), false);
    assert.equal(voieRoutiere({ highway: "residential", access: "destination" }), true);
    assert.equal(voieRoutiere({ highway: "unclassified", access: "agricultural;forestry" }), false);
    assert.equal(voieRoutiere({ highway: "secondary", winter_road: "no" }), false);
    assert.equal(voieRoutiere({ highway: "residential", "piste:type": "downhill" }), false);
    assert.equal(voieRoutiere({ highway: "service", service: "emergency_access" }), false);
  });
  it("le sens unique : oui, à rebours, rond-point, ou non", () => {
    assert.equal(sensVoie({ oneway: "yes" }), 1);
    assert.equal(sensVoie({ oneway: "-1" }), -1);
    assert.equal(sensVoie({ junction: "roundabout" }), 1);
    assert.equal(sensVoie({ junction: "roundabout", oneway: "no" }), 0);
    assert.equal(sensVoie({}), 0);
    assert.equal(sensVoie(undefined), 0);
  });
});

describe("le réseau routier", () => {
  const { fichier, bilan, reseau, champ } = batiRoute();

  it("garde les quatre rues, écarte la route damée et le chemin ; note les sens uniques", () => {
    assert.equal(fichier.mode, "voiture");
    assert.equal(bilan.voiesRetenues, 4);
    assert.equal(fichier.s?.length, 3);
    assert.equal(bati().fichier.s, undefined);
  });

  it("le sens unique fait faire le tour : de Q, par 3, 4 et 1, pas tout droit par 2", () => {
    const m = marcheVersGare(reseau, champ, Q.lat, Q.lon)!;
    assert.equal(m.par, "voie");
    // 189 m jusqu'en 3, 157 m jusqu'en 4, 222 m jusqu'en 1, 79 m jusqu'à la gare.
    assert.ok(Math.abs(m.m - 647) <= 6, String(m.m));
    const c = cheminVersGare(reseau, champ, Q.lat, Q.lon)!;
    assert.ok(c.some((p) => Math.abs(p.lat - 45.002) < 1e-6 && Math.abs(p.lon - 6.003) < 1e-6));
    assert.ok(Math.abs(longueur(c) - m.m) <= 2, `${longueur(c)} / ${m.m}`);
  });

  it("dans les deux sens, la même rue mène tout droit par 2", () => {
    const libres = ROUTES.map((e) => (e.tags?.oneway ? { ...e, tags: { highway: "residential" } } : e));
    const deux = batiRoute(libres);
    const m = marcheVersGare(deux.reseau, deux.champ, Q.lat, Q.lon)!;
    // 33 m jusqu'en 2, 157 m jusqu'en 1, 79 m jusqu'à la gare.
    assert.ok(Math.abs(m.m - 269) <= 5, String(m.m));
  });

  it("à pied, les sens uniques ne comptent pas", () => {
    const { fichier: f } = construireReseau({
      elements: ROUTES,
      gares: [G],
      station: "essai",
      nom: "Essai",
      le: "2026-10-12",
      source: "essai",
    });
    const r = lireReseau(f);
    const m = marcheVersGare(r, champDepuisGares(r), Q.lat, Q.lon)!;
    assert.ok(m.m < 300, String(m.m));
  });
});

describe("l'hiver dans les balises", () => {
  it("lit les restrictions conditionnelles, parenthèses comprises", () => {
    assert.deepEqual(restrictionsConditionnelles("no @ (Nov-May; Su 08:00-12:00); yes @ snow"), [
      { valeur: "no", condition: "Nov-May; Su 08:00-12:00" },
      { valeur: "yes", condition: "snow" },
    ]);
    assert.deepEqual(restrictionsConditionnelles(undefined), []);
  });
  it("reconnaît les conditions d'hiver, pas celles d'heure, de poids ou d'été", () => {
    for (const c of ["(Dec-Mar)", "Sep 23-May 31", "Nov 15-Apr 30", "week 44-21", "snow", "winter", "Jan"]) {
      assert.equal(conditionHivernale(c), true, c);
    }
    for (const c of ["Mo-Fr 07:00-19:00", "weight>3.5", "Jun-Sep", "Mar-Oct", "week 20-40", "destination"]) {
      assert.equal(conditionHivernale(c), false, c);
    }
  });
  it("la route fermée l'hiver par une restriction conditionnelle est écartée ; celle fermée en semaine, non", () => {
    assert.equal(voieRoutiere({ highway: "secondary", "access:conditional": "no @ (Dec-Mar)" }), false);
    assert.equal(voieRoutiere({ highway: "secondary", "vehicle:conditional": "no @ (Sep 23-May 31)" }), false);
    assert.equal(voieRoutiere({ highway: "unclassified", "motor_vehicle:conditional": "no @ snow" }), false);
    assert.equal(voieRoutiere({ highway: "residential", "access:conditional": "no @ week 44-21" }), false);
    assert.equal(voieRoutiere({ highway: "residential", "access:conditional": "no @ (Mo-Fr 07:00-19:00)" }), true);
    assert.equal(voieRoutiere({ highway: "residential", "access:conditional": "destination @ (Dec-Mar)" }), true);
    // L'hiver l'emporte sur l'accès de tous les jours, dans les deux sens.
    assert.equal(voieRoutiere({ highway: "service", access: "no", "motorcar:conditional": "yes @ winter" }), true);
  });
  it("la route saisonnière ou non déneigée est écartée", () => {
    assert.equal(voieRoutiere({ highway: "tertiary", seasonal: "yes" }), false);
    assert.equal(voieRoutiere({ highway: "residential", winter_service: "no" }), false);
    assert.equal(voieRoutiere({ highway: "residential", snowplowing: "no" }), false);
  });
  it("une rue qui porte un itinéraire piéton ou raquette reste une route ; une piste de ski la ferme", () => {
    assert.equal(voieRoutiere({ highway: "residential", "piste:type": "hike" }), true);
    assert.equal(voieRoutiere({ highway: "residential", "piste:type": "walk" }), true);
    assert.equal(voieRoutiere({ highway: "residential", "piste:type": "nordic;hike" }), false);
    assert.equal(voieRoutiere({ highway: "residential", "piste:type": "sled" }), false);
  });
  it("le sens d'hiver l'emporte", () => {
    assert.equal(sensVoie({ oneway: "yes", "oneway:conditional": "-1 @ winter" }), -1);
    assert.equal(sensVoie({ oneway: "no", "oneway:conditional": "yes @ winter" }), 1);
    assert.equal(sensVoie({ oneway: "yes", "oneway:conditional": "no @ destination" }), 1);
  });
});

describe("le réseau routier : liens, impasses et morceaux", () => {
  const bati = (elements: ElementOverpass[], gare: GareSource) => {
    const { fichier, bilan } = construireReseau({
      elements,
      gares: [gare],
      station: "essai",
      nom: "Essai",
      le: "2026-10-12",
      source: "essai",
      mode: "voiture",
    });
    const reseau = lireReseau(JSON.parse(JSON.stringify(fichier)));
    return { fichier, bilan, reseau, champ: champDepuisGares(reseau) };
  };

  it("on ne s'accroche pas au lien gare-route : le trajet passe par la route", () => {
    // Route est-ouest ; la gare à 200 m au nord de son bout ouest, reliée par
    // un lien droit. Le logement est plus près du lien que de la route.
    const { fichier, reseau, champ } = bati(
      [node(1, 45.0, 6.0), node(2, 45.0, 6.01), way(1, [1, 2], { highway: "residential" })],
      { n: "Haut", k: "gondola", lat: 45.0018, lon: 6.0, olat: null, olon: null },
    );
    assert.equal(fichier.l?.length, 1);
    const m = marcheVersGare(reseau, champ, 45.0009, 6.0012)!;
    // 100 m jusqu'à la route, 94 m de route, 200 m de lien : pas 195 m tout droit.
    assert.ok(m.m > 380, String(m.m));
    const c = cheminVersGare(reseau, champ, 45.0009, 6.0012)!;
    assert.ok(c.some((p) => Math.abs(p.lat - 45.0) < 1e-6));
  });

  it("une impasse à sens unique toute proche n'écarte pas la route d'à côté", () => {
    const { reseau, champ } = bati(
      [
        node(1, 45.0, 6.0003),
        node(2, 45.0, 6.004),
        node(5, 45.0009, 6.004),
        way(1, [1, 2], { highway: "residential" }),
        way(2, [2, 5], { highway: "service", oneway: "yes" }),
      ],
      { n: "Bas", k: "gondola", lat: 45.0, lon: 6.0, olat: null, olon: null },
    );
    const m = marcheVersGare(reseau, champ, 45.00045, 6.00406);
    assert.ok(m, "la rue à 50 m mène à la gare");
    assert.ok(Math.abs(m!.m - 364) <= 8, String(m!.m));
  });

  it("une gare se branche sur chaque morceau routier à sa portée, pas seulement le plus proche", () => {
    // Un parking à 30 m au nord de la gare, isolé (sa liaison est une piste
    // damée) ; la route du village à 120 m au sud, qui file vers l'est.
    const { bilan, reseau, champ } = bati(
      [
        node(1, 45.0003, 5.9995),
        node(2, 45.0003, 6.0005),
        node(3, 44.9989, 5.999),
        node(4, 44.9989, 6.02),
        way(1, [1, 2], { highway: "service", service: "parking_aisle" }),
        way(2, [3, 4], { highway: "secondary" }),
        way(3, [2, 4], { highway: "track", "piste:type": "downhill" }),
      ],
      { n: "Front de neige", k: "chair_lift", lat: 45.0, lon: 6.0, olat: null, olon: null },
    );
    assert.equal(bilan.morceauxRetires, 0);
    const m = marcheVersGare(reseau, champ, 44.999, 6.015);
    assert.ok(m, "le logement au bord de la route du village rejoint la gare");
    assert.ok(Math.abs(m!.m - 1300) < 120, String(m!.m));
  });
});
