import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_FICHES_TRANCHE, corpsFiches, idsFiches, lireSortieFiches } from "./airbnbFiches.ts";

const IDS = ["32854505", "40601911", "986024481050825680"];

describe("airbnbFiches", () => {
  it("ne demande que des identifiants Airbnb, sans doublon, une tranche au plus", () => {
    assert.deepEqual(idsFiches(["123", " 32854505 ", 40601911, "abc", "32854505", null, 1.5]), [
      "32854505",
      "40601911",
    ]);
    const beaucoup = Array.from({ length: 100 }, (_, i) => String(1_000_000 + i));
    assert.equal(idsFiches(beaucoup).length, MAX_FICHES_TRANCHE);
  });

  it("envoie le mode, les dates, les voyageurs et l'échéance", () => {
    const corps = JSON.parse(
      corpsFiches(
        { ids: IDS, checkIn: "2027-02-06", checkOut: "2027-02-13", adults: 2 },
        IDS,
        1_800_000_000_000,
      ),
    );
    assert.deepEqual(corps, {
      mode: "fiches",
      ids: IDS,
      checkIn: "2027-02-06",
      checkOut: "2027-02-13",
      adults: 2,
      deadlineMs: 1_800_000_000_000,
    });
  });

  it("garde les fiches lues et jette les nombres hors bornes", () => {
    const out = lireSortieFiches(
      {
        ok: true,
        fiches: {
          [IDS[0]]: {
            guests: 4,
            bedrooms: 0,
            rooms: 1,
            lat: 46.18,
            lon: 6.83,
            roomType: "Entire home/apt",
            ecartee: false,
          },
          [IDS[1]]: { guests: 0, bedrooms: 99, lat: 0, lon: 0, roomType: "", ecartee: "oui" },
          "99999999": { guests: 4 },
        },
        vides: [],
        restants: [],
        lues: 2,
      },
      IDS,
    );
    assert.deepEqual(out.fiches[IDS[0]], {
      guests: 4,
      bedrooms: 0,
      rooms: 1,
      lat: 46.18,
      lon: 6.83,
      roomType: "Entire home/apt",
      typeLogement: null,
      ecartee: false,
    });
    assert.deepEqual(out.fiches[IDS[1]], {
      guests: null,
      bedrooms: null,
      rooms: null,
      lat: null,
      lon: null,
      roomType: null,
      typeLogement: null,
      ecartee: false,
    });
    assert.equal("99999999" in out.fiches, false, "un identifiant non demandé est ignoré");
    assert.deepEqual(
      out.restants,
      [IDS[2]],
      "un identifiant absent de la sortie n'est jamais perdu",
    );
    assert.equal(out.arret, null);
  });

  it("un refus arrête la tranche, dit son code et garde les restants", () => {
    const out = lireSortieFiches(
      {
        ok: false,
        fiches: { [IDS[0]]: { guests: 6, bedrooms: 2, ecartee: false } },
        vides: [],
        restants: IDS.slice(1),
        lues: 2,
        arret: "refus",
        erreurArret: "HTTP 429",
      },
      IDS,
    );
    assert.equal(out.arret, "refus");
    assert.equal(out.raison, "HTTP 429");
    assert.deepEqual(out.restants, IDS.slice(1));
    assert.equal(out.lues, 2);
  });

  it("le limiteur local rend son attente", () => {
    const out = lireSortieFiches(
      { fiches: {}, vides: [], restants: IDS, lues: 0, arret: "rythme", attenteS: 12.5 },
      IDS,
    );
    assert.equal(out.arret, "rythme");
    assert.equal(out.attenteMs, 12_500);
  });

  it("un worker tué ou muet rend tout en restants", () => {
    assert.deepEqual(lireSortieFiches(null, IDS, true), {
      fiches: {},
      vides: [],
      restants: IDS,
      lues: 0,
      arret: "echeance",
      raison: "worker coupé à l'échéance",
    });
    assert.equal(lireSortieFiches("pas un objet", IDS).arret, "worker");
    assert.equal(lireSortieFiches({ arret: "inconnu", restants: IDS }, IDS).arret, null);
  });

  it("une annonce écartée le reste, et une vide n'est pas redemandée", () => {
    const out = lireSortieFiches(
      {
        fiches: { [IDS[0]]: { roomType: "Hotel room", ecartee: true } },
        vides: [IDS[1]],
        restants: [IDS[1], IDS[2]],
        lues: 2,
      },
      IDS,
    );
    assert.equal(out.fiches[IDS[0]].ecartee, true);
    assert.deepEqual(out.vides, [IDS[1]]);
    assert.deepEqual(out.restants, [IDS[2]]);
  });
});
