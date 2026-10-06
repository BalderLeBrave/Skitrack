import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { depuisListe, depuisTexte, equipements, fusionner } from "./equipements.ts";

const fx = (p: string) => readFileSync(new URL(`../scrape/${p}`, import.meta.url), "utf8");

describe("depuisTexte", () => {
  it("description réelle Ski Planet (Le Cervin, La Plagne) : lave-vaisselle et balcon, rien d'autre", () => {
    const html = fx("agences/fixtures/sp-infos-logement-76147.html");
    assert.deepEqual(depuisTexte(html.replace(/<[^>]+>/g, " ")), { balcon: "oui", laveVaisselle: "oui" });
  });
  it("une absence écrite vaut non", () => {
    assert.deepEqual(depuisTexte("Immeuble sans ascenseur, animaux non admis."), { animaux: "non", ascenseur: "non" });
    assert.deepEqual(depuisTexte("Linge de lit non fourni (location sur place)."), { linge: "non" });
  });
  it("une location de linge incluse n'est pas une absence", () => {
    // Description réelle GreenGo, Morzine, 6 oct. 2026.
    assert.deepEqual(depuisTexte("Le ménage et la location de linge de maison sont inclus."), { linge: "oui" });
    assert.deepEqual(depuisTexte("Location de linge sur demande."), { linge: "non" });
  });
  it("une remontée n'est pas un ascenseur", () => {
    assert.deepEqual(depuisTexte("À 50 m du ski lift"), {});
  });
  it("le silence ne donne rien", () => {
    assert.deepEqual(depuisTexte(""), {});
    assert.deepEqual(depuisTexte(null), {});
  });
});

describe("depuisListe", () => {
  it("pictogrammes réels d'Ingénie (Le Grand-Bornand)", () => {
    const html = fx("centrales/moteurs/fixtures/ingenie-grandbornand-2fiches.html");
    const titres = [...html.matchAll(/<li class="PICTOV3-[^"]*" data-title="([^"]+)"/g)].map((m) => ({ texte: m[1] }));
    const lus = depuisListe(titres);
    assert.deepEqual(lus, { wifi: "oui", laveVaisselle: "oui", parking: "oui", animaux: "oui" });
  });
  it("un équipement marqué absent par la plateforme vaut non", () => {
    assert.deepEqual(depuisListe([{ texte: "Wifi", disponible: true }, { texte: "Lave-linge", disponible: false }]), {
      wifi: "oui",
      laveLinge: "non",
    });
  });
  it("présent l'emporte sur absent du même nom", () => {
    assert.deepEqual(depuisListe([{ texte: "Parking payant", disponible: false }, { texte: "Parking gratuit" }]), { parking: "oui" });
  });
});

describe("fusionner", () => {
  it("la liste structurée l'emporte sur le texte", () => {
    assert.deepEqual(fusionner({ wifi: "non" }, { wifi: "oui", balcon: "oui" }), { wifi: "non", balcon: "oui" });
  });
});

describe("equipements", () => {
  it("les douze clés, inconnu pour ce que l'annonce ne dit pas, jamais non", () => {
    const l = equipements({ wifi: "oui" });
    assert.equal(l?.length, 12);
    assert.equal(l?.find((e) => e.cle === "wifi")?.valeur, "oui");
    assert.equal(l?.find((e) => e.cle === "piscine")?.valeur, "inconnu");
    assert.equal(l?.filter((e) => e.valeur === "non").length, 0);
  });
  it("une source lue sans rien nommer : tout inconnu ; rien de lu : null", () => {
    assert.equal(equipements({})?.every((e) => e.valeur === "inconnu"), true);
    assert.equal(equipements(null), null);
  });
});
