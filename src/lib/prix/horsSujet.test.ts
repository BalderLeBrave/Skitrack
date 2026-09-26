import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  estHotel,
  estMobilHome,
  forfaitCompris,
  GARE_ETRANGERE_MAX_M,
  horsDeFrance,
  motifChambre,
  motifHorsSujet,
  type MotifHorsSujet,
} from "./horsSujet.ts";
import { metresBetween } from "../remontees.ts";
import { STATIONS, stationById } from "../stations.ts";

/** Les exemples viennent des relevés d'Adrien du 25 septembre 2026 (119
 *  stations, 3 457 offres, 1 618 cartes dans « Par budget »). */

describe("hôtels : le type publié commence par « hôtel »", () => {
  it("écarte les hôtels, étoilés ou non, de toute plateforme", () => {
    for (const [type, titre] of [
      ["hôtel 5*", "Armancette - The Leading Hotels Of The World"],
      ["hôtel 5*", "Le Yule Hotel & Spa"],
      ["hôtel 5*", "Grandes Rousses Hotel & Spa"],
      ["hôtel", "Auberge Alpina"],
      ["hôtel 2*", "Chaume De Balveurche"],
      ["hôtel", "Belambra Clubs Flaine Panorama"],
      ["hôtel", "Village De Vacances Les Flocons Verts"],
      ["hôtel 3*", "Sowell Family Les Bergers"],
      ["hôtel 4*", "Hôtel Et Chalet Au Coin Du Feu Chilly Powder"],
      ["Hôtel", "Le Chalet"],
    ] as const) {
      assert.ok(estHotel(type, titre), `${type} · ${titre}`);
    }
  });

  it("épargne un titre qui dit appartement, apartment ou gîte", () => {
    // Les 4 des 93 offres typées hôtel que la règle garde : elle en écarte 89.
    for (const [type, titre] of [
      // Airbnb typé hôtel par erreur.
      ["hôtel", "Gîte De Charme à Font Romeu Odeillo"],
      ["hôtel 3*", "Eden Hotel, Apartments And Chalet Chamonix Les Praz"],
      ["hôtel 5*", "Chalet Inarpa - Appartements Et Suites"],
      ["hôtel 3*", "Hôtel Ski Lodge - Chambres & Appartements - Village Montana"],
    ] as const) {
      assert.ok(!estHotel(type, titre), `${type} · ${titre}`);
    }
  });

  it("garde les appart'hôtels, les villages vacances et les résidences (décision du propriétaire)", () => {
    for (const [type, titre] of [
      ["appart’hôtel 4*", "Résidence Odalys Les Fermes De Châtel"],
      ["appart’hôtel", "Résidence Joséphine"],
      ["appart’hôtel", "Résidence Azureva La Clusaz Les Aravis"],
      ["appart’hôtel 3*", "Vacancéole - Appart'vacances Pyrénées 2000"],
      ["village vacances", "Vvf Queyras"],
      ["village vacances", "Vvf Saint-lary-soulan Hautes-pyrénées"],
      ["village vacances", "Azureva Club La Clusaz Les Confins"],
      ["châlet", "Chalet Hotel Le Mont Bisanne"],
      ["appartement", "Hôtel de la Poste, appartement 4 pièces"],
      [null, "Grand Hôtel des Alpes"],
    ] as const) {
      assert.ok(!estHotel(type, titre), `${type} · ${titre}`);
      assert.equal(motifHorsSujet({ title: titre, propertyType: type }), null, titre);
    }
  });

  it("écarte les séjours forfait compris, et eux seuls", () => {
    assert.ok(forfaitCompris("Belambra Clubs Arc 2000 - L'aiguille Rouge - Ski Pass Included"));
    assert.ok(forfaitCompris("Belambra Clubs Les Saisies - Les Embrunes - Ski Pass Included"));
    assert.ok(forfaitCompris("Chalet 8 personnes, forfaits de ski inclus"));
    assert.ok(
      !forfaitCompris(
        "Ikaria - Chalet - Bo Immobilier - Châtel - Reduced Prices On Ski Passes Châtel & Portes Du Soleil",
      ),
    );
    assert.ok(!forfaitCompris("Appartement à 50 m du point de vente des forfaits"));
    assert.equal(
      motifHorsSujet({ title: "Chalet 10 pers - Ski Pass Included", propertyType: "châlet" }),
      "forfait compris",
    );
  });
});

