import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { EN, TABLES_EN } from "./en/index.ts";
import { langueIntl, poserLangue } from "./langue.ts";
import { remplir, tr, trN } from "./tr.ts";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fichiers(dossier: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      // Les collecteurs sont verrouillés (CLAUDE.md) et ne parlent pas à l'écran.
      if (nom === "node_modules" || chemin.endsWith(join("lib", "scrape"))) continue;
      out.push(...fichiers(chemin));
    } else if (/\.(ts|tsx)$/.test(nom) && !/\.test\.tsx?$/.test(nom) && !nom.endsWith(".gen.ts")) {
      out.push(chemin);
    }
  }
  return out;
}

/** Chaque `tr("…")`, `aTraduire("…")` et `trN(n, "…", "…")` du dépôt, avec son fichier. */
function appels(): { texte: string; fichier: string }[] {
  const out: { texte: string; fichier: string }[] = [];
  const litteral = String.raw`"((?:[^"\\]|\\.)*)"`;
  const reTr = new RegExp(String.raw`\b(?:tr|aTraduire)\(\s*${litteral}`, "g");
  const reTrC = new RegExp(String.raw`\btrC\(\s*${litteral}\s*,\s*${litteral}`, "g"); // trC("contexte", "texte")
  const reTrN = new RegExp(String.raw`\btrN\(\s*[^,]+,\s*${litteral}\s*,\s*${litteral}`, "g");
  for (const f of fichiers(SRC)) {
    if (f.includes(join("lib", "i18n"))) continue;
    const src = readFileSync(f, "utf8");
    const fichier = relative(SRC, f);
    for (const m of src.matchAll(reTr)) out.push({ texte: JSON.parse(`"${m[1]}"`), fichier });
    for (const m of src.matchAll(reTrC)) out.push({ texte: `${JSON.parse(`"${m[1]}"`)}|${JSON.parse(`"${m[2]}"`)}`, fichier });
    for (const m of src.matchAll(reTrN)) {
      out.push({ texte: JSON.parse(`"${m[1]}"`), fichier });
      out.push({ texte: JSON.parse(`"${m[2]}"`), fichier });
    }
  }
  return out;
}

const variables = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("traduction : tr", () => {
  it("rend le français tel quel, l'anglais en anglais, et remplit les variables", () => {
    poserLangue("fr");
    assert.equal(tr("Texte sans traduction"), "Texte sans traduction");
    assert.equal(remplir("{n} logements à {s}", { n: 3, s: "Tignes" }), "3 logements à Tignes");
    assert.equal(remplir("{n} et {x}", { n: 1 }), "1 et {x}");
    poserLangue("en");
    assert.equal(tr("Texte sans traduction"), "Texte sans traduction");
    assert.equal(langueIntl(), "en-GB");
    poserLangue("fr");
    assert.equal(langueIntl(), "fr-FR");
  });

  it("trN : le pluriel à la française (0 et 1 au singulier), à l'anglaise (1 seul)", () => {
    poserLangue("fr");
    assert.equal(trN(0, "{n} essai", "{n} essais"), "0 essai");
    assert.equal(trN(2, "{n} essai", "{n} essais"), "2 essais");
    poserLangue("en");
    assert.equal(trN(0, "{n} essai", "{n} essais"), "0 essais");
    assert.equal(trN(1, "{n} essai", "{n} essais"), "1 essai");
    poserLangue("fr");
  });
});

describe("traduction : le dictionnaire anglais", () => {
  const tous = appels();

  it("chaque texte passé à tr a sa traduction anglaise", () => {
    const manquants = [...new Map(tous.filter((a) => !(a.texte in EN)).map((a) => [a.texte, a])).values()];
    assert.deepEqual(
      manquants.map((a) => `${a.fichier} : ${a.texte}`),
      [],
      `${manquants.length} texte(s) sans anglais`,
    );
  });

  it("la traduction garde les mêmes variables", () => {
    const ecarts = Object.entries(EN).filter(([fr, en]) => variables(fr).join() !== variables(en).join());
    assert.deepEqual(ecarts, []);
  });

  it("une même phrase n'est pas traduite deux fois différemment", () => {
    const vues = new Map<string, string>();
    const conflits: string[] = [];
    for (const table of TABLES_EN) {
      for (const [fr, en] of Object.entries(table)) {
        const avant = vues.get(fr);
        if (avant !== undefined && avant !== en) conflits.push(`${fr} : « ${avant} » / « ${en} »`);
        vues.set(fr, en);
      }
    }
    assert.deepEqual(conflits, []);
  });

  it("l'anglais suit les règles d'écriture : ni tiret cadratin, ni point d'exclamation, rien de vide", () => {
    const fautes = Object.entries(EN).filter(([, en]) => !en.trim() || en.includes("—") || /!(\s|$)/.test(en));
    assert.deepEqual(fautes, []);
  });

  it("aucune traduction orpheline : chaque entrée sert", () => {
    const servis = new Set(tous.map((a) => a.texte));
    const orphelines = Object.keys(EN).filter((fr) => !servis.has(fr));
    assert.deepEqual(orphelines, []);
  });
});
