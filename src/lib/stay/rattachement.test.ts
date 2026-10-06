import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attachAccess } from "../access.ts";
import { stationsVoisines } from "../domaineStations.ts";
import type { Listing } from "../listings.ts";
import { metresBetween } from "../osmAccess.ts";
import { agreger, aCompleter } from "../prix/calcul.ts";
import { STATIONS, stationById } from "../stations.ts";
import { STATIONS_A_LOGEMENTS, stationDeRattachement, VILLAGES_DE_STATION } from "../villages.ts";
import {
  distanceRayonM,
  geoReasonFor,
  gpsPrecis,
  horsRayon,
  lieuReasonFor,
  RAYON_DEFAUT_KM,
} from "./lodgingFilter.ts";
import { cleBien, dedoublonnerParBien } from "./poserReleve.ts";
import { regrouper } from "./regroupement.ts";
import {
  exclueDeLaStation,
  RATTACHEMENT_MAX_M,
  rattacher,
  stationDuLogement,
  stationsDeLaCommune,
  verdictStation,
} from "./rattachement.ts";

/**
 * La règle du propriétaire (6 octobre 2026) : chaque logement appartient à une
 * seule station, celle de la commune ou du village où il se trouve ; jamais au
 * domaine skiable, jamais à deux stations. Les cas sont ceux qu'il a listés,
 * joués sur le référentiel réel et par les fonctions que les écrans appellent.
 */

const IN = "2027-02-06";
const OUT = "2027-02-13";

function annonce(stationId: string, over: Partial<Listing> = {}): Listing {
  return {
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
    lat: null,
    lon: null,
    proven: "test",
    ...over,
  };
}

/**
 * Les stations sous lesquelles l'écran Logements montre un logement situé en
 * (lat, lon) : pour chaque station qui a des logements (une fiche-village
 * renvoie à sa station), la recherche pose l'annonce (`attachAccess`) puis le
 * filtre fixe la garde ou non (`geoReasonFor`, position GPS).
 */
function listeeSous(lat: number, lon: number): string[] {
  return STATIONS_A_LOGEMENTS.filter((s) => {
    const l = attachAccess(annonce(s.id, { lat, lon }), s);
    return gpsPrecis(l) && geoReasonFor(l, RAYON_DEFAUT_KM, s.dept) == null;
  }).map((s) => s.id);
}

describe("rattachement : un logement à Aussois n'apparaît que sous Aussois", () => {
  const AUSSOIS = { lat: 45.2281, lon: 6.7414 };

  it("il est rattaché à Aussois, par sa position", () => {
    const r = rattacher(AUSSOIS);
    assert.equal(r.stationId, "aussois");
    assert.equal(r.stationId != null && r.critere, "gps");
  });

  it("aucune autre station ne le liste, Val Cenis comprise", () => {
    assert.deepEqual(listeeSous(AUSSOIS.lat, AUSSOIS.lon), ["aussois"]);
  });

  it("sous Val Cenis, il sort comme logement d'une autre station, même domaine de forfait", () => {
    const valCenis = stationById("val-cenis")!;
    const l = attachAccess(annonce("val-cenis", AUSSOIS), valCenis);
    assert.equal(geoReasonFor(l, RAYON_DEFAUT_KM, valCenis.dept), "autre-station");
    // La commune publiée par une centrale suffit aussi, sans position.
    assert.equal(verdictStation({ locality: "73500 AUSSOIS" }, "val-cenis"), "autre-station");
  });

  it("Haute Maurienne Vanoise n'est pas un domaine relié : Val Cenis et Aussois ne sont pas voisines", () => {
    assert.deepEqual(stationsVoisines("val-cenis", stationById("val-cenis")!.domain), []);
    assert.deepEqual(stationsVoisines("aussois", stationById("aussois")!.domain), []);
  });
});

