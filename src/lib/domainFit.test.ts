import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attachAccess, formatLift } from "./access.ts";
import {
  domainFit,
  linkedSkiStations,
  memeLibelleNonReliees,
  nearestStationPin,
  otherDomainMessage,
  rejugerDomaine,
  stationIdFromText,
  stationsDeliees,
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
  guests: 8,
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
    // Le Fornet est une entrée du classeur depuis la bascule : son propre pin
    // est à 55 m. Ce qui compte reste qu’il relève de Val d’Isère, pas de
    // Bonneval, et que son domaine soit bien Tignes – Val d’Isère.
    const fornet = nearestStationPin(45.450318, 7.011062);
    assert.equal(fornet.station.id, "le-fornet");
    assert.equal(fornet.station.domain, "Tignes - Val d'Isère");
    assert.notEqual(fornet.station.id, "bonneval-sur-arc");
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
    guests: 6,
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
  it("Abondance n'est pas Morzine : le libellé Portes du Soleil ne suffit plus", () => {
    const abondance = stationById("abondance")!;
    assert.equal(abondance.domain, stationById("morzine")!.domain);
    const fit = domainFit(hermine, abondance);
    assert.equal(fit.nearestStationId, "morzine");
    assert.equal(fit.verdict, "other");
    // Dans les deux sens, et pour les cinq voisines de libellé.
    const auRepere = { lat: abondance.lat, lon: abondance.lon, title: "Chalet" };
    for (const id of ["morzine", "montriond", "avoriaz", "les-gets", "saint-jean-daulps"]) {
      assert.equal(memeLibelleNonReliees("abondance", id), true, id);
      assert.equal(domainFit(auRepere, stationById(id)!).verdict, "other", id);
    }
  });

  it("Abondance déliée de Châtel et de La Chapelle, Morzine–Avoriaz reliées par les pistes", () => {
    // Décision du propriétaire, 26 septembre 2026 : le seul forfait des Portes
    // du Soleil ne fait pas d'un logement de Châtel un logement d'Abondance.
    assert.equal(domainFit(chatel, stationById("abondance")!).verdict, "other");
    assert.equal(stationsDeliees("abondance", "chatel"), true);
    assert.equal(stationsDeliees("la-chapelle-dabondance", "abondance"), true);
    const chapelle = stationById("la-chapelle-dabondance")!;
    const auBourg = { lat: chapelle.lat, lon: chapelle.lon, title: "Chalet" };
    assert.equal(domainFit(auBourg, stationById("abondance")!).verdict, "other");
    // Entre elles, Châtel et La Chapelle restent reliées.
    assert.notEqual(domainFit(auBourg, stationById("chatel")!).verdict, "other");
    // La règle « même domaine » tient pour les autres stations du libellé.
    const avoriaz = stationById("avoriaz")!;
    const fit = domainFit(
      { lat: avoriaz.lat, lon: avoriaz.lon, title: "Studio" },
      stationById("morzine")!,
    );
    assert.equal(fit.verdict, "in");
  });

  it("La Bourboule, sans domaine, ne prend plus les logements du Mont-Dore", () => {
    const bourboule = stationById("la-bourboule")!;
    assert.equal(bourboule.domain, null);
    const fit = domainFit(montDore, bourboule);
    assert.equal(fit.nearestStationId, "le-mont-dore");
    assert.equal(fit.verdict, "other");
    assert.ok(!linkedSkiStations("la-bourboule").has("le-mont-dore"));
  });

  it("Lispach ne prend plus Gérardmer, et garde les siens", () => {
    const lispach = stationById("la-bresse-lispach")!;
    assert.equal(domainFit(gerardmer, lispach).verdict, "other");
    assert.equal(domainFit(capucine, lispach).verdict, "in");
  });

  it("le libellé sans nom ne fait pas un domaine : Beille n'est pas Névache", () => {
    // Même libellé « domaine non nommé (OpenStreetMap) », à 471 km.
    const nevache = stationById("nevache")!;
    const fit = domainFit(
      { lat: nevache.lat, lon: nevache.lon, title: "Gîte" },
      stationById("plateau-de-beille")!,
    );
    assert.equal(fit.nearestStationId, "nevache");
    assert.equal(fit.verdict, "other");
  });
});

describe("relevés déjà faits : le verdict est rejugé à la relecture", () => {
  it("une annonce de Morzine relevée pour Abondance en sort, et perd sa remontée", () => {
    // Enregistrée, elle passait : 718 m de Super-Morzine.
    assert.equal(dansLaStation(hermine), true);
    const l = remesurerRemontee(rejugerDomaine(hermine, stationById("abondance")));
    assert.equal(l.domainFit, "other");
    assert.equal(l.nearestDomainId, "morzine");
    assert.equal(l.distToLiftM, null);
    assert.equal(l.liftName, null);
    // La distance se rabat sur le repère d'Abondance, à 10,7 km : hors station.
    assert.equal(l.distToSlopesM, 10737);
    assert.equal(dansLaStation(l), false);
  });

  it("le Mont-Dore sort de La Bourboule, Gérardmer de Lispach", () => {
    const mont = remesurerRemontee(rejugerDomaine(montDore, stationById("la-bourboule")));
    assert.equal(mont.domainFit, "other");
    assert.equal(dansLaStation(mont), false);
    const ger = remesurerRemontee(rejugerDomaine(gerardmer, stationById("la-bresse-lispach")));
    assert.equal(ger.domainFit, "other");
    assert.equal(dansLaStation(ger), false);
  });

  it("Châtel sort d'un relevé d'Abondance, La Capucine reste à Lispach", () => {
    // Abondance et Châtel sont déliées (26 septembre 2026) : un logement de
    // Châtel relevé pour Abondance n'y compte plus.
    const c = remesurerRemontee(rejugerDomaine(chatel, stationById("abondance")));
    assert.equal(c.domainFit, "other");
    const g = remesurerRemontee(rejugerDomaine(capucine, stationById("la-bresse-lispach")));
    assert.equal(g.domainFit, "in");
    assert.equal(dansLaStation(g), true);
  });

  it("sans position ou sans station, rien n'est rejugé", () => {
    const sansGps = { ...hermine, lat: null, lon: null };
    assert.equal(rejugerDomaine(sansGps, stationById("abondance")), sansGps);
    assert.equal(rejugerDomaine(hermine, undefined), hermine);
  });
});
