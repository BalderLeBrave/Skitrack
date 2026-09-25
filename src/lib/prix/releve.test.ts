/**
 * La boucle de relevé de l'écran Prix (`releve.ts`), hors navigateur. Le
 * magasin, la course, le verrou entre onglets (`navigator.locks` de Node) et
 * la complétion (`tranches.ts`) sont les vrais ; les appels au serveur
 * (`searchStay`, `etatAirbnb`, `completerProfond`) et IndexedDB
 * (`annonces.ts`) sont des doublures que l'essai commande.
 *
 * `releve.ts` importe sans extension, comme le permet Vite : un résolveur
 * (`registerHooks`) complète ces imports et redirige les quatre modules
 * doublés vers des modules `data:` qui renvoient à `globalThis.__releve`.
 */
import { after, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Listing } from "../listings.ts";
import { stationById, type Station } from "../stations.ts";
import { cleResultat, type Job, type Resultat } from "./calcul.ts";
import type { RenduTranche } from "./completion.server.ts";

const ICI = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(ICI, "..", "..");

/** Les modules doublés, par chemin sans extension. */
const DOUBLURES = new Map<string, string>([
  [
    join(SRC, "lib", "searchStay"),
    `export const SEARCH_PART_MS = 52000, DEVIS_MS = 18000, TARIF_MS = 18000;
     export const searchStay = (a) => globalThis.__releve.searchStay(a);`,
  ],
  [join(ICI, "attente"), `export const etatAirbnb = (a) => globalThis.__releve.etatAirbnb(a);`],
  [join(ICI, "completion"), `export const completerProfond = (a) => globalThis.__releve.completerProfond(a);`],
  [
    join(ICI, "annonces"),
    `export const ecrireAnnonces = (...a) => globalThis.__releve.annonces("ecrire", ...a);
     export const oublierAnnonces = (...a) => globalThis.__releve.annonces("oublier", ...a);
     export const oublierAnnoncesSauf = (...a) => globalThis.__releve.annonces("oublierSauf", ...a);`,
  ],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const parent =
      context.parentURL?.startsWith("file:") ? dirname(fileURLToPath(context.parentURL)) : null;
    const base = parent && /^\.\.?\//.test(specifier) ? join(parent, specifier) : null;
    const doublure = base ? DOUBLURES.get(base.replace(/\.tsx?$/, "")) : undefined;
    if (doublure) {
      return { url: `data:text/javascript,${encodeURIComponent(doublure)}`, shortCircuit: true };
    }
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      for (const chemin of base ? [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")] : []) {
        if (existsSync(chemin)) return nextResolve(pathToFileURL(chemin).href, context);
      }
      throw err;
    }
  },
});

type Part = "airbnb" | "cozy" | "greengo" | "centrales" | "gites";
type Rendu = { listings: Listing[]; sources: unknown[] };
type DemandePart = { data: { part: Part; stationId: string } };
type DemandeTranche = { data: { mode: "memoire" | "tranche"; candidates: Array<{ id: string; proven: string }> } };

type Banc = {
  searchStay(a: DemandePart): Promise<Rendu>;
  etatAirbnb(a: unknown): Promise<{ attenteMs: number; motif: null }>;
  completerProfond(a: DemandeTranche): Promise<RenduTranche>;
  annonces(op: string, cle?: unknown, annonces?: unknown): Promise<void>;
};

const g = globalThis as unknown as { __releve: Banc; window?: unknown };

/** Ce que les doublures ont vu passer. */
const vu = {
  parts: [] as Array<{ station: string; part: Part }>,
  tranches: [] as Array<DemandeTranche["data"]>,
  annonces: [] as Array<{ op: string; cle: unknown; n: number | null }>,
};

function stationReelle(id: string): Station {
  const s = stationById(id);
  if (!s) throw new Error(`station absente du référentiel : ${id}`);
  return s;
}

const S2A = stationReelle("les-2-alpes");
const PER = { from: "2027-02-06", nights: 7 };
const IN = "2027-02-06";
const OUT = "2027-02-13";
const GROUPE = { trav: 8, rooms: 0 };
const JOB: Job = { nom: "Les 2 Alpes", ids: [S2A.id], per: PER, groupe: GROUPE };
const CLE = cleResultat(PER, GROUPE, S2A.id);

