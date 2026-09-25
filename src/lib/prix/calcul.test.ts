import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  agreger,
  annoncesDuReleve,
  annSub,
  avecNuits,
  bornerNuits,
  bornesPlages,
  cleResultat,
  compacter,
  comparateur,
  comparateurBudget,
  countBudget,
  countFl,
  countLbl,
  couverture,
  decaler,
  dejaPrevu,
  departIso,
  departLbl,
  dispo,
  dispoLbl,
  dureeLbl,
  ecartLbl,
  effacerBudget,
  elaguer,
  estPassee,
  filtresActifs,
  filtresActifsBudget,
  FL0,
  fmtPlage,
  grpKey,
  idsALancer,
  jetons,
  jetonsBudget,
  lireSaisie,
  lireTri,
  lireTriB,
  ligne,
  MAX_RESULTATS,
  medHead,
  mediane,
  memePeriode,
  metaAnnonce,
  MIN_ANNONCES,
  moreLbl,
  nomListe,
  NUITS_MAX,
  NUITS_MIN,
  ordreMassifs,
  PAGE,
  PAGE_CARTES,
  PARTS,
  passe,
  passeBudget,
  passeStationSeule,
  perKey,
  perLbl,
  periodeDuSejour,
  PLAGE_BUDGET,
  PLAGES,
  PLAGES_STATION,
  plageLbl,
  plur,
  poigneeProche,
  poserBorne,
  ppLbl,
  relLbl,
  releveLbl,
  resultatDuReleve,
  retenir,
  retirerJeton,
  signature,
  SOURCES_DE_PART,
  sourcesEnDefaut,
  sousTitre,
  sousTitreBudget,
  TRI0,
  TRIB0,
  TRIS,
  TRIS_B,
  triLbl,
  triVal,
  valeurStation,
  videBudget,
  type AnnonceRetenue,
  type Bornes,
  type CarteAnnonce,
  type Filtres,
  type Groupe,
  type Job,
  type Ligne,
  type Part,
  type Periode,
  type Resultat,
  type Tri,
  type TriB,
} from "./calcul.ts";
import { STAY_BOUNDS } from "../parcours.ts";
import { STATIONS, stationById, type Station } from "../stations.ts";
import type { Listing } from "../listings.ts";
import type { SourceReport } from "../scrape/types.ts";
import type { AvailabilitySubject } from "../stay/availability.ts";
import { bedLbl, capLbl } from "../v7.ts";

function stationReelle(id: string): Station {
  const s = stationById(id);
  if (!s) throw new Error(`station absente du référentiel : ${id}`);
  return s;
}

const S2A = stationReelle("les-2-alpes");
const PER: Periode = { from: "2027-02-06", nights: 7 };
const GRP: Groupe = { trav: 8, rooms: 0 };
const IN = "2027-02-06";
const OUT = "2027-02-13";
const NOW = Date.parse("2027-01-10T12:00:00Z");
const HEURE = 60 * 60 * 1000;

/** Une annonce qui passe tout : Airbnb, en euros, à 800 m de la station,
 *  géolocalisée, tarifée il y a une minute pour exactement ce séjour, huit
 *  couchages annoncés. Chaque cas n'en change qu'un champ. */
function annonce(over: Partial<Listing> = {}): Listing {
  return {
    id: "airbnb-1",
    stationId: "les-2-alpes",
    title: "Appartement plein sud",
    source: "Airbnb",
    total: 2000,
    currency: "EUR",
    guests: 8,
    bedrooms: 3,
    available: true,
    photo: null,
    url: "https://www.airbnb.fr/rooms/12345678",
    lat: S2A.lat + 0.002,
    lon: S2A.lon + 0.002,
    distToSlopesM: 800,
    proven: "Airbnb direct",
    pricedCheckIn: IN,
    pricedCheckOut: OUT,
    scannedAt: NOW - 60_000,
    ...over,
  };
}

/** Un gîte avec devis ITEA live, en Isère comme la station. */
function gite(over: Partial<Listing> = {}): Listing {
  return annonce({
    id: "38G550149",
    title: "magnimon 2",
    source: "Gîtes de France",
    url: "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/isere/magnimon-2-38g550149",
    proven: "devis ITEA live 2027-01-10",
    ...over,
  });
}

const CTX = { dept: S2A.dept, checkIn: IN, checkOut: OUT, groupe: GRP, now: NOW };

function totaux(xs: readonly number[]): Listing[] {
  return xs.map((total, i) => annonce({ id: `airbnb-${i + 1}`, total }));
}

/** Une offre telle que CozyCozy l'écrit (cozy.server.ts) : l'identifiant de
 *  logement de Cozy derrière le préfixe de la plateforme. */
function offreCozy(id: string, source: Listing["source"], over: Partial<Listing> = {}): Listing {
  return annonce({ id, source, proven: `CozyCozy ${source} live ${IN}→${OUT}`, ...over });
}
const unBien = [
  offreCozy("abr-777", "Abritel", {
    title: "Chalet 4 chambres vue pistes",
    total: 2300,
    url: "https://www.abritel.fr/location-vacances/p777",
  }),
  offreCozy("bk-777", "Booking", {
    title: "Les Mélèzes",
    total: 2050,
    url: "https://www.booking.com/hotel/fr/les-melezes.html",
  }),
  offreCozy("abnb-777", "Airbnb", {
    title: "Grand chalet familial",
    total: 2100,
    url: "https://www.airbnb.fr/rooms/777",
  }),
];

function rapport(over: Partial<SourceReport> & Pick<SourceReport, "source">): SourceReport {
  return { ok: true, count: 0, ms: 1000, ...over };
}

function fait(over: Partial<Extract<Resultat, { etat: "fait" }>> = {}): Resultat {
  return { etat: "fait", n: 12, muettes: 0, petits: 0, med: 2400, ts: NOW, partiel: [], ...over };
}

const ECHEC: Resultat = { etat: "echec", ts: NOW, raison: "Aucune source n’a répondu." };
const REPOS = { enCours: false, attente: false };

describe("période et groupe", () => {
  it("les clés suivent la forme de la maquette, groupe compris", () => {
    assert.equal(perKey(PER), "2027-02-06|7");
    assert.equal(grpKey(GRP), "8|0");
    assert.equal(cleResultat(PER, GRP, "les-2-alpes"), "2027-02-06|7|8|0|les-2-alpes");
  });

  it("deux groupes ne partagent jamais un résultat", () => {
    assert.notEqual(
      cleResultat(PER, { trav: 8, rooms: 0 }, "les-2-alpes"),
      cleResultat(PER, { trav: 10, rooms: 0 }, "les-2-alpes"),
    );
    assert.notEqual(
      cleResultat(PER, { trav: 8, rooms: 0 }, "les-2-alpes"),
      cleResultat(PER, { trav: 8, rooms: 3 }, "les-2-alpes"),
    );
  });

  it("les bornes de nuits sont celles du séjour", () => {
    assert.equal(NUITS_MIN, STAY_BOUNDS.nights.min);
    assert.equal(NUITS_MAX, STAY_BOUNDS.nights.max);
  });

  it("bornerNuits arrondit, borne à 1..21, et rend 7 pour un nombre illisible", () => {
    assert.equal(bornerNuits(7), 7);
    assert.equal(bornerNuits(1), 1);
    assert.equal(bornerNuits(21), 21);
    assert.equal(bornerNuits(22), 21);
    assert.equal(bornerNuits(0), 1);
    assert.equal(bornerNuits(-3), 1);
    assert.equal(bornerNuits(0.4), 1);
    assert.equal(bornerNuits(7.4), 7);
    assert.equal(bornerNuits(7.6), 8);
    assert.equal(bornerNuits(Number.NaN), 7);
    assert.equal(bornerNuits(Number.POSITIVE_INFINITY), 7);
  });

  it("un séjour sans nuits se lit comme une semaine, un long séjour est borné", () => {
    assert.deepEqual(periodeDuSejour(IN, 7), PER);
    assert.deepEqual(periodeDuSejour(IN, 5), { from: IN, nights: 5 });
    assert.deepEqual(periodeDuSejour(IN, 0), PER);
    assert.deepEqual(periodeDuSejour(IN, -2), PER);
    assert.deepEqual(periodeDuSejour(IN, Number.NaN), PER);
    assert.deepEqual(periodeDuSejour(IN, 30), { from: IN, nights: 21 });
  });

  it("décaler bouge l'arrivée, avecNuits la durée bornée", () => {
    assert.deepEqual(decaler(PER, -1), { from: "2027-02-05", nights: 7 });
    assert.deepEqual(decaler(PER, 1), { from: "2027-02-07", nights: 7 });
    assert.deepEqual(decaler({ from: "2027-02-28", nights: 7 }, 1), {
      from: "2027-03-01",
      nights: 7,
    });
    assert.deepEqual(avecNuits(PER, 30), { from: IN, nights: 21 });
    assert.deepEqual(avecNuits(PER, 0), { from: IN, nights: 1 });
    assert.deepEqual(avecNuits(PER, 4), { from: IN, nights: 4 });
  });

  it("estPassee : une arrivée avant aujourd'hui, pas aujourd'hui même", () => {
    assert.equal(estPassee(PER, "2027-02-07"), true);
    assert.equal(estPassee(PER, IN), false);
    assert.equal(estPassee(PER, "2026-09-25"), false);
    assert.equal(estPassee({ from: "2026-12-31", nights: 7 }, "2027-01-01"), true);
  });

  it("perLbl ne nomme pas l'année, departLbl si", () => {
    assert.equal(departIso(PER), "2027-02-13");
    assert.equal(perLbl(PER), "du 6 févr. au 13 févr.");
    assert.equal(departLbl(PER), "13 févr. 2027");
  });

  it("un séjour à cheval sur deux années part l'année suivante", () => {
    const p = { from: "2026-12-28", nights: 7 };
    assert.equal(departIso(p), "2027-01-04");
    assert.equal(perLbl(p), "du 28 déc. au 4 janv.");
    assert.equal(departLbl(p), "4 janv. 2027");
  });
});

describe("médiane", () => {
  it("prend la valeur du milieu, ou la moyenne des deux du milieu, sans arrondi", () => {
    assert.equal(mediane([3, 1, 2]), 2);
    assert.equal(mediane([4, 1, 3, 2]), 2.5);
    assert.equal(mediane([2382.24, 2382.25]), 2382.245);
    assert.equal(mediane([7]), 7);
  });

  it("une liste vide n'a pas de médiane", () => {
    assert.equal(mediane([]), null);
  });

  it("ne touche pas à la liste reçue", () => {
    const xs = [3, 1, 2];
    mediane(xs);
    assert.deepEqual(xs, [3, 1, 2]);
  });
});

