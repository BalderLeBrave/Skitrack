import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  domainBySlug,
  domainForStation,
  estimationDuDomaine,
  FORFAIT_CATALOG,
  passLinkFor,
  prixDeduits,
  rattachementForfait,
  stationHasGlacier,
} from "./catalog.ts";
import { linkedSkiStations, rejugerDomaine } from "../domainFit.ts";
import type { Listing } from "../listings.ts";
import { STATIONS, stationById } from "../stations.ts";

describe("catalogue forfaits FR", () => {
  it("ne contient que la France", () => {
    assert.ok(FORFAIT_CATALOG.length > 100);
    assert.ok(FORFAIT_CATALOG.every((d) => d.country === "FR"));
  });

  it("relie les 8 stations mises en avant", () => {
    for (const id of [
      "les-2-alpes",
      "chamonix",
      "val-thorens",
      "tignes",
      "meribel",
      "val-disere",
      "alpe-d-huez",
      "la-clusaz",
    ]) {
      const d = domainForStation(id);
      assert.ok(d, id);
      assert.ok(d.seed?.j6 != null, id);
    }
  });

  it("glacier catalogue : 2 Alpes oui, Méribel non", () => {
    assert.equal(stationHasGlacier("les-2-alpes"), true);
    assert.equal(stationHasGlacier("tignes"), true);
    assert.equal(stationHasGlacier("meribel"), false);
    assert.equal(stationHasGlacier("la-clusaz"), false);
  });

  it("forfait lié publié, km de zone lus pas inventés", () => {
    const vt = passLinkFor("val-thorens", 150);
    assert.equal(vt.isLinked, true);
    assert.equal(vt.linkedKm, 600);
    assert.ok(vt.line?.includes("3 Vallées"));
    const meribel = passLinkFor("meribel", 150);
    assert.equal(meribel.isLinked, true);
    assert.equal(meribel.linkedKm, 600);
    const tignes = passLinkFor("tignes", 150);
    assert.equal(tignes.isLinked, true);
    assert.equal(tignes.pass, "Espace Killy");
    const twoA = passLinkFor("les-2-alpes", 225);
    assert.equal(twoA.isLinked, false);
    const clusaz = passLinkFor("la-clusaz", 125);
    assert.equal(clusaz.isLinked, false);
  });
});

/**
 * Les prix que le catalogue d'août calculait à partir du 6 jours adulte et
 * affichait « Prix relevé ». Aucune grille Skiinfo française ne suit à la fois
 * la journée à 6 jours ÷ 5,3 et l'enfant à 0,8 × 6 jours, ni la saison à
 * 3,05 × 6 jours : un prix affiché comme relevé qui les suit est un calcul.
 */
describe("forfaits calculés, affichés estimés (26 septembre 2026)", () => {
  it("aucun prix affiché comme relevé ne suit les rapports du calcul", () => {
    const fautifs: string[] = [];
    for (const d of FORFAIT_CATALOG) {
      const s = d.seed;
      if (!s || s.j6 == null) continue;
      const calcule = prixDeduits(s.j6);
      if (s.j1 != null && s.enf6 != null && s.j1 === calcule.j1 && s.enf6 === calcule.enf6) {
        fautifs.push(`${d.slug} : journée ${s.j1} € et 6 jours enfant ${s.enf6} € tirés de ${s.j6} €`);
      }
      if (s.saison != null && s.saison === calcule.saison) {
        fautifs.push(`${d.slug} : saison ${s.saison} € = 3,05 × ${s.j6} €`);
      }
    }
    assert.deepEqual(fautifs, []);
  });

  it("aucune fiche n'affiche comme relevé un prix calculé, domaine hérité compris", () => {
    // La fiche lit la graine du domaine rattaché : Avoriaz, Morzine ou Les
    // Gets reprennent celle d'avoriaz-1800.
    for (const s of STATIONS) {
      const seed = rattachementForfait(s.id, s.domain)?.domaine.seed;
      if (!seed || seed.j6 == null) continue;
      const calcule = prixDeduits(seed.j6);
      assert.ok(!(seed.j1 === calcule.j1 && seed.enf6 === calcule.enf6), `${s.id} : journée et enfant calculés`);
      assert.notEqual(seed.saison, calcule.saison, `${s.id} : saison calculée`);
    }
  });

  it("le 6 jours adulte reste relevé ; journée et enfant passent en estimation", () => {
    const ps = domainBySlug("avoriaz-1800");
    assert.equal(ps?.seed?.j6, 292);
    assert.equal(ps?.seed?.j1, null);
    assert.equal(ps?.seed?.enf6, null);
    assert.equal(ps?.seed?.saison, null, "3,05 × 292 manque la vraie saison : pas d'estimation");
    assert.deepEqual(estimationDuDomaine(ps), { j1: 55, enf6: 234 });
    // Une entrée dont les prix ne suivent pas les rapports garde les siens.
    const killy = domainBySlug("tignes-val-d-isere");
    assert.deepEqual([killy?.seed?.j1, killy?.seed?.j6, killy?.seed?.enf6, killy?.seed?.saison], [65, 335, 268, 1150]);
    assert.equal(estimationDuDomaine(killy), null);
  });

  it("une estimation suit les rapports, et ne double jamais un prix relevé", () => {
    let n = 0;
    for (const d of FORFAIT_CATALOG) {
      const e = estimationDuDomaine(d);
      if (!e) continue;
      n += 1;
      const j6 = d.seed?.j6;
      assert.ok(j6 != null, `${d.slug} : estimation sans 6 jours relevé`);
      assert.deepEqual(e, { j1: prixDeduits(j6).j1, enf6: prixDeduits(j6).enf6 }, d.slug);
      assert.equal(d.seed?.j1, null, `${d.slug} : journée à la fois relevée et estimée`);
      assert.equal(d.seed?.enf6, null, `${d.slug} : enfant à la fois relevé et estimé`);
    }
    assert.equal(n, 142);
  });

  it("3 Vallées : saison non relevée partout, Val Thorens pas aligné sur Courchevel", () => {
    const dix = FORFAIT_CATALOG.filter((d) => d.pass === "Les 3 Vallées");
    assert.equal(dix.length, 10);
    for (const d of dix) {
      assert.equal(d.seed?.saison, null, d.slug);
      assert.equal(d.seed?.j6, 359, d.slug);
    }
    // Val Thorens suivait la journée et l'enfant, pas la saison (1 090 €).
    assert.deepEqual(estimationDuDomaine(domainBySlug("val-thorens-orelle")), { j1: 68, enf6: 287 });
  });
});

