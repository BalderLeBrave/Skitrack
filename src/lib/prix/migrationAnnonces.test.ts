import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extrait, inconnu, remonteeInconnue } from "../stay/statut.ts";
import { migrerAnnonces, RAISON_ANTERIEURE } from "./migrationAnnonces.ts";

/** Une annonce telle que les relevés d'avant la phase 1 l'enregistraient. */
function ancienne(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "a1",
    stationId: "les-2-alpes",
    title: "Studio au pied des pistes",
    source: "Centrale",
    total: 900,
    currency: "EUR",
    guests: 4,
    bedrooms: 1,
    available: true,
    photo: null,
    url: "https://example.test/a1",
    lat: 45.01,
    lon: 6.12,
    proven: "",
    ...extra,
  };
}

const INCONNUE = {
  bedrooms: { value: null, status: "unknown", source: "Centrale", reason: RAISON_ANTERIEURE },
  capacity: { value: null, status: "unknown", source: "Centrale", reason: RAISON_ANTERIEURE },
  nearestLift: remonteeInconnue(RAISON_ANTERIEURE),
};

function elements(v: unknown): Record<string, unknown>[] {
  assert.ok(Array.isArray(v));
  return v as Record<string, unknown>[];
}

describe("migrerAnnonces : les annonces d'avant la phase 1 reçoivent un statut", () => {
  it("la raison est celle de la porte, mot pour mot", () => {
    assert.equal(RAISON_ANTERIEURE, "annonce antérieure, en attente de rafraîchissement");
  });

  it("un tableau ancien : les trois champs inconnus, valeur nulle, la raison exacte", () => {
    const { valeur, changee } = migrerAnnonces([ancienne(), ancienne({ id: "a2", source: 7 })]);
    assert.equal(changee, true);
    const [a, b] = elements(valeur);
    assert.deepEqual(a.completude, INCONNUE);
    for (const p of [a.completude, b.completude] as Record<string, { value: unknown }>[]) {
      assert.equal(p.bedrooms.value, null);
      assert.equal(p.capacity.value, null);
      assert.equal(p.nearestLift.value, undefined);
    }
    // Une source qui n'est pas un texte ne vaut rien : la porte posera celle de l'annonce.
    assert.deepEqual(
      (b.completude as Record<string, unknown>).bedrooms,
      inconnu("", RAISON_ANTERIEURE),
    );
    // Le reste de l'annonce reste, nombres compris : ils ne sont pas crus, ils ne sont pas effacés.
    assert.equal(a.id, "a1");
    assert.equal(a.guests, 4);
    assert.equal(a.bedrooms, 1);
    assert.equal(a.lat, 45.01);
  });

  it("un tableau déjà migré ne change pas, et revient tel quel", () => {
    const migre = [
      { ...ancienne(), completude: INCONNUE },
      {
        ...ancienne({ id: "a3", source: "Airbnb" }),
        completude: {
          bedrooms: extrait(2, "Airbnb"),
          capacity: extrait(6, "Airbnb"),
          nearestLift: remonteeInconnue("position inconnue"),
        },
      },
    ];
    const avant = structuredClone(migre);
    const { valeur, changee } = migrerAnnonces(migre);
    assert.equal(changee, false);
    assert.equal(valeur, migre);
    assert.deepEqual(valeur, avant);
  });

  it("ce qui n'est pas un tableau est rendu tel quel", () => {
    const objet = ancienne();
    for (const v of [null, undefined, "x", 3, true, objet]) {
      const { valeur, changee } = migrerAnnonces(v);
      assert.equal(changee, false);
      assert.equal(valeur, v);
    }
    assert.equal("completude" in objet, false);
  });

  it("un élément qui n'est pas un objet est laissé tel quel", () => {
    const { valeur, changee } = migrerAnnonces([null, ancienne(), 3, "x", [ancienne()]]);
    assert.equal(changee, true);
    const v = elements(valeur);
    assert.equal(v.length, 5);
    assert.equal(v[0], null);
    assert.deepEqual(v[1].completude, INCONNUE);
    assert.equal(v[2], 3);
    assert.equal(v[3], "x");
    assert.equal("completude" in (v[4] as unknown as unknown[]), false);
  });

  it("un tableau sans rien à migrer revient tel quel", () => {
    const rien = [null, 3, "x"];
    const { valeur, changee } = migrerAnnonces(rien);
    assert.equal(changee, false);
    assert.equal(valeur, rien);
  });

  it("l'entrée n'est pas mutée", () => {
    const entree = [ancienne(), null, { ...ancienne({ id: "a2" }), completude: INCONNUE }];
    const avant = structuredClone(entree);
    const { valeur } = migrerAnnonces(entree);
    assert.deepEqual(entree, avant);
    assert.notEqual(valeur, entree);
    assert.notEqual(elements(valeur)[0], entree[0]);
  });

  it("migrer deux fois ne change plus rien", () => {
    const une = migrerAnnonces([ancienne(), null, ancienne({ id: "a2" })]);
    assert.equal(une.changee, true);
    const deux = migrerAnnonces(une.valeur);
    assert.equal(deux.changee, false);
    assert.equal(deux.valeur, une.valeur);
    assert.deepEqual(deux.valeur, une.valeur);
  });
});
