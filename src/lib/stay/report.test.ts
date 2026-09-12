import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildReport,
  fiabiliteLabel,
  origineForfait,
  posteDecide,
  type PosteInput,
  type ReportInput,
} from "./report.ts";

function base(over: Partial<ReportInput> = {}): ReportInput {
  return {
    stationName: "Les 2 Alpes",
    checkIn: "2027-02-06",
    checkOut: "2027-02-13",
    voyageurs: 8,
    postes: [],
    ...over,
  };
}

const LOGEMENT: PosteInput = { label: "Logement", montant: 2231, origine: "relevé" };
const FORFAITS: PosteInput = { label: "Forfaits", montant: 1560, origine: "relevé" };
const ROUTE: PosteInput = { label: "Carburant", montant: 240, origine: "estimé" };

describe("récapitulatif de séjour", () => {
  it("compte les nuits du séjour", () => {
    assert.equal(buildReport(base()).nuits, 7);
    assert.equal(buildReport(base({ checkIn: "2026-12-28", checkOut: "2027-01-04" })).nuits, 7);
  });

  it("le total additionne les postes connus, estimations comprises", () => {
    // Retrancher les estimations donnerait un total plus bas que la réalité :
    // la pire des deux erreurs possibles sur un budget.
    const r = buildReport(base({ postes: [LOGEMENT, FORFAITS, ROUTE] }));
    assert.equal(r.total, 4031);
    assert.equal(r.totalEstime, 240);
    assert.equal(r.postes.length, 3);
  });

  it("le prix par personne suit le groupe, et manque sans groupe", () => {
    assert.equal(buildReport(base({ postes: [LOGEMENT, FORFAITS] })).parPersonne, 3791 / 8);
    assert.equal(buildReport(base({ postes: [LOGEMENT], voyageurs: 0 })).parPersonne, null);
  });

  it("un poste sans montant part en manque, jamais en zéro", () => {
    // Une ligne à « — » dans un budget se lit comme un zéro à la troisième
    // relecture, et fausse toutes les additions faites de tête.
    const r = buildReport(
      base({ postes: [LOGEMENT, { label: "Cours ESF", montant: null, origine: "relevé" }] }),
    );
    assert.deepEqual(
      r.postes.map((p) => p.label),
      ["Logement"],
    );
    assert.equal(r.total, 2231);
    assert.ok(r.manques.some((m) => m.startsWith("Cours ESF")));
  });

  it("un forfait inconnu se dit, il ne se chiffre pas", () => {
    const r = buildReport(
      base({
        postes: [
          LOGEMENT,
          { label: "Forfaits", montant: null, origine: origineForfait(undefined) },
        ],
      }),
    );
    assert.equal(r.postes.length, 1);
    assert.ok(r.manques.some((m) => m.startsWith("Forfaits")));
  });

  it("le statut du forfait se traduit en origine", () => {
    assert.equal(origineForfait("ok"), "relevé");
    assert.equal(origineForfait("stale"), "relevé");
    assert.equal(origineForfait("manuel"), "saisi");
    assert.equal(origineForfait("estimé"), "estimé");
    assert.equal(origineForfait("erreur"), "inconnu");
    assert.equal(origineForfait(null), "inconnu");
  });

  it("un poste décidé à zéro est un néant, pas une estimation", () => {
    // Matériel décoché, aucun péage : zéro est exact, et personne n'a demandé
    // ce chiffre. Le marquer « estimé » puis l'inscrire dans les manques
    // reprocherait à l'application de ne pas avoir relevé ce qu'on lui a dit
    // d'ignorer.
    const materiel = posteDecide("Location de matériel", 0);
    assert.equal(materiel.origine, "néant");
    const r = buildReport(base({ postes: [LOGEMENT, materiel] }));
    assert.equal(r.postes[1].origine, "néant");
    assert.equal(r.postes[1].montant, 0);
    assert.equal(r.totalEstime, 0);
    assert.equal(r.manques.length, 0);
    // Au-dessus de zéro, l'origine passée fait foi.
    assert.equal(posteDecide("Location de matériel", 320).origine, "estimé");
    assert.equal(posteDecide("Péages", 74, "saisi").origine, "saisi");
  });

  it("la part estimée est annoncée, pas un chiffre net", () => {
    const r = buildReport(base({ postes: [LOGEMENT, FORFAITS, ROUTE] }));
    const texte = fiabiliteLabel(r);
    assert.match(texte, /estimés/);
    assert.match(texte, /6 %/); // 240 / 4031
    const sansEstime = buildReport(base({ postes: [LOGEMENT, FORFAITS] }));
    assert.match(fiabiliteLabel(sansEstime), /Aucune estimation/);
    assert.match(fiabiliteLabel(buildReport(base())), /ne chiffre rien/);
  });

  it("un extra sans montant part en manque", () => {
    const r = buildReport(
      base({
        postes: [LOGEMENT, { label: "Taxe de séjour", montant: null, origine: "inconnu" }],
        manquesAutres: ["Le logement n’a pas de position : la carte ne le situe pas."],
      }),
    );
    assert.equal(r.manques.length, 2);
    assert.ok(r.manques.some((m) => m.startsWith("Taxe de séjour")));
    assert.ok(r.manques.some((m) => m.includes("position")));
  });

  it("des dates illisibles sont signalées, pas contournées", () => {
    const r = buildReport(base({ checkIn: "2027-02-30", postes: [LOGEMENT] }));
    assert.equal(r.nuits, null);
    assert.ok(r.manques.some((m) => m.includes("illisibles")));
    // Le budget reste chiffré : une date fausse n'efface pas un prix relevé.
    assert.equal(r.total, 2231);
  });

  it("un départ avant l'arrivée est signalé aussi", () => {
    const r = buildReport(base({ checkIn: "2027-02-13", checkOut: "2027-02-06" }));
    assert.equal(r.nuits, -7);
    assert.ok(r.manques.some((m) => m.includes("ne suit pas")));
  });
});