describe("agreger — ce qui entre dans la médiane", () => {
  it("retient les annonces qui passent tout et prend la médiane de leurs totaux", () => {
    assert.deepEqual(agreger(totaux([5000, 1000, 3000, 2000, 4000]), CTX), {
      n: 5,
      muettes: 0,
      petits: 0,
      med: 3000,
    });
  });

  it("un gîte avec devis ITEA live compte comme les autres", () => {
    assert.equal(agreger([gite()], CTX).n, 1);
  });

  it("la médiane est calculée même sous le minimum : l'écran seul décide", () => {
    assert.deepEqual(agreger(totaux([1000, 2000]), CTX), {
      n: 2,
      muettes: 0,
      petits: 0,
      med: 1500,
    });
    assert.ok(2 < MIN_ANNONCES);
  });

  it("aucune annonce : n à zéro, pas de médiane", () => {
    assert.deepEqual(agreger([], CTX), { n: 0, muettes: 0, petits: 0, med: null });
  });

  const exclues: [string, Listing][] = [
    ["un repli sur le relevé figé", annonce({ proven: "Relevé Airbnb, repli relevé 3 sept." })],
    ["une devise autre que l’euro", annonce({ currency: "CHF" })],
    ["un logement à plus de 12 km", annonce({ distToSlopesM: 20_000 })],
    ["un logement d’un autre domaine", annonce({ domainFit: "other" })],
    [
      "un gîte d’un autre département",
      gite({
        id: "50G123456",
        url: "https://www.gites-de-france.com/fr/normandie/manche/la-mer-50g123456",
      }),
    ],
    ["une annonce sans GPS", annonce({ lat: null, lon: null })],
    ["un GPS à (0, 0)", annonce({ lat: 0, lon: 0 })],
    [
      "un prix relevé pour d’autres dates",
      annonce({ pricedCheckIn: "2027-02-13", pricedCheckOut: "2027-02-20" }),
    ],
    ["un relevé de plus de six heures", annonce({ scannedAt: NOW - 7 * HEURE })],
    ["un relevé dont l'heure est inconnue", annonce({ scannedAt: null })],
    ["un total à zéro, prix non publié", annonce({ total: 0 })],
    ["un « à partir de », même non nul", annonce({ total: 1500, priceIndicative: true })],
    ["une carte sans annonce derrière", annonce({ source: "Booking", url: null })],
    [
      "une annonce absente du dernier relevé",
      annonce({ missingSince: { checkIn: IN, checkOut: OUT } }),
    ],
    ["un gîte sans devis ITEA live", gite({ proven: "ITEA gites-web 2026-09-03" })],
    [
      "un gîte dont la fiche est introuvable",
      gite({ proven: "devis ITEA live · fiche introuvable" }),
    ],
  ];

  for (const [cas, l] of exclues) {
    it(`écarte ${cas}, sans le compter nulle part`, () => {
      assert.deepEqual(agreger([l], CTX), { n: 0, muettes: 0, petits: 0, med: null });
    });
  }

  it("la même annonce, sans le défaut, passe : chaque cas n'écarte que pour sa raison", () => {
    assert.equal(agreger([annonce()], CTX).n, 1);
    assert.equal(agreger([gite()], CTX).n, 1);
  });

  it("une capacité tue est comptée à part, jamais supposée suffisante", () => {
    const r = agreger(
      [...totaux([1000, 2000]), annonce({ id: "muette", guests: null, bedrooms: null })],
      CTX,
    );
    assert.deepEqual(r, { n: 2, muettes: 1, petits: 0, med: 1500 });
  });

  it("une annonce trop petite est comptée à part", () => {
    const r = agreger([annonce({ id: "petit", guests: 4 }), annonce({ id: "ok" })], CTX);
    assert.deepEqual(r, { n: 1, muettes: 0, petits: 1, med: 2000 });
  });

  it("les chambres demandées se jugent en chambres, ou en pièces à défaut", () => {
    const ctx = { ...CTX, groupe: { trav: 8, rooms: 3 } };
    const r = agreger(
      [
        annonce({ id: "2ch", bedrooms: 2 }),
        annonce({ id: "4p", bedrooms: null, rooms: 4, total: 3000 }),
        annonce({ id: "3p", bedrooms: null, rooms: 3 }),
        annonce({ id: "tue", bedrooms: null, rooms: null }),
      ],
      ctx,
    );
    assert.deepEqual(r, { n: 1, muettes: 1, petits: 2, med: 3000 });
  });

  it("une annonce muette ou trop petite, mais écartée avant, n'est pas comptée", () => {
    const r = agreger(
      [
        annonce({ id: "muette-vieille", guests: null, scannedAt: NOW - 7 * HEURE }),
        annonce({ id: "petite-loin", guests: 2, distToSlopesM: 30_000 }),
      ],
      CTX,
    );
    assert.deepEqual(r, { n: 0, muettes: 0, petits: 0, med: null });
  });

  it("une annonce rendue deux fois ne compte qu'une fois", () => {
    assert.equal(agreger([annonce(), annonce()], CTX).n, 1);
    const tue = annonce({ id: "tue", guests: null });
    assert.equal(agreger([tue, tue], CTX).muettes, 1);
  });

  it("un logement vendu sur trois plateformes compte une fois, à son offre la moins chère", () => {
    assert.deepEqual(agreger(unBien, CTX), { n: 1, muettes: 0, petits: 0, med: 2050 });
    assert.deepEqual(
      retenir(unBien, CTX).map((l) => l.id),
      ["bk-777"],
    );
  });

  it("sans la preuve de Cozy, trois offres restent trois logements", () => {
    const horsCozy = unBien.map((l) => ({ ...l, proven: "vrbo-web getResultList 2026-09-03" }));
    assert.equal(agreger(horsCozy, CTX).n, 3);
  });

  it("les offres muettes ou trop petites se comptent une à une, regroupées ou non", () => {
    const muettes = unBien.map((l) => ({ ...l, guests: null, bedrooms: null }));
    assert.deepEqual(agreger(muettes, CTX), { n: 0, muettes: 3, petits: 0, med: null });
    const petites = unBien.map((l) => ({ ...l, guests: 4 }));
    assert.deepEqual(agreger(petites, CTX), { n: 0, muettes: 0, petits: 3, med: null });
  });

  it("le relevé vieillit : le même lot, six heures plus tard, ne compte plus", () => {
    const lot = totaux([1000, 2000, 3000]);
    assert.equal(agreger(lot, CTX).n, 3);
    assert.equal(agreger(lot, { ...CTX, now: NOW + 7 * HEURE }).n, 0);
  });
});

