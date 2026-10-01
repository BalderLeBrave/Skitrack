import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decalerAnnees,
  grillesCandidates,
  joursDeSki,
  periodeDuJour,
  resolvePassPrice,
  type OptionsResolution,
  type PrixResolu,
  type Resolution,
} from "./resolution.ts";
import type {
  CategorieTarif,
  Confiance,
  GrilleTarifaire,
  OrigineGrille,
  Periode,
  Tarif,
} from "./tarifsPeriode.ts";

/* ---------- Grilles d'essai ---------- */

const tarif = (
  jours: number | "semaine",
  prix: number,
  categorie: CategorieTarif = "adulte",
  extra: Partial<Tarif> = {},
): Tarif => ({
  duree: jours === "semaine" ? { type: "semaine" } : { type: "jours", jours },
  libelleDuree: jours === "semaine" ? "Forfait semaine" : `${jours} jour${jours > 1 ? "s" : ""}`,
  categorie,
  libelleCategorie: categorie === "adulte" ? "Adulte 26-64" : "Enfant 5-15",
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

let n = 0;
const grille = (
  periodes: Periode[],
  extra: Partial<GrilleTarifaire> & { origine?: OrigineGrille; confiance?: Confiance } = {},
): GrilleTarifaire => {
  const { origine = "officiel", ...reste } = extra;
  n += 1;
  return {
    id: `essai:${n}`,
    saison: "2026-27",
    perimetre: { type: "domaine", cle: "domaine:portes-du-soleil", nom: "Portes du Soleil" },
    stationIds: ["chatel"],
    periodes,
    source: { origine, url: "https://exemple.fr/tarifs", libelle: "Page tarifs officielle" },
    scrapeLe: "2026-09-30",
    confiance: "haute",
    notes: [],
    ...reste,
  };
};

/** Portes du Soleil 2026-27, prix caisse relevés sur la boutique de Châtel le
 *  30 septembre 2026 : 373 € jusqu'au 19 mars, 317 € ensuite. */
const PDS = grille(
  [
    periode("Plein tarif", "2026-12-19", "2027-03-19", [
      tarif(1, 69),
      tarif(6, 373),
      tarif(7, 435),
      tarif(6, 280, "enfant"),
    ]),
    periode("Tarif basse saison", "2027-03-20", "2027-04-18", [
      tarif(1, 59),
      tarif(6, 317),
      tarif(7, 370),
      tarif(6, 238, "enfant"),
    ]),
  ],
  { stationIds: ["avoriaz", "chatel", "les-gets"] },
);

const opts = (
  grilles: GrilleTarifaire[],
  o: Partial<OptionsResolution> = {},
): OptionsResolution => ({
  grilles,
  aujourdhui: "2026-09-30",
  ...o,
});

function resolu(r: Resolution): PrixResolu {
  assert.equal(r.statut, "resolu", "detail" in r ? r.detail : "");
  return r as PrixResolu;
}

const CHATEL = { id: "chatel" };

/* ---------- Dates ---------- */

describe("jours de ski : les nuits moins une", () => {
  it("7 nuits du samedi au samedi : 6 jours, du dimanche au vendredi", () => {
    const j = joursDeSki({ arrivee: "2027-02-13", depart: "2027-02-20" })!;
    assert.equal(j.length, 6);
    assert.equal(j[0], "2027-02-14");
    assert.equal(j[5], "2027-02-19");
  });

  it("une nuit : un jour, celui de l'arrivée ; un nombre imposé qui ne tient pas après l'arrivée commence le jour même", () => {
    assert.deepEqual(joursDeSki({ arrivee: "2027-02-13", depart: "2027-02-14" }), ["2027-02-13"]);
    const j = joursDeSki({ arrivee: "2027-02-13", depart: "2027-02-20" }, 7)!;
    assert.equal(j[0], "2027-02-13");
    assert.equal(j.length, 7);
  });

  it("dates illisibles, départ avant l'arrivée : null", () => {
    assert.equal(joursDeSki({ arrivee: "2027-02-20", depart: "2027-02-13" }), null);
    assert.equal(joursDeSki({ arrivee: "2027-02-30", depart: "2027-03-02" }), null);
    assert.equal(joursDeSki({ arrivee: "", depart: "2027-03-02" }), null);
  });

  it("le report d'une année garde le jour ; le 29 février devient le 28", () => {
    assert.equal(decalerAnnees("2027-02-13", -1), "2026-02-13");
    assert.equal(decalerAnnees("2028-02-29", -1), "2027-02-28");
  });
});

/* ---------- Bornes inclusives ---------- */

describe("bornes inclusives", () => {
  it("le premier et le dernier jour d'une période en font partie", () => {
    const p = PDS.periodes;
    assert.equal(periodeDuJour("2026-12-19", p)?.periode.libelle, "Plein tarif");
    assert.equal(periodeDuJour("2027-03-19", p)?.periode.libelle, "Plein tarif");
    assert.equal(periodeDuJour("2027-03-20", p)?.periode.libelle, "Tarif basse saison");
    assert.equal(periodeDuJour("2027-04-18", p)?.periode.libelle, "Tarif basse saison");
  });

  it("un séjour dont le dernier jour de ski est la fin de la période reste dans la période", () => {
    // Arrivée le 13 mars, départ le 20 : ski du 14 au 19, fin incluse.
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-03-13", depart: "2027-03-20" }, opts([PDS])),
    );
    assert.equal(r.prix, 373);
    assert.equal(r.calcul, "une-periode");
    assert.equal(r.drapeaux.surDeuxPeriodes, false);
    assert.deepEqual(r.periode, {
      libelle: "Plein tarif",
      debut: "2026-12-19",
      fin: "2027-03-19",
      saisonEntiere: false,
    });
    assert.deepEqual(r.joursSki, { premier: "2027-03-14", dernier: "2027-03-19" });
    assert.equal(r.fiabilite, "haute");
  });

  it("un séjour dont le premier jour de ski est le début de la période y est entier", () => {
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-03-19", depart: "2027-03-26" }, opts([PDS])),
    );
    assert.equal(r.prix, 317);
    assert.equal(r.periode.libelle, "Tarif basse saison");
  });
});

