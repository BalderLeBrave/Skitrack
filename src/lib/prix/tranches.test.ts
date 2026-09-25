import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Listing } from "../listings.ts";
import type { DemandeFichesAirbnb, FicheAirbnb, LectureFichesAirbnb } from "../scrape/airbnbFiches.ts";
import { stationById, type Station } from "../stations.ts";
import { MemoireFiches } from "../stay/memoireFiches.server.ts";
import { agreger } from "./calcul.ts";
import { trancheProfonde, type Dependances, type PagesProfond } from "./completion.server.ts";
import {
  aEnvoyer,
  completerStation,
  debutCompletion,
  fichesAirbnbApres,
  poserRendu,
  progression,
  SANS_PROGRES_MAX,
  SANS_PROGRES_RYTHME_MAX,
  viser,
  type Envoi,
  type FichesAirbnb,
  type Pilote,
  type RenduLu,
} from "./tranches.ts";

function stationReelle(id: string): Station {
  const s = stationById(id);
  if (!s) throw new Error(`station absente du référentiel : ${id}`);
  return s;
}

const S2A = stationReelle("les-2-alpes");
const IN = "2027-02-06";
const OUT = "2027-02-13";
const NOW = Date.parse("2027-01-10T12:00:00Z");
const CTX = { dept: S2A.dept, checkIn: IN, checkOut: OUT, groupe: { trav: 8, rooms: 0 }, now: NOW };

/** Une annonce qui passe tout (comme dans `calcul.test.ts`). */
function annonce(over: Partial<Listing> = {}): Listing {
  return {
    id: "airbnb-1",
    stationId: "les-2-alpes",
    title: "Appartement plein sud",
    source: "Airbnb",
    total: 2000,
    currency: "EUR",
    guests: 8,
    bedrooms: 3,
    available: true,
    photo: null,
    url: "https://www.airbnb.fr/rooms/12345678",
    lat: S2A.lat + 0.002,
    lon: S2A.lon + 0.002,
    distToSlopesM: 800,
    proven: "Airbnb direct",
    pricedCheckIn: IN,
    pricedCheckOut: OUT,
    scannedAt: NOW - 60_000,
    ...over,
  };
}

/** Un Airbnb direct muet : position, mais ni capacité ni chambres. */
function muet(n: number, over: Partial<Listing> = {}): Listing {
  return annonce({
    id: `abnb-${n}`,
    url: `https://www.airbnb.fr/rooms/${n}0000`,
    title: `Appartement ${n}`,
    guests: null,
    bedrooms: null,
    total: 1000 + n,
    ...over,
  });
}

const RIEN: RenduLu = {
  correctifs: {},
  retires: [],
  arretAirbnb: null,
  essayees: [],
  laissees: [],
  hotesRefus: [],
  lues: 0,
};

