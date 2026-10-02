import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chambresDesPieces,
  journalResidu,
  lireLogement,
  poserValeur,
  qualifierLogement,
  RESIDU_DETAIL_MAX,
  residuLogements,
  sourceCapacite,
  sourceChambres,
  typePublie,
  valeurDuTexte,
  type SujetLogement,
} from "./logement.ts";

const annonce = (title: string, extra: Partial<SujetLogement> = {}): SujetLogement => ({
  title,
  capacity: null,
  bedrooms: null,
  ...extra,
});

/* ---------- Les règles de lecture ---------- */

describe("studio : 0 chambre et un studio, la cabine à part", () => {
  for (const titre of [
    "Studio 4 personnes",
    "STUDIO CABINE 4 pers.",
    "Stud. 2 pers",
    "Studette 2 pers",
    "Appartement T1 2 personnes",
    "T1 bis 3 personnes",
    "Appartement 1 pièce 2 personnes",
  ]) {
    it(titre, () => {
      const lu = lireLogement(titre);
      assert.equal(lu.studio, true);
      assert.equal(lu.type, "studio");
      assert.equal(lu.chambresDerivees, 0);
      assert.equal(lu.chambresEcrites, null, "aucune chambre n'est écrite");
      assert.equal(lu.pieces, 1);
    });
  }

  it("la cabine est un booléen, pas une chambre", () => {
    const lu = lireLogement("Studio cabine 4 personnes");
    assert.equal(lu.cabine, true);
    assert.equal(lu.chambresDerivees, 0);
    assert.equal(lireLogement("Studio 2 personnes").cabine, false);
  });

  it("un studio nommé, annexe ou vendu en lot n'en est pas un", () => {
    assert.equal(lireLogement("Chalet Le Studio - 5 Chambres").chambresEcrites, 5);
    assert.equal(lireLogement("Chalet Le Studio - 5 Chambres").studio, false);
    assert.equal(lireLogement("Chalet avec studio attenant, 10 personnes").studio, false);
    assert.equal(lireLogement("2 appartements et 1 studio").chambresDerivees, null);
    assert.equal(lireLogement("Student flat").type, null);
  });
});

describe("type sans chambres écrites : les pièces moins une", () => {
  for (const [titre, pieces] of [
    ["Appartement T2 4 personnes", 2],
    ["F2 5 personnes", 2],
    ["Appartement 2 pièces 4 personnes", 2],
    ["Appt 2P 4 pers", 2],
    ["T3 pied des pistes", 3],
    ["appartement-3-pieces-6-personnes", 3],
    ["Chalet T5 10 personnes", 5],
  ] as const) {
    it(titre, () => {
      const lu = lireLogement(titre);
      assert.equal(lu.pieces, pieces);
      assert.equal(lu.chambresDerivees, pieces - 1);
      assert.equal(lu.chambresEcrites, null);
      assert.equal(lu.studio, false);
    });
  }

  it("« 2 pièces cabine » : 1 chambre et une cabine", () => {
    const lu = lireLogement("Appartement 2 pièces cabine 6 personnes");
    assert.equal(lu.chambresDerivees, 1);
    assert.equal(lu.cabine, true);
    const p = lireLogement("2P cabine");
    assert.equal(p.pieces, 2);
    assert.equal(p.chambresDerivees, 1);
    assert.equal(p.cabine, true);
    assert.equal(p.capacite, null);
  });

  it("« 2P » ne vaut des pièces que s'il ne peut pas être une capacité", () => {
    // À côté d'une capacité écrite, ou avant un autre « Np ».
    assert.deepEqual(
      [lireLogement("Duplex 3P 6p").pieces, lireLogement("Duplex 3P 6p").capacite],
      [3, 6],
    );
    // Seul, « 8p » reste huit personnes (tuiles Airbnb).
    assert.equal(lireLogement("Appartement 8p 80m²").capacite, 8);
    assert.equal(lireLogement("Appartement 8p 80m²").pieces, null);
    assert.equal(lireLogement("Appartement 4p").capacite, 4);
  });

  it("un duplex seul ne dit pas ses chambres", () => {
    const lu = lireLogement("Duplex spacieux vue montagne");
    assert.equal(lu.chambresDerivees, null);
    assert.equal(lu.type, "appartement");
  });

  it("des pièces sans autre mot : un appartement", () => {
    assert.equal(lireLogement("T3 pied des pistes").type, "appartement");
  });
});

