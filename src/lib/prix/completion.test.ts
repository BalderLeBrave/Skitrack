import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Listing } from "../listings.ts";
import type { DemandeFichesAirbnb, LectureFichesAirbnb } from "../scrape/airbnbFiches.ts";
import { MemoireFiches } from "../stay/memoireFiches.server.ts";
import { airbnbARefuse, airbnbSuspendu, type CandidateFiche } from "./calcul.ts";
import {
  MARQUE_AIRBNB,
  MARQUE_MEMOIRE,
  TRANCHE_MS,
  trancheProfonde,
  type DemandeTranche,
  type Dependances,
  type OptionsPages,
  type PagesAirbnbProfond,
  type PagesProfond,
} from "./completion.server.ts";

const T0 = Date.parse("2027-01-10T12:00:00Z");
let dossier = "";
before(() => {
  dossier = mkdtempSync(join(tmpdir(), "skitrack-completion-"));
});
after(() => {
  rmSync(dossier, { recursive: true, force: true });
});

let n = 0;
function memoire(): MemoireFiches {
  n += 1;
  return new MemoireFiches(join(dossier, `m${n}`, "fiches.json"));
}

function cand(over: Partial<CandidateFiche> & Pick<CandidateFiche, "id">): CandidateFiche {
  return {
    cle: null,
    source: "Airbnb",
    title: "Appartement plein sud",
    url: `https://www.airbnb.fr/rooms/${over.id.replace(/\D/g, "") || "1"}0000`,
    platformId: null,
    lat: 45.0,
    lon: 6.12,
    guests: null,
    bedrooms: null,
    rooms: null,
    beds: 3,
    total: 1500,
    currency: "EUR",
    proven: "pyairbnb live",
    locality: null,
    ...over,
  };
}

function demande(over: Partial<DemandeTranche> = {}): DemandeTranche {
  return {
    mode: "tranche",
    stationId: "les-2-alpes",
    checkIn: "2027-02-06",
    checkOut: "2027-02-13",
    voyageurs: 8,
    candidates: [],
    airbnbSuspendu: false,
    hotesExclus: [],
    urlsCommunes: [],
    ...over,
  };
}

type Appels = { airbnb: DemandeFichesAirbnb[]; pages: Listing[][]; rooms: Listing[][] };

function deps(
  over: Partial<Dependances> & { fiches?: (d: DemandeFichesAirbnb) => LectureFichesAirbnb } = {},
): { deps: Dependances; appels: Appels } {
  const appels: Appels = { airbnb: [], pages: [], rooms: [] };
  const vide: PagesProfond = { essayees: [], laissees: [], hotesRefus: [], lectures: {}, lues: 0 };
  const d: Dependances = {
    async lireFichesAirbnb(dem) {
      appels.airbnb.push(dem);
      return over.fiches
        ? over.fiches(dem)
        : { fiches: {}, vides: [], restants: [...dem.ids], lues: 0, arret: null };
    },
    async lirePages(rows: Listing[], _opts: OptionsPages) {
      appels.pages.push(rows);
      return vide;
    },
    async lirePagesAirbnb(rows: Listing[]): Promise<PagesAirbnbProfond> {
      appels.rooms.push(rows);
      return { essayees: [], arret: null, lectures: {}, lues: 0 };
    },
    laissees: () => [],
    memoire: memoire(),
    maintenant: () => T0,
    ...over,
  };
  return { deps: d, appels };
}

const silence = <T>(f: () => Promise<T>): Promise<T> => {
  const info = console.info;
  console.info = () => undefined;
  return f().finally(() => {
    console.info = info;
  });
};