describe("rattachement : un logement à Lanslebourg n'apparaît que sous Val Cenis", () => {
  const LANSLEBOURG = { lat: 45.2866, lon: 6.8786 };

  it("Lanslebourg, Lanslevillard, Termignon, Bramans et Sollières sont Val Cenis", () => {
    for (const id of ["lanslebourg", "lanslevillard", "termignon", "bramans"]) {
      assert.equal(stationDeRattachement(id), "val-cenis", id);
      assert.ok(!STATIONS_A_LOGEMENTS.some((s) => s.id === id), `${id} n'a pas de logements à lui`);
    }
    assert.deepEqual(stationsDeLaCommune("Sollières-Sardières"), ["val-cenis"]);
  });

  it("il est rattaché à Val Cenis, et listé sous elle seule", () => {
    assert.equal(rattacher(LANSLEBOURG).stationId, "val-cenis");
    assert.deepEqual(listeeSous(LANSLEBOURG.lat, LANSLEBOURG.lon), ["val-cenis"]);
  });

  it("la fiche du village Lanslebourg rend les logements de Val Cenis, pas les siens", () => {
    assert.equal(verdictStation(LANSLEBOURG, "lanslebourg"), "sienne");
    assert.equal(stationDeRattachement("lanslebourg"), "val-cenis");
  });

  it("un logement de Bramans, sans domaine au référentiel, reste sous Val Cenis et y est dans le domaine", () => {
    const valCenis = stationById("val-cenis")!;
    const l = attachAccess(annonce("val-cenis", { lat: 45.2236, lon: 6.7767 }), valCenis);
    assert.equal(geoReasonFor(l, RAYON_DEFAUT_KM, valCenis.dept), null);
    assert.equal(l.domainFit, "in");
    assert.deepEqual(listeeSous(45.2236, 6.7767), ["val-cenis"]);
  });
});

describe("rattachement : sur un grand domaine relié, aucun logement sous deux stations", () => {
  /** Les points d'une grille de 1,5 km autour des stations d'un domaine. */
  function grille(domaine: string): { lat: number; lon: number }[] {
    const stations = STATIONS.filter((s) => s.domain === domaine);
    const lats = stations.map((s) => s.lat);
    const lons = stations.map((s) => s.lon);
    const pas = 0.0135;
    const points: { lat: number; lon: number }[] = [];
    for (let lat = Math.min(...lats) - 0.02; lat <= Math.max(...lats) + 0.02; lat += pas) {
      for (let lon = Math.min(...lons) - 0.02; lon <= Math.max(...lons) + 0.02; lon += pas)
        points.push({ lat, lon });
    }
    return points;
  }

  for (const domaine of ["Paradiski (Les Arcs – La Plagne)", "Les Trois Vallées"]) {
    it(`${domaine} : chaque point est listé sous une station au plus, par le chemin de l'écran`, () => {
      const stations = STATIONS_A_LOGEMENTS.filter((s) => s.domain === domaine);
      assert.ok(stations.length >= 5, domaine);
      let situes = 0;
      for (const p of grille(domaine)) {
        // Toutes les stations à logements à portée de recherche, du domaine ou
        // non : au-delà de 20 km, le rayon de l'écran (12 km au plus) écarte
        // de toute façon. Chacune pose l'annonce et la filtre comme l'écran
        // Logements (`attachAccess`, `geoReasonFor`).
        const proches = STATIONS_A_LOGEMENTS.filter(
          (s) => metresBetween(p.lat, p.lon, s.lat, s.lon) <= 20_000,
        );
        const sous = proches
          .filter((s) => {
            const l = attachAccess(annonce(s.id, p), s);
            return geoReasonFor(l, RAYON_DEFAUT_KM, s.dept) == null;
          })
          .map((s) => s.id);
        assert.ok(sous.length <= 1, `${p.lat.toFixed(4)},${p.lon.toFixed(4)} : ${sous.join(", ")}`);
        if (sous.length === 1) {
          situes += 1;
          // Et c'est la station que le rattachement désigne.
          assert.equal(sous[0], rattacher(p).stationId, `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`);
        }
      }
      assert.ok(situes > 50, `${domaine} : ${situes} points situés`);
    });
  }

  it("Méribel, Courchevel et Val Thorens gardent chacune les leurs, reliées ou non", () => {
    for (const id of [
      "meribel",
      "courchevel",
      "val-thorens",
      "les-menuires",
      "la-plagne",
      "les-arcs-bourg-st-maurice",
    ]) {
      const s = stationById(id)!;
      assert.deepEqual(listeeSous(s.lat, s.lon), [id], id);
    }
  });

  it("un village de la station est la station : Belle Plagne est La Plagne, Arc 1800 Les Arcs", () => {
    const bellePlagne = stationById("belle-plagne")!;
    const arc1800 = stationById("arc-1800")!;
    assert.deepEqual(listeeSous(bellePlagne.lat, bellePlagne.lon), ["la-plagne"]);
    assert.deepEqual(listeeSous(arc1800.lat, arc1800.lon), ["les-arcs-bourg-st-maurice"]);
  });

  it("le domaine relié reste une information de la fiche station", () => {
    const voisines = stationsVoisines("courchevel", stationById("courchevel")!.domain).map(
      (s) => s.id,
    );
    assert.ok(
      voisines.includes("meribel") && voisines.includes("val-thorens"),
      voisines.join(", "),
    );
    assert.ok(
      !voisines.includes("courchevel-le-praz"),
      "un village de Courchevel n'est pas une voisine",
    );
  });
});

