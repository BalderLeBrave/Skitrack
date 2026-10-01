import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aUnPrixSkiresort,
  ficheSkipassDe,
  grilleSkipass,
  grilleSkiresort,
  lireForfaitSkipass,
  lireListeSkipass,
  rattacherAuxFiches,
  type FicheSkiresort,
} from "./temoins.ts";
import { lignesDepuisHtml, lignesDepuisMarkdown } from "./texteStructure.ts";
import { confronter, fourchetteAdulte } from "./verification.ts";
import type { GrilleTarifaire } from "./tarifsPeriode.ts";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "temoins");
const lire = (f: string) => readFileSync(join(dir, f), "utf8");

describe("témoin skipass.com : la liste des pages de prix", () => {
  const liste = lireListeSkipass(lire("skipass-liste.html"));

  it("un lien par station, nom décodé, sans doublon", () => {
    assert.equal(liste.length, 7);
    assert.deepEqual(liste[3], {
      slug: "chatel",
      nom: "Châtel",
      url: "https://www.skipass.com/stations/forfait-chatel.html",
    });
    assert.equal(liste[6].nom, "Station des Rousses - Jura sur Léman");
  });

  it("le rattachement par nom : le slug, puis le nom de la station ou de son domaine", () => {
    assert.equal(ficheSkipassDe({ id: "chatel", name: "Châtel", domain: null }, liste), "chatel");
    assert.equal(
      ficheSkipassDe(
        { id: "besse-super-besse", name: "Besse Super Besse", domain: "Le Sancy" },
        liste,
      ),
      "Super-Besse",
    );
    assert.equal(
      ficheSkipassDe({ id: "monts-jura", name: "Monts Jura", domain: "Monts Jura" }, liste),
      "Lelex",
    );
    assert.equal(
      ficheSkipassDe(
        { id: "saint-hilaire-du-touvet", name: "Saint Hilaire du Touvet", domain: null },
        liste,
      ),
      "St-Hilaire-du-Touvet",
    );
    assert.equal(
      ficheSkipassDe({ id: "meribel", name: "Méribel", domain: "Les 3 Vallées" }, liste),
      null,
    );
  });
});

describe("témoin skipass.com : la page d'une station", () => {
  const chatel = lireForfaitSkipass(lignesDepuisMarkdown(lire("skipass-chatel.md")), {
    slug: "chatel",
    nom: "Châtel",
    url: "https://www.skipass.com/stations/forfait-chatel.html",
  });

  it("Châtel : période, date de mise à jour, quatre durées en fourchette", () => {
    assert.deepEqual(chatel.validite, { debut: "2025-10-01", fin: "2026-10-01" });
    assert.equal(chatel.maj, "9 décembre 2025");
    assert.deepEqual(
      chatel.lignes.map((l) => [l.duree, l.adulte, l.enfant]),
      [
        ["Demi-journée", { min: 46, max: 48 }, { min: 35, max: 36 }],
        ["Journée", { min: 53, max: 56 }, { min: 40, max: 42 }],
        ["Semaine", { min: 286, max: 295 }, { min: 217, max: 224 }],
        ["Saison", { min: 757, max: 757 }, { min: 568, max: 568 }],
      ],
    );
  });

  it("la page telle que servie (HTML) se lit comme sa version Markdown", () => {
    const html = lireForfaitSkipass(lignesDepuisHtml(lire("skipass-chatel.html")), {
      slug: "chatel",
      nom: "Châtel",
      url: "https://www.skipass.com/stations/forfait-chatel.html",
    });
    assert.deepEqual(html, chatel);
  });

  it("Chamrousse : un prix en lien, un « - » qui n'est pas un prix", () => {
    const f = lireForfaitSkipass(lignesDepuisMarkdown(lire("skipass-chamrousse.md")), {
      slug: "chamrousse",
      nom: "Chamrousse",
      url: "https://www.skipass.com/stations/forfait-chamrousse.html",
    });
    assert.deepEqual(f.lignes, [
      {
        duree: "Journée",
        adulte: { min: 44, max: 44 },
        enfant: { min: 28.5, max: 28.5 },
        etudiant: null,
      },
    ]);
    assert.equal(f.maj, "30 septembre 2026");
  });

  it("la grille témoin : saison de la validité, fourchette en deux tarifs, semaine = 6 jours", () => {
    const g = grilleSkipass(chatel, "2026-09-30")!;
    assert.equal(g.saison, "2025-26");
    assert.equal(g.source.origine, "skipass");
    assert.deepEqual(fourchetteAdulte(g, 1), { min: 53, max: 56 });
    assert.deepEqual(fourchetteAdulte(g, 6), { min: 286, max: 295 });
  });
});

describe("témoin skiresort.fr", () => {
  const PDS: FicheSkiresort = {
    slug: "les-portes-du-soleil-morzine-avoriaz-les-gets-chatel-morgins-champery",
    nom: "Les Portes du Soleil",
    pays: "Suisse",
    libelle: "Forfait journalier Haute saison",
    prix: {
      adultes: { valeur: 72, devise: "EUR" },
      jeunes: { valeur: 65, devise: "EUR" },
      enfants: { valeur: 54, devise: "EUR" },
    },
  };

  it("la journée haute saison, adulte, jeune et enfant, saison du relevé", () => {
    const g = grilleSkiresort(PDS, "2026-09-21")!;
    assert.equal(g.saison, "2026-27");
    assert.equal(g.source.origine, "skiresort");
    assert.deepEqual(fourchetteAdulte(g, 1), { min: 72, max: 72 });
    assert.deepEqual(
      g.periodes[0].tarifs.map((t) => [t.categorie, t.prix]),
      [
        ["adulte", 72],
        ["junior", 65],
        ["enfant", 54],
      ],
    );
  });

  it("une fiche sans prix n'est pas un témoin", () => {
    assert.equal(aUnPrixSkiresort({ ...PDS, prix: null }), false);
    assert.equal(grilleSkiresort({ ...PDS, prix: null }, "2026-09-21"), null);
  });

  it("face à une grille officielle : la journée se compare, le 6 jours manque au témoin", () => {
    const officielle: GrilleTarifaire = {
      ...grilleSkiresort(PDS, "2026-09-21")!,
      id: "officiel:pds",
      source: { origine: "officiel", url: null, libelle: "officiel" },
      periodes: [
        {
          libelle: "Plein tarif",
          debut: "2026-12-19",
          fin: "2027-03-19",
          saisonEntiere: false,
          tarifs: [
            {
              duree: { type: "jours", jours: 1 },
              libelleDuree: "1 jour",
              categorie: "adulte",
              libelleCategorie: "Adulte",
              ages: null,
              prix: 73,
              devise: "EUR",
              canal: "caisse",
              restriction: null,
            },
          ],
        },
      ],
    };
    const c = confronter(officielle, grilleSkiresort(PDS, "2026-09-21")!)!;
    assert.deepEqual(
      c.comparaisons.map((x) => [x.jours, x.temoin, x.ecart]),
      [[1, 72, 0.0139]],
    );
  });

  it("le rattachement d'une station à la fiche la plus proche qui publie un prix", () => {
    const m = rattacherAuxFiches(
      [{ id: "chatel", name: "Châtel", domain: "Portes du Soleil", lat: 46.27, lon: 6.84 }],
      {
        pds: { nom: "Les Portes du Soleil", lat: 46.2177, lon: 6.7933 },
        vide: { nom: "Châtel", lat: 46.27, lon: 6.84 },
      },
      (cle) => cle === "pds",
    );
    assert.equal(m.get("chatel")?.cle, "pds");
  });
});