describe("sources en défaut", () => {
  it("les parts couvrent les six sources, sans doublon", () => {
    assert.deepEqual([...PARTS], ["airbnb", "gites", "cozy", "centrales", "greengo"]);
    const toutes = PARTS.flatMap((p) => SOURCES_DE_PART[p]);
    assert.deepEqual(toutes, [
      "Airbnb",
      "Gîtes de France",
      "Abritel",
      "Booking",
      "Centrale",
      "GreenGo",
    ]);
  });

  it("un refus, une pause ou un délai mettent toute source en défaut", () => {
    const motifs = [
      rapport({ source: "Airbnb", error: "HTTP 429" }),
      rapport({ source: "Gîtes de France", error: "Délai dépassé — relevé précédent conservé." }),
      rapport({ source: "Abritel", note: "Cozy : timeout" }),
      rapport({ source: "Booking", error: "fetch failed" }),
      rapport({ source: "Centrale", note: "coupe-circuit ouvert" }),
      rapport({ source: "GreenGo", note: "arrêté en route — limiteur local" }),
    ];
    assert.deepEqual(sourcesEnDefaut(motifs, []), [
      "Airbnb",
      "Gîtes de France",
      "Abritel",
      "Booking",
      "Centrale",
      "GreenGo",
    ]);
    for (const r of motifs) assert.deepEqual(sourcesEnDefaut([r], []), [r.source]);
  });

  it("une plateforme qui n'a pas répondu est en défaut, quel que soit le motif", () => {
    const r = [
      rapport({ source: "Booking", ok: false, error: "page anti-bot" }),
      rapport({ source: "GreenGo", ok: false }),
      rapport({ source: "Airbnb", ok: true, count: 40 }),
    ];
    assert.deepEqual(sourcesEnDefaut(r, []), ["Booking", "GreenGo"]);
  });

  it("une centrale non branchée ou un Gîtes sans commune ne sont pas un défaut", () => {
    const r = [
      rapport({ source: "Centrale", ok: false, error: "aucune centrale pour cette station" }),
      rapport({
        source: "Gîtes de France",
        ok: false,
        error: "pas d'identifiant de commune Gîtes de France",
      }),
    ];
    assert.deepEqual(sourcesEnDefaut(r, []), []);
  });

  /* Les textes exacts des collecteurs : run.server.ts (releverAirbnb,
     releverCozy, runGreenGo), airbnb.server.ts (raisons du relevé direct) et
     gites.server.ts (blocage), assemblés comme `notes()` les joint. */
  const tronques: [string, SourceReport][] = [
    [
      "Airbnb, relevé direct coupé à l'échéance",
      rapport({
        source: "Airbnb",
        count: 30,
        note: "Cozy 30, direct 0, communes 2 · direct : relevé direct coupé à l'échéance",
      }),
    ],
    [
      "Airbnb, repli sur une page HTML",
      rapport({
        source: "Airbnb",
        count: 40,
        note:
          "Cozy 30, direct 10, communes 2 · direct : le worker Airbnb n'a rien rendu — " +
          "repli sur une page HTML",
      }),
    ],
    [
      "Airbnb, relevé direct arrêté par un refus",
      rapport({
        source: "Airbnb",
        count: 150,
        note:
          "Cozy 30, direct 120, communes 3 · Airbnb en publie 429 à 6 km de la station · " +
          "direct : arrêté en route — HTTP 429",
      }),
    ],
    [
      "Airbnb, Cozy coupé par l'échéance",
      rapport({
        source: "Airbnb",
        count: 392,
        note:
          "Cozy 12, direct 380, communes 3 · Airbnb en publie 429 à 6 km de la station · " +
          "Cozy : coupé par l'échéance",
      }),
    ],
    [
      "Airbnb, Cozy muet",
      rapport({
        source: "Airbnb",
        count: 380,
        note:
          "Cozy 0, direct 380, communes 3 · " +
          "Cozy : Airbnb non relevé (échéance ou recherche sans identifiant)",
      }),
    ],
    [
      "Abritel, Cozy coupé avant lui",
      rapport({ source: "Abritel", note: "Cozy coupé par l'échéance avant ce fournisseur" }),
    ],
    [
      "Booking, Cozy coupé",
      rapport({ source: "Booking", count: 8, note: "Cozy coupé par l'échéance" }),
    ],
    [
      "Booking, repli direct en échec",
      rapport({
        source: "Booking",
        note: "repli direct : worker Booking introuvable (scrape/booking/cli.py)",
      }),
    ],
    [
      "Gîtes de France refusé (429)",
      rapport({ source: "Gîtes de France", ok: false, error: "Gîtes de France bloqué (429)" }),
    ],
    [
      "Gîtes de France refusé (403)",
      rapport({ source: "Gîtes de France", ok: false, error: "Gîtes de France bloqué (403)" }),
    ],
    [
      "Gîtes de France mis au défi",
      rapport({
        source: "Gîtes de France",
        ok: false,
        error: "Gîtes de France bloqué (défi challenge)",
      }),
    ],
    [
      "Gîtes de France, page de défi",
      rapport({
        source: "Gîtes de France",
        ok: false,
        error: "Gîtes de France bloqué (page de défi)",
      }),
    ],
    [
      "GreenGo arrêté à l'échéance",
      rapport({
        source: "GreenGo",
        count: 20,
        note: "18 hôtes réservables à 6 km, 5 lus en détail · arrêté en route — échéance",
      }),
    ],
    [
      "GreenGo freiné par notre limiteur",
      rapport({
        source: "GreenGo",
        count: 20,
        note:
          "18 hôtes réservables à 6 km, 5 lus en détail · " +
          "arrêté en route — limiteur local (4 s à attendre)",
      }),
    ],
  ];

  for (const [cas, r] of tronques) {
    it(`un relevé tronqué est en défaut : ${cas}`, () => {
      assert.deepEqual(sourcesEnDefaut([r], []), [r.source]);
    });
  }

  const complets: [string, SourceReport][] = [
    [
      "Airbnb, Cozy et direct comptés",
      rapport({
        source: "Airbnb",
        count: 446,
        note: "Cozy 38, direct 408, communes 3 · Airbnb en publie 429 à 6 km de la station",
      }),
    ],
    [
      "GreenGo, tous les hôtes lus",
      rapport({
        source: "GreenGo",
        count: 30,
        note: "18 hôtes réservables à 6 km, 12 lus en détail",
      }),
    ],
    [
      "GreenGo, au-delà de son plafond de lecture",
      rapport({
        source: "GreenGo",
        count: 30,
        note:
          "18 hôtes réservables à 6 km, 12 lus en détail · " +
          "arrêté en route — 6 hôtes au-delà des 12 lus en détail",
      }),
    ],
    [
      "Booking relevé en direct, Cozy vide",
      rapport({ source: "Booking", count: 25, note: "repli sur le relevé direct (Cozy vide)" }),
    ],
    [
      "Gîtes de France, code de commune faux",
      rapport({
        source: "Gîtes de France",
        ok: false,
        error:
          "recherche Gîtes de France non localisée (towns=38191, 5210 résultats) — " +
          "code de commune à revérifier",
      }),
    ],
    [
      "une centrale sans rien de libre",
      rapport({
        source: "Centrale",
        error: "Centrale Les 2 Alpes : rien de disponible à ces dates pour ce groupe.",
      }),
    ],
  ];

  for (const [cas, r] of complets) {
    it(`une note ordinaire n'est pas un défaut : ${cas}`, () => {
      assert.deepEqual(sourcesEnDefaut([r], []), []);
    });
  }

  it("une part rejetée côté client met toutes ses sources en défaut", () => {
    assert.deepEqual(sourcesEnDefaut([], ["cozy"]), ["Abritel", "Booking"]);
    assert.deepEqual(sourcesEnDefaut([], ["greengo", "airbnb"]), ["Airbnb", "GreenGo"]);
  });

  it("chaque nom paraît une fois, dans l'ordre des parts", () => {
    const r = [
      rapport({ source: "GreenGo", ok: false }),
      rapport({ source: "Airbnb", error: "HTTP 503" }),
      rapport({ source: "Airbnb", ok: false }),
    ];
    assert.deepEqual(sourcesEnDefaut(r, ["airbnb"]), ["Airbnb", "GreenGo"]);
  });
});

describe("résultat d'un relevé", () => {
  const base = {
    listings: [] as Listing[],
    sources: [] as SourceReport[],
    partsEchouees: [] as Part[],
    dept: S2A.dept,
    checkIn: IN,
    checkOut: OUT,
    groupe: GRP,
    now: NOW,
  };

  it("toutes les parts rejetées : échec", () => {
    assert.deepEqual(resultatDuReleve({ ...base, partsEchouees: [...PARTS] }), ECHEC);
  });

  it("aucune annonce et les quatre plateformes en défaut : échec, pas un zéro", () => {
    const sources = [
      rapport({ source: "Airbnb", ok: false, error: "HTTP 429" }),
      rapport({ source: "Abritel", ok: false }),
      rapport({ source: "Booking", ok: false }),
      rapport({ source: "GreenGo", ok: false }),
      rapport({ source: "Centrale", ok: true }),
    ];
    assert.deepEqual(resultatDuReleve({ ...base, sources }), ECHEC);
  });

  /* Ce que `applyDump` (run.server.ts) ajoute à toute source muette aux
     2 Alpes du 6 au 13 février 2027 : le relevé figé, marqué « repli ». */
  const SUFFIXE_REPLI = " — repli relevé 3 sept. (live vide ou non branché)";
  const replis = [
    annonce({
      id: "abnb-6-8-cosy",
      proven: `StaySearchResult live 2026-09-03, 2 231 € au total.${SUFFIXE_REPLI}`,
    }),
    gite({ proven: `ITEA gites-web 2026-09-03, 6–13 fév. 2027, 8 pers.${SUFFIXE_REPLI}` }),
    annonce({
      id: "violettes-49",
      source: "Centrale",
      proven: `station-web Ingénie 2026-09-03, total fiche 8 pers. 6–13 fév. 2027.${SUFFIXE_REPLI}`,
    }),
  ];
  const plateformesMuettes = [
    rapport({ source: "Airbnb", ok: false, error: "fetch failed" }),
    rapport({ source: "Abritel", ok: false, error: "fetch failed" }),
    rapport({ source: "Booking", ok: false, error: "fetch failed" }),
    rapport({ source: "GreenGo", ok: false, error: "fetch failed" }),
  ];

  it("le relevé figé ajouté par le serveur ne prouve pas qu'une source a répondu", () => {
    const input = { ...base, listings: replis, sources: plateformesMuettes };
    assert.deepEqual(resultatDuReleve(input), ECHEC);
    assert.deepEqual(annoncesDuReleve(input), []);
  });

  it("une seule annonce réelle parmi les replis : un relevé fait", () => {
    const input = { ...base, listings: [...replis, annonce()], sources: plateformesMuettes };
    const r = resultatDuReleve(input);
    assert.equal(r.etat, "fait");
    if (r.etat === "fait") assert.equal(r.n, 1);
    assert.deepEqual(
      annoncesDuReleve(input).map((a) => a.id),
      ["airbnb-1"],
    );
  });

  it("aucune annonce, mais une plateforme a répondu : un relevé fait, et vide", () => {
    const sources = [
      rapport({ source: "Airbnb", ok: true }),
      rapport({ source: "Abritel", ok: false }),
      rapport({ source: "Booking", ok: false }),
      rapport({ source: "GreenGo", ok: false }),
    ];
    assert.deepEqual(resultatDuReleve({ ...base, sources }), {
      etat: "fait",
      n: 0,
      muettes: 0,
      petits: 0,
      med: null,
      ts: NOW,
      partiel: ["Abritel", "Booking", "GreenGo"],
    });
  });

  it("des annonces : un relevé fait, avec les sources en défaut", () => {
    const r = resultatDuReleve({
      ...base,
      listings: totaux([1000, 2000, 3000, 4000, 5000]),
      sources: [
        rapport({ source: "Airbnb", ok: true, count: 5 }),
        rapport({ source: "Centrale", ok: true, error: "HTTP 503" }),
      ],
    });
    assert.deepEqual(r, {
      etat: "fait",
      n: 5,
      muettes: 0,
      petits: 0,
      med: 3000,
      ts: NOW,
      partiel: ["Centrale"],
    });
  });

  it("des annonces revenues malgré les plateformes en défaut : un relevé fait, partiel", () => {
    const r = resultatDuReleve({
      ...base,
      listings: totaux([1000]),
      partsEchouees: ["airbnb", "cozy", "greengo"],
    });
    assert.equal(r.etat, "fait");
    if (r.etat === "fait") {
      assert.equal(r.n, 1);
      assert.deepEqual(r.partiel, ["Airbnb", "Abritel", "Booking", "GreenGo"]);
    }
  });
});

