import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { champsDuVerdict, domainFit } from "../domainFit.ts";
import { GRANDS_DOMAINES } from "../grandsDomaines.ts";
import type { Listing } from "../listings.ts";
import { rattacher } from "../rattachement.ts";
import { cleBien, dedoublonnerParBien } from "../stay/poserReleve.ts";
import { regrouper } from "../stay/regroupement.ts";
import { STATIONS, stationById } from "../stations.ts";
import { villageById } from "../villages.ts";
import {
  agreger,
  annonceMontree,
  bornesPlages,
  FL0,
  horsDeLaStation,
  passeAnnonce,
  type AnnonceRetenue,
  type Resultat,
} from "./calcul.ts";
import { recompter, resultatsALaLecture } from "./recompte.ts";

/**
 * Un logement n'appartient qu'à une station, celle où il se trouve
 * (`rattachement.ts`). Logements montre aussi les stations du grand domaine
 * relié, chacune sous son nom ; Prix compare des stations, et ne compte un
 * logement que sous la sienne. Les cas sont ceux que le propriétaire a listés.
 */

const IN = "2027-02-06";
const OUT = "2027-02-13";
const NOW = Date.parse("2027-01-10T12:00:00Z");

const station = (id: string) => {
  const s = stationById(id);
  if (!s) throw new Error(`station absente : ${id}`);
  return s;
};

/** Une annonce tarifée pour ce séjour, à (lat, lon), jugée comme la recherche
 *  la juge pour la station de son relevé (`domainFit`). */
function releveePour(
  stationId: string,
  lat: number | null,
  lon: number | null,
  over: Partial<Listing> = {},
): Listing {
  const base: Listing = {
    id: "airbnb-1",
    stationId,
    title: "Appartement 6 personnes",
    source: "Airbnb",
    total: 1800,
    currency: "EUR",
    capacity: 6,
    bedrooms: 2,
    available: true,
    photo: null,
    url: "https://www.airbnb.fr/rooms/12345678",
    lat,
    lon,
    distToSlopesM: 150,
    distToLiftM: 120,
    proven: "test",
    pricedCheckIn: IN,
    pricedCheckOut: OUT,
    scannedAt: NOW - 60_000,
    ...over,
  };
  return { ...base, ...champsDuVerdict(domainFit(base, station(stationId))) };
}

const ctx = (stationId: string) => ({
  dept: station(stationId).dept,
  checkIn: IN,
  checkOut: OUT,
  groupe: { trav: 6, rooms: 0 },
  now: NOW,
});

/** Les stations dont la médiane Prix compterait ce logement. */
function compteSous(lat: number, lon: number, stations: readonly string[]): string[] {
  return stations.filter((id) => agreger([releveePour(id, lat, lon)], ctx(id)).n === 1);
}

describe("Prix : un logement à Aussois ne compte que sous Aussois", () => {
  const A = station("aussois");
  it("sous Aussois, oui ; sous Val Cenis, non : Haute Maurienne Vanoise ne relie pas", () => {
    assert.deepEqual(compteSous(A.lat + 0.001, A.lon + 0.001, ["aussois", "val-cenis"]), [
      "aussois",
    ]);
  });
});

describe("Prix : un logement à Lanslebourg ne compte que sous Val Cenis", () => {
  const L = villageById("lanslebourg")!;
  it("Lanslebourg est un village de Val Cenis", () => {
    assert.equal(rattacher({ lat: L.lat, lon: L.lon }).stationId, "val-cenis");
  });
  it("sous Val Cenis, oui ; sous Aussois, non", () => {
    assert.deepEqual(compteSous(L.lat + 0.001, L.lon, ["val-cenis", "aussois"]), ["val-cenis"]);
  });
});

