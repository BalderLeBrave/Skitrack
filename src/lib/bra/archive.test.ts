import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cheminJour,
  codeDuNomArchive,
  dernierDuMassif,
  jourLisible,
  lireIndexJour,
  lireSousDossiers,
  plierNomMassif,
} from "./archive.ts";
import { idMassif, lieuLisible, parseBulletin } from "./parse.ts";

const fixture = (nom: string) => readFileSync(new URL(`./fixtures/${nom}`, import.meta.url), "utf8");

/**
 * Relevé du 15 mars 2026 : le nom de fichier de chaque bulletin de l'archive,
 * et l'attribut `ID` lu dans le fichier. C'est la vérité à laquelle le
 * rapprochement par nom doit aboutir, massif par massif.
 */
const ID_LU: [string, number][] = [
  ["Aravis", 2], ["Aspe Ossau", 65], ["Aure Louron", 67], ["Bauges", 4], ["Beaufortain", 5],
  ["Belledonne", 8], ["Capcir Puymorens", 73], ["Cerdagne Canigou", 74], ["Chablais", 1],
  ["Champsaur", 19], ["Chartreuse", 7], ["Cinto Rotondo", 40], ["Couserans", 69], ["Devoluy", 18],
  ["Embrunais Parpaillon", 20], ["Grandes-Rousses", 12], ["Haut-Var Haut-Verdon", 22],
  ["Haute-Ariege", 70], ["Haute-Bigorre", 66], ["Haute-Maurienne", 11], ["Haute-Tarentaise", 6],
  ["Luchonnais", 68], ["Maurienne", 9], ["Mercantour", 23], ["Mont-Blanc", 3], ["Oisans", 15],
  ["Orlu St-Barthelemy", 72], ["Pays-Basque", 64], ["Pelvoux", 16], ["Queyras", 17],
  ["Renoso Incudine", 41], ["Thabor", 13], ["Ubaye", 21], ["Vanoise", 10], ["Vercors", 14],
];

describe("archive publique du BRA", () => {
  it("rapproche chaque nom de fichier du code que le fichier porte", () => {
    for (const [nom, id] of ID_LU) assert.equal(codeDuNomArchive(nom), id, nom);
  });

  it("replie les graphies de l'archive et de la table sur la même forme", () => {
    assert.equal(plierNomMassif("Orlu-Saint-Barthélemy"), plierNomMassif("Orlu St-Barthelemy"));
    assert.equal(plierNomMassif("Dévoluy"), "devoluy");
    assert.equal(codeDuNomArchive("Massif inconnu"), null);
  });

  it("lit l'index d'un jour : 37 bulletins, noms décodés, adresses absolues", () => {
    const fichiers = lireIndexJour(fixture("index-2026-03-15.html"));
    assert.equal(fichiers.length, 37);
    const orlu = fichiers.find((f) => f.code === 72)!;
    assert.equal(orlu.nom, "Orlu St-Barthelemy");
    assert.equal(orlu.horodatage, "20260315155300");
    assert.match(orlu.url, /^https:\/\/files\.data\.gouv\.fr\/meteofrance\/data\/BULLETIN\/BRA\/2026\/03\/15\/xml\//);
    assert.ok(fichiers.every((f) => f.code != null), "tous les massifs de l'index sont reconnus");
  });

  it("retient le bulletin le plus récent d'un massif qui en publie deux", () => {
    const fichiers = lireIndexJour(fixture("index-2026-03-15.html"));
    assert.equal(dernierDuMassif(fichiers, 8)?.horodatage, "20260315160500");
    assert.equal(dernierDuMassif(fichiers, 11)?.horodatage, "20260315160900");
    assert.equal(dernierDuMassif(fichiers, 999), null);
  });

  it("ne suit que l'arborescence du BRA", () => {
    const html =
      '<a href="https://ailleurs.example/x/xml/Aravis_20260315160900.xml">x</a>' +
      '<a href="/autre/xml/Aravis_20260315160900.xml">y</a>' +
      '<a href="/meteofrance/data/BULLETIN/BRA/2026/03/15/xml/Aravis_20260315160900.xml">z</a>';
    const f = lireIndexJour(html);
    assert.equal(f.length, 1);
    assert.equal(f[0]!.url, "https://files.data.gouv.fr/meteofrance/data/BULLETIN/BRA/2026/03/15/xml/Aravis_20260315160900.xml");
  });

  it("un index sans fichier ne rend rien", () => {
    const vide = "<html><head><title>No Files Available for Listing</title></head><body></body></html>";
    assert.deepEqual(lireIndexJour(vide), []);
  });

  it("lit les années de la racine, dans l'ordre", () => {
    const annees = lireSousDossiers(fixture("index-racine.html"));
    assert.equal(annees[0], "2016");
    assert.ok(annees.includes("2026"));
    assert.deepEqual([...annees].sort(), annees);
  });

  it("date le chemin du jour à l'heure de Paris", () => {
    // 23 h 30 UTC le 31 décembre : déjà le 1er janvier à Paris.
    assert.equal(cheminJour(new Date("2025-12-31T23:30:00Z")), "2026/01/01");
    assert.equal(cheminJour(new Date("2026-03-15T12:00:00Z"), 1), "2026/03/14");
    assert.equal(jourLisible("2026/06/07"), "7 juin 2026");
    assert.equal(jourLisible("pas un chemin"), null);
  });
});

describe("bulletin de l'archive", () => {
  const xml = fixture("aravis-2026-03-15.xml");

  it("se lit comme celui de l'API", () => {
    const b = parseBulletin(2, xml);
    assert.equal(b.ok, true);
    assert.equal(b.risk, 3);
    assert.equal(b.risk1, 2);
    assert.equal(b.risk2, 3);
    assert.equal(b.altitude, 1800);
    assert.equal(b.issuedAt, "2026-03-15T16:00:00");
    assert.equal(b.validUntil, "2026-03-16T18:00:00");
  });

  it("décode les entités : « <1800 », pas « &lt;1800 »", () => {
    const b = parseBulletin(2, xml);
    assert.equal(b.loc1, "<1800");
    assert.equal(b.loc2, ">1800");
    assert.equal(lieuLisible(b.loc1), "sous 1 800 m");
    assert.equal(lieuLisible(b.loc2), "au-dessus de 1 800 m");
    assert.equal(lieuLisible("au-dessus de 2200 m"), "au-dessus de 2200 m");
    assert.equal(lieuLisible(null), null);
  });

  it("porte le code de son massif", () => {
    assert.equal(idMassif(xml), 2);
    assert.equal(idMassif("<BULLETINS_NEIGE_AVALANCHE MASSIF=\"x\">"), null);
  });
});
