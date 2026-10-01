import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { agencesDe, lieuxDe } from "./couverture.ts";
import {
  corpsRecherche,
  entetesRecherche,
  forfaitDeLaFormule,
  formuleSkiPossible,
  lienFiche,
  lireRecherche,
  mcListings,
  motifEcart,
  pageSuivante,
  type ProduitMC,
} from "./mountainCollection.ts";
import type { LiveSearchInput } from "../types.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const lire = (f: string): unknown => JSON.parse(readFileSync(join(dir, "fixtures", f), "utf8"));

/**
 * Réponses réelles du 26 septembre 2026, réduites aux champs que le module
 * lit : Les 2 Alpes, 6→13/02/2027, 2 adultes, hébergement seul (trois
 * logements sur 14) et formule ski (deux d'entre eux).
 */
const SEUL = lire("mc-recherche-2a.json");
const SKI = lire("mc-recherche-2a-forfait.json");

const DEUX_ALPES: LiveSearchInput = {
  stationId: "les-2-alpes",
  stationName: "Les 2 Alpes",
  lat: 45.009,
  lon: 6.122,
  checkIn: "2027-02-06",
  checkOut: "2027-02-13",
  guests: 2,
  bedrooms: 0,
};

describe("Mountain Collection : requêtes", () => {
  it("le corps est celui du site : zone, dates, adultes, hébergement seul, 30 par page", () => {
    assert.deepEqual(corpsRecherche(DEUX_ALPES, "zte_1598"), {
      lang: "fr",
      broker_code: "mci",
      page: 1,
      modeResidence: false,
      sortBy: "ranking:desc",
      per_page: 30,
      id: "zte_1598",
      dateDebut: "2027-02-06",
      dateFin: "2027-02-13",
      package: ["hebergement"],
      nbAdult: 2,
      nbChild: 0,
      childrenAges: [],
      facets: [],
    });
    assert.deepEqual(corpsRecherche(DEUX_ALPES, "zte_1598", 2, "hebergement_forfait").package, ["hebergement", "forfait"]);
  });

  it("les en-têtes sont ceux du navigateur, avec la page de recherche du site", () => {
    const h = entetesRecherche(DEUX_ALPES, "zte_1598", "hebergement_forfait");
    assert.equal(h["content-type"], "application/json");
    assert.equal(h.origin, "https://www.mountaincollection.com");
    assert.equal(
      h.referer,
      "https://www.mountaincollection.com/fr/search?id=zte_1598&date_in=2027-02-06&date_out=2027-02-13&package_id=hebergement_forfait&pax=2",
    );
  });

  it("dates, zone, voyageurs et page illisibles n'entrent pas dans la requête", () => {
    assert.throws(() => corpsRecherche({ ...DEUX_ALPES, checkIn: "06/02/2027" }, "zte_1598"));
    assert.throws(() => corpsRecherche({ ...DEUX_ALPES, checkOut: "2027-02-06" }, "zte_1598"));
    assert.throws(() => corpsRecherche(DEUX_ALPES, "1598"));
    assert.throws(() => corpsRecherche({ ...DEUX_ALPES, guests: 0 }, "zte_1598"));
    assert.throws(() => corpsRecherche(DEUX_ALPES, "zte_1598", 0));
  });

  it("la pagination suit la règle du site (Tignes : 99 en 30 + 30 + 30 + 9)", () => {
    assert.equal(pageSuivante(1, 99, 30), 2);
    assert.equal(pageSuivante(3, 99, 30), 4);
    assert.equal(pageSuivante(4, 99, 9), null);
    assert.equal(pageSuivante(1, 14, 14), null);
    assert.equal(pageSuivante(1, null, 30), null);
    assert.equal(pageSuivante(1, 99, 0), null);
  });

  it("la formule ski ne se demande que pour 7 nuits", () => {
    assert.equal(formuleSkiPossible(DEUX_ALPES), true);
    assert.equal(formuleSkiPossible({ ...DEUX_ALPES, checkIn: "2027-02-07", checkOut: "2027-02-11" }), false);
    assert.equal(formuleSkiPossible({ ...DEUX_ALPES, checkOut: "2027-02-20" }), false);
  });
});

