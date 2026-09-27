import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  annoncesAlpissime,
  forfaitDansLeDetail,
  idsDuPlan,
  lirePage,
  montant,
  pagesAttendues,
  positionPlausible,
  releverStation,
  stationAlpissime,
  typePublie,
  urlRecherche,
  villageGarde,
} from "./alpissime.ts";
import { agencesDe, lieuxDe } from "./couverture.ts";
import type { LiveSearchInput } from "../types.ts";

const dir = dirname(fileURLToPath(import.meta.url));
/**
 * Réponses réelles du 26 septembre 2026, réduites (voir leur en-tête) :
 * Valloire à 2 adultes, page 1 (deux cartes sur neuf, le témoin réduit à leur
 * immeuble) et page 2 (une carte) ; Valloire à 6 adultes (une carte) ; toutes
 * stations du dimanche 7 au jeudi 11 (le studio d'un particulier d'Arc 1800) ;
 * Valloire du dimanche au jeudi, sans résultat.
 */
const fx = (f: string) => readFileSync(join(dir, "fixtures", f), "utf8");
const PAGES = new Map<number, string>([
  [1, fx("alpissime-valloire-2p-p1.html")],
  [2, fx("alpissime-valloire-2p-p2.html")],
]);

const VALLOIRE: LiveSearchInput = {
  stationId: "valloire",
  stationName: "Valloire",
  lat: 45.1654,
  lon: 6.4287,
  checkIn: "2027-02-06",
  checkOut: "2027-02-13",
  guests: 2,
  bedrooms: 0,
};
const ST = stationAlpissime("83", "valloire");

function lireFixture(url: string): Promise<string> {
  const p = Number(new URL(url).searchParams.get("page") ?? "1");
  const html = PAGES.get(p);
  return html ? Promise.resolve(html) : Promise.reject(new Error("HTTP 404"));
}

describe("Alpissime : requêtes", () => {
  it("la recherche porte la station, les dates du formulaire et les adultes ; les pages suivent les liens du site", () => {
    assert.equal(
      urlRecherche(VALLOIRE, ST),
      "https://www.alpissime.com/recherche?lieugeo=83&village=0&dbt=06-02-2027&fin=13-02-2027&nbCouchage_ad=2&nbCouchage_enf=0",
    );
    assert.equal(
      urlRecherche({ ...VALLOIRE, guests: 6 }, ST, 3),
      "https://www.alpissime.com/recherche?lieugeo=83&village=0&dbt=06-02-2027&fin=13-02-2027&nbCouchage_ad=6&nbCouchage_enf=0&nb_etoiles=0&page=3",
    );
  });

  it("des dates ou une station illisibles ne partent pas", () => {
    assert.throws(() => urlRecherche({ ...VALLOIRE, checkIn: "06/02/2027" }, ST));
    assert.throws(() => stationAlpissime("83&x=1", "valloire"));
  });

  it("neuf cartes par page, bornées", () => {
    assert.equal(pagesAttendues(85), 10);
    assert.equal(pagesAttendues(9), 1);
    assert.equal(pagesAttendues(0), 1);
    assert.equal(pagesAttendues(null), 1);
    assert.equal(pagesAttendues(10_000), 20);
  });

  it("les montants dans les deux formats du site", () => {
    assert.equal(montant("1 610,00 €"), 1610);
    assert.equal(montant("1,683.10 €"), 1683.1);
    assert.equal(montant("23.10 €"), 23.1);
    assert.equal(montant("1 683 €"), 1683);
    assert.equal(montant("abc"), null);
  });
});

