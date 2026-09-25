import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { aTourDeRole, ECART_HOTE_MS, noterFin, oublierCadence } from "./cadence.ts";

/** Un écart court, pour que les tests ne durent pas ; la règle est la même. */
const ECART = 60;

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Un appel qui note quand il part et quand il finit. */
function appel(journal: { debut: number; fin: number }[], dureeMs = 5) {
  return async () => {
    const trace = { debut: Date.now(), fin: 0 };
    journal.push(trace);
    await dormir(dureeMs);
    trace.fin = Date.now();
    return journal.length;
  };
}

describe("Cadence des détails : une seconde au moins entre deux requêtes vers un même hôte", () => {
  beforeEach(() => oublierCadence());

  it("l'écart vaut une seconde", () => {
    assert.equal(ECART_HOTE_MS, 1_000);
  });

  it("deux détails de suite sont séparés de l'écart, fin à départ", async () => {
    const journal: { debut: number; fin: number }[] = [];
    await aTourDeRole("https://a.exemple/1", appel(journal), ECART);
    await aTourDeRole("https://a.exemple/2", appel(journal), ECART);
    assert.equal(journal.length, 2);
    assert.ok(journal[1]!.debut - journal[0]!.fin >= ECART, JSON.stringify(journal));
  });

  it("le premier détail attend la fin de la dernière page de résultats", async () => {
    const journal: { debut: number; fin: number }[] = [];
    const finPage = Date.now();
    noterFin("https://a.exemple/resultats?page=0", finPage);
    await aTourDeRole("https://a.exemple/detail", appel(journal), ECART);
    assert.ok(journal[0]!.debut - finPage >= ECART);
  });

  it("des détails demandés de front partent un à un", async () => {
    const journal: { debut: number; fin: number }[] = [];
    const rangs = await Promise.all(
      [1, 2, 3].map((n) => aTourDeRole(`https://a.exemple/${n}`, appel(journal, 20), ECART)),
    );
    assert.deepEqual(rangs, [1, 2, 3]);
    for (let i = 1; i < journal.length; i += 1) {
      assert.ok(journal[i]!.debut - journal[i - 1]!.fin >= ECART, JSON.stringify(journal));
    }
  });

  it("un échec passe à l'appelant, compte comme une requête et ne bloque pas la file", async () => {
    const journal: { debut: number; fin: number }[] = [];
    let finEchec = 0;
    await assert.rejects(
      aTourDeRole(
        "https://a.exemple/refus",
        async () => {
          finEchec = Date.now();
          throw new Error("la centrale a répondu 503");
        },
        ECART,
      ),
      /503/,
    );
    await aTourDeRole("https://a.exemple/suite", appel(journal), ECART);
    assert.ok(journal[0]!.debut - finEchec >= ECART);
  });

  it("deux hôtes différents n'attendent pas l'un après l'autre", async () => {
    const a: { debut: number; fin: number }[] = [];
    const b: { debut: number; fin: number }[] = [];
    await Promise.all([
      aTourDeRole("https://a.exemple/1", appel(a, 150), ECART),
      aTourDeRole("https://b.exemple/1", appel(b), ECART),
    ]);
    assert.ok(b[0]!.debut < a[0]!.fin, JSON.stringify({ a, b }));
  });
});