describe("plages — échelle et poignées", () => {
  it("l'échelle du référentiel, arrondie au pas", () => {
    // Relevé sur les 320 stations : km 0,1 à 771,4 ; sommet 970 à 3 600
    // (0 non mesuré exclu) ; village 324 à 2 321.
    assert.deepEqual(bornesPlages(STATIONS), {
      prix: [0, 6000],
      km: [0, 780],
      sommet: [900, 3600],
      village: [300, 2400],
      budget: [0, 10000],
    });
  });

  it("une altitude à zéro ne fait pas descendre l'échelle du sommet", () => {
    const pilat = stationReelle("les-monts-du-pilat");
    assert.equal(pilat.maxM, 0);
    assert.equal(valeurStation("sommet", pilat), null);
    assert.equal(valeurStation("km", S2A), S2A.pistesKm);
    assert.equal(valeurStation("village", S2A), S2A.villageM);
  });

  it("sans valeur mesurée, l'échelle vaut un pas", () => {
    assert.deepEqual(bornesPlages([]), {
      prix: [0, 6000],
      km: [0, 10],
      sommet: [0, 100],
      village: [0, 100],
      budget: [0, 10000],
    });
    const muette = { ...S2A, pistesKm: null, maxM: 0, villageM: 0 };
    assert.deepEqual(bornesPlages([muette]).km, [0, 10]);
  });

  const B: readonly [number, number] = [0, 6000];

  it("poserBorne arrondit au pas", () => {
    assert.deepEqual(poserBorne(null, B, 100, 1, 2049), [0, 2000]);
    assert.deepEqual(poserBorne(null, B, 100, 1, 2051), [0, 2100]);
    assert.deepEqual(poserBorne(null, B, 100, 0, 949), [900, 6000]);
  });

  it("poserBorne borne à l'échelle", () => {
    assert.deepEqual(poserBorne([1000, 3000], B, 100, 0, -500), [0, 3000]);
    assert.deepEqual(poserBorne([1000, 3000], B, 100, 1, 9000), [1000, 6000]);
    assert.deepEqual(poserBorne([1000, 3000], B, 100, 1, 5820), [1000, 5800]);
  });

  it("les poignées ne se croisent pas", () => {
    assert.deepEqual(poserBorne([1000, 2000], B, 100, 0, 2500), [2000, 2000]);
    assert.deepEqual(poserBorne([1000, 2000], B, 100, 1, 500), [1000, 1000]);
  });

  it("toute l'échelle couverte, la plage redevient nulle", () => {
    assert.equal(poserBorne([1000, 6000], B, 100, 0, 0), null);
    assert.equal(poserBorne([0, 5000], B, 100, 1, 6000), null);
    assert.equal(poserBorne(null, B, 100, 0, 0), null);
  });

  it("une saisie illisible laisse la plage telle quelle", () => {
    const pl = [1000, 2000] as const;
    assert.equal(poserBorne(pl, B, 100, 0, Number.NaN), pl);
  });

  it("poigneeProche prend la plus proche, la basse à égalité", () => {
    assert.equal(poigneeProche(0, [1000, 3000]), 0);
    assert.equal(poigneeProche(2000, [1000, 3000]), 0);
    assert.equal(poigneeProche(2001, [1000, 3000]), 1);
    assert.equal(poigneeProche(6000, [1000, 3000]), 1);
  });

  it("poignées confondues : celle du côté du clic", () => {
    assert.equal(poigneeProche(900, [1000, 1000]), 0);
    assert.equal(poigneeProche(1000, [1000, 1000]), 1);
    assert.equal(poigneeProche(1100, [1000, 1000]), 1);
  });

  it("lireSaisie garde les chiffres et lit la virgule décimale", () => {
    assert.equal(lireSaisie("1 200 €"), 1200);
    assert.equal(lireSaisie("2 400 m"), 2400);
    assert.equal(lireSaisie("1,5"), 1.5);
    assert.equal(lireSaisie("1.5"), 1.5);
    assert.equal(lireSaisie("-100"), -100);
    assert.equal(lireSaisie("abc"), null);
    assert.equal(lireSaisie(""), null);
    assert.equal(lireSaisie("-"), null);
    assert.equal(lireSaisie("1.200,50"), null);
  });

  it("fmtPlage écrit chaque unité", () => {
    assert.equal(fmtPlage("prix", 6000), "6 000 €");
    assert.equal(fmtPlage("km", 120), "120 km");
    assert.equal(fmtPlage("sommet", 3600), "3 600 m");
    assert.equal(fmtPlage("village", 900), "900 m");
  });

  it("plageLbl : quatre cas, apostrophe typographique", () => {
    assert.equal(plageLbl("prix", null, B), "Indifférent");
    assert.equal(plageLbl("prix", [2000, 6000], B), "2 000 € et plus");
    assert.equal(plageLbl("prix", [0, 2000], B), "jusqu’à 2 000 €");
    assert.equal(plageLbl("prix", [1000, 2000], B), "1 000 € à 2 000 €");
    assert.equal(plageLbl("km", [100, 780], [0, 780]), "100 km et plus");
    assert.equal(plageLbl("sommet", [900, 2000], [900, 3600]), "jusqu’à 2 000 m");
    assert.ok(!plageLbl("prix", [0, 2000], B).includes("'"));
  });

  it("filtresActifs : le repos n'est pas un filtre", () => {
    assert.equal(filtresActifs(FL0), false);
    assert.equal(filtresActifs({ ...FL0, massif: "Jura" }), true);
    assert.equal(filtresActifs({ ...FL0, dept: "Isère" }), true);
    assert.equal(filtresActifs({ ...FL0, avecPrix: true }), true);
    for (const p of PLAGES) assert.equal(filtresActifs({ ...FL0, [p.k]: [0, 10] }), true);
  });
});

describe("lignes — état et filtres", () => {
  it("le sous-titre de massif omet un département absent", () => {
    assert.equal(ligne(S2A, null, REPOS).subMassif, "Alpes du Nord · Isère");
    const sansDept = stationReelle("le-granier-vallee-des-entremonts");
    assert.equal(sansDept.dept, null);
    assert.equal(ligne(sansDept, null, REPOS).subMassif, "Alpes du Nord");
  });

  it("l'état suit la priorité de la maquette", () => {
    assert.equal(ligne(S2A, fait(), { enCours: true, attente: true }).etat, "en-cours");
    assert.equal(ligne(S2A, null, { enCours: false, attente: true }).etat, "attente");
    // En attente, un résultat déjà là continue de s'afficher.
    assert.equal(ligne(S2A, fait(), { enCours: false, attente: true }).etat, "prix");
    assert.equal(ligne(S2A, null, REPOS).etat, "non-releve");
    assert.equal(ligne(S2A, ECHEC, REPOS).etat, "echec");
    assert.equal(ligne(S2A, fait({ n: MIN_ANNONCES - 1 }), REPOS).etat, "peu");
    assert.equal(ligne(S2A, fait({ n: MIN_ANNONCES }), REPOS).etat, "prix");
  });

  it("n vient d'un relevé fait, la médiane d'un prix seulement", () => {
    const peu = ligne(S2A, fait({ n: 3, med: 1500 }), REPOS);
    assert.equal(peu.n, 3);
    assert.equal(peu.med, null);
    const prix = ligne(S2A, fait({ n: 9, med: 2382.245 }), REPOS);
    assert.equal(prix.n, 9);
    assert.equal(prix.med, 2382.245);
    const echec = ligne(S2A, ECHEC, REPOS);
    assert.equal(echec.n, null);
    assert.equal(echec.med, null);
    const enCours = ligne(S2A, fait({ n: 9, med: 2000 }), { enCours: true, attente: false });
    assert.equal(enCours.n, 9);
    assert.equal(enCours.med, null);
  });

  const B = bornesPlages(STATIONS);
  const st = (over: Partial<Station>) => ({ ...S2A, ...over });
  const s = st({
    massif: "Alpes du Nord",
    dept: "Isère",
    pistesKm: 200,
    maxM: 3600,
    villageM: 1650,
  });
  const prix = ligne(s, fait({ med: 2400 }), REPOS);
  const peu = ligne(s, fait({ n: 2, med: 900 }), REPOS);
  const f = (over: Partial<Filtres>): Filtres => ({ ...FL0, ...over });

  it("massif, département et « avec un prix »", () => {
    assert.equal(passe(prix, s, FL0, B), true);
    assert.equal(passe(prix, s, f({ massif: "Jura" }), B), false);
    assert.equal(passe(prix, s, f({ massif: "Alpes du Nord" }), B), true);
    assert.equal(passe(prix, s, f({ dept: "Savoie" }), B), false);
    assert.equal(passe(prix, s, f({ dept: "Isère" }), B), true);
    assert.equal(passe(prix, s, f({ avecPrix: true }), B), true);
    assert.equal(passe(peu, s, f({ avecPrix: true }), B), false);
  });

  it("une plage garde ce qui est dedans, borne basse comprise", () => {
    assert.equal(passe(prix, s, f({ km: [100, 300] }), B), true);
    assert.equal(passe(prix, s, f({ km: [200, 200] }), B), true);
    assert.equal(passe(prix, s, f({ km: [250, 300] }), B), false);
    assert.equal(passe(prix, s, f({ km: [0, 150] }), B), false);
    assert.equal(passe(prix, s, f({ village: [1700, 2400] }), B), false);
    assert.equal(passe(prix, s, f({ prix: [0, 2000] }), B), false);
    assert.equal(passe(prix, s, f({ prix: [2000, 3000] }), B), true);
  });

  it("la borne haute au maximum veut dire « et plus »", () => {
    const hors = st({ pistesKm: 900 });
    assert.equal(passe(prix, hors, f({ km: [100, B.km[1]] }), B), true);
    assert.equal(passe(prix, hors, f({ km: [100, B.km[1] - 10] }), B), false);
    const cher = ligne(s, fait({ med: 9000 }), REPOS);
    assert.equal(passe(cher, s, f({ prix: [2000, 6000] }), B), true);
  });

  it("une valeur absente est écartée par une plage active, pas par une plage au repos", () => {
    const sansKm = st({ pistesKm: null });
    assert.equal(passe(prix, sansKm, f({ km: [0, 300] }), B), false);
    assert.equal(passe(prix, sansKm, f({ km: [0, B.km[1]] }), B), false);
    assert.equal(passe(prix, sansKm, FL0, B), true);
    // Une plage de prix active écarte toute station sans prix.
    assert.equal(passe(peu, s, f({ prix: [0, 6000] }), B), false);
    const sansSommet = stationReelle("les-monts-du-pilat");
    const l = ligne(sansSommet, null, REPOS);
    assert.equal(passe(l, sansSommet, f({ sommet: [900, 2000] }), B), false);
  });
});