describe("Alpissime : page de résultats", () => {
  const p1 = lirePage(PAGES.get(1)!);

  it("page 1 : le compteur, les cartes, et le témoin de leur immeuble", () => {
    assert.equal(p1.annoncees, 85);
    assert.deepEqual(p1.cartes.map((c) => c.id), ["3397", "3425"]);
    assert.deepEqual(p1.plan?.map((i) => [i.id, i.nom]), [["743", "Residence Valoria"]]);
    assert.deepEqual([...idsDuPlan(p1.plan ?? [])], ["1787", "3397", "3425"]);
  });

  it("une carte : total exact et son détail, capacité, surface, type, village, position, photos, lien daté", () => {
    const c = p1.cartes.find((x) => x.id === "3397")!;
    assert.equal(c.titre, "2 pièces 4 personnes 3* exposé ouest");
    assert.equal(c.total, 1683.1);
    assert.equal(c.libelleTotal, "Total : 1 683 €");
    assert.deepEqual([c.nuits, c.loyer, c.taxeSejour, c.fraisService, c.fraisMenage], [7, 1610, 23.1, 50, 0]);
    assert.equal(c.coherent, true);
    assert.deepEqual([c.capacite, c.surface, c.libelleType, c.typeUrl, c.village], [4, 29, "Appart.", "appartement", "Valloire"]);
    assert.deepEqual([c.lat, c.lon], [45.165874, 6.434137]);
    assert.equal(c.photos.length, 4);
    assert.match(c.photos[0], /^https:\/\/www\.alpissime\.com\/images_ann\/3397\/vignette-3397-1\.P\.jpg/);
    assert.equal(
      c.url,
      "https://www.alpissime.com/station/valloire/appartement/3397_2-pieces-4-personnes-3-expose-ouest/06-02-2027/13-02-2027/2/0",
    );
  });

  it("le « / Nuit » n'est pas daté : 137 € la nuit, mais 1 230 € les sept nuits", () => {
    const c = p1.cartes.find((x) => x.id === "3425")!;
    assert.equal(c.prixNuit, 137);
    assert.equal(c.loyer, 1230);
    assert.equal(c.total, 1293.86);
  });

  it("six adultes : taxe de séjour pour six, lien pour six", () => {
    const p = lirePage(fx("alpissime-valloire-6p-p1.html"));
    assert.equal(p.annoncees, 32);
    const c = p.cartes[0];
    assert.equal(c.taxeSejour, 69.3);
    assert.equal(c.capacite, 6);
    assert.ok(c.coherent && c.url?.endsWith("/06-02-2027/13-02-2027/6/0"));
  });

  it("un particulier des Arcs, dimanche → jeudi : ménage obligatoire compté, frais de service au pourcentage", () => {
    const p = lirePage(fx("alpissime-toutes-dim-jeu.html"));
    assert.equal(p.annoncees, 22);
    const c = p.cartes.find((x) => x.id === "3573")!;
    assert.deepEqual([c.nuits, c.loyer, c.taxeSejour, c.fraisService, c.fraisMenage, c.total], [4, 420, 20.24, 73.08, 151, 664.32]);
    assert.equal(c.coherent, true);
    assert.equal(c.village, "Arc 1800 – Villards");
    assert.equal(typePublie(c), "Studio");
  });

  it("aucun résultat : compteur à zéro, témoin vide", () => {
    const p = lirePage(fx("alpissime-valloire-dim-jeu.html"));
    assert.equal(p.vide, true);
    assert.equal(p.annoncees, 0);
    assert.equal(p.cartes.length, 0);
    assert.deepEqual(p.plan, []);
  });
});