describe("chambres écrites, en français et en anglais", () => {
  for (const [titre, n] of [
    ["Chalet 3 chambres", 3],
    ["Appartement 3 ch. sud", 3],
    ["Chalet Petite Mariande 4 CH 4 SDB", 4],
    ["Lovely chalet 3 bedrooms", 3],
    ["Chalet 1 bedroom", 1],
  ] as const) {
    it(titre, () => assert.equal(lireLogement(titre).chambresEcrites, n));
  }

  it("les chambres écrites passent avant les pièces", () => {
    const lu = lireLogement("Appartement 3 pièces 1 chambre");
    assert.equal(lu.chambresEcrites, 1);
    assert.equal(lu.chambresDerivees, 2, "la dérivation reste à côté, sans servir");
  });
});

describe("capacité : synonymes, plage et capacité standard", () => {
  for (const titre of [
    "Chalet 6 personnes",
    "Chalet 6 pers",
    "Chalet 6 pers.",
    "Appartement 6 couchages",
    "Gîte 6 places",
    "Chalet 6 guests",
    "Chalet 6 pax",
    "Chalet sleeps 6",
    "Chalet 6 voyageurs",
  ]) {
    it(titre, () => assert.equal(lireLogement(titre).capacite, 6));
  }

  it("une plage : la borne haute, la basse en capacité standard", () => {
    for (const titre of [
      "Appartement 4/6 personnes",
      "Studio 4-6 pers.",
      "Chalet 4 à 6 couchages",
    ]) {
      const lu = lireLogement(titre);
      assert.equal(lu.capacite, 6, titre);
      assert.equal(lu.capaciteStandard, 4, titre);
    }
    assert.equal(lireLogement("Chalet 6 personnes").capaciteStandard, null);
  });

  it("une plage qui descend n'en est pas une : le nombre avant « personnes » (Ingénie, Les Saisies)", () => {
    // Le titre et l'adresse de la fiche, joints comme `annoncer` les joint.
    const cas: [string, number][] = [
      ["Rond Point 7 ( 446717 ) · /rond-point-7-4-personnes-446717-les-saisies.html", 4],
      ["Rond Point 9 ( 594503 ) · /rond-point-9-5-personnes-594503-les-saisies.html", 5],
      ["Rond point 11 ( 789264 ) · /rond-point-11-4-personnes-789264-les-saisies.html", 4],
      ["Cimes 12 ( 448586 ) · /cimes-12-8-personnes-448586-les-saisies.html", 8],
      ["Altarena D101 ( 595001 ) · /altarena-d101-8-personnes-595001-hauteluce.html", 8],
      [
        "Chalet - CHALET 1941 ( CHALET1941 ) · /chalet-chalet-1941-10-personnes-chalet1941-les-saisies.html",
        10,
      ],
      [
        "3 pièces 4 pers - Myrna A01 - Bisanne 1500 ( 7600194 ) · /3-pieces-4-pers-myrna-a01-bisanne-1500-4-personnes-7600194.html",
        4,
      ],
    ];
    for (const [texte, capacite] of cas) {
      const lu = lireLogement(texte);
      assert.equal(lu.capacite, capacite, texte);
      assert.equal(lu.capaciteStandard, null, texte);
    }
    // Une plage qui monte reste une plage, dans une adresse aussi.
    const plage = lireLogement("Appartement · /appartement-4-6-personnes-123.html");
    assert.equal(plage.capacite, 6);
    assert.equal(plage.capaciteStandard, 4);
  });

  it("une place de parking n'est pas une capacité", () => {
    assert.equal(lireLogement("Appartement 3 pièces, 2 places de parking").capacite, null);
    assert.equal(lireLogement("Chalet, garage 2 places").capacite, null);
  });

  it("plusieurs logements : aucune capacité", () => {
    assert.equal(lireLogement("2 appartements de 6 personnes face à face").capacite, null);
  });
});

