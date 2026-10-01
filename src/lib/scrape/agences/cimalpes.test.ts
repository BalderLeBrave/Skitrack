import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cibleCimalpes, cimalpesListings, dateSite, lireRecherche, nombrePages, urlRecherche } from "./cimalpes.ts";
import { agencesDe, lieuxDe } from "./couverture.ts";
import type { LiveSearchInput } from "../types.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const fx = (f: string) => readFileSync(join(dir, "fixtures", f), "utf8");

/**
 * Réponses réelles du 26 septembre 2026 (`{html, total}`), réduites à
 * quelques cartes : Val Thorens à 2 voyageurs (dont un studio), Courchevel à
 * 14 voyageurs (dont « Prix sur demande »), Crest-Voland (deux cartes, et
 * deux suggestions d'autres stations à couper).
 */
const VAL_THORENS = fx("cimalpes-recherche-val-thorens.json");
const COURCHEVEL = fx("cimalpes-recherche-courchevel-14p.json");
const CREST_VOLAND = fx("cimalpes-recherche-crest-voland.json");

const VT: LiveSearchInput = {
  stationId: "val-thorens",
  stationName: "Val Thorens",
  lat: 45.297,
  lon: 6.58,
  checkIn: "2027-02-06",
  checkOut: "2027-02-13",
  guests: 2,
  bedrooms: 0,
};

describe("Cimalpes : requêtes", () => {
  it("la recherche porte la station, ses secteurs, les dates du site et les voyageurs", () => {
    assert.equal(
      urlRecherche(VT, cibleCimalpes("25")),
      "https://cimalpes.com/fr/recherche-location/?page_nb=1&ajax=1&tri=Recommand%C3%A9&date_debut=06%2F02%2F2027&date_fin=13%2F02%2F2027&station_id=25&nbrVoyageurs=2",
    );
    const u = new URL(urlRecherche({ ...VT, guests: 14 }, cibleCimalpes("1:7"), 3));
    assert.equal(u.searchParams.get("page_nb"), "3");
    assert.equal(u.searchParams.get("nbrVoyageurs"), "14");
    assert.deepEqual(u.searchParams.getAll("secteurs[]"), ["7"]);
  });

  it("dates et lieux illisibles ne partent pas", () => {
    assert.equal(dateSite("2027-02-06"), "06/02/2027");
    assert.throws(() => dateSite("06/02/2027"));
    assert.throws(() => cibleCimalpes("1&x=2"));
    assert.deepEqual(cibleCimalpes("21:109,110"), { station: 21, secteurs: [109, 110] });
  });

  it("26 logements par page, bornés", () => {
    assert.equal(nombrePages(137), 6);
    assert.equal(nombrePages(23), 1);
    assert.equal(nombrePages(0), 0);
    assert.equal(nombrePages(null), 1);
    assert.equal(nombrePages(10_000), 10);
  });
});