describe("rattachement : un même bien collecté deux fois ne fait qu'un logement", () => {
  const MERIBEL = stationById("meribel")!;
  const situee = (over: Partial<Listing>) =>
    annonce("meribel", {
      lat: MERIBEL.lat + 0.001,
      lon: MERIBEL.lon + 0.001,
      distToSlopesM: 150,
      distToLiftM: 120,
      ...over,
    });

  it("même plateforme, même identifiant : une clé, une annonce", () => {
    // Airbnb, relevé par CozyCozy et en direct : deux `id`, le même logement.
    const cozy = situee({ id: "cozy-abc", url: "https://www.airbnb.fr/rooms/55555555" });
    const direct = situee({
      id: "55555555",
      url: "https://www.airbnb.fr/rooms/55555555?check_in=2027-02-06",
    });
    assert.equal(cleBien(cozy), cleBien(direct));
    assert.equal(dedoublonnerParBien([cozy, direct]).length, 1);
    // Booking, même `platformId`.
    const b1 = situee({ id: "bk-a", source: "Booking", platformId: "777", url: null });
    const b2 = situee({ id: "bk-b", source: "Booking", platformId: "777", url: null, total: 1700 });
    const [b] = dedoublonnerParBien([b1, b2]);
    assert.equal(b.total, 1700, "la moins chère des copies tarifées");
  });

  it("la copie tarifée l'emporte, et garde la position d'une copie située", () => {
    const sansPrix = situee({ id: "a", total: 0 });
    const sansPosition = annonce("meribel", { id: "b", lat: null, lon: null });
    const [l] = dedoublonnerParBien([sansPrix, sansPosition]);
    assert.equal(l.total, 1800);
    assert.equal(l.lat, sansPrix.lat);
    assert.equal(l.distToLiftM, 120, "ce que la position détermine la suit");
  });

  it("la médiane ne le compte qu'une fois, quel que soit l'ordre", () => {
    const ctx = {
      dept: MERIBEL.dept,
      checkIn: IN,
      checkOut: OUT,
      groupe: { trav: 6, rooms: 0 },
      now: Date.parse("2027-01-10T12:00:00Z"),
    };
    const prix = { pricedCheckIn: IN, pricedCheckOut: OUT, scannedAt: ctx.now - 60_000 };
    const a = situee({
      id: "x1",
      url: "https://www.airbnb.fr/rooms/66666666",
      total: 2000,
      ...prix,
    });
    const b = situee({
      id: "x2",
      url: "https://www.airbnb.fr/rooms/66666666",
      total: 2400,
      ...prix,
    });
    assert.deepEqual(agreger([a, b], ctx), { n: 1, muettes: 0, petits: 0, med: 2000 });
    assert.deepEqual(agreger([b, a], ctx), { n: 1, muettes: 0, petits: 0, med: 2000 });
  });

  it("deux centrales qui numérotent pareil ne se confondent pas ; une offre forfaits compris reste une offre", () => {
    const c1 = situee({ id: "dw-a-42", source: "Centrale", platformId: "42", url: null });
    const c2 = situee({ id: "dw-b-42", source: "Centrale", platformId: "42", url: null });
    assert.equal(dedoublonnerParBien([c1, c2]).length, 2);
    const seul = situee({
      id: "mc-2338",
      source: "Mountain Collection",
      platformId: "2338",
      url: null,
      skiPassIncluded: false,
    });
    const forfait = situee({
      id: "mc-2338-forfait",
      source: "Mountain Collection",
      platformId: "2338",
      url: null,
      skiPassIncluded: true,
    });
    assert.equal(dedoublonnerParBien([seul, forfait]).length, 2);
  });

  it("le même bien, seul et forfaits compris : un logement, deux offres, compté une fois", () => {
    // Comme un comparateur : deux formules du même appartement sont deux prix
    // d'un logement, pas deux logements. La moins chère se montre et compte.
    const ctx = {
      dept: MERIBEL.dept,
      checkIn: IN,
      checkOut: OUT,
      groupe: { trav: 6, rooms: 0 },
      now: Date.parse("2027-01-10T12:00:00Z"),
    };
    const prix = { pricedCheckIn: IN, pricedCheckOut: OUT, scannedAt: ctx.now - 60_000 };
    const mc = {
      source: "Mountain Collection" as const,
      platformId: "2338",
      url: "https://www.mountain-collection.com/fr/location/2338",
      ...prix,
    };
    const seul = situee({ id: "mc-2338", ...mc, total: 1500, skiPassIncluded: false });
    const forfait = situee({ id: "mc-2338-forfait", ...mc, total: 2100, skiPassIncluded: true });
    const [g, ...autres] = regrouper([forfait, seul]);
    assert.equal(autres.length, 0);
    assert.equal(g.principale.id, "mc-2338");
    assert.deepEqual(
      g.offres.map((o) => o.id),
      ["mc-2338", "mc-2338-forfait"],
    );
    assert.deepEqual(agreger([forfait, seul], ctx), { n: 1, muettes: 0, petits: 0, med: 1500 });
    // Ses deux formules ne rendent pas son titre ambigu : la même annonce sur
    // Booking, au même endroit, rejoint le logement.
    const titre = "Résidence Les Fermes du Soleil appartement 6 personnes";
    const booking = situee({
      id: "bk-9",
      source: "Booking",
      platformId: "9",
      url: "https://www.booking.com/hotel/fr/fermes-soleil.html",
      title: titre,
      total: 1400,
      ...prix,
    });
    const memes = [{ ...seul, title: titre }, { ...forfait, title: titre }, booking];
    assert.equal(regrouper(memes).length, 1);
  });

  it("une formule forfaits compris reste une offre, même sans `skiPassIncluded` ni `platformId`", () => {
    const seul = situee({ id: "mc-77", source: "Mountain Collection", url: null });
    const forfait = situee({ id: "mc-77-forfait", source: "Mountain Collection", url: null });
    assert.notEqual(cleBien(seul), cleBien(forfait));
    assert.equal(dedoublonnerParBien([seul, forfait]).length, 2);
    assert.equal(regrouper([seul, forfait]).length, 1, "un logement, deux offres");
  });
});

