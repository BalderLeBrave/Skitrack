import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  colonnesPlateforme,
  CRITERES_PLATEFORME,
  libelleCouverture,
  libelleReleve,
  ordreSources,
  valeurGagne,
  voirAnnoncesLbl,
  type SujetPlateforme,
} from "./plateformes.ts";

const STAY = { checkIn: "2027-02-06", checkOut: "2027-02-13" };
const NOW = Date.parse("2027-01-10T12:00:00Z");

function L(over: Partial<SujetPlateforme> & { source: string }): SujetPlateforme {
  return {
    total: 0,
    url: "https://example.test/a",
    guests: 8,
    bedrooms: 3,
    lat: 45.01,
    lon: 6.12,
    photo: "https://example.test/a.jpg",
    ...over,
  };
}

const dated = {
  pricedCheckIn: STAY.checkIn,
  pricedCheckOut: STAY.checkOut,
  scannedAt: NOW,
} as const;
const complete = { total: 2231, ...dated } as const;

describe("plateformes : comparer ce que chaque source a publié", () => {
  it("range Centrale, Airbnb, Gîtes, Booking, Abritel, puis le reste", () => {
    assert.deepEqual(
      ordreSources([
        { source: "Booking" },
        { source: "Airbnb" },
        { source: "Import manuel" },
        { source: "Centrale" },
        { source: "Gîtes de France" },
        { source: "Abritel" },
      ]),
      ["Centrale", "Airbnb", "Gîtes de France", "Booking", "Abritel", "Import manuel"],
    );
  });

  it("n'invente pas une colonne pour une source absente du relevé", () => {
    assert.deepEqual(ordreSources([{ source: "Airbnb" }]), ["Airbnb"]);
    assert.deepEqual(
      ordreSources([{ source: "Airbnb" }], [{ source: "Centrale", ok: true, count: 0 }]),
      ["Centrale", "Airbnb"],
    );
  });

  it("compte les annonces, les totaux, les confirmées, les fiches", () => {
    const cols = colonnesPlateforme(
      [
        L({ source: "Airbnb", ...complete }),
        L({ source: "Airbnb", total: 0, url: "https://www.airbnb.fr/rooms/2" }),
        L({
          source: "Centrale",
          total: 3900,
          proven: "Ingénie",
          pricedCheckIn: STAY.checkIn,
          pricedCheckOut: STAY.checkOut,
          scannedAt: NOW,
        }),
      ],
      STAY,
      undefined,
      NOW,
    );
    const airbnb = cols.find((c) => c.source === "Airbnb")!;
    const centrale = cols.find((c) => c.source === "Centrale")!;
    assert.equal(airbnb.n, 2);
    assert.equal(airbnb.nPrix, 1);
    assert.equal(airbnb.nConfirmes, 1);
    assert.equal(airbnb.nCompletes, 1);
    assert.equal(airbnb.moinsCher, 2231);
    assert.equal(centrale.n, 1);
    assert.equal(centrale.nPrix, 1);
    assert.equal(centrale.moinsCher, 3900);
  });

  it("un prix Gîtes non publié : pas de moins cher, disponibilité non confirmée", () => {
    const cols = colonnesPlateforme(
      [L({ source: "Gîtes de France", total: 0, proven: "ITEA gites-web" })],
      STAY,
      undefined,
      NOW,
    );
    assert.equal(cols.length, 1);
    assert.equal(cols[0].nPrix, 0);
    assert.equal(cols[0].nConfirmes, 0);
    assert.equal(cols[0].moinsCher, null);
    assert.equal(cols[0].couverture, "prix non publié");
    assert.equal(cols[0].releve, "relevé figé");
  });

  it("un « à partir de » n'est pas un total de séjour", () => {
    const cols = colonnesPlateforme(
      [L({ source: "Centrale", total: 3500, priceIndicative: true })],
      STAY,
      undefined,
      NOW,
    );
    assert.equal(cols[0].nPrix, 0);
    assert.equal(cols[0].moinsCher, null);
    assert.equal(cols[0].couverture, "prix non publié");
  });

  it("le moins cher est le plus bas total publié, pas un zéro", () => {
    const cols = colonnesPlateforme(
      [
        L({ source: "Airbnb", total: 4100, ...dated }),
        L({ source: "Airbnb", total: 2231, ...dated, url: "https://example.test/b" }),
        L({ source: "Airbnb", total: 0, url: "https://example.test/c" }),
      ],
      STAY,
      undefined,
      NOW,
    );
    assert.equal(cols[0].moinsCher, 2231);
  });

  it("un loyer de centrale sans taxe : hors frais de séjour", () => {
    assert.equal(
      libelleCouverture([L({ source: "Centrale", total: 3900, proven: "Ingénie" })]),
      "loyer, hors frais de séjour",
    );
  });

  it("loyer et taxe de séjour quand le panier les a publiés", () => {
    assert.equal(
      libelleCouverture([
        L({
          source: "Centrale",
          total: 4060.16,
          proven: "loyer · taxe de séjour 160.16 €",
          priceLabel: "loyer et taxe de séjour",
        }),
      ]),
      "loyer et taxe de séjour",
    );
  });

  it("mélange : loyer ; taxe de séjour quand la centrale la publie", () => {
    assert.equal(
      libelleCouverture([
        L({ source: "Centrale", total: 3900, proven: "Ingénie" }),
        L({
          source: "Centrale",
          total: 4060.16,
          proven: "loyer · taxe de séjour 160.16 €",
          priceLabel: "loyer et taxe de séjour",
        }),
      ]),
      "loyer ; taxe de séjour quand la centrale la publie",
    );
  });

  it("Airbnb : total relevé chez la source, jamais un loyer de centrale", () => {
    assert.equal(
      libelleCouverture([L({ source: "Airbnb", total: 2231 })]),
      "total relevé chez la source",
    );
  });

  it("provenance : figé, direct, pause, échec — les mots de la source", () => {
    assert.equal(libelleReleve(undefined), "relevé figé");
    assert.equal(libelleReleve({ source: "Airbnb", ok: true, count: 12 }), "relevé en direct");
    assert.equal(
      libelleReleve({
        source: "Airbnb",
        ok: false,
        count: 0,
        error: "Délai dépassé : relevé précédent conservé.",
      }),
      "pause : relevé précédent conservé",
    );
    assert.equal(
      libelleReleve({ source: "Airbnb", ok: false, count: 0, error: "429 Too Many Requests" }),
      "pause : relevé précédent conservé",
    );
    assert.equal(
      libelleReleve({ source: "Booking", ok: false, count: 0, error: "page anti-bot" }),
      "page anti-bot",
    );
    assert.equal(libelleReleve({ source: "Booking", ok: false, count: 0 }), "relevé en échec");
  });

  it("un prix aux bonnes dates sans heure de mesure n'est pas confirmé", () => {
    const cols = colonnesPlateforme(
      [
        L({
          source: "Airbnb",
          total: 2231,
          pricedCheckIn: STAY.checkIn,
          pricedCheckOut: STAY.checkOut,
          scannedAt: null,
        }),
      ],
      STAY,
      undefined,
      NOW,
    );
    assert.equal(cols[0].nPrix, 1);
    assert.equal(cols[0].nConfirmes, 0);
  });

  it("en gras : plus d'annonces, plus bas total — pas une seule colonne", () => {
    const cols = colonnesPlateforme(
      [
        L({ source: "Airbnb", ...complete }),
        L({ source: "Airbnb", total: 4100, ...dated, url: "https://example.test/b" }),
        L({
          source: "Centrale",
          total: 3900,
          proven: "Ingénie",
          pricedCheckIn: STAY.checkIn,
          pricedCheckOut: STAY.checkOut,
          scannedAt: NOW,
        }),
      ],
      STAY,
      undefined,
      NOW,
    );
    const n = CRITERES_PLATEFORME.find((c) => c.id === "n")!;
    const prix = CRITERES_PLATEFORME.find((c) => c.id === "moinsCher")!;
    assert.equal(cols[0].source, "Centrale");
    assert.equal(cols[1].source, "Airbnb");
    assert.equal(valeurGagne(n, cols, 0), false);
    assert.equal(valeurGagne(n, cols, 1), true);
    assert.equal(valeurGagne(prix, cols, 0), false);
    assert.equal(valeurGagne(prix, cols, 1), true);
    assert.equal(prix.txt(cols[1]), "2 231 €");
    assert.equal(valeurGagne(n, [cols[0]], 0), false);
  });

  it("une valeur absente n'est pas la meilleure", () => {
    const cols = colonnesPlateforme(
      [
        L({ source: "Gîtes de France", total: 0 }),
        L({ source: "Airbnb", ...complete }),
      ],
      STAY,
      undefined,
      NOW,
    );
    const prix = CRITERES_PLATEFORME.find((c) => c.id === "moinsCher")!;
    const gites = cols.find((c) => c.source === "Gîtes de France")!;
    const airbnb = cols.find((c) => c.source === "Airbnb")!;
    assert.equal(prix.txt(gites), null);
    assert.equal(valeurGagne(prix, cols, cols.indexOf(gites)), false);
    assert.equal(valeurGagne(prix, cols, cols.indexOf(airbnb)), false);
  });

  it("le bouton nomme la plateforme et le nombre, sans inventer", () => {
    assert.equal(voirAnnoncesLbl(0, "Booking"), "Aucune annonce de Booking");
    assert.equal(voirAnnoncesLbl(1, "Centrale"), "Voir l’annonce de Centrale");
    assert.equal(voirAnnoncesLbl(12, "Airbnb"), "Voir les 12 annonces d’Airbnb");
    assert.equal(voirAnnoncesLbl(1, "Abritel"), "Voir l’annonce d’Abritel");
  });
});
