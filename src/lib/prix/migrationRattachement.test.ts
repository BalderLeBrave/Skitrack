import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stationById, STATIONS } from "../stations.ts";
import {
  bornesPlages,
  FL0,
  passeAnnonce,
  versListing,
  type AnnonceRetenue,
  type Resultat,
} from "./calcul.ts";
import {
  empreintePlan,
  planifierExport,
  planifierRattachement,
  rapportRattachement,
  recompter,
  resultatsALaLecture,
  type ExportReleves,
} from "./migrationRattachement.ts";

/**
 * Le re-rattachement des relevés enregistrés avant la règle d'une station par
 * logement (6 octobre 2026). Le plan est pur : ces tests le jouent sur des
 * relevés écrits à la main, aux mêmes dates et pour le même groupe.
 */

const P = "2027-02-06|7|2|0";
const cle = (station: string) => `${P}|${station}`;
const B = bornesPlages(STATIONS);

function fait(n: number, med: number | null): Resultat {
  return { etat: "fait", n, med, muettes: 0, petits: 0, ts: 1, partiel: [] };
}

/** Une annonce enregistrée, située au repère de `ou`, relevée pour `pour`. */
function enregistree(pour: string, ou: string, over: Partial<AnnonceRetenue> = {}): AnnonceRetenue {
  const s = stationById(ou)!;
  return {
    id: `a-${ou}`,
    stationId: pour,
    title: `Appartement à ${s.name}`,
    source: "Airbnb",
    total: 1000,
    currency: "EUR",
    capacity: 4,
    bedrooms: 1,
    available: true,
    photo: null,
    url: null,
    lat: s.lat + 0.001,
    lon: s.lon + 0.001,
    distToLiftM: 300,
    distToSlopesM: 200,
    proven: "test",
    ...over,
  };
}

describe("migration : la simulation n'écrit rien", () => {
  it("le plan ne touche ni aux annonces ni aux résultats reçus", () => {
    const annonces = { [cle("val-cenis")]: [enregistree("val-cenis", "aussois")] };
    const res = { [cle("val-cenis")]: fait(1, 1000), [cle("aussois")]: fait(0, null) };
    const avant = JSON.stringify({ annonces, res });
    const { plan } = planifierExport({ res, annonces });
    rapportRattachement(plan);
    assert.equal(JSON.stringify({ annonces, res }), avant);
  });
});

describe("migration : une annonce déplacée rejoint sa station, et seulement elle", () => {
  const res = { [cle("val-cenis")]: fait(2, 1000), [cle("aussois")]: fait(1, 900) };
  const entrees = [
    {
      cle: cle("val-cenis"),
      annonces: [
        enregistree("val-cenis", "aussois", { id: "a1", total: 800 }),
        enregistree("val-cenis", "lanslebourg", { id: "v1" }),
      ],
    },
    {
      cle: cle("aussois"),
      annonces: [enregistree("aussois", "aussois", { id: "a0", total: 900 })],
    },
  ];
  const plan = planifierRattachement(entrees, res);

  it("le logement d'Aussois quitte Val Cenis pour Aussois", () => {
    assert.deepEqual(
      plan.apres.get(cle("val-cenis"))!.map((a) => a.id),
      ["v1"],
    );
    assert.deepEqual(
      plan.apres
        .get(cle("aussois"))!
        .map((a) => a.id)
        .sort(),
      ["a0", "a1"],
    );
    assert.deepEqual(
      plan.mouvements.map((m) => [m.action, m.motif, m.id]),
      [["deplacee", "autre-station", "a1"]],
    );
  });

  it("sa station de relevé devient Aussois : il s'affiche sous Aussois", () => {
    const a1 = plan.apres.get(cle("aussois"))!.find((a) => a.id === "a1")!;
    assert.equal(a1.stationId, "aussois");
    assert.equal(passeAnnonce(versListing(a1, "aussois")!, FL0, B), true);
    assert.equal(
      passeAnnonce(versListing({ ...a1, stationId: "val-cenis" }, "val-cenis")!, FL0, B),
      false,
    );
  });

  it("les médianes des deux relevés sont recalculées", () => {
    assert.deepEqual(
      [plan.resultats[cle("val-cenis")]].map((r) => r.etat === "fait" && [r.n, r.med]),
      [[1, 1000]],
    );
    assert.deepEqual(
      [plan.resultats[cle("aussois")]].map((r) => r.etat === "fait" && [r.n, r.med]),
      [[2, 850]],
    );
  });
});

