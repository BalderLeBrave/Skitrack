import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compter,
  jugerLogement,
  motifNomHorsRegle,
  motifTypeHorsRegle,
  phrasesRegle,
  plierType,
  typeInconnu,
} from "./regleTypes.ts";

describe("Règle du propriétaire : les types publiés par les centrales", () => {
  it("garde les types relevés le 25 septembre 2026, et les connaît", () => {
    for (const t of [
      // Open System (Haute Maurienne Vanoise).
      "Appartement 4 pièces",
      "Studio",
      "Gîte 2 pièces",
      "Maison individuelle",
      "Chalet",
      // Orchestra (La Plagne), iResa (Les Arcs).
      "Appartement",
      "Appartments, studios",
      // Catégories Feratel (La Clusaz), sauf « Location » et « Hôtel ».
      "Chalet individuel",
      "Appartement dans chalet",
      "Résidence de tourisme",
      "Demi-Chalet",
      // Types commerciaux Arkiane (Pralognan).
      "2 pièces",
      "6 pièces",
      "Maison",
    ]) {
      assert.equal(motifTypeHorsRegle(t), null, t);
      assert.equal(typeInconnu(t), false, t);
    }
  });

  it("garde aussi une villa, un duplex, un meublé, un multipièces (types construits)", () => {
    for (const t of ["Villa", "Duplex 3 pièces", "Meublé de tourisme", "Multipièces"]) {
      assert.equal(motifTypeHorsRegle(t), null, t);
      assert.equal(typeInconnu(t), false, t);
    }
  });

  it("écarte chaque type de la liste, accents et casse ignorés", () => {
    const cas: [string, string][] = [
      ["Camping", "camping"],
      ["Emplacement de camping", "camping"],
      ["Hôtellerie de plein air", "camping"],
      ["Hébergement insolite", "hébergement insolite"],
      ["Tente", "hébergement insolite"],
      ["Yourte", "hébergement insolite"],
      ["Bulle", "hébergement insolite"],
      ["Tipi", "hébergement insolite"],
      ["Roulotte", "hébergement insolite"],
      ["Cabane dans les arbres", "hébergement insolite"],
      ["Mobil-home", "hébergement insolite"],
      ["Mobile home", "hébergement insolite"],
      ["Caravane", "hébergement insolite"],
      ["Bateau", "hébergement insolite"],
      ["Péniche", "hébergement insolite"],
      ["Igloo", "hébergement insolite"],
      ["Nuit en yourte", "hébergement insolite"],
      ["Refuge", "refuge"],
      ["Chambre d'hôtes", "chambre d'hôtes"],
      ["CHAMBRES D’HOTES", "chambre d'hôtes"],
      ["Maison d'hôtes", "chambre d'hôtes"],
      ["Chambre", "chambre seule"],
      ["Chambre double", "chambre seule"],
      ["Gîte d'étape", "gîte d'étape"],
      ["Gite de groupe", "gîte de groupe ou de séjour"],
      ["Gîte de séjour", "gîte de groupe ou de séjour"],
      ["Auberge de jeunesse", "auberge de jeunesse ou dortoir"],
      ["Dortoir", "auberge de jeunesse ou dortoir"],
      ["Hôtel", "hôtel"],
      ["Hôtels et résidences de tourisme", "hôtel"],
      ["Appart'hôtel", "appart'hôtel"],
      ["Apparthôtel", "appart'hôtel"],
      ["Appartement hôtelier", "appart'hôtel"],
      ["Résidence hôtelière", "résidence hôtelière"],
      ["Village club", "village club"],
      ["Village-club", "village club"],
    ];
    for (const [type, motif] of cas) assert.equal(motifTypeHorsRegle(type), motif, type);
  });

  it("un mot de la liste ne compte qu'entier : « multipièces » n'est pas un tipi", () => {
    assert.equal(motifTypeHorsRegle("Multipièces"), null);
    assert.equal(motifTypeHorsRegle("Appartement multipièces"), null);
    // « Chambres » y est un complément, pas le type.
    assert.equal(motifTypeHorsRegle("Appartement 2 chambres"), null);
  });

  it("un nom n'est pas un type : « Chalet Les Bulles », « Chalet de la cabane »", () => {
    for (const t of ["Chalet Les Bulles", "Chalet de la cabane", "Chalet de la Roulotte"]) {
      assert.equal(motifTypeHorsRegle(t), null, t);
      assert.equal(typeInconnu(t), false, t);
    }
  });

  it("un type publié inconnu est gardé, et signalé", () => {
    for (const t of ["Loft", "T2", "Mazot", "Penthouse", "Logement", "Location", "Ferme rénovée"]) {
      assert.equal(motifTypeHorsRegle(t), null, t);
      assert.equal(typeInconnu(t), true, t);
      assert.deepEqual(jugerLogement({ type: ` ${t} ` }), { motif: null, inconnu: t }, t);
    }
  });

  it("un type vide n'est pas jugé", () => {
    for (const t of ["", "   ", null, undefined]) {
      assert.equal(motifTypeHorsRegle(t), null);
      assert.equal(typeInconnu(t), false);
    }
  });

  it("plie accents et majuscules", () => {
    assert.equal(plierType("Gîte d'Étape"), "gite d'etape");
  });
});

