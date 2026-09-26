import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  annoncer,
  bedroomsFromRooms,
  ficheDementieParLeTitre,
  occupancyFromRecord,
  occupancyFromText,
  occupancyOfListing,
} from "./occupancy.ts";

describe("occupancy : ce que la source a écrit, rien de plus", () => {
  it("lit une capacité nette", () => {
    assert.deepEqual(occupancyFromText("Demi chalet de gauche 8 personnes Les renoncules 2"), {
      guests: 8,
      bedrooms: null,
      rooms: null,
    });
  });

  it("refuse le titre à deux logements", () => {
    // 6 ou 12 : choisir c'est inventer.
    assert.deepEqual(occupancyFromText("2 appartements de 6 personnes face à face"), {
      guests: null,
      bedrooms: null,
      rooms: null,
    });
    assert.deepEqual(occupancyFromText("2-appartements-de-6-personnes"), {
      guests: null,
      bedrooms: null,
      rooms: null,
    });
  });

  it("N°505 Appartement 8 personnes n'est pas cinq cent cinq logements", () => {
    assert.equal(occupancyFromText("LE PRINCE DES ECRINS 505 Appartement 8 personnes").guests, 8);
    assert.equal(occupancyFromText("LE JANDRI 02S01 Appartement 8 personnes").guests, 8);
    assert.equal(
      occupancyOfListing({
        guests: null,
        bedrooms: null,
        title: "LE PRINCE DES ECRINS 505 Appartement 8 personnes",
        url: "https://reservation.les2alpes.com/le-prince-des-ecrins-n505-appartement-8-personnes-les-2-alpes.html",
      }).guests,
      8,
    );
  });

  it("prend le haut d'une fourchette 7/8", () => {
    assert.equal(occupancyFromText("Capacité 7/8 personnes").guests, 8);
    assert.equal(occupancyFromText("Appartement 3 pièces 7-8 pers.").guests, 8);
    assert.equal(occupancyFromText("Les Deux-Alpes, appartement 6-8 pers, cosy, calme").guests, 8);
    assert.equal(occupancyFromText("Grand appartement pied des pistes 13-15 personnes").guests, 15);
  });

  it("les pièces se lisent comme des pièces, et ne deviennent des chambres qu'à la comparaison", () => {
    // La conversion existe toujours — le filtre s'en sert — mais elle n'est
    // plus écrite dans `bedrooms` : « 3 pièces » n'est pas « 2 chambres »
    // publiées, et la vignette ne doit pas prétendre le contraire.
    assert.equal(bedroomsFromRooms(3), 2);
    assert.equal(bedroomsFromRooms(1), 0);
    assert.equal(bedroomsFromRooms(null), null);
    assert.deepEqual(occupancyFromText("Appartement 3 pièces 8 personnes"), {
      guests: 8,
      bedrooms: null,
      rooms: 3,
    });
    // Des chambres publiées restent des chambres publiées.
    assert.deepEqual(occupancyFromText("Chalet 10 personnes 4 chambres"), {
      guests: 10,
      bedrooms: 4,
      rooms: null,
    });
  });

  it("un studio est une pièce et aucune chambre, et les deux sont publiés", () => {
    assert.deepEqual(occupancyFromText("STUDIO CABINE 4 pers."), {
      guests: 4,
      bedrooms: 0,
      rooms: 1,
    });
  });

  it("T3 vaut trois pièces", () => {
    assert.equal(occupancyFromText("T3 6 personnes").rooms, 3);
    assert.equal(occupancyFromText("T3 6 personnes").bedrooms, null);
  });

  it("8 couchages est une capacité, 6 lits n'en est pas une", () => {
    assert.equal(occupancyFromText("Appartement : 8 couchages face aux pistes").guests, 8);
    assert.deepEqual(occupancyFromText("6 lits · 3 chambres"), {
      guests: null,
      bedrooms: 3,
      rooms: null,
    });
  });

  it("lit un slug à tirets, la même phrase que le titre", () => {
    assert.equal(
      occupancyFromText("l-olympe-n11-appartement-8-personnes-les-2-alpes.html").guests,
      8,
    );
    assert.deepEqual(
      occupancyFromText("vacanceole-l-edelweiss-appartement-2-pieces-cabine-8-personnes"),
      { guests: 8, bedrooms: null, rooms: 2 },
    );
  });

  it("le champ publié l'emporte sur le titre", () => {
    const o = annoncer({ guests: 10, bedrooms: 4 }, "8 personnes · 2 chambres");
    assert.deepEqual(o, { guests: 10, bedrooms: 4, rooms: null });
  });

  it("le titre complète un JSON muet", () => {
    const o = annoncer({ guests: null, bedrooms: null }, "Chalet 10 personnes 4 chambres");
    assert.deepEqual(o, { guests: 10, bedrooms: 4, rooms: null });
  });

  it("relit titre et URL d'une fiche déjà construite", () => {
    assert.deepEqual(
      occupancyOfListing({
        guests: null,
        bedrooms: 3,
        title: "Les Deux-Alpes, appartement 6-8 pers, cosy, calme",
        url: null,
      }),
      { guests: 8, bedrooms: 3, rooms: null },
    );
    assert.deepEqual(
      occupancyOfListing({
        guests: 8,
        bedrooms: null,
        title: "Vacancéole - l'Edelweiss-",
        url: "https://reservation.les2alpes.com/vacanceole-l-edelweiss-appartement-2-pieces-cabine-8-personnes-les-2-alpes.html",
      }),
      { guests: 8, bedrooms: null, rooms: 2 },
    );
  });

  it("lit les clés structurées d'une fiche Cozy / Airbnb", () => {
    assert.deepEqual(
      occupancyFromRecord({
        name: "Chalet",
        subTitleDetails: { guestCapacity: 8, bedRoomCount: 3 },
      }),
      { guests: 8, bedrooms: 3, rooms: null },
    );
    assert.deepEqual(
      occupancyFromRecord({ personCapacity: "6", bedroomCount: 0 }),
      { guests: 6, bedrooms: 0, rooms: null },
    );
  });

  it("lit occupancy.maxPersons d'une fiche Booking", () => {
    assert.deepEqual(
      occupancyFromRecord({ occupancy: { maxPersons: 8 }, numberOfBedrooms: 3 }),
      { guests: 8, bedrooms: 3, rooms: null },
    );
  });

  it("lit sleeps et maxOccupancy comme une capacité publiée", () => {
    assert.deepEqual(occupancyFromRecord({ sleeps: 8, bedroomCount: 3 }), {
      guests: 8,
      bedrooms: 3,
      rooms: null,
    });
    assert.equal(occupancyFromRecord({ maxOccupancy: 10 }).guests, 10);
  });

  it("lit personCapacity dans loggingContext Airbnb", () => {
    assert.equal(
      occupancyFromRecord({
        loggingContext: { eventDataLogging: { personCapacity: 8 } },
      }).guests,
      8,
    );
  });

  it("lit l'abréviation 8p / 10 P d'une tuile, pas un 2p cabine", () => {
    assert.equal(occupancyFromText("8p · 3 chambres").guests, 8);
    assert.equal(occupancyFromText("10 P").guests, 10);
    assert.equal(occupancyFromText("Appartement 8p 80m²").guests, 8);
    assert.equal(occupancyFromText("Superbe Appartement 8P pied des pistes (Réf 32)").guests, 8);
    assert.equal(occupancyFromText("Chalet 10p sauna /superbe vue").guests, 10);
    assert.equal(occupancyFromText("2p cabine").guests, null);
    assert.equal(occupancyFromText("Appartement 2 pièces cabine").guests, null);
    assert.equal(occupancyFromText("2 pièces · 4 pers.").guests, 4);
  });

  it("accueille, capacité, F3 et 3 ch. sont des lectures", () => {
    assert.equal(occupancyFromText("Chalet pouvant accueillir 10").guests, 10);
    assert.equal(occupancyFromText("Capacité : 8").guests, 8);
    assert.equal(occupancyFromText("F3 pied des pistes").rooms, 3);
    assert.equal(occupancyFromText("Appartement 3 ch. sud").bedrooms, 3);
    assert.equal(occupancyFromText("Grand chalet").bedrooms, null);
  });

  it("sleeps 8, cap. 8 et capacity 8 sont des lectures", () => {
    assert.equal(occupancyFromText("Cabin sleeps 8 near the slopes").guests, 8);
    assert.equal(occupancyFromText("Appartement cap. 8 pied des pistes").guests, 8);
    assert.equal(occupancyFromText("capacity 10 with sauna").guests, 10);
    assert.equal(occupancyFromText("cape of 8 mountains").guests, null);
  });

  it("ne lit pas les noms de photos GreenGo, numérotés : « 12-chambre… » n'est pas 12 chambres", () => {
    const photo = "https://images.greengo.voyage/canonical/accommmodation/ordered_images/12-chambre_rdc_cote_jardin-web.jpg";
    const occ = occupancyOfListing({ source: "GreenGo", guests: null, bedrooms: null, title: "Chalet Paradis Blanc Morzine 5*", url: null, photo, photos: [photo] });
    assert.equal(occ.bedrooms, null);
    assert.equal(occ.rooms, null);
  });

  it("lit un slug de photo comme un titre", () => {
    assert.equal(
      occupancyOfListing({
        guests: null,
        bedrooms: null,
        title: "L'OLYMPE N°11",
        url: null,
        photo:
          "https://reservation.les2alpes.com/medias/images/prestations/l-olympe-appartement-8-personnes-10.jpeg",
      }).guests,
      8,
    );
  });
});