describe("Prix : sur un grand domaine relié, aucun logement sous deux stations", () => {
  for (const id of ["paradiski", "3-vallees"]) {
    const d = GRANDS_DOMAINES.find((g) => g.id === id)!;
    it(`${d.nom} : chaque point compte sous une station au plus, la sienne`, () => {
      // Une grille de 1,5 km sur l'emprise des stations du domaine.
      const pts = d.stations.map(station);
      const [la0, la1] = [Math.min(...pts.map((s) => s.lat)), Math.max(...pts.map((s) => s.lat))];
      const [lo0, lo1] = [Math.min(...pts.map((s) => s.lon)), Math.max(...pts.map((s) => s.lon))];
      let reliees = 0;
      for (let lat = la0 - 0.02; lat <= la1 + 0.02; lat += 0.0135) {
        for (let lon = lo0 - 0.02; lon <= lo1 + 0.02; lon += 0.019) {
          const sous = compteSous(lat, lon, d.stations);
          assert.ok(
            sous.length <= 1,
            `(${lat.toFixed(3)}, ${lon.toFixed(3)}) sous ${sous.join(", ")}`,
          );
          const sienne = rattacher({ lat, lon }).stationId;
          if (sous.length === 1) assert.equal(sous[0], sienne);
          // Ce que l'ancienne règle comptait aussi : le verdict « relié ».
          reliees += d.stations.filter(
            (s) => releveePour(s, lat, lon).domainFit === "linked",
          ).length;
        }
      }
      assert.ok(reliees > 0, "la grille passe par des logements reliés");
    });
  }

  it("un logement relié sort aussi de « Par budget » et du recompte", () => {
    const A = station("les-arcs-bourg-st-maurice");
    const sousPlagne = releveePour("la-plagne", A.lat, A.lon) as AnnonceRetenue;
    assert.equal(sousPlagne.domainFit, "linked");
    assert.equal(horsDeLaStation(sousPlagne), true);
    assert.equal(annonceMontree(sousPlagne), false);
    assert.equal(annonceMontree(releveePour(A.id, A.lat, A.lon) as AnnonceRetenue), true);
    // L'onglet « Par budget » : la carte de La Plagne ne montre pas ce
    // logement des Arcs ; celle des Arcs, si.
    const B = bornesPlages(STATIONS);
    assert.equal(passeAnnonce(sousPlagne, FL0, B), false);
    assert.equal(passeAnnonce(releveePour(A.id, A.lat, A.lon) as AnnonceRetenue, FL0, B), true);
  });
});

describe("un même bien collecté deux fois ne fait qu'un logement", () => {
  const M = station("meribel");
  const situee = (over: Partial<Listing>) => releveePour(M.id, M.lat + 0.001, M.lon + 0.001, over);

  it("même plateforme, même identifiant : une clé, une annonce, compté une fois", () => {
    const cozy = situee({
      id: "cozy-abc",
      url: "https://www.airbnb.fr/rooms/55555555",
      total: 2000,
    });
    const direct = situee({
      id: "55555555",
      url: "https://www.airbnb.fr/rooms/55555555",
      total: 2400,
    });
    assert.equal(cleBien(cozy), cleBien(direct));
    assert.equal(dedoublonnerParBien([cozy, direct]).length, 1);
    assert.deepEqual(agreger([cozy, direct], ctx(M.id)), {
      n: 1,
      muettes: 0,
      petits: 0,
      med: 2000,
    });
    assert.deepEqual(agreger([direct, cozy], ctx(M.id)), {
      n: 1,
      muettes: 0,
      petits: 0,
      med: 2000,
    });
  });

  it("la copie la moins chère compte, avec la capacité que publie l'autre copie", () => {
    // Une copie Cozy d'un Airbnb, moins chère, ne publie pas sa capacité ;
    // la copie directe la publie. Le logement compte, à son prix le plus bas.
    const cozy = situee({
      id: "abnb-9",
      url: "https://www.airbnb.fr/rooms/55555555",
      total: 1700,
      capacity: null,
    });
    const direct = situee({
      id: "55555555",
      url: "https://www.airbnb.fr/rooms/55555555",
      total: 1900,
    });
    assert.deepEqual(agreger([cozy, direct], ctx(M.id)), {
      n: 1,
      muettes: 0,
      petits: 0,
      med: 1700,
    });
    const [l] = dedoublonnerParBien([cozy, direct]);
    assert.deepEqual([l.id, l.total, l.capacity], ["abnb-9", 1700, 6]);
  });

  it("la copie tarifée l'emporte, et garde la position d'une copie située", () => {
    const sansPrix = situee({ id: "a", total: 0 });
    const sansPosition = { ...situee({ id: "b" }), lat: null, lon: null };
    const [l] = dedoublonnerParBien([sansPrix, sansPosition]);
    assert.equal(l.total, 1800);
    assert.equal(l.lat, sansPrix.lat);
  });

  it("seul et forfaits compris : un logement, deux offres, compté au moins cher", () => {
    const mc = {
      source: "Mountain Collection" as const,
      platformId: "2338",
      url: "https://www.mountain-collection.com/fr/location/2338",
    };
    const seul = situee({ id: "mc-2338", ...mc, total: 1500, skiPassIncluded: false });
    const forfait = situee({ id: "mc-2338-forfait", ...mc, total: 2100, skiPassIncluded: true });
    assert.equal(dedoublonnerParBien([seul, forfait]).length, 2, "deux offres");
    const [g, ...autres] = regrouper([forfait, seul]);
    assert.equal(autres.length, 0, "un logement");
    assert.deepEqual(
      g.offres.map((o) => o.id),
      ["mc-2338", "mc-2338-forfait"],
    );
    assert.deepEqual(agreger([forfait, seul], ctx(M.id)), {
      n: 1,
      muettes: 0,
      petits: 0,
      med: 1500,
    });
  });

  it("deux centrales qui numérotent pareil ne se confondent pas", () => {
    const c1 = situee({ id: "dw-a-42", source: "Centrale", platformId: "42", url: null });
    const c2 = situee({ id: "dw-b-42", source: "Centrale", platformId: "42", url: null });
    assert.equal(dedoublonnerParBien([c1, c2]).length, 2);
  });
});