describe("type de logement", () => {
  for (const [titre, type] of [
    ["Appartement indépendant dans chalet Canopée", "appartement"],
    ["Chalet 10 personnes 4 chambres", "chalet"],
    ["Grand gîte de 12 personnes", "maison"],
    ["Villa avec piscine", "maison"],
    ["Chambre Double (2 personnes)", "chambre"],
    ["Chambres d'hôtes La Ferme", "chambre"],
    ["Hôtel Les Bruyères", "hotel"],
    ["Yourte au calme", "autre"],
    ["Studio équipé pied des pistes", "studio"],
    ["Le Jardin Alpin : Les 2 Alpes", null],
  ] as const) {
    it(`${titre} : ${type}`, () => assert.equal(lireLogement(titre).type, type));
  }

  it("le type publié par la source", () => {
    assert.equal(typePublie("Logement entier : appartement"), "appartement");
    assert.equal(typePublie("Gîte"), "maison");
    assert.equal(typePublie("Studio"), "studio");
    assert.equal(typePublie("Appartement de particulier"), "appartement");
    assert.equal(typePublie("Hébergement"), null);
    assert.equal(typePublie(null), null);
  });
});

/* ---------- Qualification : sources et priorité ---------- */

describe("Airbnb : capacité et chambres de la page, le titre en dernier recours", () => {
  /** Une annonce Airbnb dont la page existe (`rooms/`), pas encore lue. */
  const airbnb = (title: string, extra: Partial<SujetLogement> = {}) =>
    annonce(title, { source: "Airbnb", url: "https://www.airbnb.fr/rooms/31415926", ...extra });

  it("page pas encore lue : ni le titre ni le type ne donnent capacité ou chambres", () => {
    const q = qualifierLogement(airbnb("Chalet 4 chambres 10 personnes"));
    assert.deepEqual(
      [q.capacity, q.capacitySource, q.bedrooms, q.bedroomsSource],
      [null, null, null, null],
    );
    const t = qualifierLogement(airbnb("Appartement 3 pièces 6 personnes"));
    assert.deepEqual([t.capacity, t.bedrooms], [null, null]);
  });

  it("page pas encore lue : une valeur tirée du texte ne tient pas ; le structuré reste", () => {
    const q = qualifierLogement(
      airbnb("Chalet 8 personnes", {
        capacity: 8,
        capacitySource: "text_regex",
        bedrooms: 3,
        bedroomsSource: "structured",
      }),
    );
    assert.deepEqual(
      [q.capacity, q.capacitySource, q.bedrooms, q.bedroomsSource],
      [null, null, 3, "structured"],
    );
  });

  it("page lue sans personCapacity : la capacité du titre compte, les chambres non", () => {
    const q = qualifierLogement(airbnb("Chalet 4 chambres 10 personnes", { pdpLue: true }));
    assert.deepEqual(
      [q.capacity, q.capacitySource, q.bedrooms, q.bedroomsSource],
      [10, "text_regex", null, null],
    );
    const fourchette = qualifierLogement(airbnb("Appartement 6-8 pers, cosy", { pdpLue: true }));
    assert.deepEqual([fourchette.capacity, fourchette.capacityStandard], [8, 6]);
  });

  it("aucune page à lire (ni identifiant, ni rooms/, ni photo Hosting-) : la capacité du titre compte", () => {
    const sansPage = qualifierLogement(
      annonce("Le Jardin Alpin, 6 personnes", { source: "Airbnb", url: null }),
    );
    assert.deepEqual([sansPage.capacity, sansPage.capacitySource], [6, "text_regex"]);
    const parPhoto = qualifierLogement(
      annonce("Le Jardin Alpin, 6 personnes", {
        source: "Airbnb",
        url: null,
        photo: "https://a0.muscache.com/im/pictures/miso/Hosting-27623894/original/x.jpeg",
      }),
    );
    assert.equal(parPhoto.capacity, null);
  });

  it("un champ structuré passe devant le titre, même page lue", () => {
    const q = qualifierLogement(
      airbnb("Chalet 10 personnes", { pdpLue: true, capacity: 8, capacitySource: "structured" }),
    );
    assert.deepEqual([q.capacity, q.capacitySource], [8, "structured"]);
    const l = airbnb("Chalet 10 personnes", { pdpLue: true });
    Object.assign(l, qualifierLogement(l));
    assert.equal(l.capacity, 10);
    assert.equal(poserValeur(l, "capacity", 8, "structured"), true);
    assert.deepEqual(
      [qualifierLogement(l).capacity, qualifierLogement(l).capacitySource],
      [8, "structured"],
    );
  });

  it("page lue, titre muet : le trou reste", () => {
    const q = qualifierLogement(airbnb("Chalet à Abondance", { pdpLue: true }));
    assert.deepEqual([q.capacity, q.capacitySource], [null, null]);
  });

  it("0 chambre est un studio ; 0 personne n'est pas une capacité", () => {
    const q = qualifierLogement(airbnb("Studio", { capacity: 0, bedrooms: 0 }));
    assert.deepEqual([q.capacity, q.bedrooms, q.isStudio], [null, 0, true]);
  });

  it("poserValeur : du texte ne comble un trou Airbnb qu'une fois la page lue ; le structuré passe devant", () => {
    // Page pas encore lue : ni capacité ni chambres du texte.
    const avant = airbnb("Chalet 6 personnes");
    assert.equal(poserValeur(avant, "capacity", 6, "text_regex"), false);
    assert.equal(poserValeur(avant, "bedrooms", 2, "text_regex"), false);
    assert.deepEqual([avant.capacity, avant.bedrooms], [null, null]);
    // Page lue : « 6 voyageurs » de l'aperçu tient, un personCapacity le remplace.
    const l = airbnb("Chalet", { pdpLue: true });
    assert.equal(poserValeur(l, "capacity", 6, "text_regex"), true);
    Object.assign(l, qualifierLogement(l));
    assert.deepEqual([l.capacity, l.capacitySource], [6, "text_regex"]);
    assert.equal(poserValeur(l, "capacity", 8, "structured"), true);
    assert.deepEqual([qualifierLogement(l).capacity, qualifierLogement(l).capacitySource], [8, "structured"]);
    assert.equal(poserValeur(l, "capacity", 6, "text_regex"), false);
  });

  it("page lue : les chambres de son titre de partage tiennent, un bedroomCount les remplace", () => {
    // Fiches PDP d'Abondance, 2 octobre 2026 : « Appartement · ★4,92 · 1
    // chambre · 1 lit · 1 salle de bain », « … · Studio · 3 lits · … » ;
    // aucune ne porte `bedroomCount`.
    const l = airbnb("Echappée belle en Haute Savoie", { pdpLue: true });
    assert.equal(poserValeur(l, "bedrooms", 1, "text_regex"), true);
    Object.assign(l, qualifierLogement(l));
    assert.deepEqual([l.bedrooms, l.bedroomsSource, l.isStudio], [1, "text_regex", false]);
    const studio = airbnb("Studio à la montagne", { pdpLue: true });
    assert.equal(poserValeur(studio, "bedrooms", 0, "derived_from_type"), true);
    Object.assign(studio, qualifierLogement(studio));
    assert.deepEqual([studio.bedrooms, studio.bedroomsSource, studio.isStudio], [0, "derived_from_type", true]);
    // Un champ structuré, arrivé plus tard, passe devant.
    assert.equal(poserValeur(l, "bedrooms", 2, "structured"), true);
    assert.deepEqual([qualifierLogement(l).bedrooms, qualifierLogement(l).bedroomsSource], [2, "structured"]);
    // Le titre de la tuile, lui, ne donne jamais de chambres, page lue ou non.
    const tuile = qualifierLogement(airbnb("Chalet 4 chambres", { pdpLue: true }));
    assert.equal(tuile.bedrooms, null);
  });
});