describe("tranche « mémoire » : aucune requête", () => {
  it("note les annonces complètes, comble les trous par la mémoire, sans rien remplacer", async () => {
    const { deps: dp, appels } = deps();
    dp.memoire.noter([{ cle: "Airbnb:20000", guests: 6, bedrooms: 2, lat: 45.9, lon: 6.9 }], T0);
    const r = await trancheProfonde(
      demande({
        mode: "memoire",
        candidates: [cand({ id: "abnb-2", guests: 4 })],
        connues: [{ cle: "Airbnb:30000", guests: 5, bedrooms: 1, rooms: null, lat: 45.1, lon: 6.1 }],
      }),
      dp,
    );
    assert.deepEqual(r.correctifs["abnb-2"], {
      bedrooms: 2,
      proven: `pyairbnb live · ${MARQUE_MEMOIRE}`,
    });
    assert.equal(dp.memoire.lire("Airbnb:30000", T0)?.guests, 5);
    assert.equal(r.restantes, 0);
    assert.equal(appels.airbnb.length + appels.pages.length, 0);
  });

  it("lit la mémoire par la clé que le navigateur a calculée sur l'annonce entière", async () => {
    // L'identifiant Airbnb venait des photos, que la candidate ne porte pas.
    const { deps: dp } = deps();
    dp.memoire.noter([{ cle: "Airbnb:55555", guests: 6, bedrooms: 2 }], T0);
    const r = await trancheProfonde(
      demande({ mode: "memoire", candidates: [cand({ id: "abnb-x", url: null, cle: "Airbnb:55555" })] }),
      dp,
    );
    assert.equal(r.correctifs["abnb-x"]?.guests, 6);
    assert.equal(r.correctifs["abnb-x"]?.bedrooms, 2);
  });

  it("un Airbnb que la mémoire sait écarté (hôtel, chambre) sort du relevé", async () => {
    const { deps: dp } = deps();
    dp.memoire.noter([{ cle: "Airbnb:70000", guests: 2, ecartee: true }], T0);
    const r = await trancheProfonde(demande({ mode: "memoire", candidates: [cand({ id: "abnb-7" })] }), dp);
    assert.deepEqual(r.retires, ["abnb-7"]);
    assert.equal(r.restantes, 0);
    assert.deepEqual(r.correctifs, {});
  });

  it("dit ce qu'aucune fiche ne complétera, et le compte des restantes suit", async () => {
    const { deps: dp } = deps({ laissees: (rows) => rows.filter((l) => l.source === "Booking").map((l) => l.id) });
    const r = await trancheProfonde(
      demande({
        mode: "memoire",
        candidates: [
          cand({ id: "bk-1", source: "Booking", url: "https://www.booking.com/hotel/fr/x.html" }),
          cand({ id: "c-1", source: "Centrale", url: "https://reservation.exemple.fr/fiche/1" }),
          cand({ id: "abnb-sans-id", url: null }),
          cand({ id: "abnb-4" }),
        ],
      }),
      dp,
    );
    assert.deepEqual(r.laissees.sort(), ["abnb-sans-id", "bk-1"]);
    assert.equal(r.restantes, 2);
  });
});