describe("migration : un même bien n'est gardé qu'une fois, la copie déjà là d'abord", () => {
  it("la copie native reste, la copie venue d'ailleurs est un doublon", () => {
    const res = { [cle("val-cenis")]: fait(1, 850), [cle("aussois")]: fait(1, 900) };
    const plan = planifierRattachement(
      [
        {
          cle: cle("val-cenis"),
          annonces: [enregistree("val-cenis", "aussois", { id: "arolle", total: 850 })],
        },
        {
          cle: cle("aussois"),
          annonces: [enregistree("aussois", "aussois", { id: "arolle", total: 900 })],
        },
      ],
      res,
    );
    const gardees = plan.apres.get(cle("aussois"))!;
    assert.equal(gardees.length, 1);
    assert.equal(gardees[0].total, 900);
    assert.deepEqual(
      plan.mouvements.map((m) => [m.action, m.de]),
      [["doublon", cle("val-cenis")]],
    );
  });

  it("un logement vendu sur deux plateformes reste un logement (scénario Méribel)", () => {
    // Méribel : Airbnb A et Booking B, regroupés en un logement. Courchevel
    // porte le même Booking B, moins cher, situé à Méribel.
    const A = enregistree("meribel", "meribel", {
      id: "abnb-1",
      title: "Chalet Les Bruyères 6 personnes",
      total: 1200,
      url: "https://www.airbnb.fr/rooms/11111111",
      logement: "abnb-1",
    });
    const Bm = enregistree("meribel", "meribel", {
      id: "bk-7",
      title: "Chalet Les Bruyères 6 personnes",
      source: "Booking",
      platformId: "777",
      total: 1100,
      logement: "abnb-1",
    });
    const Bc = { ...Bm, stationId: "courchevel", total: 950, logement: "bk-7" };
    const plan = planifierRattachement(
      [
        { cle: cle("meribel"), annonces: [A, Bm] },
        { cle: cle("courchevel"), annonces: [Bc] },
      ],
      { [cle("meribel")]: fait(1, 1100), [cle("courchevel")]: fait(1, 950) },
    );
    const r = plan.resultats[cle("meribel")];
    assert.ok(r.etat === "fait");
    assert.equal(r.n, 1);
    assert.equal(r.med, 1100);
    assert.equal(recompter(plan.apres.get(cle("meribel"))!, "meribel").n, 1);
  });
});

describe("migration : les villages et les stations sans relevé", () => {
  it("le relevé d'un village rejoint celui de sa station, son résultat avec", () => {
    const plan = planifierRattachement(
      [
        {
          cle: cle("plagne-centre"),
          annonces: [enregistree("plagne-centre", "plagne-centre", { id: "pc" })],
        },
      ],
      { [cle("plagne-centre")]: fait(1, 1000) },
    );
    assert.equal(plan.resultats[cle("plagne-centre")], undefined);
    assert.ok(plan.resultats[cle("la-plagne")]);
    const [pc] = plan.apres.get(cle("la-plagne"))!;
    assert.equal(pc.stationId, "la-plagne");
    assert.deepEqual(
      plan.mouvements.map((m) => [m.action, m.motif]),
      [["deplacee", "village"]],
    );
  });

  it("une station sans relevé réussi à ces dates ne reçoit rien ; l'annonce quitte le relevé", () => {
    const plan = planifierRattachement(
      [{ cle: cle("val-cenis"), annonces: [enregistree("val-cenis", "aussois")] }],
      {
        [cle("val-cenis")]: fait(1, 1000),
        [cle("aussois")]: { etat: "echec", ts: 1, raison: "x" },
      },
    );
    assert.equal(plan.apres.has(cle("aussois")), false);
    assert.deepEqual(
      plan.mouvements.map((m) => [m.action, m.motif, m.vers]),
      [["retiree", "station-sans-releve", null]],
    );
  });

  it("à plus de 12 km de toute station, l'annonce est retirée ; sans position, elle reste", () => {
    const loin = enregistree("val-cenis", "aussois", { id: "loin", lat: 43.2965, lon: 5.3698 });
    const muette = enregistree("val-cenis", "aussois", {
      id: "muette",
      lat: null,
      lon: null,
      title: "Appartement",
    });
    const plan = planifierRattachement([{ cle: cle("val-cenis"), annonces: [loin, muette] }], {
      [cle("val-cenis")]: fait(2, 1000),
    });
    assert.deepEqual(
      plan.apres.get(cle("val-cenis"))!.map((a) => a.id),
      ["muette"],
    );
    assert.deepEqual(
      plan.mouvements.map((m) => [m.id, m.action, m.motif]),
      [
        ["loin", "retiree", "trop-loin"],
        ["muette", "non-situee", "sans-position"],
      ],
    );
  });
});

