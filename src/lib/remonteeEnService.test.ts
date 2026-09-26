import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OSM_ACCESS, OSM_LIFTS, type OsmPt } from "./osmAccess.data.ts";
import accessBrut from "./osmAccess.snapshot.json" with { type: "json" };
import liftsBruts from "./osmLifts.json" with { type: "json" };
import { gareRetiree, remonteeHorsService } from "./remonteeEnService.ts";
import retirees from "./remonteesRetirees.json" with { type: "json" };

describe("remonteeHorsService : les gares qui ne font pas un logement au pied des pistes", () => {
  it("les noms relevés : projets, appareils désaffectés, luge d'été", () => {
    for (const nom of [
      "(Project) Télécabine Bozel - St Bon - Courchevel",
      "(Proposed) TCD Sapinière (Projet 2021)",
      "Ancien télécabine de Charlannes",
      "Ancien Téléphérique du Berduquet",
      "Ancien téléphérique EDF des Bésines",
      "Ancienne télécabine",
      "Téléski désaffecté",
      "Téléphérique de Saint-Nizier-du-Moucherotte (démoli)",
      "TKF des Auberts (✝)",
      "Remonte-luge (Luge d'été)",
      "Téléphérique EDF",
      "Téléphérique de Naguilles - EDF",
      "Téléphérique de service Barberine - Col de la Gueulaz",
      "Ligne de service Aiguille du Midi 1",
      "funiculaire de service",
      "Téléski nautique de Carcassonne",
      "Dahu Wake Park",
    ]) {
      assert.equal(remonteeHorsService(nom), true, nom);
    }
  });

  it("les vraies remontées restent, « Ferme » comprise", () => {
    for (const nom of [
      "Ferme",
      "Village",
      "Olympic",
      "Perdrix",
      "Capucin",
      "Vieux Moulin",
      "Remonte Luge",
      "Télétraineau",
      "TPH Aiguille du Midi",
      "Anciennement Bleue",
      null,
      undefined,
      "",
    ]) {
      // « Anciennement Bleue » ne commence ni par « Ancien » ni par « Ancienne » comme mot.
      assert.equal(remonteeHorsService(nom), false, String(nom));
    }
  });

  it("les gares qu'openskidata.org dit hors service sont retirées, et restent connues", () => {
    // TKF1 Portatif, à La Giettaz : désaffecté, sans que son nom le dise.
    assert.equal(gareRetiree(45.86415, 6.496452), true);
    assert.equal(gareRetiree(45.585513, 2.739956), true);
    assert.equal(gareRetiree(45.86415, 6.4964), false);
    assert.equal(gareRetiree(null, 6.496452), false);
    const cles = (ps: { lat: number; lon: number }[]) => new Set(ps.map((p) => `${p.lat},${p.lon}`));
    const nationales = cles(OSM_LIFTS);
    const parStation = cles(Object.values(OSM_ACCESS).flatMap((a) => a.lifts));
    for (const g of retirees as { n: string | null; lat: number; lon: number }[]) {
      const k = `${g.lat},${g.lon}`;
      assert.ok(!nationales.has(k) && !parStation.has(k), `${g.n} encore dans les index`);
    }
    // Les remontées en service de La Giettaz, au Torraz, restent.
    assert.ok(OSM_ACCESS["la-giettaz"]?.lifts.some((p) => p.n === "TSF4 de la Tête du Torraz"));
    assert.ok(!OSM_ACCESS["la-giettaz"]?.lifts.some((p) => p.n === "TKF1 Portatif"));
  });

  it("aucune gare hors service ne reste dans les deux index", () => {
    assert.equal(OSM_LIFTS.filter((p) => remonteeHorsService(p.n)).length, 0);
    for (const [id, a] of Object.entries(OSM_ACCESS)) {
      const reste = a.lifts.filter((p) => remonteeHorsService(p.n)).map((p) => p.n);
      assert.deepEqual(reste, [], id);
    }
    assert.ok(!OSM_ACCESS["la-bourboule"]?.lifts.some((p) => /Charlannes/.test(p.n ?? "")));
  });
});

/**
 * Le passage du 26 septembre 2026 (`scripts/retirer-remontees-hors-service.mjs`),
 * famille par famille, avec un appareil réel de chacune. Les données sont
 * lues brutes : le filtre sur le nom (`remonteeHorsService`) n'y est pour rien.
 */