describe("tranche : fiches Airbnb", () => {
  it("les moins chères d'abord, 60 au plus, pour le groupe, avant l'échéance de 45 s", async () => {
    const candidates = Array.from({ length: 70 }, (_, i) => cand({ id: `abnb-${i + 1}` }));
    const { deps: dp, appels } = deps();
    await silence(() => trancheProfonde(demande({ candidates }), dp));
    assert.equal(appels.airbnb.length, 1);
    const dem = appels.airbnb[0];
    assert.equal(dem.ids.length, 60);
    assert.equal(dem.ids[0], "10000");
    assert.equal(dem.adults, 8);
    assert.ok((dem.echeance ?? 0) <= T0 + TRANCHE_MS);
  });

  it("une fiche comble les trous, jamais une valeur publiée, et se garde en mémoire", async () => {
    const { deps: dp } = deps({
      fiches: (d) => ({
        fiches: {
          [d.ids[0]]: {
            guests: 6,
            bedrooms: 2,
            rooms: null,
            lat: 45.5,
            lon: 6.5,
            roomType: "Entire home/apt",
            typeLogement: "Logement entier : appartement",
            ecartee: false,
          },
        },
        vides: [d.ids[1]],
        restants: d.ids.slice(2),
        lues: 2,
        arret: "echeance",
      }),
    });
    const r = await silence(() =>
      trancheProfonde(
        demande({ candidates: [cand({ id: "abnb-1", guests: 4 }), cand({ id: "abnb-2" }), cand({ id: "abnb-3" })] }),
        dp,
      ),
    );
    assert.deepEqual(r.correctifs["abnb-1"], {
      bedrooms: 2,
      proven: `pyairbnb live · ${MARQUE_AIRBNB}`,
    });
    assert.deepEqual(r.essayees.sort(), ["abnb-1", "abnb-2"]);
    assert.equal(r.restantes, 1);
    assert.equal(r.arretAirbnb, "echeance");
    assert.equal(airbnbSuspendu(r.arretAirbnb), false);
    assert.equal(dp.memoire.lire("Airbnb:10000", T0)?.guests, 6);
    assert.equal(r.lues, 2);
  });

  it("une fiche écartée (chambre privée) retire l'annonce", async () => {
    const { deps: dp } = deps({
      fiches: (d) => ({
        fiches: {
          [d.ids[0]]: {
            guests: 2,
            bedrooms: 1,
            rooms: null,
            lat: 45.5,
            lon: 6.5,
            roomType: "Private room",
            typeLogement: null,
            ecartee: true,
          },
        },
        vides: [],
        restants: [],
        lues: 1,
        arret: null,
      }),
    });
    const r = await silence(() => trancheProfonde(demande({ candidates: [cand({ id: "abnb-1" })] }), dp));
    assert.deepEqual(r.retires, ["abnb-1"]);
    assert.equal(r.correctifs["abnb-1"], undefined);
    assert.equal(dp.memoire.lire("Airbnb:10000", T0)?.ecartee, true);
  });

  it("un refus d'Airbnb arrête les fiches Airbnb pour la course, pas les pages", async () => {
    const { deps: dp } = deps({
      fiches: (d) => ({
        fiches: {},
        vides: [],
        restants: [...d.ids],
        lues: 1,
        arret: "refus",
        raison: "HTTP 429 (fiche)",
      }),
    });
    const r = await silence(() =>
      trancheProfonde(
        demande({
          candidates: [
            cand({ id: "abnb-1" }),
            cand({ id: "c-1", source: "Centrale", url: "https://reservation.exemple.fr/fiche/1" }),
          ],
        }),
        dp,
      ),
    );
    assert.equal(r.arretAirbnb, "refus");
    assert.equal(r.raison, "HTTP 429 (fiche)");
    assert.equal(airbnbSuspendu(r.arretAirbnb), true);
    assert.equal(airbnbARefuse(r.arretAirbnb), true);
    // La centrale reste à lire ; l'Airbnb ne compte plus.
    assert.equal(r.restantes, 1);
  });

  it("Airbnb suspendu : aucune fiche demandée", async () => {
    const { deps: dp, appels } = deps();
    const r = await silence(() =>
      trancheProfonde(demande({ airbnbSuspendu: true, candidates: [cand({ id: "abnb-1" })] }), dp),
    );
    assert.equal(appels.airbnb.length, 0);
    assert.equal(r.restantes, 0);
  });

  it("hash périmé : repli sur les pages rooms/ des fiches non lues", async () => {
    const { deps: dp, appels } = deps({
      fiches: (d) => ({ fiches: {}, vides: [], restants: [...d.ids], lues: 0, arret: "hash" }),
      async lirePagesAirbnb(rows: Listing[]): Promise<PagesAirbnbProfond> {
        appels.rooms.push(rows);
        rows[0].guests = 4;
        return {
          essayees: [rows[0].id],
          arret: "refus",
          lectures: { [rows[0].id]: { guests: 4, bedrooms: null, rooms: null, lat: null, lon: null } },
          lues: 1,
        };
      },
    });
    const r = await silence(() =>
      trancheProfonde(demande({ candidates: [cand({ id: "abnb-1" }), cand({ id: "abnb-2" })] }), dp),
    );
    assert.deepEqual(
      appels.rooms[0].map((l) => l.id),
      ["abnb-1", "abnb-2"],
    );
    assert.equal(r.correctifs["abnb-1"]?.guests, 4);
    assert.equal(r.arretAirbnb, "refus");
    assert.equal(r.restantes, 0);
  });

  it("hash périmé, puis le limiteur des pages rooms/ fait attendre : la tranche rend « rythme » et l'attente", async () => {
    const { deps: dp } = deps({
      fiches: (d) => ({ fiches: {}, vides: [], restants: [...d.ids], lues: 0, arret: "hash" }),
      async lirePagesAirbnb(): Promise<PagesAirbnbProfond> {
        return { essayees: [], arret: "rythme", attenteMs: 40_000, lectures: {}, lues: 0 };
      },
    });
    const r = await silence(() => trancheProfonde(demande({ candidates: [cand({ id: "abnb-1" })] }), dp));
    assert.equal(r.arretAirbnb, "rythme");
    assert.equal(r.attenteMs, 40_000);
    assert.equal(airbnbSuspendu(r.arretAirbnb), false);
    assert.equal(r.restantes, 1);
  });

  it("une fiche lue qui ne publie pas tout, ou vide, ne se redemande pas de trente jours", async () => {
    const { deps: dp, appels } = deps({
      fiches: (d) => ({
        fiches: {
          "10000": {
            guests: 4,
            bedrooms: null,
            rooms: null,
            lat: 45.5,
            lon: 6.5,
            roomType: "Entire home/apt",
            typeLogement: null,
            ecartee: false,
          },
        },
        vides: ["20000"],
        restants: [],
        lues: d.ids.length,
        arret: null,
      }),
    });
    const candidates = [cand({ id: "abnb-1", lat: null, lon: null }), cand({ id: "abnb-2" })];
    await silence(() => trancheProfonde(demande({ candidates }), dp));
    assert.equal(appels.airbnb.length, 1);
    // Une autre station, ou la course du lendemain : la tranche « mémoire ».
    const r = await trancheProfonde(demande({ mode: "memoire", candidates }), { ...dp, maintenant: () => T0 + 86_400_000 });
    assert.deepEqual(r.laissees.sort(), ["abnb-1", "abnb-2"]);
    assert.equal(r.correctifs["abnb-1"]?.guests, 4);
    assert.equal(r.restantes, 0);
  });

  it("des fiches vides d'un lot au format jugé illisible ne se notent pas comme lues", async () => {
    const { deps: dp } = deps({
      fiches: (d) => ({ fiches: {}, vides: [...d.ids], restants: [], lues: d.ids.length, arret: "illisible" }),
    });
    const candidates = [cand({ id: "abnb-3" })];
    await silence(() => trancheProfonde(demande({ candidates }), dp));
    assert.equal(dp.memoire.lire("Airbnb:30000", T0), null);
    const r = await trancheProfonde(demande({ mode: "memoire", candidates }), dp);
    assert.deepEqual(r.laissees, []);
  });
});

