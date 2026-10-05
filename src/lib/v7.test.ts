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
import { villageById } from "./villages.ts";

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
  it("les vingt-deux corrections sont posées, sur la station ou sur son village", () => {
    // Depuis le 5 octobre 2026, dix-huit des vingt-deux sont des villages
    // (`villages.ts`) : la position relevée est celle du village, avec sa
    // source, et le village se rattache à sa station.
    assert.equal(Object.keys(GPS_FIXES).length, 22);
    for (const [id, [lat, lon]] of Object.entries(GPS_FIXES)) {
      const s = STATIONS.find((x) => x.id === id);
      if (s) {
        assert.equal(s.lat, lat, `${id} : latitude`);
        assert.equal(s.lon, lon, `${id} : longitude`);
        assert.equal(s.posRelevee, true, `${id} : position dite relevée`);
        continue;
      }
      const v = villageById(id);
      assert.ok(v, `${id} : ni station ni village`);
      assert.equal(v.lat, lat, `${id} : latitude`);
      assert.equal(v.lon, lon, `${id} : longitude`);
      assert.equal(v.source, "releve", `${id} : source`);
    }
  });

  it("Lanslebourg quitte le centre de sa commune", () => {
    // Le classeur la posait à 5,7 km de ses pistes : c'est la correction la
    // plus ample des vingt-deux. Lanslebourg est un village de Val Cenis.
    const v = villageById("lanslebourg")!;
    assert.equal(v.station, "val-cenis");
    assert.equal(v.lat, 45.286);
    assert.equal(v.lon, 6.879);
  });

  it("chaque station a une position relevée", () => {
    // Les positions de commune étaient celles des lignes que seul le
    // classeur décrivait. Depuis le 5 octobre 2026, toutes les stations ont
    // une fiche Skiinfo, et un pin relevé.
    assert.deepEqual(
      STATIONS.filter((s) => !s.posRelevee).map((s) => s.id),
      [],
    );
  });
});

describe("« Domaine relié »", () => {
  it("se lit dans la table des grands domaines reliés, pas dans le libellé", () => {
    // Le libellé sans nom d'OpenStreetMap ne relie rien : Beille ne l'est pas.
    // Saint-Colomban, qui le porte aussi, est sur les Sybelles.
    const beille = STATIONS.find((x) => x.id === "plateau-de-beille")!;
    assert.equal(beille.domain, UNNAMED_DOMAIN);
    assert.equal(linked(beille), false);
    assert.equal(CHIPS.linked.fn(beille), false);
    assert.equal(linked(STATIONS.find((x) => x.id === "saint-colomban-villards")!), true);
    // Une station seule de son domaine OpenStreetMap n'est reliée à rien,
    // même si le domaine porte un autre nom qu'elle.
    const serre = STATIONS.find((x) => x.id === "serre-chevalier")!;
    assert.equal(serre.domain, "Serre-Chevalier");
    assert.equal(linked(serre), false);
    // Un forfait commercial ne relie pas non plus : Val Cenis et l'Espace
    // Haute Maurienne Vanoise.
    assert.equal(linked(STATIONS.find((x) => x.id === "val-cenis")!), false);
    assert.equal(linked(STATIONS.find((x) => x.id === "val-thorens")!), true);
  });
});

describe("sans domaine alpin : une donnée, pas un relevé manquant", () => {
  // La Bourboule, seule station que `DOMAINES_CORRIGES` détache, a quitté le
  // référentiel le 5 octobre 2026 (sans fiche Skiinfo). La règle demeure :
  // le cas se fabrique sous son identifiant.
  const bourboule = { ...STATIONS.find((x) => x.id === "le-mont-dore")!, id: "la-bourboule", name: "La Bourboule", domain: null, minM: 0, maxM: 0 };

  it("une station détachée de son domaine se lit « sans domaine alpin », et ses 0 m ne sont pas une mesure", () => {
    assert.equal(sansDomaineAlpin(bourboule.id), true);
    assert.equal(sansDomaineLbl(bourboule), "sans domaine alpin");
    assert.equal(sub(bourboule), `${bourboule.massif} · sans domaine alpin`);
    // 0 m au référentiel : ni bas, ni haut, ni fourchette.
    assert.equal(minM(bourboule), null);
    assert.equal(maxM(bourboule), null);
    assert.equal(altLbl(bourboule), null);
  });

  it("un domaine seulement non relevé reste « non renseigné »", () => {
    // Une station sans domaine rattaché, que rien ne détache : on ne sait pas,
    // on ne dit pas « sans ».
    const granier = STATIONS.find((x) => x.id === "le-granier-vallee-des-entremonts")!;
    assert.equal(granier.domain, null);
    assert.equal(sansDomaineLbl(granier), null);
    assert.match(sub(granier), /domaine non renseigné$/);
    // Aucune station du référentiel n'est « sans ».
    assert.deepEqual(
      STATIONS.filter((s) => sansDomaineAlpin(s.id)).map((s) => s.id),
      [],
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