/* ---------- Séjour sur deux périodes ---------- */

describe("séjour à cheval sur deux périodes", () => {
  it("au prorata des jours quand les deux publient la durée : 3 j à 373 €, 3 j à 317 €", () => {
    // Ski du 17 au 22 mars : 17, 18, 19 en plein tarif ; 20, 21, 22 en basse saison.
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-03-16", depart: "2027-03-23" }, opts([PDS])),
    );
    assert.equal(r.calcul, "prorata");
    assert.equal(r.prix, 345);
    assert.equal(r.drapeaux.surDeuxPeriodes, true);
    assert.deepEqual(
      r.periodes.map((p) => [p.libelle, p.jours, p.prix]),
      [
        ["Plein tarif", 3, 373],
        ["Tarif basse saison", 3, 317],
      ],
    );
    // À égalité de jours, la période affichée est la plus chère.
    assert.equal(r.periode.libelle, "Plein tarif");
    assert.equal(r.fiabilite, "haute");
    assert.match(r.notes.join(" "), /prorata/);
  });

  it("prorata inégal : 4 j à 373 €, 2 j à 317 €, arrondi au centime", () => {
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-03-15", depart: "2027-03-22" }, opts([PDS])),
    );
    assert.equal(r.prix, 354.33);
    assert.equal(r.periode.libelle, "Plein tarif");
  });

  it("période majoritaire quand l'une ne publie pas la durée, drapeau levé, fiabilité abaissée", () => {
    const g = grille([
      periode("Haute saison", "2026-12-19", "2027-03-19", [tarif(1, 69), tarif(6, 373)]),
      periode("Printemps", "2027-03-20", "2027-04-18", [tarif(1, 59), tarif(2, 110)]),
    ]);
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-03-15", depart: "2027-03-22" }, opts([g])),
    );
    assert.equal(r.calcul, "periode-majoritaire");
    assert.equal(r.prix, 373);
    assert.equal(r.periode.libelle, "Haute saison");
    assert.equal(r.drapeaux.surDeuxPeriodes, true);
    assert.deepEqual(
      r.periodes.map((p) => [p.libelle, p.jours, p.prix]),
      [
        ["Haute saison", 4, 373],
        ["Printemps", 2, null],
      ],
    );
    assert.equal(r.fiabilite, "moyenne");
  });

  it("la majorité va à la période qui publie le forfait, même minoritaire en jours", () => {
    const g = grille([
      periode("Haute saison", "2026-12-19", "2027-03-19", [tarif(6, 373)]),
      periode("Printemps", "2027-03-20", "2027-04-18", [tarif(1, 59)]),
    ]);
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-03-17", depart: "2027-03-24" }, opts([g])),
    );
    assert.equal(r.calcul, "periode-majoritaire");
    assert.equal(r.prix, 373);
    assert.deepEqual(
      r.periodes.map((p) => p.jours),
      [2, 4],
    );
  });
});

