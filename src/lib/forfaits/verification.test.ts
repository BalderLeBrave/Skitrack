import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GrilleTarifaire, Periode, Tarif } from "./tarifsPeriode.ts";
import {
  confronter,
  fichesDesStations,
  fourchetteAdulte,
  grilleSkiinfo,
  texteConfrontation,
  verifierGrille,
  type FicheSkiinfo,
} from "./verification.ts";

/** La fiche Skiinfo « Chatel » telle que relevée le 21 septembre 2026. */
const CHATEL: FicheSkiinfo = {
  cle: "alpes-du-nord/chatel",
  nom: "Chatel",
  pays: "FR",
  devise: "EUR",
  deviseSource: "page",
  misAJour: "15 oct. 2025",
  categories: [
    { nom: "Enfant", ages: null },
    { nom: "Junior", ages: null },
    { nom: "Adulte", ages: null },
    { nom: "Sénior", ages: null },
  ],
  lignes: [
    { libelle: "Forfait journée", prix: [42, 50, 56, 50] },
    { libelle: "Forfait journée (le week-end)", prix: [42, 45, 45, 45] },
    { libelle: "Forfait 1/2j (ou 4h si proposé)", prix: [36, 43, 48, 43] },
    { libelle: "Forfait 2 jour", prix: [80, 95, 106, 95] },
    { libelle: "Forfait semaine", prix: [224, 267, 295, 267] },
  ],
  saison: {
    libelle: "2025-2026 Tarif valable jusqu'au 19 avr. 2026",
    validite: null,
    categories: [{ nom: "Adulte", ages: "26-64" }],
    prix: [757],
  },
};

const tarif = (jours: number, prix: number, extra: Partial<Tarif> = {}): Tarif => ({
  duree: { type: "jours", jours },
  libelleDuree: `${jours} jours`,
  categorie: "adulte",
  libelleCategorie: "Adulte",
  ages: null,
  prix,
  devise: "EUR",
  canal: "caisse",
  restriction: null,
  ...extra,
});
const periode = (libelle: string, debut: string, fin: string, tarifs: Tarif[]): Periode => ({
  libelle,
  debut,
  fin,
  saisonEntiere: false,
  tarifs,
});
const PDS: GrilleTarifaire = {
  id: "officiel:chatel:boutique:portes-du-soleil:2026-27",
  saison: "2026-27",
  perimetre: { type: "domaine", cle: "domaine:portes-du-soleil", nom: "Portes du Soleil" },
  stationIds: ["abondance", "avoriaz", "chatel"],
  periodes: [
    periode("Plein tarif", "2026-12-19", "2027-03-19", [
      tarif(1, 73),
      tarif(6, 373),
      tarif(6, 352, { canal: "en-ligne" }),
    ]),
    periode("Tarif basse saison", "2027-03-20", "2027-04-18", [tarif(1, 62), tarif(6, 317)]),
  ],
  source: { origine: "officiel", url: null, libelle: "Boutique officielle" },
  scrapeLe: "2026-09-30",
  confiance: "haute",
  notes: [],
};

describe("vérification Skiinfo : la grille témoin", () => {
  const t = grilleSkiinfo(CHATEL, ["chatel"], "2026-09-21")!;

  it("la saison de la mise à jour, une période « saison entière », Skiinfo pour source", () => {
    assert.equal(t.saison, "2025-26");
    assert.equal(t.periodes.length, 1);
    assert.equal(t.periodes[0].saisonEntiere, true);
    assert.equal(t.source.origine, "skiinfo");
  });

  it("journée et « Forfait semaine » (6 jours) adulte ; le week-end, restreint, n'y entre pas", () => {
    assert.deepEqual(fourchetteAdulte(t, 1), { min: 56, max: 56 });
    assert.deepEqual(fourchetteAdulte(t, 6), { min: 295, max: 295 });
  });
});