describe("Règle du propriétaire : le camping dans un nom, jamais dans une adresse", () => {
  it("cherche le camping dans le titre et le chemin", () => {
    assert.equal(motifNomHorsRegle("CAMPING LA BUIDONNIERE***", null), "camping");
    assert.equal(
      motifNomHorsRegle("Chalet", "/dp7-camping-la-buidonniere-aussois/MARK-133812"),
      "camping",
    );
    assert.equal(motifNomHorsRegle("Le Bois Joli", "/dp75-le-bois-joli/OSMB-69279-3"), null);
    assert.equal(motifNomHorsRegle(), null);
  });

  it("une rue du Camping n'est pas un camping", () => {
    assert.equal(motifNomHorsRegle("Appartement 12 rue du Camping"), null);
    assert.equal(motifNomHorsRegle("Studio", "/dp75-studio-12-rue-du-camping-aussois/X-1"), null);
  });

  it("ne cherche aucun autre mot de la liste dans un nom", () => {
    for (const nom of ["Le Refuge", "Chalet Les Bulles", "Hôtel de Ville", "La Cabane", "Tipi"]) {
      assert.equal(motifNomHorsRegle(nom), null, nom);
    }
  });

  it("le verdict : le type d'abord, puis le camping du titre et du chemin", () => {
    assert.deepEqual(jugerLogement({ type: "Hôtel", titre: "Le Chalet" }), {
      motif: "hôtel",
      inconnu: null,
    });
    assert.deepEqual(jugerLogement({ type: "Chalet", titre: "CAMPING LA BUIDONNIERE***" }), {
      motif: "camping",
      inconnu: null,
    });
    assert.deepEqual(jugerLogement({ type: "Appartement 2 pièces", titre: "Le Refuge" }), {
      motif: null,
      inconnu: null,
    });
    assert.deepEqual(jugerLogement({ type: null, titre: "Les Balcons" }), {
      motif: null,
      inconnu: null,
    });
  });
});

describe("Règle du propriétaire : ce qui part au journal", () => {
  it("compte par motif et par type inconnu", () => {
    const ecartes = new Map<string, number>();
    const inconnus = new Map<string, number>();
    compter(ecartes, "hôtel");
    compter(ecartes, "hôtel");
    compter(ecartes, "camping");
    compter(inconnus, "Loft");
    assert.deepEqual(phrasesRegle(ecartes, inconnus), [
      "écartés hors règle — hôtel (2), camping (1)",
      "types inconnus gardés — Loft (1)",
    ]);
    assert.deepEqual(phrasesRegle(new Map(), new Map()), []);
  });
});
