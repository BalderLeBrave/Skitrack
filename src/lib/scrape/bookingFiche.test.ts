import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { noteEtAvisLbl } from "../note.ts";
import { poserLangue } from "../i18n/langue.ts";
import {
  extraitsBooking,
  ficheBookingDepuisHtml,
  ficheDepuisPageBooking,
  ouiNon,
} from "./bookingFiche.ts";

const HTML = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures", "booking-etablissement-reduit.html"),
  "utf8",
);
const SANS_LD = HTML.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, "");
const ICI = {
  lodgingType: "appartement" as const,
  url: "https://www.booking.com/hotel/fr/les-meleze.html",
};

describe("Booking : la fiche lue dans la page déjà chargée", () => {
  it("description, équipements et conditions, dans les mots de la page", () => {
    const f = ficheDepuisPageBooking(ICI, HTML, 200, new Date("2026-10-07T10:00:00Z"))!;
    assert.equal(f.sourceFiche, "booking");
    assert.equal(
      f.description,
      "Situé à Mont-de-Lans, cet appartement dispose d’un balcon.\nIl comprend 2 chambres, un salon avec télévision et une cuisine équipée.",
    );
    assert.deepEqual(
      f.equipements.map((e) => [e.id, e.libelle, e.present]),
      [
        ["wifi", "Connexion Wi-Fi gratuite", true],
        ["parking", "Parking gratuit", true],
        ["autre:logements non-fumeurs", "Logements non-fumeurs", true],
        ["lave_linge", "Lave-linge", true],
        ["lave_vaisselle", "Lave-vaisselle", true],
        ["autre:four", "Four", true],
        ["balcon", "Balcon", true],
        ["casier_skis", "Local à skis", true],
      ],
    );
    // Un équipement hors table garde l'intitulé de son groupe sur la page.
    assert.equal(f.equipements.find((e) => e.libelle === "Four")!.groupe, "Cuisine");
    assert.deepEqual(f.conditions, {
      arrivee: "De 16:00 à 20:00",
      depart: "De 08:00 à 10:00",
      annulation:
        "Les conditions d’annulation et de prépaiement varient en fonction du type d’hébergement.",
      caution: "Une caution de 500 € est requise à l’arrivée.",
      animaux: "non",
      fetes: "non",
      reglement:
        "Enfants et lits :\nLes enfants de tous âges sont acceptés.\n\nHoraires de silence :\nLes clients doivent respecter le silence entre 22:00 et 07:00.",
    });
    assert.equal(
      f.conditions!.fumeurs,
      undefined,
      "« Logements non-fumeurs » ne dit pas tout l'établissement",
    );
    assert.equal(f.recupereLe, "2026-10-07T10:00:00.000Z");
  });

  it("une note 9,2 / 10 est gardée brute et lue 4,6 / 5 ; l'écran ne dit jamais « / 10 »", () => {
    const f = ficheDepuisPageBooking(ICI, HTML, 200)!;
    assert.equal(f.avis!.noteSource, 9.2);
    assert.equal(f.avis!.echelleSource, 10);
    assert.equal(f.avis!.noteSur5, 4.6);
    assert.equal(f.avis!.nombre, 87);
    assert.equal(f.avis!.url, ICI.url);
    poserLangue("fr");
    const affiche = noteEtAvisLbl(f.avis!.noteSur5, f.avis!.nombre)!;
    assert.equal(affiche, "4,6 / 5 · 87 avis");
    assert.ok(!/10/.test(affiche.replace("87", "")));
  });

  it("sans échelle écrite (pas de bestRating, « Avec une note de 9,2 »), pas de note", () => {
    const f = ficheDepuisPageBooking(ICI, SANS_LD, 200)!;
    assert.equal(f.avis!.noteSur5, null);
    assert.equal(f.avis!.nombre, 87, "le nombre d'avis publié reste");
    const sansBest = HTML.replace(',"bestRating":10', "");
    assert.equal(ficheDepuisPageBooking(ICI, sansBest, 200)!.avis!.noteSur5, null);
  });

  it("le prix n'est pas lu : un « à partir de » ne devient pas un total", () => {
    const brut = ficheBookingDepuisHtml(HTML)!;
    assert.deepEqual(Object.keys(brut).sort(), [
      "avis",
      "conditions",
      "description",
      "equipements",
    ]);
    assert.ok(!JSON.stringify(brut).includes("1 240"));
  });

  it("un hôtel ou une chambre ne s'enrichit pas ; une page refusée est indisponible", () => {
    assert.equal(ficheDepuisPageBooking({ ...ICI, lodgingType: "hotel" }, HTML, 200), undefined);
    assert.equal(ficheDepuisPageBooking({ ...ICI, lodgingType: "chambre" }, HTML, 200), undefined);
    const refusee = ficheDepuisPageBooking(ICI, HTML, 429)!;
    assert.equal(refusee.indisponible, true);
    const defi = ficheDepuisPageBooking(ICI, HTML, 202)!;
    assert.equal(defi.indisponible, true);
    assert.equal(defi.description, undefined);
    assert.deepEqual(
      [refusee.description, refusee.equipements, refusee.avis, refusee.conditions],
      [undefined, [], null, null],
    );
  });

  it("une page sans aucun de ces blocs ne donne rien", () => {
    assert.equal(ficheDepuisPageBooking(ICI, "<html><body>Rien</body></html>", 200), undefined);
    assert.equal(ficheDepuisPageBooking(ICI, null, 200), undefined);
  });

  it("les extraits déjà dans la page : JSON-LD, cartes, avis mis en avant ; cinq au plus, sans doublon", () => {
    const f = ficheDepuisPageBooking(ICI, HTML, 200)!;
    assert.deepEqual(
      f.avis!.extraits.map((x) => [x.auteur, x.date, x.noteSur5, x.texte]),
      [
        ["Camille", "2026-02-28", 5, "Vue magnifique sur les pistes, appartement très propre."],
        [
          "Jean-Marc",
          "12 février 2026",
          4.5,
          "Superbe séjour\n+ Skis aux pieds, cuisine bien équipée.\n− Parking un peu étroit.",
        ],
        ["Sofia", undefined, 5, "+ Hôte très réactif."],
        // Mis en avant : ni date ni note publiées ; Camille, déjà lue, ne revient pas.
        ["Lucas", undefined, null, "Calme, et la navette part juste devant."],
      ],
    );
    const beaucoup = HTML.replace(
      /<div data-testid="review-card">/,
      '<div data-testid="review-card"><div data-testid="review-positive-text">A</div></div>'.repeat(
        6,
      ) + '<div data-testid="review-card">',
    );
    assert.equal(ficheDepuisPageBooking(ICI, beaucoup, 200)!.avis!.extraits.length, 5);
  });

  it("sans échelle globale, un extrait n'a pas de note ; un avis seul fait quand même des extraits", () => {
    const f = ficheDepuisPageBooking(ICI, SANS_LD, 200)!;
    assert.ok(f.avis!.extraits.length >= 3);
    assert.ok(f.avis!.extraits.every((x) => x.noteSur5 == null && x.noteSource == null));
    const seul =
      '<div data-testid="featuredreview"><div data-testid="featuredreview-avatar">Ana</div>' +
      '<div data-testid="featuredreview-text">Très bien.</div></div>';
    const g = ficheDepuisPageBooking(ICI, seul, 200)!;
    assert.deepEqual(g.avis!.extraits, [{ auteur: "Ana", noteSur5: null, texte: "Très bien." }]);
    assert.equal(g.avis!.noteSur5, null);
    // Une note d'extrait sur une autre échelle que la note globale ne se garde pas.
    const ld = [
      {
        aggregateRating: { ratingValue: 9, bestRating: 10 },
        review: { reviewBody: "Bien.", reviewRating: { ratingValue: 4, bestRating: 5 } },
      },
    ];
    assert.deepEqual(extraitsBooking("", ld, 10), [{ texte: "Bien." }]);
  });

  it("« Établissement non-fumeur » dans les équipements dit fumeurs : non, si les conditions se taisent", () => {
    const html = HTML.replace("Logements non-fumeurs", "Établissement non-fumeur");
    assert.equal(ficheDepuisPageBooking(ICI, html, 200)!.conditions!.fumeurs, "non");
    const autorise = html.replace(
      "<div><span>Fêtes</span>",
      "<div><span>Fumeurs</span></div><div>Il est permis de fumer dans les espaces autorisés.</div><div><span>Fêtes</span>",
    );
    assert.equal(ficheDepuisPageBooking(ICI, autorise, 200)!.conditions!.fumeurs, "oui");
  });

  it("oui, non, sur demande : seulement quand la phrase porte sur l'admission", () => {
    assert.equal(ouiNon("Pets are allowed. No extra charges."), "oui");
    assert.equal(ouiNon("Les animaux sont admis. Pas de frais supplémentaires."), "oui");
    assert.equal(ouiNon("Les animaux sont admis sur demande.", true), "sur_demande");
    assert.equal(ouiNon("Les animaux de compagnie ne sont pas acceptés."), "non");
    assert.equal(ouiNon("Smoking is not allowed."), "non");
    assert.equal(ouiNon("Il est interdit de fumer."), "non");
    assert.equal(ouiNon("Les fêtes/événements n'est pas autorisé."), "non");
    assert.equal(ouiNon("Des frais peuvent s'appliquer."), null);
  });
});
