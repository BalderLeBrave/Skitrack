import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import {
  distRemonteePublieeM,
  estPointPublie,
  mesuresPubliees,
  reperesNommes,
  situerManquants,
  placerSansPoint,
  type ContexteSituer,
} from "./situer.ts";
import { stationById } from "../stations.ts";
import { completudeOf } from "./completude.ts";
import { airbnbComplet, troisChampsAirbnb } from "./priseFiche.ts";
import { distanceOf } from "../v7.ts";
import { distFiltrableM } from "./lodgingFilter.ts";

function ann(over: Partial<Listing> = {}): Listing {
  return {
    id: "x",
    stationId: "les-2-alpes",
    title: "Annonce",
    source: "Booking",
    total: 0,
    currency: "EUR",
    capacity: null,
    bedrooms: null,
    available: true,
    photo: null,
    url: null,
    lat: null,
    lon: null,
    proven: "test",
    ...over,
  };
}

const ctx: ContexteSituer = {
  reperes: [{ nom: "Vénosc", lat: 45.001, lon: 6.111 }],
  station: { nom: "Les 2 Alpes", lat: 45.008, lon: 6.124 },
};

describe("toutes les sources : un point manquant est triangulé", () => {
  it("un GPS publié ne bouge pas, et n'est pas dit triangulé", () => {
    const pin = ann({ id: "b", source: "Abritel", lat: 45.5, lon: 6.5, locality: "Venosc" });
    const [sit] = situerManquants([pin], ctx);
    assert.equal(sit, pin);
    assert.equal(sit?.gpsSource, undefined);
  });

  it("un jumelage, un point de page et un point déjà triangulé restent en place", () => {
    const jum = ann({ id: "j", source: "Airbnb", lat: 45.1, lon: 6.2, gpsSource: "jumelage" });
    const page = ann({ id: "p", source: "Centrale", lat: 45.2, lon: 6.3, gpsSource: "pdp" });
    const carte = ann({
      id: "g",
      source: "Gîtes de France",
      lat: 45.02,
      lon: 6.14,
      gpsSource: "triangule",
      locality: "Venosc",
      proven: "tuile · position de la carte de recherche, sans GPS de fiche",
    });
    const sits = situerManquants([jum, page, carte], ctx);
    assert.equal(sits[0], jum);
    assert.equal(sits[1], page);
    assert.equal(sits[2], carte);
    assert.equal(sits[2]?.lat, 45.02);
  });

  it("sans point, le barycentre des GPS publiés du même lieu, toutes sources", () => {
    const a = ann({ id: "a", source: "Airbnb", lat: 45.02, lon: 6.1, locality: "Venosc" });
    const b = ann({ id: "b", source: "Gîtes de France", lat: 45.04, lon: 6.2, locality: "Vénosc" });
    const muet = ann({ id: "m", source: "HomeToGo", locality: "venosc" });
    const sits = situerManquants([a, b, muet], ctx);
    const cible = sits.find((x) => x.id === "m");
    assert.equal(cible?.lat, 45.03);
    assert.equal(cible?.lon, 6.15);
    assert.equal(cible?.gpsSource, "triangule");
    assert.match(cible?.proven ?? "", /barycentre de 2 annonces au GPS publié à venosc/);
    assert.equal(sits.find((x) => x.id === "a"), a);
  });

  it("un point triangulé n'ancre pas le barycentre", () => {
    const a = ann({ id: "a", source: "Airbnb", lat: 45.02, lon: 6.1, locality: "Venosc", gpsSource: "triangule" });
    const b = ann({ id: "b", source: "Airbnb", lat: 45.04, lon: 6.2, locality: "Venosc", gpsSource: "triangule" });
    const muet = ann({ id: "m", source: "Booking", locality: "Vénosc" });
    const sit = situerManquants([a, b, muet], ctx).find((x) => x.id === "m");
    assert.equal(sit?.lat, 45.001);
    assert.match(sit?.proven ?? "", /repère « Vénosc »/);
  });

  it("un seul GPS voisin ne suffit pas : le repère, sinon la station", () => {
    const seul = ann({ id: "a", source: "GreenGo", lat: 45.02, lon: 6.1, locality: "Venosc" });
    const muet = ann({ id: "m", source: "Centrale", locality: "Vénosc" });
    const sit = situerManquants([seul, muet], ctx).find((x) => x.id === "m");
    assert.equal(sit?.lat, 45.001);
    assert.equal(sit?.lon, 6.111);
    const [station] = situerManquants([ann({ id: "nu", source: "Abritel", locality: null })], ctx);
    assert.equal(station?.lat, 45.008);
    assert.equal(station?.lon, 6.124);
    assert.match(station?.proven ?? "", /station Les 2 Alpes/);
    assert.match(station?.proven ?? "", /aucun point publié pour cette annonce/);
  });

  it("deux annonces sans lieu ne se moyennent pas", () => {
    const a = ann({ id: "a", source: "Airbnb", lat: 45.02, lon: 6.1, locality: null });
    const muet = ann({ id: "m", source: "Booking", locality: "  " });
    const sit = situerManquants([a, ann({ id: "b", source: "Airbnb", lat: 45.04, lon: 6.2 }), muet], ctx).find(
      (x) => x.id === "m",
    );
    assert.equal(sit?.lat, 45.008);
    assert.doesNotMatch(sit?.proven ?? "", /barycentre/);
  });

  it("(0, 0) n'est pas un GPS : le repère du lieu le remplace", () => {
    const [sit] = situerManquants([ann({ lat: 0, lon: 0, locality: "Venosc", source: "Booking" })], ctx);
    assert.equal(sit?.lat, 45.001);
    assert.equal(sit?.gpsSource, "triangule");
  });

  it("un village du même nom écrase la station, et un second passage ne double pas la phrase", () => {
    const [une] = situerManquants([ann({ locality: "Les 2 Alpes", source: "Abritel" })], {
      reperes: [
        { nom: "Les 2 Alpes", lat: 45, lon: 6 },
        { nom: "Les 2 Alpes", lat: 45.01, lon: 6.12 },
      ],
      station: { nom: "Les 2 Alpes", lat: 44, lon: 6 },
    });
    assert.equal(une?.lat, 45.01);
    assert.equal(une?.lon, 6.12);
    const [deux] = situerManquants([une!], {
      reperes: [{ nom: "Les 2 Alpes", lat: 45.01, lon: 6.12 }],
      station: { nom: "Les 2 Alpes", lat: 44, lon: 6 },
    });
    assert.equal(deux, une);
    assert.equal(deux?.proven.match(/position triangulée/g)?.length, 1);
  });

  it("sans station plausible, l'annonce sans point reste sans point", () => {
    const nu = ann({ source: "HomeToGo" });
    const [sit] = situerManquants([nu], { reperes: [], station: { nom: "?", lat: 0, lon: 0 } });
    assert.equal(sit, nu);
  });

  it("le référentiel porte les villages et leurs alias", () => {
    const noms = new Map(reperesNommes().map((r) => [r.nom, r]));
    assert.equal(noms.get("Argentière")?.lat, 45.984);
    assert.equal(noms.get("Recoin")?.lat, 45.12526);
    assert.equal(noms.get("Recoin")?.lon, 5.87525);
  });
});

