/**
 * Le repli GPS Airbnb sur le chemin serveur (`lirePagesAirbnbProfond`, donc
 * `fillAirbnbSeq` et `repliGpsAirbnb`), hors ligne : `fetch` simulé pour les
 * pages rooms/ et pour la BAN, horloge simulée, et les états partagés avec
 * Python (limiteur, coupe-circuit, session) dans un dossier temporaire, remis
 * à zéro avant chaque cas.
 *
 * Même résolveur que `completerFiche.test.ts` : les imports sans extension de
 * `listings.ts` sont complétés comme Vite le fait.
 */
import { after, afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Listing } from "../listings.ts";
import type { FeatureBan } from "./repliGps.ts";

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

const DOSSIER = mkdtempSync(join(tmpdir(), "skitrack-repli-"));
process.env.SKITRACK_TAUX = join(DOSSIER, "taux.json");
process.env.SKITRACK_AIRBNB_CIRCUIT = join(DOSSIER, "airbnb-429");
process.env.SKITRACK_AIRBNB_SESSION = join(DOSSIER, "airbnb-session.json");

const { lirePagesAirbnbProfond } = await import("./completerFiche.server.ts");

const T0 = Date.parse("2027-01-10T12:00:00Z");

/* ---------- Le réseau simulé ---------- */

/** Une page rooms/ : son statut et son HTML. */
type Page = { status?: number; html?: string };

const appels: string[] = [];
let pageRooms: (url: string) => Page = () => ({ html: pdp("") });
let reponseBan: FeatureBan[] = [];
const fetchAvant = globalThis.fetch;

