#!/usr/bin/env node
/**
 * Ce qui reste à traduire : les textes français de l'interface qui ne passent
 * pas encore par `tr` (`src/lib/i18n/tr.ts`). Une heuristique, pas une
 * preuve : elle cherche le texte entre balises JSX et les chaînes qui ont
 * l'air d'une phrase française, hors commentaires, imports, classes et clés.
 *
 *   node scripts/i18n-reste.mjs                 # le compte par fichier
 *   node scripts/i18n-reste.mjs src/routes/prix.tsx --lignes
 *
 * Les collecteurs (`src/lib/scrape`, verrouillés) et les tests sont laissés.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RACINE = process.cwd();
const args = process.argv.slice(2);
const lignes = args.includes("--lignes");
const cibles = args.filter((a) => !a.startsWith("--"));

function fichiers(dossier) {
  const out = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom === "node_modules" || chemin.includes(join("lib", "scrape")) || chemin.includes(join("lib", "i18n"))) continue;
      out.push(...fichiers(chemin));
    } else if (/\.(ts|tsx)$/.test(nom) && !/\.test\.|\.gen\.ts$|\.server\.ts$|\.d\.ts$/.test(nom)) {
      out.push(chemin);
    }
  }
  return out;
}

const MOTS = /\b(le|la|les|des|du|une|un|pour|avec|sans|dans|sur|par|est|sont|pas|ou|et|à|au|aux|ce|cette|vos|votre|nous|vous)\b/i;
const ACCENTS = /[àâäçéèêëîïôöùûüœæ’«»]/i;
const ignorer = (l) => {
  const s = l.trim();
  return (
    s.startsWith("//") ||
    s.startsWith("*") ||
    s.startsWith("/*") ||
    s.startsWith("import ") ||
    s.startsWith("export {") ||
    /^\} from /.test(s) ||
    /console\.(log|info|warn|error)/.test(s) ||
    /\btr\(|\btrN\(|\bt\("nav\./.test(s)
  );
};

function reste(texte) {
  const trouves = [];
  const src = texte.split("\n");
  let dansCommentaire = false;
  src.forEach((l, i) => {
    const s = l.trim();
    if (s.startsWith("/*")) dansCommentaire = !s.includes("*/");
    else if (dansCommentaire) {
      if (s.includes("*/")) dansCommentaire = false;
      return;
    }
    if (ignorer(l)) return;
    // Texte JSX : entre « > » et « < », ou une ligne de texte seule dans du JSX.
    const jsx = [...l.matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ][^<>{}]*)</g)].map((m) => m[1].trim());
    const seule = /^[A-Za-zÀ-ÿ«][^<>{}=;]*$/.test(s) && !/^(return|const|let|if|else|case|type|export|function)\b/.test(s) && (ACCENTS.test(s) || MOTS.test(s)) ? [s] : [];
    // Chaînes qui ressemblent à une phrase française.
    const chaines = [...l.matchAll(/"([^"\\]{3,})"|`([^`]{3,})`/g)]
      .map((m) => m[1] ?? m[2])
      .filter((c) => (ACCENTS.test(c) || (MOTS.test(c) && /\s/.test(c))) && !/^[\w./@-]+$/.test(c))
      .filter((c) => !/className|^#|^\/|^https?:/.test(c));
    const morceaux = [...jsx.filter((t) => ACCENTS.test(t) || /[a-z]{3,}/i.test(t)), ...seule, ...chaines];
    if (morceaux.length) trouves.push({ ligne: i + 1, texte: morceaux.join(" | ") });
  });
  return trouves;
}

const liste = cibles.length ? cibles.map((c) => join(RACINE, c)) : fichiers(join(RACINE, "src"));
let total = 0;
const parFichier = [];
for (const f of liste) {
  const r = reste(readFileSync(f, "utf8"));
  if (!r.length) continue;
  total += r.length;
  parFichier.push([relative(RACINE, f), r]);
}
parFichier.sort((a, b) => b[1].length - a[1].length);
for (const [f, r] of parFichier) {
  console.log(`${String(r.length).padStart(4)}  ${f}`);
  if (lignes) for (const x of r) console.log(`        ${x.ligne}: ${x.texte.slice(0, 140)}`);
}
console.log(`${total} ligne(s) à traduire dans ${parFichier.length} fichier(s)`);
