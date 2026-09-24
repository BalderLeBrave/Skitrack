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