describe("tri", () => {
  it("chaque option de la liste se relit telle quelle", () => {
    for (const t of TRIS) {
      const lu = lireTri(t.v);
      assert.equal(triVal(lu), t.v);
      assert.equal(triLbl(lu), t.label);
    }
  });

  it("une valeur inconnue revient au tri par défaut", () => {
    assert.deepEqual(TRI0, { k: "med", dir: 1 });
    assert.deepEqual(lireTri("altitude:1"), TRI0);
    assert.deepEqual(lireTri("med:2"), TRI0);
    assert.deepEqual(lireTri(""), TRI0);
  });

  it("les sens que la liste ne propose pas ont quand même un libellé", () => {
    assert.equal(triLbl({ k: "nom", dir: -1 }), "Nom, de Z à A");
    assert.equal(triLbl({ k: "n", dir: 1 }), "Nombre de logements, croissant");
    assert.equal(triLbl({ k: "n", dir: -1 }), "Nombre de logements");
    assert.equal(triLbl({ k: "massif", dir: -1 }), "Massif, puis prix");
    assert.deepEqual(lireTri("nom:-1"), { k: "nom", dir: -1 });
    assert.equal(triVal({ k: "massif", dir: -1 }), "massif:1");
    assert.deepEqual(lireTri("massif:-1"), { k: "massif", dir: 1 });
  });

  it("les massifs du référentiel, du plus fourni au moins fourni", () => {
    assert.deepEqual(ordreMassifs(STATIONS), [
      "Alpes du Nord",
      "Alpes du Sud",
      "Pyrénées",
      "Vosges",
      "Massif Central",
      "Jura",
      "Corse",
    ]);
  });

  it("à nombre égal, les massifs se rangent par nom", () => {
    const a = { ...S2A, massif: "Vosges" };
    const b = { ...S2A, massif: "Jura" };
    assert.deepEqual(ordreMassifs([a, b]), ["Jura", "Vosges"]);
  });

  function l(id: string, nom: string, over: Partial<Ligne> = {}): Ligne {
    return {
      id,
      nom,
      massif: "Alpes du Nord",
      dept: null,
      subMassif: "Alpes du Nord",
      etat: "prix",
      n: null,
      med: null,
      res: null,
      ...over,
    };
  }
  const RANG = new Map(ordreMassifs(STATIONS).map((m, i) => [m, i] as const));
  const trier = (t: Tri, xs: Ligne[]) => [...xs].sort(comparateur(t, RANG)).map((x) => x.id);

  it("prix : les stations sans prix en dernier, dans les deux sens", () => {
    const xs = [l("a", "A", { med: 300 }), l("b", "B"), l("c", "C", { med: 100 }), l("d", "D")];
    assert.deepEqual(trier({ k: "med", dir: 1 }, xs), ["c", "a", "b", "d"]);
    assert.deepEqual(trier({ k: "med", dir: -1 }, xs), ["a", "c", "b", "d"]);
  });

  it("annonces : les stations sans relevé en dernier, dans les deux sens", () => {
    const xs = [l("a", "A", { n: 3 }), l("b", "B"), l("c", "C", { n: 12 })];
    assert.deepEqual(trier({ k: "n", dir: -1 }, xs), ["c", "a", "b"]);
    assert.deepEqual(trier({ k: "n", dir: 1 }, xs), ["a", "c", "b"]);
  });

  it("à valeur égale, le nom puis l'id départagent, quel que soit le sens", () => {
    const xs = [
      l("z", "Zinal", { med: 100 }),
      l("praloup-04226", "Praloup", { med: 100 }),
      l("praloup", "Praloup", { med: 100 }),
    ];
    const attendu = ["praloup", "praloup-04226", "z"];
    assert.deepEqual(trier({ k: "med", dir: 1 }, xs), attendu);
    assert.deepEqual(trier({ k: "med", dir: -1 }, xs), attendu);
  });

  it("nom : les homonymes du référentiel restent départagés par l'id", () => {
    const ids = ["praloup-04226", "le-granier-vallee-des-entremonts", "praloup", "le-granier"];
    const xs = ids.map((id) => ligne(stationReelle(id), null, REPOS));
    assert.deepEqual(trier({ k: "nom", dir: 1 }, xs), [
      "le-granier",
      "le-granier-vallee-des-entremonts",
      "praloup",
      "praloup-04226",
    ]);
    assert.deepEqual(trier({ k: "nom", dir: -1 }, xs), [
      "praloup",
      "praloup-04226",
      "le-granier",
      "le-granier-vallee-des-entremonts",
    ]);
  });

  it("massif : rang du massif, puis prix croissant, sans prix en dernier ; le sens est ignoré", () => {
    const xs = [
      l("sud-cher", "Sud cher", { massif: "Alpes du Sud", med: 3000 }),
      l("nord-rien", "Nord rien", { massif: "Alpes du Nord" }),
      l("nord-cher", "Nord cher", { massif: "Alpes du Nord", med: 2500 }),
      l("jura", "Jura", { massif: "Jura", med: 100 }),
      l("nord-bon", "Nord bon", { massif: "Alpes du Nord", med: 1500 }),
    ];
    const attendu = ["nord-bon", "nord-cher", "nord-rien", "sud-cher", "jura"];
    assert.deepEqual(trier({ k: "massif", dir: 1 }, xs), attendu);
    assert.deepEqual(trier({ k: "massif", dir: -1 }, xs), attendu);
  });
});

describe("libellés", () => {
  it("plur met le singulier à 0 et 1", () => {
    assert.equal(plur(0, "station", "stations"), "0 station");
    assert.equal(plur(1, "station", "stations"), "1 station");
    assert.equal(plur(2, "station", "stations"), "2 stations");
  });

  it("les comptes s'accordent", () => {
    assert.equal(countFl(12, 320), "12 stations sur 320");
    assert.equal(countFl(1, 320), "1 station sur 320");
    assert.equal(countFl(0, 0), "0 station sur 0");
    assert.equal(countLbl(40, 320), "40 affichées sur 320");
    assert.equal(countLbl(1, 1), "1 affichée sur 1");
    assert.equal(countLbl(0, 0), "0 affichée sur 0");
  });

  it("« Afficher de plus » ne promet jamais plus d'une page", () => {
    assert.equal(PAGE, 40);
    assert.equal(moreLbl(100), "Afficher 40 de plus");
    assert.equal(moreLbl(40), "Afficher 40 de plus");
    assert.equal(moreLbl(7), "Afficher 7 de plus");
  });

  it("le bouton de relevé s'accorde, et ne dit pas « les 1 stations »", () => {
    assert.equal(relLbl(1, true), "Relever à nouveau la station");
    assert.equal(relLbl(12, true), "Relever à nouveau les 12 stations");
    assert.equal(relLbl(1, false), "Relever la station affichée");
    assert.equal(relLbl(12, false), "Relever les 12 stations affichées");
  });

  it("le nom d'une liste tient au massif et au département", () => {
    assert.equal(nomListe(FL0), "stations affichées");
    assert.equal(nomListe({ ...FL0, massif: "Alpes du Nord" }), "Alpes du Nord");
    assert.equal(
      nomListe({ ...FL0, massif: "Alpes du Nord", dept: "Isère" }),
      "Alpes du Nord, Isère",
    );
    assert.equal(nomListe({ ...FL0, km: [100, 780], avecPrix: true }), "stations affichées");
  });

  const B: Bornes = bornesPlages(STATIONS);
  const tout: Filtres = {
    massif: "Alpes du Nord",
    dept: "Isère",
    avecPrix: true,
    prix: [0, 2000],
    km: [100, 780],
    sommet: [1000, 2000],
    village: [1200, 1800],
    budget: null,
  };

  it("les jetons suivent l'ordre de la maquette", () => {
    assert.deepEqual(jetons(tout, B), [
      { k: "massif", lbl: "Alpes du Nord" },
      { k: "dept", lbl: "Isère" },
      { k: "avecPrix", lbl: "Avec un prix" },
      { k: "prix", lbl: "Médiane : jusqu’à 2 000 €" },
      { k: "km", lbl: "Km de pistes : 100 km et plus" },
      { k: "sommet", lbl: "Sommet : 1 000 m à 2 000 m" },
      { k: "village", lbl: "Altitude du village : 1 200 m à 1 800 m" },
    ]);
    assert.deepEqual(jetons(FL0, B), []);
  });

  it("retirer un jeton ne retire que lui, sauf le massif qui emporte le département", () => {
    assert.deepEqual(retirerJeton(tout, "massif"), { ...tout, massif: "", dept: "" });
    assert.deepEqual(retirerJeton(tout, "dept"), { ...tout, dept: "" });
    assert.deepEqual(retirerJeton(tout, "avecPrix"), { ...tout, avecPrix: false });
    for (const p of PLAGES) assert.deepEqual(retirerJeton(tout, p.k), { ...tout, [p.k]: null });
    assert.equal(tout.massif, "Alpes du Nord", "le filtre reçu n'est pas modifié");
  });

  it("annSub nomme ce que le relevé a écarté", () => {
    assert.equal(annSub(fait({ muettes: 5, petits: 2 })), "5 sans capacité, 2 trop petites");
    assert.equal(annSub(fait({ muettes: 0, petits: 1 })), "1 trop petite");
    assert.equal(annSub(fait({ muettes: 3, petits: 0 })), "3 sans capacité");
    assert.equal(annSub(fait()), "");
    assert.equal(annSub(ECHEC), "");
    assert.equal(annSub(null), "");
  });

  it("releveLbl date le relevé au jour de l'utilisateur, pas au jour UTC", () => {
    // Horodatages construits à l'heure locale : vrais quel que soit le fuseau
    // de la machine de test. À Paris, 0 h 30 le 25 est encore le 24 en UTC,
    // et le jour UTC datait ce relevé de la veille.
    assert.equal(releveLbl(fait({ ts: new Date(2026, 8, 24, 23, 30).getTime() })), "24 sept. 2026");
    assert.equal(releveLbl(fait({ ts: new Date(2026, 8, 25, 0, 30).getTime() })), "25 sept. 2026");
    assert.equal(releveLbl({ ...ECHEC, ts: new Date(2027, 1, 6, 0, 0).getTime() }), "6 févr. 2027");
    assert.equal(releveLbl(null), "");
  });

  it("releveLbl tait un horodatage illisible au lieu de casser l'écran", () => {
    assert.equal(releveLbl(fait({ ts: 1e16 })), "");
    assert.equal(releveLbl(fait({ ts: Number.NaN })), "");
    assert.equal(releveLbl(fait({ ts: Number.POSITIVE_INFINITY })), "");
  });

  it("sous-titre, écart au séjour et en-tête s'accordent au nombre", () => {
    assert.equal(
      sousTitre(7, 8),
      "Médiane du total pour 7 nuits, logements qui accueillent 8 voyageurs.",
    );
    assert.equal(
      sousTitre(1, 1),
      "Médiane du total pour 1 nuit, logements qui accueillent 1 voyageur.",
    );
    assert.equal(ecartLbl(PER), "Votre séjour : du 6 févr. au 13 févr., 7 nuits.");
    assert.equal(medHead(7), "Médiane, 7 nuits");
    assert.equal(medHead(1), "Médiane, 1 nuit");
  });

  it("dureeLbl arrondit à la seconde supérieure, jamais négatif", () => {
    assert.equal(dureeLbl(45_000), "45 s");
    assert.equal(dureeLbl(44_001), "45 s");
    assert.equal(dureeLbl(59_001), "1 min");
    assert.equal(dureeLbl(65_000), "1 min 5 s");
    assert.equal(dureeLbl(120_000), "2 min");
    assert.equal(dureeLbl(0), "0 s");
    assert.equal(dureeLbl(-5_000), "0 s");
    assert.equal(dureeLbl(Number.NaN), "0 s");
  });

  it("aucun libellé neuf n'écrit d'apostrophe droite ni de tiret cadratin", () => {
    const textes = [
      ...TRIS.map((t) => t.label),
      triLbl({ k: "n", dir: 1 }),
      plageLbl("prix", [0, 2000], [0, 6000]),
      relLbl(3, true),
      sousTitre(7, 8),
      ecartLbl(PER),
    ];
    for (const t of textes) {
      assert.ok(!t.includes("'"), t);
      assert.ok(!t.includes("—"), t);
      assert.ok(!t.includes("!"), t);
    }
  });
});