describe("Alpissime : relevé d'une station", () => {
  it("les pages une à une ; la page qui manque arrête la pagination, et ce qui a été lu reste", async () => {
    const lues: string[] = [];
    const r = await releverStation(VALLOIRE, ST, (u) => {
      lues.push(u);
      return lireFixture(u);
    });
    assert.equal(lues.length, 3, "pages 1, 2, puis 3 refusée");
    assert.equal(r.pagesLues, 2);
    assert.equal(r.annoncees, 85);
    assert.deepEqual(r.cartes.map((c) => c.id), ["3397", "3425", "1820"]);
    assert.match(r.raison ?? "", /^page 3 : HTTP 404$/);
    assert.deepEqual(r.manquantes, ["1787"]);
  });

  it("la page 1 en échec fait échouer le relevé", async () => {
    await assert.rejects(releverStation(VALLOIRE, ST, () => Promise.reject(new Error("HTTP 429"))), /HTTP 429/);
  });

  it("les annonces : identifiant, source, total, capacité, type, lien, position, immeuble, hébergement seul", async () => {
    const r = await releverStation(VALLOIRE, ST, lireFixture);
    const ls = annoncesAlpissime(r, VALLOIRE, ST);
    assert.equal(ls.length, 3);
    const l = ls.find((x) => x.platformId === "3397")!;
    assert.equal(l.id, "alp-3397");
    assert.equal(l.source, "Alpissime");
    assert.equal(l.total, 1683.1);
    assert.equal(l.priceIndicative, false);
    assert.equal(l.guests, 4);
    assert.equal(l.bedrooms, null, "les chambres ne sont que sur la fiche");
    assert.equal(l.propertyType, "Appartement");
    assert.equal(l.locality, "Valloire");
    assert.equal(l.placeName, "Residence Valoria");
    assert.deepEqual([l.lat, l.lon], [45.165874, 6.434137]);
    assert.equal(l.proven, "Alpissime live 2027-02-06→2027-02-13");
    assert.ok(ls.every((x) => x.skiPassIncluded === false));
    assert.equal(ls.find((x) => x.platformId === "1820")?.placeName, "Valloire", "hors du témoin réduit : le village");
  });

  it("un studio publié n'a pas de chambre", () => {
    const [c] = lirePage(fx("alpissime-toutes-dim-jeu.html")).cartes;
    const arcs = { ...VALLOIRE, stationId: "arc-1800", lat: 45.573, lon: 6.779, checkIn: "2027-02-07", checkOut: "2027-02-11" };
    const [l] = annoncesAlpissime({ cartes: [c], plan: null }, arcs, stationAlpissime("66", "arc-1800"));
    assert.deepEqual([l.propertyType, l.bedrooms, l.guests, l.total], ["Studio", 0, 2, 664.32]);
  });
});

describe("Alpissime : règles", () => {
  it("une position loin de la station (le centre de la France par défaut) n'est pas gardée", () => {
    assert.equal(positionPlausible(46.768128652547375, 2.226554257812481, VALLOIRE), false);
    assert.equal(positionPlausible(45.165874, 6.434137, VALLOIRE), true);
    assert.equal(positionPlausible(null, 6.4, VALLOIRE), false);
  });

  it("le village publié départage les stations fines, tirets et accents repliés", () => {
    const arc1800 = stationAlpissime("66", "arc-1800");
    assert.equal(villageGarde({ village: "Arc 1800 – Villards" }, arc1800), true);
    assert.equal(villageGarde({ village: "Arc 1800 - villards" }, arc1800), true);
    assert.equal(villageGarde({ village: "Arc 1600 – Station" }, arc1800), false);
    assert.equal(villageGarde({ village: null }, arc1800), false);
    assert.equal(villageGarde({ village: "Arc 1600 – Station" }, stationAlpissime("66", "les-arcs-bourg-st-maurice")), true);
  });

  it("forfait compris : jamais dans le total daté ; une ligne qui le nommerait le dirait ; sans détail, on ne sait pas", () => {
    const base = {
      total: 1000,
      detail: [
        { libelle: "7 Nuits", montant: 950 },
        { libelle: "Frais de service", montant: 50 },
        { libelle: "Total", montant: 1000 },
      ],
    };
    assert.equal(forfaitDansLeDetail(base), false);
    assert.equal(forfaitDansLeDetail({ ...base, detail: [...base.detail, { libelle: "Forfaits de ski", montant: 800 }] }), true);
    assert.equal(forfaitDansLeDetail({ total: null, detail: [] }), null);
  });

  it("le type : l'abréviation de la carte, sinon le segment du lien", () => {
    assert.equal(typePublie({ libelleType: "Appart.", typeUrl: "appartement" }), "Appartement");
    assert.equal(typePublie({ libelleType: "Chalet", typeUrl: "chalet" }), "Chalet");
    assert.equal(typePublie({ libelleType: null, typeUrl: "gite" }), "Gîte");
    assert.equal(typePublie({ libelleType: null, typeUrl: "location" }), null);
  });

  it("couverture : une station du site par station Skitrack, les villages pour les plus fines", () => {
    assert.deepEqual(lieuxDe("Alpissime", "valloire"), ["83"]);
    assert.deepEqual(lieuxDe("Alpissime", "arc-1800"), ["66"]);
    assert.equal(stationAlpissime("66", "arc-1800").villages?.length, 4);
    assert.equal(stationAlpissime("83", "valloire").villages, null);
    assert.ok(agencesDe("valloire").includes("Alpissime"));
    assert.ok(!agencesDe("avoriaz").includes("Alpissime"));
  });
});
