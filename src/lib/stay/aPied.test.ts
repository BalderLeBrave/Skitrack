import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import { champDepuisGares, construireReseau, lireReseau, type ElementOverpass } from "../geo/reseauPieton.ts";
import { poserLangue } from "../i18n/langue.ts";
import { distanceOf } from "../v7.ts";
import {
  appliquerAPied,
  appliquerAPiedListe,
  appliquerVoiture,
  distVolOiseauM,
  estAPied,
  estEnVoiture,
  minutesEnVoiture,
  SEUIL_VOITURE_M,
  trajetVoiture,
  viaDistance,
  voitureRetenue,
  type ReseauCalcule,
} from "./aPied.ts";

/* Le village de `geo/reseauPieton.test.ts`, en plus court : une rue en U
 * entre le logement et la gare. 211 m à vol d'oiseau, 689 m à pied. */
const n = (id: number, lat: number, lon: number): ElementOverpass => ({ type: "node", id, lat, lon });
const ELEMENTS: ElementOverpass[] = [
  n(1, 45.0, 6.001),
  n(2, 45.0, 6.003),
  n(3, 45.002, 6.003),
  n(4, 45.002, 6.0),
  { type: "way", id: 100, nodes: [1, 2, 3], tags: { highway: "residential" } },
  { type: "way", id: 101, nodes: [3, 4], tags: { highway: "footway" } },
];
const { fichier } = construireReseau({
  elements: ELEMENTS,
  gares: [{ n: "Diable", k: "gondola", lat: 45.0, lon: 6.0, olat: 45.01, olon: 6.01 }],
  station: "essai",
  nom: "Essai",
  le: "2026-10-12",
  source: "essai",
});
const reseau = lireReseau(fichier);
const CALC: ReseauCalcule = { reseau, champ: champDepuisGares(reseau) };

/** Une annonce telle qu'`attachAccess` la laisse : à vol d'oiseau. */
function annonce(o: Partial<Listing> = {}): Listing {
  return {
    id: "a1",
    stationId: "essai",
    source: "Airbnb",
    title: "Chalet du Torrent",
    total: 1200,
    proven: "liste",
    lat: 45.0019,
    lon: 6.0002,
    domainFit: "in",
    distToLiftM: 211,
    liftName: "Télésiège voisin",
    liftKind: "chair_lift",
    liftLat: 45.003,
    liftLon: 6.0,
    liftOtherLat: null,
    liftOtherLon: null,
    ...o,
  } as Listing;
}

describe("appliquerAPied", () => {
  it("remplace la ligne droite par la marche, et la remontée par celle qu'on atteint à pied", () => {
    const l = appliquerAPied(annonce(), CALC);
    assert.ok(Math.abs((l.distToLiftM ?? 0) - 689) <= 5, String(l.distToLiftM));
    assert.equal(l.liftName, "Diable");
    assert.equal(l.liftKind, "gondola");
    assert.equal(l.liftLat, 45.0);
    assert.equal(l.liftOtherLat, 45.01);
    assert.equal(l.aPied?.volM, 211);
    assert.equal(estAPied(l), true);
    assert.equal(viaDistance(l), "pieton");
    assert.equal(distVolOiseauM(l), 211);
  });

  it("idempotente : une annonce déjà à pied ressort telle quelle", () => {
    const l = appliquerAPied(annonce(), CALC);
    assert.equal(appliquerAPied(l, CALC), l);
  });

  it("sans réseau, hors réseau, triangulée, sans point ou hors domaine : inchangée, à vol d'oiseau", () => {
    for (const [cas, l, calc] of [
      ["sans réseau", annonce(), null],
      ["hors réseau", annonce({ lat: 45.02, lon: 6.0 }), CALC],
      ["triangulée", annonce({ gpsSource: "triangule" }), CALC],
      ["sans point", annonce({ lat: null, lon: null }), CALC],
      ["autre domaine", annonce({ domainFit: "other", distToLiftM: null }), CALC],
      ["non rattachée", annonce({ domainFit: "unknown", distToLiftM: null }), CALC],
    ] as const) {
      const x = appliquerAPied(l, calc);
      assert.equal(x, l, cas);
      assert.equal(viaDistance(x), "vol", cas);
    }
  });

  it("une remesure à vol d'oiseau faite après rend la marque caduque", () => {
    const l = appliquerAPied(annonce(), CALC);
    // `attachAccess` ou `remesurerRemontee` remettent une ligne droite.
    const remesuree = { ...l, distToLiftM: 180 };
    assert.equal(estAPied(remesuree), false);
    assert.equal(distVolOiseauM(remesuree), 180);
    // Le point a bougé (jumelage) : la marche ne vaut plus.
    assert.equal(estAPied({ ...l, lat: 45.0018 }), false);
  });

  it("la liste ressort au même tableau quand rien ne change", () => {
    const liste = [annonce({ gpsSource: "triangule" })];
    assert.equal(appliquerAPiedListe(liste, () => CALC), liste);
    const autre = [annonce(), annonce({ id: "a2", stationId: "ailleurs" })];
    const out = appliquerAPiedListe(autre, (id) => (id === "essai" ? CALC : null));
    assert.notEqual(out, autre);
    assert.equal(viaDistance(out[0]), "pieton");
    assert.equal(out[1], autre[1]);
  });
});

