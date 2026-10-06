import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agencesDuReleve, parPaquets, sansDoublons, stationsDuReleve, stationsReliees } from "./domaine.ts";
import { emprise, empriseAutour } from "./greengo.ts";
import { stationById } from "../stations.ts";
import type { LiveSearchInput } from "./types.ts";

function recherche(id: string, domaine = true): LiveSearchInput {
  const s = stationById(id)!;
  return {
    stationId: s.id,
    stationName: s.name,
    lat: s.lat,
    lon: s.lon,
    checkIn: "2027-02-06",
    checkOut: "2027-02-13",
    guests: 4,
    bedrooms: 0,
    domaine,
  };
}

describe("relevé d'un grand domaine relié", () => {
  it("La Plagne relève aussi Champagny, Montchavin, Peisey et Les Arcs, la plus proche d'abord", () => {
    const reliees = stationsReliees(recherche("la-plagne"));
    assert.deepEqual(
      reliees.map((r) => r.stationId),
      ["champagny-en-vanoise", "montchavin-les-coches", "peisey-vallandry", "les-arcs-bourg-st-maurice"],
    );
    // Chaque station reliée se cherche avec son nom et son repère, aux mêmes dates.
    const champagny = stationById("champagny-en-vanoise")!;
    assert.equal(reliees[0].stationName, champagny.name);
    assert.equal(reliees[0].lat, champagny.lat);
    assert.equal(reliees[0].checkIn, "2027-02-06");
    assert.equal(stationsDuReleve(recherche("la-plagne"))[0].stationId, "la-plagne");
  });

  it("sans la demande (écran Prix) ou hors grand domaine, la station seule", () => {
    assert.deepEqual(stationsReliees(recherche("la-plagne", false)), []);
    assert.deepEqual(stationsReliees(recherche("val-cenis")), []);
    assert.equal(stationsDuReleve(recherche("val-cenis")).length, 1);
  });

  it("une agence qui donne le même lieu à deux stations n'est appelée qu'une fois", () => {
    const agences = agencesDuReleve(recherche("la-plagne"));
    // Alpissime : 62 pour La Plagne, Montchavin et Champagny, 73 Peisey, 66 Les Arcs.
    assert.deepEqual(
      agences.get("Alpissime")?.map((s) => s.stationId),
      ["la-plagne", "peisey-vallandry", "les-arcs-bourg-st-maurice"],
    );
    // Cimalpes n'est qu'aux Arcs : relevée quand même, depuis La Plagne.
    assert.deepEqual(agences.get("Cimalpes")?.map((s) => s.stationId), ["les-arcs-bourg-st-maurice"]);
    assert.equal(agencesDuReleve(recherche("la-plagne", false)).has("Cimalpes"), false);
  });

  it("l'emprise GreenGo couvre chaque station, et vaut l'ancienne pour une station seule", () => {
    const pts = stationsDuReleve(recherche("la-plagne"));
    const b = empriseAutour(pts, 6);
    for (const p of pts) {
      assert.ok(b.sw.lat < p.lat && p.lat < b.ne.lat && b.sw.lng < p.lon && p.lon < b.ne.lng, p.stationId);
    }
    const seule = recherche("val-cenis");
    assert.deepEqual(empriseAutour([seule], 6), emprise(seule.lat, seule.lon, 6));
  });

  it("une annonce lue deux fois ne compte qu'une fois", () => {
    assert.deepEqual(
      sansDoublons([{ id: "a", n: 1 }, { id: "b", n: 2 }, { id: "a", n: 3 }]).map((l) => l.n),
      [1, 2],
    );
  });

  it("par paquets : jamais plus de n à la fois, résultats dans l'ordre, échecs gardés", async () => {
    let enCours = 0;
    let pic = 0;
    const lus = await parPaquets([1, 2, 3, 4, 5], 2, async (n) => {
      enCours += 1;
      pic = Math.max(pic, enCours);
      await new Promise((r) => setTimeout(r, 5 * (6 - n)));
      enCours -= 1;
      if (n === 3) throw new Error("trois");
      return n * 10;
    });
    assert.equal(pic, 2);
    assert.deepEqual(
      lus.map((r) => (r.status === "fulfilled" ? r.value : (r.reason as Error).message)),
      [10, 20, "trois", 40, 50],
    );
  });
});
