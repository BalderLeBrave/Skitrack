import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Un journal et un coupe-circuit à part : les vrais sont lus par les relevés de la machine.
const dossier = mkdtempSync(join(tmpdir(), "skitrack-taux-test-"));
process.env.SKITRACK_AIRBNB_CIRCUIT = join(dossier, "circuit");
const taux = await import("./taux.server.ts");
const circuit = await import("./airbnbCircuit.server.ts");

let n = 0;
function journalNeuf(): string {
  const chemin = join(dossier, `taux-${n++}.json`);
  process.env.SKITRACK_TAUX = chemin;
  return chemin;
}

describe("journal de taux : créneaux réservés", () => {
  it("deux réservations de suite prennent deux créneaux, à 2 s d'écart", () => {
    journalNeuf();
    const a = taux.reserverTaux("airbnb", 10_000);
    const b = taux.reserverTaux("airbnb", 10_000);
    assert.equal(a.reserve, true);
    assert.equal(b.reserve, true);
    assert.ok(a.waitMs < 100);
    assert.ok(b.waitMs > 1_900 && b.waitMs <= 2_100, `second créneau à ${b.waitMs} ms`);
  });

  it("au-delà du plafond d'attente, rien n'est réservé", () => {
    journalNeuf();
    taux.reserverTaux("airbnb", 10_000);
    const trop = taux.reserverTaux("airbnb", 500);
    assert.equal(trop.reserve, false);
    const ensuite = taux.reserverTaux("airbnb", 10_000);
    assert.ok(ensuite.waitMs < 2_100, "le créneau refusé n'a rien écrit");
  });

  it("un blocage n'est jamais raccourci", () => {
    journalNeuf();
    taux.noterBlocage("airbnb", 300_000);
    taux.noterBlocage("airbnb", 1_000);
    assert.ok(taux.attenteTauxMs("airbnb") > 290_000);
  });

  it("un verrou abandonné est repris", () => {
    const chemin = journalNeuf();
    const verrou = `${chemin}.lock`;
    writeFileSync(verrou, "");
    const vieux = new Date(Date.now() - 60_000);
    utimesSync(verrou, vieux, vieux);
    const t0 = Date.now();
    assert.equal(taux.reserverTaux("airbnb", 10_000).reserve, true);
    assert.ok(Date.now() - t0 < 400);
    assert.equal(existsSync(verrou), false);
  });

  it("un verrou périmé et une reprise abandonnée n'empêchent pas d'entrer", () => {
    const chemin = journalNeuf();
    const verrou = `${chemin}.lock`;
    const vieux = new Date(Date.now() - 60_000);
    for (const f of [verrou, `${verrou}.reprise`]) {
      writeFileSync(f, "mort");
      utimesSync(f, vieux, vieux);
    }
    const t0 = Date.now();
    assert.equal(taux.reserverTaux("airbnb", 10_000).reserve, true);
    assert.ok(Date.now() - t0 < 600);
    assert.equal(existsSync(verrou), false);
    assert.equal(existsSync(`${verrou}.reprise`), false);
  });

  it("paceTaux rend l'attente sans rien réserver quand elle dépasse le plafond", async () => {
    const chemin = journalNeuf();
    taux.noterBlocage("airbnb", 30_000);
    const attente = await taux.paceTaux("airbnb", 1_000);
    assert.ok(attente > 29_000);
    const journal = JSON.parse(readFileSync(chemin, "utf8")) as { airbnb: { hits: number[] } };
    assert.equal(journal.airbnb.hits.length, 0, "aucun créneau réservé");
  });

  it("après une pause courte, les créneaux restent espacés", () => {
    const chemin = journalNeuf();
    const finPause = Date.now() / 1000 + 1;
    taux.noterBlocage("airbnb", 1_000);
    for (let i = 0; i < 3; i++) taux.reserverTaux("airbnb", 10_000);
    const creneaux = (JSON.parse(readFileSync(chemin, "utf8")) as { airbnb: { hits: number[] } }).airbnb.hits.sort();
    assert.ok(creneaux[0] >= finPause - 0.05, "personne ne part pendant la pause");
    for (let i = 1; i < creneaux.length; i++) {
      assert.ok(creneaux[i] - creneaux[i - 1] >= 1.999, "deux départs à la fin de la pause");
    }
  });

  it("un refus arrivé pendant l'attente du créneau arrête ce créneau", async () => {
    journalNeuf();
    taux.reserverTaux("airbnb", 10_000);
    setTimeout(() => taux.noterBlocage("airbnb", 60_000), 300);
    const attente = await taux.paceTaux("airbnb", 10_000);
    assert.ok(attente > 50_000, `parti pendant la pause (${attente} ms)`);
  });
});