/** Une annonce Airbnb qui passe tout ; `muette` : ni capacité ni chambres. */
function annonce(n: number, muette = false): Listing {
  return {
    id: `abnb-${n}`,
    stationId: S2A.id,
    title: `Appartement ${n} plein sud`,
    source: "Airbnb",
    total: 1000 + n,
    currency: "EUR",
    guests: muette ? null : 8,
    bedrooms: muette ? null : 3,
    available: true,
    photo: null,
    url: `https://www.airbnb.fr/rooms/${n}0000`,
    lat: S2A.lat + 0.001 * n,
    lon: S2A.lon + 0.001 * n,
    distToSlopesM: 800,
    proven: "Airbnb direct",
    pricedCheckIn: IN,
    pricedCheckOut: OUT,
    scannedAt: Date.now() - 60_000,
  };
}

/** Les parts d'une station : une annonce complète et une muette côté Airbnb, rien ailleurs. */
async function partsParDefaut({ data }: DemandePart): Promise<Rendu> {
  return { listings: data.part === "airbnb" ? [annonce(1), annonce(2, true)] : [], sources: [] };
}

/** La tranche « mémoire » : elle comble chaque candidate de ce qu'une fiche a déjà publié. */
function renduMemoire(d: DemandeTranche["data"]): RenduTranche {
  return {
    correctifs: Object.fromEntries(
      d.candidates.map((c) => [c.id, { guests: 8, bedrooms: 3, proven: `${c.proven} · mémoire des fiches` }]),
    ),
    retires: [],
    restantes: 0,
    arretAirbnb: null,
    essayees: [],
    laissees: [],
    hotesRefus: [],
    lues: 0,
  };
}

g.__releve = {
  searchStay: partsParDefaut,
  etatAirbnb: async () => ({ attenteMs: 0, motif: null }),
  completerProfond: async ({ data }) => renduMemoire(data),
  annonces: async () => undefined,
};

function doublures(over: Partial<Banc> = {}): void {
  g.__releve = {
    searchStay: async (a) => {
      vu.parts.push({ station: a.data.stationId, part: a.data.part });
      return (over.searchStay ?? partsParDefaut)(a);
    },
    etatAirbnb: over.etatAirbnb ?? (async () => ({ attenteMs: 0, motif: null })),
    completerProfond: async (a) => {
      vu.tranches.push(a.data);
      return (over.completerProfond ?? (async ({ data }) => renduMemoire(data)))(a);
    },
    annonces: async (op, cle, annonces) => {
      vu.annonces.push({ op, cle, n: Array.isArray(annonces) ? annonces.length : null });
    },
  };
}

const { usePrix } = await import("./releve.ts");
// `lancer` ne part que dans un navigateur ; posé après l'import, pour que le
// module n'écoute pas `storage` ni `useStay`.
g.window = globalThis;

after(() => {
  delete g.window;
});

/** Quelques tours de boucle : les continuations de `derouler` passent. */
const tours = () => new Promise((r) => setTimeout(r, 20));

