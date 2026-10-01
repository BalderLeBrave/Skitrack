// Résolution des modules de l'application hors de Vite, pour
// `scripts/echantillon/logements.ts` : l'alias « @/ », les imports sans
// extension et les fichiers JSON importés sans attribut, comme le fait Vite.
// Rien d'autre n'est changé : le code chargé est celui de l'application.
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));

function essai(p) {
  for (const c of [p, `${p}.ts`, `${p}.tsx`, `${p}/index.ts`, `${p}.js`, `${p}.mjs`]) {
    try {
      if (existsSync(c) && statSync(c).isFile()) return c;
    } catch {
      /* chemin illisible : on essaie le suivant */
    }
  }
  return null;
}

export async function resolve(spec, ctx, next) {
  let chemin = null;
  if (spec.startsWith("@/")) chemin = SRC + spec.slice(2);
  else if (
    (spec.startsWith("./") || spec.startsWith("../")) &&
    ctx.parentURL?.startsWith("file:")
  ) {
    chemin = fileURLToPath(new URL(spec, ctx.parentURL));
  }
  if (chemin) {
    const f = essai(chemin);
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  return next(spec, ctx);
}

export async function load(url, ctx, next) {
  if (url.endsWith(".json")) {
    const texte = readFileSync(fileURLToPath(url), "utf8");
    return { format: "module", source: `export default ${texte};`, shortCircuit: true };
  }
  return next(url, ctx);
}