describe("qualifier : structured, puis text_regex, puis derived_from_type", () => {
  it("le champ structuré reste, le texte comble ce qui manque, chaque valeur dit sa source", () => {
    const q = qualifierLogement(annonce("Appartement 3 pièces 6/8 personnes", { capacity: 8 }));
    assert.equal(q.capacity, 8);
    assert.equal(q.capacitySource, "structured");
    assert.equal(q.capacityStandard, 6);
    assert.equal(q.rooms, 3);
    assert.equal(q.bedrooms, 2);
    assert.equal(q.bedroomsSource, "derived_from_type");
    assert.equal(q.isStudio, false);
    assert.equal(q.lodgingType, "appartement");
  });

  it("des chambres écrites dans le texte : text_regex", () => {
    const q = qualifierLogement(annonce("Chalet 4 chambres 10 personnes"));
    assert.deepEqual(
      [q.bedrooms, q.bedroomsSource, q.capacity, q.capacitySource],
      [4, "text_regex", 10, "text_regex"],
    );
  });

  it("un studio : 0 chambre, isStudio, derived_from_type", () => {
    const q = qualifierLogement(annonce("Studio cabine 4 personnes"));
    assert.deepEqual(
      [q.bedrooms, q.isStudio, q.bedroomsSource, q.cabin],
      [0, true, "derived_from_type", true],
    );
    const publie = qualifierLogement(annonce("Appartement", { bedrooms: 0 }));
    assert.deepEqual(
      [publie.isStudio, publie.bedroomsSource, publie.lodgingType],
      [true, "structured", "studio"],
    );
  });

  it("des pièces publiées donnent les chambres, dérivées", () => {
    const q = qualifierLogement(annonce("Résidence Le Bois Joli", { capacity: 4, rooms: 4 }));
    assert.deepEqual([q.bedrooms, q.bedroomsSource], [3, "derived_from_type"]);
  });

  it("le texte ne remplace jamais un champ structuré", () => {
    const q = qualifierLogement(annonce("Studio 2 personnes", { capacity: 4, bedrooms: 1 }));
    assert.deepEqual(
      [q.capacity, q.capacitySource, q.bedrooms, q.bedroomsSource],
      [4, "structured", 1, "structured"],
    );
    assert.equal(q.isStudio, false);
  });

  it("des chambres écrites passent devant des chambres dérivées", () => {
    const q = qualifierLogement(
      annonce("T3 2 chambres", { bedrooms: 2, bedroomsSource: "derived_from_type" }),
    );
    assert.equal(q.bedroomsSource, "text_regex");
    const p = qualifierLogement(
      annonce("Résidence", { rooms: 3, bedrooms: 3, bedroomsSource: "derived_from_type" }),
    );
    assert.equal(p.bedrooms, 2, "des chambres dérivées suivent les pièces du moment");
  });

  it("introuvable : null, jamais 0 ni 1 par défaut", () => {
    const q = qualifierLogement(annonce("Les Balcons de Val Cenis le Haut"));
    assert.deepEqual(
      [q.capacity, q.bedrooms, q.isStudio, q.capacitySource, q.bedroomsSource],
      [null, null, null, null, null],
    );
  });

  it("le type publié passe avant celui du titre", () => {
    const q = qualifierLogement(annonce("Chalet des Cimes", { propertyType: "Appartement" }));
    assert.equal(q.lodgingType, "appartement");
  });

  it("qualifier deux fois ne change rien", () => {
    const une = qualifierLogement(annonce("Appartement T3 4/6 personnes cabine"));
    assert.deepEqual(qualifierLogement(une), une);
  });

  it("description et URL sont lues aussi ; pas les photos GreenGo", () => {
    const q = qualifierLogement(
      annonce("Chalet Edelweiss", { description: "Beau chalet de 4 chambres pour 10 personnes" }),
    );
    assert.deepEqual([q.capacity, q.bedrooms], [10, 4]);
    const u = qualifierLogement(
      annonce("Vacancéole", { url: "https://x.fr/appartement-2-pieces-cabine-8-personnes.html" }),
    );
    assert.deepEqual([u.capacity, u.rooms, u.bedrooms, u.cabin], [8, 2, 1, true]);
    const greengo = qualifierLogement({
      ...annonce("Chalet Paradis Blanc"),
      source: "GreenGo",
      photo: "https://img.greengo.voyage/12-chambre_rdc_cote_jardin-web.jpg",
    });
    assert.equal(greengo.bedrooms, null, "le numéro d'une photo n'est pas un compte de chambres");
  });

  it("une valeur sans source posée par un collecteur est structurée", () => {
    const l = annonce("Chalet", { capacity: 6, bedrooms: 2 });
    assert.deepEqual([sourceCapacite(l), sourceChambres(l)], ["structured", "structured"]);
    assert.deepEqual([sourceCapacite(annonce("x")), sourceChambres(annonce("x"))], [null, null]);
  });
});

