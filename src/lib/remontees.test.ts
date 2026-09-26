import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attachAccess } from "./access.ts";
import type { Listing } from "./listings.ts";
import { OSM_LIFTS } from "./osmAccess.data.ts";
import { nearestLift, type OsmHit } from "./osmAccess.ts";
import { dansLaStation, DISTANCE_STATION_M, remesurerRemontee } from "./prix/calcul.ts";
import { asHit, mateOf, metresBetween, nearestAnyLift } from "./remontees.ts";
import { remonteeHorsService } from "./remonteeEnService.ts";
import { STATIONS, stationById, type Station } from "./stations.ts";

/** Le parcours complet que la grille doit égaler : la plus proche, la
 *  première du fichier à égalité, avec l'autre gare de son appareil. */
const GARES_REELLES = OSM_LIFTS.filter((p) => !remonteeHorsService(p.n));

function exhaustive(lat: number, lon: number): OsmHit {
  let k = -1;
  let best = Number.POSITIVE_INFINITY;
  GARES_REELLES.forEach((p, i) => {
    const m = metresBetween(lat, lon, p.lat, p.lon);
    if (m < best) {
      best = m;
      k = i;
    }
  });
  const p = GARES_REELLES[k]!;
  return asHit(p, Math.round(best), mateOf(GARES_REELLES, p));
}

