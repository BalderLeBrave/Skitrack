import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { cheminTampon, empreinteRequirements, marquerPythonScrape, pythonScrapeAJour, pythonVenv } from "./python-scrape.mjs";

/** Une racine de projet factice : les deux requirements.txt, sans venv. */
function projet() {
  const r = mkdtempSync(join(tmpdir(), "skitrack-py-"));
  for (const w of ["airbnb", "booking"]) {
    mkdirSync(join(r, "scrape", w), { recursive: true });
    writeFileSync(join(r, "scrape", w, "requirements.txt"), `${w}==1\n`);
  }
  return r;
}

function creerVenv(r) {
  const py = pythonVenv(r);
  mkdirSync(dirname(py), { recursive: true });
  writeFileSync(py, "");
}

describe("Python des relevés : à installer ou non", () => {
  it("l'interpréteur du venv dépend de la plateforme", () => {
    assert.equal(pythonVenv("/p", "win32"), join("/p", "scrape", ".venv", "Scripts", "python.exe"));
    assert.equal(pythonVenv("/p", "linux"), join("/p", "scrape", ".venv", "bin", "python"));
  });

  it("sans venv, ou sans tampon, il est à installer", () => {
    const r = projet();
    assert.equal(pythonScrapeAJour(r), false);
    creerVenv(r);
    assert.equal(pythonScrapeAJour(r), false);
  });

  it("une installation réussie le met à jour, jusqu'au changement d'une dépendance", () => {
    const r = projet();
    creerVenv(r);
    marquerPythonScrape(r);
    assert.equal(pythonScrapeAJour(r), true);
    const avant = empreinteRequirements(r);
    writeFileSync(join(r, "scrape", "airbnb", "requirements.txt"), "airbnb==2\n");
    assert.notEqual(empreinteRequirements(r), avant);
    assert.equal(pythonScrapeAJour(r), false);
  });

  it("le tampon vit hors de scrape/", () => {
    const r = projet();
    assert.ok(!cheminTampon(r).includes(join(r, "scrape")), cheminTampon(r));
  });

  it("un tampon illisible vaut une installation à refaire", () => {
    const r = projet();
    creerVenv(r);
    mkdirSync(dirname(cheminTampon(r)), { recursive: true });
    writeFileSync(cheminTampon(r), "{pas du json");
    assert.equal(pythonScrapeAJour(r), false);
  });
});
