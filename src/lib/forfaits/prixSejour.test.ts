import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { montantCents } from "../devises.ts";
import { grilleDepuisReleve, grillesDuMagasin } from "./migration.ts";
import {
  budgetForfaits,
  dureeLbl,
  echecLbl,
  forfaitsDuSejour,
  journeeDuSejour,
  libellesForfait,
  mentionForfait,
  periodeDuPrix,
  saisonDeLaGrille,
  joursDuSejour,
} from "./prixSejour.ts";
import { resolvePassPrice, type PrixResolu, type Resolution } from "./resolution.ts";
import type { CategorieTarif, GrilleTarifaire, Periode, Tarif } from "./tarifsPeriode.ts";
import type { ForfaitRow } from "./types.ts";

/* ---------- Grilles d'essai ---------- */

const tarif = (
  jours: number | "saison",
  prix: number,
  categorie: CategorieTarif = "adulte",
  extra: Partial<Tarif> = {},
): Tarif => ({
  duree: jours === "saison" ? { type: "saison" } : { type: "jours", jours },
  libelleDuree: jours === "saison" ? "Saison" : `${jours} jour${jours > 1 ? "s" : ""}`,
  categorie,
  libelleCategorie: categorie === "adulte" ? "Adulte" : "Enfant",
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

const saisonEntiere = (saison: string, tarifs: Tarif[]): Periode => {
  const a = Number(saison.slice(0, 4));
  return {
    libelle: "Saison entière",
    debut: `${a}-08-01`,
    fin: `${a + 1}-07-31`,
    saisonEntiere: true,
    tarifs,
  };
};

const grille = (id: string, extra: Partial<GrilleTarifaire>): GrilleTarifaire => ({
  id,
  saison: "2026-27",
  perimetre: { type: "domaine", cle: "domaine:portes-du-soleil", nom: "Portes du Soleil" },
  stationIds: ["avoriaz", "chatel"],
  periodes: [],
  source: { origine: "officiel", url: "https://exemple.fr", libelle: "Page officielle" },
  scrapeLe: "2026-09-30",
  confiance: "haute",
  notes: [],
  ...extra,
});

/** Portes du Soleil, deux périodes, adulte et enfant. */
const PDS = grille("officiel:pds:2026-27", {
  periodes: [
    periode("Plein tarif", "2026-12-19", "2027-03-19", [
      tarif(1, 69),
      tarif(6, 373),
      tarif(6, 280, "enfant"),
      tarif("saison", 1250),
    ]),
    periode("Basse saison", "2027-03-20", "2027-04-18", [
      tarif(1, 59),
      tarif(6, 317),
      tarif(6, 238, "enfant"),
    ]),
  ],
});

/** Châtel seul, qui publie un tarif enfant que le domaine ne publie pas. */
const CHATEL_SEUL = grille("officiel:chatel:2026-27", {
  perimetre: { type: "station", cle: "station:chatel", nom: "Châtel" },
  stationIds: ["chatel"],
  periodes: [saisonEntiere("2026-27", [tarif(6, 250), tarif(6, 190, "enfant")])],
});

/** La Schlucht : la journée et 2 jours, rien de plus. */
const SCHLUCHT = grille("officiel:la-schlucht:2026-27", {
  perimetre: { type: "station", cle: "station:la-schlucht", nom: "La Schlucht" },
  stationIds: ["la-schlucht"],
  periodes: [saisonEntiere("2026-27", [tarif(1, 19.7), tarif(2, 39)])],
  confiance: "faible",
});

const AUJOURDHUI = "2026-09-30";
const FEVRIER = { arrivee: "2027-02-06", depart: "2027-02-13" };

function resolu(r: Resolution): PrixResolu {
  assert.equal(r.statut, "resolu", "detail" in r ? r.detail : "");
  return r as PrixResolu;
}

/* ---------- Résolution ---------- */

describe("adulte et enfant sur le même forfait", () => {
  it("l'enfant suit le forfait de l'adulte, même quand la station seule publie le sien", () => {
    const domaineSansEnfant = grille("officiel:pds-adulte:2026-27", {
      periodes: [saisonEntiere("2026-27", [tarif(6, 373)])],
    });
    const f = forfaitsDuSejour("chatel", FEVRIER, [domaineSansEnfant, CHATEL_SEUL], AUJOURDHUI);
    assert.equal(resolu(f.adulte).perimetre.cle, "domaine:portes-du-soleil");
    // Sans cette règle, l'enfant prendrait le 190 € de Châtel seul, et le
    // total mêlerait deux forfaits.
    assert.equal(f.enfant.statut, "categorie-absente");
  });

  it("l'enfant publié sur le forfait de l'adulte", () => {
    const f = forfaitsDuSejour("chatel", FEVRIER, [PDS, CHATEL_SEUL], AUJOURDHUI);
    assert.equal(resolu(f.adulte).prix, 373);
    assert.equal(resolu(f.enfant).prix, 280);
  });

  it("la journée du premier jour de ski et la saison, sur la grille de l'adulte", () => {
    const f = forfaitsDuSejour("chatel", FEVRIER, [PDS], AUJOURDHUI);
    const j = journeeDuSejour("chatel", FEVRIER, [PDS], AUJOURDHUI, f.adulte);
    assert.equal(j && resolu(j).prix, 69);
    assert.deepEqual(saisonDeLaGrille([PDS], f.adulte), { prix: 1250, devise: "EUR" });
    assert.equal(
      saisonDeLaGrille(
        [CHATEL_SEUL],
        resolu(forfaitsDuSejour("chatel", FEVRIER, [CHATEL_SEUL], AUJOURDHUI).adulte),
      ),
      null,
    );
  });

  it("pas de journée publiée : pas de journée, l'estimation à part", () => {
    const catalogue = grille("catalogue:pds:2026-27", {
      confiance: "faible",
      periodes: [
        saisonEntiere("2026-27", [tarif(1, 55, "adulte", { estime: true }), tarif(6, 292)]),
      ],
    });
    const f = forfaitsDuSejour("chatel", FEVRIER, [catalogue], AUJOURDHUI);
    const j = journeeDuSejour("chatel", FEVRIER, [catalogue], AUJOURDHUI, f.adulte);
    assert.equal(j?.statut, "duree-absente");
    assert.equal(j && "estimation" in j ? j.estimation?.prix : null, 55);
  });

  it("les jours de ski du séjour : les nuits moins une", () => {
    assert.equal(joursDuSejour(FEVRIER), 6);
    assert.equal(joursDuSejour({ arrivee: "2027-02-06", depart: "2027-02-07" }), 1);
    assert.equal(joursDuSejour({ arrivee: "2027-02-13", depart: "2027-02-06" }), null);
  });
});

/* ---------- Libellés ---------- */

describe("ce qui accompagne le prix", () => {
  it("période publiée, bornes, périmètre, source", () => {
    const r = resolu(forfaitsDuSejour("chatel", FEVRIER, [PDS], AUJOURDHUI).adulte);
    const l = libellesForfait(r);
    assert.equal(l.prix, montantCents(373, "EUR"));
    assert.equal(l.duree, "6 jours");
    assert.equal(l.periode, "Plein tarif");
    assert.equal(l.bornes, "du 19 décembre 2026 au 19 mars 2027");
    assert.equal(l.perimetre, "Forfait du domaine Portes du Soleil");
    assert.equal(l.source, "Page officielle");
    assert.equal(l.faible, false);
    assert.equal(
      mentionForfait(r),
      "Plein tarif, du 19 décembre 2026 au 19 mars 2027 · Forfait du domaine Portes du Soleil",
    );
  });

  it("sans période publiée : la saison, dite telle", () => {
    const r = resolu(forfaitsDuSejour("chatel", FEVRIER, [CHATEL_SEUL], AUJOURDHUI).adulte);
    assert.deepEqual(periodeDuPrix(r), {
      libelle: "Saison 2026-27",
      bornes: "sans période publiée",
    });
    assert.equal(libellesForfait(r).perimetre, "Forfait de la station Châtel");
  });

  it("à cheval sur deux périodes : les deux, et leurs bornes", () => {
    const r = resolu(
      resolvePassPrice(
        { id: "chatel" },
        { arrivee: "2027-03-16", depart: "2027-03-23" },
        {
          grilles: [PDS],
          aujourdhui: AUJOURDHUI,
        },
      ),
    );
    assert.deepEqual(periodeDuPrix(r), {
      libelle: "Plein tarif puis Basse saison",
      bornes: "du 19 décembre 2026 au 18 avril 2027",
    });
  });

  it("grille d'une saison antérieure : ses bornes, saison nommée ; fiabilité faible, avec ses raisons", () => {
    const ancienne = grille("bergfex:pds:2025-26", {
      saison: "2025-26",
      confiance: "faible",
      periodes: [periode("Haute saison", "2025-12-20", "2026-03-27", [tarif(6, 350)])],
    });
    const r = resolu(forfaitsDuSejour("chatel", FEVRIER, [ancienne], AUJOURDHUI).adulte);
    const l = libellesForfait(r);
    assert.equal(l.bornes, "du 20 décembre 2025 au 27 mars 2026, saison 2025-26");
    assert.equal(l.faible, true);
    assert.match(l.raisons, /^Prix non vérifié sur la page officielle de la saison\. /);
    assert.match(l.raisons, /saison 2025-26, antérieure au séjour/);
  });

  it("journées additionnées : les centimes, et la durée en journées", () => {
    const r = resolu(forfaitsDuSejour("la-schlucht", FEVRIER, [SCHLUCHT], AUJOURDHUI).adulte);
    assert.equal(r.prix, 118.2);
    const l = libellesForfait(r);
    assert.equal(l.prix, montantCents(118.2, "EUR"));
    assert.match(l.prix, /^118,20/);
    assert.equal(l.duree, "6 journées");
  });

  it("durée supérieure retenue : dite", () => {
    const r = resolu(
      resolvePassPrice(
        { id: "chatel" },
        { arrivee: "2027-02-06", depart: "2027-02-12" },
        {
          grilles: [PDS],
          aujourdhui: AUJOURDHUI,
        },
      ),
    );
    assert.equal(dureeLbl(r), "6 jours, pour 5 jours de ski");
  });

  it("ce qui s'écrit à la place d'un prix absent", () => {
    const e = (statut: Parameters<typeof echecLbl>[0]["statut"]) =>
      echecLbl({ statut, detail: "" });
    assert.equal(e("grille-ancienne"), "non publié");
    assert.equal(e("grille-absente"), "non relevé");
    assert.equal(e("categorie-absente"), "non communiqué");
    assert.equal(e("duree-absente"), "durée non publiée");
  });
});

/* ---------- Budget ---------- */

describe("budget des forfaits du séjour", () => {
  it("adultes et enfants au prix de leur forfait, période indiquée", () => {
    const b = budgetForfaits(forfaitsDuSejour("chatel", FEVRIER, [PDS], AUJOURDHUI), 2, 1);
    assert.equal(b.total, 2 * 373 + 280);
    assert.equal(b.libelle, "Forfaits 6 jours");
    assert.equal(b.periode, "Plein tarif, du 19 décembre 2026 au 19 mars 2027");
    assert.equal(b.periodeCourte, "Plein tarif");
    assert.equal(
      b.detail,
      `2 × ${montantCents(373, "EUR")} adulte + 1 × ${montantCents(280, "EUR")} enfant`,
    );
    assert.equal(b.enfantsAuTarifAdulte, false);
    assert.equal(b.manque, null);
  });

  it("enfant non communiqué : compté au prix adulte, et dit", () => {
    const domaineSansEnfant = grille("officiel:pds-adulte:2026-27", {
      periodes: [saisonEntiere("2026-27", [tarif(6, 373)])],
    });
    const b = budgetForfaits(
      forfaitsDuSejour("chatel", FEVRIER, [domaineSansEnfant], AUJOURDHUI),
      1,
      2,
    );
    assert.equal(b.total, 3 * 373);
    assert.equal(b.enfantsAuTarifAdulte, true);
    assert.match(b.detail, /tarif enfant non communiqué$/);
  });

  it("journées additionnées : le total et le détail au centime", () => {
    const b = budgetForfaits(
      forfaitsDuSejour("la-schlucht", FEVRIER, [SCHLUCHT], AUJOURDHUI),
      2,
      0,
    );
    assert.equal(b.total, 236.4);
    assert.equal(b.libelle, "Forfaits 6 journées");
    assert.equal(b.detail, `2 × ${montantCents(118.2, "EUR")} adulte`);
  });

  it("sans prix adulte : pas de total, et ce qui manque", () => {
    const sans = budgetForfaits(forfaitsDuSejour("chatel", FEVRIER, [], AUJOURDHUI), 2, 0);
    assert.equal(sans.total, null);
    assert.equal(sans.libelle, "Forfaits");
    assert.equal(sans.manque, "non relevé");
    const vieille = grille("skiinfo:chatel:2019-20", {
      saison: "2019-20",
      periodes: [saisonEntiere("2019-20", [tarif(6, 200)])],
    });
    assert.equal(
      budgetForfaits(forfaitsDuSejour("chatel", FEVRIER, [vieille], AUJOURDHUI), 2, 0).manque,
      "non publié",
    );
  });
});

/* ---------- Relevé du magasin serveur ---------- */

describe("le relevé du magasin serveur devient une grille", () => {
  const CATALOGUE = grille("catalogue:portes-du-soleil:2026-27", {
    source: {
      origine: "catalogue",
      url: null,
      libelle: "Catalogue des forfaits, relevé du 11 août 2026",
    },
    confiance: "faible",
    scrapeLe: "2026-08-11",
    periodes: [saisonEntiere("2026-27", [tarif(6, 373)])],
  });
  const ligne = (extra: Partial<ForfaitRow>): ForfaitRow => ({
    slug: "portes-du-soleil",
    j1: 70,
    j6: 380,
    enf6: null,
    kind: "6 jours",
    validFrom: null,
    validTo: null,
    sourceUrl: "https://www.portesdusoleil.com/forfaits",
    fetchedAt: "2026-09-29T08:00:00.000Z",
    lastAttemptAt: null,
    status: "ok",
    locked: false,
    lastError: null,
    parseKind: "jsonld",
    history: [],
    ...extra,
  });

  it("un relevé de la page officielle : grille officielle de confiance moyenne, sur le forfait du catalogue", () => {
    const g = grilleDepuisReleve(ligne({}), CATALOGUE)!;
    assert.equal(g.id, "releve:portes-du-soleil:2026-27");
    assert.equal(g.source.origine, "officiel");
    assert.equal(g.source.libelle, "Page officielle, relevé du 29 septembre 2026");
    assert.equal(g.confiance, "moyenne");
    assert.deepEqual(g.perimetre, CATALOGUE.perimetre);
    assert.deepEqual(g.stationIds, CATALOGUE.stationIds);
    assert.deepEqual(
      g.periodes[0].tarifs.map((t) => [t.libelleDuree, t.prix]),
      [
        ["1 jour", 70],
        ["6 jours", 380],
      ],
    );
    // Plus récent et plus sûr que le catalogue : c'est lui qui répond.
    const r = resolu(
      resolvePassPrice({ id: "chatel" }, FEVRIER, {
        grilles: [CATALOGUE, g],
        aujourdhui: AUJOURDHUI,
      }),
    );
    assert.equal(r.prix, 380);
  });

  it("ni graine, ni estimation, ni erreur ; la saisie à la main reste faible", () => {
    assert.equal(grilleDepuisReleve(ligne({ parseKind: "referentiel" }), CATALOGUE), null);
    assert.equal(grilleDepuisReleve(ligne({ status: "estimé" }), CATALOGUE), null);
    assert.equal(grilleDepuisReleve(ligne({ status: "erreur" }), CATALOGUE), null);
    assert.equal(grilleDepuisReleve(ligne({ fetchedAt: null }), CATALOGUE), null);
    assert.equal(grilleDepuisReleve(ligne({}), undefined), null);
    const saisie = grilleDepuisReleve(ligne({ status: "manuel", parseKind: "manuel" }), CATALOGUE)!;
    assert.equal(saisie.source.origine, "saisie");
    assert.equal(saisie.confiance, "faible");
  });

  it("un relevé d'une saison passée passe derrière le catalogue de la saison", () => {
    const g = grilleDepuisReleve(
      ligne({ fetchedAt: "2026-03-01T08:00:00.000Z", j6: 360 }),
      CATALOGUE,
    )!;
    assert.equal(g.saison, "2025-26");
    const r = resolu(
      resolvePassPrice({ id: "chatel" }, FEVRIER, {
        grilles: [g, CATALOGUE],
        aujourdhui: AUJOURDHUI,
      }),
    );
    assert.equal(r.prix, 373);
  });

  it("chaque ligne rattachée au forfait du catalogue de son domaine", () => {
    const ancien = {
      ...CATALOGUE,
      id: "catalogue:portes-du-soleil:2025-26",
      saison: "2025-26",
      stationIds: ["avoriaz"],
    };
    const out = grillesDuMagasin([ligne({}), ligne({ slug: "inconnu" })], [ancien, CATALOGUE, PDS]);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].stationIds, CATALOGUE.stationIds);
  });

  it("le relevé du magasin passe par le contrôle : un 6 jours à 29 € ne devance pas le catalogue", () => {
    // Une assurance lue comme le 6 jours (Flaine, relevé du 4 octobre 2026).
    const rejets: string[] = [];
    assert.deepEqual(grillesDuMagasin([ligne({ j1: 60.7, j6: 29 })], [CATALOGUE], rejets), []);
    assert.match(rejets[0], /^portes-du-soleil : .*6 jours \(29 €\) pas plus cher que la journée \(60,7 €\)/);
    const r = resolu(
      resolvePassPrice({ id: "chatel" }, FEVRIER, {
        grilles: [CATALOGUE, ...grillesDuMagasin([ligne({ j1: 60.7, j6: 29 })], [CATALOGUE])],
        aujourdhui: AUJOURDHUI,
      }),
    );
    assert.notEqual(r.prix, 29);
  });
});