describe("poserValeur : une valeur ne cède qu'à une meilleure source", () => {
  it("un champ structuré de la fiche remplace le texte, pas un autre champ structuré", () => {
    const l = qualifierLogement(annonce("Chalet 8 personnes"));
    assert.equal(poserValeur(l, "capacity", 10, "structured"), true);
    assert.deepEqual([l.capacity, l.capacitySource], [10, "structured"]);
    assert.equal(poserValeur(l, "capacity", 12, "structured"), false);
    assert.equal(poserValeur(l, "capacity", 12, "text_regex"), false);
  });

  it("des chambres écrites remplacent des chambres dérivées ; un studio se recalcule", () => {
    const l = qualifierLogement(annonce("T2 4 personnes"));
    assert.equal(l.bedroomsSource, "derived_from_type");
    assert.equal(poserValeur(l, "bedrooms", 0, "text_regex"), true);
    assert.deepEqual([l.bedrooms, l.isStudio], [0, true]);
  });

  it("une capacité ne se dérive pas ; des pièces ne comblent qu'un vide", () => {
    const l = annonce("Chalet");
    assert.equal(poserValeur(l, "capacity", 6, "derived_from_type"), true);
    assert.equal(l.capacitySource, "text_regex");
    assert.equal(poserValeur(l, "rooms", 3, "structured"), true);
    assert.equal(poserValeur(l, "rooms", 4, "structured"), false);
    assert.equal(
      poserValeur(l, "capacity", 0, "structured"),
      false,
      "0 personne n'est pas une capacité",
    );
  });

  it("valeurDuTexte : ce qu'un champ structuré de la fiche remplacerait", () => {
    const l = qualifierLogement(annonce("T3 6 personnes", { bedrooms: null }));
    assert.equal(valeurDuTexte(l, "capacity"), true);
    assert.equal(valeurDuTexte(l, "bedrooms"), true);
    assert.equal(valeurDuTexte(annonce("x", { capacity: 6 }), "capacity"), false);
  });
});