describe("journal de taux : place pour un relevé entier", () => {
  // Des secondes rondes : `hits` est en secondes, l'attente tombe juste.
  const maintenant = () => Math.floor(Date.now() / 1000) * 1000;
  function poserHits(chemin: string, hitsMs: number[], untilMs = 0): void {
    writeFileSync(
      chemin,
      JSON.stringify({ airbnb: { hits: hitsMs.map((t) => t / 1000), until: untilMs / 1000 } }),
    );
  }

  it("journal vide : aucune attente, et rien n'est écrit", () => {
    const chemin = journalNeuf();
    assert.equal(taux.attentePlacesMs("airbnb", 12), 0);
    assert.equal(existsSync(chemin), false);
  });

  it("une pause en cours : au moins la pause", () => {
    journalNeuf();
    taux.noterBlocage("airbnb", 30_000);
    const now = Date.now();
    const attente = taux.attentePlacesMs("airbnb", 12, now);
    assert.ok(attente > 29_000, `parti pendant la pause (${attente} ms)`);
    assert.ok(attente >= taux.pauseTauxMs("airbnb", now));
  });

  it("une fenêtre qui a la place : aucune attente", () => {
    const chemin = journalNeuf();
    const now = maintenant();
    const hits = Array.from({ length: 6 }, (_, i) => now - 30_000 + i * 2_000);
    poserHits(chemin, hits);
    assert.equal(taux.attentePlacesMs("airbnb", 12, now), 0);
  });

  it("une fenêtre pleine : on attend que les plus anciens en sortent", () => {
    const chemin = journalNeuf();
    const now = maintenant();
    // 18 appels, de -55 s à -21 s : pour 12 places, il n'en faut plus que 6.
    const hits = Array.from({ length: 18 }, (_, i) => now - 55_000 + i * 2_000);
    poserHits(chemin, [...hits].reverse());
    assert.equal(taux.attentePlacesMs("airbnb", 12, now), hits[11] + 60_000 - now);
    assert.equal(taux.attentePlacesMs("airbnb", 6, now), hits[5] + 60_000 - now);
  });

  it("les créneaux réservés dans le futur comptent", () => {
    const chemin = journalNeuf();
    const now = maintenant();
    const hits = Array.from({ length: 18 }, (_, i) => now - 24_000 + i * 2_000);
    poserHits(chemin, hits);
    assert.equal(taux.attentePlacesMs("airbnb", 12, now), hits[11] + 60_000 - now);
  });

  it("une pause plus longue que la fenêtre l'emporte", () => {
    const chemin = journalNeuf();
    const now = maintenant();
    const hits = Array.from({ length: 18 }, (_, i) => now - 55_000 + i * 2_000);
    poserHits(chemin, hits, now + 45_000);
    assert.equal(taux.attentePlacesMs("airbnb", 12, now), 45_000);
  });

  it("plus de places que le plafond : la fenêtre doit se vider", () => {
    const chemin = journalNeuf();
    const now = maintenant();
    const hits = Array.from({ length: 18 }, (_, i) => now - 55_000 + i * 2_000);
    poserHits(chemin, hits);
    const vide = hits[17] + 60_000 - now;
    assert.equal(taux.attentePlacesMs("airbnb", 50, now), vide);
    assert.equal(taux.attentePlacesMs("airbnb", 18, now), vide);
  });
});

describe("coupe-circuit Airbnb côté Node", () => {
  it("s'ouvre 45 s au moins et garde une pause plus longue déjà posée", () => {
    journalNeuf();
    assert.equal(circuit.tripAirbnbCircuit(1_000), 45_000);
    assert.equal(circuit.airbnbCircuitOpen(), true);
    circuit.tripAirbnbCircuit(600_000);
    circuit.tripAirbnbCircuit(1_000);
    assert.ok(circuit.airbnbCircuitRestantMs() > 590_000);
  });
});