/* ---------- Chevauchement ---------- */

describe("périodes qui se chevauchent : la plus courte l'emporte", () => {
  const g = grille([
    periode("Haute saison", "2026-12-19", "2027-04-18", [tarif(1, 69), tarif(6, 373)]),
    periode("Vacances de Noël", "2026-12-19", "2027-01-03", [tarif(1, 72), tarif(6, 390)]),
  ]);

  it("un séjour dans Noël prend le prix de Noël", () => {
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2026-12-19", depart: "2026-12-26" }, opts([g])),
    );
    assert.equal(r.prix, 390);
    assert.equal(r.periode.libelle, "Vacances de Noël");
    assert.equal(r.drapeaux.surDeuxPeriodes, false);
  });

  it("un séjour qui déborde de Noël : prorata entre Noël et la haute saison", () => {
    // Ski du 30 décembre au 4 janvier : 30, 31, 1, 2, 3 en Noël, 4 en haute saison.
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2026-12-29", depart: "2027-01-05" }, opts([g])),
    );
    assert.equal(r.calcul, "prorata");
    assert.equal(r.prix, 387.17);
    assert.equal(r.periode.libelle, "Vacances de Noël");
  });

  it("une période courte qui ne publie pas le forfait ne masque pas la longue", () => {
    const flash = grille([
      periode("Haute saison", "2026-12-19", "2027-04-18", [tarif(6, 373)]),
      periode("Journée découverte", "2027-01-10", "2027-01-10", [tarif(1, 20)]),
    ]);
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-01-08", depart: "2027-01-15" }, opts([flash])),
    );
    assert.equal(r.prix, 373);
    assert.equal(r.calcul, "une-periode");
  });
});

/* ---------- Durée ---------- */

describe("durée du séjour absente de la grille", () => {
  it("5 jours de ski, forfait 6 jours retenu et signalé", () => {
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-02-13", depart: "2027-02-19" }, opts([PDS])),
    );
    assert.deepEqual(r.duree, { demandee: 5, retenue: 6, libelle: "6 jours" });
    assert.equal(r.drapeaux.dureeSuperieure, true);
    assert.equal(r.prix, 373);
    assert.match(r.notes.join(" "), /Pas de forfait 5 jours publié/);
  });

  it("« Forfait semaine » vaut 6 jours ; un « 6 jours » écrit passe avant", () => {
    const semaine = grille([
      periode("Hiver", "2026-12-19", "2027-04-18", [tarif(1, 50), tarif("semaine", 250)]),
    ]);
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-02-13", depart: "2027-02-20" }, opts([semaine])),
    );
    assert.equal(r.prix, 250);
    assert.equal(r.duree.libelle, "Forfait semaine");
    const deux = grille([
      periode("Hiver", "2026-12-19", "2027-04-18", [tarif("semaine", 250), tarif(6, 260)]),
    ]);
    const r2 = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-02-13", depart: "2027-02-20" }, opts([deux])),
    );
    assert.equal(r2.prix, 260);
  });

  it("aucune durée assez longue : échec qui dit les durées publiées", () => {
    const r = resolvePassPrice(
      CHATEL,
      { arrivee: "2027-02-01", depart: "2027-02-15" },
      opts([PDS]),
    );
    assert.equal(r.statut, "duree-absente");
    assert.deepEqual("dureesDisponibles" in r && r.dureesDisponibles, [1, 6, 7]);
  });

  it("un nombre de jours imposé remplace les nuits moins une", () => {
    const r = resolu(
      resolvePassPrice(
        CHATEL,
        { arrivee: "2027-02-13", depart: "2027-02-20" },
        opts([PDS], { joursSki: 7 }),
      ),
    );
    assert.equal(r.duree.retenue, 7);
    assert.equal(r.prix, 435);
  });
});

