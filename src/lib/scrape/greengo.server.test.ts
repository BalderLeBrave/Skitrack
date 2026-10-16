/**
 * La recherche GreenGo et sa suite de fond (`greengo.server.ts`), hors ligne :
 * `fetch` simulé, qui sert les réponses réelles des fixtures, horloge simulée
 * (`mock.timers`), et le journal de taux et les mémoires des fiches dans un
 * dossier temporaire, jamais ceux de l'application.
 *
 * Le module serveur importe `@/lib/...` et des chemins sans extension : un
 * résolveur (`registerHooks`) les complète, comme Vite.
 */
import { after, afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { LiveSearchInput } from "./types.ts";

const ICI = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(ICI, "..", "..");

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

const DOSSIER = mkdtempSync(join(tmpdir(), "skitrack-greengo-serveur-"));
const TAUX = join(DOSSIER, "taux.json");
process.env.SKITRACK_TAUX = TAUX;
process.env.SKITRACK_CONFIG_DIR = DOSSIER;

const { cederSuiteGreenGo, releverGreenGo } = await import("./greengo.server.ts");
const { OPERATION_DETAIL } = await import("./greengo.ts");

/**
 * Réponses réelles : la recherche du 24 septembre 2026 (12 hôtes autour
 * d'Avoriaz) et le détail de Balcons des Trois Cîmes du 6 octobre 2026.
 */
const RECHERCHE = readFileSync(join(ICI, "fixtures/greengo-recherche-portes-du-soleil.json"), "utf8");
const DETAIL = readFileSync(join(ICI, "fixtures/greengo-detail-equipements.json"), "utf8");

/**
 * L'heure simulée de chaque essai, une heure après celle du précédent : l'état
 * du module (la fin de la dernière requête, le cache des détails) ne déborde
 * pas sur l'essai suivant.
 */
let heure = Date.parse("2027-01-04T09:00:00Z");

const AVORIAZ: LiveSearchInput = {
  stationId: "avoriaz",
  stationName: "Avoriaz",
  lat: 46.1914,
  lon: 6.7728,
  checkIn: "2027-02-06",
  checkOut: "2027-02-13",
  guests: 2,
  bedrooms: 0,
  // L'écran Logements : seul à lancer la suite de fond.
  domaine: true,
};

/* ---------- Le réseau simulé ---------- */

type Reponse = { status?: number; corps: string; entetes?: Record<string, string> };

/** Les requêtes parties vers l'API, à l'heure simulée. */
const departs: Array<{ operation: string; slug: string | null; t: number }> = [];
let repondreDetail: () => Reponse = () => ({ corps: DETAIL });
const fetchAvant = globalThis.fetch;

globalThis.fetch = (async (entree: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = String(entree);
  if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:\n", { status: 200 });
  const corps = JSON.parse(String(init?.body ?? "{}")) as { operationName?: string; query?: string };
  const operation = corps.operationName ?? "";
  departs.push({ operation, slug: /productSlug:"([^"]+)"/.exec(corps.query ?? "")?.[1] ?? null, t: Date.now() });
  const r = operation === OPERATION_DETAIL ? repondreDetail() : { corps: RECHERCHE };
  await new Promise((ok) => setTimeout(ok, 300));
  return new Response(r.corps, {
    status: r.status ?? 200,
    headers: { "content-type": "application/json", ...r.entetes },
  });
}) as typeof fetch;

after(() => {
  globalThis.fetch = fetchAvant;
  rmSync(DOSSIER, { recursive: true, force: true });
});

/* ---------- L'horloge simulée, et ce que le relevé journalise ---------- */

const journal: string[] = [];
const consoleAvant = { info: console.info, warn: console.warn };

beforeEach(() => {
  departs.length = 0;
  journal.length = 0;
  repondreDetail = () => ({ corps: DETAIL });
  // Un journal de taux vide, sans les créneaux de l'essai d'avant.
  rmSync(TAUX, { force: true });
  console.info = (...a: unknown[]) => void journal.push(a.map(String).join(" "));
  console.warn = (...a: unknown[]) => void journal.push(a.map(String).join(" "));
  heure += 3_600_000;
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: heure });
});

afterEach(async () => {
  // La suite de fond encore en cours cède, et finit : celle de l'essai suivant part après elle.
  cederSuiteGreenGo();
  await avancer(30_000);
  mock.timers.reset();
  console.info = consoleAvant.info;
  console.warn = consoleAvant.warn;
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

/** Fait tourner l'horloge simulée de `ms` : la suite de fond y vit sa vie. */
async function avancer(ms: number, pasMs = 50): Promise<void> {
  for (let t = 0; t < ms; t += pasMs) {
    await new Promise((r) => setImmediate(r));
    mock.timers.tick(pasMs);
  }
  await new Promise((r) => setImmediate(r));
}

/* ---------- Les essais ---------- */

describe("GreenGo : la suite de fond, sur le réseau et l'horloge simulés", () => {
  it("un défi AWS WAF servi en 202 arrête l'hôte au premier détail : pause partagée, rien en tâche de fond, ni à la recherche suivante", async () => {
    repondreDetail = () => ({
      status: 202,
      corps: "<html>challenge</html>",
      entetes: { "content-type": "text/html", "x-amzn-waf-action": "challenge" },
    });
    const r = await jouer(releverGreenGo(AVORIAZ, { echeance: Date.now() + 9_000 }));
    assert.match(r.raison ?? "", /^HTTP 202 \(défi anti-robot\) — pause \d+ s$/);
    // Lu comme une panne, il en laissait partir un second vers le même hôte.
    assert.equal(departs.filter((d) => d.operation === OPERATION_DETAIL).length, 1);
    const partis = departs.length;
    // La recherche suivante, pendant la pause (45 s au moins) : rien ne part vers GreenGo.
    await assert.rejects(
      jouer(releverGreenGo({ ...AVORIAZ, checkIn: "2027-03-06", checkOut: "2027-03-13" }, { echeance: Date.now() + 9_000 })),
      /^ArretGreenGo|pause après un refus \(\d+ s à attendre\)/,
    );
    // Trente secondes : la suite serait partie douze secondes après la recherche.
    await avancer(30_000);
    assert.deepEqual(departs.slice(partis), []);
    assert.ok(!journal.some((l) => l.includes("suite de fond")), journal.join("\n"));
  });

  it("le journal plein au-delà de dix secondes : la suite s'arrête sur le limiteur, sans rien envoyer", async () => {
    const r = await jouer(
      releverGreenGo({ ...AVORIAZ, checkIn: "2027-03-06", checkOut: "2027-03-13" }, { echeance: Date.now() + 5_000 }),
    );
    // Arrêtée faute de temps : la suite part.
    assert.match(r.raison ?? "", /^limiteur local \(/);
    // L'écran Prix remplit la fenêtre : vingt créneaux, dont le plus ancien sort dans 30 s.
    const s = Date.now() / 1000;
    const hits = Array.from({ length: 20 }, (_, i) => s - 30 + i * 0.5);
    writeFileSync(TAUX, JSON.stringify({ greengo: { hits, until: 0 } }));
    const partis = departs.length;
    await avancer(60_000);
    // Elle acceptait 22 s d'attente : le détail partait au bout de 18 s.
    assert.deepEqual(departs.slice(partis), []);
    const fin = journal.find((l) => l.includes("suite de fond"));
    assert.match(fin ?? "", /0 détail\(s\) lu\(s\) sur 1 demandé\(s\), arrêtée : [\w-]+ : limiteur local \(1[5-9] s à attendre\)$/);
  });
});
