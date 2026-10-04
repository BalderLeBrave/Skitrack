import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  categoriesDans,
  lireGrille,
  prixDeCellule,
  type Lecture,
  type TarifLu,
} from "./lecteurGrille.ts";
import { lignesDepuisHtml, lignesDepuisMarkdown } from "./texteStructure.ts";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "tarifs");
const page = (f: string) => lignesDepuisMarkdown(readFileSync(join(dir, f), "utf8"));
const S = "2026-27";

/** « 1 jour|adulte|78 » : de quoi comparer d'un coup d'œil. */
const court = (t: TarifLu) => `${t.tarif.libelleDuree}|${t.tarif.categorie}|${t.tarif.prix}`;
const dans = (l: Lecture, f: (t: TarifLu) => boolean) => l.tarifs.filter(f).map(court);

describe("lecture d'une grille : Tignes", () => {
  const l = lireGrille(page("tignes.md"), {
    saison: S,
    perimetres: [
      { cle: "domaine", motif: /val d'?isere/ },
      { cle: "station", motif: /tignes/ },
    ],
  });

  it("quatre périodes, chacune sous son titre et ses dates", () => {
    const periodes = [
      ...new Set(
        l.tarifs.map(
          (t) => `${t.periode?.libelle}|${t.periode?.plages.map((p) => `${p.debut}>${p.fin}`)}`,
        ),
      ),
    ];
    assert.deepEqual(periodes, [
      "Opening et première semaine|2026-11-21>2026-11-27",
      "Avant-première|2026-11-28>2026-12-11",
      "Hiver 2026-2027|2026-12-12>2027-04-23",
      "Closing dernière semaine|2027-04-24>2027-05-02",
    ]);
  });

  it("le domaine relié et la station seule, chacun sous son titre", () => {
    const hiver = (t: TarifLu) =>
      t.periode?.libelle === "Hiver 2026-2027" && t.tarif.categorie === "adulte";
    assert.deepEqual(
      dans(l, (t) => hiver(t) && t.perimetre === "domaine"),
      ["1/2 journée (après-midi)|adulte|63", "1 jour|adulte|78", "6 jours = 7 jours|adulte|468"],
    );
    assert.deepEqual(
      dans(l, (t) => hiver(t) && t.perimetre === "station"),
      ["4 heures|adulte|63", "1 jour|adulte|70"],
    );
  });

  it("une colonne à deux catégories range ses âges dans l'ordre", () => {
    const six = l.tarifs.filter(
      (t) =>
        t.periode?.libelle === "Hiver 2026-2027" &&
        t.tarif.duree.type === "jours" &&
        t.tarif.duree.jours === 6,
    );
    assert.deepEqual(
      six.map((t) => [t.tarif.categorie, t.tarif.ages, t.tarif.prix]),
      [
        ["adulte", { min: 19, max: 64 }, 468],
        ["enfant", { min: 8, max: 18 }, 378],
        ["senior", { min: 65, max: 74 }, 378],
      ],
    );
  });

  it("« Tout public, tarif unique » est un tarif adulte, et le dit", () => {
    const opening = l.tarifs.filter((t) => t.periode?.libelle.startsWith("Opening"));
    assert.deepEqual(opening.map(court), ["1 jour|adulte|50"]);
    assert.equal(opening[0].tarif.libelleCategorie, "Tout public Tarif unique");
    assert.equal(opening[0].perimetre, "station");
  });
});

describe("lecture d'une grille : Les Orres, périodes en colonnes", () => {
  const l = lireGrille(page("orres.md"), { saison: S });
  const periode = (t: TarifLu) => t.periode?.libelle.split(" Du ")[0];

  it("chaque colonne prend la période qui la coiffe", () => {
    const journee = l.tarifs.filter((t) => t.tarif.libelleDuree === "Journée");
    assert.deepEqual(
      journee.map((t) => `${periode(t)}|${t.tarif.categorie}|${t.tarif.prix}`),
      [
        "HAUTE SAISON|adulte|45.5",
        "HAUTE SAISON|enfant|38",
        "MOYENNE SAISON|adulte|38.5",
        "MOYENNE SAISON|enfant|32.5",
        "BASSE SAISON|adulte|34",
        "BASSE SAISON|enfant|28.5",
      ],
    );
    const moyenne = journee.find((t) => periode(t) === "MOYENNE SAISON")!;
    assert.deepEqual(moyenne.periode?.plages, [
      { debut: "2026-12-12", fin: "2026-12-18" },
      { debut: "2027-03-20", fin: "2027-03-26" },
    ]);
  });

  it("le prix public, pas la promotion entre parenthèses", () => {
    assert.ok(
      !l.tarifs.some(
        (t) => [43.2, 36.1, 227].includes(t.tarif.prix) && t.tarif.restriction == null,
      ),
    );
  });

  it("hors sujet écarté, conditions gardées avec leur restriction", () => {
    assert.ok(!l.tarifs.some((t) => /pi[ée]ton|ticket|d[ée]butant/i.test(t.tarif.libelleDuree)));
    const tribu = l.tarifs.filter((t) => t.tarif.restriction === "tribu ou famille");
    assert.deepEqual(tribu.map(court), [
      "6 jours consécutifs (4)|adulte|220",
      "6 jours consécutifs (4)|enfant|183",
    ]);
    assert.equal(
      l.tarifs.find((t) => t.tarif.libelleDuree.startsWith("Saison pré-primeur"))?.tarif
        .restriction,
      "achat anticipé",
    );
    assert.equal(
      l.tarifs.find((t) => t.tarif.libelleDuree.startsWith("Journée supp"))?.tarif.restriction,
      "complément",
    );
  });

  it("une catégorie écrite dans la ligne l'emporte sur la colonne", () => {
    assert.ok(l.tarifs.some((t) => t.tarif.categorie === "etudiant" && t.tarif.prix === 38));
    assert.ok(l.tarifs.some((t) => t.tarif.categorie === "senior" && t.tarif.prix === 239));
  });
});

describe("lecture d'une grille : N'PY, une catégorie par tableau", () => {
  const l = lireGrille(page("npy-tourmalet.md"), { saison: S });

  it("colonne publique retenue, colonnes d'abonnement écartées", () => {
    assert.deepEqual(l.tarifs.map(court), [
      "Tarif 1 jour|adulte|55",
      "Tarif 2 jours|adulte|110",
      "Tarif 6 Jours|adulte|294",
      "Tarif 7 jours|adulte|345",
      "Tarif 1 jour|enfant|50",
      "Tarif 6 Jours|enfant|267",
    ]);
    assert.ok(l.tarifs.every((t) => t.tarif.canal === "caisse"));
  });

  it("une date limite de promotion ne date pas les tarifs", () => {
    assert.ok(l.tarifs.every((t) => t.periode == null));
    assert.ok(l.saisons.includes(S));
  });
});

describe("lecture d'une grille : Valmorel, boutique eLiberty", () => {
  const l = lireGrille(page("valmorel.md"), {
    saison: S,
    perimetres: [
      { cle: "domaine", motif: /grand domaine/ },
      { cle: "station", motif: /valmorel/ },
    ],
  });

  it("le domaine relié et la station seule", () => {
    assert.deepEqual(
      dans(
        l,
        (t) =>
          t.perimetre === "domaine" &&
          t.tarif.categorie === "adulte" &&
          t.tarif.restriction == null &&
          t.tarif.duree.type === "jours",
      ),
      [
        "Journée|adulte|59.7",
        "2 jours|adulte|111.2",
        "6 jours|adulte|299.9",
        "7 jours|adulte|338.1",
      ],
    );
    assert.deepEqual(
      dans(l, (t) => t.perimetre === "station" && t.tarif.categorie === "adulte"),
      ["4 heures consécutives|adulte|49", "Journée|adulte|56.1"],
    );
  });

  it("piéton, assurance, débutants écartés ; promotions et tribu restreintes", () => {
    assert.ok(!l.tarifs.some((t) => [18.9, 3.5, 21, 37.7].includes(t.tarif.prix)));
    assert.ok(
      l.tarifs
        .filter((t) => t.tarif.prix === 269.9 && t.tarif.categorie === "adulte")
        .every((t) => t.tarif.restriction === "tribu ou famille"),
    );
    const flash = l.tarifs.filter((t) => t.tarif.libelleDuree.includes("octobre"));
    assert.ok(
      flash.length &&
        flash.every((t) => t.tarif.restriction === "achat anticipé" && t.periode == null),
    );
    assert.equal(flash[0].tarif.prix, 825, "le prix barré est le prix public");
  });

  it("« Tarif unique » sous « Forfaits étudiants » : tarif étudiant", () => {
    assert.deepEqual(
      dans(l, (t) => t.tarif.categorie === "etudiant"),
      ["Journée|etudiant|50.5", "6 jours|etudiant|269.9"],
    );
  });
});

describe("lecture d'une grille : Auron, saisons définies puis rappelées", () => {
  const l = lireGrille(page("auron.md"), { saison: S });

  it("les lignes « HAUTE SAISON » et « BASSE SAISON » posent leurs dates", () => {
    const six = l.tarifs.filter(
      (t) => t.tarif.categorie === "adulte" && t.tarif.libelleDuree === "6 jours consécutifs",
    );
    assert.deepEqual(
      six.map((t) => [t.periode?.libelle, t.periode?.plages.length, t.tarif.prix]),
      [
        ["Haute saison", 2, 217],
        ["Basse saison", 3, 188.8],
      ],
    );
  });

  it("une colonne à trois catégories donne trois tarifs", () => {
    const un = l.tarifs.filter(
      (t) => t.periode?.libelle === "Haute saison" && t.tarif.libelleDuree === "1 jour",
    );
    assert.deepEqual(
      un.map(
        (t) => `${t.tarif.categorie}|${t.tarif.ages?.min}-${t.tarif.ages?.max}|${t.tarif.prix}`,
      ),
      [
        "adulte|26-61|44",
        "junior|12-17|37",
        "junior|18-25|37",
        "senior|62-71|37",
        "enfant|5-11|33.7",
      ],
    );
  });
});

describe("lecture d'une grille : ce qui ne se lit pas sans deviner", () => {
  it("Châtel : plusieurs prix par case, sans dire lesquels", () => {
    const l = lireGrille(page("chatel.md"), { saison: S });
    // Seul le « 5 x 1 jour » a un prix par case : un produit restreint, qui
    // n'entre dans aucun prix de séjour.
    assert.ok(l.tarifs.length > 0);
    assert.ok(l.tarifs.every((t) => t.tarif.restriction === "jours non consécutifs"));
    assert.ok(l.problemes.length >= 2 && l.problemes.every((p) => p.includes("plusieurs prix")));
  });

  it("une colonne sans catégorie est signalée", () => {
    const l = lireGrille(["| Durée | Colonne A | Colonne B |", "| 1 jour | 40 € | 30 € |"], {
      saison: S,
    });
    assert.equal(l.tarifs.length, 0);
    assert.equal(l.problemes.length, 2);
  });
});

describe("lecture d'une grille : pages des petites stations (30 septembre 2026)", () => {
  it("« remontées mécaniques » dans un titre n'écarte pas la grille (La Schlucht)", () => {
    const l = lireGrille(
      [
        "## Ouverture & horaires des remontées mécaniques de la Schlucht",
        "Nos forfaits de ski La Schlucht 2025/2026",
        "| Les forfaits | Enfant 6 à 12 ans | Adulte à partir de 13 ans |",
        "| 1 jour | 17,50 € | 19,70€ |",
        "| 2 jours consécutifs | 34,60 € | 39 € |",
      ],
      { saison: S },
    );
    assert.deepEqual(
      l.tarifs.map((t) => [t.tarif.libelleDuree, t.tarif.categorie, t.tarif.prix]),
      [
        ["1 jour", "enfant", 17.5],
        ["1 jour", "adulte", 19.7],
        ["2 jours consécutifs", "enfant", 34.6],
        ["2 jours consécutifs", "adulte", 39],
      ],
    );
  });

  it("une « montée » seule reste hors sujet", () => {
    const l = lireGrille(["## Montée unique piéton", "| Montée | Adulte |", "| 1 jour | 9 € |"], {
      saison: S,
    });
    assert.equal(l.tarifs.length, 0);
  });

  it("un « livret de famille » demandé en justificatif ne fait pas un tarif famille (Bernex)", () => {
    const l = lireGrille(
      [
        "#### Pour les enfants de moins de 5 ans : forfait saison gratuit, sur présentation d'un livret de famille.",
        "| | ADULTE 16 à 69 ans | JEUNE 5 à 15 ans |",
        "| 6 Jours Bernex | 156.00 € | 131.50 € |",
      ],
      { saison: S },
    );
    assert.deepEqual(
      l.tarifs.map((t) => [t.tarif.categorie, t.tarif.prix, t.tarif.restriction]),
      [
        ["adulte", 156, null],
        ["junior", 131.5, null],
      ],
    );
  });

  it("un intertitre en paragraphe (« ► Menthières ») ouvre la section de son périmètre, le suivant la referme", () => {
    const l = lireGrille(
      [
        "## Tarifs hiver 2026-2027",
        "| | Adulte (16 ans et +) | Enfant (5 à 15 ans) |",
        "| 1 jour | 38 € | 28 € |",
        "► Menthières",
        "| | Adulte (16 ans et +) | Enfant (5 à 15 ans) |",
        "| 1 jour | 19 € | 19 € |",
        "► Séjour",
        "| | Adulte (16 ans et +) | Enfant (5 à 15 ans) |",
        "| 6 jours | 180 € | 130 € |",
      ],
      {
        saison: S,
        perimetres: [{ cle: "station:menthieres", motif: /menthieres/ }],
      },
    );
    assert.deepEqual(
      l.tarifs.map((t) => [t.perimetre, t.tarif.libelleDuree, t.tarif.prix]),
      [
        [null, "1 jour", 38],
        [null, "1 jour", 28],
        ["station:menthieres", "1 jour", 19],
        ["station:menthieres", "1 jour", 19],
        [null, "6 jours", 180],
        [null, "6 jours", 130],
      ],
    );
  });
});

describe("lecture d'une grille : texte d'un PDF", () => {
  const lignes = readFileSync(join(dir, "orelle-pdf.txt"), "utf8").split("\n");
  const l = lireGrille(lignes, { saison: S });

  it("les colonnes de la ligne d'en-tête, âges compris ; la période de la ligne de dates", () => {
    const un = l.tarifs.filter((t) => t.tarif.libelleDuree === "1 jour");
    assert.deepEqual(
      un.map((t) => [t.tarif.categorie, t.tarif.ages, t.tarif.prix]),
      [
        ["adulte", { min: 18, max: 74 }, 75.7],
        ["junior", { min: 5, max: 17 }, 62],
        ["senior", { min: 75, max: null }, 18.9],
      ],
    );
    assert.deepEqual(un[0].periode?.plages, [
      { debut: "2026-12-05", fin: "2026-12-18" },
      { debut: "2027-04-10", fin: "2027-04-18" },
    ]);
  });

  it("la colonne famille est gardée, restreinte ; une plage « 8-21 jours » n'est pas une durée", () => {
    assert.equal(
      l.tarifs.find((t) => t.tarif.categorie === "famille" && t.tarif.libelleDuree === "6 jours")
        ?.tarif.restriction,
      "tribu ou famille",
    );
    assert.ok(!l.tarifs.some((t) => t.tarif.prix === 28));
    assert.ok(!l.tarifs.some((t) => t.tarif.prix === 3.5));
  });
});

describe("lecture d'une grille : depuis une page HTML", () => {
  it("colspan, prix barré et période en titre", () => {
    const l = lireGrille(
      lignesDepuisHtml(`<h2>Vacances de février</h2>
        <table><tr><th>Durée</th><th>Adulte</th><th>Enfant (5-12 ans)</th></tr>
        <tr><td>6 jours</td><td>260 € <s>312 €</s></td><td>210 €</td></tr></table>`),
      { saison: S },
    );
    assert.deepEqual(l.tarifs.map(court), ["6 jours|adulte|312", "6 jours|enfant|210"]);
    assert.deepEqual(l.tarifs[0].periode?.plages, [{ debut: "2027-02-06", fin: "2027-03-07" }]);
  });
});

describe("cellules et en-têtes", () => {
  it("le prix d'une case", () => {
    assert.deepEqual(prixDeCellule("45,50 € (43,20 €)*"), { prix: 45.5, ambigu: false });
    assert.deepEqual(prixDeCellule("**495,00 €** ~~825,00 €~~"), { prix: 825, ambigu: false });
    assert.deepEqual(prixDeCellule("1 108 €"), { prix: 1108, ambigu: false });
    assert.deepEqual(prixDeCellule("5.00€ / jour"), { prix: 5, ambigu: false });
    assert.deepEqual(prixDeCellule("55 €47 €55 €"), { prix: null, ambigu: true });
    assert.deepEqual(prixDeCellule("-"), { prix: null, ambigu: false });
  });

  it("« Domaine » n'est pas un aîné, « Adulte19 – 64 ans » est un adulte", () => {
    assert.deepEqual(categoriesDans("Domaine de Tignes"), []);
    assert.deepEqual(
      categoriesDans("Adulte19 – 64 ans").map((c) => [c.categorie, c.ages]),
      [["adulte", { min: 19, max: 64 }]],
    );
  });
});

describe("lecture d'un PDF bilingue : Les 3 Vallées, Saint-Martin", () => {
  // La mise en page du PDF officiel : une catégorie par ligne, sa traduction,
  // la durée doublée en anglais, et la ligne de dates de la page 2 après ses tarifs.
  const lignes = [
    "# Page 1",
    "05/12/2026 - 18/12/2026 | 10/04/2027 - 18/04/2027",
    "LES 3 VALLÉES SKI PASS 2026 - 2027",
    "Adulte",
    "18/74ans",
    "Adult",
    "18/74 years",
    "Enfant",
    "5/17 ans",
    "Child",
    "Vétéran",
    "75 ans +",
    "Veteran",
    "1 jour | 1day 75,70 € 62,00 € 18,90 €",
    "6 jours | 6 days 378,50 € 310,00 € 94,50 € 310,00 €",
    "# Page 2",
    "LES MENUIRES ST MARTIN SKI PASS 2026 - 2027",
    "TARIFS",
    "Consecutive days Adulte",
    "18/74 ans",
    "Enfant",
    "5/17 ans",
    "6 jours | 6 days 350,00 € 287,00 €",
    "Insurance is payable even on free passes.",
    "19/12/2026 - 09/04/2027",
  ];
  const l = lireGrille(lignes, {
    saison: S,
    perimetres: [
      { cle: "3v", motif: /3 vallees/ },
      { cle: "station", motif: /menuires|st martin/ },
    ],
  });

  it("les catégories empilées ligne à ligne, âges compris", () => {
    assert.deepEqual(l.problemes, []);
    const p1 = l.tarifs.filter((t) => t.perimetre === "3v");
    assert.deepEqual(p1.map(court), [
      "1 jour|adulte|75.7",
      "1 jour|enfant|62",
      "1 jour|senior|18.9",
      "6 jours|adulte|378.5",
      "6 jours|enfant|310",
      "6 jours|senior|94.5",
    ]);
    assert.deepEqual(p1[0].tarif.ages, { min: 18, max: 74 });
    assert.deepEqual(p1[0].periode?.plages, [
      { debut: "2026-12-05", fin: "2026-12-18" },
      { debut: "2027-04-10", fin: "2027-04-18" },
    ]);
  });

  it("le bandeau de page nomme le périmètre, la ligne de dates finale date la page", () => {
    const p2 = l.tarifs.filter((t) => t.perimetre === "station");
    assert.deepEqual(p2.map(court), ["6 jours|adulte|350", "6 jours|enfant|287"]);
    assert.deepEqual(p2[0].periode?.plages, [{ debut: "2026-12-19", fin: "2027-04-09" }]);
  });
});
