import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DeadlineError, estPauseApi, estTimeout, withDeadline } from "./deadline.ts";

describe("délai d'API", () => {
  it("rend la valeur avant l'échéance", async () => {
    const v = await withDeadline(Promise.resolve(7), 200, "test");
    assert.equal(v, 7);
  });

  it("lève DeadlineError une fois le temps écoulé", async () => {
    const slow = new Promise<number>((resolve) => setTimeout(() => resolve(1), 200));
    await assert.rejects(() => withDeadline(slow, 20, "lent"), (err: unknown) => {
      assert.equal(err instanceof DeadlineError, true);
      assert.equal(estTimeout(err), true);
      assert.match((err as Error).message, /Délai dépassé \(lent\)/);
      return true;
    });
  });

  it("un délai déjà épuisé ne part pas", async () => {
    await assert.rejects(() => withDeadline(Promise.resolve(1), 0, "zero"), DeadlineError);
  });

  it("reconnaît 429 et timeout comme une pause", () => {
    assert.equal(estPauseApi("Airbnb a demandé une pause (HTTP 429) : le relevé est partiel."), true);
    assert.equal(estPauseApi("Délai dépassé : relevé précédent conservé."), true);
    assert.equal(estPauseApi("pyairbnb timeout"), true);
    assert.equal(estPauseApi("centrale muette"), false);
    assert.equal(estPauseApi(undefined), false);
  });
});