describe("complétion d'une station : l'état entre deux tranches", () => {
  it("la mémoire reçoit le relevé brut ; la recopie comble l'offre muette de sa sœur", () => {
    const soeur = annonce({
      id: "abr-9",
      source: "Abritel",
      title: "Chalet des Cimes, vue glacier",
      proven: `CozyCozy Abritel live ${IN}→${OUT}`,
      url: "https://www.abritel.fr/location-vacances/p9",
    });
    const sansRien = muet(9, { title: "Chalet des Cimes, vue glacier" });
    const c = debutCompletion([sansRien, soeur], S2A);
    // La sœur est complète ; le muet ne l'est pas encore dans le relevé brut.
    assert.deepEqual(
      c.connues.map((x) => x.cle),
      ["Abritel:abr-9"],
    );
    assert.equal(c.listings[0].guests, 8);
    assert.match(c.listings[0].proven, /même logement/);
    assert.equal(aEnvoyer(c, CTX, "actives").length, 0);
  });

  it("n'envoie ni l'essayée, ni la laissée, ni Airbnb quand ses fiches sont suspendues", () => {
    const centrale = annonce({
      id: "c-1",
      source: "Centrale",
      url: "https://reservation.exemple.fr/fiche/1",
      guests: null,
      total: 900,
    });
    const c = debutCompletion([muet(1), muet(2), muet(3), centrale], S2A);
    assert.deepEqual(
      aEnvoyer(c, CTX, "actives").map((l) => l.id),
      ["c-1", "abnb-1", "abnb-2", "abnb-3"],
    );
    poserRendu(c, { ...RIEN, essayees: ["abnb-1"], laissees: ["abnb-2"], lues: 1 }, S2A);
    assert.deepEqual(
      aEnvoyer(c, CTX, "actives").map((l) => l.id),
      ["c-1", "abnb-3"],
    );
    assert.deepEqual(
      aEnvoyer(c, CTX, "refus").map((l) => l.id),
      ["c-1"],
    );
  });

  it("une fiche lue passe aussitôt à l'offre sœur, et la progression suit", () => {
    const a = muet(4, { title: "Chalet des Cimes, vue glacier" });
    const b = annonce({
      id: "abr-4",
      source: "Abritel",
      title: "Chalet des Cimes, vue glacier",
      guests: null,
      bedrooms: null,
      proven: `CozyCozy Abritel live ${IN}→${OUT}`,
      url: "https://www.abritel.fr/location-vacances/p4",
    });
    const c = debutCompletion([a, b], S2A);
    assert.equal(viser(c, CTX, "actives"), 2);
    assert.deepEqual(progression(c), { faites: 0, total: 2 });
    const avance = poserRendu(
      c,
      {
        ...RIEN,
        correctifs: { "abnb-4": { guests: 6, bedrooms: 2, proven: "Airbnb direct · fiche Airbnb" } },
        essayees: ["abnb-4"],
        lues: 1,
      },
      S2A,
    );
    assert.equal(avance, true);
    const soeur = c.listings.find((l) => l.id === "abr-4");
    assert.equal(soeur?.guests, 6);
    assert.equal(soeur?.bedrooms, 2);
    assert.deepEqual(progression(c), { faites: 1, total: 2 });
    assert.equal(aEnvoyer(c, CTX, "actives").length, 0);
  });

  it("une annonce retirée sort du relevé ; une tranche vide compte comme sans progrès", () => {
    const c = debutCompletion([muet(1), muet(2)], S2A);
    poserRendu(c, { ...RIEN, retires: ["abnb-1"], essayees: ["abnb-1"], lues: 1 }, S2A);
    assert.deepEqual(
      c.listings.map((l) => l.id),
      ["abnb-2"],
    );
    assert.equal(c.sansProgres, 0);
    assert.equal(poserRendu(c, RIEN, S2A), false);
    assert.equal(c.sansProgres, 1);
  });

  it("seul un changement compte : des requêtes sans fiche essayée, ni une fiche déjà essayée, ne sont pas un progrès", () => {
    const c = debutCompletion([muet(1), muet(2)], S2A);
    assert.equal(poserRendu(c, { ...RIEN, lues: 2 }, S2A), false);
    assert.equal(poserRendu(c, { ...RIEN, essayees: ["abnb-1"], lues: 1 }, S2A), true);
    assert.equal(poserRendu(c, { ...RIEN, essayees: ["abnb-1"], lues: 1 }, S2A), false);
    // Un correctif que rien ne pose (un champ hors de ceux qui se corrigent).
    assert.equal(poserRendu(c, { ...RIEN, correctifs: { "abnb-2": { source: "Booking" } } }, S2A), false);
    // La tranche qui a avancé a remis le compte à zéro ; deux depuis.
    assert.equal(c.sansProgres, 2);
  });

  it("un refus ou une panne suspendent Airbnb pour la course, un rythme ou une échéance non", () => {
    const cas: [Parameters<typeof fichesAirbnbApres>[1], FichesAirbnb][] = [
      [null, "actives"],
      ["echeance", "actives"],
      ["rythme", "actives"],
      ["hash", "actives"],
      ["refus", "refus"],
      ["coupe-circuit", "refus"],
      ["illisible", "panne"],
      ["cle", "panne"],
      ["worker", "panne"],
    ];
    for (const [arret, attendu] of cas) assert.equal(fichesAirbnbApres("actives", arret), attendu, String(arret));
    assert.equal(fichesAirbnbApres("refus", null), "refus");
    assert.equal(fichesAirbnbApres("panne", "refus"), "panne");
  });
});

/* ---------- La boucle entière, serveur simulé ---------- */

let dossier = "";
before(() => {
  dossier = mkdtempSync(join(tmpdir(), "skitrack-tranches-"));
});
after(() => {
  rmSync(dossier, { recursive: true, force: true });
});

function fiche(guests: number, bedrooms: number, over: Partial<FicheAirbnb> = {}): FicheAirbnb {
  return {
    guests,
    bedrooms,
    rooms: null,
    lat: null,
    lon: null,
    roomType: "Entire home/apt",
    typeLogement: "Logement entier : appartement",
    ecartee: false,
    ...over,
  };
}

type Banc = {
  pilote: Pilote;
  envois: Envoi[];
  airbnb: DemandeFichesAirbnb[];
  attentes: number[];
  notes: Array<{ airbnb: FichesAirbnb; faites: number; total: number }>;
};