describe("mobil-homes : le titre, quel que soit le type", () => {
  it("écarte les mobil-homes de Séez, de Saint-Lary et d'Aragnouet", () => {
    for (const [type, titre] of [
      ["cabane", "Mobile-home"],
      ["mobilhome", "Mobil-home - 6 Pers., Animaux Ok"],
      ["bungalow", "Mobil-home - 6 Pers., Animaux Ok"],
      ["camping", "Mobil-home - 6 Pers., Animaux Ok - Api-1-52-2917"],
      ["bungalow", "Mobil-home Saint Lary Soulan - Ski Pyrénées"],
      ["camping", "Mobil Home «Les Petites Marmottes»"],
      ["maison", "Mobilhome En Auvergne"],
    ] as const) {
      assert.ok(estMobilHome(titre), titre);
      assert.equal(motifHorsSujet({ title: titre, propertyType: type }), "mobil-home", titre);
    }
  });

  it("n'écarte pas un vrai logement typé cabane ou mobilhome", () => {
    for (const [type, titre] of [
      // Vaujany, 56 m², à 11 m de la remontée.
      [
        "mobilhome",
        "Wifi, à 50m Des Remontées, Remise En Forme, Piscine, Sauna, Hammam, Parking, Télévision, 56m²",
      ],
      ["cabane", "Family Summer Chalet, With Garden, Hot Tub, Bbq"],
      ["cabane", "Le Pyrénéen Urbain, Charme Et Confort Pour 6 Pers."],
      ["bungalow", "Chalet Les Mobiles"],
    ] as const) {
      assert.equal(motifHorsSujet({ title: titre, propertyType: type }), null, titre);
    }
  });

  it("ne touche pas au Chalet la Buidonnière (4 étoiles, 18 personnes)", () => {
    assert.equal(motifHorsSujet({ title: "Chalet la Buidonnière", propertyType: "Chalet" }), null);
  });
});

describe("chambres d'hôtes, chez l'habitant, auberges de jeunesse : le type publié", () => {
  it("nomme chacun des types écartés", () => {
    const cas: [string, MotifHorsSujet][] = [
      ["Chambre d’hôtes / B&B", "chambre d'hôtes"],
      ["chambre d’hôtes", "chambre d'hôtes"],
      ["B&B", "chambre d'hôtes"],
      ["Ch. chez l’habitant", "chambre chez l'habitant"],
      ["auberge de jeunesse 3*", "auberge de jeunesse ou dortoir"],
      ["auberge de jeunesse", "auberge de jeunesse ou dortoir"],
      ["Dortoir", "auberge de jeunesse ou dortoir"],
    ];
    for (const [type, motif] of cas) assert.equal(motifChambre(type, "Chalet"), motif, type);
  });

  it("parmi tous les types des relevés, ne touche que ceux-là", () => {
    // Les 35 types publiés des relevés du 25 septembre 2026, toutes sources.
    const types = [
      "appartement", "châlet", "maison", "hôtel 3*", "hôtel 4*", "hôtel", "appart’hôtel 4*",
      "Chalet", "hôtel 2*", "gîte", "appart’hôtel", "village vacances", "hôtel 5*",
      "appart’hôtel 3*", "Chambre d’hôtes / B&B", "bungalow", "cabane", "Ch. chez l’habitant",
      "mobilhome", "appart’hôtel 5*", "Gîte", "Appartement entier", "Maison entière",
      "Appartement", "hôtel 1*", "camping", "chambre d’hôtes", "auberge de jeunesse 3*",
      "Gîte 4 pièces", "Appartement 4 pièces", "manoir", "ferme", "appart’hôtel 2*",
      "Chalet individuel", "auberge de jeunesse",
    ];
    const touches = types.filter((t) => motifChambre(t, "Chalet") != null);
    assert.deepEqual(touches, [
      "Chambre d’hôtes / B&B",
      "Ch. chez l’habitant",
      "chambre d’hôtes",
      "auberge de jeunesse 3*",
      "auberge de jeunesse",
    ]);
  });

  it("lit l'auberge de jeunesse dans le titre, mais jamais une chambre d'hôtes", () => {
    assert.equal(
      motifChambre(null, "Auberge De Jeunesse Hi Valdeblore - Le Chalet"),
      "auberge de jeunesse ou dortoir",
    );
    // Un nom n'est pas un type : « maison d'hôtes » dans un titre ne suffit pas.
    assert.equal(motifHorsSujet({ title: "Ancienne Maison D'hôtes Rénovée", propertyType: "maison" }), null);
    assert.equal(motifChambre("appartement", "Auberge Du Belvédère"), null);
  });
});