describe("file des relevés", () => {
  const job = (over: Partial<Job> = {}): Job => ({
    nom: "Alpes du Nord",
    ids: ["les-2-alpes", "chamrousse"],
    per: PER,
    groupe: GRP,
    ...over,
  });

  it("la signature réunit période, groupe et stations", () => {
    assert.equal(signature(job()), "2027-02-06|7|8|0|les-2-alpes,chamrousse");
  });

  it("un relevé déjà en course ou en file n'est pas relancé", () => {
    assert.equal(dejaPrevu(job(), job(), []), true);
    assert.equal(dejaPrevu(job(), null, [job({ ids: ["x"] }), job()]), true);
    assert.equal(dejaPrevu(job(), null, []), false);
    // Le nom seul ne suffit pas : une autre liste du même massif est un autre relevé.
    assert.equal(dejaPrevu(job({ nom: "stations affichées" }), job(), []), true);
    assert.equal(dejaPrevu(job(), job({ groupe: { trav: 10, rooms: 0 } }), []), false);
    assert.equal(dejaPrevu(job(), job({ per: { from: IN, nights: 6 } }), []), false);
    assert.equal(dejaPrevu(job(), job({ ids: ["chamrousse", "les-2-alpes"] }), []), false);
  });

  it("elaguer garde les plus récents", () => {
    const res: Record<string, Resultat> = {
      a: fait({ ts: 1 }),
      b: fait({ ts: 3 }),
      c: ECHEC,
      d: fait({ ts: 2 }),
    };
    const r = elaguer(res, 2);
    assert.deepEqual(Object.keys(r).sort(), ["b", "c"]);
    assert.equal(Object.keys(res).length, 4, "l'objet reçu n'est pas modifié");
  });

  it("elaguer rend le même objet quand rien ne part", () => {
    const res: Record<string, Resultat> = { a: fait({ ts: 1 }), b: fait({ ts: 2 }) };
    assert.equal(elaguer(res, 2), res);
    assert.equal(elaguer(res), res);
    assert.equal(MAX_RESULTATS, 4000);
  });

  it("elaguer part du maximum par défaut", () => {
    const res: Record<string, Resultat> = {};
    for (let i = 0; i < MAX_RESULTATS + 3; i++) res[`k${i}`] = fait({ ts: i });
    const r = elaguer(res);
    assert.equal(Object.keys(r).length, MAX_RESULTATS);
    assert.ok(!("k0" in r) && !("k2" in r));
    assert.ok(`k${MAX_RESULTATS + 2}` in r);
  });
});

/* ---------- Onglet « Par budget » ---------- */

describe("plage de budget", () => {
  const B = bornesPlages(STATIONS);
  const s = { ...S2A, massif: "Alpes du Nord", dept: "Isère", pistesKm: 200 };
  const prix = ligne(s, fait({ med: 2400 }), REPOS);
  const f = (over: Partial<Filtres>): Filtres => ({ ...FL0, ...over });

  it("la plage de budget porte sur le total, de 0 à 10 000 €", () => {
    assert.deepEqual(PLAGE_BUDGET, {
      k: "budget",
      lbl: "Budget, total du séjour",
      pas: 100,
      unite: "€",
      fixe: [0, 10000],
    });
    assert.equal(FL0.budget, null);
    assert.deepEqual(B.budget, [0, 10000]);
    assert.deepEqual(bornesPlages([]).budget, [0, 10000]);
  });

  it("l'onglet station garde ses quatre plages, l'onglet budget n'en prend que trois", () => {
    assert.deepEqual(
      PLAGES.map((p) => p.k),
      ["prix", "km", "sommet", "village"],
    );
    assert.deepEqual(
      PLAGES_STATION.map((p) => p.k),
      ["km", "sommet", "village"],
    );
    assert.deepEqual(PLAGES_STATION, PLAGES.slice(1));
  });

  it("fmtPlage et plageLbl écrivent le budget en euros", () => {
    const b = PLAGE_BUDGET.fixe ?? [0, 0];
    assert.equal(fmtPlage("budget", 10000), "10 000 €");
    assert.equal(plageLbl("budget", null, b), "Indifférent");
    assert.equal(plageLbl("budget", [2000, 10000], b), "2 000 € et plus");
    assert.equal(plageLbl("budget", [0, 3000], b), "jusqu’à 3 000 €");
    assert.equal(plageLbl("budget", [1500, 3000], b), "1 500 € à 3 000 €");
  });

  it("passe, jetons et filtresActifs ignorent le budget", () => {
    const budget = f({ budget: [0, 100] });
    assert.equal(passe(prix, s, budget, B), true);
    assert.deepEqual(jetons(budget, B), []);
    assert.equal(filtresActifs(budget), false);
  });

  it("retirer le jeton de budget ne retire que lui", () => {
    const fl = f({ budget: [1500, 3000], massif: "Jura", prix: [0, 2000] });
    assert.deepEqual(retirerJeton(fl, "budget"), { ...fl, budget: null });
  });

  it("filtresActifsBudget compte budget, massif, département et plages de station", () => {
    assert.equal(filtresActifsBudget(FL0), false);
    assert.equal(filtresActifsBudget(f({ budget: [0, 3000] })), true);
    assert.equal(filtresActifsBudget(f({ massif: "Jura" })), true);
    assert.equal(filtresActifsBudget(f({ dept: "Isère" })), true);
    for (const p of PLAGES_STATION) {
      assert.equal(filtresActifsBudget(f({ [p.k]: [0, 10] })), true, p.k);
    }
    // La médiane et « avec un prix » appartiennent à l'autre onglet.
    assert.equal(filtresActifsBudget(f({ prix: [0, 2000], avecPrix: true })), false);
  });

  it("effacerBudget remet les six critères de l'onglet, garde prix et avecPrix", () => {
    const tout: Filtres = {
      massif: "Alpes du Nord",
      dept: "Isère",
      avecPrix: true,
      prix: [0, 2000],
      km: [100, 780],
      sommet: [1000, 2000],
      village: [1200, 1800],
      budget: [1500, 3000],
    };
    assert.deepEqual(effacerBudget(tout), { ...FL0, prix: [0, 2000], avecPrix: true });
    assert.equal(filtresActifsBudget(effacerBudget(tout)), false);
    assert.equal(tout.budget?.[0], 1500, "le filtre reçu n'est pas modifié");
  });
});

describe("retenir — les annonces que la médiane compte", () => {
  const lots: [string, Listing[], typeof CTX][] = [
    ["cinq annonces valides", totaux([5000, 1000, 3000, 2000, 4000]), CTX],
    [
      "une capacité tue",
      [...totaux([1000, 2000]), annonce({ id: "muette", guests: null, bedrooms: null })],
      CTX,
    ],
    ["une trop petite", [annonce({ id: "petit", guests: 4 }), annonce({ id: "ok" })], CTX],
    ["un doublon", [annonce(), annonce()], CTX],
    [
      "des écartées",
      [
        annonce({ id: "repli", proven: "Relevé Airbnb, repli relevé 3 sept." }),
        annonce({ id: "chf", currency: "CHF" }),
        annonce({ id: "vieille", scannedAt: NOW - 7 * HEURE }),
        annonce({ id: "loin", distToSlopesM: 20_000 }),
        gite(),
      ],
      CTX,
    ],
    [
      "des chambres demandées",
      [
        annonce({ id: "2ch", bedrooms: 2 }),
        annonce({ id: "4p", bedrooms: null, rooms: 4, total: 3000 }),
        annonce({ id: "tue", bedrooms: null, rooms: null }),
      ],
      { ...CTX, groupe: { trav: 8, rooms: 3 } },
    ],
  ];

  for (const [cas, lot, ctx] of lots) {
    it(`retient exactement ce qu'agreger compte : ${cas}`, () => {
      const r = retenir(lot, ctx);
      const a = agreger(lot, ctx);
      assert.equal(r.length, a.n);
      assert.equal(mediane(r.map((l) => l.total)), a.med);
    });
  }

  it("dans l'ordre du relevé, sans les muettes, les petites ni les doublons", () => {
    const ids = (i: number) => retenir(lots[i][1], lots[i][2]).map((l) => l.id);
    assert.deepEqual(ids(0), ["airbnb-1", "airbnb-2", "airbnb-3", "airbnb-4", "airbnb-5"]);
    assert.deepEqual(ids(1), ["airbnb-1", "airbnb-2"]);
    assert.deepEqual(ids(2), ["ok"]);
    assert.deepEqual(ids(3), ["airbnb-1"]);
    assert.deepEqual(ids(4), ["38G550149"]);
    assert.deepEqual(ids(5), ["4p"]);
  });

  it("rend l'annonce enrichie, telle que la médiane l'a lue", () => {
    const galerie = "https://a0.muscache.com/im/pictures/galerie-1.jpg";
    const [r] = retenir([annonce({ photo: null, photos: [galerie] })], CTX);
    assert.equal(r.photo, galerie);
  });
});

