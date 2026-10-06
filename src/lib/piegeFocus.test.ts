import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rangApresTab } from "./piegeFocus.ts";

describe("rangApresTab", () => {
  it("sans commande, le focus reste sur la fenêtre", () => {
    assert.equal(rangApresTab(0, -1, false), -1);
    assert.equal(rangApresTab(0, -1, true), -1);
  });

  it("de la dernière commande, Tab revient à la première", () => {
    assert.equal(rangApresTab(5, 4, false), 0);
  });

  it("de la première commande, Maj+Tab va à la dernière", () => {
    assert.equal(rangApresTab(5, 0, true), 4);
  });

  it("au milieu, le navigateur fait seul", () => {
    assert.equal(rangApresTab(5, 2, false), null);
    assert.equal(rangApresTab(5, 2, true), null);
    assert.equal(rangApresTab(5, 0, false), null);
    assert.equal(rangApresTab(5, 4, true), null);
  });

  it("hors des commandes, Tab entre par la première et Maj+Tab par la dernière", () => {
    assert.equal(rangApresTab(3, -1, false), 0);
    assert.equal(rangApresTab(3, -1, true), 2);
    assert.equal(rangApresTab(3, 7, false), 0);
  });

  it("une seule commande garde le focus des deux côtés", () => {
    assert.equal(rangApresTab(1, 0, false), 0);
    assert.equal(rangApresTab(1, 0, true), 0);
  });
});
