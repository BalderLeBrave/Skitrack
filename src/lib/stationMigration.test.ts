import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FM_STATIONS } from "./franceMontagnes.data.ts";
import {
  CLASSEUR,
  CLASSEUR_DUPLICATES,
  CLASSEUR_EN_DOUBLE,
  CLASSEUR_FERMEES,
  CLASSEUR_ID_COLLISIONS,
  DOMAIN_FIXES,
  DOMAINES_CORRIGES,
  GPS_FIXES,
  IDS_FERMES,
  IDS_RETIRES,
} from "./classeur.ts";
import snapshot from "./openskimap.snapshot.json" with { type: "json" };
import {
  addedByClasseur,
  DEPOT_IDS,
  isDepotId,
  outsideClasseur,
  stationFromStoredId,
  storedIdOfStation,
} from "./stationMigration.ts";
import { DEPOT_STATIONS, STATIONS, stationById } from "./stations.ts";
import { FUSIONS, IDS_SANS_FICHE, STATIONS_SANS_FICHE, VILLAGES } from "./villages.ts";

describe("bascule vers le classeur", () => {
  it("volumes : 279 lignes de classeur sur 284, 196 appariées, 37 hors classeur, 233 au total", () => {
    // Jusqu'au 26 septembre 2026 : 284 lignes, 195 appariées, 36 hors
    // classeur, 320 stations. Quatre lignes doublaient une autre station, et
    // Lus-la-Croix-Haute est désormais appariée à `lus-la-jarjatte`. Le
    // 30 septembre, Le Grand Puy, fermé pour de bon, est sorti : sa ligne du
    // classeur (« Seyne les Alpes ») et sa station du dépôt (`le-grand-puy`).
    assert.equal(FM_STATIONS.length, 284);
    assert.equal(CLASSEUR.length, 279);
    assert.deepEqual(CLASSEUR_FERMEES, ["Seyne les Alpes"]);
    // Le doublon « Chamonix-Mont-Blanc » a été retiré du classeur source : si
    // cette liste se remplit, une ligne en double est réapparue.
    assert.deepEqual(CLASSEUR_DUPLICATES, []);
    assert.deepEqual(CLASSEUR_EN_DOUBLE, [
      "Saint-Pancrace les Bottières",
      "Sainte-Foy Station",
      "Praloup",
      "Espace Aubrac",
    ]);
    // « Praloup » recevait le suffixe INSEE (`praloup-04226`) ; écartée en
    // double de Praloup, elle ne collisionne plus avec personne.
    assert.deepEqual(CLASSEUR_ID_COLLISIONS, []);
    assert.equal(CLASSEUR.filter((e) => e.depotId).length, 196);
    // Le 5 octobre 2026, une station devient une fiche Skiinfo (`villages.ts`) :
    // les 83 que seul le classeur décrivait sont 65 villages rattachés à leur
    // station, 17 lignes sans fiche retirées et le doublon du Granier.
    // Sollières-Sardières, à fiche mais absente des deux sources, entre, avec
    // Val d'Ese et Haut Asco, sans fiche, gardées par le propriétaire.
    assert.equal(addedByClasseur().length, 0);
    assert.equal(VILLAGES.length + STATIONS_SANS_FICHE.length + Object.keys(FUSIONS).length, 83);
    assert.equal(outsideClasseur().length, 37);
    assert.equal(STATIONS.length, 233);
    assert.equal(DEPOT_STATIONS.length, 233);
  });

  it("les identifiants retirés résolvent vers la station gardée, jamais vers rien", () => {
    assert.deepEqual(IDS_RETIRES, {
      "sainte-foy-station": "sainte-foy-tarentaise",
      "saint-pancrace-les-bottieres": "les-bottieres",
      "praloup-04226": "praloup",
      "espace-aubrac": "laguiole",
      "lus-la-croix-haute": "lus-la-jarjatte",
    });
    for (const [retire, garde] of Object.entries(IDS_RETIRES)) {
      assert.ok(!STATIONS.some((s) => s.id === retire), `${retire} encore au référentiel`);
      // Seules des stations ajoutées par le classeur sont retirées : aucun
      // identifiant du dépôt ne bouge.
      assert.equal(isDepotId(retire), false, retire);
      const s = stationFromStoredId(retire);
      assert.ok(s, `${retire} ne résout plus`);
      assert.equal(s.id, garde);
      assert.equal(stationById(retire)?.id, garde);
      // La station gardée en est bien une, et pas un autre alias.
      assert.equal(stationById(garde)?.id, garde);
    }
    // Un identifiant qui n'a jamais existé reste introuvable.
    assert.equal(stationFromStoredId("station-inventee"), null);
    assert.equal(stationById("station-inventee"), undefined);
  });

  it("Lus : la ligne du classeur donne son domaine à la station du dépôt, qui garde son repère", () => {
    const lus = stationById("lus-la-jarjatte")!;
    assert.equal(lus.origin, "depot");
    assert.equal(lus.inClasseur, true);
    assert.equal(lus.domain, "Lus la Jarjatte");
    assert.equal(lus.lifts, 4);
    // Le repère du dépôt, à 120 m des remontées ; pas le centre du village.
    assert.equal(lus.lat, 44.6755);
    assert.equal(lus.lon, 5.7569);
  });

  it("distance à la piste : celle du classeur, seulement quand il la mesure depuis notre repère", () => {
    // Le classeur mesure depuis son propre repère. Lus-la-Jarjatte affichait
    // « piste à 3,1 km » depuis le centre du village, alors que son repère est
    // à 120 m des remontées ; Lispach 1,1 km, Xonrupt 1,9 km, Laguiole 4,4 km,
    // tous depuis un point à plus de 500 m du leur.
    for (const id of ["lus-la-jarjatte", "la-bresse-lispach", "xonrupt-le-poli", "laguiole"]) {
      const entry = CLASSEUR.find((e) => e.id === id)!;
      assert.ok(entry.fm.slopeDistance != null, `${id} : le classeur ne mesure plus rien`);
      assert.equal(stationById(id)!.distToPisteKm, null, id);
    }
    // Un repère corrigé à la main, loin du centre de la commune : même règle.
    // Lanslebourg était l'exemple ; c'est un village de Val Cenis depuis le
    // 5 octobre 2026, et ses corrections restent dans `GPS_FIXES`.
    assert.ok("lanslebourg" in GPS_FIXES);
    // Un repère revu (`REPERES_REVUS`) qui rejoint celui du classeur reprend
    // sa mesure : La Plagne, à Plagne Centre.
    const plagne = CLASSEUR.find((e) => e.id === "la-plagne")!;
    assert.equal(stationById("la-plagne")!.distToPisteKm, plagne.fm.slopeDistance);
    // Sous 500 m, la mesure est gardée telle quelle : Manigod, 467 m.
    const manigod = CLASSEUR.find((e) => e.id === "manigod")!;
    assert.equal(stationById("manigod")!.distToPisteKm, manigod.fm.slopeDistance);
    assert.equal(manigod.fm.slopeDistance, 0.02);
    // Une station que seul le classeur décrit est à son repère : sa mesure
    // passe, sauf si `GPS_FIXES` l'a déplacée.
    for (const s of addedByClasseur()) {
      if (s.id in GPS_FIXES) continue;
      const entry = CLASSEUR.find((e) => e.id === s.id)!;
      assert.equal(s.distToPisteKm, entry.fm.slopeDistance, s.id);
    }
    // 278 lignes mesurées ; 84 stations le sont depuis le repère qu'elles
    // gardent (151 avant le 5 octobre 2026, villages et lignes sans fiche
    // compris).
    assert.equal(CLASSEUR.filter((e) => e.fm.slopeDistance != null).length, 278);
    assert.equal(STATIONS.filter((s) => s.distToPisteKm != null).length, 84);
  });

  it("aucun identifiant du dépôt ne bouge : les 230 encore ouverts résolvent, le fermé ne résout plus rien", () => {
    assert.equal(DEPOT_IDS.length, 231);
    for (const id of DEPOT_IDS) {
      if (IDS_FERMES.has(id)) {
        // Une station fermée n'a pas de remplaçante : rien, jamais une autre.
        assert.equal(stationFromStoredId(id), null, id);
        continue;
      }
      const s = stationFromStoredId(id);
      assert.ok(s, `${id} ne résout plus`);
      assert.equal(s.id, id);
      assert.equal(storedIdOfStation(s), id);
      assert.equal(s.origin, "depot");
    }
  });

  it("aucune station ajoutée ne réutilise un identifiant du dépôt", () => {
    for (const s of addedByClasseur()) {
      assert.equal(isDepotId(s.id), false, s.id);
      assert.equal(storedIdOfStation(s), null, s.id);
    }
  });

  it("identifiants uniques sur tout le référentiel", () => {
    assert.equal(new Set(STATIONS.map((s) => s.id)).size, STATIONS.length);
  });

  it("le-granier-vallee-des-entremonts survit, et le « Le Granier » du classeur s'y résout", () => {
    const granier = stationFromStoredId("le-granier-vallee-des-entremonts");
    assert.ok(granier, "la station a disparu du référentiel");
    assert.equal(granier.origin, "depot");
    assert.equal(granier.inClasseur, false);
    // Ce qu'elle garde.
    assert.ok(granier.demM != null);
    assert.equal(granier.lat, 45.4632);
    // Ce qu'elle n'a pas, faute de domaine rattaché — affiché, pas comblé.
    assert.equal(granier.domain, null);
    assert.equal(granier.lifts, null);
    assert.equal(granier.colorShare, null);
    assert.equal(granier.distToPisteKm, null);
    // La ligne homonyme du classeur, placée à 9,2 km avec les mesures du
    // Planolet, est un doublon (5 octobre 2026, `FUSIONS`) : son identifiant
    // ouvre la station du dépôt, et elle n'est plus une station.
    assert.ok(!STATIONS.some((s) => s.id === "le-granier"));
    assert.equal(stationFromStoredId("le-granier")?.id, granier.id);
    const ligne = CLASSEUR.find((e) => e.id === "le-granier")!;
    const km = Math.hypot((ligne.fm.lat - granier.lat) * 111, (ligne.fm.lon - granier.lon) * 78);
    assert.ok(km > 8 && km < 11, `${km.toFixed(1)} km`);
    const planolet = CLASSEUR.find((e) => e.id === "saint-pierre-de-chartreuse")!;
    assert.equal(ligne.measure.km, planolet.measure.km);
  });

  it("les rattachements corrigés avec leurs chiffres tiennent, et le classeur dit encore autre chose", () => {
    // Si l'une de ces assertions tombe, le classeur a été corrigé en amont et
    // l'entrée correspondante de DOMAINES_CORRIGES est devenue inutile.
    for (const [id, fix] of Object.entries(DOMAINES_CORRIGES)) {
      const entry = CLASSEUR.find((e) => e.id === id);
      assert.ok(entry, `${id} a disparu du classeur`);
      assert.equal(entry.domain, fix.domain, id);
      assert.notEqual(entry.fm.domain, fix.domain, `${id} : correction devenue inutile`);
      // La Bourboule, sans fiche Skiinfo, a quitté le référentiel le
      // 5 octobre 2026 : sa correction ne vaut plus que pour la ligne.
      if (IDS_SANS_FICHE.has(id)) {
        assert.equal(stationById(id), undefined, id);
        continue;
      }
      const s = stationById(id)!;
      assert.equal(s.domain, fix.domain, id);
      assert.equal(s.pistesKm, fix.chiffres?.km ?? null, id);
      assert.equal(s.lifts, fix.chiffres?.lifts ?? null, id);
      assert.equal(s.segments, fix.chiffres?.slopes ?? null, id);
    }
    // Les chiffres de Lispach sont ceux que le classeur publiait sur la ligne
    // de Xonrupt ; ceux de Xonrupt, ceux qu'OpenSkiMap mesure sur sa zone.
    const x = FM_STATIONS.find((f) => f.fmName === "Xonrupt Longemer")!;
    const lispach = DOMAINES_CORRIGES["la-bresse-lispach"]!.chiffres!;
    assert.equal(x.domain, "La Bresse - Lispach");
    assert.deepEqual(
      [lispach.km, lispach.slopes, lispach.lifts, lispach.bas, lispach.haut],
      [x.km, x.slopes, x.lifts, x.min, x.max],
    );
    assert.deepEqual(lispach.counts, {
      green: x.green,
      blue: x.blue,
      red: x.red,
      black: x.black,
      other: x.unclassed,
    });
    const osm = snapshot.rows["xonrupt-le-poli"];
    const xonrupt = DOMAINES_CORRIGES["xonrupt-le-poli"]!.chiffres!;
    assert.equal(osm.name, "Xonrupt-Longemer");
    assert.deepEqual(
      [xonrupt.km, xonrupt.slopes, xonrupt.lifts, xonrupt.bas, xonrupt.haut],
      [osm.km, osm.n, osm.lifts, osm.minM, osm.maxM],
    );
    const { green, blue, red, black, other } = xonrupt.counts;
    assert.deepEqual({ green, blue, red, black }, osm.counts);
    assert.equal(other, osm.nOther);
  });

  it("les trois rattachements corrigés tiennent, et le classeur dit encore autre chose", () => {
    // Si l'une de ces assertions tombe, le classeur a été corrigé en amont et
    // l'entrée correspondante de DOMAIN_FIXES est devenue inutile.
    for (const [fmName, expected] of Object.entries(DOMAIN_FIXES)) {
      const entry = CLASSEUR.find((e) => e.fm.fmName === fmName);
      assert.ok(entry, `${fmName} a disparu du classeur`);
      assert.equal(entry.domain, expected, fmName);
      assert.notEqual(entry.fm.domain, expected, `${fmName} : correction devenue inutile`);
    }
    const auris = STATIONS.find((s) => s.id === "auris-en-oisans")!;
    assert.equal(auris.domain, "Alpe d'Huez Grand Domaine");
  });

  it("aucune valeur estimée : les champs de domaine sont nuls hors classeur", () => {
    for (const s of outsideClasseur()) {
      assert.equal(s.domain, null, s.id);
      assert.equal(s.pistesKm, null, s.id);
      assert.equal(s.lifts, null, s.id);
      assert.equal(s.segments, null, s.id);
      assert.equal(s.colorShare, null, s.id);
      assert.equal(s.distToPisteKm, null, s.id);
    }
    // Et toute valeur présente porte son échelle.
    for (const s of STATIONS) {
      assert.equal(s.pistesKm != null, s.pistesKmScale != null, s.id);
      assert.equal(s.lifts != null, s.liftsScale != null, s.id);
      assert.equal(s.colorShare != null, s.colorScale != null, s.id);
      if (s.colorScale) assert.equal(s.colorScale, "domaine", s.id);
    }
  });
});