describe("vérification Skiinfo : la comparaison", () => {
  const temoin = grilleSkiinfo(CHATEL, ["chatel"], "2026-09-21")!;

  it("la fourchette d'une grille : toutes périodes, au prix caisse", () => {
    assert.deepEqual(fourchetteAdulte(PDS, 6), { min: 317, max: 373 });
    assert.deepEqual(fourchetteAdulte(PDS, 1), { min: 62, max: 73 });
  });

  it("Portes du Soleil face à la fiche « Chatel » (Espace Liberté) : écart dit, sous le seuil", () => {
    const c = confronter(PDS, temoin)!;
    assert.deepEqual(
      c.comparaisons.map((x) => [x.jours, x.temoin, x.ecart]),
      [
        [1, 56, 0.1071],
        [6, 295, 0.0746],
      ],
    );
    assert.equal(c.alerte, false);
    assert.match(
      texteConfrontation(c),
      /6 jours adulte 317 € à 373 €, Skiinfo 295 € \(écart 7 %\)/,
    );
  });

  it("au-delà de 30 % : à vérifier", () => {
    const loin: GrilleTarifaire = {
      ...PDS,
      periodes: [periode("Hiver", "2026-12-19", "2027-04-18", [tarif(1, 90), tarif(6, 480)])],
    };
    const c = confronter(loin, temoin)!;
    assert.equal(c.alerte, true);
    assert.match(texteConfrontation(c), /à vérifier$/);
  });

  it("un prix dans la fourchette : écart nul", () => {
    const large: GrilleTarifaire = {
      ...PDS,
      periodes: [
        periode("Basse", "2026-12-19", "2027-01-31", [tarif(6, 280)]),
        periode("Haute", "2027-02-01", "2027-04-18", [tarif(6, 320)]),
      ],
    };
    assert.equal(confronter(large, temoin)!.comparaisons[0].ecart, 0);
  });

  it("deux devises : rien ne se compare", () => {
    const chf: GrilleTarifaire = {
      ...PDS,
      periodes: [periode("Hiver", "2026-12-19", "2027-04-18", [tarif(6, 373, { devise: "CHF" })])],
    };
    assert.equal(confronter(chf, temoin), null);
  });
});

describe("vérification Skiinfo : une grille, ses stations", () => {
  const temoin = grilleSkiinfo(CHATEL, [], "2026-09-21");

  it("une confrontation par fiche, pas par station", () => {
    const c = verifierGrille(
      PDS,
      (id) => (id === "avoriaz" ? null : "alpes-du-nord/chatel"),
      () => temoin,
    );
    assert.equal(c.length, 1);
  });

  it("une grille venue de Skiinfo ne se vérifie pas contre elle-même", () => {
    const g = grilleSkiinfo(CHATEL, ["chatel"], "2026-09-21")!;
    assert.deepEqual(
      verifierGrille(
        g,
        () => "alpes-du-nord/chatel",
        () => temoin,
      ),
      [],
    );
  });

  it("le rattachement d'une station à sa fiche : françaises seulement, avec une grille", () => {
    const m = fichesDesStations(
      [
        { id: "chatel", name: "Châtel", domain: "Portes du Soleil", lat: 46.27, lon: 6.84 },
        { id: "loin", name: "Ailleurs", domain: null, lat: 45.0, lon: 3.0 },
      ],
      { "alpes-du-nord/chatel": CHATEL, "valais/morgins": { ...CHATEL, cle: "valais/morgins" } },
      {
        "alpes-du-nord/chatel": { nom: "Chatel", lat: 46.2699, lon: 6.8418, pays: "FR-FR" },
        "valais/morgins": { nom: "Morgins", lat: 46.238, lon: 6.855, pays: "CH-CH" },
        "sans/grille": { nom: "Sans grille", lat: 45.0, lon: 3.0, pays: "FR-FR" },
      },
    );
    assert.equal(m.get("chatel")?.cle, "alpes-du-nord/chatel");
    assert.equal(m.has("loin"), false);
  });
});