describe("La Giettaz : Portes du Mont-Blanc, pas l'Espace Diamant", () => {
  const g = domainBySlug("la-giettaz");

  it("l'entrée porte son domaine et aucun prix tant qu'il n'est pas relevé", () => {
    assert.equal(g?.id, 228);
    assert.equal(g?.pass, "Portes du Mont-Blanc");
    assert.equal(g?.seed?.zone, "Portes du Mont-Blanc");
    for (const k of ["j1", "j6", "enf6", "saison"] as const) assert.equal(g?.seed?.[k], null, k);
    assert.equal(estimationDuDomaine(g), null);
    // Les chiffres du référentiel pour La Giettaz, plus ceux de l'Espace
    // Diamant (192 km, 74 remontées, 1 150–2 069 m).
    assert.deepEqual([g?.km, g?.lifts, g?.minM, g?.maxM], [89.5, 30, 1200, 1930]);
    // valdarly-montblanc.com est le site du Val d'Arly, donc de l'Espace
    // Diamant : un relevé automatique y lirait encore son tarif.
    assert.equal(g?.website, null);
  });

  it("ni Evasion Mont-Blanc, ni les 312 € de Combloux", () => {
    assert.notEqual(g?.pass, "Evasion Mont-Blanc");
    assert.notEqual(g?.pass, "Espace Diamant");
    const r = rattachementForfait("la-giettaz", "Les Portes du Mont-Blanc");
    assert.equal(r?.domaine.slug, "la-giettaz");
    assert.equal(r?.domaine.seed?.j6, null, "aucun tarif affiché");
    // Combloux garde son entrée ; Cordon, sans entrée, n'hérite de rien.
    assert.equal(rattachementForfait("combloux", "Les Portes du Mont-Blanc")?.domaine.slug, "combloux");
    assert.equal(rattachementForfait("cordon", "Les Portes du Mont-Blanc"), undefined);
  });

  it("le pass ne relie plus La Giettaz aux stations de l'Espace Diamant", () => {
    const liees = linkedSkiStations("la-giettaz");
    // Les quatre stations de l'Espace Diamant que le pass lui reliait : le
    // relevé de La Giettaz gardait 53 de leurs annonces sur 102, à 5,7–7 km,
    // et celui de Crest-Voland 5 annonces de La Giettaz.
    for (const id of ["praz-sur-arly", "notre-dame-de-bellecombe", "crest-voland-cohennoz", "bisanne-1500"]) {
      assert.ok(!liees.has(id), id);
    }
    for (const id of liees) {
      const pass = domainForStation(id)?.pass;
      assert.ok(pass !== "Espace Diamant" && pass !== "Evasion Mont-Blanc", `${id} : ${pass}`);
    }
  });

  it("les relevés déjà faits suivent sans attendre : le verdict est rejugé à la relecture", () => {
    // Le verdict enregistré est celui du jour du relevé, mais `prix/annonces.ts`
    // le rejuge à chaque lecture (`rejugerDomaine`) : l'effet du pass est
    // immédiat, sans relever La Giettaz à nouveau. Une annonce au repère d'une
    // station, enregistrée « linked » comme avant le 26 septembre 2026.
    const au = (lieu: string, releve: string): Listing => {
      const s = stationById(lieu)!;
      return {
        id: `repere-${lieu}`,
        stationId: releve,
        title: "Appartement",
        source: "Airbnb",
        total: 1500,
        currency: "EUR",
        guests: 6,
        bedrooms: 3,
        available: true,
        photo: null,
        url: null,
        lat: s.lat,
        lon: s.lon,
        proven: "repère de la station, pas une annonce relevée",
        domainFit: "linked",
      };
    };
    const giettaz = stationById("la-giettaz");
    const crest = stationById("crest-voland-cohennoz");
    // Praz-sur-Arly sort du relevé de La Giettaz, La Giettaz de celui de
    // Crest-Voland.
    assert.equal(rejugerDomaine(au("praz-sur-arly", "la-giettaz"), giettaz).domainFit, "other");
    assert.equal(rejugerDomaine(au("la-giettaz", "crest-voland-cohennoz"), crest).domainFit, "other");
    // Le relevé de Crest-Voland, dans l'Espace Diamant, garde Praz-sur-Arly :
    // un logement de Praz que ce relevé a trouvé lui aussi reste dans « Par
    // budget ».
    assert.equal(rejugerDomaine(au("praz-sur-arly", "crest-voland-cohennoz"), crest).domainFit, "linked");
    assert.equal(rejugerDomaine(au("la-giettaz", "la-giettaz"), giettaz).domainFit, "in");
  });
});