/* ---------- Station qui ne vend que la journée ---------- */

describe("station qui ne vend que la journée : les journées additionnées", () => {
  const JOURNEE = grille(
    [
      periode("Vacances", "2026-12-19", "2027-01-03", [tarif(1, 12), tarif(1, 10, "enfant")]),
      periode("Hors vacances", "2027-01-04", "2027-03-31", [tarif(1, 10), tarif(1, 8, "enfant")]),
    ],
    {
      stationIds: ["lullin"],
      perimetre: { type: "station", cle: "station:col-du-feu", nom: "Col du Feu" },
    },
  );
  const LULLIN = { id: "lullin" };

  it("6 jours de ski : 6 × la journée, signalé", () => {
    const r = resolu(
      resolvePassPrice(LULLIN, { arrivee: "2027-02-13", depart: "2027-02-20" }, opts([JOURNEE])),
    );
    assert.equal(r.prix, 60);
    assert.equal(r.calcul, "journees");
    assert.equal(r.drapeaux.journeesAdditionnees, true);
    assert.deepEqual(r.duree, { demandee: 6, retenue: 1, libelle: "1 jour" });
    assert.match(r.notes.join(" "), /6 journées additionnées \(6 × 10 €\)/);
    assert.equal(r.fiabilite, "haute");
  });

  it("à cheval sur deux périodes, chaque jour au prix de la sienne", () => {
    // Ski du 31 décembre au 5 janvier : 31, 1, 2, 3 en vacances, 4 et 5 hors vacances.
    const r = resolu(
      resolvePassPrice(LULLIN, { arrivee: "2026-12-30", depart: "2027-01-06" }, opts([JOURNEE])),
    );
    assert.equal(r.prix, 4 * 12 + 2 * 10);
    assert.equal(r.drapeaux.surDeuxPeriodes, true);
    assert.equal(r.periode.libelle, "Vacances");
  });

  it("l'enfant aussi, et sans dates : 6 × la journée de la période la plus proche", () => {
    const e = resolu(
      resolvePassPrice(
        LULLIN,
        { arrivee: "2027-02-13", depart: "2027-02-20" },
        opts([JOURNEE], { categorie: "enfant" }),
      ),
    );
    assert.equal(e.prix, 48);
    const s = resolu(resolvePassPrice(LULLIN, null, opts([JOURNEE], { aujourdhui: "2026-09-30" })));
    assert.equal(s.prix, 72);
    assert.equal(s.periode.libelle, "Vacances");
  });

  it("pas de forfait semaine (1 et 2 jours, La Schlucht) : 6 × la journée", () => {
    const deux = grille(
      [periode("Hiver", "2026-12-19", "2027-04-18", [tarif(1, 19.7), tarif(2, 39)])],
      {
        stationIds: ["la-schlucht"],
      },
    );
    const schlucht = { id: "la-schlucht" };
    const r = resolu(
      resolvePassPrice(schlucht, { arrivee: "2027-02-13", depart: "2027-02-20" }, opts([deux])),
    );
    assert.equal(r.prix, 118.2);
    assert.equal(r.calcul, "journees");
    assert.match(r.notes.join(" "), /jusqu'à 2 jours seulement : 6 journées additionnées/);
    // Le forfait publié garde la main quand il couvre le séjour.
    const court = resolu(
      resolvePassPrice(schlucht, { arrivee: "2027-02-13", depart: "2027-02-16" }, opts([deux])),
    );
    assert.equal(court.prix, 39);
    assert.equal(court.calcul, "une-periode");
  });

  it("un forfait semaine trop court pour le séjour ne s'additionne pas (13 jours)", () => {
    const r = resolvePassPrice(
      CHATEL,
      { arrivee: "2027-02-01", depart: "2027-02-15" },
      opts([PDS]),
    );
    assert.equal(r.statut, "duree-absente");
  });

  it("en dernier recours : un forfait semaine publié ailleurs passe avant l'addition", () => {
    // La page officielle ne vend que la journée ; Skiinfo publiait un forfait
    // semaine deux saisons plus tôt : c'est lui qui sert, signalé.
    const skiinfo = grille(
      [periode("Saison", "2024-12-21", "2025-03-30", [tarif("semaine", 55)])],
      {
        origine: "skiinfo",
        saison: "2024-25",
        stationIds: ["lullin"],
        perimetre: { type: "station", cle: "station:col-du-feu", nom: "Col du Feu" },
      },
    );
    const r = resolu(
      resolvePassPrice(
        LULLIN,
        { arrivee: "2027-02-13", depart: "2027-02-20" },
        opts([JOURNEE, skiinfo]),
      ),
    );
    assert.equal(r.prix, 55);
    assert.equal(r.calcul, "une-periode");
    assert.equal(r.drapeaux.journeesAdditionnees, false);
    assert.equal(r.drapeaux.saisonAnterieure, true);
  });
});

/* ---------- Grille trop ancienne ---------- */

describe("grille de plus de trois saisons : non publié", () => {
  const vieille = (saison: string) =>
    grille(
      [
        {
          ...periode(
            "Saison entière",
            `${saison.slice(0, 4)}-08-01`,
            `${Number(saison.slice(0, 4)) + 1}-07-31`,
            [tarif(6, 150)],
          ),
          saisonEntiere: true,
        },
      ],
      { saison, origine: "skiinfo", confiance: "faible" },
    );

  it("trois saisons avant le séjour : reprise, signalée", () => {
    const r = resolu(
      resolvePassPrice(
        CHATEL,
        { arrivee: "2027-02-13", depart: "2027-02-20" },
        opts([vieille("2023-24")]),
      ),
    );
    assert.equal(r.drapeaux.saisonAnterieure, true);
    assert.equal(r.fiabilite, "faible");
  });

  it("quatre saisons avant : « grille-ancienne », le prix n'est pas repris", () => {
    const r = resolvePassPrice(
      CHATEL,
      { arrivee: "2027-02-13", depart: "2027-02-20" },
      opts([vieille("2022-23")]),
    );
    assert.equal(r.statut, "grille-ancienne");
    assert.match("detail" in r ? r.detail : "", /2022-23/);
  });
});

/* ---------- Grille absente, catégorie manquante ---------- */

describe("grille absente, catégorie manquante", () => {
  it("aucune grille pour la station : échec « grille-absente »", () => {
    const r = resolvePassPrice(
      { id: "gourette" },
      { arrivee: "2027-02-13", depart: "2027-02-20" },
      opts([PDS]),
    );
    assert.equal(r.statut, "grille-absente");
  });

  it("une grille d'une saison postérieure ne vaut pas pour le séjour", () => {
    const r = resolvePassPrice(
      CHATEL,
      { arrivee: "2026-02-13", depart: "2026-02-20" },
      opts([PDS]),
    );
    assert.equal(r.statut, "grille-absente");
  });

  it("catégorie non publiée : échec qui dit les catégories publiées, jamais le prix adulte", () => {
    const r = resolvePassPrice(
      CHATEL,
      { arrivee: "2027-02-13", depart: "2027-02-20" },
      opts([PDS], { categorie: "senior" }),
    );
    assert.equal(r.statut, "categorie-absente");
    assert.deepEqual("categoriesDisponibles" in r && r.categoriesDisponibles, ["adulte", "enfant"]);
  });

  it("une estimation n'est pas un prix : elle est rendue à part, pas comptée", () => {
    const g = grille(
      [
        {
          ...periode("Saison entière", "2026-08-01", "2027-07-31", [
            tarif(6, 292),
            tarif(6, 234, "enfant", { estime: true }),
          ]),
          saisonEntiere: true,
        },
      ],
      { origine: "catalogue", confiance: "faible" },
    );
    const r = resolvePassPrice(
      CHATEL,
      { arrivee: "2027-02-13", depart: "2027-02-20" },
      opts([g], { categorie: "enfant" }),
    );
    assert.equal(r.statut, "categorie-absente");
    assert.deepEqual("estimation" in r && r.estimation, {
      prix: 234,
      devise: "EUR",
      libelle: "6 jours Enfant 5-15",
    });
  });

  it("un tarif restreint n'est pas le tarif ordinaire", () => {
    const g = grille([
      periode("Hiver", "2026-12-19", "2027-04-18", [
        tarif(6, 200, "adulte", { restriction: "famille" }),
        tarif(6, 373),
      ]),
    ]);
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-02-13", depart: "2027-02-20" }, opts([g])),
    );
    assert.equal(r.prix, 373);
  });

  it("le prix en caisse passe avant le prix en ligne", () => {
    const g = grille([
      periode("Hiver", "2026-12-19", "2027-04-18", [
        tarif(6, 352, "adulte", { canal: "en-ligne" }),
        tarif(6, 373),
      ]),
    ]);
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-02-13", depart: "2027-02-20" }, opts([g])),
    );
    assert.equal(r.prix, 373);
    assert.equal(r.canal, "caisse");
  });

  it("dates illisibles : échec « dates-invalides »", () => {
    const r = resolvePassPrice(
      CHATEL,
      { arrivee: "2027-02-20", depart: "2027-02-20" },
      opts([PDS]),
    );
    assert.equal(r.statut, "dates-invalides");
  });
});

