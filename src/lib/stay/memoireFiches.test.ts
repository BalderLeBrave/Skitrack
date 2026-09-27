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
      dates: { guests: T0, bedrooms: T0, point: T0 },
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
      dates: { guests: T0, bedrooms: T0 + 1, rooms: T0, point: T0 + 1 },
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
    const jour25 = T0 + 25 * JOUR;
    assert.deepEqual(m.lire("Airbnb:123456", jour50), {
      guests: 6,
      bedrooms: null,
      rooms: 3,
      lat: 45.1,
      lon: 6.1,
      dates: { guests: jour25, rooms: jour25, point: jour25 },
    });
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
      dates: {},
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

describe("mémoire des fiches : la date de chaque valeur lue", () => {
  it("chaque valeur rendue porte l'instant où elle a été notée ; le point n'en a qu'un", () => {
    const m = neuve("l");
    m.noter([{ cle: "Airbnb:500", guests: 4, bedrooms: 2, lat: 45.3, lon: 6.3 }], T0);
    const lu = m.lire("Airbnb:500", T0 + JOUR);
    assert.deepEqual(lu?.dates, { guests: T0, bedrooms: T0, point: T0 });
    // Les pièces ne sont pas publiées : pas de valeur, pas de date.
    assert.equal(lu?.rooms, null);
    assert.equal("rooms" in (lu?.dates ?? {}), false);
    // L'écart et la lecture de la fiche ne sont pas des valeurs : ils ne s'y montrent pas.
    m.noter([{ cle: "Airbnb:501", rooms: 3, ecartee: true, lue: true }], T0);
    assert.deepEqual(m.lire("Airbnb:501", T0)?.dates, { rooms: T0 });
  });

  it("une entrée à l'ancien format, sans dates, date chaque valeur de `vu`", () => {
    const m = neuve("m");
    m.noter([{ cle: "Airbnb:1", guests: 1 }], T0);
    const vu = T0 - 3 * JOUR;
    writeFileSync(
      m.chemin,
      JSON.stringify({
        version: 1,
        fiches: { "Airbnb:502": { guests: 5, bedrooms: 2, rooms: 3, lat: 45.4, lon: 6.4, vu } },
      }),
      "utf8",
    );
    const relue = new MemoireFiches(m.chemin);
    assert.deepEqual(relue.lire("Airbnb:502", T0), {
      guests: 5,
      bedrooms: 2,
      rooms: 3,
      lat: 45.4,
      lon: 6.4,
      dates: { guests: vu, bedrooms: vu, rooms: vu, point: vu },
    });
  });

  it("une valeur périmée n'apparaît ni dans les valeurs ni dans les dates", () => {
    const m = neuve("n");
    m.noter([{ cle: "Airbnb:503", guests: 6, bedrooms: 2, lat: 45.5, lon: 6.5 }], T0);
    // Jour 20 : la capacité seule est republiée ; chambres et point vieillissent.
    const jour20 = T0 + 20 * JOUR;
    m.noter([{ cle: "Airbnb:503", guests: 6 }], jour20);
    const lu = m.lire("Airbnb:503", T0 + DUREE_MEMOIRE_MS + 1);
    assert.deepEqual(lu, {
      guests: 6,
      bedrooms: null,
      rooms: null,
      lat: null,
      lon: null,
      dates: { guests: jour20 },
    });
    // Relu d'un autre processus, pareil.
    assert.deepEqual(new MemoireFiches(m.chemin).lire("Airbnb:503", T0 + DUREE_MEMOIRE_MS + 1)?.dates, {
      guests: jour20,
    });
  });

  it("deux publications à des instants différents gardent la date de chaque valeur", () => {
    const m = neuve("o");
    m.noter([{ cle: "Airbnb:504", guests: 4, lat: 45.6, lon: 6.6 }], T0);
    const plusTard = T0 + 5 * JOUR;
    m.noter([{ cle: "Airbnb:504", bedrooms: 2, rooms: 3 }], plusTard);
    assert.deepEqual(m.lire("Airbnb:504", plusTard)?.dates, {
      guests: T0,
      bedrooms: plusTard,
      rooms: plusTard,
      point: T0,
    });
    // Une valeur republiée telle quelle, un jour plus tard, prend la date de sa republication.
    const encore = plusTard + 2 * JOUR;
    m.noter([{ cle: "Airbnb:504", guests: 4 }], encore);
    const dates = m.lire("Airbnb:504", encore)?.dates;
    assert.equal(dates?.guests, encore);
    assert.equal(dates?.bedrooms, plusTard);
    assert.equal(dates?.point, T0);
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
