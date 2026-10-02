import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../listings.ts";
import {
  AIRBNB_COMPLET,
  airbnbComplet,
  choisirFiches,
  clePage,
  cleUrl,
  disjoncteur,
  ecrireLaissees,
  estPageDeSite,
  raisonDeLaisser,
  trousDe,
  troisChampsAirbnb,
  urlPropre,
  urlsPartagees,
  VALEUR_DU_TEXTE,
} from "./priseFiche.ts";

function annonce(extra: Partial<Listing> = {}): Listing {
  return {
    id: "x",
    stationId: "avoriaz",
    title: "Studio pied des pistes",
    source: "Abritel",
    total: 900,
    currency: "EUR",
    capacity: 4,
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
      trousDe(annonce({ capacity: null, bedrooms: null, lat: null, lon: null, title: "IMG_4021.jpg" })),
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
    assert.equal(raisonDeLaisser(annonce({ source: "Booking", capacity: null }), BOOKING), "booking.com");
    assert.equal(raisonDeLaisser(annonce({ source: "Booking", lat: null, lon: null }), BOOKING), "booking.com");
  });

  it("Abritel publie le GPS et le titre, ni capacité ni chambres", () => {
    assert.equal(raisonDeLaisser(annonce({ capacity: null }), ABRITEL), "abritel.fr");
    assert.equal(raisonDeLaisser(annonce({ capacity: null, bedrooms: null }), ABRITEL), "abritel.fr");
    assert.equal(raisonDeLaisser(annonce({ capacity: null, lat: null, lon: null }), ABRITEL), null);
    assert.equal(raisonDeLaisser(annonce({ title: "photos_ab12_1234" }), ABRITEL), null);
  });

  it("Airbnb : laissée seulement avec GPS, capacité et chambres ; sinon la PDP est lue", () => {
    const base = annonce({ source: "Airbnb", capacity: null, bedrooms: null });
    // GPS sans capacité ni chambres : à lire.
    assert.equal(raisonDeLaisser(base, AIRBNB), null);
    // Capacité sans chambres, ou chambres sans capacité : à lire.
    assert.equal(raisonDeLaisser({ ...base, capacity: 4 }, AIRBNB), null);
    assert.equal(raisonDeLaisser({ ...base, bedrooms: 2 }, AIRBNB), null);
    // GPS manquant, même avec capacité et chambres : à lire.
    assert.equal(raisonDeLaisser({ ...base, capacity: 4, bedrooms: 2, lat: null, lon: null }, AIRBNB), null);
    assert.equal(raisonDeLaisser({ ...base, capacity: 4, bedrooms: 2, lat: 0, lon: 0 }, AIRBNB), null);
    // Les trois : laissée, et le seau dit pourquoi (plus « avec GPS »).
    assert.equal(AIRBNB_COMPLET, "Airbnb complet");
    assert.equal(raisonDeLaisser({ ...base, capacity: 4, bedrooms: 2 }, AIRBNB), AIRBNB_COMPLET);
    // 0 chambre (studio) est une valeur, pas un trou.
    assert.equal(raisonDeLaisser({ ...base, capacity: 2, bedrooms: 0 }, AIRBNB), AIRBNB_COMPLET);
    // 0 personne n'est pas une capacité.
    assert.equal(raisonDeLaisser({ ...base, capacity: 0, bedrooms: 1 }, AIRBNB), null);
  });

  it("Airbnb : ce qui manque se nomme, GPS compris", () => {
    const base = annonce({ source: "Airbnb" });
    assert.equal(airbnbComplet(base), true);
    assert.deepEqual(troisChampsAirbnb(base), []);
    assert.deepEqual(troisChampsAirbnb({ ...base, lat: null, capacity: null, bedrooms: null }), [
      "gps",
      "capacity",
      "bedrooms",
    ]);
    assert.deepEqual(troisChampsAirbnb({ ...base, capacity: 0 }), ["capacity"]);
    assert.deepEqual(troisChampsAirbnb({ ...base, bedrooms: 0 }), []);
  });

  it("une page hôte GreenGo n'est jamais ouverte : seule l'API de détail est sûre", () => {
    const hote = "https://www.greengo.voyage/hote/chalet-paradis-blanc?checkIn=2027-02-06&checkOut=2027-02-13&numberOfAdults=2";
    assert.equal(raisonDeLaisser(annonce({ source: "GreenGo", capacity: null, bedrooms: null }), hote), "greengo.voyage");
  });

  it("fiches mesurées le 2 octobre 2026 : Open System et Orchestra muettes, iResa pour les chambres", () => {
    const openSystem =
      "https://reservation.haute-maurienne-vanoise.com/dp7-les-balcons-de-val-cenis-le-haut-val-cenis-lanslevillard/RESAX-132362?DateRecherche=2027-02-06%7C2027-02-13";
    const orchestra = "https://www.laplagneresort.com/location/residence-silenes-n318-ref-lp-sil318-103686";
    const iresa = "https://www.lesarcs-reservation.com/residence-le-rochefort-appartement-2-pieces-cabine-4-personnes-ndeg309?package=3605";
    const trouee = annonce({ source: "Centrale", capacity: null, bedrooms: null, lat: null, lon: null });
    // Coquille de recherche, et fiche que le relevé Orchestra lit lui-même : jamais ouvertes.
    assert.equal(raisonDeLaisser(trouee, openSystem), "haute-maurienne-vanoise.com");
    assert.equal(raisonDeLaisser(trouee, orchestra), "laplagneresort.com");
    // iResa : « Nb chambre(s) : N » sur la fiche, jamais de point ni de capacité.
    assert.equal(raisonDeLaisser(trouee, iresa), null);
    assert.equal(raisonDeLaisser(annonce({ source: "Centrale", lat: null, lon: null }), iresa), "lesarcs-reservation.com");
    assert.equal(raisonDeLaisser(annonce({ source: "Centrale", capacity: null }), iresa), "lesarcs-reservation.com");
    // Des chambres tirées des pièces (« 2 pièces ») : la fiche les publie, elle s'ouvre.
    assert.equal(
      raisonDeLaisser(annonce({ source: "Centrale", rooms: 2, bedrooms: 1, bedroomsSource: "derived_from_type" }), iresa),
      null,
    );
  });

  it("Gîtes et hôte inconnu restent ouverts", () => {
    assert.equal(raisonDeLaisser(annonce({ source: "Gîtes de France" }), GITES), null);
    assert.equal(
      raisonDeLaisser(annonce({ source: "Centrale", capacity: null }), "https://reservation.exemple.fr/fiche/12"),
      null,
    );
  });

  it("une valeur du texte n'ouvre la fiche que chez un hôte qui la publie", () => {
    const centrale = "https://reservation.exemple.fr/fiche/12";
    const texte = annonce({ source: "Centrale", capacity: 6, capacitySource: "text_regex" });
    // Un hôte inconnu : seule une annonce muette use son débit et son disjoncteur.
    assert.equal(raisonDeLaisser(texte, centrale), VALEUR_DU_TEXTE);
    assert.equal(raisonDeLaisser({ ...texte, bedrooms: null }, centrale), null);
    // Alpissime publie capacité et chambres sur sa fiche : un champ structuré y remplace le texte.
    const alpissime = "https://www.alpissime.com/appartement/3397_2-pieces/";
    const derivees = annonce({ source: "Alpissime", bedrooms: 1, bedroomsSource: "derived_from_type" });
    assert.equal(raisonDeLaisser(derivees, alpissime), null);
    assert.deepEqual(trousDe(derivees), []);
    assert.deepEqual(trousDe(derivees, { faibles: true }), ["chambres"]);
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
    const trouee = annonce({ source: "Centrale", capacity: null, lat: null, lon: null });
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
  it("le seau « Airbnb complet » ne compte que les annonces complètes, qui ne prennent pas la place des autres", () => {
    // 100 complètes (GPS, capacité, chambres, dont 10 studios à 0 chambre),
    // 40 sans capacité, 25 sans chambres, 5 sans GPS : seules les 100
    // complètes restent dans le seau ; les 70 autres sont lues.
    const n = { complets: 100, sansCapacite: 40, sansChambres: 25, sansGps: 5 };
    const airbnb = (id: string, extra: Partial<Listing>) =>
      annonce({ id, source: "Airbnb", capacity: 4, bedrooms: 2, url: `${AIRBNB}${id}`, ...extra });
    const lot = [
      ...Array.from({ length: n.complets }, (_, i) => airbnb(`a${i}`, i < 10 ? { bedrooms: 0 } : {})),
      ...Array.from({ length: n.sansCapacite }, (_, i) => airbnb(`c${i}`, { capacity: null })),
      ...Array.from({ length: n.sansChambres }, (_, i) => airbnb(`b${i}`, { bedrooms: null })),
      ...Array.from({ length: n.sansGps }, (_, i) => airbnb(`n${i}`, { lat: null, lon: null })),
    ];
    const gite = annonce({ id: "g", source: "Gîtes de France", capacity: null, url: GITES });
    const { aLire, laissees } = choisirFiches([...lot, gite], (l) => l.url);
    assert.equal(laissees.get(AIRBNB_COMPLET), n.complets);
    assert.equal(aLire.length, n.sansCapacite + n.sansChambres + n.sansGps + 1);
    assert.ok(aLire.every((l) => !l.id.startsWith("a")));
    // Les trouées du même lot sont ouvertes avec le gîte, dans l'ordre reçu.
    assert.deepEqual(
      aLire.map((l) => l.id[0]),
      [..."c".repeat(n.sansCapacite), ..."b".repeat(n.sansChambres), ..."n".repeat(n.sansGps), "g"],
    );
    assert.equal(ecrireLaissees(laissees), " · laissées : Airbnb complet 100");
  });

  it("une annonce sans URL de fiche n'est ni lue ni comptée", () => {
    const { aLire, laissees } = choisirFiches([annonce({ capacity: null })], () => null);
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