/* ---------- Enfant : le tarif junior ---------- */

describe("enfant sans tarif enfant publié : le tarif junior", () => {
  const junior = (ages: { min: number | null; max: number | null } | null, libelle: string) =>
    grille([
      periode("Hiver", "2026-12-19", "2027-04-18", [
        tarif(1, 29),
        tarif(6, 147.5),
        tarif(1, 24.5, "junior", { ages, libelleCategorie: libelle }),
        tarif(6, 124.5, "junior", { ages, libelleCategorie: libelle }),
      ]),
    ]);

  it("« Juniors de 5 à 17 ans » : pris pour l'enfant, signalé, fiabilité inchangée", () => {
    const r = resolu(
      resolvePassPrice(
        CHATEL,
        { arrivee: "2027-02-13", depart: "2027-02-20" },
        opts([junior({ min: 5, max: 17 }, "Juniors 5-17")], { categorie: "enfant" }),
      ),
    );
    assert.equal(r.prix, 124.5);
    assert.deepEqual(r.categorie, { cle: "junior", libelle: "Juniors 5-17" });
    assert.equal(r.drapeaux.categorieRepli, true);
    assert.equal(r.fiabilite, "haute");
    assert.match(r.notes.join(" "), /Pas de tarif enfant publié : tarif « Juniors 5-17 » retenu/);
  });

  it("un junior aux âges non écrits est pris aussi", () => {
    const r = resolu(
      resolvePassPrice(
        CHATEL,
        { arrivee: "2027-02-13", depart: "2027-02-20" },
        opts([junior(null, "Junior")], { categorie: "enfant" }),
      ),
    );
    assert.equal(r.prix, 124.5);
    assert.equal(r.drapeaux.categorieRepli, true);
  });

  it("un junior qui commence à 13 ans n'est pas le prix de l'enfant", () => {
    const r = resolvePassPrice(
      CHATEL,
      { arrivee: "2027-02-13", depart: "2027-02-20" },
      opts([junior({ min: 13, max: 17 }, "Junior 13-17")], { categorie: "enfant" }),
    );
    assert.equal(r.statut, "categorie-absente");
  });

  it("un tarif enfant publié passe toujours avant le junior", () => {
    const r = resolu(
      resolvePassPrice(
        CHATEL,
        { arrivee: "2027-02-13", depart: "2027-02-20" },
        opts([PDS], { categorie: "enfant" }),
      ),
    );
    assert.equal(r.prix, 280);
    assert.equal(r.categorie.cle, "enfant");
    assert.equal(r.drapeaux.categorieRepli, false);
  });

  it("le junior ne remplace que l'enfant, pas une autre catégorie", () => {
    const r = resolvePassPrice(
      CHATEL,
      { arrivee: "2027-02-13", depart: "2027-02-20" },
      opts([junior({ min: 5, max: 17 }, "Juniors 5-17")], { categorie: "senior" }),
    );
    assert.equal(r.statut, "categorie-absente");
  });
});

