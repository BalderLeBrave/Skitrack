import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import { champDepuisGares, construireReseau, lireReseau, type ElementOverpass } from "../geo/reseauPieton.ts";
import { poserLangue } from "../i18n/langue.ts";
import { distanceOf } from "../v7.ts";
import {
  appliquerAPied,
  appliquerAPiedListe,
  distVolOiseauM,
  estAPied,
  viaDistance,
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