describe("distanceOf dit ce que mesure la distance", () => {
  it("« à pied » pour une marche, « à vol d'oiseau » sinon ; jamais un chiffre sans le dire", () => {
    poserLangue("fr");
    const vol = distanceOf(annonce());
    assert.equal(vol.kind, "measured");
    assert.equal(vol.via, "vol");
    assert.match(vol.text, /à vol d’oiseau de Télésiège voisin$/);
    const pied = distanceOf(appliquerAPied(annonce(), CALC));
    assert.equal(pied.via, "pieton");
    assert.match(pied.text, /à pied de Diable$/);
    // Un point triangulé ne mesure toujours rien.
    assert.equal(distanceOf(annonce({ gpsSource: "triangule" })).kind, "triangulated");
  });
});

/* En voiture : une route droite de 1,6 km, d'est en ouest, qui finit à
 * 78 m de la gare. Le logement BOUT est au bout est, à 22 m de la route ;
 * PRES, à 22 m de la route, à 240 m de son bout ouest. */
const ROUTE: ReseauCalcule = (() => {
  const { fichier: f } = construireReseau({
    elements: [
      n(50, 45.0, 6.0),
      n(51, 45.0, 6.01),
      n(52, 45.0, 6.02),
      { type: "way", id: 200, nodes: [50, 51, 52], tags: { highway: "residential" } },
    ],
    gares: [{ n: "Télécabine du Bas", k: "gondola", lat: 44.9993, lon: 6.0, olat: 45.01, olon: 6.01 }],
    station: "essai",
    nom: "Essai",
    le: "2026-10-12",
    source: "essai",
    mode: "voiture",
  });
  const r = lireReseau(f);
  return { reseau: r, champ: champDepuisGares(r) };
})();
const BOUT = { lat: 45.0002, lon: 6.0198 };
const PRES = { lat: 45.0002, lon: 6.003 };

describe("voitureRetenue", () => {
  it("la marche et la route dépassent le seuil, et la voiture arrive plus vite", () => {
    // 1,5 km à pied : 20 min ; 2 km de route : 4 min, plus le stationnement.
    assert.equal(voitureRetenue(1500, 2000, 0), true);
  });
  it("une marche au seuil ou en deçà se fait à pied", () => {
    assert.equal(voitureRetenue(SEUIL_VOITURE_M, 3000, 0), false);
  });
  it("une route sous le seuil : on y va à pied par la même route", () => {
    assert.equal(voitureRetenue(1500, 900, 0), false);
  });
  it("un détour de 10 km pour éviter 1,7 km de marche ne se prend pas", () => {
    assert.equal(voitureRetenue(1663, 9814, 0), false);
  });
  it("le bout jusqu'à la route se fait à pied, et compte", () => {
    // 1 200 m à pied : 16 min. 1 100 m dont 190 m hors route : 2,5 + 1,8 min,
    // plus 5 de stationnement : la voiture l'emporte. Dont 900 m hors route :
    // 12 + 0,4 + 5 min, non.
    assert.equal(voitureRetenue(1200, 1100, 190), true);
    assert.equal(voitureRetenue(1200, 1100, 900), false);
  });
});