describe("migration : un relevé dont les annonces n'ont pas été lues n'est pas touché", () => {
  it("il ne reçoit rien et garde son résultat ; l'annonce quitte quand même le relevé qui n'est pas le sien", () => {
    const res = { [cle("val-cenis")]: fait(2, 900), [cle("aussois")]: fait(14, 1500) };
    const plan = planifierRattachement(
      [
        {
          cle: cle("val-cenis"),
          annonces: [
            enregistree("val-cenis", "aussois", { id: "a1", total: 800 }),
            enregistree("val-cenis", "lanslebourg", { id: "v1", total: 900 }),
          ],
        },
      ],
      res,
    );
    assert.deepEqual(plan.resultats[cle("aussois")], res[cle("aussois")]);
    assert.equal(plan.apres.has(cle("aussois")), false);
    assert.deepEqual(
      plan.mouvements.map((m) => [m.id, m.action, m.motif]),
      [["a1", "retiree", "releve-non-lu"]],
    );
    const vc = plan.resultats[cle("val-cenis")];
    assert.ok(vc.etat === "fait");
    assert.deepEqual([vc.n, vc.med], [1, 900]);
  });

  it("un village dont la station a un relevé réussi mais non lu reste tel quel", () => {
    const res = { [cle("plagne-centre")]: fait(10, 1200), [cle("la-plagne")]: fait(30, 1400) };
    const plan = planifierRattachement(
      [
        {
          cle: cle("plagne-centre"),
          annonces: [enregistree("plagne-centre", "plagne-centre", { id: "pc" })],
        },
      ],
      res,
    );
    assert.deepEqual(plan.laissees, [cle("plagne-centre")]);
    assert.deepEqual(plan.resultats, res);
    assert.equal(plan.touchees.size, 0);
    assert.equal(plan.mouvements.length, 0);
  });

  it("un village non lu ne passe pas sous sa station, qui ne reçoit donc rien sur sa foi", () => {
    // Plagne Centre réussi (10 logements) mais illisible, La Plagne sans
    // relevé ; un logement de La Plagne relevé sous Les Arcs.
    const res = {
      [cle("plagne-centre")]: fait(10, 1200),
      [cle("les-arcs-bourg-st-maurice")]: fait(1, 700),
    };
    const plan = planifierRattachement(
      [
        {
          cle: cle("les-arcs-bourg-st-maurice"),
          annonces: [
            enregistree("les-arcs-bourg-st-maurice", "belle-plagne", { id: "bp", total: 700 }),
          ],
        },
      ],
      res,
    );
    assert.deepEqual(plan.laissees, [cle("plagne-centre")]);
    assert.equal(plan.resultats[cle("la-plagne")], undefined);
    assert.deepEqual(plan.resultats[cle("plagne-centre")], res[cle("plagne-centre")]);
    assert.deepEqual(
      plan.mouvements.map((m) => [m.id, m.action, m.motif]),
      [["bp", "retiree", "releve-non-lu"]],
    );
  });

  it("aucune annonce lue : rien ne change", () => {
    const res = { [cle("plagne-centre")]: fait(10, 1200), [cle("la-plagne")]: fait(30, 1400) };
    const plan = planifierRattachement([], res);
    assert.deepEqual(plan.resultats, res);
    assert.equal(plan.touchees.size, 0);
  });
});

describe("migration : une annonce non située rangée par sa commune perd les distances de l'ancienne station", () => {
  it("elle n'est plus comptée sur une distance mesurée ailleurs", () => {
    const muette = enregistree("val-cenis", "aussois", {
      id: "m1",
      lat: null,
      lon: null,
      locality: "Aussois",
      distToLiftM: 150,
      distToSlopesM: 150,
    });
    const plan = planifierRattachement(
      [
        { cle: cle("val-cenis"), annonces: [muette] },
        {
          cle: cle("aussois"),
          annonces: [enregistree("aussois", "aussois", { id: "a0", total: 900 })],
        },
      ],
      { [cle("val-cenis")]: fait(1, 1000), [cle("aussois")]: fait(1, 900) },
    );
    const rangee = plan.apres.get(cle("aussois"))!.find((a) => a.id === "m1")!;
    assert.equal(rangee.stationId, "aussois");
    assert.equal(rangee.distToLiftM, null);
    assert.equal(rangee.distToSlopesM, null);
    const r = plan.resultats[cle("aussois")];
    assert.ok(r.etat === "fait");
    assert.deepEqual([r.n, r.med], [1, 900]);
  });
});