describe("chambresDesPieces : des chambres tirées des pièces", () => {
  it("« T3 » : 2 chambres tirées des pièces", () => {
    assert.equal(chambresDesPieces(qualifierLogement(annonce("T3 6 personnes"))), true);
  });

  it("des chambres écrites ou structurées ne le sont pas, un studio non plus", () => {
    assert.equal(chambresDesPieces(qualifierLogement(annonce("3 pièces, 2 chambres"))), false);
    assert.equal(chambresDesPieces(qualifierLogement(annonce("T3", { bedrooms: 2 }))), false);
    assert.equal(chambresDesPieces(qualifierLogement(annonce("Studio 2 personnes"))), false);
  });
});

describe("résidu : les annonces restées à null, journalisées", () => {
  const ligne = (id: string, capacity: number | null, bedrooms: number | null) => ({
    id,
    source: "Centrale",
    url: `https://c.fr/${id}`,
    capacity,
    bedrooms,
  });

  it("chaque champ introuvable est nommé", () => {
    const r = residuLogements([ligne("a", 4, 1), ligne("b", null, 2), ligne("c", null, null)]);
    assert.deepEqual(
      r.map((x) => [x.id, x.manque]),
      [
        ["b", ["capacity"]],
        ["c", ["capacity", "bedrooms"]],
      ],
    );
  });

  it("le journal compte par source et nomme chaque annonce avec son lien", () => {
    const lignes = journalResidu(
      residuLogements([ligne("b", null, 2), ligne("c", null, null)]),
      "les-2-alpes",
    );
    assert.match(lignes[0], /les-2-alpes : 2 annonces à null/);
    assert.match(lignes[0], /Centrale 2 sans capacité, 1 sans chambres/);
    assert.match(lignes[1], /Centrale b : capacité introuvable, /);
    assert.match(lignes[2], /Centrale c : capacité et chambres introuvables, https:\/\/c\.fr\/c/);
    assert.match(
      journalResidu(residuLogements([ligne("b", null, 2)]), "x")[0],
      /x : 1 annonce à null/,
    );
    assert.deepEqual(journalResidu([], "x"), []);
  });

  it("au-delà de la borne, le reste se compte", () => {
    const beaucoup = Array.from({ length: RESIDU_DETAIL_MAX + 5 }, (_, i) =>
      ligne(String(i), null, null),
    );
    const lignes = journalResidu(residuLogements(beaucoup), "x");
    assert.equal(lignes.length, RESIDU_DETAIL_MAX + 2);
    assert.match(lignes.at(-1) ?? "", /et 5 autres/);
  });
});

