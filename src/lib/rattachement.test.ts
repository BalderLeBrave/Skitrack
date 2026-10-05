import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { foldName, nomCorrespond } from "./carte.ts";
import { domainFit } from "./domainFit.ts";
import { GRANDS_DOMAINES, grandDomaineDe, memeGrandDomaine } from "./grandsDomaines.ts";
import { localiteNette, rattacher, repereLePlusProche } from "./rattachement.ts";
import { SKIINFO } from "./skiinfo.ts";
import { rangerParStation } from "./stay/parStation.ts";
import { STATIONS, stationById } from "./stations.ts";
import {
  ALIAS_SKIINFO,
  FUSIONS,
  RATTACHEMENT_MAX_KM,
  STATIONS_AJOUTEES,
  STATIONS_SANS_FICHE,
  VILLAGES,
} from "./villages.ts";

const station = (id: string) => {
  const s = stationById(id);
  if (!s) throw new Error(`station absente : ${id}`);
  return s;
};

describe("la table : une station, une fiche Skiinfo", () => {
  it("chaque station a sa fiche Skiinfo, sauf deux exceptions nommées ; chaque village une station", () => {
    // Val d'Ese et Haut Asco, que Skiinfo cite sans fiche, sont gardées par
    // décision du propriétaire (5 octobre 2026).
    const sansFiche = STATIONS_AJOUTEES.filter((a) => a.ficheSkiinfo === null).map((a) => a.id);
    assert.deepEqual(sansFiche, ["val-d-ese", "haut-asco"]);
    const ajoutees = new Set(STATIONS_AJOUTEES.map((a) => a.id));
    for (const s of STATIONS) assert.ok(SKIINFO[s.id] || ajoutees.has(s.id), s.id);
    for (const v of VILLAGES) {
      assert.ok(
        STATIONS.some((s) => s.id === v.station),
        `${v.id} → ${v.station}`,
      );
      assert.ok(!STATIONS.some((s) => s.id === v.id), `${v.id} est encore une station`);
    }
    assert.equal(VILLAGES.length, 65);
    assert.equal(STATIONS_SANS_FICHE.length, 17);
    assert.equal(new Set(VILLAGES.map((v) => v.id)).size, VILLAGES.length);
  });

  it("un ancien identifiant se lit sous sa station, sans migration ; une ligne retirée ne résout plus rien", () => {
    assert.equal(stationById("plagne-centre")?.id, "la-plagne");
    assert.equal(stationById("termignon")?.id, "val-cenis");
    assert.equal(stationById("lanslevillard")?.id, "val-cenis");
    assert.equal(stationById("reberty")?.id, "les-menuires");
    assert.equal(stationById("le-barioz-alpin")?.id, "les-7-laux");
    assert.equal(stationById("hauteluce-val-joly")?.id, "les-contamines-montjoie");
    for (const [ancien, garde] of Object.entries({ ...FUSIONS, ...ALIAS_SKIINFO })) {
      assert.equal(stationById(ancien)?.id, garde, ancien);
    }
    for (const s of STATIONS_SANS_FICHE) assert.equal(stationById(s.id), undefined, s.id);
  });

  it("les villages qui ont leur propre fiche restent des stations", () => {
    for (const id of [
      "montchavin-les-coches",
      "champagny-en-vanoise",
      "peisey-vallandry",
      "saint-martin-de-belleville",
      "brides-les-bains",
      "bramans",
      "aussois",
      "sollieres-sardieres",
    ]) {
      assert.equal(stationById(id)?.id, id, id);
    }
  });

  it("chaque village est à moins de RATTACHEMENT_MAX_KM du repère de sa station", () => {
    for (const v of VILLAGES) {
      const s = station(v.station);
      const r = repereLePlusProche(s.lat, s.lon);
      assert.equal(r.stationId, s.id, `${s.id} : son repère rattache à elle-même`);
      const km = Math.hypot((v.lat - s.lat) * 111, (v.lon - s.lon) * 78);
      assert.ok(km <= RATTACHEMENT_MAX_KM + 1, `${v.id} : ${km.toFixed(1)} km de ${s.id}`);
    }
  });
});

