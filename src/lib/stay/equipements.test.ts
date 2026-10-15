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
  it("des animaux « de compagnie » admis : oui ; « chiens » seulement avec son verbe", () => {
    for (const t of [
      "Animaux de compagnie admis",
      "Animaux de compagnie acceptés",
      "Chiens admis",
    ])
      assert.deepEqual(depuisTexte(t), { animaux: "oui" }, t);
    for (const t of [
      "Pas d'animaux de compagnie",
      "Animaux de compagnie non admis",
      "Animaux domestiques non admis",
    ])
      assert.deepEqual(depuisTexte(t), { animaux: "non" }, t);
    // Une interdiction des chiens ne dit rien des autres animaux.
    assert.deepEqual(depuisTexte("Chiens non admis"), {});
  });
  it("services réels Travelski (Atria-Crozats, Avoriaz) : « Animaux domestiques admis » vaut oui", () => {
    assert.deepEqual(depuisTexte("Animaux domestiques admis"), { animaux: "oui" });
    const html = fx("agences/fixtures/travelski-fiche-8493-contenu.html");
    assert.equal(depuisTexte(html.replace(/<[^>]+>/g, " ")).animaux, "oui");
  });
  it("un local à skis se dit aussi placard, cave ou locaux ; « locals ski » anglais n'en est pas un", () => {
    // Description réelle MSEM, HORIZON 192154, Alpe d'Huez.
    assert.deepEqual(depuisTexte("Placards à Skis n°C3 + 1 EMPLACEMENT DE PARKING N°C3"), {
      casierSkis: "oui",
      parking: "oui",
    });
    for (const t of [
      "une cave à skis ou vélos",
      "cave à vélos et skis",
      "Locaux à skis",
      "Local à vélos et skis",
    ])
      assert.deepEqual(depuisTexte(t), { casierSkis: "oui" }, t);
    assert.deepEqual(depuisTexte("popular with locals ski touring"), {});
  });
  it("un billard n'est pas une piscine", () => {
    assert.deepEqual(depuisTexte("Pool table"), {});
    assert.deepEqual(depuisTexte("Games room with pool tables"), {});
    assert.deepEqual(depuisTexte("Heated pool"), { piscine: "oui" });
  });
  it("du linge en supplément ou en option est une absence ; un autre supplément ne l'est pas", () => {
    // Description réelle iResa, Les Arcs (Le Ruitor, Les Belles Challes).
    assert.deepEqual(depuisTexte("Linge de lit et de toilette en supplément."), { linge: "non" });
    assert.deepEqual(depuisTexte("Draps en supplément"), { linge: "non" });
    assert.deepEqual(depuisTexte("Linge en option"), { linge: "non" });
    for (const t of [
      "Linge de lit fourni, linge de toilette en supplément.",
      "Linge de lit fourni, ménage en supplément.",
      "Draps fournis, linge de toilette non fourni.",
      "Linge inclus.",
    ])
      assert.deepEqual(depuisTexte(t), { linge: "oui" }, t);
    assert.deepEqual(depuisTexte("Location de linge incluse."), {}, "pas une absence");
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
  it("« Animaux de compagnie admis », « Placards à skis » listés", () => {
    const lus = depuisListe([{ texte: "Animaux de compagnie admis" }, { texte: "Placards à skis" }]);
    assert.deepEqual(lus, { casierSkis: "oui", animaux: "oui" });
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
