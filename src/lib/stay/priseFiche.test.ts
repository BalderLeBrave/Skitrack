import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import {
  choisirFiches,
  clePage,
  cleUrl,
  disjoncteur,
  ecrireLaissees,
  estPageDeSite,
  raisonDeLaisser,
  trousDe,
  urlPropre,
  urlsPartagees,
} from "./priseFiche.ts";

function annonce(extra: Partial<Listing> = {}): Listing {
  return {
    id: "x",
    stationId: "avoriaz",
    title: "Studio pied des pistes",
    source: "Abritel",
    total: 900,
    currency: "EUR",
    guests: 4,
    bedrooms: 1,
    available: true,
    photo: null,
    url: null,
    lat: 46.19,
    lon: 6.77,
    proven: "test",
    ...extra,
  };
}

const ABRITEL = "https://www.abritel.fr/location-vacances/p2125874";
const BOOKING = "https://www.booking.com/hotel/fr/les-tilleuls-le-biot.html";
const AIRBNB = "https://www.airbnb.fr/rooms/10673653";
const GITES = "https://widget.itea.fr/widget.php?code=H74G000123";

describe("trous d'une annonce", () => {
  it("nomme capacité, chambres, GPS et titre-fichier", () => {
    assert.deepEqual(trousDe(annonce()), []);
    assert.deepEqual(
      trousDe(annonce({ guests: null, bedrooms: null, lat: null, lon: null, title: "IMG_4021.jpg" })),
      ["capacite", "chambres", "gps", "titre"],
    );
  });

  it("des pièces tiennent lieu de chambres, pas un zéro", () => {
    assert.deepEqual(trousDe(annonce({ bedrooms: null, rooms: 2 })), []);
    assert.deepEqual(trousDe(annonce({ bedrooms: null, rooms: 0 })), ["chambres"]);
  });
});

describe("ouvrir une fiche seulement si elle peut combler", () => {
  it("Booking en HTTP simple ne rend qu'un défi : jamais ouvert", () => {
    assert.equal(raisonDeLaisser(annonce({ source: "Booking", guests: null }), BOOKING), "booking.com");
    assert.equal(raisonDeLaisser(annonce({ source: "Booking", lat: null, lon: null }), BOOKING), "booking.com");
  });

  it("Abritel publie le GPS et le titre, ni capacité ni chambres", () => {
    assert.equal(raisonDeLaisser(annonce({ guests: null }), ABRITEL), "abritel.fr");
    assert.equal(raisonDeLaisser(annonce({ guests: null, bedrooms: null }), ABRITEL), "abritel.fr");
    assert.equal(raisonDeLaisser(annonce({ guests: null, lat: null, lon: null }), ABRITEL), null);
    assert.equal(raisonDeLaisser(annonce({ title: "photos_ab12_1234" }), ABRITEL), null);
  });

  it("Airbnb : rooms/ seulement pour un GPS vide, comme avant", () => {
    const sansCap = annonce({ source: "Airbnb", guests: null, bedrooms: null });
    assert.equal(raisonDeLaisser(sansCap, AIRBNB), "Airbnb avec GPS");
    assert.equal(raisonDeLaisser({ ...sansCap, lat: null, lon: null }, AIRBNB), null);
  });

  it("une page hôte GreenGo n'est jamais ouverte : seule l'API de détail est sûre", () => {
    const hote = "https://www.greengo.voyage/hote/chalet-paradis-blanc?checkIn=2027-02-06&checkOut=2027-02-13&numberOfAdults=2";
    assert.equal(raisonDeLaisser(annonce({ source: "GreenGo", guests: null, bedrooms: null }), hote), "greengo.voyage");
  });

  it("Gîtes et hôte inconnu restent ouverts", () => {
    assert.equal(raisonDeLaisser(annonce({ source: "Gîtes de France" }), GITES), null);
    assert.equal(
      raisonDeLaisser(annonce({ source: "Centrale", guests: null }), "https://reservation.exemple.fr/fiche/12"),
      null,
    );
  });
});

