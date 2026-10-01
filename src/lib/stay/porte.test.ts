import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import type { AvecCompletude, NearestLift } from "./statut.ts";
import { derive, extrait, inconnu, remonteeInconnue } from "./statut.ts";
import { estComplet, passerLaPorte } from "./porte.ts";

const MEMOIRE = "annonce antérieure, en attente de rafraîchissement";

function annonce(extra: Partial<Listing & AvecCompletude> = {}): Listing & AvecCompletude {
  return {
    id: "x1",
    stationId: "les-2-alpes",
    title: "Appartement au pied des pistes",
    source: "Centrale",
    total: 1800,
    currency: "EUR",
    capacity: 6,
    bedrooms: 2,
    available: true,
    photo: null,
    url: "https://example.test/x1",
    lat: 45.01,
    lon: 6.12,
    proven: "test",
    ...extra,
  };
}

function remontee(extra: Partial<NearestLift> = {}): NearestLift {
  return {
    distanceM: 120,
    liftId: "osm:1",
    liftName: "Diable",
    liftType: "télésiège",
    status: "extracted",
    positionSource: "listing",
    liftsDatasetVersion: "2026-09",
    computedAt: "2026-09-27T10:00:00Z",
    ...extra,
  };
}

describe("porte : ce qui sort porte une completude entière", () => {
  it("les trois champs sont là, même sur une annonce nue", () => {
    const out = passerLaPorte(
      annonce({ capacity: null, bedrooms: null, lat: null, lon: null }),
      "releve",
    );
    assert.deepEqual(out.completude.bedrooms, inconnu("Centrale", "non publié par la source"));
    assert.deepEqual(out.completude.capacity, inconnu("Centrale", "non publié par la source"));
    assert.deepEqual(out.completude.nearestLift, remonteeInconnue("position inconnue"));
  });

  it("un nombre lu par le collecteur est extracted, à la source de l'annonce", () => {
    const out = passerLaPorte(annonce({ source: "Airbnb" }), "releve");
    assert.deepEqual(out.completude.bedrooms, extrait(2, "Airbnb"));
    assert.deepEqual(out.completude.capacity, extrait(6, "Airbnb"));
  });

  it("un studio a 0 chambre : ce 0 est lu, pas inconnu", () => {
    const out = passerLaPorte(annonce({ bedrooms: 0 }), "releve");
    assert.deepEqual(out.completude.bedrooms, extrait(0, "Centrale"));
  });

  it("un statut unknown ne porte jamais 0", () => {
    const cas = [
      annonce({ capacity: 0, bedrooms: null, rooms: 0 }),
      annonce({
        completude: { capacity: { value: 0, status: "unknown", source: "", reason: "x" } },
      }),
      annonce({ completude: { bedrooms: { value: 0, status: "unknown", source: "Centrale" } } }),
    ];
    for (const l of cas) {
      for (const origine of ["releve", "memoire"] as const) {
        const c = passerLaPorte(l, origine).completude;
        for (const p of [c.bedrooms, c.capacity]) {
          if (p.status === "unknown") assert.equal(p.value, null);
        }
      }
    }
    const c = passerLaPorte(cas[1], "releve").completude;
    assert.deepEqual(c.capacity, {
      value: null,
      status: "unknown",
      source: "Centrale",
      reason: "x ; valeur écartée",
    });
    const b = passerLaPorte(cas[2], "releve").completude;
    assert.deepEqual(b.bedrooms, {
      value: null,
      status: "unknown",
      source: "Centrale",
      reason: "valeur écartée",
    });
  });

  it("guests à 0 ou négatif : hors bornes, pas une capacité", () => {
    assert.deepEqual(
      passerLaPorte(annonce({ capacity: 0 }), "releve").completude.capacity,
      inconnu("Centrale", "valeur hors bornes : 0"),
    );
    assert.deepEqual(
      passerLaPorte(annonce({ capacity: -2 }), "releve").completude.capacity,
      inconnu("Centrale", "valeur hors bornes : -2"),
    );
  });

  it("3 pièces sans chambres : 2 chambres dérivées, et la trace le dit", () => {
    const out = passerLaPorte(annonce({ bedrooms: null, rooms: 3 }), "releve");
    assert.deepEqual(
      out.completude.bedrooms,
      derive(2, "Centrale", "3 pièces", "pièces moins une"),
    );
  });

  it("1 pièce : 0 chambre, dérivée", () => {
    const out = passerLaPorte(annonce({ bedrooms: null, rooms: 1 }), "releve");
    assert.equal(out.completude.bedrooms.status, "derived");
    assert.equal(out.completude.bedrooms.value, 0);
  });

  it("des chambres lues priment sur les pièces ; hors bornes, elles leur cèdent", () => {
    assert.deepEqual(
      passerLaPorte(annonce({ bedrooms: 3, rooms: 5 }), "releve").completude.bedrooms,
      extrait(3, "Centrale"),
    );
    assert.deepEqual(
      passerLaPorte(annonce({ bedrooms: -1, rooms: 3 }), "releve").completude.bedrooms,
      derive(2, "Centrale", "3 pièces", "pièces moins une"),
    );
    assert.deepEqual(
      passerLaPorte(annonce({ bedrooms: 51, rooms: null }), "releve").completude.bedrooms,
      inconnu("Centrale", "valeur hors bornes : 51"),
    );
  });

  it("la capacité ne se dérive jamais des pièces ni des chambres", () => {
    const out = passerLaPorte(annonce({ capacity: null, bedrooms: 3, rooms: 4 }), "releve");
    assert.deepEqual(out.completude.capacity, inconnu("Centrale", "non publié par la source"));
  });

  it("la porte ne relit aucun texte", () => {
    const out = passerLaPorte(
      annonce({
        title: "Chalet 4 chambres, 8 personnes",
        capacity: null,
        bedrooms: null,
        rooms: null,
      }),
      "releve",
    );
    assert.equal(out.completude.bedrooms.status, "unknown");
    assert.equal(out.completude.capacity.status, "unknown");
  });

  it("en mémoire, les trois sont inconnus, même si l'annonce porte des nombres", () => {
    const out = passerLaPorte(
      annonce({ capacity: 6, bedrooms: 2, rooms: 3, lat: 45.01, lon: 6.12 }),
      "memoire",
    );
    assert.deepEqual(out.completude.bedrooms, inconnu("Centrale", MEMOIRE));
    assert.deepEqual(out.completude.capacity, inconnu("Centrale", MEMOIRE));
    assert.deepEqual(out.completude.nearestLift, remonteeInconnue(MEMOIRE));
  });

  it("une completude déjà posée est gardée, en mémoire aussi", () => {
    const completude = {
      bedrooms: extrait(3, "Airbnb"),
      capacity: extrait(8, "Airbnb"),
      nearestLift: remontee(),
    };
    const out = passerLaPorte(annonce({ completude }), "memoire");
    assert.deepEqual(out.completude, completude);
  });

  it("une source vide prend celle de l'annonce", () => {
    const out = passerLaPorte(
      annonce({ completude: { bedrooms: { value: 2, status: "extracted", source: "" } } }),
      "releve",
    );
    assert.deepEqual(out.completude.bedrooms, extrait(2, "Centrale"));
  });

  it("une valeur qui contredit son statut est écartée, avec la raison", () => {
    const porte = (completude: AvecCompletude["completude"]) =>
      passerLaPorte(annonce({ completude }), "releve").completude;
    assert.deepEqual(
      porte({ bedrooms: { value: null, status: "extracted", source: "Airbnb" } }).bedrooms,
      inconnu("Airbnb", "valeur absente"),
    );
    assert.deepEqual(
      porte({ bedrooms: { value: 51, status: "extracted", source: "Airbnb" } }).bedrooms,
      inconnu("Airbnb", "valeur hors bornes : 51"),
    );
    assert.deepEqual(
      porte({ bedrooms: { value: -1, status: "derived", source: "Airbnb" } }).bedrooms,
      inconnu("Airbnb", "valeur hors bornes : -1"),
    );
    assert.deepEqual(
      porte({ capacity: { value: 0, status: "extracted", source: "Airbnb" } }).capacity,
      inconnu("Airbnb", "valeur hors bornes : 0"),
    );
    assert.deepEqual(
      porte({ capacity: { value: 2.5, status: "extracted", source: "Airbnb" } }).capacity,
      inconnu("Airbnb", "valeur hors bornes : 2.5"),
    );
    // La trace d'une dérivation reste lisible une fois la valeur écartée.
    const d = porte({ bedrooms: derive(60, "Airbnb", "61 pièces", "pièces moins une") }).bedrooms;
    assert.equal(d.status, "unknown");
    assert.equal(d.value, null);
    assert.equal(d.raw, "61 pièces");
    assert.equal(d.reason, "valeur hors bornes : 60");
  });

  it("une remontée inconnue ne garde ni distance ni nom, mais dit qu'on a cherché", () => {
    const out = passerLaPorte(
      annonce({
        completude: { nearestLift: remontee({ status: "unknown", reason: "hors domaine" }) },
      }),
      "releve",
    );
    assert.deepEqual(out.completude.nearestLift, {
      ...remonteeInconnue("hors domaine"),
      liftsDatasetVersion: "2026-09",
      computedAt: "2026-09-27T10:00:00Z",
    });
  });

  it("une remontée sans distance n'est pas une remontée", () => {
    for (const distanceM of [null, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const out = passerLaPorte(
        annonce({ completude: { nearestLift: remontee({ distanceM }) } }),
        "releve",
      );
      assert.deepEqual(out.completude.nearestLift, {
        ...remonteeInconnue("distance absente"),
        liftsDatasetVersion: "2026-09",
        computedAt: "2026-09-27T10:00:00Z",
      });
    }
  });

  it("la distance s'arrondit à 10 m", () => {
    const d = (distanceM: number) =>
      passerLaPorte(annonce({ completude: { nearestLift: remontee({ distanceM }) } }), "releve")
        .completude.nearestLift.distanceM;
    assert.equal(d(123), 120);
    assert.equal(d(125), 130);
    assert.equal(d(120), 120);
    assert.equal(d(0), 0);
  });

  it("sans remontée posée, la raison dit pourquoi", () => {
    assert.equal(
      passerLaPorte(annonce({ lat: null, lon: null }), "releve").completude.nearestLift.reason,
      "position inconnue",
    );
    assert.equal(
      passerLaPorte(annonce(), "releve").completude.nearestLift.reason,
      "accès ski non calculé",
    );
    assert.equal(passerLaPorte(annonce(), "memoire").completude.nearestLift.reason, MEMOIRE);
    assert.deepEqual(remonteeInconnue("x"), {
      distanceM: null,
      liftId: null,
      liftName: null,
      liftType: null,
      status: "unknown",
      positionSource: null,
      liftsDatasetVersion: null,
      computedAt: null,
      reason: "x",
    });
  });

  it("capacityBase ne reste que s'il est un entier d'au moins 1", () => {
    assert.equal(
      passerLaPorte(annonce({ completude: { capacityBase: 6 } }), "releve").completude.capacityBase,
      6,
    );
    for (const capacityBase of [0, -1, 2.5, null]) {
      const c = passerLaPorte(annonce({ completude: { capacityBase } }), "releve").completude;
      assert.equal("capacityBase" in c, false);
    }
  });

  it("l'entrée n'est pas mutée", () => {
    const entree = annonce({
      completude: {
        bedrooms: { value: 0, status: "unknown", source: "" },
        nearestLift: remontee({ distanceM: 123 }),
        capacityBase: 0,
      },
    });
    const avant = structuredClone(entree);
    const out = passerLaPorte(entree, "releve");
    assert.deepEqual(entree, avant);
    assert.notEqual(out, entree);
    assert.notEqual(out.completude, entree.completude);
    assert.notEqual(out.completude.nearestLift, entree.completude?.nearestLift);
  });

  it("passer deux fois la porte ne change rien", () => {
    const cas = [
      annonce(),
      annonce({ capacity: null, bedrooms: null, rooms: 3, lat: null, lon: null }),
      annonce({ capacity: 0, bedrooms: -1 }),
      annonce({
        completude: { bedrooms: { value: 2, status: "unknown", source: "", reason: "r" } },
      }),
      annonce({
        completude: {
          capacity: { value: null, status: "extracted", source: "Airbnb" },
          capacityBase: 4,
        },
      }),
      annonce({ completude: { nearestLift: remontee({ distanceM: 123 }) } }),
      annonce({ completude: { nearestLift: remontee({ distanceM: null }) } }),
      annonce({ completude: { nearestLift: remontee({ status: "unknown" }) } }),
    ];
    for (const l of cas) {
      for (const origine of ["releve", "memoire"] as const) {
        const une = passerLaPorte(l, origine);
        assert.deepEqual(passerLaPorte(une, origine), une);
      }
    }
  });

  it("estComplet : faux avant la porte, vrai après", () => {
    const cas = [
      annonce(),
      annonce({ completude: { bedrooms: extrait(2, "Centrale") } }),
      annonce({
        completude: {
          bedrooms: extrait(2, "Centrale"),
          capacity: { value: 0, status: "unknown", source: "Centrale" },
          nearestLift: remontee(),
        },
      }),
      annonce({
        completude: {
          bedrooms: extrait(2, "Centrale"),
          capacity: extrait(6, "Centrale"),
          nearestLift: remontee({ distanceM: 123 }),
        },
      }),
      annonce({
        completude: {
          bedrooms: extrait(2, "Centrale"),
          capacity: extrait(6, "Centrale"),
          nearestLift: remontee(),
          capacityBase: 0,
        },
      }),
      annonce({
        completude: {
          bedrooms: extrait(2, ""),
          capacity: extrait(6, "Centrale"),
          nearestLift: remontee(),
        },
      }),
    ];
    for (const l of cas) {
      assert.equal(estComplet(l), false);
      for (const origine of ["releve", "memoire"] as const) {
        const out = passerLaPorte(l, origine);
        assert.equal(estComplet(out), true);
      }
    }
    const plein = annonce({
      completude: {
        bedrooms: extrait(2, "Centrale"),
        capacity: extrait(6, "Centrale"),
        nearestLift: remontee(),
        capacityBase: 6,
      },
    });
    assert.equal(estComplet(plein), true);
    if (estComplet(plein)) assert.equal(plein.completude.capacity.value, 6);
  });

  it("les constructeurs n'écrivent que ce qu'on leur donne", () => {
    assert.deepEqual(derive(2, "X"), { value: 2, status: "derived", source: "X" });
    assert.deepEqual(derive(2, "X", "3 pièces"), {
      value: 2,
      status: "derived",
      source: "X",
      raw: "3 pièces",
    });
    assert.deepEqual(extrait(4, "X"), { value: 4, status: "extracted", source: "X" });
    assert.deepEqual(inconnu("X", "r"), {
      value: null,
      status: "unknown",
      source: "X",
      reason: "r",
    });
  });
});