describe("rattachement : un logement sans coordonnées suit la règle de repli", () => {
  it("la commune publiée, si elle ne désigne qu'une station", () => {
    assert.deepEqual(rattacher({ locality: "AUSSOIS" }), {
      stationId: "aussois",
      critere: "commune",
      distanceM: null,
    });
    // Val-Cenis est la commune de quatre entrées, toutes Val Cenis.
    assert.equal(rattacher({ locality: "Val-Cenis" }).stationId, "val-cenis");
  });

  it("une commune partagée par deux stations ne tranche pas : non situé", () => {
    assert.deepEqual(rattacher({ locality: "Les Belleville" }), {
      stationId: null,
      motif: "commune-partagee",
    });
    assert.equal(verdictStation({ locality: "Les Belleville" }, "val-thorens"), "non-situe");
    // Un nom étranger à la commune ne tranche pas non plus.
    assert.equal(
      rattacher({ locality: "Les Belleville", title: "À 5 min de Méribel" }).stationId,
      null,
    );
    // Le nom de la commune n'est pas celui de la station homonyme : Morzine
    // porte aussi Avoriaz, Courchevel La Tania.
    assert.equal(
      rattacher({ locality: "74110 Morzine", title: "Studio pied des pistes" }).stationId,
      null,
    );
    assert.equal(rattacher({ locality: "Courchevel" }).stationId, null);
    assert.equal(rattacher({ locality: "Courchevel", title: "Studio Courchevel" }).stationId, null);
    assert.equal(verdictStation({ locality: "Courchevel" }, "la-tania"), "non-situe");
  });

  it("une commune partagée et deux de ses stations nommées : un doute, aucune", () => {
    const sous = (locality: string, title: string) => rattacher({ locality, title }).stationId;
    assert.equal(sous("Courchevel", "Chalet à La Tania, à 5 min de Courchevel 1850"), null);
    assert.equal(sous("Les Belleville", "Appartement Val Thorens, vue sur Les Menuires"), null);
  });

  it("une commune partagée et le nom d'une de ses stations : cette station, le titre d'abord", () => {
    const sous = (locality: string, title: string) => rattacher({ locality, title }).stationId;
    assert.equal(sous("Les Belleville", "Studio Val Thorens"), "val-thorens");
    assert.equal(sous("Les Belleville", "Appartement Les Menuires"), "les-menuires");
    assert.equal(sous("Courchevel", "Chalet à La Tania"), "la-tania");
    assert.equal(sous("Courchevel", "Appartement Courchevel 1850"), "courchevel");
    assert.equal(sous("Morzine", "Studio Avoriaz"), "avoriaz");
    // La commune publiée, au-delà du nom de la commune, nomme aussi.
    assert.equal(sous("Les Belleville - Val Thorens", "Studio"), "val-thorens");
    assert.equal(sous("Courchevel 1850", "Studio"), "courchevel");
    // Trait d'union sans espaces.
    assert.equal(sous("74110 Morzine-Avoriaz", "Studio"), "avoriaz");
    assert.equal(sous("Les Belleville-Val Thorens", "Studio"), "val-thorens");
    assert.equal(
      verdictStation({ locality: "Courchevel", title: "Chalet à La Tania" }, "courchevel"),
      "autre-station",
    );
  });

  it("un nom de station dans le titre rattache, mais n'exclut pas", () => {
    assert.equal(rattacher({ title: "Chalet à Lanslebourg" }).stationId, "val-cenis");
    // Ni par le rattachement, ni par le verdict de domaine : l'annonce reste
    // à compléter sous sa station de relevé.
    const vc = stationById("val-cenis")!;
    const vue = attachAccess(annonce(vc.id, { title: "Chalet vue sur Aussois" }), vc);
    assert.equal(lieuReasonFor(vue, vc.dept), null);
    assert.equal(stationDuLogement({ ...vue, stationId: vc.id }), "val-cenis");
    assert.equal(verdictStation({ title: "Chalet à Lanslebourg" }, "val-cenis"), "sienne");
    assert.equal(
      verdictStation({ title: "Studio à 5 min de Val Thorens" }, "les-menuires"),
      "non-situe",
    );
  });

  it("deux stations nommées dans le titre seul : un doute, aucune", () => {
    assert.deepEqual(rattacher({ title: "Studio Val Thorens, vue sur Les Menuires" }), {
      stationId: null,
      motif: "sans-position",
    });
    // Un village et sa station ne sont qu'une.
    assert.equal(rattacher({ title: "Chalet à Lanslebourg, Val Cenis" }).stationId, "val-cenis");
  });

  it("rien qui situe : aucune station, jamais une supposée", () => {
    assert.deepEqual(rattacher({ title: "Appartement 6 personnes" }), {
      stationId: null,
      motif: "sans-position",
    });
    // Un (0, 0) n'est pas une position.
    assert.deepEqual(rattacher({ lat: 0, lon: 0, title: "x" }), {
      stationId: null,
      motif: "sans-position",
    });
  });

  it("non situé, il n'est ni montré ni compté, mais reste à compléter", () => {
    const s = stationById("les-2-alpes")!;
    const l = attachAccess(annonce(s.id, { title: "Appartement 6 personnes" }), s);
    assert.equal(geoReasonFor(l, RAYON_DEFAUT_KM, s.dept), null, "rien ne le dit ailleurs");
    assert.equal(gpsPrecis(l), false, "l'écran Logements exige une position");
    assert.equal(exclueDeLaStation(l, s.id), false);
    const ctx = {
      dept: s.dept,
      checkIn: IN,
      checkOut: OUT,
      groupe: { trav: 6, rooms: 0 },
      now: Date.parse("2027-01-10T12:00:00Z"),
    };
    const prix = {
      pricedCheckIn: IN,
      pricedCheckOut: OUT,
      scannedAt: ctx.now - 60_000,
      capacity: null,
    };
    const aLire = annonce(s.id, { ...prix });
    assert.equal(agreger([aLire], ctx).n, 0, "la médiane exige une position");
    assert.deepEqual(
      aCompleter([aLire], ctx).map((x) => x.id),
      ["airbnb-1"],
      "sa fiche reste à lire",
    );
  });
});