describe("tranche : pages hors Airbnb", () => {
  it("passe les hôtes refusés et les URL communes, et rend ce que les pages ont comblé", async () => {
    let vu: OptionsPages | null = null;
    const { deps: dp } = deps({
      async lirePages(rows: Listing[], opts: OptionsPages): Promise<PagesProfond> {
        vu = opts;
        rows[0].lat = 45.01672;
        rows[0].lon = 6.12515;
        rows[0].proven = `${rows[0].proven} · fiche`;
        return {
          essayees: [rows[0].id],
          laissees: [rows[1].id],
          hotesRefus: ["reservation.exemple.fr"],
          lectures: { [rows[0].id]: { guests: null, bedrooms: null, rooms: null, lat: 45.01672, lon: 6.12515 } },
          lues: 1,
        };
      },
    });
    const r = await silence(() =>
      trancheProfonde(
        demande({
          hotesExclus: ["autre.fr"],
          urlsCommunes: ["exemple.fr/accueil"],
          candidates: [
            cand({ id: "c-1", source: "Centrale", guests: 6, rooms: 3, lat: null, lon: null, url: "https://reservation.exemple.fr/fiche/1" }),
            cand({ id: "c-2", source: "Centrale", lat: null, lon: null, url: "https://reservation.exemple.fr/fiche/2" }),
          ],
        }),
        dp,
      ),
    );
    assert.deepEqual(vu && { h: (vu as OptionsPages).hotesExclus, u: (vu as OptionsPages).urlsCommunes }, {
      h: ["autre.fr"],
      u: ["exemple.fr/accueil"],
    });
    assert.deepEqual(r.correctifs["c-1"], {
      lat: 45.01672,
      lon: 6.12515,
      proven: "pyairbnb live · fiche",
    });
    assert.deepEqual(r.hotesRefus, ["reservation.exemple.fr"]);
    assert.equal(r.restantes, 0);
    assert.equal(dp.memoire.lire("Centrale:c-1", T0)?.lat, 45.01672);
  });

  it("une tranche ne change jamais le prix publié", async () => {
    const { deps: dp } = deps({
      async lirePages(rows: Listing[]): Promise<PagesProfond> {
        rows[0].guests = 6;
        rows[0].total = 1045;
        rows[0].proven = `${rows[0].proven} · taxe de séjour 45,00 € · fiche`;
        return { essayees: [rows[0].id], laissees: [], hotesRefus: [], lectures: {}, lues: 1 };
      },
    });
    const r = await silence(() =>
      trancheProfonde(
        demande({
          candidates: [cand({ id: "c-1", source: "Centrale", total: 1000, url: "https://reservation.exemple.fr/fiche/1" })],
        }),
        dp,
      ),
    );
    assert.equal(r.correctifs["c-1"]?.guests, 6);
    assert.equal("total" in (r.correctifs["c-1"] ?? {}), false);
  });
});