describe("rattachement d'un logement : localité, puis coordonnées, puis texte", () => {
  it("la localité publiée d'abord, par la table : Val Claret est Tignes", () => {
    const r = rattacher({ locality: "Val Claret", lat: 45.5075, lon: 6.677 });
    assert.equal(r.stationId, "tignes");
    assert.equal(r.villageId, "tignes-val-claret");
    assert.equal(r.via, "localite");
  });

  it("une localité qui n'est qu'une commune partagée ne prouve rien : on passe aux coordonnées", () => {
    // Avoriaz est sur la commune de Morzine ; Montchavin sur celle de La
    // Plagne Tarentaise ; Sollières-Sardières sur celle de Val-Cenis.
    const avoriaz = station("avoriaz");
    const r = rattacher({ locality: "Morzine", lat: avoriaz.lat, lon: avoriaz.lon });
    assert.equal(r.stationId, "avoriaz");
    assert.equal(r.via, "coordonnees");
    const s = station("sollieres-sardieres");
    assert.equal(
      rattacher({ locality: "Val-Cenis", lat: s.lat, lon: s.lon }).stationId,
      "sollieres-sardieres",
    );
  });

  it("la phrase de distance d'Airbnb n'est pas une localité", () => {
    assert.equal(localiteNette("Morzine est à 11 km de Abondance"), "Morzine");
    assert.equal(localiteNette("1.7 km Lac de Lispach"), null);
    assert.equal(localiteNette("Les Deux Alpes"), "Les Deux Alpes");
    // « Bourg-Saint-Maurice est à 12 km de Les Arcs » ne rattache pas aux Arcs.
    assert.equal(
      rattacher({ locality: "Bourg-Saint-Maurice est à 12 km de Les Arcs" }).stationId,
      null,
    );
  });

  it("les coordonnées : le repère le plus proche, un village valant sa station", () => {
    // Reberty était plus proche de Val Thorens que du repère des Menuires,
    // posé à Saint-Martin : le repère revu le rend aux Menuires.
    const reberty = rattacher({ lat: 45.31455, lon: 6.54458 });
    assert.equal(reberty.stationId, "les-menuires");
    assert.equal(reberty.villageId, "reberty");
    // Plagne Centre allait à Champagny ; c'est La Plagne.
    assert.equal(rattacher({ lat: 45.5075, lon: 6.677 }).stationId, "la-plagne");
  });

  it("au-delà de 12 km de tout repère, aucun rattachement, et le motif le dit", () => {
    const r = rattacher({ lat: 43.2965, lon: 5.3698, title: "Appartement à Tignes" });
    assert.equal(r.stationId, null);
    assert.equal(r.motif, "trop-loin");
    assert.ok((r.distanceM ?? 0) > RATTACHEMENT_MAX_KM * 1000);
  });

  it("sans coordonnées, le texte ; sans rien, « sans lieu »", () => {
    const r = rattacher({ title: "Studio skis aux pieds Arc 1800" });
    assert.equal(r.stationId, "les-arcs-bourg-st-maurice");
    assert.equal(r.via, "texte");
    const rien = rattacher({ title: "Bel appartement lumineux" });
    assert.equal(rien.stationId, null);
    assert.equal(rien.motif, "sans-lieu");
  });
});

describe("grands domaines reliés : une couche à part, la même table partout", () => {
  it("chaque membre est une station, aucune n'est dans deux domaines", () => {
    const vues = new Set<string>();
    for (const d of GRANDS_DOMAINES) {
      for (const id of d.stations) assert.equal(stationById(id)?.id, id, `${d.nom} : ${id}`);
      for (const id of d.stations) {
        assert.ok(!vues.has(id), `${id} dans deux domaines`);
        vues.add(id);
      }
    }
  });

  it("un forfait commercial ne relie pas : Val Cenis n'est pas Aussois", () => {
    assert.equal(grandDomaineDe("val-cenis"), undefined);
    assert.equal(memeGrandDomaine("val-cenis", "aussois"), false);
    const aussois = station("aussois");
    const fit = domainFit(
      { lat: aussois.lat, lon: aussois.lon, title: "Chalet" },
      station("val-cenis"),
    );
    assert.equal(fit.verdict, "other");
  });

  it("dans le domaine relié, le logement reste à sa station : Peisey relié à La Plagne", () => {
    const peisey = station("peisey-vallandry");
    const fit = domainFit(
      { lat: peisey.lat, lon: peisey.lon, title: "Chalet" },
      station("la-plagne"),
    );
    assert.equal(fit.nearestStationId, "peisey-vallandry");
    assert.equal(fit.verdict, "linked");
    // Un village de La Plagne est La Plagne : Belle Plagne.
    const belle = domainFit({ lat: 45.5128, lon: 6.706, title: "Studio" }, station("la-plagne"));
    assert.equal(belle.verdict, "in");
    assert.equal(belle.villageId, "belle-plagne");
  });

  it("l'écran du domaine range les logements par station, chacun une seule fois", () => {
    const nom = (id: string) => stationById(id)?.name ?? id;
    const ls = [
      { id: "a", nearestDomainId: "peisey-vallandry" },
      { id: "b", nearestDomainId: "la-plagne" },
      { id: "c", nearestDomainId: "champagny-en-vanoise" },
      { id: "b", nearestDomainId: "la-plagne" },
      { id: "d", nearestDomainId: "la-plagne" },
    ];
    assert.deepEqual(
      rangerParStation(ls, "la-plagne", nom).map((l) => l.id),
      ["b", "d", "c", "a"],
    );
  });
});

describe("recherche par nom : un village renvoie à sa station", () => {
  it("« Val Claret » trouve Tignes, « Plagne Centre » La Plagne", () => {
    const trouve = (q: string) =>
      STATIONS.filter((s) => nomCorrespond(s, foldName(q))).map((s) => s.id);
    assert.ok(trouve("Val Claret").includes("tignes"));
    assert.ok(trouve("Plagne Centre").includes("la-plagne"));
    assert.ok(trouve("lanslebourg").includes("val-cenis"));
  });
});
