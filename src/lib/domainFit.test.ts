import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attachAccess, formatLift } from "./access.ts";
import {
  domainFit,
  linkedSkiStations,
  nearestStationPin,
  otherDomainMessage,
  rejugerDomaine,
  stationIdFromText,
  winterBarrier,
} from "./domainFit.ts";
import type { Listing } from "./listings.ts";
import { dansLaStation, remesurerRemontee } from "./prix/calcul.ts";
import { stationById } from "./stations.ts";

const val = () => stationById("val-disere")!;
const pastourelle = {
  id: "p5797537a",
  stationId: "val-disere",
  title: "Maison de vacances « La Pastourelle 1 », au pied des pistes",
  source: "Abritel" as const,
  total: 1,
  currency: "EUR" as const,
  capacity: 8,
  bedrooms: 4,
  available: true as const,
  photo: null,
  url: "https://www.abritel.fr/location-vacances/p5797537a",
  lat: 45.371686,
  lon: 7.046794,
  locality: "Bonneval-sur-Arc",
  proven: "fixture Iseran",
};

describe("domaine skiable ≠ rayon kilométrique", () => {
  it("Le Fornet est Val d’Isère, pas Bonneval", () => {
    assert.equal(stationIdFromText("Chalet au Fornet"), "val-disere");
    // Le Fornet a été une entrée du classeur ; depuis le 5 octobre 2026 c'est
    // un village de Val d'Isère (`villages.ts`). Son repère, à 1,3 km, rattache
    // à Val d'Isère, pas à Bonneval.
    const fornet = nearestStationPin(45.450318, 7.011062);
    assert.equal(fornet.station.id, "val-disere");
    assert.equal(fornet.station.domain, "Tignes - Val d'Isère");
    const fit = domainFit({ lat: 45.450318, lon: 7.011062, title: "Le Fornet" }, val());
    assert.equal(fit.verdict, "in");
  });

  it("Pastourelle / Bonneval n’est pas Val d’Isère : Iseran fermé", () => {
    const fit = domainFit(pastourelle, val());
    assert.equal(fit.nearestStationId, "bonneval-sur-arc");
    assert.equal(fit.verdict, "other");
    assert.equal(fit.winterBarrier, "col de l’Iseran");
    assert.ok((fit.distToSearchedPinM ?? 0) > 4000);
    const msg = otherDomainMessage(fit, "Val d'Isère")!;
    assert.ok(msg.includes("Bonneval"));
    assert.ok(msg.includes("Iseran"));
    assert.ok(!msg.toLowerCase().includes("fornet") || msg.includes("Pas"));
    assert.equal(
      msg,
      "Autre domaine : Bonneval-sur-Arc. Ce logement n’est pas à Val d'Isère : le col de l’Iseran est fermé l’hiver, et il n’y a ni liaison à ski ni route directe.",
    );
  });

  it("le message d'autre domaine accorde la préposition au nom de la station", () => {
    const msg = otherDomainMessage(
      {
        searchedId: "les-arcs",
        nearestStationId: "valmorel",
        nearestStationName: "Valmorel",
        villageId: null,
        via: "coordonnees",
        motif: null,
        distToSearchedPinM: null,
        distToNearestPinM: null,
        verdict: "other",
        winterBarrier: null,
      },
      "Les Arcs",
    );
    assert.equal(msg, "Autre domaine : Valmorel. Ce logement n’est ni aux Arcs ni sur un domaine relié en saison.");
  });

  it("attachAccess : pas 5000 m des remontées de Val d’Isère", () => {
    const row = attachAccess(pastourelle, val());
    assert.equal(row.domainFit, "other");
    // La fiche porte désormais la typographie de la commune INSEE, traits
    // d'union compris : « Bonneval-sur-Arc », et non « Bonneval sur Arc ».
    assert.equal(row.nearestDomainName, "Bonneval-sur-Arc");
    assert.equal(row.distToLiftM, null);
    assert.equal(formatLift(row), "Remontée non mesurée");
    assert.ok((row.searchedLiftM ?? 0) > 4000);
    assert.ok((row.distToNearestDomainM ?? 9999) < 400);
  });

  it("Tignes reste relié à Val d’Isère (Espace Killy)", () => {
    assert.ok(linkedSkiStations("val-disere").has("tignes"));
    assert.ok(!linkedSkiStations("val-disere").has("bonneval-sur-arc"));
    const fit = domainFit({ lat: 45.469, lon: 6.907, title: "Tignes le Lac" }, val());
    assert.equal(fit.verdict, "linked");
    assert.equal(winterBarrier("val-disere", "tignes"), null);
  });

  it("texte Bonneval sans GPS suffit à écarter", () => {
    const fit = domainFit(
      { title: "La Pastourelle 1", locality: "Bonneval-sur-Arc" },
      val(),
    );
    assert.equal(fit.verdict, "other");
    assert.equal(fit.nearestStationId, "bonneval-sur-arc");
  });
});