describe("un logement sans coordonnées suit la règle de repli", () => {
  it("la localité publiée, puis le texte ; sans rien, aucune station", () => {
    assert.equal(rattacher({ locality: "Aussois" }).stationId, "aussois");
    assert.equal(rattacher({ title: "Chalet à Lanslebourg" }).stationId, "val-cenis");
    assert.deepEqual(
      [rattacher({ title: "Appartement 6 personnes" })].map((r) => [r.stationId, r.motif]),
      [[null, "sans-lieu"]],
    );
  });

  it("sans position, il ne compte pas dans la médiane, mais n'est pas dit ailleurs", () => {
    const l = releveePour("aussois", null, null, { title: "Appartement 6 personnes" });
    assert.equal(agreger([l], ctx("aussois")).n, 0, "la médiane exige une position");
    assert.equal(horsDeLaStation(l), false);
  });
});

describe("Prix, à la lecture : chaque relevé recompté sur ses seules annonces", () => {
  const P = "2027-02-06|7|6|0";
  const cle = (s: string) => `${P}|${s}`;
  const fait = (n: number, med: number | null): Resultat => ({
    etat: "fait",
    n,
    med,
    muettes: 0,
    petits: 0,
    ts: 1,
    partiel: [],
  });
  const A = station("aussois");
  const L = villageById("lanslebourg")!;

  it("un logement d'Aussois enregistré sous Val Cenis sort de sa médiane", () => {
    const vc = [
      releveePour("val-cenis", A.lat, A.lon, { id: "a1", total: 800 }),
      releveePour("val-cenis", L.lat, L.lon, {
        id: "v1",
        total: 900,
        url: "https://www.airbnb.fr/rooms/22222222",
      }),
    ] as AnnonceRetenue[];
    assert.deepEqual(recompter(vc), { n: 1, med: 900 });
    const res = { [cle("val-cenis")]: fait(2, 850), [cle("aussois")]: fait(14, 1500) };
    const lu = resultatsALaLecture(new Map([[cle("val-cenis"), vc]]), res);
    const r = lu[cle("val-cenis")];
    assert.ok(r?.etat === "fait");
    assert.deepEqual([r.n, r.med], [1, 900]);
    assert.equal(lu[cle("aussois")], res[cle("aussois")], "non lu, il n'est pas recompté");
  });

  it("deux copies d'un bien, ou ses deux formules, comptent une fois, même sans marque de logement", () => {
    const M = station("meribel");
    const ici = (over: Partial<Listing>) =>
      releveePour(M.id, M.lat + 0.001, M.lon + 0.001, {
        ...over,
        logement: undefined,
      } as Partial<Listing>) as AnnonceRetenue;
    assert.deepEqual(
      recompter([
        ici({ id: "cozy-abc", url: "https://www.airbnb.fr/rooms/55555555", total: 1200 }),
        ici({ id: "55555555", url: "https://www.airbnb.fr/rooms/55555555", total: 1300 }),
      ]),
      { n: 1, med: 1200 },
    );
    const mc = { source: "Mountain Collection" as const, platformId: "2338", url: null };
    assert.deepEqual(
      recompter([
        ici({ id: "mc-2338", ...mc, total: 1500, skiPassIncluded: false }),
        ici({ id: "mc-2338-forfait", ...mc, total: 2100, skiPassIncluded: true }),
      ]),
      { n: 1, med: 1500 },
    );
  });

  it("rien ne change quand tout est déjà de la station : le même objet", () => {
    const M = station("meribel");
    const res = { [cle("meribel")]: fait(1, 1800) };
    const lu = resultatsALaLecture(
      new Map([
        [cle("meribel"), [releveePour(M.id, M.lat + 0.001, M.lon + 0.001) as AnnonceRetenue]],
      ]),
      res,
    );
    assert.equal(lu, res);
  });
});