describe("Prix, à la lecture : chaque relevé recompté sur ses seules annonces", () => {
  it("rien ne change de relevé ; seules les annonces que la clé montre comptent", () => {
    const res = {
      [cle("val-cenis")]: fait(2, 850),
      [cle("aussois")]: fait(14, 1500),
      [cle("plagne-centre")]: fait(1, 1000),
    };
    const lu = resultatsALaLecture(
      [
        {
          cle: cle("val-cenis"),
          annonces: [
            enregistree("val-cenis", "aussois", { id: "a1", total: 800 }),
            enregistree("val-cenis", "lanslebourg", { id: "v1", total: 900 }),
          ],
        },
        {
          cle: cle("plagne-centre"),
          annonces: [enregistree("plagne-centre", "plagne-centre", { id: "pc" })],
        },
      ],
      res,
    );
    const vc = lu[cle("val-cenis")];
    assert.ok(vc.etat === "fait");
    assert.deepEqual([vc.n, vc.med], [1, 900]);
    assert.equal(lu[cle("aussois")], res[cle("aussois")], "non lu, il n'est pas recompté");
    assert.equal(
      lu[cle("plagne-centre")],
      res[cle("plagne-centre")],
      "le village reste sous sa clé",
    );
    assert.equal(lu[cle("la-plagne")], undefined);
  });
});

describe("migration : le recompte suit la règle de l'affichage", () => {
  it("seules comptent les offres tarifées que « Par budget » montre", () => {
    const garde = enregistree("aussois", "aussois", { id: "garde", total: 1000 });
    const annonces = [
      garde,
      enregistree("aussois", "aussois", { id: "sans-prix", total: 0 }),
      enregistree("aussois", "aussois", {
        id: "loin-des-pistes",
        total: 500,
        distToLiftM: 3_000,
        distToSlopesM: 3_000,
      }),
      enregistree("aussois", "aussois", {
        id: "hotel",
        total: 400,
        title: "Hôtel du Soleil",
        propertyType: "Hôtel",
      }),
      enregistree("aussois", "val-cenis", { id: "voisine", total: 300 }),
      // Une fiche que son titre dément : sans carte dans « Par budget ».
      enregistree("aussois", "aussois", {
        id: "dementie",
        total: 450,
        title: "Résidence Cheval Blanc - 2 Pièces Pour 4 Personnes",
        capacity: 8,
        bedrooms: 3,
      }),
      { ...garde, id: "autre-offre", total: 1200, logement: "garde" },
    ];
    assert.deepEqual(recompter(annonces, "aussois"), { n: 1, med: 1000 });
    for (const a of annonces) {
      const montree = a.total > 0 && passeAnnonce(versListing(a, "aussois")!, FL0, B);
      assert.equal(montree, a.id === "garde" || a.id === "autre-offre", a.id);
    }
  });
});

describe("le recompte : un logement par bien, même dans un relevé d'avant les marques", () => {
  it("deux copies d'une annonce, ou les deux formules d'un bien, comptent une fois", () => {
    const sans = { logement: undefined };
    const copies = [
      enregistree("aussois", "aussois", {
        id: "cozy-abc",
        url: "https://www.airbnb.fr/rooms/55555555",
        total: 1200,
        ...sans,
      }),
      enregistree("aussois", "aussois", {
        id: "55555555",
        url: "https://www.airbnb.fr/rooms/55555555",
        total: 1300,
        ...sans,
      }),
    ];
    assert.deepEqual(recompter(copies, "aussois"), { n: 1, med: 1200 });
    const mc = { source: "Mountain Collection" as const, platformId: "2338", ...sans };
    const formules = [
      enregistree("aussois", "aussois", {
        id: "mc-2338",
        ...mc,
        total: 1500,
        skiPassIncluded: false,
      }),
      enregistree("aussois", "aussois", {
        id: "mc-2338-forfait",
        ...mc,
        total: 2100,
        skiPassIncluded: true,
      }),
    ];
    assert.deepEqual(recompter(formules, "aussois"), { n: 1, med: 1500 });
  });
});

describe("migration : idempotente", () => {
  it("un second passage ne touche aucun relevé, et refait le même plan", () => {
    const e: ExportReleves = {
      res: {
        [cle("val-cenis")]: fait(2, 1000),
        [cle("aussois")]: fait(1, 900),
        [cle("plagne-centre")]: fait(1, 1000),
      },
      annonces: {
        [cle("val-cenis")]: [
          enregistree("val-cenis", "aussois", { id: "a1" }),
          enregistree("val-cenis", "lanslebourg", { id: "v1" }),
        ],
        [cle("aussois")]: [enregistree("aussois", "aussois", { id: "a0" })],
        [cle("plagne-centre")]: [enregistree("plagne-centre", "plagne-centre", { id: "pc" })],
      },
    };
    const premier = planifierExport(e);
    assert.ok(premier.plan.touchees.size > 0);
    assert.equal(
      empreintePlan(planifierExport(e).plan),
      empreintePlan(premier.plan),
      "même entrée, même plan",
    );
    const second = planifierExport(premier.apres);
    assert.equal(second.plan.touchees.size, 0);
    assert.equal(JSON.stringify(second.apres), JSON.stringify(premier.apres));
  });
});