describe("compacter", () => {
  const CHAMPS = [
    "bedrooms",
    "currency",
    "distToSlopesM",
    "guests",
    "id",
    "photo",
    "pricedCheckIn",
    "pricedCheckOut",
    "rooms",
    "scannedAt",
    "source",
    "title",
    "total",
    "url",
  ];

  it("ne garde que les champs du contrat, rien de la géographie ni de la preuve", () => {
    const riche = annonce({
      rooms: 4,
      beds: 6,
      photos: ["https://a0.muscache.com/im/pictures/x.jpg"],
      priceLabel: "2 000 € au total",
      rating: 4.8,
    });
    assert.deepEqual(Object.keys(compacter(riche)).sort(), CHAMPS);
  });

  it("recopie les valeurs, et écrit null pour un champ absent", () => {
    assert.deepEqual(compacter(annonce()), {
      id: "airbnb-1",
      title: "Appartement plein sud",
      source: "Airbnb",
      total: 2000,
      currency: "EUR",
      guests: 8,
      bedrooms: 3,
      rooms: null,
      url: "https://www.airbnb.fr/rooms/12345678",
      photo: null,
      pricedCheckIn: IN,
      pricedCheckOut: OUT,
      scannedAt: NOW - 60_000,
      distToSlopesM: 800,
    });
    const nue = annonce();
    delete nue.pricedCheckIn;
    delete nue.pricedCheckOut;
    delete nue.scannedAt;
    delete nue.distToSlopesM;
    const c = compacter(nue);
    assert.equal(c.pricedCheckIn, null);
    assert.equal(c.pricedCheckOut, null);
    assert.equal(c.scannedAt, null);
    assert.equal(c.distToSlopesM, null);
  });

  it("une annonce compacte se juge encore sur sa disponibilité", () => {
    const sujet: AvailabilitySubject = compacter(annonce());
    assert.equal(sujet.pricedCheckIn, IN);
  });
});

describe("annonces d'un relevé", () => {
  const base = {
    listings: [] as Listing[],
    sources: [] as SourceReport[],
    partsEchouees: [] as Part[],
    dept: S2A.dept,
    checkIn: IN,
    checkOut: OUT,
    groupe: GRP,
    now: NOW,
  };

  it("un relevé fait donne ses annonces retenues, compactes", () => {
    const input = {
      ...base,
      listings: [...totaux([1000, 2000]), annonce({ id: "petit", guests: 4 })],
    };
    const a = annoncesDuReleve(input);
    assert.deepEqual(
      a.map((x) => x.id),
      ["airbnb-1", "airbnb-2"],
    );
    for (const x of a) assert.equal(Object.keys(x).length, 14);
    const r = resultatDuReleve(input);
    assert.equal(r.etat === "fait" ? r.n : -1, a.length);
  });

  it("un relevé en échec n'en donne aucune", () => {
    const toutes = { ...base, listings: totaux([1000]), partsEchouees: [...PARTS] };
    assert.equal(resultatDuReleve(toutes).etat, "echec");
    assert.deepEqual(annoncesDuReleve(toutes), []);
    const muettes = {
      ...base,
      sources: [
        rapport({ source: "Airbnb", ok: false, error: "HTTP 429" }),
        rapport({ source: "Abritel", ok: false }),
        rapport({ source: "Booking", ok: false }),
        rapport({ source: "GreenGo", ok: false }),
      ],
    };
    assert.equal(resultatDuReleve(muettes).etat, "echec");
    assert.deepEqual(annoncesDuReleve(muettes), []);
  });

  it("un logement vendu sur trois plateformes donne une seule carte, la moins chère", () => {
    const input = { ...base, listings: [...unBien, annonce()] };
    const a = annoncesDuReleve(input);
    assert.deepEqual(
      a.map((x) => [x.id, x.total]),
      [
        ["bk-777", 2050],
        ["airbnb-1", 2000],
      ],
    );
    const r = resultatDuReleve(input);
    assert.equal(r.etat === "fait" ? r.n : -1, 2);
  });

  it("un relevé partiel donne ce qui est revenu", () => {
    const input = {
      ...base,
      listings: totaux([1000]),
      partsEchouees: ["airbnb", "cozy", "greengo"] as Part[],
    };
    assert.deepEqual(
      annoncesDuReleve(input).map((x) => x.id),
      ["airbnb-1"],
    );
  });
});

describe("tri des cartes", () => {
  const carte = (
    id: string,
    total: number,
    guests: number | null,
    stationId = "les-2-alpes",
  ): CarteAnnonce => ({
    a: compacter(annonce({ id, total, guests })),
    stationId,
    stationNom: stationId,
  });
  /** L'id, suivi de la station quand ce n'est pas celle par défaut. */
  const ranger = (t: TriB, xs: CarteAnnonce[]) =>
    [...xs]
      .sort(comparateurBudget(t))
      .map((c) => (c.stationId === "les-2-alpes" ? c.a.id : `${c.a.id}@${c.stationId}`));

  it("chaque option se relit, une valeur inconnue revient au prix croissant", () => {
    assert.equal(TRIB0, "prix:1");
    assert.deepEqual(TRIS_B, [
      { v: "prix:1", label: "Prix croissant" },
      { v: "prix:-1", label: "Prix décroissant" },
      { v: "cap:-1", label: "Capacité" },
    ]);
    for (const t of TRIS_B) assert.equal(lireTriB(t.v), t.v);
    assert.equal(lireTriB("cap:1"), TRIB0);
    assert.equal(lireTriB("med:1"), TRIB0);
    assert.equal(lireTriB(""), TRIB0);
  });

  it("prix : dans les deux sens, l'id départage toujours dans le même ordre", () => {
    const xs = [
      carte("b", 2000, 8),
      carte("a", 2000, 8),
      carte("c", 1000, 10),
      carte("d", 3000, 6),
    ];
    assert.deepEqual(ranger("prix:1", xs), ["c", "a", "b", "d"]);
    assert.deepEqual(ranger("prix:-1", xs), ["d", "a", "b", "c"]);
  });

  it("capacité : la plus grande d'abord, une capacité tue en dernier, puis le prix, puis l'id", () => {
    const xs = [
      carte("m", 1500, null),
      carte("x", 2000, 10),
      carte("y", 1000, 10),
      carte("z", 900, 8),
      carte("n", 1200, null),
      carte("q", 1000, 10),
    ];
    assert.deepEqual(ranger("cap:-1", xs), ["q", "y", "x", "z", "n", "m"]);
  });

  it("la même annonce dans deux stations : la station départage", () => {
    const xs = [carte("a", 2000, 8, "tignes"), carte("a", 2000, 8, "les-2-alpes")];
    assert.deepEqual(ranger("prix:1", xs), ["a", "a@tignes"]);
    assert.deepEqual(ranger("prix:-1", xs), ["a", "a@tignes"]);
    assert.deepEqual(ranger("cap:-1", xs), ["a", "a@tignes"]);
  });
});

describe("filtres de l'onglet budget", () => {
  const B = bornesPlages(STATIONS);
  const st = (over: Partial<Station>) => ({ ...S2A, ...over });
  const s = st({
    massif: "Alpes du Nord",
    dept: "Isère",
    pistesKm: 200,
    maxM: 3600,
    villageM: 1650,
  });
  const f = (over: Partial<Filtres>): Filtres => ({ ...FL0, ...over });
  const BB = PLAGE_BUDGET.fixe ?? [0, 0];

  it("passeStationSeule ignore la médiane, « avec un prix » et le budget", () => {
    assert.equal(passeStationSeule(s, FL0, B), true);
    assert.equal(
      passeStationSeule(s, f({ prix: [0, 100], avecPrix: true, budget: [0, 100] }), B),
      true,
    );
  });

  it("passeStationSeule garde massif, département et plages de station", () => {
    assert.equal(passeStationSeule(s, f({ massif: "Jura" }), B), false);
    assert.equal(passeStationSeule(s, f({ dept: "Savoie" }), B), false);
    assert.equal(passeStationSeule(s, f({ massif: "Alpes du Nord", dept: "Isère" }), B), true);
    assert.equal(passeStationSeule(s, f({ km: [100, 300] }), B), true);
    assert.equal(passeStationSeule(s, f({ km: [250, 300] }), B), false);
    assert.equal(passeStationSeule(s, f({ sommet: [900, 3000] }), B), false);
    assert.equal(passeStationSeule(s, f({ village: [1700, 2400] }), B), false);
  });

  it("une valeur absente est écartée par une plage active, même bornée au maximum", () => {
    const sansKm = st({ pistesKm: null });
    assert.equal(passeStationSeule(sansKm, f({ km: [0, B.km[1]] }), B), false);
    assert.equal(passeStationSeule(sansKm, FL0, B), true);
  });

  it("passeStationSeule : la borne haute au maximum veut dire « et plus »", () => {
    const hors = st({ pistesKm: 900 });
    assert.equal(passeStationSeule(hors, f({ km: [100, B.km[1]] }), B), true);
    assert.equal(passeStationSeule(hors, f({ km: [100, B.km[1] - 10] }), B), false);
  });

  it("passeBudget : bornes comprises, la borne haute au maximum veut dire « et plus »", () => {
    assert.equal(passeBudget(50_000, null, BB), true);
    assert.equal(passeBudget(1999, [2000, 4000], BB), false);
    assert.equal(passeBudget(2000, [2000, 4000], BB), true);
    assert.equal(passeBudget(4000, [2000, 4000], BB), true);
    assert.equal(passeBudget(4001, [2000, 4000], BB), false);
    assert.equal(passeBudget(25_000, [2000, 10000], BB), true);
    assert.equal(passeBudget(9999, [0, 9900], BB), false);
  });

  it("les jetons de budget : le budget, massif, département, puis les plages de station", () => {
    const tout: Filtres = {
      massif: "Alpes du Nord",
      dept: "Isère",
      avecPrix: true,
      prix: [0, 2000],
      km: [100, 780],
      sommet: [1000, 2000],
      village: [1200, 1800],
      budget: [1500, 3000],
    };
    assert.deepEqual(jetonsBudget(tout, B), [
      { k: "budget", lbl: "Budget : 1 500 € à 3 000 €" },
      { k: "massif", lbl: "Alpes du Nord" },
      { k: "dept", lbl: "Isère" },
      { k: "km", lbl: "Km de pistes : 100 km et plus" },
      { k: "sommet", lbl: "Sommet : 1 000 m à 2 000 m" },
      { k: "village", lbl: "Altitude du village : 1 200 m à 1 800 m" },
    ]);
    assert.deepEqual(jetonsBudget(f({ budget: [0, 3000] }), B), [
      { k: "budget", lbl: "Budget : jusqu’à 3 000 €" },
    ]);
    assert.deepEqual(jetonsBudget(f({ budget: [2000, 10000] }), B), [
      { k: "budget", lbl: "Budget : 2 000 € et plus" },
    ]);
    assert.deepEqual(jetonsBudget(FL0, B), []);
    assert.deepEqual(jetonsBudget(f({ prix: [0, 2000], avecPrix: true }), B), []);
  });
});