/** Une annonce telle qu'un relevé l'a enregistrée : verdict et remontée du
 *  jour du relevé. Les cinq viennent des relevés du propriétaire du
 *  25 septembre 2026 (séjour du 26 décembre, 7 nuits, 6 personnes). */
function enregistree(p: Partial<Listing> & Pick<Listing, "id" | "stationId" | "title">): Listing {
  return {
    source: "Airbnb",
    total: 2000,
    currency: "EUR",
    capacity: 6,
    bedrooms: 3,
    available: true,
    photo: null,
    url: null,
    lat: null,
    lon: null,
    proven: "relevé du 25 septembre 2026",
    ...p,
  };
}

const hermine = enregistree({
  id: "abnb-102547239",
  stationId: "abondance",
  title: "Appartement Hermine - 4 Personnes - Morzine",
  total: 2740,
  lat: 46.18437957763672,
  lon: 6.712785243988037,
  locality: "Morzine est à 11 km de Abondance",
  domainFit: "in",
  nearestDomainId: "morzine",
  distToSlopesM: 10737,
  distToLiftM: 718,
  liftName: "Super-Morzine",
  liftKind: "gondola",
  liftLat: 46.183545,
  liftLon: 6.703537,
});

const chatel = enregistree({
  id: "abnb-4956241",
  stationId: "abondance",
  title: "Appartement ⋅ Châtel",
  total: 2653,
  lat: 46.25587,
  lon: 6.84124,
  domainFit: "linked",
  nearestDomainId: "chatel",
  distToSlopesM: 9701,
  distToLiftM: 179,
  liftName: "Gabelou",
  liftKind: "chair_lift",
  liftLat: 46.25486,
  liftLon: 6.84305,
});

const montDore = enregistree({
  id: "abnb-106877745",
  stationId: "la-bourboule",
  title: "Appartement Mont-dore, 4 Pièces, 6 Pers.",
  total: 1142,
  lat: 45.577701568603516,
  lon: 2.8064000606536865,
  locality: "Mont-Dore est à 5.4 km de La Bourboule",
  domainFit: "in",
  nearestDomainId: "le-mont-dore",
  distToSlopesM: 4727,
  distToLiftM: 749,
  liftName: "Capucin",
  liftKind: "funicular",
  liftLat: 45.571252,
  liftLon: 2.809191,
});

const gerardmer = enregistree({
  id: "abnb-62576991",
  stationId: "la-bresse-lispach",
  title: "Au Coeur De Gerardmer, Bel Appartement Rénové",
  total: 1415,
  lat: 48.0713005065918,
  lon: 6.872700214385986,
  locality: "Gérardmer est à 5.6 km de Lac de Lispach",
  domainFit: "in",
  nearestDomainId: "gerardmer",
  distToSlopesM: 5625,
  distToLiftM: 1965,
  liftName: "Pré Didier",
  liftKind: "rope_tow",
  liftLat: 48.058725,
  liftLon: 6.891287,
});

const capucine = enregistree({
  id: "abr-68549863",
  stationId: "la-bresse-lispach",
  source: "Abritel",
  title: "Gîte « La Capucine » - La Bresse - 6 Personnes",
  total: 1096,
  lat: 48.03860855102539,
  lon: 6.927618026733398,
  locality: "1.7 km Lac de Lispach",
  domainFit: "in",
  nearestDomainId: "la-bresse-lispach",
  distToSlopesM: 1757,
  distToLiftM: 1147,
  liftName: "Hêtres 1",
  liftKind: "drag_lift",
  liftLat: 48.041922,
  liftLon: 6.913006,
});