describe("codes d'agence en fin de titre (Vacanceole, Chamrousse)", () => {
  it("« 2P6 » : deux pièces pour six personnes, plus « 2 personnes » ; « 2P6C » avec une cabine", () => {
    const a = lireLogement("Les Cytises N°304 - 2P6");
    assert.deepEqual([a.capacite, a.pieces, a.chambresDerivees, a.cabine], [6, 2, 1, false]);
    const b = lireLogement("Les Marmottes N°311 - 2P6C");
    assert.deepEqual([b.capacite, b.pieces, b.cabine], [6, 2, true]);
    assert.deepEqual([lireLogement("V du Bachat Arolles A N°21 - 4P8").capacite, lireLogement("V du Bachat Arolles A N°21 - 4P8").pieces], [8, 4]);
  });

  it("« ST4 » : un studio pour quatre", () => {
    const s = lireLogement("Le Carina N°4 - ST4");
    assert.deepEqual([s.capacite, s.studio, s.pieces, s.chambresDerivees], [4, true, 1, 0]);
  });
});

describe("capacité écrite : un couchage n'est pas le logement ; nombres en lettres", () => {
  it("« 1 lit 2 personnes », « canapé convertible 2 personnes », « un lit pour 2 personnes » : rien", () => {
    assert.equal(lireLogement("une chambre (1 lit 2 personnes) avec volet").capacite, null);
    assert.equal(lireLogement("séjour avec canapé convertible 2 personnes").capacite, null);
    assert.equal(lireLogement("chalet avec un lit pour 2 personnes").capacite, null);
  });

  it("« pour 4 personnes », « Appartement 6 personnes » : le logement", () => {
    assert.equal(lireLogement("Studio neuf avec mezzanine et coin montagne pour 4 personnes").capacite, 4);
    assert.equal(lireLogement("Appartement 6 personnes, 1 lit 2 personnes").capacite, 6);
  });

  it("« une chambre », « deux chambres » étage par étage, « deux pièces » ; « dans une chambre » ne compte pas", () => {
    assert.equal(lireLogement("séjour-cuisine coin salon, une chambre (1 lit 2 personnes)").chambresEcrites, 1);
    assert.equal(lireLogement("Rez-de-chaussée : une chambre. 1er étage : deux chambres et une mezzanine").chambresEcrites, 3);
    assert.equal(lireLogement("lit bébé dans une chambre").chambresEcrites, null);
    assert.equal(lireLogement("deux pièces").pieces, 2);
  });
});