describe("libellés de l'onglet budget", () => {
  const retenue = (over: Partial<Listing> = {}): AnnonceRetenue => compacter(annonce(over));

  it("le compte s'accorde, et tait les stations quand il n'y en a pas", () => {
    assert.equal(countBudget(12, 3), "12 logements dans 3 stations");
    assert.equal(countBudget(1, 1), "1 logement dans 1 station");
    assert.equal(countBudget(2, 1), "2 logements dans 1 station");
    assert.equal(countBudget(0, 0), "0 logement");
  });

  it("couverture : aucune station relevée", () => {
    assert.equal(
      couverture(PER, [], 320, 8),
      "Aucune station n’a d’annonces relevées du 6 févr. au 13 févr., 7 nuits.",
    );
  });

  it("couverture : les stations relevées, nommées", () => {
    assert.equal(
      couverture(PER, ["Les 2 Alpes", "Chamrousse"], 320, 8),
      "Annonces relevées du 6 févr. au 13 févr. dans 2 stations sur 320 : Les 2 Alpes, " +
        "Chamrousse. Seuls les logements qui accueillent 8 voyageurs et publient leur " +
        "capacité sont proposés.",
    );
    assert.equal(
      couverture({ from: IN, nights: 1 }, ["Les 2 Alpes"], 320, 1),
      "Annonces relevées du 6 févr. au 7 févr. dans 1 station sur 320 : Les 2 Alpes. " +
        "Seuls les logements qui accueillent 1 voyageur et publient leur capacité sont proposés.",
    );
  });

  it("videBudget : pas de relevé, puis le budget, puis les critères de station", () => {
    assert.deepEqual(videBudget(true, 0), {
      titre: "Aucune annonce relevée pour ces dates",
      hint:
        "Les logements proposés viennent des relevés. Lancez un relevé dans l’onglet " +
        "Par station, ou revenez à des dates déjà relevées.",
      versStation: true,
    });
    assert.deepEqual(videBudget(false, 3), {
      titre: "Aucun logement dans ce budget",
      hint: "3 logements correspondent aux autres critères. Élargissez le budget pour les voir.",
      versStation: false,
    });
    assert.equal(
      videBudget(false, 1).hint,
      "1 logement correspond aux autres critères. Élargissez le budget pour les voir.",
    );
    assert.deepEqual(videBudget(false, 0), {
      titre: "Aucun logement ne correspond à ces critères",
      hint: "Retirez un critère de station, ou effacez-les tous.",
      versStation: false,
    });
    // Sans relevé, le budget n'y est pour rien.
    assert.equal(videBudget(true, 5).versStation, true);
  });

  it("sous-titre et prix par personne", () => {
    assert.equal(
      sousTitreBudget(7, 8),
      "Logements pour 7 nuits qui accueillent 8 voyageurs, dans votre budget.",
    );
    assert.equal(
      sousTitreBudget(1, 1),
      "Logements pour 1 nuit qui accueillent 1 voyageur, dans votre budget.",
    );
    assert.equal(ppLbl(2382, 8), "soit 298 € par personne");
    assert.equal(ppLbl(2400, 8), "soit 300 € par personne");
  });

  it("metaAnnonce : source, capacité, chambres", () => {
    assert.equal(metaAnnonce(retenue()), "Airbnb · 8 pers. · 3 ch.");
    assert.equal(metaAnnonce(retenue({ bedrooms: 0 })), "Airbnb · 8 pers. · studio");
    assert.equal(
      metaAnnonce(retenue({ source: "Centrale", bedrooms: null, rooms: 3 })),
      "Centrale · 8 pers. · 3 pièces",
    );
  });

  it("metaAnnonce écrit capacité et chambres comme capLbl et bedLbl", () => {
    const variantes: Partial<Listing>[] = [
      {},
      { guests: null, bedrooms: null, rooms: null },
      { bedrooms: 0 },
      { bedrooms: null, rooms: 1 },
      { bedrooms: null, rooms: 4 },
      { bedrooms: null, rooms: 0 },
      { source: "Gîtes de France", guests: 12, bedrooms: 5 },
    ];
    for (const v of variantes) {
      const l = annonce(v);
      assert.equal(metaAnnonce(compacter(l)), [l.source, capLbl(l), bedLbl(l)].join(" · "));
    }
  });

  it("dispo : seul un prix frais, pour ces dates exactes, est confirmé", () => {
    const a = retenue();
    assert.deepEqual(dispo(a, PER, NOW), { confirme: true, lbl: "Prix relevé pour ces dates" });
    assert.deepEqual(dispo(a, PER, NOW + 7 * HEURE), {
      confirme: false,
      lbl: "Prix relevé il y a plus de six heures",
    });
    assert.equal(dispo(a, decaler(PER, 1), NOW).confirme, false);
    assert.equal(dispo(retenue({ scannedAt: null }), PER, NOW).confirme, false);
    for (const [per, now] of [
      [PER, NOW],
      [PER, NOW + 7 * HEURE],
      [avecNuits(PER, 6), NOW],
    ] as const) {
      assert.equal(dispoLbl(a, per, now), dispo(a, per, now).lbl);
    }
  });

  it("dispoLbl relit la disponibilité à l'affichage", () => {
    const a = retenue();
    assert.equal(dispoLbl(a, PER, NOW), "Prix relevé pour ces dates");
    assert.equal(dispoLbl(a, PER, NOW + 7 * HEURE), "Prix relevé il y a plus de six heures");
    assert.equal(dispoLbl(a, decaler(PER, 1), NOW), "Prix relevé pour d’autres dates");
    assert.equal(dispoLbl(a, avecNuits(PER, 6), NOW), "Prix relevé pour d’autres dates");
    assert.equal(
      dispoLbl(retenue({ scannedAt: null }), PER, NOW),
      "Prix de relevé, date de mesure inconnue",
    );
  });

  it("les cartes se paginent par 60", () => {
    assert.equal(PAGE_CARTES, 60);
  });

  it("aucun libellé neuf n'écrit d'apostrophe droite, de tiret cadratin ni d'exclamation", () => {
    const vides = [videBudget(true, 0), videBudget(false, 2), videBudget(false, 0)];
    const textes = [
      ...TRIS_B.map((t) => t.label),
      PLAGE_BUDGET.lbl,
      countBudget(12, 3),
      couverture(PER, [], 320, 8),
      couverture(PER, ["Les 2 Alpes"], 320, 8),
      ...vides.flatMap((v) => [v.titre, v.hint]),
      sousTitreBudget(7, 8),
      ppLbl(2400, 8),
      metaAnnonce(retenue()),
      ...jetonsBudget({ ...FL0, budget: [0, 3000] }, bornesPlages(STATIONS)).map((j) => j.lbl),
    ];
    for (const t of textes) {
      assert.ok(!t.includes("'"), t);
      assert.ok(!t.includes("—"), t);
      assert.ok(!t.includes("!"), t);
    }
  });
});

describe("relevés à lancer", () => {
  const job = (over: Partial<Job> = {}): Job => ({
    nom: "stations affichées",
    ids: ["a", "b", "c"],
    per: PER,
    groupe: GRP,
    ...over,
  });

  it("memePeriode compare arrivée et nuits, pas l'objet", () => {
    assert.equal(memePeriode(PER, { from: IN, nights: 7 }), true);
    assert.equal(memePeriode(PER, { from: IN, nights: 6 }), false);
    assert.equal(memePeriode(PER, decaler(PER, 1)), false);
  });

  it("rien de prévu : toutes les stations, dans l'ordre reçu", () => {
    assert.deepEqual(idsALancer(["c", "a", "b"], PER, GRP, null, []), ["c", "a", "b"]);
  });

  it("la course écarte toutes ses stations, celles qu'elle a déjà faites comprises", () => {
    // Sans cela, le bouton revenait en pleine course pour relever à nouveau
    // les stations qu'elle venait de finir.
    assert.deepEqual(idsALancer(["a", "b", "c", "d"], PER, GRP, { ...job(), i: 1 }, []), ["d"]);
    assert.deepEqual(idsALancer(["d", "c", "a"], PER, GRP, { ...job(), i: 0 }, []), ["d"]);
    assert.deepEqual(idsALancer(["a", "b", "c"], PER, GRP, { ...job(), i: 3 }, []), []);
  });

  it("la file écarte toutes ses stations", () => {
    const file = [job({ ids: ["b"] }), job({ ids: ["d", "e"] })];
    assert.deepEqual(idsALancer(["a", "b", "c", "d", "e", "f"], PER, GRP, null, file), [
      "a",
      "c",
      "f",
    ]);
  });

  it("une autre période ou un autre groupe ne retiennent rien", () => {
    const ids = ["a", "b", "c"];
    const autrePer = { ...job({ per: decaler(PER, 1) }), i: 0 };
    const autreGrp = { ...job({ groupe: { trav: 10, rooms: 0 } }), i: 0 };
    assert.deepEqual(idsALancer(ids, PER, GRP, autrePer, []), ids);
    assert.deepEqual(idsALancer(ids, PER, GRP, autreGrp, []), ids);
    const file = [job({ per: avecNuits(PER, 6) }), job({ groupe: { trav: 8, rooms: 2 } })];
    assert.deepEqual(idsALancer(ids, PER, GRP, null, file), ids);
  });

  it("une liste qui grandit pendant la course ne relance que les stations neuves", () => {
    // « Avec un prix seulement » : la liste filtrée s'allonge à mesure que les prix arrivent.
    const course = { ...job({ ids: ["a", "b", "c", "d"] }), i: 2 };
    const file = [job({ ids: ["e"] })];
    const liste = ["a", "b", "x", "c", "d", "e", "y"];
    assert.deepEqual(idsALancer(liste, PER, GRP, course, file), ["x", "y"]);
  });
});