/**
 * Le pilote de `releve.ts`, sans magasin ni minuterie, branché sur le vrai
 * `trancheProfonde` et une mémoire dans un dossier temporaire. `fiches` rend
 * la réponse du worker Airbnb, appel après appel.
 */
function banc(
  fiches: (d: DemandeFichesAirbnb, appel: number) => LectureFichesAirbnb,
  opts: {
    memoire?: MemoireFiches;
    lirePages?: Dependances["lirePages"];
    lirePagesAirbnb?: Dependances["lirePagesAirbnb"];
    arreterApres?: number;
    /** Les fiches Airbnb de la course quand la station commence. */
    airbnb?: FichesAirbnb;
  } = {},
): Banc {
  let etat: FichesAirbnb = opts.airbnb ?? "actives";
  const hotes = new Set<string>();
  const b: Banc = { pilote: null as unknown as Pilote, envois: [], airbnb: [], attentes: [], notes: [] };
  const memoire = opts.memoire ?? new MemoireFiches(join(dossier, `m${Math.random()}`, "fiches.json"));
  const vide: PagesProfond = { essayees: [], laissees: [], hotesRefus: [], lectures: {}, lues: 0 };
  const deps: Dependances = {
    async lireFichesAirbnb(d) {
      b.airbnb.push(d);
      return fiches(d, b.airbnb.length);
    },
    lirePages: opts.lirePages ?? (async () => vide),
    lirePagesAirbnb: opts.lirePagesAirbnb ?? (async () => ({ essayees: [], arret: null, lectures: {}, lues: 0 })),
    laissees: () => [],
    memoire,
    maintenant: () => NOW,
  };
  b.pilote = {
    async tranche(e) {
      b.envois.push(e);
      return trancheProfonde(
        { ...e, stationId: S2A.id, checkIn: IN, checkOut: OUT, voyageurs: 8 },
        deps,
      );
    },
    async entreDeux({ attenteMs }) {
      b.attentes.push(attenteMs);
      return opts.arreterApres == null || b.attentes.length <= opts.arreterApres;
    },
    airbnb: () => etat,
    hotesExclus: () => [...hotes],
    noter({ rendu, airbnb, faites, total }) {
      etat = airbnb;
      for (const h of rendu.hotesRefus) hotes.add(h);
      b.notes.push({ airbnb, faites, total });
    },
  };
  return b;
}

const silence = async <T>(f: () => Promise<T>): Promise<T> => {
  const { info, warn } = console;
  console.info = () => undefined;
  console.warn = () => undefined;
  try {
    return await f();
  } finally {
    console.info = info;
    console.warn = warn;
  }
};

