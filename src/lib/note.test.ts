import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EN } from "./i18n/en/index.ts";
import { poserLangue } from "./i18n/langue.ts";
import { arrondiUneDecimale, noteEtAvisLbl, noterSur5, noteSur5Lbl } from "./note.ts";

describe("noterSur5 : toute note ramenée sur 5, une décimale", () => {
  it("échelle 5 : la note telle quelle, arrondie au demi supérieur", () => {
    assert.equal(noterSur5(4.86, 5), 4.9);
    assert.equal(noterSur5(4.84, 5), 4.8);
    assert.equal(noterSur5(4.85, 5), 4.9, "le demi monte, malgré 4,85 × 10 = 48,4999…");
    assert.equal(noterSur5(5, 5), 5);
  });

  it("échelle 10 : divisée par 2", () => {
    assert.equal(noterSur5(9.6, 10), 4.8);
    assert.equal(noterSur5(9.2, 10), 4.6);
    assert.equal(noterSur5(8, 10), 4);
    assert.equal(noterSur5(9, 10), 4.5);
    assert.equal(noterSur5("9,6", 10), 4.8, "la virgule française se lit");
  });

  it("échelle 100 : divisée par 20", () => {
    assert.equal(noterSur5(80, 100), 4);
    assert.equal(noterSur5(97, 100), 4.9);
  });

  it("échelle inconnue ou absente : null, jamais une échelle devinée", () => {
    assert.equal(noterSur5(4.5, null), null);
    assert.equal(noterSur5(4.5, undefined), null);
    assert.equal(noterSur5(8, 20), null);
    assert.equal(noterSur5(4.5, "5"), null);
  });

  it("note hors bornes : null", () => {
    assert.equal(noterSur5(-1, 5), null);
    assert.equal(noterSur5(5.2, 5), null);
    assert.equal(noterSur5(10.5, 10), null);
    assert.equal(noterSur5(Number.NaN, 10), null);
    assert.equal(noterSur5(Number.POSITIVE_INFINITY, 5), null);
  });

  it("pas de 0 inventé : ni une note absente, ni une chaîne vide, ni un zéro de façade", () => {
    for (const vide of [null, undefined, "", " ", "n/a", 0, "0"])
      assert.equal(noterSur5(vide, 5), null, String(vide));
  });

  it("l'arrondi tient sur les cas limites", () => {
    assert.equal(arrondiUneDecimale(4.45), 4.5);
    assert.equal(arrondiUneDecimale(4.449), 4.4);
  });
});

describe("l'affichage : « 4,8 / 5 · 120 avis », jamais une autre échelle", () => {
  it("français et anglais", () => {
    poserLangue("fr");
    assert.equal(noteSur5Lbl(4.8), "4,8 / 5");
    assert.equal(noteSur5Lbl(4), "4,0 / 5");
    assert.equal(noteEtAvisLbl(noterSur5(9.6, 10), 120), "4,8 / 5 · 120 avis");
    assert.equal(noteEtAvisLbl(4.8, null), "4,8 / 5");
    poserLangue("en");
    assert.equal(noteEtAvisLbl(noterSur5(9.2, 10), 87), "4.6 / 5 · 87 reviews");
    poserLangue("fr");
  });

  it("sans note, rien : ni « 0 / 5 », ni un nombre d'avis présenté comme une note", () => {
    assert.equal(noteSur5Lbl(null), null);
    assert.equal(noteSur5Lbl(0), null);
    assert.equal(noteEtAvisLbl(null, 120), null);
    assert.equal(noteEtAvisLbl(4.8, 0), "4,8 / 5");
  });

  it("aucun texte d'écran n'écrit une note sur 10", () => {
    const SUR_DIX = /\/\s?10\b|\bsur 10\b|\bout of 10\b/i;
    for (const [fr, en] of Object.entries(EN)) {
      assert.ok(!SUR_DIX.test(fr) && !SUR_DIX.test(en), `${fr} → ${en}`);
    }
    // Les fichiers qui rendent une note d'avis.
    const racine = dirname(fileURLToPath(import.meta.url));
    const fichiers = [
      join(racine, "note.ts"),
      join(racine, "stay", "ficheEnrichie.ts"),
      join(racine, "..", "components", "v7", "FicheBlocs.tsx"),
      join(racine, "..", "components", "LodgeSheet.tsx"),
      join(racine, "..", "routes", "logements.tsx"),
    ];
    // Les textes de ces fichiers : chaînes littérales et texte JSX ; le
    // calcul (`… / 10`) n'est pas un texte.
    const TEXTES = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`([^`]*)`|>([^<>{}\n]+)</g;
    for (const f of fichiers) {
      for (const m of readFileSync(f, "utf8").matchAll(TEXTES)) {
        const t = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
        assert.ok(!SUR_DIX.test(t), `${f} : « ${t.trim()} »`);
      }
    }
  });

  it("aucun composant n'affiche la note brute d'une annonce", () => {
    const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
    const tsx = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const p = join(d, n);
        return statSync(p).isDirectory() ? tsx(p) : /\.tsx$/.test(n) ? [p] : [];
      });
    for (const f of [...tsx(join(racine, "components")), ...tsx(join(racine, "routes"))]) {
      const src = readFileSync(f, "utf8");
      assert.ok(
        !/\.rating\b/.test(src),
        `${f} lit .rating : la note passe par avisDe / noteSur5De`,
      );
    }
  });
});
