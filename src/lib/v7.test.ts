import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  altLbl,
  aStation,
  bedLbl,
  bedNomme,
  capLbl,
  capNomme,
  CHIPS,
  linked,
  maxM,
  minM,
  NON_RENSEIGNE,
  sansDomaineLbl,
  sub,
} from "./v7.ts";
import type { Listing } from "./listings.ts";
import { qualifierLogement } from "./stay/logement.ts";
import { GPS_FIXES, sansDomaineAlpin, UNNAMED_DOMAIN } from "./classeur.ts";
import { STATIONS } from "./stations.ts";

describe("aStation — la préposition suit l'article du nom", () => {
  it("contracte, élide, ou laisse « à » selon l'article", () => {
    assert.equal(aStation("Les 2 Alpes"), "aux 2 Alpes");
    assert.equal(aStation("Le Corbier"), "au Corbier");
    assert.equal(aStation("L'Audibergue - La Moulière"), "à l’Audibergue - La Moulière");
    assert.equal(aStation("L’Audibergue"), "à l’Audibergue");
    assert.equal(aStation("Tignes"), "à Tignes");
  });

  it("donne son article aux Alpe, que le référentiel leur refuse", () => {
    assert.equal(aStation("Alpe d'Huez"), "à l’Alpe d'Huez");
    assert.equal(aStation("Alpe du Grand Serre"), "à l’Alpe du Grand Serre");
    // « Alpes du Sud » n'est pas une station, mais la règle `alpes?` la prendrait :
    // c'est voulu, elle s'écrit pareil.
    assert.equal(aStation("Alpes d'Huez"), "à l’Alpes d'Huez");
  });

  it("rend une chaîne vide plutôt que « à » orphelin", () => {
    assert.equal(aStation(""), "");
    assert.equal(aStation(null), "");
    assert.equal(aStation(undefined), "");
    assert.equal(aStation("   "), "");
  });

  it("aucune station du référentiel ne produit « à Le », « à Les » ou « à L' »", () => {
    // Majuscule volontaire : « à l'Alpe d'Huez » est l'élision correcte, « à
    // L'Audibergue » la faute. Seule la capitale les distingue.
    const fautives = STATIONS.map((s) => aStation(s.name)).filter((p) =>
      /^à L(es? |['’])/.test(p),
    );
    assert.deepEqual(fautives, []);
  });

  it("le référentiel a bien des noms à article : la règle n'est pas décorative", () => {
    const contractes = STATIONS.map((s) => aStation(s.name)).filter((p) => !p.startsWith("à "));
    assert.ok(contractes.length > 20, `${contractes.length} noms contractés`);
  });
});

describe("positions relevées à la main", () => {
  it("les vingt-deux corrections sont posées", () => {
    assert.equal(Object.keys(GPS_FIXES).length, 22);
    for (const [id, [lat, lon]] of Object.entries(GPS_FIXES)) {
      const s = STATIONS.find((x) => x.id === id);
      assert.ok(s, `${id} absente du référentiel`);
      assert.equal(s.lat, lat, `${id} : latitude`);
      assert.equal(s.lon, lon, `${id} : longitude`);
      assert.equal(s.posRelevee, true, `${id} : position dite relevée`);
    }
  });

  it("Lanslebourg quitte le centre de sa commune", () => {
    // Le classeur la posait à 5,7 km de ses pistes : c'est la correction la
    // plus ample des vingt-deux.
    const s = STATIONS.find((x) => x.id === "lanslebourg")!;
    assert.equal(s.lat, 45.286);
    assert.equal(s.lon, 6.879);
  });

  it("une station sans relevé ni correction se dit approximative", () => {
    const sans = STATIONS.filter((s) => !s.posRelevee);
    assert.ok(sans.length > 0, "le référentiel a des positions de commune");
    for (const s of sans.slice(0, 20)) {
      assert.equal(s.pinKind, "inconnu");
      assert.ok(!(s.id in GPS_FIXES));
    }
  });
});

describe("« Domaine relié »", () => {
  it("le libellé sans nom d'OpenStreetMap n'est pas un domaine relié", () => {
    // Névache (0,4 km, 1 remontée) passait la puce, et Comparer écrivait
    // « domaine non nommé (OpenStreetMap) » au lieu de « Non ».
    for (const id of ["plateau-de-beille", "nevache", "saint-colomban-villards"]) {
      const s = STATIONS.find((x) => x.id === id)!;
      assert.equal(s.domain, UNNAMED_DOMAIN, id);
      assert.equal(linked(s), false, id);
      assert.equal(CHIPS.linked.fn(s), false, id);
    }
    // Une station d'un domaine qui porte un autre nom reste reliée ; une
    // station sans domaine, non.
    assert.equal(linked(STATIONS.find((x) => x.id === "val-thorens")!), true);
    assert.equal(linked(STATIONS.find((x) => x.id === "la-bourboule")!), false);
  });
});

describe("sans domaine alpin : une donnée, pas un relevé manquant", () => {
  it("La Bourboule se lit « sans domaine alpin », et ses 0 m ne sont pas une mesure", () => {
    const bourboule = STATIONS.find((x) => x.id === "la-bourboule")!;
    assert.equal(sansDomaineAlpin(bourboule.id), true);
    assert.equal(sansDomaineLbl(bourboule), "sans domaine alpin");
    assert.equal(sub(bourboule), `${bourboule.massif} · sans domaine alpin`);
    // 0 m au référentiel : ni bas, ni haut, ni fourchette.
    assert.equal(bourboule.minM, 0);
    assert.equal(minM(bourboule), null);
    assert.equal(maxM(bourboule), null);
    assert.equal(altLbl(bourboule), null);
  });

  it("un domaine seulement non relevé reste « non renseigné »", () => {
    // Le Granier du dépôt n'a pas de domaine rattaché : on ne sait pas, on ne
    // dit pas « sans ».
    const granier = STATIONS.find((x) => x.id === "le-granier-vallee-des-entremonts")!;
    assert.equal(granier.domain, null);
    assert.equal(sansDomaineLbl(granier), null);
    assert.match(sub(granier), /domaine non renseigné$/);
    // Les Monts du Pilat : 0 m aussi, mais aucune correction ne dit pourquoi.
    const pilat = STATIONS.find((x) => x.id === "les-monts-du-pilat")!;
    assert.equal(altLbl(pilat), null);
    assert.equal(sansDomaineLbl(pilat), null);
    // Seules les stations que `DOMAINES_CORRIGES` détache sont « sans ».
    assert.deepEqual(
      STATIONS.filter((s) => sansDomaineAlpin(s.id)).map((s) => s.id),
      ["la-bourboule"],
    );
  });
});

describe("chambres et capacité affichées", () => {
  const logement = (title: string, over: Partial<Listing> = {}): Listing =>
    qualifierLogement({
      id: "l",
      stationId: "les-2-alpes",
      title,
      source: "Centrale",
      total: 1000,
      currency: "EUR",
      capacity: null,
      bedrooms: null,
      available: true,
      photo: null,
      url: null,
      lat: null,
      lon: null,
      proven: "",
      ...over,
    });

  it("un studio se dit « Studio », jamais « 0 ch. », cabine à part", () => {
    assert.equal(bedLbl(logement("Studio 2 personnes")), "Studio");
    assert.equal(bedLbl(logement("Studio cabine 4 personnes")), "Studio + cabine");
    assert.equal(bedLbl(logement("Appartement", { bedrooms: 0 })), "Studio");
  });

  it("des chambres tirées des pièces s'affichent en pièces", () => {
    assert.equal(bedLbl(logement("T2 4 personnes")), "2 pièces");
    assert.equal(bedLbl(logement("2 pièces cabine 6 personnes")), "2 pièces + cabine");
    assert.equal(bedLbl(logement("Appartement 3 pièces 2 chambres")), "2 ch.");
  });

  it("des chambres écrites ou publiées s'affichent en chambres", () => {
    assert.equal(bedLbl(logement("Chalet 3 chambres 8 personnes")), "3 ch.");
    assert.equal(bedLbl(logement("Appartement 3 pièces", { bedrooms: 2, rooms: 3 })), "2 ch.");
    assert.equal(bedLbl(logement("T2", { bedrooms: 1, bedroomsSource: "structured" })), "1 ch.");
  });

  it("une fourchette de capacité garde sa base", () => {
    assert.equal(capLbl(logement("Appartement 4/6 personnes")), "4/6 pers.");
    assert.equal(capLbl(logement("Appartement 6 personnes")), "6 pers.");
    assert.equal(capLbl(logement("Appartement")), "Non renseigné");
  });
});

describe("ce qui n'est pas renseigné se dit, l'annonce reste", () => {
  const muette = {
    id: "m",
    stationId: "les-2-alpes",
    title: "Les Balcons de Val Cenis le Haut",
    source: "Centrale",
    total: 1000,
    currency: "EUR",
    capacity: null,
    bedrooms: null,
    available: true,
    photo: null,
    url: null,
    lat: null,
    lon: null,
    proven: "",
  } as const satisfies Listing;

  it("« Non renseigné » dans une case titrée, nommé ailleurs", () => {
    assert.equal(capLbl(muette), NON_RENSEIGNE);
    assert.equal(bedLbl(muette), NON_RENSEIGNE);
    assert.equal(capNomme(muette), "Capacité : Non renseigné");
    assert.equal(bedNomme(muette), "Chambres : Non renseigné");
  });

  it("une valeur connue garde son libellé", () => {
    const studio = { ...muette, capacity: 2, bedrooms: 0 };
    assert.equal(capNomme(studio), "2 pers.");
    assert.equal(bedNomme(studio), "Studio");
  });
});
