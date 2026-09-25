/**
 * Le chemin serveur de la complétion de l'écran Prix (`lirePagesProfond`,
 * `lirePagesAirbnbProfond`) et la pose d'une page (`poserLecture`), hors
 * ligne : `fetch` simulé, horloge simulée (`mock.timers`), et les états
 * partagés avec Python (limiteur, coupe-circuit, session Airbnb) dans un
 * dossier temporaire, jamais ceux de l'application.
 *
 * Le module serveur importe `listings.ts`, dont les imports n'ont pas
 * d'extension : un résolveur (`registerHooks`) les complète, comme Vite.
 */
import { after, afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Listing } from "../listings.ts";
import type { LectureFiche } from "./lectureFiche.ts";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      const base = specifier.startsWith("@/")
        ? join(SRC, specifier.slice(2))
        : /^\.\.?\//.test(specifier) && context.parentURL
          ? join(dirname(fileURLToPath(context.parentURL)), specifier)
          : null;
      for (const chemin of base ? [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")] : []) {
        if (existsSync(chemin)) return nextResolve(pathToFileURL(chemin).href, context);
      }
      throw err;
    }
  },
});

const DOSSIER = mkdtempSync(join(tmpdir(), "skitrack-pages-"));
process.env.SKITRACK_TAUX = join(DOSSIER, "taux.json");
process.env.SKITRACK_AIRBNB_CIRCUIT = join(DOSSIER, "airbnb-429");
process.env.SKITRACK_AIRBNB_SESSION = join(DOSSIER, "airbnb-session.json");

const { lirePagesAirbnbProfond, lirePagesProfond, poserLecture } = await import("./completerFiche.server.ts");

const T0 = Date.parse("2027-01-10T12:00:00Z");

/* ---------- Le réseau simulé ---------- */

/** Ce qu'un hôte répond : une page (statut, délai), rien du tout, ou une erreur réseau. */
type Reponse = { status?: number; html?: string; apresMs?: number } | "muet" | "echec";

const departs: Array<{ url: string; t: number }> = [];
let repondre: (url: string) => Reponse = () => ({ html: page() });
const fetchAvant = globalThis.fetch;

globalThis.fetch = (async (entree: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = String(entree);
  departs.push({ url, t: Date.now() });
  const r = repondre(url);
  if (r === "echec") throw new TypeError("fetch failed");
  return new Promise<Response>((ok, ko) => {
    const signal = init?.signal;
    const couper = () => ko(new DOMException("This operation was aborted", "AbortError"));
    if (signal?.aborted) return couper();
    signal?.addEventListener("abort", couper, { once: true });
    if (r === "muet") return;
    setTimeout(() => {
      signal?.removeEventListener("abort", couper);
      ok(new Response(r.html ?? "", { status: r.status ?? 200 }));
    }, r.apresMs ?? 100);
  });
}) as typeof fetch;

after(() => {
  globalThis.fetch = fetchAvant;
  rmSync(DOSSIER, { recursive: true, force: true });
});

/** Une fiche de centrale assez longue pour être lue (400 caractères au moins). */
function page(corps = `<meta name="description" content="Appartement 6 personnes, 3 pièces" />`): string {
  return `<html><head>${corps}</head><body>${"<p>Séjour à la montagne.</p>".repeat(20)}</body></html>`;
}

function ligne(n: number, hote: string, over: Partial<Listing> = {}): Listing {
  return {
    id: `c-${n}`,
    stationId: "les-2-alpes",
    title: `Appartement ${n}`,
    source: "Centrale",
    total: 1000,
    currency: "EUR",
    guests: null,
    bedrooms: null,
    available: true,
    photo: null,
    url: `https://${hote}/fiche/${n}`,
    lat: null,
    lon: null,
    proven: "Ingénie live",
    ...over,
  };
}

/* ---------- L'horloge simulée ---------- */

beforeEach(() => {
  departs.length = 0;
  repondre = () => ({ html: page() });
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 });
});
afterEach(() => {
  mock.timers.reset();
});