globalThis.fetch = (async (entree: string | URL | Request): Promise<Response> => {
  const url = String(entree);
  appels.push(url);
  if (url.startsWith("https://api-adresse.data.gouv.fr/")) {
    return new Response(JSON.stringify({ type: "FeatureCollection", features: reponseBan }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  const p = pageRooms(url);
  return new Response(p.html ?? "", { status: p.status ?? 200 });
}) as typeof fetch;

after(() => {
  globalThis.fetch = fetchAvant;
  rmSync(DOSSIER, { recursive: true, force: true });
});

const appelsBan = () => appels.filter((u) => u.startsWith("https://api-adresse.data.gouv.fr/"));

/**
 * Une page de logement Airbnb : les données du logement dans
 * `data-deferred-state-0`, et ce que la page porte autour (JSON-LD, texte).
 */
function pdp(donnees: string, autour = ""): string {
  return (
    `<html><head><title>Chalet à Abondance</title>${autour}</head><body>` +
    `<script id="data-deferred-state-0" type="application/json">{"niobeClientData":{${donnees}}}</script>` +
    `${"<p>Séjour à la montagne.</p>".repeat(20)}</body></html>`
  );
}

/**
 * Le bloc JSON-LD d'une page qui publie son adresse de voie. Un numéro par
 * cas : la BAN se garde en cache par requête.
 */
const adresseVoie = (numero = 12) =>
  `<script type="application/ld+json">{"@context":"https://schema.org","@type":"LodgingBusiness",` +
  `"name":"Chalet des Granges","address":{"@type":"PostalAddress","streetAddress":"${numero} Route des Granges",` +
  `"postalCode":"74360","addressLocality":"Abondance","addressCountry":"FR"}}</script>`;
const ADRESSE_VOIE = adresseVoie();

/** La même, sans voie : la commune seule. */
const ADRESSE_COMMUNE =
  `<script type="application/ld+json">{"@context":"https://schema.org","@type":"LodgingBusiness",` +
  `"name":"Chalet","address":{"@type":"PostalAddress","streetAddress":"Abondance",` +
  `"postalCode":"74360","addressLocality":"Abondance"}}</script>`;

/** Un hit BAN numéroté, dans la commune, à quelques centaines de mètres de la station. */
const HIT_GRANGES: FeatureBan = {
  geometry: { coordinates: [6.7213, 46.2795] },
  properties: {
    type: "housenumber",
    housenumber: "12",
    street: "Route des Granges",
    city: "Abondance",
    label: "12 Route des Granges 74360 Abondance",
  },
};

let n = 0;
/** Une annonce Airbnb d'Abondance, à chaque cas sa propre page. */
function annonce(over: Partial<Listing> = {}): Listing {
  n += 1;
  return {
    id: `abnb-${n}`,
    stationId: "abondance",
    title: "Chalet à Abondance",
    source: "Airbnb",
    total: 900,
    currency: "EUR",
    capacity: null,
    bedrooms: null,
    available: true,
    photo: null,
    url: `https://www.airbnb.fr/rooms/${7_400_000 + n}`,
    lat: null,
    lon: null,
    proven: "Airbnb",
    ...over,
  };
}

/* ---------- L'horloge simulée ---------- */

beforeEach(() => {
  appels.length = 0;
  pageRooms = () => ({ html: pdp("") });
  reponseBan = [HIT_GRANGES];
  // Ni pause ni créneau hérités du cas précédent.
  rmSync(process.env.SKITRACK_TAUX!, { force: true });
  rmSync(process.env.SKITRACK_AIRBNB_CIRCUIT!, { force: true });
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
  for (let i = 0; !fini; i += 1) {
    if (i > 100_000) throw new Error("toujours en cours après 1 000 s simulées");
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

const lire = (rows: Listing[]) =>
  silence(() => jouer(lirePagesAirbnbProfond(rows, Date.now() + 120_000)));

/* ---------- Les cas ---------- */

describe("repli GPS Airbnb : la page lue d'abord", () => {
  it("listingLat / listingLng de la page : point pdp, pas d'appel BAN", async () => {
    pageRooms = () => ({
      html: pdp(
        `"personCapacity":6,"bedroomCount":2,"listingLat":46.2791,"listingLng":6.7188`,
        ADRESSE_VOIE,
      ),
    });
    const row = annonce();
    await lire([row]);
    assert.deepEqual([row.lat, row.lon, row.gpsSource], [46.2791, 6.7188, "pdp"]);
    assert.deepEqual(
      [row.capacity, row.capacitySource, row.bedrooms, row.bedroomsSource],
      [6, "structured", 2, "structured"],
    );
    assert.equal(row.pdpLue, true);
    assert.deepEqual(appelsBan(), []);
  });

  it("le point de la liste n'est jamais touché : ni page ni BAN ne le remplacent", async () => {
    pageRooms = () => ({
      html: pdp(`"personCapacity":4,"listingLat":46.30,"listingLng":6.75`, ADRESSE_VOIE),
    });
    const row = annonce({ lat: 46.2801, lon: 6.7199 });
    await lire([row]);
    assert.deepEqual([row.lat, row.lon, row.gpsSource ?? null], [46.2801, 6.7199, null]);
    assert.equal(row.capacity, 4);
    assert.deepEqual(appelsBan(), []);
  });

  it("une valeur structurée déjà présente n'est pas écrasée ; 0 chambre est un studio", async () => {
    pageRooms = () => ({
      html: pdp(`"personCapacity":3,"bedroomCount":0,"listingLat":46.2791,"listingLng":6.7188`),
    });
    const row = annonce({ capacity: 2, capacitySource: "structured" });
    await lire([row]);
    assert.equal(row.capacity, 2);
    assert.equal(row.bedrooms, 0);
    assert.equal(row.bedroomsSource, "structured");
  });

  it("des coordonnées déjà écrites dans la page (JSON-LD geo) : point page, pas d'appel BAN", async () => {
    const geo =
      `<script type="application/ld+json">{"@context":"https://schema.org","@type":"LodgingBusiness",` +
      `"name":"Chalet","geo":{"@type":"GeoCoordinates","latitude":46.2788,"longitude":6.7177}}</script>`;
    pageRooms = () => ({ html: pdp(`"personCapacity":5,"bedroomCount":2`, geo) });
    const row = annonce();
    await lire([row]);
    assert.deepEqual([row.lat, row.lon, row.gpsSource], [46.2788, 6.7177, "page"]);
    assert.deepEqual(appelsBan(), []);
  });
});

describe("repli GPS Airbnb : l'adresse de voie, géocodée par la BAN", () => {
  it("page lue sans lat/lon, avec une adresse de voie : point BAN accepté dans le rayon", async () => {
    pageRooms = () => ({ html: pdp(`"personCapacity":6,"bedroomCount":3`, ADRESSE_VOIE) });
    const row = annonce();
    await lire([row]);
    assert.equal(appelsBan().length, 1);
    const q = new URL(appelsBan()[0]).searchParams.get("q");
    assert.equal(q, "12 Route des Granges 74360 Abondance");
    assert.deepEqual([row.lat, row.lon, row.gpsSource], [46.2795, 6.7213, "ban"]);
    assert.deepEqual([row.capacity, row.bedrooms], [6, 3]);
    assert.equal(row.pdpLue, true);
  });

  it("un hit BAN hors du rayon de 15 km : rejeté, le trou reste", async () => {
    pageRooms = () => ({ html: pdp(`"personCapacity":6,"bedroomCount":3`, adresseVoie(14)) });
    reponseBan = [{ ...HIT_GRANGES, geometry: { coordinates: [6.13, 45.9] } }];
    const row = annonce();
    await lire([row]);
    assert.equal(appelsBan().length, 1);
    assert.deepEqual([row.lat, row.lon, row.gpsSource ?? null], [null, null, null]);
    assert.equal(row.pdpLue, true);
  });

  it("un hit « commune seule » : rejeté", async () => {
    pageRooms = () => ({ html: pdp(`"personCapacity":6,"bedroomCount":3`, adresseVoie(16)) });
    reponseBan = [
      {
        geometry: { coordinates: [6.7203, 46.2808] },
        properties: { type: "municipality", city: "Abondance", label: "Abondance" },
      },
    ];
    const row = annonce();
    await lire([row]);
    assert.equal(appelsBan().length, 1);
    assert.deepEqual([row.lat, row.lon], [null, null]);
  });

  it("adresse « Abondance » seule : rejetée, pas d'appel BAN, l'annonce reste", async () => {
    pageRooms = () => ({ html: pdp(`"personCapacity":6,"bedroomCount":3`, ADRESSE_COMMUNE) });
    const row = annonce();
    const r = await lire([row]);
    assert.deepEqual(appelsBan(), []);
    assert.deepEqual([row.lat, row.lon], [null, null]);
    assert.deepEqual([row.capacity, row.bedrooms], [6, 3]);
    assert.deepEqual(r.essayees, [row.id]);
  });

  it("le titre n'est jamais géocodé : « Chalet à Abondance » sans adresse, pas d'appel BAN", async () => {
    pageRooms = () => ({ html: pdp(`"personCapacity":6,"bedroomCount":3`) });
    const row = annonce({ locality: "Abondance" });
    await lire([row]);
    assert.deepEqual(appelsBan(), []);
    assert.deepEqual([row.lat, row.lon], [null, null]);
  });
});

describe("repli GPS Airbnb : un refus n'est pas un échec de GPS", () => {
  it("429 : pas d'appel BAN, page pas lue, rien de posé, la page reste à lire", async () => {
    pageRooms = () => ({ status: 429, html: "" });
    const row = annonce();
    const r = await lire([row]);
    assert.equal(r.arret, "refus");
    assert.deepEqual(appelsBan(), []);
    assert.deepEqual([row.lat, row.lon, row.pdpLue ?? null], [null, null, null]);
    assert.deepEqual(r.essayees, []);
  });

  it("coupe-circuit ouvert par le 429 : la page suivante ne part pas, pas d'appel BAN", async () => {
    pageRooms = () => ({ status: 429, html: "" });
    await lire([annonce()]);
    appels.length = 0;
    pageRooms = () => ({ html: pdp(`"personCapacity":6,"bedroomCount":3`, ADRESSE_VOIE) });
    const row = annonce();
    const r = await lire([row]);
    assert.equal(r.arret, "coupe-circuit");
    assert.deepEqual(appels, []);
    assert.equal(row.pdpLue ?? null, null);
  });

  it("une coquille sans les données du logement : page non lue, pas d'appel BAN", async () => {
    pageRooms = () => ({
      html: `<html><body>${"<p>Connexion requise.</p>".repeat(30)}${ADRESSE_VOIE}</body></html>`,
    });
    const row = annonce();
    await lire([row]);
    assert.deepEqual(appelsBan(), []);
    assert.deepEqual([row.lat, row.lon, row.pdpLue ?? null], [null, null, null]);
  });
});

describe("capacité Airbnb : le titre, seulement quand la page ne la donne pas", () => {
  it("page lue sans personCapacity : la capacité du titre, en text_regex ; les chambres de la page", async () => {
    pageRooms = () => ({ html: pdp(`"bedroomCount":3,"listingLat":46.2791,"listingLng":6.7188`) });
    const row = annonce({ title: "Chalet familial 10 personnes" });
    await lire([row]);
    assert.equal(row.pdpLue, true);
    assert.deepEqual([row.capacity, row.capacitySource], [10, "text_regex"]);
    assert.deepEqual([row.bedrooms, row.bedroomsSource], [3, "structured"]);
  });

  it("page avec personCapacity : la page, jamais le titre", async () => {
    pageRooms = () => ({ html: pdp(`"personCapacity":8,"bedroomCount":3`) });
    const row = annonce({ title: "Chalet familial 10 personnes" });
    await lire([row]);
    assert.deepEqual([row.capacity, row.capacitySource], [8, "structured"]);
  });

  it("429 : la page n'est pas lue, le titre ne compte pas encore", async () => {
    pageRooms = () => ({ status: 429, html: "" });
    const row = annonce({ title: "Chalet familial 10 personnes" });
    await lire([row]);
    assert.deepEqual([row.capacity, row.pdpLue ?? null], [null, null]);
  });

  it("une coquille sans les données du logement : le titre ne compte pas encore", async () => {
    pageRooms = () => ({
      html: `<html><body>${"<p>Connexion requise.</p>".repeat(30)}</body></html>`,
    });
    const row = annonce({ title: "Chalet familial 10 personnes" });
    await lire([row]);
    assert.deepEqual([row.capacity, row.pdpLue ?? null], [null, null]);
  });
});