describe("rattachement : le plafond et les villages", () => {
  it("au-delà de 12 km de toute station, aucune station", () => {
    assert.equal(RATTACHEMENT_MAX_M, 12_000);
    assert.deepEqual(rattacher({ lat: 43.2965, lon: 5.3698 }), {
      stationId: null,
      motif: "trop-loin",
    });
  });

  it("la table des villages ne nomme que des stations du référentiel, une seule fois chacune", () => {
    const vus = new Set<string>();
    for (const [mere, v] of Object.entries(VILLAGES_DE_STATION)) {
      assert.equal(stationById(mere)?.id, mere, mere);
      assert.ok(
        !(mere in Object.fromEntries([...vus].map((x) => [x, 1]))),
        `${mere} est un village`,
      );
      for (const id of v.stations) {
        assert.equal(stationById(id)?.id, id, id);
        assert.ok(!vus.has(id), `${id} deux fois`);
        vus.add(id);
      }
    }
    for (const mere of Object.keys(VILLAGES_DE_STATION))
      assert.ok(!vus.has(mere), `${mere} est à la fois mère et village`);
    assert.equal(STATIONS_A_LOGEMENTS.length, STATIONS.length - vus.size);
  });

  it("La Tania reste une station ; Val Thorens et Les Menuires aussi", () => {
    for (const id of ["la-tania", "val-thorens", "les-menuires", "saint-martin-de-belleville"]) {
      assert.equal(stationDeRattachement(id), id);
    }
  });

  it("les quatre repères repris du classeur : chaque station a le sien, et ses logements", () => {
    // Positions du classeur France Montagnes (`franceMontagnes.data.ts`). Avec
    // les anciens repères du dépôt, un logement au centre des Saisies allait à
    // Bisanne 1500, du Corbier à La Toussuire, de Saint-Jean-d'Arves à
    // Saint-Sorlin-d'Arves, et le repère des Menuires était à Saint-Martin.
    const reperes: [string, number, number][] = [
      ["les-menuires", 45.324, 6.5385],
      ["les-saisies", 45.7547, 6.5388],
      ["le-corbier", 45.239662, 6.268214],
      ["st-jean-darves", 45.204531, 6.279153],
    ];
    for (const [id, lat, lon] of reperes) {
      const s = stationById(id)!;
      assert.deepEqual([s.lat, s.lon], [lat, lon], `${id} : repère`);
      // Un logement à 100 m du repère : le repère le plus proche est le sien.
      const r = rattacher({ lat: lat + 0.0009, lon });
      assert.equal(r.stationId, id, `${id} : rattachement`);
    }
    // Saint-Martin-de-Belleville garde les siens : l'ancien repère des
    // Menuires était à 311 m du sien.
    const stMartin = stationById("saint-martin-de-belleville")!;
    assert.equal(
      rattacher({ lat: stMartin.lat + 0.0005, lon: stMartin.lon }).stationId,
      "saint-martin-de-belleville",
    );
  });
});