/** Tirage reproductible : le même échantillon à chaque passage. */
function tirage(graine: number): () => number {
  let s = graine;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function station(id: string): Station {
  const s = stationById(id);
  if (!s) throw new Error(`station absente du référentiel : ${id}`);
  return s;
}

/** Une annonce posée au repère de la station, qui passe par `attachAccess`. */
function auRepere(s: Station): Listing {
  return attachAccess(
    {
      id: `repere-${s.id}`,
      stationId: s.id,
      title: "Chalet",
      source: "Airbnb",
      total: 1800,
      currency: "EUR",
      guests: 8,
      bedrooms: 3,
      available: true,
      photo: null,
      url: "https://www.airbnb.fr/rooms/1",
      lat: s.lat,
      lon: s.lon,
      proven: "test",
    },
    s,
  );
}

describe("nearestAnyLift : la gare la plus proche, toutes stations confondues", () => {
  it("égale le parcours complet, autour des repères jusqu'à 6 km", () => {
    const hasard = tirage(7);
    for (let n = 0; n < 1500; n++) {
      const s = STATIONS[Math.floor(hasard() * STATIONS.length)]!;
      const dy = (hasard() * 2 - 1) * 6000;
      const dx = (hasard() * 2 - 1) * 6000;
      const lat = s.lat + dy / 111_320;
      const lon = s.lon + dx / (111_320 * Math.cos((s.lat * Math.PI) / 180));
      assert.deepEqual(nearestAnyLift(lat, lon), exhaustive(lat, lon), `${s.id} ${lat} ${lon}`);
    }
  });

  it("égale le parcours complet sur chaque gare, et loin de toute gare", () => {
    const hasard = tirage(11);
    for (let n = 0; n < 300; n++) {
      const p = OSM_LIFTS[Math.floor(hasard() * OSM_LIFTS.length)]!;
      assert.deepEqual(nearestAnyLift(p.lat, p.lon), exhaustive(p.lat, p.lon));
    }
    // Paris, Marseille, La Réunion, la Guadeloupe, l'équateur, les pôles.
    const loin: [number, number][] = [
      [48.8566, 2.3522],
      [43.3, 5.4],
      [-21.1, 55.5],
      [16.2, -61.5],
      [0, 0],
      [89, 170],
      [-89.9, -179.9],
    ];
    for (const [lat, lon] of loin) assert.deepEqual(nearestAnyLift(lat, lon), exhaustive(lat, lon));
  });

  it("une position invalide ne mesure rien", () => {
    assert.equal(nearestAnyLift(Number.NaN, 6), null);
    assert.equal(nearestAnyLift(45, Number.POSITIVE_INFINITY), null);
    assert.equal(nearestAnyLift(95, 6), null);
    assert.equal(nearestAnyLift(45, 200), null);
  });
});

describe("attachAccess : la remontée d'un logement du domaine", () => {
  // Leur liste de gares oubliait celles du village : au repère, 2 191 à
  // 7 813 m, et la règle des 2 km écartait le village entier. Le Mont-Dore
  // n'y est plus : sa gare du village était le funiculaire du Capucin, retiré
  // le 26 septembre 2026 (voir « le Capucin retiré », plus bas).
  const sept: [string, number][] = [
    ["saint-martin-de-belleville", 27],
    ["saint-francois-longchamp", 23],
    ["les-carroz", 359],
    ["monts-jura", 154],
    ["le-grand-valtin", 665],
    ["villard-de-lans", 126],
  ];

  for (const [id, m] of sept) {
    it(`${id} : un logement au repère est un logement de station`, () => {
      const s = station(id);
      const l = auRepere(s);
      assert.equal(l.domainFit, "in");
      assert.equal(l.distToLiftM, m);
      assert.equal(dansLaStation(l), true);
      // La remontée « cherchée » reste celle de la liste de la station.
      assert.equal(l.searchedLiftM, nearestLift(s.id, s.lat, s.lon)?.m);
    });
  }

  it("garde sur les 315 stations : une gare à 2 km du repère le fait retenir", () => {
    assert.equal(STATIONS.length, 315);
    const ecartees: string[] = [];
    for (const s of STATIONS) {
      const l = auRepere(s);
      const gare = nearestAnyLift(s.lat, s.lon);
      const locale = nearestLift(s.id, s.lat, s.lon);
      if (l.domainFit === "in" && gare && gare.m <= DISTANCE_STATION_M && !dansLaStation(l)) {
        ecartees.push(`${s.id} (${l.distToLiftM} m)`);
      }
      // Jamais plus loin que la liste de la station.
      if (l.domainFit === "in" && locale) {
        assert.ok(
          (l.distToLiftM ?? Infinity) <= locale.m,
          `${s.id} : ${l.distToLiftM} > ${locale.m}`,
        );
      }
    }
    assert.deepEqual(ecartees, []);
  });

  it("Bonneval cherché depuis Val d'Isère : rien n'est gardé, la remontée cherchée reste lointaine", () => {
    const val = station("val-disere");
    const lat = 45.371686;
    const lon = 7.046794;
    const l = attachAccess(
      {
        id: "p5797537a",
        stationId: "val-disere",
        title: "Maison de vacances « La Pastourelle 1 », au pied des pistes",
        source: "Abritel",
        total: 1,
        currency: "EUR",
        guests: 8,
        bedrooms: 4,
        available: true,
        photo: null,
        url: "https://www.abritel.fr/location-vacances/p5797537a",
        lat,
        lon,
        locality: "Bonneval-sur-Arc",
        proven: "fixture Iseran",
      },
      val,
    );
    assert.equal(l.domainFit, "other");
    assert.equal(l.distToLiftM, null);
    assert.equal(l.liftName, null);
    assert.equal(l.searchedLiftM, nearestLift("val-disere", lat, lon)?.m);
    assert.ok((l.searchedLiftM ?? 0) > 4000);
    // Le tapis de Bonneval est tout près : l'index de toutes les gares le
    // verrait, et c'est bien pour cela qu'il ne sert qu'une fois le domaine admis.
    assert.ok((nearestAnyLift(lat, lon)?.m ?? Infinity) < 1000);
  });
});

describe("les gares de ville et les remontées en projet ne font pas un logement de station", () => {
  /** Une annonce posée en un point, relevée pour une station donnée. */
  function en(lat: number, lon: number, s: Station): Listing {
    return attachAccess({ ...auRepere(s), id: `pt-${lat}-${lon}`, lat, lon }, s);
  }
  const cas: [string, number, number, string][] = [
    ["Grenoble, place Grenette (téléphérique de la Bastille)", 45.1885, 5.7245, "le-sappey-en-chartreuse"],
    ["Évian-les-Bains (funiculaire)", 46.4008, 6.5897, "bernex"],
    ["Moûtiers, centre", 45.4843, 6.5316, "courchevel"],
  ];
  for (const [nom, lat, lon, id] of cas) {
    it(`${nom}, relevé de ${id} : écarté`, () => {
      const l = en(lat, lon, station(id));
      assert.equal(dansLaStation(l), false, `${nom} : ${l.distToLiftM} m de ${l.liftName}`);
    });
  }
  it("au repère de Courchevel, aucune remontée « (Project) » n'est retenue", () => {
    const l = auRepere(station("courchevel"));
    assert.equal(remonteeHorsService(l.liftName), false, String(l.liftName));
    assert.ok(!/project/i.test(l.liftName ?? ""), String(l.liftName));
  });

  it("La Bourboule : l'ancienne télécabine de Charlannes ne met pas le bourg au pied des pistes", () => {
    // « Charmante Maison Familiale à La Bourboule », relevée pour Besse le
    // 25 septembre 2026 : 307 m de l'ancienne télécabine, 11,8 km des pistes.
    for (const id of ["besse-super-besse", "la-bourboule", "le-mont-dore"]) {
      const l = en(45.5852, 2.7439, station(id));
      assert.notEqual(l.liftName, "Ancien télécabine de Charlannes", id);
      assert.equal(dansLaStation(l), false, `${id} : ${l.distToLiftM} m de ${l.liftName}`);
    }
    const g = nearestAnyLift(45.5852, 2.7439);
    assert.ok(g && g.m > 2000, `${g?.m} m de ${g?.name}`);
  });
});

describe("les appareils sans ski retirés le 26 septembre 2026 ne font plus entrer de logement", () => {
  /** Une annonce relevée le 25 septembre 2026 : sa position, et la remontée
   *  enregistrée alors, que `remesurerRemontee` doit refaire à la relecture. */
  type Releve = {
    titre: string;
    station: string;
    lat: number;
    lon: number;
    m: number;
    lift: string | null;
    gare: [number, number];
  };
  function enregistree(r: Releve): Listing {
    return {
      ...auRepere(station(r.station)),
      id: `releve-${r.titre}`,
      title: r.titre,
      lat: r.lat,
      lon: r.lon,
      domainFit: "in",
      nearestDomainId: r.station,
      distToLiftM: r.m,
      liftName: r.lift,
      liftLat: r.gare[0],
      liftLon: r.gare[1],
    };
  }
  const releves: Releve[] = [
    // Télésiège du Glacier des Bossons, désigné : affiché « Au pied des pistes ».
    {
      titre: "Papillon Chamonix Chalet",
      station: "chamonix",
      lat: 45.90195083618164,
      lon: 6.8394598960876465,
      m: 171,
      lift: "Glacier des Bossons",
      gare: [45.900448, 6.839925],
    },
    // Téléphérique privé de l'observatoire de Bure.
    {
      titre: "Chalet 8 Personnes - Dévoluy",
      station: "la-joue-du-loup",
      lat: 44.67155075073242,
      lon: 5.955239772796631,
      m: 1756,
      lift: "Téléphérique de Bure",
      gare: [44.661186, 5.938481],
    },
    // Plaouquès (privé, sans domaine, vallée d'Aure).
    {
      titre: "Grange En Vallée D'aure",
      station: "espiaube",
      lat: 42.788421630859375,
      lon: 0.23151999711990356,
      m: 1722,
      lift: "Plaouquès",
      gare: [42.794628, 0.250854],
    },
    // Applevage, téléphérique sans domaine, au-dessus de Gabas.
    {
      titre: "Gd Appart 5-8 Pers Ski En Hiver Rando En éTé Gr10",
      station: "artouste",
      lat: 42.889060974121094,
      lon: -0.4270099997520447,
      m: 1311,
      lift: "Applevage",
      gare: [42.885799, -0.411551],
    },
    // Le téléski nautique sans nom du plan d'eau de Chaillol.
    {
      titre: "Le Moulin Des Ecrins",
      station: "chaillol",
      lat: 44.64540100097656,
      lon: 6.111199855804443,
      m: 1246,
      lift: null,
      gare: [44.655728, 6.105089],
    },
    // « Liaison Blanc-Blanc », funiculaire privé de Grenoble : un T4 de
    // Seyssinet-Pariset relevé pour Lans-en-Vercors.
    {
      titre: "Spacieux T4 Vue Sur Les Alpes",
      station: "lans-en-vercors",
      lat: 45.18149948120117,
      lon: 5.6972198486328125,
      m: 1578,
      lift: "Liaison Blanc-Blanc",
      gare: [45.194345, 5.70578],
    },
  ];
  for (const r of releves) {
    const de = r.lift ?? "la gare sans nom";
    it(`${r.titre} (${r.station}), à ${r.m} m de ${de} : hors de la station`, () => {
      const s = station(r.station);
      const relu = remesurerRemontee(enregistree(r));
      assert.notDeepEqual([relu.liftLat, relu.liftLon], r.gare, r.titre);
      assert.equal(dansLaStation(relu), false, `${relu.distToLiftM} m de ${relu.liftName}`);
      const neuf = attachAccess(
        { ...auRepere(s), id: `neuf-${r.titre}`, title: r.titre, lat: r.lat, lon: r.lon },
        s,
      );
      assert.equal(dansLaStation(neuf), false, `${neuf.distToLiftM} m de ${neuf.liftName}`);
    });
  }

  it("un logement de Thonon, relevé pour Lullin, n'est plus « à 21 m » du funiculaire", () => {
    const s = station("lullin");
    const l = attachAccess({ ...auRepere(s), id: "thonon", lat: 46.37425, lon: 6.47935 }, s);
    assert.notEqual(l.liftKind, "funicular");
    assert.equal(dansLaStation(l), false, `${l.distToLiftM} m de ${l.liftName}`);
  });

  it("Ventron : le village n'est plus au pied de la corde du tremplin", () => {
    const s = station("ventron");
    const l = attachAccess({ ...auRepere(s), id: "village", lat: 47.9397, lon: 6.8712 }, s);
    assert.notEqual(l.liftName, "Teleski à cable bas Tremplin du Saut");
    assert.equal(dansLaStation(l), false, `${l.distToLiftM} m de ${l.liftName}`);
  });

  it("le Capucin retiré : le repère du Mont-Dore se mesure à la première remontée de ski", () => {
    // Décision du propriétaire, 26 septembre 2026 : le funiculaire du Capucin
    // ne dessert aucune piste. Le bourg est à 2,2 km des Longes.
    const l = auRepere(station("le-mont-dore"));
    assert.notEqual(l.liftName, "Capucin");
    assert.equal(l.liftName, "Longes");
    assert.equal(l.distToLiftM, 2199);
    assert.equal(dansLaStation(l), false);
  });
});