describe("une URL commune n'est jamais prise pour une fiche", () => {
  const ACCUEIL = "https://www.pralognan-reservation.com/";
  const FERATEL = "https://reservation.laclusaz.com/reservation/hebergements";
  const FICHE = "https://reservation.les2alpes.com/chalet-neve-chalet-8-personnes-les-2-alpes.html";

  it("la racine et la page de recherche ne décrivent aucun logement", () => {
    assert.equal(estPageDeSite(ACCUEIL), true);
    assert.equal(estPageDeSite("https://www.exemple.fr"), true);
    assert.equal(estPageDeSite("https://www.exemple.fr/fr/"), true);
    assert.equal(estPageDeSite("https://www.exemple.fr/index.php?lang=fr"), true);
    assert.equal(estPageDeSite(FERATEL), true);
    assert.equal(estPageDeSite("https://www.exemple.fr/fr/recherche?dates=2027-02-06"), true);
    assert.equal(estPageDeSite(FICHE), false);
    assert.equal(estPageDeSite("https://reservation.exemple.fr/fiche/12"), false);
    assert.equal(estPageDeSite("https://www.exemple.fr/hebergements/chalet-des-cimes"), false);
    assert.equal(estPageDeSite(ABRITEL), false);
  });

  it("une URL portée par deux annonces du lot est commune, pas celle d'une seule", () => {
    const rows = [
      annonce({ id: "a", source: "Centrale", url: `${FICHE}#photos` }),
      annonce({ id: "b", source: "Centrale", url: FICHE }),
      annonce({ id: "c", source: "Centrale", url: "https://reservation.les2alpes.com/autre.html" }),
      annonce({ id: "d", source: "Airbnb", url: AIRBNB }),
      annonce({ id: "e", source: "Airbnb", url: AIRBNB }),
    ];
    const communes = urlsPartagees(rows, urlPropre);
    assert.deepEqual([...communes], [cleUrl(FICHE)]);
  });

  it("une même annonce rendue deux fois ne fait pas une URL commune", () => {
    const rows = [annonce({ id: "a", url: ABRITEL }), annonce({ id: "a", url: ABRITEL })];
    assert.equal(urlsPartagees(rows, (l) => l.url).size, 0);
  });

  it("iResa : deux fiches qui ne diffèrent que par la requête restent distinctes", () => {
    assert.notEqual(
      cleUrl("https://www.lesarcs.com/residence?package=12"),
      cleUrl("https://www.lesarcs.com/residence?package=13"),
    );
    assert.equal(cleUrl("https://WWW.Exemple.fr/a/"), cleUrl("https://www.exemple.fr/a#b"));
  });

  it("clé de page : la requête reste, sauf les paramètres de dates connus", () => {
    // iResa : deux packages, deux fiches.
    assert.notEqual(
      clePage("https://www.lesarcs.com/residence?package=12"),
      clePage("https://www.lesarcs.com/residence?package=13"),
    );
    // La même fiche à d'autres dates : Abritel, Airbnb, Open System, Gîtes.
    assert.equal(
      clePage("https://www.abritel.fr/location-vacances/p9?startDate=2027-02-06&chkin=2027-02-06&endDate=2027-02-13&chkout=2027-02-13&adults=8"),
      clePage("https://www.abritel.fr/location-vacances/p9?startDate=2027-02-13&chkin=2027-02-13&endDate=2027-02-20&chkout=2027-02-20&adults=8"),
    );
    assert.equal(
      clePage("https://www.airbnb.fr/rooms/42?check_in=2027-02-06&check_out=2027-02-13"),
      clePage("https://www.airbnb.fr/rooms/42"),
    );
    assert.equal(
      clePage("https://resa.exemple.fr/fiche/7?DateRecherche=2027-02-06%7C2027-02-13"),
      clePage("https://resa.exemple.fr/fiche/7/"),
    );
    assert.equal(
      clePage("https://www.gites-de-france.com/fr/g1?adults=4&date-start=2027-02-06&date-end=2027-02-13"),
      clePage("https://www.gites-de-france.com/fr/g1?adults=4"),
    );
    // Le groupe n'est pas une date : il reste.
    assert.notEqual(
      clePage("https://www.abritel.fr/location-vacances/p9?adults=8"),
      clePage("https://www.abritel.fr/location-vacances/p9?adults=6"),
    );
    assert.equal(clePage("pas une URL"), cleUrl("pas une URL"));
  });

  it("laissée pour « URL commune », même trouée", () => {
    const trouee = annonce({ source: "Centrale", guests: null, lat: null, lon: null });
    assert.equal(raisonDeLaisser(trouee, ACCUEIL), "URL commune");
    assert.equal(raisonDeLaisser(trouee, FICHE, new Set([cleUrl(FICHE)])), "URL commune");
    assert.equal(raisonDeLaisser(trouee, FICHE, new Set()), null);
    const { aLire, laissees } = choisirFiches(
      [trouee, { ...trouee, id: "y", url: FERATEL }],
      (l) => l.url ?? FICHE,
      new Set([cleUrl(FICHE)]),
    );
    assert.equal(aLire.length, 0);
    assert.equal(laissees.get("URL commune"), 2);
  });

  it("Airbnb et Gîtes ne sont pas concernés : leur fiche vient de leur identifiant", () => {
    assert.equal(raisonDeLaisser(annonce({ source: "Gîtes de France" }), GITES, new Set([cleUrl(GITES)])), null);
    assert.equal(urlPropre(annonce({ source: "Gîtes de France", url: GITES })), null);
  });
});