describe("les gares retirées des données, famille par famille", () => {
  type Retiree = { n: string | null; s: string; lat: number; lon: number };
  const RETIREES = retirees as Retiree[];
  const BRUT_NATIONAL = liftsBruts as OsmPt[];
  const BRUT_LISTES = accessBrut as Record<string, { lifts: OsmPt[] }>;
  const cle = (p: { lat: number; lon: number }) => `${p.lat},${p.lon}`;

  /** Les positions retirées de cet appareil, et le motif qu'elles portent. */
  function retireesDe(nom: string): Retiree[] {
    return RETIREES.filter((g) => g.n === nom);
  }
  /** Le nom est-il encore dans l'index national, ou dans la liste de l'une de ces stations ? */
  function present(nom: string, ids: string[] = []): string[] {
    const ou: string[] = [];
    if (BRUT_NATIONAL.some((p) => p.n === nom)) ou.push("national");
    for (const id of ids) if (BRUT_LISTES[id]?.lifts.some((p) => p.n === nom)) ou.push(id);
    return ou;
  }
  /** Retiré de l'index national et de ces listes, ses positions (deux
   *  gares au moins, sauf `min`) gardées avec leur motif. */
  function retire(nom: string, motif: string, ids: string[], min = 2): void {
    const r = retireesDe(nom);
    assert.ok(r.length >= min, `${nom} : ${r.length} position(s) retirée(s)`);
    for (const g of r) {
      assert.equal(g.s, motif, nom);
      assert.equal(gareRetiree(g.lat, g.lon, nom), true, nom);
    }
    assert.deepEqual(present(nom, ids), [], nom);
  }
  function garde(nom: string, ids: string[]): void {
    assert.deepEqual(present(nom, ids), ["national", ...ids], nom);
    assert.deepEqual(retireesDe(nom), [], nom);
  }

  it("cohérence : chaque gare retirée une fois par position et par nom, avec son motif, qu'aucune gare n'occupe", () => {
    const motifs = new Set([
      "disused",
      "abandoned",
      "proposed",
      "planned",
      "construction",
      "privé sans domaine",
      "cabine sans domaine",
      "câble plat sans domaine",
      "désigné",
    ]);
    const vues = new Set<string>();
    for (const g of RETIREES) {
      assert.ok(motifs.has(g.s), `${g.n} : ${g.s}`);
      const k = `${cle(g)},${g.n}`;
      assert.ok(!vues.has(k), `${g.n} en double`);
      vues.add(k);
    }
    const gardees = new Set(
      [...BRUT_NATIONAL, ...Object.values(BRUT_LISTES).flatMap((a) => a.lifts)].map(cle),
    );
    for (const g of RETIREES) assert.ok(!gardees.has(cle(g)), `${g.n} encore dans les données`);
  });

  it("une position retirée garde tous ses noms : le Col des Aravis, sous l'un ou l'autre", () => {
    // Les deux appareils désaffectés du col partent du même nœud ; une annonce
    // enregistrée à cette gare peut tenir l'un ou l'autre nom.
    const aravis = RETIREES.filter((g) => g.lat === 45.866376 && g.lon === 6.461352);
    assert.deepEqual(aravis.map((g) => g.n).sort(), [
      "TKE1 du Col des Aravis",
      "Télétraineau du Col des Aravis",
    ]);
    for (const g of aravis) assert.equal(g.s, "disused", String(g.n));
    assert.equal(gareRetiree(45.866376, 6.461352, "TKE1 du Col des Aravis"), true);
    assert.equal(gareRetiree(45.866376, 6.461352, "Télétraineau du Col des Aravis"), true);
    assert.equal(gareRetiree(45.866376, 6.461352), true);
    // Un autre nom à la même position n'est pas une gare retirée.
    assert.equal(gareRetiree(45.866376, 6.461352, "TSF4 de la Tête du Torraz"), false);
  });

  it("hors service : « Sambuy » et « Prat de Tossa », gares au milieu de leur tracé", () => {
    // Le rapprochement par les seules extrémités des tracés les laissait :
    // « Sambuy » (désaffecté) restait à 992 m du repère de La Sambuy.
    retire("Sambuy", "disused", ["la-sambuy"]);
    retire("Prat de Tossa", "abandoned", ["puigmal"]);
    assert.equal(gareRetiree(45.704574, 6.2739, "Sambuy"), true);
    assert.equal(gareRetiree(42.381354, 2.079123, "Prat de Tossa"), true);
  });

  it("privé sans domaine : le téléphérique de Bure, Plaouquès, Pragnères, Tramezaygues", () => {
    // « Chalet 8 Personnes - Dévoluy » était à 1 756 m du téléphérique de
    // l'observatoire de Bure, 2 037 m des pistes.
    retire("Téléphérique de Bure", "privé sans domaine", ["le-devoluy", "la-joue-du-loup"]);
    retire("Plaouquès", "privé sans domaine", ["espiaube", "saint-lary-pla-d-adet"]);
    retire("Pragnères", "privé sans domaine", ["bareges"]);
    retire("Tramezaygues 1", "privé sans domaine", ["saint-lary-pla-d-adet"]);
    retire("Tramezaygues 2", "privé sans domaine", []);
  });

  it("cabine sans domaine : Applevage, Ponts de Camps, le funiculaire de Thonon à Lullin", () => {
    retire("Applevage", "cabine sans domaine", ["le-somport-candanchu"]);
    retire("Ponts de Camps", "cabine sans domaine", []);
    retire("Tramezaygues 3", "cabine sans domaine", []);
    // Les 7 gares sans nom du funiculaire de Thonon, à 11 km de Lullin :
    // un logement de Thonon passait « à 21 m » d'une remontée de Lullin.
    const thonon = RETIREES.filter(
      (g) => g.n == null && Math.abs(g.lat - 46.3748) < 0.002 && Math.abs(g.lon - 6.4793) < 0.002,
    );
    assert.equal(thonon.length, 7);
    for (const g of thonon) assert.equal(g.s, "cabine sans domaine");
    assert.ok(!BRUT_LISTES.lullin!.lifts.some((p) => p.k === "funicular"));
  });

  it("câble plat sans domaine : le téléski nautique du plan d'eau de Chaillol", () => {
    // 173 m, 0 m de dénivelé : « Le Moulin des Écrins » y était à 1 246 m.
    const chaillol = RETIREES.find((g) => g.lat === 44.655728 && g.lon === 6.105089);
    assert.equal(chaillol?.s, "câble plat sans domaine");
    assert.equal(gareRetiree(44.655728, 6.105089, null), true);
    // « Rouffiac Cablepark » et « EXO 84 » : leur nom ne dit pas le ski
    // nautique, leur tracé plat le dit.
    for (const nom of ["Rouffiac Cablepark", "EXO 84", "Téléski du Barcarès"]) {
      assert.equal(remonteeHorsService(nom), false, nom);
      retire(nom, "câble plat sans domaine", [], 1);
    }
  });

  it("désignés : le télésiège du Glacier des Bossons et la corde du tremplin de Ventron", () => {
    const bossons = ["chamonix", "argentiere", "saint-nicolas-de-veroce"];
    retire("Glacier des Bossons", "désigné", bossons);
    retire("Teleski à cable bas Tremplin du Saut", "désigné", ["ventron"]);
    // Les autres remontées de Ventron restent.
    assert.ok(BRUT_LISTES.ventron!.lifts.some((p) => p.n === "Brabant École"));
  });

  it("le Capucin retiré, l'Aiguille du Midi et la Mer de Glace gardées, par décision du propriétaire", () => {
    // Funiculaire du Mont-Dore sans domaine ni piste à 1 km de sa gare haute :
    // retiré le 26 septembre 2026.
    retire("Capucin", "cabine sans domaine", ["la-bourboule"]);
    garde("TPH Aiguille du Midi", []);
    garde("TPH Plan de l'Aiguille", ["chamonix"]);
    garde("TC Mer de Glace", []);
  });

  it("gardés, faute de preuve : tremplins d'un domaine, Ascenseur des Thermes, petits domaines", () => {
    garde("Funiculaire des Tremplins de Courchevel", ["courchevel"]);
    garde("Tremplin des Tuffes", ["les-rousses"]);
    garde("Tremplin saut à Ski", []);
    garde("Ascenseur des Thermes", ["megeve"]);
    // « Domaine à 0 km de piste » n'est pas un motif : Gaschney, Val Pelens.
    garde("Téléski du Petit Hohneck", ["le-gaschney"]);
    garde("Lunetta", ["val-pelens"]);
  });
});