describe("complétion d'une station : la boucle", () => {
  it("des tranches jusqu'au bout ; la médiane compte les annonces complétées", async () => {
    const releve = [annonce(), ...Array.from({ length: 3 }, (_, i) => muet(i + 1))];
    assert.equal(agreger(releve, CTX).n, 1);
    // Première tranche : une fiche, échéance ; seconde : les deux autres.
    const b = banc((d, appel) =>
      appel === 1
        ? { fiches: { [d.ids[0]]: fiche(8, 3) }, vides: [], restants: d.ids.slice(1), lues: 1, arret: "echeance" }
        : {
            fiches: Object.fromEntries(d.ids.map((id) => [id, fiche(10, 4)])),
            vides: [],
            restants: [],
            lues: d.ids.length,
            arret: null,
          },
    );
    const fin = await silence(() => completerStation(releve, CTX, S2A, b.pilote));
    assert.deepEqual(
      b.envois.map((e) => [e.mode, e.candidates.length]),
      [
        ["memoire", 3],
        ["tranche", 3],
        ["tranche", 2],
      ],
    );
    // La mémoire a reçu l'annonce complète du relevé, la première fois.
    assert.equal(b.envois[0].connues?.length, 1);
    assert.deepEqual(b.notes.at(-1), { airbnb: "actives", faites: 3, total: 3 });
    assert.equal(agreger(fin, CTX).n, 4);
    assert.ok(fin.every((l) => l.guests != null));
  });

  it("un refus d'Airbnb : plus aucune fiche Airbnb, et la course le sait", async () => {
    const releve = Array.from({ length: 3 }, (_, i) => muet(i + 1));
    const b = banc((d) => ({
      fiches: {},
      vides: [],
      restants: [...d.ids],
      lues: 1,
      arret: "refus",
      raison: "HTTP 429 (fiche)",
    }));
    const fin = await silence(() => completerStation(releve, CTX, S2A, b.pilote));
    assert.equal(b.airbnb.length, 1);
    assert.equal(b.notes.at(-1)?.airbnb, "refus");
    assert.equal(agreger(fin, CTX).n, 0);
  });

  it("le limiteur demande d'attendre : la tranche suivante attend d'abord", async () => {
    const releve = [muet(1)];
    const b = banc((d, appel) =>
      appel === 1
        ? { fiches: {}, vides: [], restants: [...d.ids], lues: 0, arret: "rythme", attenteMs: 12_000 }
        : { fiches: { [d.ids[0]]: fiche(8, 3) }, vides: [], restants: [], lues: 1, arret: null },
    );
    await silence(() => completerStation(releve, CTX, S2A, b.pilote));
    assert.deepEqual(b.attentes, [0, 12_000]);
  });

  it("hash périmé, et les pages rooms/ font attendre : la tranche suivante attend d'abord", async () => {
    let pages = 0;
    const b = banc((d) => ({ fiches: {}, vides: [], restants: [...d.ids], lues: 0, arret: "hash" }), {
      async lirePagesAirbnb(rows) {
        pages += 1;
        if (pages === 1) return { essayees: [], arret: "rythme", attenteMs: 40_000, lectures: {}, lues: 0 };
        rows[0].guests = 8;
        rows[0].bedrooms = 3;
        return { essayees: [rows[0].id], arret: null, lectures: {}, lues: 1 };
      },
    });
    const fin = await silence(() => completerStation([muet(1)], CTX, S2A, b.pilote));
    assert.deepEqual(b.attentes, [0, 40_000]);
    assert.equal(agreger(fin, CTX).n, 1);
  });

  it("« Arrêter » coupe entre deux tranches", async () => {
    const releve = Array.from({ length: 3 }, (_, i) => muet(i + 1));
    const b = banc(
      (d) => ({ fiches: { [d.ids[0]]: fiche(8, 3) }, vides: [], restants: d.ids.slice(1), lues: 1, arret: "echeance" }),
      { arreterApres: 1 },
    );
    const fin = await silence(() => completerStation(releve, CTX, S2A, b.pilote));
    assert.equal(b.airbnb.length, 1);
    // Ce que la tranche finie a trouvé reste posé.
    assert.equal(agreger(fin, CTX).n, 1);
  });

  it("des tranches qui n'avancent pas s'arrêtent d'elles-mêmes", async () => {
    const releve = [muet(1)];
    const b = banc((d) => ({ fiches: {}, vides: [], restants: [...d.ids], lues: 0, arret: "echeance" }));
    await silence(() => completerStation(releve, CTX, S2A, b.pilote));
    assert.equal(b.airbnb.length, SANS_PROGRES_MAX);
  });

  it("un limiteur qui fait attendre laisse plus de tranches, mais pas sans fin", async () => {
    const releve = [muet(1)];
    const b = banc((d) => ({
      fiches: {},
      vides: [],
      restants: [...d.ids],
      lues: 0,
      arret: "rythme",
      attenteMs: 20_000,
    }));
    await silence(() => completerStation(releve, CTX, S2A, b.pilote));
    assert.equal(b.airbnb.length, SANS_PROGRES_RYTHME_MAX);
    assert.ok(b.attentes.slice(1).every((ms) => ms === 20_000));
  });

  it("la course suivante lit dans la mémoire ce que la première a trouvé, sans requête", async () => {
    const memoire = new MemoireFiches(join(dossier, "partagee", "fiches.json"));
    const releve = [muet(1), muet(2)];
    const premiere = banc(
      (d) => ({
        fiches: Object.fromEntries(d.ids.map((id) => [id, fiche(8, 3)])),
        vides: [],
        restants: [],
        lues: d.ids.length,
        arret: null,
      }),
      { memoire },
    );
    await silence(() => completerStation(releve, CTX, S2A, premiere.pilote));
    const seconde = banc(() => {
      throw new Error("aucune requête attendue");
    }, { memoire });
    const fin = await silence(() => completerStation(releve, CTX, S2A, seconde.pilote));
    assert.equal(seconde.airbnb.length, 0);
    assert.deepEqual(
      seconde.envois.map((e) => e.mode),
      ["memoire"],
    );
    assert.equal(agreger(fin, CTX).n, 2);
    assert.ok(fin.every((l) => /mémoire des fiches/.test(l.proven)));
  });

  it("fiches Airbnb suspendues plus tôt dans la course : la mémoire comble encore les Airbnb, sans requête", async () => {
    for (const suspendues of ["refus", "panne"] as const) {
      const memoire = new MemoireFiches(join(dossier, `suspendues-${suspendues}`, "fiches.json"));
      // Une course précédente a lu les fiches de deux d'entre elles.
      const avant = banc(
        (d) => ({
          fiches: Object.fromEntries(d.ids.map((id) => [id, fiche(8, 3)])),
          vides: [],
          restants: [],
          lues: d.ids.length,
          arret: null,
        }),
        { memoire },
      );
      await silence(() => completerStation([muet(1), muet(2)], CTX, S2A, avant.pilote));
      // Cette course-ci : une station plus tôt a suspendu les fiches Airbnb.
      const b = banc(
        () => {
          throw new Error("aucune fiche Airbnb attendue");
        },
        { memoire, airbnb: suspendues },
      );
      const fin = await silence(() => completerStation([muet(1), muet(2), muet(3)], CTX, S2A, b.pilote));
      assert.equal(b.airbnb.length, 0, suspendues);
      // La tranche « mémoire » seule : la troisième, que la mémoire ignore, n'est pas envoyée aux fiches.
      assert.deepEqual(
        b.envois.map((e) => [e.mode, e.candidates.length]),
        [["memoire", 3]],
        suspendues,
      );
      assert.equal(agreger(fin, CTX).n, 2, suspendues);
      assert.ok(
        fin.filter((l) => l.id !== "abnb-3").every((l) => /mémoire des fiches/.test(l.proven)),
        suspendues,
      );
    }
  });

  it("une page partie puis coupée à l'échéance n'est pas un progrès : la station s'arrête", async () => {
    // L'hôte accepte la connexion, puis ne répond pas : la requête compte
    // dans `lues`, mais la fiche n'est ni essayée, ni laissée.
    const centrale = annonce({
      id: "c-1",
      source: "Centrale",
      url: "https://reservation.exemple.fr/fiche/1",
      guests: null,
      total: 900,
    });
    let appels = 0;
    const b = banc(() => ({ fiches: {}, vides: [], restants: [], lues: 0, arret: null }), {
      async lirePages() {
        appels += 1;
        // Filet de l'essai : sans lui, la boucle d'avant ne s'arrêtait pas.
        if (appels > 3 * SANS_PROGRES_MAX) throw new Error("tranches sans fin");
        return { essayees: [], laissees: [], hotesRefus: [], lectures: {}, lues: 1 };
      },
    });
    await silence(() => completerStation([centrale], CTX, S2A, b.pilote));
    assert.equal(appels, SANS_PROGRES_MAX);
  });

  it("une fiche Airbnb lue, pleine ou vide, ne se redemande pas à la station voisine", async () => {
    const memoire = new MemoireFiches(join(dossier, "voisines", "fiches.json"));
    // 10000 publie la capacité, ni chambres ni pièces ; 20000 est vide.
    const lire = (d: DemandeFichesAirbnb): LectureFichesAirbnb => ({
      fiches: d.ids.includes("10000") ? { "10000": fiche(8, 0, { bedrooms: null }) } : {},
      vides: d.ids.filter((id) => id === "20000"),
      restants: [],
      lues: d.ids.length,
      arret: null,
    });
    const premiere = banc(lire, { memoire });
    await silence(() => completerStation([muet(1), muet(2)], CTX, S2A, premiere.pilote));
    assert.deepEqual(
      premiere.airbnb.map((d) => [...d.ids].sort()),
      [["10000", "20000"]],
    );
    // La station voisine relève les deux mêmes annonces, dans la même course.
    const voisine = banc(lire, { memoire });
    const fin = await silence(() => completerStation([muet(1), muet(2)], CTX, S2A, voisine.pilote));
    assert.equal(voisine.airbnb.length, 0);
    // Ce que la fiche a publié passe quand même, par la mémoire.
    assert.equal(fin.find((l) => l.id === "abnb-1")?.guests, 8);
  });

  it("un hôte qui refuse une page n'est plus sollicité de la course", async () => {
    const centrale = (n: number) =>
      annonce({
        id: `c-${n}`,
        source: "Centrale",
        url: `https://reservation.exemple.fr/fiche/${n}`,
        guests: null,
        total: 900 + n,
      });
    const b = banc(() => ({ fiches: {}, vides: [], restants: [], lues: 0, arret: null }), {
      async lirePages(rows) {
        return {
          essayees: [],
          laissees: rows.map((r) => r.id),
          hotesRefus: ["reservation.exemple.fr"],
          lectures: {},
          lues: 1,
        };
      },
    });
    await silence(() => completerStation([centrale(1), centrale(2)], CTX, S2A, b.pilote));
    assert.equal(b.envois.length, 2);
    assert.deepEqual(b.pilote.hotesExclus(), ["reservation.exemple.fr"]);
  });
});