/* ---------- Migration « saison entière » ---------- */

describe("grille migrée « saison entière »", () => {
  const MIGREE = grille(
    [
      {
        ...periode("Saison entière", "2026-08-01", "2027-07-31", [
          tarif(1, 55, "adulte", { estime: true, canal: "non-precise" }),
          tarif(6, 292, "adulte", { canal: "non-precise" }),
        ]),
        saisonEntiere: true,
      },
    ],
    { id: "catalogue:chatel:2026-27", origine: "catalogue", confiance: "faible" },
  );

  it("une seule période, qui couvre tout séjour de la saison ; fiabilité faible", () => {
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-03-16", depart: "2027-03-23" }, opts([MIGREE])),
    );
    assert.equal(r.prix, 292);
    assert.equal(r.calcul, "une-periode");
    assert.equal(r.drapeaux.surDeuxPeriodes, false);
    assert.equal(r.drapeaux.saisonEntiere, true);
    assert.deepEqual(r.periode, {
      libelle: "Saison entière",
      debut: "2026-08-01",
      fin: "2027-07-31",
      saisonEntiere: true,
    });
    assert.equal(r.fiabilite, "faible");
    assert.equal(r.grille.source.origine, "catalogue");
  });

  it("la grille officielle datée passe avant la grille migrée", () => {
    const r = resolu(
      resolvePassPrice(
        CHATEL,
        { arrivee: "2027-02-13", depart: "2027-02-20" },
        opts([MIGREE, PDS]),
      ),
    );
    assert.equal(r.grille.id, PDS.id);
    assert.equal(r.prix, 373);
  });

  it("l'estimation de la journée n'est jamais retenue : 1 jour de ski, forfait 6 jours", () => {
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-02-13", depart: "2027-02-14" }, opts([MIGREE])),
    );
    assert.equal(r.duree.retenue, 6);
    assert.equal(r.drapeaux.dureeSuperieure, true);
  });
});

