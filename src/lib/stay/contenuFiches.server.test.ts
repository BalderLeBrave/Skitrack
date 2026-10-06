import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContenuFiches, contenuLu } from "./contenuFiches.server.ts";
import { equipements } from "./equipements.ts";

const dossier = () => mkdtempSync(join(tmpdir(), "skitrack-contenu-"));
const CONTENU = {
  description: "Entre 52 et 62m². Avec balcon.",
  photos: ["https://d1wek41qnoimq7.cloudfront.net/product/8493/910555/O/a.jpg"],
  amenities: equipements({ balcon: "oui" }),
};

describe("ContenuFiches", () => {
  it("garde et relit le contenu d'une fiche", () => {
    const f = join(dossier(), "fiches-contenu.json");
    new ContenuFiches(f).noter([{ cle: "Travelski:910555", contenu: CONTENU }], 1000);
    const lu = new ContenuFiches(f).lire("Travelski:910555", 2000);
    assert.deepEqual(lu, CONTENU);
  });
  it("oublie au bout de la durée", () => {
    const f = join(dossier(), "fiches-contenu.json");
    const m = new ContenuFiches(f, 10_000);
    m.noter([{ cle: "k", contenu: CONTENU }], 1000);
    assert.equal(m.lire("k", 20_000), null);
  });
  it("une entrée vide n'efface rien, une clé absente ne s'écrit pas", () => {
    const f = join(dossier(), "fiches-contenu.json");
    const m = new ContenuFiches(f);
    m.noter([{ cle: "k", contenu: CONTENU }], 1000);
    m.noter([{ cle: "k", contenu: { description: null, photos: null, amenities: null } }, { cle: null, contenu: CONTENU }], 2000);
    assert.deepEqual(m.lire("k", 3000), CONTENU);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(f, "utf8")).contenus), ["k"]);
  });
  it("un fichier illisible repart de rien", () => {
    const f = join(dossier(), "fiches-contenu.json");
    writeFileSync(f, "{pas du json");
    assert.equal(new ContenuFiches(f).lire("k"), null);
  });
});

describe("contenuLu", () => {
  it("ne garde que des adresses https et des équipements de la liste", () => {
    const c = contenuLu({
      description: "x",
      photos: ["http://non.jpg", "https://oui.jpg", 3],
      amenities: [{ cle: "inventee", libelle: "?", valeur: "oui" }, ...equipements({ wifi: "oui" })!],
    });
    assert.deepEqual(c?.photos, ["https://oui.jpg"]);
    assert.equal(c?.amenities?.length, 12);
  });
  it("rien de vide", () => {
    assert.equal(contenuLu({ description: " ", photos: [], amenities: [] }), null);
  });
});