describe("choisir avant de borner", () => {
  it("les Airbnb à GPS ne prennent plus la place des fiches qu'on ouvre", () => {
    const airbnbs = Array.from({ length: 170 }, (_, i) =>
      annonce({ id: `a${i}`, source: "Airbnb", guests: null, bedrooms: null, url: `${AIRBNB}${i}` }),
    );
    const gite = annonce({ id: "g", source: "Gîtes de France", guests: null, url: GITES });
    const airbnbSansGps = annonce({ id: "n", source: "Airbnb", guests: null, lat: null, lon: null, url: AIRBNB });
    const { aLire, laissees } = choisirFiches([...airbnbs, gite, airbnbSansGps], (l) => l.url);
    assert.deepEqual(
      aLire.map((l) => l.id),
      ["g", "n"],
    );
    assert.equal(laissees.get("Airbnb avec GPS"), 170);
    assert.equal(ecrireLaissees(laissees), " · laissées : Airbnb avec GPS 170");
  });

  it("une annonce sans URL de fiche n'est ni lue ni comptée", () => {
    const { aLire, laissees } = choisirFiches([annonce({ guests: null })], () => null);
    assert.equal(aLire.length, 0);
    assert.equal(laissees.size, 0);
    assert.equal(ecrireLaissees(laissees), "");
  });
});

describe("disjoncteur par hôte", () => {
  it("coupe après N lectures de suite sans rien combler, et le dit une fois", () => {
    const d = disjoncteur(3);
    assert.equal(d.noter("a.fr", false), false);
    assert.equal(d.noter("a.fr", false), false);
    assert.equal(d.coupe("a.fr"), false);
    assert.equal(d.noter("a.fr", false), true);
    assert.equal(d.coupe("a.fr"), true);
    assert.equal(d.noter("a.fr", false), false);
  });

  it("une lecture qui comble remet le compte à zéro", () => {
    const d = disjoncteur(2);
    d.noter("a.fr", false);
    d.noter("a.fr", true);
    d.noter("a.fr", false);
    assert.equal(d.coupe("a.fr"), false);
  });

  it("les hôtes se comptent séparément", () => {
    const d = disjoncteur(2);
    d.noter("a.fr", false);
    d.noter("b.fr", false);
    assert.equal(d.coupe("a.fr"), false);
    assert.equal(d.coupe("b.fr"), false);
  });
});
