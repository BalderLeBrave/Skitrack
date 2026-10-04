import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decider, decisionDe, ecrireGrilles, empreinte, FICHIER_A_RELIRE_VIDE } from "./aRelire.ts";
import type { GrilleTarifaire } from "./tarifsPeriode.ts";

const grille = (prix: number): GrilleTarifaire =>
  ({
    id: "officiel:valberg:valberg:2026-27",
    saison: "2026-27",
    perimetre: { type: "station", cle: "valberg", nom: "Valberg" },
    stationIds: ["valberg"],
    periodes: [
      {
        libelle: "Saison entière",
        debut: "2026-12-01",
        fin: "2027-04-30",
        saisonEntiere: true,
        tarifs: [
          {
            duree: { type: "jours", jours: 1 },
            libelleDuree: "journée",
            categorie: "adulte",
            libelleCategorie: "Adultes",
            ages: null,
            prix,
            devise: "EUR",
            canal: "guichet",
            restriction: null,
          },
        ],
      },
    ],
    source: { origine: "officiel", url: "https://example.org", libelle: "Valberg" },
    scrapeLe: "2026-10-04",
    confiance: "moyenne",
    notes: [],
  }) as unknown as GrilleTarifaire;

describe("grilles mises de côté", () => {
  const f = {
    ...FICHIER_A_RELIRE_VIDE,
    aRelire: [{ grille: grille(8), confrontations: [], misDeCoteLe: "2026-10-04" }],
  };

  it("une décision sort la grille de la liste et vaut tant que les prix ne changent pas", () => {
    const apres = decider(f, grille(8).id, "ecartee", "2026-10-05");
    assert.equal(apres.aRelire.length, 0);
    assert.equal(decisionDe(apres, grille(8)), "ecartee");
    assert.equal(decisionDe(apres, grille(41)), null);
  });

  it("l'empreinte ignore la date du relevé", () => {
    assert.equal(empreinte(grille(8)), empreinte({ ...grille(8), scrapeLe: "2027-01-01" }));
  });

  it("le fichier s'écrit une grille par ligne et se relit", () => {
    const texte = ecrireGrilles({ genere: "2026-10-04" }, [grille(8), grille(9)]);
    assert.equal(texte.split("\n").length, 5);
    assert.equal(JSON.parse(texte).grilles[1].periodes[0].tarifs[0].prix, 9);
  });
});