describe("appliquerVoiture", () => {
  it("la marche est longue, la voiture plus rapide : trajet en voiture ; la marche reste la distance", () => {
    const l = appliquerVoiture(annonce({ ...BOUT, distToLiftM: 2500 }), ROUTE);
    assert.equal(estEnVoiture(l), true);
    const v = trajetVoiture(l)!;
    assert.equal(v.liftName, "Télécabine du Bas");
    // 22 m jusqu'à la route, 1 558 m de route, 78 m jusqu'à la gare.
    assert.ok(Math.abs(v.m - 1658) <= 10, String(v.m));
    assert.equal(v.minutes, minutesEnVoiture(v.m, 22));
    assert.equal(v.marcheM, 2500);
    assert.equal(l.distToLiftM, 2500);
    assert.equal(l.liftName, "Télésiège voisin");
  });

  it("une marche au seuil ou en deçà, ou une route courte : à pied", () => {
    const court = annonce({ ...BOUT, distToLiftM: SEUIL_VOITURE_M });
    assert.equal(appliquerVoiture(court, ROUTE), court);
    const routeCourte = annonce({ ...PRES, distToLiftM: 1400 });
    assert.equal(appliquerVoiture(routeCourte, ROUTE), routeCourte);
  });

  it("sans réseau routier, sans route à 200 m, hors domaine ou triangulé : rien", () => {
    const long = annonce({ ...BOUT, distToLiftM: 2500 });
    assert.equal(appliquerVoiture(long, null), long);
    const loin = annonce({ lat: 45.02, lon: 6.0, distToLiftM: 2500 });
    assert.equal(appliquerVoiture(loin, ROUTE), loin);
    const autre = annonce({ ...BOUT, distToLiftM: 2500, domainFit: "other" });
    assert.equal(appliquerVoiture(autre, ROUTE), autre);
    const tri = annonce({ ...BOUT, distToLiftM: 2500, gpsSource: "triangule" });
    assert.equal(appliquerVoiture(tri, ROUTE), tri);
  });

  it("une remesure de la marche ou du point fait oublier le trajet", () => {
    const l = appliquerVoiture(annonce({ ...BOUT, distToLiftM: 2500 }), ROUTE);
    assert.equal(estEnVoiture({ ...l, distToLiftM: 300 }), false);
    assert.equal(estEnVoiture({ ...l, lat: 45.0003 }), false);
  });

  it("la liste : la marche d'abord, puis la voiture si elle l'emporte", () => {
    const longue = annonce({ id: "a2", ...BOUT, distToLiftM: 2500 });
    const courte = annonce({ id: "a3", ...BOUT, distToLiftM: 120 });
    const [a, b] = appliquerAPiedListe(
      [longue, courte],
      () => null,
      () => ROUTE,
    );
    assert.equal(estEnVoiture(a), true);
    assert.equal(estEnVoiture(b), false);
  });

  it("le texte dit la route, la remontée, les minutes et la marche", () => {
    poserLangue("fr");
    const d = distanceOf(appliquerVoiture(annonce({ ...BOUT, distToLiftM: 2500 }), ROUTE));
    assert.equal(d.kind, "measured");
    assert.ok(d.voiture);
    assert.match(d.text, /^1,7 km en voiture jusqu’à Télécabine du Bas, \d+ min \(2,5 km à vol d’oiseau\)$/);
  });
});
