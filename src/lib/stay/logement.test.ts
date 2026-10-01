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
    assert.match(lignes[2], /Centrale c : capacité et chambres introuvables, https:\/\/c\.fr\/c/);
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