/* ---------- Saison antérieure ---------- */

describe("grille d'une saison antérieure", () => {
  const ANCIENNE = grille(
    [
      periode("Haute saison", "2025-12-20", "2026-03-20", [tarif(6, 350)]),
      periode("Basse saison", "2026-03-21", "2026-04-19", [tarif(6, 300)]),
    ],
    { saison: "2025-26" },
  );

  it("utilisée faute de mieux, dates reportées d'un an, signalée, fiabilité faible", () => {
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-03-27", depart: "2027-04-03" }, opts([ANCIENNE])),
    );
    assert.equal(r.prix, 300);
    assert.equal(r.periode.libelle, "Basse saison");
    assert.equal(r.drapeaux.saisonAnterieure, true);
    assert.equal(r.fiabilite, "faible");
    assert.deepEqual(r.joursSki, { premier: "2027-03-28", dernier: "2027-04-02" });
  });

  it("la saison du séjour passe avant une antérieure, même mieux notée", () => {
    const r = resolu(
      resolvePassPrice(
        CHATEL,
        { arrivee: "2027-02-13", depart: "2027-02-20" },
        opts([ANCIENNE, PDS]),
      ),
    );
    assert.equal(r.grille.saison, "2026-27");
  });
});

/* ---------- Périmètre ---------- */