describe("placerSansPoint", () => {
  const station = stationById("les-2-alpes");

  it("un GPS publié n'est pas recalculé", () => {
    assert.ok(station);
    const pin = ann({ lat: 45.01, lon: 6.12, source: "Booking" });
    const [sit] = placerSansPoint([pin], station!);
    assert.equal(sit, pin);
  });

  it("sans point, la station, et l'accès mesuré depuis ce point", () => {
    assert.ok(station);
    const [sit] = placerSansPoint([ann({ locality: null, source: "Abritel" })], station!);
    assert.equal(sit?.lat, station!.lat);
    assert.equal(sit?.lon, station!.lon);
    assert.equal(sit?.gpsSource, "triangule");
    assert.equal(typeof sit?.distToSlopesM, "number");
  });
});

describe("une position triangulée n'est pas une donnée publiée", () => {
  const station = stationById("les-2-alpes");
  // Annonce Airbnb aux 2 Alpes : tout est publié sauf le point.
  const sansPoint = () =>
    ann({
      id: "abnb",
      source: "Airbnb",
      total: 900,
      capacity: 4,
      bedrooms: 1,
      photo: "https://a0.muscache.com/im/pictures/x.jpg",
      url: "https://www.airbnb.fr/rooms/1",
      locality: null,
    });

  it("avant comme après le placement : trou de GPS, distance non mesurée, position inconnue", () => {
    assert.ok(station);
    const brute = sansPoint();
    assert.deepEqual(completudeOf(brute).trous, ["gps"]);
    assert.equal(distanceOf(brute).kind, "no_coords");

    const [sit] = placerSansPoint([brute], station!);
    assert.equal(sit?.gpsSource, "triangule");
    // Le point placé mesure bien une remontée : c'est ce qu'il ne faut pas dire.
    assert.equal(typeof sit?.distToLiftM, "number");
    assert.deepEqual(completudeOf(sit!).trous, ["gps"]);
    assert.equal(completudeOf(sit!).ok, false);
    const d = distanceOf(sit!);
    assert.equal(d.kind, "triangulated");
    assert.doesNotMatch(d.text, /\d/);
    assert.equal(estPointPublie(sit!), false);
  });

  it("Airbnb : la fiche reste à lire, le GPS reste à combler", () => {
    assert.ok(station);
    const [sit] = placerSansPoint([sansPoint()], station!);
    assert.equal(airbnbComplet(sit!), false);
    assert.deepEqual(troisChampsAirbnb(sit!), ["gps"]);
    // Le même point publié par la source la rend complète.
    const publie = { ...sit!, gpsSource: null };
    assert.equal(airbnbComplet(publie), true);
  });

  it("mesuresPubliees : rien depuis un point triangulé, tout depuis un point publié", () => {
    assert.ok(station);
    const [sit] = placerSansPoint([sansPoint()], station!);
    const m = mesuresPubliees(sit!);
    assert.equal(m.lat, sit!.lat);
    assert.equal(m.distToLiftM, null);
    assert.equal(m.distToSlopesM, null);
    assert.equal(m.liftName, null);
    const pin = ann({ lat: 45.01, lon: 6.12, distToLiftM: 120 });
    assert.equal(mesuresPubliees(pin), pin);
  });

  it("filtre et tri par distance : rien depuis un point triangulé, la mesure depuis un point publié", () => {
    assert.ok(station);
    const brute = sansPoint();
    const [sit] = placerSansPoint([brute], station!);
    // Le point placé donne bien une distance : le filtre ne doit pas la lire.
    assert.equal(typeof distFiltrableM(sit!), "number");
    assert.equal(distRemonteePublieeM(sit!), null);
    // Comme l'annonce avant placement.
    assert.equal(distRemonteePublieeM(brute), distFiltrableM(brute));
    const pin = ann({ lat: 45.01, lon: 6.12, distToLiftM: 120 });
    assert.equal(distRemonteePublieeM(pin), 120);
  });
});