describe("hors de France", () => {
  const MORGINS = { lat: 46.24179077148437, lon: 6.851019859313965 };

  it("écarte « Charmant Logement à Morgins », à 256 m de Corbeau (Suisse)", () => {
    assert.ok(horsDeFrance(MORGINS.lat, MORGINS.lon));
    assert.equal(
      motifHorsSujet({ title: "Charmant Logement à Morgins", propertyType: "appartement", ...MORGINS }),
      "hors de France",
    );
  });

  it("garde Châtel, jusqu'au Pas de Morgins et à Super-Châtel", () => {
    for (const [titre, lat, lon] of [
      ["Résidence Joséphine", 46.26051712036133, 6.8342437744140625],
      // À 37 m du « Tapis de Super Yeti », qu'openskidata dit suisse.
      ["L'escale (Accès En Télécabine)", 46.26765441894531, 6.857572078704834],
      ["Ikaria - Chalet - Bo Immobilier - Châtel", 46.26266860961914, 6.841766834259033],
      ["Charming And Luxurious Chalet!", 46.25962829589844, 6.8421502113342285],
      ["4 Bdrm/4 Bath Duplex In Traditional Chatel Chalet", 46.27360153198242, 6.839799880981445],
    ] as const) {
      assert.ok(!horsDeFrance(lat, lon), titre);
    }
  });

  it("aucun point à 2 km des repères frontaliers ne sort", () => {
    const ids = [
      "chatel",
      "la-chapelle-dabondance",
      "avoriaz",
      "montgenevre",
      "val-cenis",
      "termignon",
      "la-rosiere-1850",
      "vallorcine",
      "porte-puymorens",
      "les-rousses",
    ];
    for (const id of ids) {
      const s = stationById(id);
      assert.ok(s, id);
      const sortis: string[] = [];
      for (let dy = -2000; dy <= 2000; dy += 200) {
        for (let dx = -2000; dx <= 2000; dx += 200) {
          const lat = s.lat + dy / 111_320;
          const lon = s.lon + dx / (111_320 * Math.cos((s.lat * Math.PI) / 180));
          if (metresBetween(s.lat, s.lon, lat, lon) > 2000) continue;
          if (horsDeFrance(lat, lon)) sortis.push(`${lat.toFixed(4)},${lon.toFixed(4)}`);
        }
      }
      assert.deepEqual(sortis, [], id);
    }
  });

  it("aucun repère de station n'est hors de France", () => {
    assert.deepEqual(
      STATIONS.filter((s) => horsDeFrance(s.lat, s.lon)).map((s) => s.id),
      [],
    );
  });

  it("sans position, rien ne se juge ; loin de toute frontière, rien ne sort", () => {
    assert.ok(!horsDeFrance(null, null));
    assert.ok(!horsDeFrance(Number.NaN, 6.85));
    const tignes = stationById("tignes");
    assert.ok(tignes && !horsDeFrance(tignes.lat, tignes.lon));
    assert.equal(GARE_ETRANGERE_MAX_M, 1000);
  });
});

describe("motifHorsSujet : le premier motif qui tranche", () => {
  it("un appartement de location ordinaire n'a aucun motif", () => {
    assert.equal(
      motifHorsSujet({
        title: "Grand Appartement Familial 8 à 10 Personnes",
        propertyType: "appartement",
        lat: 46.2963981628418,
        lon: 6.7845001220703125,
      }),
      null,
    );
  });

  it("l'hôtel passe avant le forfait compris", () => {
    assert.equal(
      motifHorsSujet({
        title: "Belambra Clubs Arc 2000 - L'aiguille Rouge - Ski Pass Included",
        propertyType: "hôtel 2*",
      }),
      "hôtel",
    );
  });
});