describe("même libellé de domaine, pas le même domaine", () => {
  it("Abondance est sur les Portes du Soleil : un logement de Morzine y est relié, et reste à Morzine", () => {
    // Déliée le 26 septembre 2026, rendue aux Portes du Soleil par le
    // propriétaire le 5 octobre (`grandsDomaines.ts`). Le domaine relié ne
    // déplace pas le logement : il est à Morzine.
    const abondance = stationById("abondance")!;
    const fit = domainFit(hermine, abondance);
    assert.equal(fit.nearestStationId, "morzine");
    assert.equal(fit.verdict, "linked");
    // Dans les deux sens, et pour les autres stations du domaine.
    const auRepere = { lat: abondance.lat, lon: abondance.lon, title: "Chalet" };
    for (const id of ["morzine", "montriond", "avoriaz", "les-gets", "saint-jean-daulps", "chatel"]) {
      assert.equal(domainFit(auRepere, stationById(id)!).verdict, "linked", id);
    }
  });

  it("Châtel, La Chapelle et Abondance reliées, Morzine–Avoriaz aussi", () => {
    assert.equal(domainFit(chatel, stationById("abondance")!).verdict, "linked");
    const chapelle = stationById("la-chapelle-dabondance")!;
    const auBourg = { lat: chapelle.lat, lon: chapelle.lon, title: "Chalet" };
    assert.equal(domainFit(auBourg, stationById("abondance")!).verdict, "linked");
    assert.equal(domainFit(auBourg, stationById("chatel")!).verdict, "linked");
    // Avoriaz est une autre station que Morzine, sur le même grand domaine
    // relié : le logement est d'Avoriaz, relié à Morzine.
    const avoriaz = stationById("avoriaz")!;
    const fit = domainFit({ lat: avoriaz.lat, lon: avoriaz.lon, title: "Studio" }, stationById("morzine")!);
    assert.equal(fit.nearestStationId, "avoriaz");
    assert.equal(fit.verdict, "linked");
  });

  it("La Bourboule n'est plus une station : son identifiant ne résout plus rien", () => {
    // Sans fiche Skiinfo, sortie du référentiel le 5 octobre 2026. Un
    // logement du Mont-Dore est au Mont-Dore.
    assert.equal(stationById("la-bourboule"), undefined);
    const fit = domainFit(montDore, stationById("le-mont-dore")!);
    assert.equal(fit.nearestStationId, "le-mont-dore");
    assert.equal(fit.verdict, "in");
  });

  it("Lispach ne prend plus Gérardmer, et garde les siens", () => {
    const lispach = stationById("la-bresse-lispach")!;
    assert.equal(domainFit(gerardmer, lispach).verdict, "other");
    assert.equal(domainFit(capucine, lispach).verdict, "in");
  });

  it("le libellé sans nom ne fait pas un domaine : Beille n'est pas Saint-Colomban", () => {
    // Même libellé « domaine non nommé (OpenStreetMap) », à 462 km.
    const colomban = stationById("saint-colomban-villards")!;
    const fit = domainFit(
      { lat: colomban.lat, lon: colomban.lon, title: "Gîte" },
      stationById("plateau-de-beille")!,
    );
    assert.equal(fit.nearestStationId, "saint-colomban-villards");
    assert.equal(fit.verdict, "other");
  });
});

describe("relevés déjà faits : le verdict est rejugé à la relecture", () => {
  it("une annonce de Morzine relevée pour Abondance reste, reliée, et garde sa remontée", () => {
    // Enregistrée « in » ; rejugée « linked » depuis le 5 octobre 2026, à sa
    // station, Morzine : 718 m de Super-Morzine.
    assert.equal(dansLaStation(hermine), true);
    const l = remesurerRemontee(rejugerDomaine(hermine, stationById("abondance")));
    assert.equal(l.domainFit, "linked");
    assert.equal(l.nearestDomainId, "morzine");
    assert.equal(l.rattachementVia, "coordonnees");
    assert.equal(dansLaStation(l), true);
  });

  it("une annonce d'un autre domaine sort du relevé, et perd sa remontée", () => {
    // Un logement de Morzine relevé pour Flaine (Grand Massif) n'y est pas.
    const l = remesurerRemontee(rejugerDomaine({ ...hermine, stationId: "flaine" }, stationById("flaine")));
    assert.equal(l.domainFit, "other");
    assert.equal(l.nearestDomainId, "morzine");
    assert.equal(l.distToLiftM, null);
    assert.equal(l.liftName, null);
    assert.equal(dansLaStation(l), false);
  });

  it("Gérardmer sort de Lispach", () => {
    const ger = remesurerRemontee(rejugerDomaine(gerardmer, stationById("la-bresse-lispach")));
    assert.equal(ger.domainFit, "other");
    assert.equal(dansLaStation(ger), false);
  });

  it("Châtel reste dans un relevé d'Abondance, La Capucine reste à Lispach", () => {
    const c = remesurerRemontee(rejugerDomaine(chatel, stationById("abondance")));
    assert.equal(c.domainFit, "linked");
    assert.equal(c.nearestDomainId, "chatel");
    const g = remesurerRemontee(rejugerDomaine(capucine, stationById("la-bresse-lispach")));
    assert.equal(g.domainFit, "in");
    assert.equal(dansLaStation(g), true);
  });

  it("sans position, le rattachement se refait par la localité et le texte ; sans station, rien", () => {
    // Depuis le 5 octobre 2026, le rattachement se recalcule à chaque
    // relecture, position ou pas : « Morzine est à 11 km de Abondance » est
    // à Morzine.
    const sansGps = { ...hermine, lat: null, lon: null };
    const l = rejugerDomaine(sansGps, stationById("abondance"));
    assert.equal(l.nearestDomainId, "morzine");
    assert.equal(l.rattachementVia, "texte");
    assert.equal(l.domainFit, "linked");
    assert.equal(rejugerDomaine(hermine, undefined), hermine);
  });
});