describe("Logements : l'appartenance et le rayon sont deux filtres", () => {
  const PLAGNE = stationById("la-plagne")!;
  const BELLE = stationById("belle-plagne")!;
  const COURCHEVEL = stationById("courchevel")!;
  const MERIBEL = stationById("meribel")!;

  it("« Dans la station » juge l'appartenance seule, quelle que soit la distance", () => {
    // Un logement de Méribel cherché sous Courchevel : à 6 km, dans tout
    // rayon, mais pas de Courchevel.
    const l = attachAccess(
      annonce(COURCHEVEL.id, { lat: MERIBEL.lat, lon: MERIBEL.lon }),
      COURCHEVEL,
    );
    assert.equal(lieuReasonFor(l, COURCHEVEL.dept), "autre-station");
    assert.equal(horsRayon(l, 12), false);
  });

  it("le rayon se mesure depuis le repère du village : Belle Plagne est au pied de Belle Plagne", () => {
    // Le repère de La Plagne est à 5,6 km de celui de Belle Plagne.
    const l = attachAccess(annonce(PLAGNE.id, { lat: BELLE.lat + 0.001, lon: BELLE.lon }), PLAGNE);
    assert.equal(lieuReasonFor(l, PLAGNE.dept), null);
    const m = distanceRayonM(l)!;
    assert.ok(m < 200, `${m} m`);
    assert.equal(horsRayon(l, 5), false);
    assert.ok(metresBetween(PLAGNE.lat, PLAGNE.lon, l.lat!, l.lon!) > 5_000);
  });

  it("une distance non mesurée n'est pas hors rayon ; l'appartenance en décide", () => {
    const l = attachAccess(annonce(PLAGNE.id, { locality: "Aussois" }), PLAGNE);
    assert.equal(distanceRayonM(l), null);
    assert.equal(horsRayon(l, 5), false);
    assert.equal(lieuReasonFor(l, PLAGNE.dept), "autre-station");
  });
});