/** Fait tourner l'horloge simulée, pas à pas, jusqu'à ce que `p` soit réglée. */
async function jouer<T>(p: Promise<T>, pasMs = 10): Promise<T> {
  let fini = false;
  p.then(
    () => (fini = true),
    () => (fini = true),
  );
  for (let n = 0; !fini; n += 1) {
    if (n > 100_000) throw new Error("toujours en cours après 1 000 s simulées");
    await new Promise((r) => setImmediate(r));
    if (!fini) mock.timers.tick(pasMs);
  }
  return p;
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

const lire = (rows: Listing[], untilMs: number, hotesExclus: string[] = []) =>
  silence(() => jouer(lirePagesProfond(rows, { until: Date.now() + untilMs, hotesExclus, urlsCommunes: [] })));

const trie = (xs: readonly string[]) => [...xs].sort();

/* ---------- Les essais ---------- */

describe("pages de fiche de l'écran Prix : ce qu'une tranche rend", () => {
  it("une page partie trop tard pour répondre reste à lire à la tranche suivante", async () => {
    repondre = () => "muet";
    const r = await lire([ligne(1, "tard.exemple.fr")], 3_000);
    assert.equal(r.lues, 1);
    assert.deepEqual([r.essayees, r.laissees, r.hotesRefus], [[], [], []]);
  });

  it("un hôte qui ne répond pas est laissé pour la course : ses pages ne repartent pas", async () => {
    repondre = () => "muet";
    const hote = "muet.exemple.fr";
    const r = await lire([ligne(1, hote), ligne(2, hote), ligne(3, hote)], 42_000);
    assert.equal(departs.length, 2);
    assert.deepEqual(trie(r.essayees), ["c-1", "c-2"]);
    assert.deepEqual(r.laissees, ["c-3"]);
    assert.deepEqual(r.hotesRefus, [hote]);
  });

  it("un 403 laisse l'hôte : ses autres fiches ne partent pas, les autres hôtes continuent", async () => {
    repondre = (url) => (url.includes("refus.exemple.fr") ? { status: 403 } : { html: page() });
    const r = await lire(
      [ligne(1, "refus.exemple.fr"), ligne(2, "refus.exemple.fr"), ligne(3, "refus.exemple.fr"), ligne(4, "autre.exemple.fr")],
      42_000,
    );
    assert.equal(departs.filter((d) => d.url.includes("refus.exemple.fr")).length, 1);
    assert.deepEqual(r.hotesRefus, ["refus.exemple.fr"]);
    assert.deepEqual(trie(r.laissees), ["c-1", "c-2", "c-3"]);
    assert.deepEqual(r.essayees, ["c-4"]);
  });

  it("un hôte déjà exclu de la course ne reçoit rien", async () => {
    const r = await lire([ligne(1, "exclu.exemple.fr")], 42_000, ["exclu.exemple.fr"]);
    assert.equal(departs.length, 0);
    assert.deepEqual(r.laissees, ["c-1"]);
    assert.deepEqual(r.hotesRefus, []);
  });

  it("une URL que portent deux annonces n'est ouverte pour aucune", async () => {
    const commune = "https://commune.exemple.fr/fiche/9";
    const r = await lire([ligne(1, "", { url: commune }), ligne(2, "", { url: commune })], 42_000);
    assert.equal(departs.length, 0);
    assert.deepEqual(trie(r.laissees), ["c-1", "c-2"]);
  });

  it("une page en erreur réseau est notée essayée : elle ne se redemande pas", async () => {
    repondre = () => "echec";
    const r = await lire([ligne(1, "panne.exemple.fr")], 42_000);
    assert.deepEqual(r.essayees, ["c-1"]);
    assert.deepEqual(r.laissees, []);
  });

  it("deux fiches qui ne diffèrent que par la requête (iResa, ?package=) ne se prêtent pas leur lecture", async () => {
    // Chaque package publie sa propre capacité.
    repondre = (url) => ({
      html: page(
        `<meta name="description" content="Appartement ${url.includes("package=12") ? 6 : 4} personnes, 3 pièces" />`,
      ),
    });
    const base = "https://www.iresa-cache.exemple.fr/residence-les-cimes";
    const a = ligne(1, "", { url: `${base}?package=12` });
    const b = ligne(2, "", { url: `${base}?package=13` });
    const ra = await lire([a], 42_000);
    assert.deepEqual([ra.essayees, a.guests], [["c-1"], 6]);
    // Une tranche plus tard, la fiche B se lit elle-même : rien de la page A.
    const rb = await lire([b], 42_000);
    assert.equal(departs.length, 2);
    assert.equal(departs[1].url, `${base}?package=13`);
    assert.equal(b.guests, 4);
    assert.equal(rb.lectures["c-2"]?.guests, 4);
  });

  it("la même fiche à d'autres dates se relit dans le cache : seules les dates sont ôtées de la clé", async () => {
    const base = "https://www.abritel-cache.exemple.fr/location-vacances/p77";
    const a = ligne(1, "", { url: `${base}?chkin=2027-02-06&chkout=2027-02-13&adults=8` });
    const b = ligne(2, "", { url: `${base}?chkin=2027-02-13&chkout=2027-02-20&adults=8` });
    await lire([a], 42_000);
    const rb = await lire([b], 42_000);
    assert.equal(departs.length, 1);
    assert.deepEqual([rb.essayees, b.guests], [["c-2"], 6]);
  });

  it("la taxe de séjour d'une page ne change pas le prix relevé", async () => {
    repondre = () => ({
      html: page(`<meta name="description" content="Appartement 6 personnes, 3 pièces" />
        </head><body><p>Taxe de séjour : 45,00 €</p>`),
    });
    const row = ligne(1, "taxe.exemple.fr");
    const r = await lire([row], 42_000);
    assert.deepEqual(r.essayees, ["c-1"]);
    assert.equal(row.guests, 6);
    assert.equal(row.total, 1000);
    assert.doesNotMatch(row.proven, /taxe de séjour/);
  });
});

describe("pages de fiche : le rythme par hôte", () => {
  it("une seconde entre deux départs vers un hôte, d'une tranche à l'autre", async () => {
    const hote = "ecart.exemple.fr";
    await lire([ligne(1, hote)], 42_000);
    await lire([ligne(2, hote)], 42_000);
    assert.equal(departs.length, 2);
    assert.ok(departs[1].t - departs[0].t >= 1_000, `écart de ${departs[1].t - departs[0].t} ms`);
  });

  it("une seconde entre deux départs vers un hôte, même quand les dix places sont prises", async () => {
    repondre = () => ({ html: page(), apresMs: 2_000 });
    const rows = [
      ...Array.from({ length: 18 }, (_, i) => ligne(100 + i, `h${i}.exemple.fr`)),
      ligne(200, "file.exemple.fr"),
      ligne(201, "file.exemple.fr"),
    ];
    await lire(rows, 42_000);
    const vers = departs.filter((d) => d.url.includes("file.exemple.fr")).map((d) => d.t);
    assert.equal(vers.length, 2);
    assert.ok(vers[1] - vers[0] >= 1_000, `écart de ${vers[1] - vers[0]} ms`);
  });

  it("six secondes au moins entre deux pages rooms/, d'une tranche à l'autre", async () => {
    repondre = () => ({ html: page(`<script>{"personCapacity":4}</script>`) });
    const airbnb = (n: number) =>
      ligne(n, "www.airbnb.fr", { id: `abnb-${n}`, source: "Airbnb", url: `https://www.airbnb.fr/rooms/${n}` });
    const un = await silence(() => jouer(lirePagesAirbnbProfond([airbnb(4100001)], Date.now() + 42_000)));
    const deux = await silence(() => jouer(lirePagesAirbnbProfond([airbnb(4100002)], Date.now() + 42_000)));
    assert.deepEqual([un.essayees, deux.essayees], [["abnb-4100001"], ["abnb-4100002"]]);
    assert.equal(departs.length, 2);
    assert.ok(departs[1].t - departs[0].t >= 6_000, `écart de ${departs[1].t - departs[0].t} ms`);
  });
});

describe("poserLecture : la taxe de séjour, une fois", () => {
  const lect = (taxeSejour: number | null): LectureFiche => ({
    guests: 6,
    bedrooms: null,
    rooms: null,
    lat: null,
    lon: null,
    locality: null,
    street: null,
    title: null,
    taxeSejour,
  });

  it("Logements : la taxe publiée s'ajoute au loyer seul d'une centrale", () => {
    const row = ligne(1, "loyer.exemple.fr");
    assert.equal(poserLecture(row, lect(45)), true);
    assert.equal(row.total, 1045);
    assert.match(row.proven, /taxe de séjour/);
  });

  it("après le panier (loyer et taxe), la taxe ne s'ajoute pas une seconde fois", () => {
    const row = ligne(1, "panier.exemple.fr", { total: 1060, proven: "Ingénie live · panier" });
    poserLecture(row, lect(60));
    assert.equal(row.total, 1060);
    assert.equal(row.guests, 6);
    const libelle = ligne(2, "panier.exemple.fr", { total: 1060, priceLabel: "loyer et taxe de séjour" });
    poserLecture(libelle, lect(60));
    assert.equal(libelle.total, 1060);
  });
});