/** Attend `cond`, deux secondes au plus. */
async function attendreQue(cond: () => boolean | Promise<boolean>, quoi: string): Promise<void> {
  const fin = Date.now() + 2_000;
  while (!(await cond())) {
    if (Date.now() > fin) throw new Error(`toujours pas : ${quoi}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** La course finie, le verrou rendu : plus rien ne s'écrit. */
async function auRepos(): Promise<void> {
  await attendreQue(
    async () => usePrix.getState().course === null && (await navigator.locks.query()).held?.length === 0,
    "course finie et verrou rendu",
  );
  await tours();
}

async function silence<T>(f: () => Promise<T>): Promise<T> {
  const { info, warn } = console;
  console.info = () => undefined;
  console.warn = () => undefined;
  try {
    return await f();
  } finally {
    console.info = info;
    console.warn = warn;
  }
}

beforeEach(async () => {
  await auRepos();
  vu.parts.length = 0;
  vu.tranches.length = 0;
  vu.annonces.length = 0;
  usePrix.setState({ res: {}, course: null, file: [] });
  doublures();
});

describe("relevé de l'écran Prix : « Arrêter »", () => {
  it("sans arrêt : la station s'écrit, complétée, et la course finit", async () => {
    await silence(async () => {
      usePrix.getState().lancer(JOB);
      await auRepos();
    });
    const r = usePrix.getState().res[CLE] as Extract<Resultat, { etat: "fait" }> | undefined;
    assert.equal(r?.etat, "fait");
    assert.equal(r?.n, 2);
    assert.deepEqual(vu.annonces, [{ op: "ecrire", cle: CLE, n: 2 }]);
  });

  it("pendant la complétion : les cinq parts rendues, la station s'écrit quand même, puis la course s'arrête", async () => {
    await silence(async () => {
      doublures({
        async completerProfond({ data }) {
          // L'utilisateur arrête pendant que la tranche « mémoire » est en vol.
          usePrix.getState().arreter();
          return renduMemoire(data);
        },
      });
      usePrix.getState().lancer(JOB);
      await auRepos();
    });
    assert.equal(vu.parts.length, 5);
    assert.deepEqual(
      vu.tranches.map((t) => t.mode),
      ["memoire"],
    );
    const r = usePrix.getState().res[CLE] as Extract<Resultat, { etat: "fait" }> | undefined;
    // La médiane compte l'annonce que la tranche a complétée.
    assert.equal(r?.etat, "fait");
    assert.equal(r?.n, 2);
    assert.deepEqual(vu.annonces, [{ op: "ecrire", cle: CLE, n: 2 }]);
    assert.equal(usePrix.getState().course, null);
  });

  it("pendant une tranche de fiches : ce qu'elle rend compte, et aucune autre ne part", async () => {
    await silence(async () => {
      doublures({
        searchStay: async ({ data }) => ({
          listings: data.part === "airbnb" ? [annonce(1), annonce(2, true), annonce(3, true)] : [],
          sources: [],
        }),
        async completerProfond({ data }) {
          // La mémoire ne sait rien ; la première tranche de fiches est en vol quand on arrête.
          if (data.mode === "memoire") return { ...renduMemoire({ ...data, candidates: [] }) };
          usePrix.getState().arreter();
          return renduMemoire({ ...data, candidates: data.candidates.slice(0, 1) });
        },
      });
      usePrix.getState().lancer(JOB);
      await auRepos();
    });
    assert.deepEqual(
      vu.tranches.map((t) => t.mode),
      ["memoire", "tranche"],
    );
    const r = usePrix.getState().res[CLE] as Extract<Resultat, { etat: "fait" }> | undefined;
    assert.equal(r?.etat, "fait");
    // L'annonce complète, et celle que la tranche en vol a comblée ; la troisième reste muette.
    assert.equal(r?.n, 2);
    assert.equal(r?.muettes, 1);
    assert.deepEqual(vu.annonces, [{ op: "ecrire", cle: CLE, n: 2 }]);
  });

  it("pendant les parts : rien ne s'écrit, et aucune complétion ne part", async () => {
    const enVol: Array<() => void> = [];
    await silence(async () => {
      doublures({
        searchStay: (a) =>
          new Promise<Rendu>((ok) => {
            enVol.push(() => void partsParDefaut(a).then(ok));
          }),
      });
      usePrix.getState().lancer(JOB);
      await attendreQue(() => enVol.length === 3, "trois parts en vol");
      usePrix.getState().arreter();
      // Le serveur finit les parts parties : elles se rendent toutes.
      for (let k = 0; k < 5; k += 1) {
        await attendreQue(() => enVol.length > k, `part ${k + 1} partie`);
        enVol[k]();
      }
      await auRepos();
    });
    assert.equal(vu.parts.length, 5);
    assert.equal(vu.tranches.length, 0);
    assert.equal(usePrix.getState().res[CLE], undefined);
    assert.deepEqual(vu.annonces, []);
  });

  it("la course suivante attend la station arrêtée, qui s'écrit avant qu'elle parte", async () => {
    const autre = stationReelle("chamrousse");
    const suivante: Job = { nom: "Chamrousse", ids: [autre.id], per: PER, groupe: GROUPE };
    let rendre: (() => void) | null = null;
    let ecriteAvant: boolean | null = null;
    await silence(async () => {
      doublures({
        async searchStay(a) {
          if (a.data.stationId === autre.id && ecriteAvant === null) {
            ecriteAvant = usePrix.getState().res[CLE] !== undefined;
          }
          return partsParDefaut(a);
        },
        completerProfond: ({ data }) =>
          new Promise<RenduTranche>((ok) => {
            if (data.candidates.some((c) => c.id === "abnb-2") && rendre === null) {
              rendre = () => ok(renduMemoire(data));
            } else ok(renduMemoire(data));
          }),
      });
      usePrix.getState().lancer(JOB);
      await attendreQue(() => rendre !== null, "tranche « mémoire » en vol");
      usePrix.getState().lancer(suivante);
      usePrix.getState().arreter();
      await tours();
      // La course suivante a démarré, et attend la station arrêtée.
      assert.equal(usePrix.getState().course?.nom, "Chamrousse");
      assert.equal(usePrix.getState().course?.attente?.motif, "arret");
      assert.equal(ecriteAvant, null);
      (rendre as unknown as () => void)();
      await auRepos();
    });
    assert.equal(ecriteAvant, true);
    assert.equal(usePrix.getState().res[CLE]?.etat, "fait");
    assert.equal(usePrix.getState().res[cleResultat(PER, GROUPE, autre.id)]?.etat, "fait");
  });
});