describe("périmètre : le domaine par défaut", () => {
  const LIBERTE = grille(
    [periode("Hiver", "2026-12-19", "2027-04-18", [tarif(1, 55), tarif(6, 295)])],
    {
      perimetre: { type: "station", cle: "station:espace-liberte", nom: "Espace Liberté" },
      stationIds: ["chatel", "la-chapelle-dabondance"],
    },
  );

  it("le forfait du domaine est retenu, celui de la station sur demande", () => {
    const d = resolu(
      resolvePassPrice(
        CHATEL,
        { arrivee: "2027-02-13", depart: "2027-02-20" },
        opts([LIBERTE, PDS]),
      ),
    );
    assert.equal(d.perimetre.cle, "domaine:portes-du-soleil");
    assert.equal(d.drapeaux.perimetreRepli, false);
    const s = resolu(
      resolvePassPrice(
        CHATEL,
        { arrivee: "2027-02-13", depart: "2027-02-20" },
        opts([LIBERTE, PDS], { perimetre: "station" }),
      ),
    );
    assert.equal(s.perimetre.cle, "station:espace-liberte");
    assert.equal(s.prix, 295);
  });

  it("sans grille du domaine, celle de la station, et c'est dit", () => {
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2027-02-13", depart: "2027-02-20" }, opts([LIBERTE])),
    );
    assert.equal(r.perimetre.type, "station");
    assert.equal(r.drapeaux.perimetreRepli, true);
  });

  it("une station sans domaine relié n'a qu'un forfait : la grille officielle passe avant l'agrégateur qui l'appelle « domaine »", () => {
    const officielle = grille(
      [periode("Hiver", "2026-12-19", "2027-04-18", [tarif(1, 29), tarif(6, 147.5)])],
      {
        stationIds: ["ascou-pailheres"],
        perimetre: { type: "station", cle: "station:ascou", nom: "Ascou" },
      },
    );
    const agregateur = grille(
      [
        {
          ...periode("Saison entière", "2025-08-01", "2026-07-31", [tarif(6, 140)]),
          saisonEntiere: true,
        },
      ],
      {
        saison: "2025-26",
        stationIds: ["ascou-pailheres"],
        perimetre: { type: "domaine", cle: "domaine:ascou", nom: "Ascou" },
        origine: "skiinfo",
        confiance: "faible",
      },
    );
    const r = resolu(
      resolvePassPrice(
        { id: "ascou-pailheres" },
        { arrivee: "2027-02-13", depart: "2027-02-20" },
        opts([agregateur, officielle]),
      ),
    );
    assert.equal(r.grille.id, officielle.id);
    assert.equal(r.prix, 147.5);
    assert.equal(r.drapeaux.perimetreRepli, false);
  });

  it("un forfait précis demandé par sa clé passe avant tout", () => {
    const ordre = grillesCandidates("chatel", "2026-27", {
      grilles: [PDS, LIBERTE],
      perimetreCle: "station:espace-liberte",
    });
    assert.equal(ordre[0].id, LIBERTE.id);
  });
});

/* ---------- Sans dates ---------- */

describe("sans dates de séjour", () => {
  it("6 jours adulte de la période la plus proche de la date du jour, période affichée", () => {
    const r = resolu(resolvePassPrice(CHATEL, null, opts([PDS], { aujourdhui: "2026-09-30" })));
    assert.equal(r.prix, 373);
    assert.equal(r.duree.retenue, 6);
    assert.equal(r.categorie.cle, "adulte");
    assert.equal(r.periode.libelle, "Plein tarif");
    assert.equal(r.drapeaux.sansDates, true);
    // La période la plus proche est la règle, pas un à-peu-près.
    assert.equal(r.drapeaux.horsPeriodes, false);
    assert.equal(r.fiabilite, "haute");
    assert.equal(r.joursSki, null);
  });

  it("la période qui contient la date du jour", () => {
    const r = resolu(resolvePassPrice(CHATEL, null, opts([PDS], { aujourdhui: "2027-03-25" })));
    assert.equal(r.prix, 317);
    assert.equal(r.periode.libelle, "Tarif basse saison");
  });

  it("après la saison, la dernière période : la plus proche", () => {
    const r = resolu(resolvePassPrice(CHATEL, null, opts([PDS], { aujourdhui: "2027-05-10" })));
    assert.equal(r.periode.libelle, "Tarif basse saison");
  });
});

/* ---------- Hors périodes ---------- */

describe("jours de ski hors des périodes publiées", () => {
  it("la période la plus proche, signalée, fiabilité abaissée", () => {
    const r = resolu(
      resolvePassPrice(CHATEL, { arrivee: "2026-12-11", depart: "2026-12-18" }, opts([PDS])),
    );
    assert.equal(r.periode.libelle, "Plein tarif");
    assert.equal(r.drapeaux.horsPeriodes, true);
    assert.equal(r.fiabilite, "moyenne");
  });
});