describe("Mountain Collection : lecture", () => {
  it("Les 2 Alpes, 2 adultes : 14 annoncés, trois logements, une seule page", () => {
    const r = lireRecherche(SEUL);
    assert.equal(r.total, 14);
    assert.equal(r.recus, 3);
    assert.deepEqual(r.produits.map((p) => p.id), [2338, 2331, 5083]);
  });

  it("un logement porte tout ce qu'il faut, sans la fiche", () => {
    const p = lireRecherche(SEUL).produits.find((x) => x.id === 2331)!;
    assert.deepEqual(
      [p.titre, p.lieu, p.type, p.capacite, p.pieces, p.chambres, p.sdb, p.lat, p.lon, p.note, p.avis],
      ["EB5 - Bel apartement lumineux . Grand espace de vie . 250m des pistes", "Les 2 Alpes", "Appartement", 6, 3, 2, 2, 45.00764, 6.12237, 4, 5],
    );
    assert.deepEqual(p.depart, { debut: "2027-02-06", fin: "2027-02-13", total: 2917, hebergement: 2893, barre: null, formules: ["hebergement"] });
  });

  it("le total publié, c'est l'hébergement et 24 € de frais de dossier", () => {
    for (const p of lireRecherche(SEUL).produits) assert.equal((p.depart!.total ?? 0) - (p.depart!.hebergement ?? 0), 24, String(p.id));
  });

  it("un logement sans avis n'a ni note ni nombre d'avis", () => {
    const p = lireRecherche(SEUL).produits.find((x) => x.id === 5083)!;
    assert.deepEqual([p.note, p.avis], [null, null]);
  });

  it("la réponse dit elle-même si le forfait est compris", () => {
    assert.equal(forfaitDeLaFormule({ formules: ["hebergement"] }), false);
    assert.equal(forfaitDeLaFormule({ formules: ["hebergement", "forfait"] }), true);
    assert.equal(forfaitDeLaFormule({ formules: ["forfait", "hebergement"] }), true);
    assert.equal(forfaitDeLaFormule({ formules: ["hebergement", "forfait", "materiel"] }), null);
    assert.equal(forfaitDeLaFormule({ formules: [] }), null);
  });

  it("le même logement coûte 650 € de plus avec deux forfaits ; l'hébergement ne change pas", () => {
    const seul = lireRecherche(SEUL).produits.find((x) => x.id === 2338)!;
    const ski = lireRecherche(SKI).produits.find((x) => x.id === 2338)!;
    assert.equal(ski.depart!.hebergement, seul.depart!.hebergement);
    assert.equal((ski.depart!.total ?? 0) - (seul.depart!.total ?? 0), 650);
    assert.equal(ski.depart!.barre, 1784);
  });

  it("une réponse illisible ne rend rien", () => {
    assert.deepEqual(lireRecherche(null), { produits: [], total: null, recus: 0 });
    assert.equal(lireRecherche({ results: [{ produit: { id: 0 } }, { produit: {} }] }).produits.length, 0);
  });
});

describe("Mountain Collection : annonces", () => {
  it("un logement disponible devient une annonce datée, hébergement seul", () => {
    const ls = mcListings(lireRecherche(SEUL).produits, DEUX_ALPES);
    assert.equal(ls.length, 3);
    const l = ls.find((x) => x.platformId === "2331")!;
    assert.equal(l.id, "mc-2331");
    assert.equal(l.source, "Mountain Collection");
    assert.equal(l.total, 2917);
    assert.deepEqual([l.capacity, l.bedrooms, l.rooms, l.baths, l.propertyType], [6, 2, 3, 2, "Appartement"]);
    assert.deepEqual([l.lat, l.lon, l.locality], [45.00764, 6.12237, "Les 2 Alpes"]);
    assert.equal(l.skiPassIncluded, false);
    assert.equal(l.priceLabel, null);
    assert.equal(l.priceIndicative, false);
    assert.equal(l.url, "https://www.mountaincollection.com/fr/product/2331?pax=2&package_id=hebergement&date_in=2027-02-06&date_out=2027-02-13");
    assert.equal(l.proven, "Mountain Collection live 2027-02-06→2027-02-13");
    assert.deepEqual(ls.map((x) => x.propertyType), ["Studio", "Appartement", "Chalet"]);
    assert.equal(ls.find((x) => x.platformId === "2338")?.bedrooms, 0, "un studio : 0 chambre publiée");
  });

  it("la formule ski : une autre annonce du même logement, forfait compris et dit comme tel", () => {
    const ls = mcListings(lireRecherche(SKI).produits, DEUX_ALPES);
    assert.deepEqual(ls.map((x) => x.id), ["mc-2338-forfait", "mc-5083-forfait"]);
    const l = ls[0];
    assert.equal(l.platformId, "2338");
    assert.equal(l.total, 1764);
    assert.equal(l.skiPassIncluded, true);
    assert.equal(l.priceLabel, "Inclus : Forfait · 2 Adultes · 1 764 € au lieu de 1 784 €");
    assert.equal(l.url, "https://www.mountaincollection.com/fr/product/2338?pax=2&package_id=hebergement_forfait&date_in=2027-02-06&date_out=2027-02-13");
  });

  it("un logement à d'autres dates, avec le matériel, ou d'un type écarté n'est pas une offre", () => {
    const p = lireRecherche(SEUL).produits[0];
    const autre = (d: Partial<NonNullable<ProduitMC["depart"]>>, over: Partial<ProduitMC> = {}): ProduitMC => ({
      ...p,
      ...over,
      depart: { ...p.depart!, ...d },
    });
    assert.equal(motifEcart(autre({ debut: "2027-02-07" }), DEUX_ALPES), "autres dates");
    assert.equal(motifEcart(autre({ formules: ["hebergement", "forfait", "materiel"] }), DEUX_ALPES), "formule inconnue");
    assert.equal(motifEcart(autre({}, { type: "Hôtel" }), DEUX_ALPES), "type écarté");
    assert.equal(motifEcart(autre({ total: null }), DEUX_ALPES), "total non publié");
    assert.equal(motifEcart(p, DEUX_ALPES), null);
    assert.equal(mcListings([autre({ debut: "2027-02-07" })], DEUX_ALPES).length, 0);
  });

  it("le lien de la fiche est celui des cartes du site", () => {
    assert.equal(
      lienFiche(5083, { ...DEUX_ALPES, guests: 6 }, "hebergement_forfait"),
      "https://www.mountaincollection.com/fr/product/5083?pax=6&package_id=hebergement_forfait&date_in=2027-02-06&date_out=2027-02-13",
    );
  });
});

describe("Mountain Collection : couverture", () => {
  it("une zone par station ; Les 2 Alpes couvertes, Avoriaz non", () => {
    assert.deepEqual(lieuxDe("Mountain Collection", "les-2-alpes"), ["zte_1598"]);
    assert.ok(agencesDe("les-2-alpes").includes("Mountain Collection"));
    assert.ok(!agencesDe("avoriaz").includes("Mountain Collection"));
  });
});
