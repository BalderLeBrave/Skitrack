import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Listing } from "../listings.ts";
import { contenuTravelski, lireFiche } from "../scrape/agences/travelski.ts";
import { ContenuFiches, poserContenu } from "./contenuFiches.server.ts";
import { aEquipement, equipementsDe, equipementsTus } from "./ficheEnrichie.ts";
import { servicesInclus } from "./servicesTravelski.ts";

// Fiche réelle du 6 octobre 2026 : Pierre & Vacances Atria-Crozats, Avoriaz
// (liheId 8493), la ligne `window.lihe` réduite aux champs lus.
const html = readFileSync(
  new URL("../scrape/agences/fixtures/travelski-fiche-8493-contenu.html", import.meta.url),
  "utf8",
);
const lihe = JSON.parse(/^\s*window\.lihe\s*=\s*(\{.*\})\s*;?\s*$/m.exec(html)![1]) as { services: string };
const fiche = lireFiche(html);

const INCLUS = [
  "Linge de lit",
  "Linge de toilette",
  "Ménage en fin de séjour (hors coin cuisine)",
  "Kit d'accueil entretien",
  "Télévision",
  "Wi-Fi dans les hébergements",
  "Espace enfants",
  "Prêt d'équipements et de jeux",
  "Bagagerie",
  "Casiers à skis",
];

/** Une annonce Travelski du logement 910555, comme `annonces()` la pose. */
function annonce(extra: Partial<Listing> = {}): Listing {
  return {
    id: "tsk-910555",
    source: "Travelski",
    platformId: "910555",
    amenities: contenuTravelski(fiche, "910555")!.amenities,
    ...extra,
  } as Listing;
}

const ids = (l: Listing) => (equipementsDe(l) ?? []).filter((e) => e.present).map((e) => e.id);

describe("Travelski : les services inclus de la fiche réelle, un par ligne", () => {
  it("les dix services inclus, libellé avant « : », tels que publiés", () => {
    const s = servicesInclus(lihe.services);
    assert.deepEqual(
      s.map((e) => e.libelle),
      INCLUS,
    );
    assert.ok(s.every((e) => e.present === true && e.groupe === "Services inclus"));
  });

  it("ni les titres, ni les services payants ou hors du logement", () => {
    const libelles = servicesInclus(lihe.services).map((e) => e.libelle);
    for (const l of ["Services inclus", "Services payants", "Kit bébé", "Spa Deep Nature®", "Restaurant", "Squash", "Animaux domestiques admis", "Espace détente"])
      assert.ok(!libelles.includes(l), l);
  });

  it("la Télévision s'affiche et se filtre ; les douze clés lues restent", () => {
    const avant = annonce();
    const apres = annonce({ equipementsPublies: servicesInclus(lihe.services) });
    assert.equal(aEquipement(avant, "television"), false);
    assert.equal(aEquipement(apres, "television"), true);
    // Ce que la description et les services entiers donnaient déjà ne bouge pas.
    for (const id of ids(avant)) assert.ok(ids(apres).includes(id), id);
    assert.deepEqual(
      ids(apres).filter((id) => !ids(avant).includes(id)).sort(),
      [
        "autre:bagagerie",
        "autre:espace enfants",
        "autre:kit d'accueil entretien",
        "autre:menage en fin de sejour (hors coin cuisine)",
        "autre:pret d'equipements et de jeux",
        "television",
      ],
    );
    // Les clés que les services nomment portent leur libellé.
    const par = new Map((equipementsDe(apres) ?? []).map((e) => [e.id, e.libelle]));
    assert.equal(par.get("wifi"), "Wi-Fi dans les hébergements");
    assert.equal(par.get("casier_skis"), "Casiers à skis");
    assert.equal(par.get("sauna_spa"), "Sauna ou spa");
    assert.deepEqual(equipementsTus(apres), equipementsTus(avant));
  });

  it("gardés trente jours avec le contenu de la fiche, puis reposés sans réseau", () => {
    const dir = mkdtempSync(join(tmpdir(), "skitrack-travelski-"));
    try {
      const chemin = join(dir, "fiches-contenu.json");
      const c = contenuTravelski(fiche, "910555")!;
      new ContenuFiches(chemin).noter([
        { cle: "Travelski:910555", contenu: { ...c, equipementsPublies: servicesInclus(lihe.services) } },
      ]);
      const relu = new ContenuFiches(chemin).lire("Travelski:910555");
      assert.deepEqual(
        relu?.equipementsPublies?.map((e) => e.libelle),
        INCLUS,
      );
      const row = { id: "tsk-910555", source: "Travelski", platformId: "910555", photo: null } as unknown as Listing;
      assert.equal(poserContenu(row, relu), true);
      assert.equal(aEquipement(row, "television"), true);
      assert.equal(aEquipement(row, "balcon"), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Travelski : ce qui n'est pas une liste de services inclus", () => {
  it("rien sans texte, ni sans titre « Services inclus »", () => {
    assert.deepEqual(servicesInclus(null), []);
    assert.deepEqual(servicesInclus(""), []);
    assert.deepEqual(servicesInclus("Télévision<br/>Bagagerie : sans surveillance."), []);
    assert.deepEqual(servicesInclus("<b>Services payants</b><br/>Kit bébé : 45€/ semaine"), []);
  });

  it("un gras dans une ligne n'ouvre pas de section ; une phrase n'est pas un libellé ; un libellé ne vient qu'une fois", () => {
    const s = servicesInclus(
      "<b>Services inclus</b><br/><b>Wi-Fi</b> : dans les hébergements<br/>Ouvert de 9:00 à 19:00 tous les jours de la semaine, sur réservation à la réception de la résidence<br/>Télévision<br/>télévision<br/><b>Services payants</b><br/>Squash : immeuble voisin",
    );
    assert.deepEqual(
      s.map((e) => e.libelle),
      ["Wi-Fi", "Télévision"],
    );
  });
});