describe("ficheDementieParLeTitre : le titre annonce plus petit que la fiche", () => {
  /** Une offre CozyCozy telle que les relevés du 25 septembre 2026 la portent. */
  const offre = (title: string, guests: number | null, bedrooms: number | null, source = "Abritel") => ({
    source,
    title,
    guests,
    bedrooms,
  });

  it("un studio, un F1 ou un 2 pièces publiés à 3 chambres", () => {
    for (const [titre, g] of [
      ["Appartement 2 Pièces 5/6 Pers. Proche Linga. Balcon Sud.meublé Classé 2 éToiles.", 6],
      ["Résidence Le Chardonnet - 2 Pièces Pour 6 Personnes Mae-3321", 6],
      ["Résidence Cheval Blanc - 2 Pièces Pour 4 Personnes Mae-8564", 8],
      ["Confortable 2 Pièces + Cabine, Proche Pistes Valfréjus - Fr-1-561-29", 8],
      ["Homency - Résidence De L'oisans F1", 6],
      ["Studio Rénové Avec Balcon Et Parking à Flaine - Fr-1-425-121", 8],
      ["Studio Confortable Au Centre Station Avec Terrasse, Animaux Admis - Fr-1-425-181", 6],
      [
        "Studio Cabine Au Calme Avec Terrasse à Praz-sur-arly - 4 Personnes, Parking Et Casier à Ski - Fr-1-603-14",
        6,
      ],
      // Douteux : peut-être le chalet entier. Justement, on ne sait pas.
      ["Studio Apartment In Chalet Sunshine", 6],
    ] as const) {
      assert.ok(ficheDementieParLeTitre(offre(titre, g, 3)), titre);
    }
  });

  it("« pour N personnes » avec au moins deux personnes de plus sur la fiche", () => {
    assert.ok(ficheDementieParLeTitre(offre("Appartement De Ski Alpin à Tignes Pour 4 Personnes", 6, 3)));
    assert.ok(
      ficheDementieParLeTitre(offre("Résidence Le Grand Bouquetin - 3 Pièces Pour 6 Personnes Mae-0034", 8, 3)),
    );
    assert.ok(ficheDementieParLeTitre(offre("Chalet for 4 people", 8, 3)));
    // Une personne d'écart : un lit d'appoint, un bébé. L'annonce reste.
    assert.ok(
      !ficheDementieParLeTitre(offre("Résidence La Tour Du Merle - 4 Pièces Pour 7 Personnes Mae-3298", 8, 3)),
    );
    // Une fourchette se lit à sa borne haute.
    assert.ok(!ficheDementieParLeTitre(offre("Chalet pour 6 à 8 personnes", 8, 4)));
    assert.ok(!ficheDementieParLeTitre(offre("Chalet pour 6/8 pers.", 9, 4)));
  });

  it("épargne les titres de lot et GreenGo", () => {
    assert.ok(
      !ficheDementieParLeTitre(
        offre("Arc 2000 -2 Appartements Et De 1 Studio Avec Balcon, Vue, Ski In Off, Wi-fi", 8, 3, "Booking"),
      ),
    );
    assert.ok(!ficheDementieParLeTitre(offre("Appartements T4 Et Studio - 10 Pers - Avec Parking", 10, 4, "Airbnb")));
    assert.ok(!ficheDementieParLeTitre(offre("Chalet + studio indépendant", 10, 4)));
    assert.ok(
      !ficheDementieParLeTitre(offre("Gîte Narcisse — Grand gite Narcisse (gite et studio)", 12, 5, "GreenGo")),
    );
    // GreenGo publie son détail : même un studio seul n'y est pas jugé.
    assert.ok(!ficheDementieParLeTitre(offre("Studio des Bergers", 6, 3, "GreenGo")));
  });

  it("ne lit que ce qui contredit vraiment", () => {
    // Un studio cabine publié 1 chambre, un 2 pièces + cabine publié 2 : ordinaire.
    assert.ok(!ficheDementieParLeTitre(offre("Studio Cabine 4 personnes", 4, 1)));
    assert.ok(!ficheDementieParLeTitre(offre("2 Pièces + Cabine au pied des pistes", 6, 2)));
    // Un 3 pièces n'est pas dans la règle, un 4 pièces non plus.
    assert.ok(!ficheDementieParLeTitre(offre("Appartement Confortable 3 Pièces à Flaine - 6 Pers", 8, 3)));
    // « 4p », « 5p8 » ou « 6+2 Pers » ne disent pas une capacité opposable.
    assert.ok(!ficheDementieParLeTitre(offre("Beau 4p Sur Valfrejus - Réductions Spéciales Mars 2026", 8, 3)));
    assert.ok(!ficheDementieParLeTitre(offre("Chalet Les Marmottes - 5p8", 8, 4, "Booking")));
    assert.ok(!ficheDementieParLeTitre(offre("Appartement 6+2 Pers Avec 4 Ch.", 8, 4, "Airbnb")));
    // Des pièces d'eau sont des salles de bain.
    assert.ok(!ficheDementieParLeTitre(offre("Chalet 3 chambres et 2 pièces d'eau", 8, 3)));
    // Une fiche muette ne se contredit pas ; un titre sans taille non plus.
    assert.ok(!ficheDementieParLeTitre(offre("Studio Rénové à Flaine", null, null)));
    assert.ok(!ficheDementieParLeTitre(offre("Grand Appartement Familial", 10, 3)));
    assert.ok(!ficheDementieParLeTitre({ title: "", guests: 8, bedrooms: 3 }));
  });

  it("un titre qui compte ses chambres ne se mesure pas à ses pièces", () => {
    assert.ok(!ficheDementieParLeTitre(offre("Chalet 5 chambres avec studio indépendant", 12, 5)));
    assert.ok(!ficheDementieParLeTitre(offre("Chalet 6 chambres, 2 pièces à vivre", 14, 6)));
    assert.ok(!ficheDementieParLeTitre(offre("Maison 4 chambres, 2 Pièces De Vie", 10, 4)));
    // Ni lot ni pièces de vie : seules les chambres du titre l'épargnent.
    assert.ok(!ficheDementieParLeTitre(offre("Chalet Le Studio - 5 Chambres", 12, 5)));
    // Une chambre dans un 2 pièces : le titre dit bien un 2 pièces, la fiche
    // à 3 chambres le dément toujours.
    assert.ok(ficheDementieParLeTitre(offre("Appartement 2 Pièces 1 Chambre", 8, 3)));
    // Des chambres au titre, mais moins que sur la fiche : toujours démentis.
    assert.ok(ficheDementieParLeTitre(offre("Studio 1 chambre", 6, 3)));
    assert.ok(ficheDementieParLeTitre(offre("T2 2 chambres", 6, 3)));
  });

  it("un studio annexe n'est pas le logement", () => {
    for (const [titre, g, ch] of [
      ["Grand chalet 12 pers. dont un studio", 12, 5],
      ["Chalet avec studio attenant", 10, 4],
      ["Chalet Avec Un Studio, Vue Mont-Blanc", 10, 4],
      ["Chalet plus un studio, 14 personnes", 14, 6],
      ["Grande maison familiale, studio attenant", 10, 4],
      ["Chalet 5 chambres avec studio indépendant", 12, 5],
    ] as const) {
      assert.ok(!ficheDementieParLeTitre(offre(titre, g, ch)), titre);
    }
    // En tête du titre, « studio indépendant » est le logement loué.
    assert.ok(ficheDementieParLeTitre(offre("Studio indépendant au calme", 6, 3)));
    // Derrière un tiret, le lieu puis le logement loué : un studio, jugé.
    for (const titre of [
      "Chalet Les Sapins - Studio indépendant 2 pers",
      "Résidence Les Chalets du Galibier - Studio indépendant",
      "Ferme rénovée - Studio Indépendant",
    ]) {
      assert.ok(ficheDementieParLeTitre(offre(titre, 8, 3)), titre);
    }
  });

  it("des pièces à vivre ou de vie ne mesurent pas le logement", () => {
    assert.ok(!ficheDementieParLeTitre(offre("Chalet avec 2 pièces à vivre et sauna", 12, 5)));
    assert.ok(!ficheDementieParLeTitre(offre("Chalet 2 Pièces À Vivre, Jacuzzi", 12, 5)));
    assert.ok(!ficheDementieParLeTitre(offre("Grand chalet, 2 pièces de vie", 12, 5)));
  });

  it("« pour N personnes + M enfants » annonce N + M", () => {
    assert.ok(!ficheDementieParLeTitre(offre("Chalet pour 12 personnes + 2 enfants", 14, 5)));
    assert.ok(!ficheDementieParLeTitre(offre("Appartement pour 4 pers. + 2 bébés", 6, 2)));
    assert.ok(!ficheDementieParLeTitre(offre("Chalet pour 6 personnes + 2", 8, 3)));
    assert.ok(!ficheDementieParLeTitre(offre("Chalet pour 12 personnes (+ 2 enfants)", 14, 5)));
    assert.ok(!ficheDementieParLeTitre(offre("Chalet pour 6 personnes (+2)", 8, 3)));
    assert.ok(!ficheDementieParLeTitre(offre("Chalet pour 6 personnes + 2 couchages", 8, 3)));
    assert.ok(!ficheDementieParLeTitre(offre("Chalet pour 6 personnes + 2 bb", 8, 3)));
    // Deux personnes de plus que N + M : toujours démenti.
    assert.ok(ficheDementieParLeTitre(offre("Chalet pour 12 personnes + 2 enfants", 16, 5)));
    // « + 2 chambres » ne compte pas des personnes.
    assert.ok(ficheDementieParLeTitre(offre("Appartement pour 4 personnes + 2 chambres", 6, 2)));
  });
});