describe("Cimalpes : lecture", () => {
  it("Val Thorens : le compte du site et les cartes", () => {
    const r = lireRecherche(VAL_THORENS);
    assert.equal(r.total, 23);
    assert.equal(r.suggestions, 0);
    assert.deepEqual(r.cartes.map((c) => c.id), ["2096", "3795", "2813"]);
  });

  it("une carte : titre, lieu, capacité, chambres, surface, type, prix, dates, photos", () => {
    const c = lireRecherche(VAL_THORENS).cartes[0];
    assert.equal(c.titre, "Appartement Vanoise 462");
    assert.equal(c.lieu, "Val Thorens - Centre & proche centre");
    assert.deepEqual([c.capacite, c.chambres, c.surface, c.type], [12, 2, 85, "Appartement"]);
    assert.deepEqual([c.prix, c.libellePrix, c.aPartirDe], [8100, "8 100 € /semaine", false]);
    assert.deepEqual([c.dateDebut, c.dateFin], ["2027-02-06", "2027-02-13"]);
    assert.equal(c.url, "https://cimalpes.com/fr/location-val-thorens/appartement-vanoise-462/?date_debut=06/02/2027&date_fin=13/02/2027");
    assert.deepEqual(c.photos, ["https://cimalpes.com/cache/photos/400/photos_bien_2096_d43_8154-modifier.jpg"]);
  });

  it("un studio n'a pas de chambre", () => {
    const c = lireRecherche(VAL_THORENS).cartes.find((x) => x.id === "2813")!;
    assert.deepEqual([c.chambres, c.surface, c.studio], [0, 28, true]);
  });

  it("chaque valeur dit sa source : la ligne de la carte est un texte, le 0 d'un studio un type", () => {
    const ls = cimalpesListings(lireRecherche(VAL_THORENS).cartes, VT);
    const studio = ls.find((l) => l.id === "cim-2813")!;
    assert.deepEqual(
      [studio.bedrooms, studio.isStudio, studio.bedroomsSource, studio.capacitySource],
      [0, true, "derived_from_type", "text_regex"],
    );
    const autre = ls.find((l) => l.id !== "cim-2813" && l.bedrooms != null && l.bedrooms > 0)!;
    assert.deepEqual([autre.isStudio, autre.bedroomsSource], [false, "text_regex"]);
  });

  it("« Prix sur demande » : pas de prix, le libellé reste", () => {
    const r = lireRecherche(COURCHEVEL);
    const c = r.cartes.find((x) => x.id === "1748")!;
    assert.deepEqual([c.prix, c.libellePrix], [null, "Prix sur demande"]);
    assert.equal(r.cartes.find((x) => x.id === "926")?.type, "Chalet");
  });

  it("les suggestions d'autres stations sont coupées", () => {
    const r = lireRecherche(CREST_VOLAND);
    assert.equal(r.total, 5);
    assert.deepEqual(r.cartes.map((c) => c.id), ["3791", "3989"]);
    assert.equal(r.suggestions, 2);
  });

  it("une réponse illisible ne rend rien", () => {
    assert.deepEqual(lireRecherche("<html>erreur</html>"), { total: null, cartes: [], suggestions: 0 });
    assert.deepEqual(lireRecherche({ html: "", total: 0 }), { total: 0, cartes: [], suggestions: 0 });
  });
});

describe("Cimalpes : annonces", () => {
  it("les cartes datées deviennent des annonces, sans position (la fiche la donnera)", () => {
    const ls = cimalpesListings(lireRecherche(VAL_THORENS).cartes, VT);
    assert.equal(ls.length, 3);
    const l = ls[0];
    assert.equal(l.id, "cim-2096");
    assert.equal(l.source, "Cimalpes");
    assert.equal(l.total, 8100);
    assert.equal(l.priceIndicative, false);
    assert.deepEqual([l.capacity, l.bedrooms, l.propertyType, l.locality], [12, 2, "Appartement", "Val Thorens - Centre & proche centre"]);
    assert.deepEqual([l.lat, l.lon], [null, null]);
    assert.equal(l.skiPassIncluded, false);
    assert.equal(l.priceLabel, "8 100 € /semaine");
    assert.equal(l.proven, "Cimalpes live 2027-02-06→2027-02-13");
  });

  it("« Prix sur demande » reste, prix non publié", () => {
    const ls = cimalpesListings(lireRecherche(COURCHEVEL).cartes, { ...VT, stationId: "courchevel", guests: 14 });
    const l = ls.find((x) => x.platformId === "1748")!;
    assert.deepEqual([l.total, l.priceIndicative, l.priceLabel], [0, null, "Prix sur demande"]);
  });

  it("une carte d'autres dates, ou « Dès », n'est pas une offre", () => {
    const [c] = lireRecherche(VAL_THORENS).cartes;
    assert.equal(cimalpesListings([{ ...c, dateDebut: "2027-02-13", dateFin: "2027-02-20" }], VT).length, 0);
    assert.equal(cimalpesListings([{ ...c, aPartirDe: true, libellePrix: "Dès 8 100 €" }], VT).length, 0);
    assert.equal(cimalpesListings([c, c], VT).length, 1, "une carte vue deux fois, une annonce");
  });
});

describe("Cimalpes : couverture", () => {
  it("la station du site, ou un secteur pour une station plus fine", () => {
    assert.deepEqual(lieuxDe("Cimalpes", "val-thorens"), ["25"]);
    assert.deepEqual(lieuxDe("Cimalpes", "courchevel-le-praz"), ["1:7"]);
    assert.ok(agencesDe("courchevel").includes("Cimalpes"));
    assert.ok(!agencesDe("avoriaz").includes("Cimalpes"));
  });
});
