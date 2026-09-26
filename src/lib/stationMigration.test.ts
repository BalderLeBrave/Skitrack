import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FM_STATIONS } from "./franceMontagnes.data.ts";
import {
  CLASSEUR,
  CLASSEUR_DUPLICATES,
  CLASSEUR_EN_DOUBLE,
  CLASSEUR_ID_COLLISIONS,
  DOMAIN_FIXES,
  DOMAINES_CORRIGES,
  GPS_FIXES,
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

describe("bascule vers le classeur", () => {
  it("volumes : 280 lignes de classeur sur 284, 196 appariées, 35 hors classeur, 315 au total", () => {
    // Jusqu'au 26 septembre 2026 : 284 lignes, 195 appariées, 36 hors
    // classeur, 320 stations. Quatre lignes doublaient une autre station, et
    // Lus-la-Croix-Haute est désormais appariée à `lus-la-jarjatte`.
    assert.equal(FM_STATIONS.length, 284);
    assert.equal(CLASSEUR.length, 280);
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
    assert.equal(addedByClasseur().length, 84);
    assert.equal(outsideClasseur().length, 35);
    assert.equal(STATIONS.length, 315);
    assert.equal(DEPOT_STATIONS.length, 231);
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
    assert.ok("lanslebourg" in GPS_FIXES);
    assert.equal(stationById("lanslebourg")!.distToPisteKm, null);
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
    // 279 lignes mesurées ; 152 le sont depuis le repère que la station garde.
    assert.equal(CLASSEUR.filter((e) => e.fm.slopeDistance != null).length, 279);
    assert.equal(STATIONS.filter((s) => s.distToPisteKm != null).length, 152);
  });

  it("aucun identifiant du dépôt ne bouge : les 231 résolvent encore", () => {
    assert.equal(DEPOT_IDS.length, 231);
    for (const id of DEPOT_IDS) {
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

  it("le-granier-vallee-des-entremonts survit, distinct du « Le Granier » du classeur", () => {
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
    // La ligne homonyme du classeur est une autre station, à 9,2 km.
    const other = STATIONS.filter((s) => s.name === "Le Granier" && s.id !== granier.id);
    assert.equal(other.length, 1);
    assert.equal(other[0].origin, "classeur");
    const km = Math.hypot((other[0].lat - granier.lat) * 111, (other[0].lon - granier.lon) * 78);
    assert.ok(km > 8 && km < 11, `${km.toFixed(1)} km`);
  });

  it("les rattachements corrigés avec leurs chiffres tiennent, et le classeur dit encore autre chose", () => {
    // Si l'une de ces assertions tombe, le classeur a été corrigé en amont et
    // l'entrée correspondante de DOMAINES_CORRIGES est devenue inutile.
    for (const [id, fix] of Object.entries(DOMAINES_CORRIGES)) {
      const entry = CLASSEUR.find((e) => e.id === id);
      assert.ok(entry, `${id} a disparu du classeur`);
      assert.equal(entry.domain, fix.domain, id);
      assert.notEqual(entry.fm.domain, fix.domain, `${id} : correction devenue inutile`);
      const s = stationById(id)!;
      assert.equal(s.domain, fix.domain, id);
      assert.equal(s.pistesKm, fix.chiffres?.km ?? null, id);
      assert.equal(s.lifts, fix.chiffres?.lifts ?? null, id);
      assert.equal(s.segments, fix.chiffres?.slopes ?? null, id);
    }
    // La Bourboule : sans domaine ni chiffres, mais toujours là, à son repère.
    const bourboule = stationById("la-bourboule")!;
    assert.equal(bourboule.id, "la-bourboule");
    assert.equal(bourboule.domain, null);
    assert.equal(bourboule.colorShare, null);
    assert.equal(bourboule.lat, 45.581374);
    // Ni le bas ni le haut des pistes de Super Besse.
    assert.equal(bourboule.minM, 0);
    assert.equal(bourboule.maxM, 0);
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
