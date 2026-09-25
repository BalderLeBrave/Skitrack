import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ECART_HOTE_MS, PAR_HOTE, parHote, RythmeHotes, semaphore } from "./limiteHotes.ts";

describe("rythme des pages de fiche, hôte par hôte", () => {
  it("deux lectures en vol et une seconde entre deux départs, par défaut", () => {
    assert.equal(PAR_HOTE, 2);
    assert.equal(ECART_HOTE_MS, 1_000);
  });

  it("deux demandes simultanées partent à une seconde d'écart, pas ensemble", () => {
    let t = 10_000;
    const r = new RythmeHotes({ now: () => t });
    assert.equal(r.reserver("a.fr"), 0);
    assert.equal(r.reserver("a.fr"), 1_000);
    assert.equal(r.reserver("a.fr"), 2_000);
    t += 5_000;
    assert.equal(r.reserver("a.fr"), 0);
  });

  it("les hôtes ne s'attendent pas entre eux", () => {
    const r = new RythmeHotes({ now: () => 0 });
    assert.equal(r.reserver("a.fr"), 0);
    assert.equal(r.reserver("b.fr"), 0);
    assert.equal(r.reserver("a.fr"), 1_000);
  });

  it("les départs se partagent d'une passe à l'autre, pas les refus", () => {
    const departs = new Map<string, number>();
    const premiere = new RythmeHotes({ now: () => 10_000, departs });
    assert.equal(premiere.reserver("a.fr"), 0);
    // La passe suivante (tranche de Prix, recherche de Logements) part 0,3 s après.
    const suivante = new RythmeHotes({ now: () => 10_300, departs });
    assert.equal(suivante.reserver("a.fr"), 700);
    premiere.refuser("a.fr");
    assert.equal(suivante.aRefuse("a.fr"), false);
  });

  it("un hôte qui refuse est laissé, et les refus reçus comptent déjà", () => {
    const r = new RythmeHotes({ refus: ["c.fr"] });
    assert.equal(r.aRefuse("c.fr"), true);
    assert.equal(r.aRefuse("a.fr"), false);
    r.refuser("a.fr");
    assert.equal(r.aRefuse("a.fr"), true);
    assert.deepEqual(r.refuses().sort(), ["a.fr", "c.fr"]);
  });
});

describe("sémaphore des lectures", () => {
  it("n'en laisse pas partir plus de n à la fois, et rend la place au suivant", async () => {
    const s = semaphore(2);
    let enVol = 0;
    let max = 0;
    const tache = async () => {
      await s.prendre();
      enVol += 1;
      max = Math.max(max, enVol);
      await new Promise((r) => setTimeout(r, 5));
      enVol -= 1;
      s.rendre();
    };
    await Promise.all(Array.from({ length: 7 }, tache));
    assert.equal(max, 2);
    assert.equal(enVol, 0);
  });
});

describe("rangement par hôte", () => {
  it("garde l'ordre reçu et laisse ce qui n'a pas d'hôte", () => {
    const m = parHote(["a1", "b1", "a2", "x"], (s) => (s === "x" ? null : s[0]));
    assert.deepEqual([...m.entries()], [
      ["a", ["a1", "a2"]],
      ["b", ["b1"]],
    ]);
  });
});
