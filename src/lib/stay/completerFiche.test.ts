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
// La mémoire des fiches (`fiches.json`) aussi : jamais celle de l'application.
process.env.SKITRACK_CONFIG_DIR = DOSSIER;

const {
  etatSuiteAirbnb,
  fillFiches,
  lirePagesAirbnbProfond,
  lirePagesProfond,
  noteDeLecture,
  poserLecture,
  poserMemoire,
} = await import("./completerFiche.server.ts");
const { memoireFiches } = await import("./memoireFiches.server.ts");
const { ficheDepuisBrut } = await import("./ficheEnrichie.ts");

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
    capacity: null,
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
    // Une seule lecture en vol : la première page muette laisse l'hôte, les suivantes ne partent pas.
    assert.equal(departs.length, 1);
    assert.deepEqual(trie(r.essayees), ["c-1"]);
    assert.deepEqual(trie(r.laissees), ["c-2", "c-3"]);
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

  it("un hôte qui a refusé reste en pause d'une tranche, ou d'une recherche, à l'autre", async () => {
    repondre = (url) => (url.includes("pause.exemple.fr") ? { status: 429 } : { html: page() });
    const un = await lire([ligne(1, "pause.exemple.fr"), ligne(2, "pause.exemple.fr")], 42_000);
    assert.deepEqual(un.hotesRefus, ["pause.exemple.fr"]);
    assert.equal(departs.filter((d) => d.url.includes("pause.exemple.fr")).length, 1);
    // Tranche suivante, course nouvelle (rien d'exclu) : l'hôte ne reçoit rien,
    // et ce n'est pas un refus de plus.
    const deux = await lire([ligne(3, "pause.exemple.fr"), ligne(4, "ailleurs.exemple.fr")], 42_000);
    assert.equal(departs.filter((d) => d.url.includes("pause.exemple.fr")).length, 1);
    assert.deepEqual(deux.hotesRefus, []);
    assert.deepEqual(deux.laissees, ["c-3"]);
    assert.deepEqual(deux.essayees, ["c-4"]);
    // Dix minutes plus tard, la pause est levée.
    mock.timers.tick(10 * 60_000 + 1_000);
    repondre = () => ({ html: page() });
    await lire([ligne(5, "pause.exemple.fr")], 42_000);
    assert.equal(departs.filter((d) => d.url.includes("pause.exemple.fr")).length, 2);
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
    assert.deepEqual([ra.essayees, a.capacity], [["c-1"], 6]);
    // Une tranche plus tard, la fiche B se lit elle-même : rien de la page A.
    const rb = await lire([b], 42_000);
    assert.equal(departs.length, 2);
    assert.equal(departs[1].url, `${base}?package=13`);
    assert.equal(b.capacity, 4);
    assert.equal(rb.lectures["c-2"]?.capacity, 4);
  });

  it("la même fiche à d'autres dates se relit dans le cache : seules les dates sont ôtées de la clé", async () => {
    const base = "https://www.abritel-cache.exemple.fr/location-vacances/p77";
    const a = ligne(1, "", { url: `${base}?chkin=2027-02-06&chkout=2027-02-13&adults=8` });
    const b = ligne(2, "", { url: `${base}?chkin=2027-02-13&chkout=2027-02-20&adults=8` });
    await lire([a], 42_000);
    const rb = await lire([b], 42_000);
    assert.equal(departs.length, 1);
    assert.deepEqual([rb.essayees, b.capacity], [["c-2"], 6]);
  });

  it("la taxe de séjour d'une page ne change pas le prix relevé", async () => {
    repondre = () => ({
      html: page(`<meta name="description" content="Appartement 6 personnes, 3 pièces" />
        </head><body><p>Taxe de séjour : 45,00 €</p>`),
    });
    const row = ligne(1, "taxe.exemple.fr");
    const r = await lire([row], 42_000);
    assert.deepEqual(r.essayees, ["c-1"]);
    assert.equal(row.capacity, 6);
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

  it("5 s au moins entre deux pages rooms/, d'une tranche à l'autre", async () => {
    repondre = () => ({ html: page(`<script>{"personCapacity":4}</script>`) });
    const airbnb = (n: number) =>
      ligne(n, "www.airbnb.fr", { id: `abnb-${n}`, source: "Airbnb", url: `https://www.airbnb.fr/rooms/${n}` });
    const un = await silence(() => jouer(lirePagesAirbnbProfond([airbnb(4100001)], Date.now() + 42_000)));
    const deux = await silence(() => jouer(lirePagesAirbnbProfond([airbnb(4100002)], Date.now() + 42_000)));
    assert.deepEqual([un.essayees, deux.essayees], [["abnb-4100001"], ["abnb-4100002"]]);
    assert.equal(departs.length, 2);
    assert.ok(departs[1].t - departs[0].t >= 5_000, `écart de ${departs[1].t - departs[0].t} ms`);
  });
});

