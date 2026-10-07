import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { noteEtAvisLbl } from "../note.ts";
import { poserLangue } from "../i18n/langue.ts";
import { ficheBookingDepuisHtml, ficheDepuisPageBooking } from "./bookingFiche.ts";

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
      ],
    );
    assert.deepEqual(f.conditions, {
      arrivee: "De 16:00 à 20:00",
      depart: "De 08:00 à 10:00",
      annulation:
        "Les conditions d’annulation et de prépaiement varient en fonction du type d’hébergement.",
      caution: "Une caution de 500 € est requise à l’arrivée.",
      animaux: "non",
      fetes: "non",
    });
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
    assert.deepEqual(
      [refusee.description, refusee.equipements, refusee.avis, refusee.conditions],
      [undefined, [], null, null],
    );
  });

  it("une page sans aucun de ces blocs ne donne rien", () => {
    assert.equal(ficheDepuisPageBooking(ICI, "<html><body>Rien</body></html>", 200), undefined);
    assert.equal(ficheDepuisPageBooking(ICI, null, 200), undefined);
  });
});
