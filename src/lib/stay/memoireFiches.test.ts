import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  comblerDepuisMemoire,
  DUREE_MEMOIRE_MS,
  MemoireFiches,
  valeursLues,
} from "./memoireFiches.server.ts";

const JOUR = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-09-25T12:00:00Z");
let dossier = "";

before(() => {
  dossier = mkdtempSync(join(tmpdir(), "skitrack-fiches-"));
});
after(() => {
  rmSync(dossier, { recursive: true, force: true });
});

function neuve(nom: string): MemoireFiches {
  return new MemoireFiches(join(dossier, nom, "fiches.json"));
}

describe("mémoire des fiches : ce qui se garde", () => {
  it("garde ce qu'une fiche publie, et le relit d'un autre processus", () => {
    const m = neuve("a");
    const n = m.noter(
      [{ cle: "Airbnb:41701345", guests: 8, bedrooms: 3, rooms: null, lat: 45.02298, lon: 6.12571 }],
      T0,
    );
    assert.equal(n, 1);
    const autre = new MemoireFiches(m.chemin);
    assert.deepEqual(autre.lire("Airbnb:41701345", T0 + JOUR), {
      guests: 8,
      bedrooms: 3,
      rooms: null,
      lat: 45.02298,
      lon: 6.12571,
    });
    assert.equal(autre.lire("Airbnb:1", T0), null);
    assert.equal(autre.lire(null, T0), null);
  });

  it("une absence n'efface rien ; une valeur publiée plus tard remplace l'ancienne", () => {
    const m = neuve("b");
    m.noter([{ cle: "Centrale:ing-1", guests: 6, bedrooms: null, rooms: 3, lat: null, lon: null }], T0);
    m.noter([{ cle: "Centrale:ing-1", guests: null, bedrooms: 2, lat: 45.1, lon: 6.1 }], T0 + 1);
    assert.deepEqual(m.lire("Centrale:ing-1", T0 + 2), {
      guests: 6,
      bedrooms: 2,
      rooms: 3,
      lat: 45.1,
      lon: 6.1,
    });
    m.noter([{ cle: "Centrale:ing-1", guests: 8 }], T0 + 3);
    assert.equal(m.lire("Centrale:ing-1", T0 + 4)?.guests, 8);
  });

  it("rien d'utile, rien d'écrit : ni fichier, ni entrée", () => {
    const m = neuve("c");
    assert.equal(m.noter([{ cle: "Airbnb:9", guests: null, lat: 0, lon: 0 }, { cle: null, guests: 4 }], T0), 0);
    assert.equal(existsSync(m.chemin), false);
    assert.equal(m.taille(T0), 0);
  });

  it("une annonce écartée (hôtel, chambre) se garde comme telle", () => {
    const m = neuve("d");
    m.noter([{ cle: "Airbnb:77", guests: 2, ecartee: true }], T0);
    assert.equal(m.lire("Airbnb:77", T0)?.ecartee, true);
  });

  it("trente jours, pas un de plus", () => {
    const m = neuve("e");
    m.noter([{ cle: "Airbnb:5", guests: 4 }], T0);
    assert.equal(m.lire("Airbnb:5", T0 + DUREE_MEMOIRE_MS)?.guests, 4);
    assert.equal(m.lire("Airbnb:5", T0 + DUREE_MEMOIRE_MS + 1), null);
    const relue = new MemoireFiches(m.chemin);
    assert.equal(relue.taille(T0 + DUREE_MEMOIRE_MS + 1), 0);
  });

  it("revue sans changement, l'entrée n'est réécrite qu'une fois par jour", () => {
    const m = neuve("f");
    m.noter([{ cle: "Airbnb:6", guests: 4 }], T0);
    assert.equal(m.noter([{ cle: "Airbnb:6", guests: 4 }], T0 + 1000), 0);
    assert.equal(m.noter([{ cle: "Airbnb:6", guests: 4 }], T0 + JOUR), 1);
    assert.equal(m.lire("Airbnb:6", T0 + JOUR + DUREE_MEMOIRE_MS)?.guests, 4);
  });

  it("chaque valeur a sa date : une valeur que personne n'a revue passe à trente jours", () => {
    const m = neuve("i");
    m.noter([{ cle: "Airbnb:123456", guests: 6, bedrooms: 2, lat: 45.1, lon: 6.1 }], T0);
    // Jour 25 : l'annonce publie ses pièces, plus ses chambres.
    m.noter([{ cle: "Airbnb:123456", guests: 6, bedrooms: null, rooms: 3, lat: 45.1, lon: 6.1 }], T0 + 25 * JOUR);
    const jour50 = T0 + 50 * JOUR;
    assert.deepEqual(m.lire("Airbnb:123456", jour50), { guests: 6, bedrooms: null, rooms: 3, lat: 45.1, lon: 6.1 });
    // Relu d'un autre processus, pareil.
    assert.equal(new MemoireFiches(m.chemin).lire("Airbnb:123456", jour50)?.bedrooms, null);
    assert.equal(m.lire("Airbnb:123456", T0 + 56 * JOUR), null);
  });

  it("une fiche lue, même vide, se garde comme lue trente jours", () => {
    const m = neuve("j");
    assert.equal(m.noter([{ cle: "Airbnb:20000", lue: true }], T0), 1);
    assert.deepEqual(m.lire("Airbnb:20000", T0 + JOUR), {
      guests: null,
      bedrooms: null,
      rooms: null,
      lat: null,
      lon: null,
      lue: true,
    });
    assert.equal(m.lire("Airbnb:20000", T0 + DUREE_MEMOIRE_MS + 1), null);
    // Une valeur vue dans un relevé ne dit pas que la fiche a été lue.
    m.noter([{ cle: "Airbnb:30000", guests: 4 }], T0);
    assert.equal(m.lire("Airbnb:30000", T0)?.lue, undefined);
  });

  it("un fichier d'avant les dates par valeur se relit, `vu` valant pour toutes", () => {
    const m = neuve("k");
    m.noter([{ cle: "Airbnb:1", guests: 1 }], T0);
    writeFileSync(
      m.chemin,
      JSON.stringify({ version: 1, fiches: { "Airbnb:7": { guests: 5, bedrooms: 2, rooms: null, lat: null, lon: null, vu: T0 } } }),
      "utf8",
    );
    const relue = new MemoireFiches(m.chemin);
    assert.equal(relue.lire("Airbnb:7", T0 + DUREE_MEMOIRE_MS)?.bedrooms, 2);
    assert.equal(relue.lire("Airbnb:7", T0 + DUREE_MEMOIRE_MS + 1), null);
  });

  it("écriture atomique : aucun fichier temporaire ne reste, et le fichier est du JSON", () => {
    const m = neuve("g");
    m.noter([{ cle: "Airbnb:8", guests: 5 }], T0);
    const noms = readdirSync(join(dossier, "g"));
    assert.deepEqual(noms, ["fiches.json"]);
    const lu = JSON.parse(readFileSync(m.chemin, "utf8"));
    assert.equal(lu.version, 1);
    assert.equal(lu.fiches["Airbnb:8"].guests, 5);
  });

  it("un fichier illisible repart à vide sans casser le relevé", () => {
    const m = neuve("h");
    m.noter([{ cle: "Airbnb:10", guests: 3 }], T0);
    writeFileSync(m.chemin, "{ tronqué", "utf8");
    const relue = new MemoireFiches(m.chemin);
    const avertir = console.warn;
    console.warn = () => undefined;
    try {
      assert.equal(relue.lire("Airbnb:10", T0), null);
      assert.equal(relue.noter([{ cle: "Airbnb:11", guests: 2 }], T0), 1);
    } finally {
      console.warn = avertir;
    }
    assert.equal(new MemoireFiches(m.chemin).lire("Airbnb:11", T0)?.guests, 2);
  });

  it("des nombres hors bornes ne se gardent pas", () => {
    assert.deepEqual(valeursLues({ guests: 0, bedrooms: -1, rooms: 99, lat: 120, lon: 6 }), {
      guests: null,
      bedrooms: null,
      rooms: null,
      lat: null,
      lon: null,
    });
    assert.equal(valeursLues({ bedrooms: 0 }).bedrooms, 0);
  });
});

describe("combler depuis la mémoire : les trous seulement", () => {
  it("jamais une valeur publiée remplacée", () => {
    const row = { guests: 4, bedrooms: null, rooms: null, lat: 45.2, lon: 6.2 };
    const pose = comblerDepuisMemoire(row, {
      guests: 8,
      bedrooms: 2,
      rooms: 3,
      lat: 45.9,
      lon: 6.9,
    });
    assert.equal(pose, true);
    assert.deepEqual(row, { guests: 4, bedrooms: 2, rooms: 3, lat: 45.2, lon: 6.2 });
  });

  it("un point (0, 0) est un trou ; rien à poser, rien de posé", () => {
    const row = { guests: null, bedrooms: null, lat: 0, lon: 0 };
    assert.equal(comblerDepuisMemoire(row, { guests: null, bedrooms: null, rooms: null, lat: 45.1, lon: 6.1 }), true);
    assert.equal(row.lat, 45.1);
    const plein = { guests: 2, bedrooms: 1, rooms: 2, lat: 45, lon: 6 };
    assert.equal(comblerDepuisMemoire(plein, { guests: 3, bedrooms: 2, rooms: 2, lat: 44, lon: 5 }), false);
  });
});