describe("poserLecture : la taxe de séjour, une fois", () => {
  const lect = (taxeSejour: number | null): LectureFiche => ({
    capacity: 6,
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

  it("le point de la page remplace un point triangulé, jamais un point publié", () => {
    const pin = { ...lect(null), capacity: null, lat: 45.02, lon: 6.13 };
    const row = ligne(4, "loyer.exemple.fr", { lat: 45.008, lon: 6.124, gpsSource: "triangule" });
    assert.equal(poserLecture(row, pin), true);
    assert.deepEqual([row.lat, row.lon, row.gpsSource], [45.02, 6.13, null]);
    const publie = ligne(5, "loyer.exemple.fr", { lat: 45.008, lon: 6.124 });
    poserLecture(publie, pin);
    assert.deepEqual([publie.lat, publie.lon], [45.008, 6.124]);
  });

  it("les lits de la page comblent un vide, jamais une valeur déjà là", () => {
    const row = ligne(3, "loyer.exemple.fr");
    assert.equal(poserLecture(row, { ...lect(null), capacity: null, beds: 4 }), true);
    assert.equal(row.beds, 4);
    assert.equal(poserLecture(row, { ...lect(null), capacity: null, beds: 2 }), false);
    assert.equal(row.beds, 4);
  });

  it("après le panier (loyer et taxe), la taxe ne s'ajoute pas une seconde fois", () => {
    const row = ligne(1, "panier.exemple.fr", { total: 1060, proven: "Ingénie live · panier" });
    poserLecture(row, lect(60));
    assert.equal(row.total, 1060);
    assert.equal(row.capacity, 6);
    const libelle = ligne(2, "panier.exemple.fr", { total: 1060, priceLabel: "loyer et taxe de séjour" });
    poserLecture(libelle, lect(60));
    assert.equal(libelle.total, 1060);
  });
});

describe("mémoire des fiches : Logements la lit et l'alimente", () => {
  const airbnb = (id: string, over: Partial<Listing> = {}): Listing => ({
    ...ligne(0, "www.airbnb.fr"),
    id: `abnb-${id}`,
    source: "Airbnb",
    title: "Hébergement à Mont-de-Lans",
    url: `https://www.airbnb.fr/rooms/${id}?check_in=2027-01-23&check_out=2027-01-30&adults=6`,
    lat: 45.03604,
    lon: 6.11436,
    proven: "pyairbnb live 2027-01-23→2027-01-30",
    ...over,
  });
  const lecture = (over: Partial<LectureFiche>): LectureFiche => ({
    capacity: null,
    bedrooms: null,
    rooms: null,
    lat: null,
    lon: null,
    locality: null,
    street: null,
    title: null,
    taxeSejour: null,
    ...over,
  });

  it("note une page Airbnb lue, ses sources, et son point seulement s'il est celui de la page", () => {
    // rooms/21670960, lu le 2 octobre 2026 : personCapacity 6, « 2 chambres » de l'aperçu, listingLat/Lng.
    const lue = lecture({
      capacity: 6,
      capacitySource: "structured",
      bedrooms: 2,
      bedroomsSource: "text_regex",
      lat: 45.03604,
      lon: 6.11436,
      gpsSource: "pdp",
      pageLue: true,
    });
    assert.deepEqual(noteDeLecture(airbnb("21670960"), lue), {
      cle: "Airbnb:21670960",
      capacity: 6,
      capacitySource: "structured",
      bedrooms: 2,
      bedroomsSource: "text_regex",
      rooms: null,
      lat: 45.03604,
      lon: 6.11436,
      // Une page rooms/, pas la fiche PDP : `page`, que l'écran Prix ne prend
      // pas pour une fiche lue.
      page: true,
    });
    // Un point de repli (adresse géocodée) ne se mémorise pas ; une coquille non plus.
    const ban = noteDeLecture(airbnb("21670960"), { ...lue, gpsSource: "ban" });
    assert.deepEqual([ban?.lat, ban?.lon, ban?.capacity], [null, null, 6]);
    assert.equal(noteDeLecture(airbnb("21670960"), { ...lue, pageLue: false }), null);
    assert.equal(noteDeLecture(airbnb("21670960"), null), null);
    // Une page dont le format n'est pas reconnu (pas de personCapacity) n'est pas notée « lue ».
    assert.equal(noteDeLecture(airbnb("21670960"), { ...lue, capacity: null, capacitySource: null }), null);
    assert.equal(noteDeLecture(airbnb("21670960"), { ...lue, capacitySource: "text_regex" }), null);
    // Une chambre privée ou un hébergement insolite se note écarté, pour l'écran Prix.
    assert.equal(noteDeLecture(airbnb("21670960"), { ...lue, ecartee: true })?.ecartee, true);
    assert.equal("ecartee" in (noteDeLecture(airbnb("21670960"), lue) ?? {}), false);
    // Hors Airbnb : pas de « lue », le point de la fiche reste.
    const centrale = noteDeLecture(ligne(7, "resa.exemple.fr"), lecture({ capacity: 4, lat: 45.1, lon: 6.1 }));
    assert.deepEqual([centrale?.cle, centrale?.capacitySource, centrale?.lat, "lue" in (centrale ?? {})], [
      "Centrale:c-7",
      "structured",
      45.1,
      false,
    ]);
  });

  it("une page lue par une passe précédente comble l'annonce sans réseau, même après un redémarrage", () => {
    memoireFiches().noter([
      {
        cle: "Airbnb:21670960",
        capacity: 6,
        capacitySource: "structured",
        bedrooms: 2,
        bedroomsSource: "text_regex",
        lat: 45.03604,
        lon: 6.11436,
        lue: true,
      },
      // Lue, sans chambres publiées : la redemander ne servirait à rien.
      { cle: "Airbnb:714330356704298148", capacity: 2, capacitySource: "structured", lue: true },
    ]);
    const rows = [
      airbnb("21670960", { capacity: null, bedrooms: null }),
      airbnb("714330356704298148", { capacity: null, bedrooms: null }),
      airbnb("999", { capacity: null, bedrooms: null }),
    ];
    const n = departs.length;
    const { posees, dejaLues } = poserMemoire(rows);
    assert.equal(departs.length, n, "aucune requête");
    assert.equal(posees, 2);
    const [a, b, c] = rows;
    assert.deepEqual(
      [a.capacity, a.capacitySource, a.bedrooms, a.bedroomsSource, a.pdpLue],
      [6, "structured", 2, "text_regex", true],
    );
    assert.match(a.proven, /mémoire des fiches/);
    assert.deepEqual([b.capacity, b.bedrooms, b.pdpLue], [2, null, true]);
    assert.deepEqual([...dejaLues], ["abnb-714330356704298148"]);
    // Inconnue de la mémoire : intacte, elle sera lue.
    assert.deepEqual([c.capacity, c.bedrooms, c.pdpLue ?? null], [null, null, null]);
  });

  it("Logements reprend la fiche enrichie que la complétion Prix a lue sur PdpPlatformSections, sans requête", () => {
    const fiche = ficheDepuisBrut(
      {
        description: "Appartement rénové au pied des pistes.",
        equipements: [{ libelle: "Sèche-cheveux", present: true }, { libelle: "Lave-linge", present: false }],
        avis: { noteSource: 4.86, echelleSource: 5, nombre: 120, extraits: [{ auteur: "Marie", texte: "Très bien." }] },
      },
      "airbnb",
    )!;
    memoireFiches().noter([{ cle: "Airbnb:6660077", capacity: 4, capacitySource: "structured", lue: true, fiche }]);
    const n = departs.length;
    // Complète : seule la fiche se pose ; trouée : la fiche avec le reste.
    const complete = airbnb("6660077", { capacity: 4, bedrooms: 1 });
    const trouee = airbnb("6660077", { capacity: null, bedrooms: null });
    const dejaFichee = airbnb("6660077", { capacity: 4, bedrooms: 1, fiche: { ...fiche, description: "La sienne." } });
    poserMemoire([complete, trouee, dejaFichee]);
    assert.equal(departs.length, n, "aucune requête");
    assert.equal(complete.fiche?.description, "Appartement rénové au pied des pistes.");
    assert.deepEqual(
      complete.fiche?.equipements.map((e) => [e.id, e.present]),
      [
        ["seche_cheveux", true],
        ["lave_linge", false],
      ],
    );
    assert.deepEqual([complete.fiche?.avis?.noteSur5, complete.fiche?.avis?.nombre], [4.9, 120]);
    assert.equal(complete.capacity, 4, "rien d'autre ne change");
    assert.equal(trouee.fiche?.avis?.extraits[0]?.auteur, "Marie");
    assert.equal(dejaFichee.fiche?.description, "La sienne.", "une fiche déjà là n'est pas remplacée");
  });

  it("une annonce dont la page n'a rien publié de plus reste sans fiche", () => {
    memoireFiches().noter([{ cle: "Airbnb:6660078", capacity: 4, capacitySource: "structured", lue: true }]);
    const row = airbnb("6660078", { capacity: 4, bedrooms: 1 });
    poserMemoire([row]);
    assert.equal(row.fiche, undefined);
  });

  it("une page rooms/ lue par Logements comble Logements, pas l'écran Prix, qui lit sa fiche PDP", () => {
    memoireFiches().noter([
      { cle: "Airbnb:6660001", capacity: 4, capacitySource: "structured", bedrooms: 1, bedroomsSource: "text_regex", page: true },
    ]);
    const logements = airbnb("6660001", { capacity: null, bedrooms: null });
    poserMemoire([logements]);
    assert.deepEqual([logements.capacity, logements.bedrooms, logements.pdpLue], [4, 1, true]);
    const prix = airbnb("6660001", { capacity: null, bedrooms: null });
    const { dejaLues } = poserMemoire([prix], { fichePdpSeule: true });
    // Rien ne se pose : l'annonce reste candidate à sa fiche PDP, que Prix
    // lira (avec son signal hôtel), et rien n'est « déjà lu ».
    assert.deepEqual([prix.capacity, prix.bedrooms, prix.pdpLue ?? null], [null, null, null]);
    assert.equal(dejaLues.size, 0);
  });

  it("la mémoire ne repose ni une valeur sans source, ni un point, ni une annonce hors Airbnb", () => {
    memoireFiches().noter([
      // Entrée d'un fichier plus ancien : des valeurs sans source.
      { cle: "Airbnb:5550001", capacity: 6, bedrooms: 3, lat: 45.1, lon: 6.1, lue: true },
      { cle: "Centrale:c-9", capacity: 8, capacitySource: "structured", bedrooms: 3, bedroomsSource: "structured" },
    ]);
    const sansSource = airbnb("5550001", { capacity: null, bedrooms: null, lat: null, lon: null });
    const centrale = ligne(9, "resa.exemple.fr");
    poserMemoire([sansSource, centrale]);
    assert.deepEqual([sansSource.capacity, sansSource.bedrooms, sansSource.lat], [null, null, null]);
    // La centrale garde sa fiche à ouvrir (et la taxe de séjour que pose la page).
    assert.deepEqual([centrale.capacity, centrale.bedrooms], [null, null]);
  });

  it("relecture sans budget (fillFiches à 0 ms) : aucune page ne part, la mémoire se pose", async () => {
    memoireFiches().noter([
      { cle: "Airbnb:41783408", capacity: 4, capacitySource: "structured", bedrooms: 2, bedroomsSource: "text_regex", lue: true },
    ]);
    const row = airbnb("41783408", { capacity: null, bedrooms: null });
    const n = departs.length;
    // Et une annonce que la mémoire ne connaît pas : rien n'est mis en file.
    const inconnue = airbnb("7770001", { capacity: null, bedrooms: null });
    await silence(() => fillFiches([row, inconnue], 0));
    assert.equal(departs.length, n, "aucune requête");
    assert.deepEqual(etatSuiteAirbnb(), { file: 0, enCours: false });
    assert.deepEqual([row.capacity, row.bedrooms, row.bedroomsSource, row.pdpLue], [4, 2, "text_regex", true]);
    assert.deepEqual([inconnue.capacity, inconnue.bedrooms], [null, null]);
  });
});

describe("ordre de lecture des pages Airbnb : ce que l'écran montre d'abord", () => {
  it("dans la station, puis avec un prix, puis la moins chère ; rien n'est retiré", async () => {
    const { ordreDeLecture } = await import("./completerFiche.server.ts");
    const a = (id: string, total: number, distToLiftM: number | null, domainFit: "in" | "other" = "in") => ({
      id,
      total,
      distToLiftM,
      domainFit,
    });
    const rows = [
      a("autre-domaine-pas-cher", 100, 300, "other"),
      a("loin-cher", 900, 8_000),
      a("station-sans-prix", 0, 500),
      a("station-cher", 1_400, 300),
      a("inconnu", 600, null),
      a("station-pas-cher", 700, 1_900),
    ];
    assert.deepEqual(
      ordreDeLecture(rows).map((r) => r.id),
      ["station-pas-cher", "station-cher", "station-sans-prix", "inconnu", "loin-cher", "autre-domaine-pas-cher"],
    );
    assert.equal(ordreDeLecture(rows).length, rows.length);
  });
});

describe("la suite de Logements à côté d'une course Prix", () => {
  const rooms = (n: number): Listing =>
    ligne(n, "www.airbnb.fr", { id: `abnb-${n}`, source: "Airbnb", url: `https://www.airbnb.fr/rooms/${n}` });
  /** Les écarts entre deux départs de pages rooms/, depuis le dernier effacement de `departs`. */
  const ecarts = () => {
    const t = departs.filter((d) => d.url.includes("/rooms/")).map((d) => d.t);
    return t.slice(1).map((x, i) => x - t[i]);
  };
  /** Met les annonces en file et fait tourner l'horloge jusqu'à la fin de la suite. */
  async function derouler(rows: Listing[]): Promise<void> {
    const { prioriserSuiteAirbnb } = await import("./completerFiche.server.ts");
    assert.equal(prioriserSuiteAirbnb(rows), rows.length);
    await silence(() =>
      jouer(
        (async () => {
          do await new Promise((ok) => setTimeout(ok, 500));
          while (etatSuiteAirbnb().enCours);
        })(),
        50,
      ),
    );
  }

  it("6 s entre deux pages pendant une tranche de Prix et 90 s après ; seule, 5 s", async () => {
    const { pendantTranchePrix } = await import("./completerFiche.server.ts");
    repondre = () => ({ html: page(`<script>{"personCapacity":4}</script>`) });
    let finir: () => void = () => undefined;
    const tranche = pendantTranchePrix(() => new Promise<void>((ok) => (finir = ok)));
    await derouler([rooms(4200001), rooms(4200002), rooms(4200003)]);
    const pendant = ecarts();
    finir();
    await tranche;
    departs.length = 0;
    await derouler([rooms(4200004), rooms(4200005)]);
    const traine = ecarts();
    mock.timers.tick(90_000);
    departs.length = 0;
    await derouler([rooms(4200006), rooms(4200007)]);
    const seule = ecarts();
    assert.equal(pendant.length, 2);
    assert.ok(pendant.every((e) => e >= 6_000), `pendant la tranche : ${pendant.join(", ")} ms`);
    assert.equal(traine.length, 1);
    assert.ok(traine[0] >= 6_000, `après la tranche : ${traine[0]} ms`);
    assert.equal(seule.length, 1);
    assert.ok(seule[0] >= 5_000 && seule[0] < 6_000, `seule : ${seule[0]} ms`);
  });
});

describe("mémoire des fiches : l'écran Prix et les annonces sans point", () => {
  const airbnb = (id: string, over: Partial<Listing> = {}): Listing => ({
    ...ligne(0, "www.airbnb.fr"),
    id: `abnb-${id}`,
    source: "Airbnb",
    title: "Hébergement à Mont-de-Lans",
    url: `https://www.airbnb.fr/rooms/${id}?check_in=2027-01-23&check_out=2027-01-30&adults=6`,
    lat: 45.03604,
    lon: 6.11436,
    proven: "pyairbnb live 2027-01-23→2027-01-30",
    ...over,
  });

  it("Prix ne pose rien sur une annonce que la mémoire sait écartée : elle reste candidate", () => {
    memoireFiches().noter([
      { cle: "Airbnb:8880001", capacity: 2, capacitySource: "structured", bedrooms: 1, bedroomsSource: "structured", lue: true, ecartee: true },
    ]);
    const prix = airbnb("8880001", { capacity: null, bedrooms: null });
    const r = poserMemoire([prix], { fichePdpSeule: true });
    assert.deepEqual([prix.capacity, prix.bedrooms, prix.pdpLue ?? null], [null, null, null]);
    assert.deepEqual([...r.ecartees], ["abnb-8880001"]);
    assert.equal(r.dejaLues.size, 0);
    // Logements, lui, l'affiche : l'écart ne vaut que pour la médiane de Prix.
    const logements = airbnb("8880001", { capacity: null, bedrooms: null });
    poserMemoire([logements]);
    assert.deepEqual([logements.capacity, logements.bedrooms], [2, 1]);
  });

  it("les lits de l'aperçu se notent avec la page et reviennent de la mémoire, dans un vide seulement", () => {
    const lue = airbnb("8880003", { capacity: null, bedrooms: null });
    const note = noteDeLecture(lue, {
      capacity: 6,
      capacitySource: "structured",
      bedrooms: 2,
      bedroomsSource: "text_regex",
      rooms: null,
      lat: null,
      lon: null,
      locality: null,
      street: null,
      title: null,
      taxeSejour: null,
      beds: 4,
      pageLue: true,
    });
    assert.equal(note?.beds, 4);
    memoireFiches().noter([note!]);
    // Redémarrage : une annonce neuve du relevé, sans lits.
    const neuve = airbnb("8880003", { capacity: null, bedrooms: null });
    poserMemoire([neuve]);
    assert.deepEqual([neuve.capacity, neuve.bedrooms, neuve.beds], [6, 2, 4]);
    const avecLits = airbnb("8880003", { capacity: null, bedrooms: null, beds: 5 });
    poserMemoire([avecLits]);
    assert.equal(avecLits.beds, 5);
  });

  it("lue sans chambres publiées : à point, elle ne se relit pas ; sans point, sa page se relit", () => {
    memoireFiches().noter([{ cle: "Airbnb:8880002", capacity: 4, capacitySource: "structured", page: true }]);
    const aPoint = airbnb("8880002", { capacity: null, bedrooms: null });
    const sansPoint = airbnb("8880002", { id: "abnb-8880002-b", capacity: null, bedrooms: null, lat: null, lon: null });
    const r = poserMemoire([aPoint, sansPoint]);
    assert.deepEqual([...r.dejaLues], ["abnb-8880002"]);
    assert.deepEqual([sansPoint.capacity, sansPoint.pdpLue], [4, true]);
  });
});

describe("la passe du relevé de Prix", () => {
  const rooms = (n: number): Listing =>
    ligne(n, "www.airbnb.fr", {
      id: `abnb-${n}`,
      source: "Airbnb",
      url: `https://www.airbnb.fr/rooms/${n}`,
      lat: 45.03604,
      lon: 6.11436,
    });

  it("les pages rooms/ au premier plan, comme avant, et rien en tâche de fond", async () => {
    // Loin des appels et des pauses des essais précédents (même heure simulée de départ).
    mock.timers.tick(10 * 60_000);
    repondre = () => ({ html: page(`<script>{"personCapacity":4,"bedroomCount":2}</script>`) });
    const rows = [rooms(4300003), rooms(4300004)];
    await silence(() => jouer(fillFiches(rows, 30_000, { pour: "prix" })));
    assert.equal(departs.filter((d) => d.url.includes("/rooms/")).length, 2);
    assert.deepEqual(
      rows.map((r) => r.capacity),
      [4, 4],
    );
    assert.deepEqual(etatSuiteAirbnb(), { file: 0, enCours: false });
  });
});

describe("la suite de Logements : la station qu'on regarde passe devant", () => {
  const rooms = (n: number): Listing =>
    ligne(n, "www.airbnb.fr", {
      id: `abnb-${n}`,
      source: "Airbnb",
      url: `https://www.airbnb.fr/rooms/${n}`,
      lat: 45.03604,
      lon: 6.11436,
    });
  const ordre = () => departs.filter((d) => d.url.includes("/rooms/")).map((d) => Number(/rooms\/(\d+)/.exec(d.url)?.[1]));

  it("une recherche abandonnée qui finit après ne passe pas devant ; celle qu'on regarde, si", async () => {
    const { noterVue } = await import("./completerFiche.server.ts");
    mock.timers.tick(10 * 60_000);
    repondre = () => ({ html: page(`<script>{"personCapacity":4,"bedroomCount":2}</script>`) });
    noterVue("station-a");
    // La recherche A met ses pages en file ; la suite en lit une.
    const tache = silence(async () => {
      await fillFiches([rooms(4400001), rooms(4400002)], 30_000, { vue: "station-a" });
      // B, abandonnée pour A, répond ensuite : en fin de file.
      await fillFiches([rooms(4400101)], 30_000, { vue: "station-b" });
      // Puis A est relancée et la regardée : elle passe devant ce qui reste.
      await fillFiches([rooms(4400003)], 30_000, { vue: "station-a" });
      for (let i = 0; i < 400 && etatSuiteAirbnb().enCours; i++) await new Promise((ok) => setTimeout(ok, 500));
    });
    await jouer(tache, 50);
    assert.deepEqual(ordre(), [4400001, 4400003, 4400002, 4400101]);
  });
});

describe("un gîte labellisé distribué par une centrale : la fiche Gîtes de France par son code", () => {
  it("la fiche de la centrale ne chiffre pas la capacité : celle du widget Gîtes de France la donne", async () => {
    mock.timers.tick(10 * 60_000);
    repondre = (url) =>
      url.includes("widget-fngf.itea.fr")
        ? {
            html: page(
              `<select name="formule_capacite"><option value="1">1 personne</option><option value="2">2 personnes</option><option value="3">3 personnes</option></select>`,
            ),
          }
        : { html: page(`<meta name="description" content="Gîte dans la maison du propriétaire" />`) };
    const row = ligne(7, "reservation.lessaisies.com", { title: "Le Cerf ( 73G132308 )", bedrooms: 1, bedroomsSource: "structured" });
    await silence(() => jouer(fillFiches([row], 30_000)));
    assert.ok(departs.some((d) => d.url.includes("widget-fngf.itea.fr/fiche-73G132308")), "fiche Gîtes de France demandée");
    assert.deepEqual([row.capacity, row.capacitySource], [3, "structured"]);
    assert.match(row.proven, /fiche Gîtes de France/);
    assert.equal(row.total, 1000, "ni taxe ni loyer ajoutés");
  });
});

describe("les fiches hors Airbnb que la recherche n'a pas ouvertes : en tâche de fond", () => {
  it("lues après la recherche, puis posées par la relecture de l'écran, sans réseau", async () => {
    const { etatSuiteAutres } = await import("./completerFiche.server.ts");
    mock.timers.tick(10 * 60_000);
    repondre = () => ({ html: page(`<meta name="description" content="Appartement 6 personnes, 2 chambres" />`), apresMs: 600 });
    const hote = "fond.exemple.fr";
    const rows = [ligne(9101, hote), ligne(9102, hote), ligne(9103, hote), ligne(9104, hote)];
    // Une recherche au budget trop court pour les quatre fiches d'un même hôte.
    await silence(() => jouer(fillFiches(rows, 1_500)));
    const lues = rows.filter((r) => r.capacity != null).length;
    assert.ok(lues < 4, `${lues} lues pendant la recherche`);
    await silence(() =>
      jouer(
        (async () => {
          do await new Promise((ok) => setTimeout(ok, 500));
          while (etatSuiteAutres().enCours);
        })(),
        50,
      ),
    );
    assert.equal(departs.filter((d) => d.url.includes(hote)).length, 4, "chaque fiche demandée une fois");
    const relues = rows.map((r) => ({ ...r }));
    const n = departs.length;
    await silence(() => fillFiches(relues, 0, { relecture: true }));
    assert.equal(departs.length, n, "la relecture ne fait aucune requête");
    assert.deepEqual(
      relues.map((r) => [r.capacity, r.bedrooms]),
      [
        [6, 2],
        [6, 2],
        [6, 2],
        [6, 2],
      ],
    );
  });
});

describe("poserLecture : la capacité tirée des couchages le dit", () => {
  it("« capacité : somme des couchages décrits » dans la provenance", () => {
    const row = ligne(5, "couchages.exemple.fr");
    const lect: LectureFiche = {
      capacity: 4,
      capacitySource: "text_regex",
      capaciteCouchages: true,
      bedrooms: null,
      rooms: null,
      lat: null,
      lon: null,
      locality: null,
      street: null,
      title: null,
      taxeSejour: null,
    };
    assert.equal(poserLecture(row, lect), true);
    assert.equal(row.capacity, 4);
    assert.match(row.proven, /capacité : somme des couchages décrits/);
  });
});

describe("la description et les équipements d'une fiche déjà ouverte", () => {
  it("posés à la lecture, puis gardés : la recherche suivante les retrouve sans réseau", async () => {
    const { readFileSync } = await import("node:fs");
    const fiche = readFileSync(new URL("./fixtures/cimalpes-fiche-chalet-delta-36.html", import.meta.url), "utf8");
    mock.timers.tick(10 * 60_000);
    repondre = () => ({ html: `<html><body>${fiche}</body></html>` });
    const url = "https://cimalpes.com/fr/location-alpe-d-huez/chalet-delta-36/?date_debut=06/02/2027&date_fin=13/02/2027";
    // La recherche Cimalpes ne publie pas de position : la fiche s'ouvre pour elle.
    const row = ligne(9201, "cimalpes.com", { source: "Cimalpes", url, capacity: 8, bedrooms: 4 });
    await silence(() => jouer(fillFiches([row], 30_000)));
    assert.equal(departs.filter((d) => d.url.includes("cimalpes.com")).length, 1);
    assert.match(row.description ?? "", /^Niché dans un environnement exceptionnel/);
    assert.equal(row.amenities?.find((e) => e.cle === "casierSkis")?.valeur, "oui");
    const relue: Listing = { ...row, description: undefined, amenities: undefined };
    const n = departs.length;
    await silence(() => fillFiches([relue], 0, { relecture: true }));
    assert.equal(departs.length, n, "aucune requête de plus");
    assert.match(relue.description ?? "", /^Niché dans un environnement exceptionnel/);
    assert.equal(relue.amenities?.find((e) => e.cle === "wifi")?.valeur, "oui");
  });
});

/*
 * En dernier : ces cas laissent des pauses et des pages rooms/ loin dans
 * l'heure simulée, que les essais d'avant, repartis de T0, verraient.
 */
describe("la suite de Logements : refus, relevé qui arrive", () => {
  const annonce = (n: number, over: Partial<Listing> = {}): Listing =>
    ligne(n, "www.airbnb.fr", {
      id: `abnb-${n}`,
      source: "Airbnb",
      url: `https://www.airbnb.fr/rooms/${n}`,
      lat: 45.03604,
      lon: 6.11436,
      ...over,
    });
  const LUE = (): Reponse => ({
    html: page(`<script>{"personCapacity":4,"bedroomCount":2}</script>`),
  });
  const pagesRooms = () => departs.filter((d) => d.url.includes("/rooms/"));
  const numeros = () => pagesRooms().map((d) => Number(/rooms\/(\d+)/.exec(d.url)?.[1]));
  const attendre = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  /** Jusqu'à ce que la suite s'arrête, relue chaque demi-seconde. */
  async function finDeSuite(): Promise<void> {
    for (let t = 0; t < 60 * 60_000 && etatSuiteAirbnb().enCours; t += 500) await attendre(500);
  }
  /**
   * Chaque cas part deux heures après le précédent, journal de taux et
   * coupe-circuit vidés : loin des pages, des pauses et du recul des cas
   * d'avant. Chacun finit sur des pages lues : le recul retombe à zéro.
   */
  let decalage = 0;
  function partir(): void {
    decalage += 2 * 3_600_000;
    mock.timers.tick(decalage);
    rmSync(process.env.SKITRACK_TAUX as string, { force: true });
    rmSync(process.env.SKITRACK_AIRBNB_CIRCUIT as string, { force: true });
  }

  it("un refus qui dure, relu toutes les 15 s : une page par palier au plus, aucune pendant un recul", async () => {
    partir();
    repondre = (url) => (url.includes("/rooms/") ? { status: 429 } : { html: page() });
    const rows = [annonce(4500001), annonce(4500002), annonce(4500003)];
    const copies = () => rows.map((r) => ({ ...r }));
    const relire = () => fillFiches(copies(), 0, { relecture: true });
    await silence(() =>
      jouer(
        (async () => {
          await fillFiches(rows, 30_000);
          // La relecture de l'écran relançait la suite arrêtée : trois refus
          // de plus à chaque fois, une cinquantaine en 45 min.
          for (let t = 0; t < 45 * 60_000; t += 15_000) {
            await relire();
            await attendre(15_000);
          }
        })(),
        250,
      ),
    );
    const t = pagesRooms().map((d) => d.t);
    assert.ok(t.length >= 4 && t.length <= 8, `${t.length} pages rooms/ refusées en 45 min`);
    // La pause du coupe-circuit, puis 2, 4 et 8 minutes au moins.
    const paliers = [45_000, 2 * 60_000, 4 * 60_000, 8 * 60_000];
    t.slice(1).forEach((x, i) =>
      assert.ok(x - t[i] >= paliers[Math.min(i, 3)], `écart ${i + 1} : ${x - t[i]} ms`),
    );
    // Aucune page n'est sortie de la file.
    assert.equal(etatSuiteAirbnb().file, 3);
    // Airbnb répond de nouveau : les trois partent, passé le recul.
    const avant = t.length;
    repondre = LUE;
    await silence(() =>
      jouer(
        (async () => {
          for (let i = 0; i < 80 && etatSuiteAirbnb().file > 0; i++) {
            await relire();
            await attendre(15_000);
          }
          await finDeSuite();
        })(),
        250,
      ),
    );
    assert.deepEqual(etatSuiteAirbnb(), { file: 0, enCours: false });
    assert.deepEqual(trie(numeros().slice(avant).map(String)), ["4500001", "4500002", "4500003"]);
  });

  it("le palier repart de zéro après une page lue", async () => {
    const { prioriserSuiteAirbnb } = await import("./completerFiche.server.ts");
    partir();
    let n = 0;
    repondre = (url) => {
      if (!url.includes("/rooms/")) return { html: page() };
      n += 1;
      return n === 1 || n === 2 || n === 4 ? { status: 429 } : LUE();
    };
    const rows = [annonce(4500101), annonce(4500102), annonce(4500103)];
    await silence(() =>
      jouer(
        (async () => {
          prioriserSuiteAirbnb(rows);
          await finDeSuite();
        })(),
        250,
      ),
    );
    const t = pagesRooms().map((d) => d.t);
    assert.equal(t.length, 6);
    // Deux refus : la pause du coupe-circuit, puis 2 min.
    assert.ok(t[1] - t[0] >= 45_000 && t[1] - t[0] < 2 * 60_000, `${t[1] - t[0]} ms`);
    assert.ok(t[2] - t[1] >= 2 * 60_000, `${t[2] - t[1]} ms`);
    // Lue, puis refusée : la pause seule de nouveau, pas 4 min.
    assert.ok(t[4] - t[3] >= 45_000 && t[4] - t[3] < 2 * 60_000, `${t[4] - t[3]} ms`);
    assert.deepEqual(etatSuiteAirbnb(), { file: 0, enCours: false });
  });

  it("écran fermé : quatre refus au plus, comme avant ; relancée passé le recul, elle lit tout", async () => {
    const { prioriserSuiteAirbnb } = await import("./completerFiche.server.ts");
    partir();
    repondre = (url) => (url.includes("/rooms/") ? { status: 429 } : { html: page() });
    const rows = [annonce(4500601), annonce(4500602), annonce(4500603)];
    await silence(() =>
      jouer(
        (async () => {
          // L'écran est fermé : aucune relecture ne relance la suite.
          prioriserSuiteAirbnb(rows);
          await finDeSuite();
        })(),
        250,
      ),
    );
    // Reprendre seule l'aurait fait envoyer plus de pages refusées qu'avant,
    // chacune rouvrant le coupe-circuit qui vide le relevé Airbnb.
    assert.equal(pagesRooms().length, 4);
    assert.deepEqual(etatSuiteAirbnb(), { file: 3, enCours: false });
    // Une relance pendant le recul ne fait que mettre en file ; passé le
    // recul, elle fait repartir la suite, qui lit les trois pages.
    repondre = LUE;
    await silence(() =>
      jouer(
        (async () => {
          for (let i = 0; i < 60 && etatSuiteAirbnb().file > 0; i++) {
            await fillFiches(
              rows.map((r) => ({ ...r })),
              0,
              { relecture: true },
            );
            await attendre(15_000);
          }
          await finDeSuite();
        })(),
        250,
      ),
    );
    assert.equal(pagesRooms().length, 7);
    assert.deepEqual(etatSuiteAirbnb(), { file: 0, enCours: false });
  });

  it("des heures après un refus qui a duré, un refus isolé ne coûte que la pause, pas 8 min", async () => {
    const { prioriserSuiteAirbnb } = await import("./completerFiche.server.ts");
    partir();
    repondre = (url) => (url.includes("/rooms/") ? { status: 429 } : { html: page() });
    await silence(() =>
      jouer(
        (async () => {
          // Le palier monte jusqu'à 8 min, et aucune page n'est lue.
          prioriserSuiteAirbnb([annonce(4500701)]);
          await finDeSuite();
        })(),
        250,
      ),
    );
    // Trois heures plus tard, sans page lue entre-temps. L'horloge de ce cas
    // avance de près de quatre heures : les cas suivants partent après.
    mock.timers.tick(3 * 3_600_000);
    decalage += 6 * 3_600_000;
    rmSync(process.env.SKITRACK_TAUX as string, { force: true });
    rmSync(process.env.SKITRACK_AIRBNB_CIRCUIT as string, { force: true });
    const avant = pagesRooms().length;
    let n = 0;
    repondre = (url) => {
      if (!url.includes("/rooms/")) return { html: page() };
      n += 1;
      return n === 1 ? { status: 429 } : LUE();
    };
    await silence(() =>
      jouer(
        (async () => {
          prioriserSuiteAirbnb([annonce(4500701), annonce(4500702)]);
          await finDeSuite();
        })(),
        250,
      ),
    );
    const t = pagesRooms()
      .slice(avant)
      .map((d) => d.t);
    assert.equal(t.length, 3);
    assert.ok(t[1] - t[0] >= 45_000 && t[1] - t[0] < 2 * 60_000, `${t[1] - t[0]} ms`);
    assert.deepEqual(etatSuiteAirbnb(), { file: 0, enCours: false });
  });

  it("un coupe-circuit ouvert ailleurs (Python, Prix) : la suite en attend la fin, sans recul", async () => {
    const { prioriserSuiteAirbnb } = await import("./completerFiche.server.ts");
    const { tripAirbnbCircuit } = await import("./airbnbCircuit.server.ts");
    const { noterBlocage } = await import("./taux.server.ts");
    partir();
    repondre = LUE;
    noterBlocage("airbnb", tripAirbnbCircuit(45_000));
    const t0 = Date.now();
    await silence(() =>
      jouer(
        (async () => {
          prioriserSuiteAirbnb([annonce(4500201), annonce(4500202)]);
          await finDeSuite();
        })(),
        250,
      ),
    );
    const t = pagesRooms().map((d) => d.t - t0);
    assert.equal(t.length, 2);
    // La pause et 5 s de marge, comme avant : pas de palier de 2 min.
    assert.ok(t[0] >= 45_000 && t[0] < 60_000, `${t[0]} ms`);
    assert.ok(t[1] - t[0] >= 5_000 && t[1] - t[0] < 6_000, `${t[1] - t[0]} ms`);
    assert.deepEqual(etatSuiteAirbnb(), { file: 0, enCours: false });
  });

  it("pendant un recul, une annonce sans point qu'on ouvre part tout de suite ; une annonce à point attend", async () => {
    const { prioriserSuiteAirbnb } = await import("./completerFiche.server.ts");
    partir();
    let n = 0;
    repondre = (url) => {
      if (!url.includes("/rooms/")) return { html: page() };
      n += 1;
      return n <= 2 ? { status: 429 } : LUE();
    };
    let avantOuverture = -1;
    let ouverture = 0;
    await silence(() =>
      jouer(
        (async () => {
          prioriserSuiteAirbnb([annonce(4500301)]);
          // Deux refus : la pause (jusque vers 50 s), puis un recul de 2 min,
          // jusque vers 170 s ; le coupe-circuit, lui, se ferme vers 95 s.
          await attendre(110_000);
          prioriserSuiteAirbnb([annonce(4500302)]);
          await attendre(10_000);
          avantOuverture = pagesRooms().length;
          ouverture = Date.now();
          prioriserSuiteAirbnb([annonce(4500303, { lat: null, lon: null })]);
          await finDeSuite();
        })(),
        250,
      ),
    );
    assert.equal(avantOuverture, 2, "rien pendant le recul, pas même l'annonce à point ouverte");
    const p = pagesRooms();
    assert.equal(p.length, 5);
    assert.ok(
      p[2].url.endsWith("/rooms/4500303") && p[2].t - ouverture < 5_000,
      `${p[2].url} à ${p[2].t - ouverture} ms`,
    );
    assert.deepEqual(numeros().slice(3), [4500302, 4500301]);
    assert.deepEqual(etatSuiteAirbnb(), { file: 0, enCours: false });
  });

  it("un relevé lancé pendant l'attente de l'écart : aucune page ne part à côté de lui, toutes partent ensuite", async () => {
    const { prioriserSuiteAirbnb, pendantReleveAirbnb } =
      await import("./completerFiche.server.ts");
    partir();
    repondre = LUE;
    let pendant = -1;
    let finReleve = 0;
    await silence(() =>
      jouer(
        (async () => {
          prioriserSuiteAirbnb([annonce(4500501), annonce(4500502), annonce(4500503)]);
          // La première page partie, la suite attend 5 s avant la deuxième : le relevé arrive à 2 s.
          while (pagesRooms().length === 0) await attendre(100);
          await attendre(2_000);
          let finir: () => void = () => undefined;
          const releve = pendantReleveAirbnb(() => new Promise<void>((ok) => (finir = ok)));
          await attendre(30_000);
          pendant = pagesRooms().length;
          finReleve = Date.now();
          finir();
          await releve;
          await finDeSuite();
        })(),
        50,
      ),
    );
    assert.equal(pendant, 1, "aucune page rooms/ pendant le relevé");
    const p = pagesRooms();
    assert.equal(p.length, 3);
    assert.ok(p[1].t >= finReleve, `deuxième page ${finReleve - p[1].t} ms avant la fin du relevé`);
    assert.deepEqual(etatSuiteAirbnb(), { file: 0, enCours: false });
  });
});
