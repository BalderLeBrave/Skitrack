import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decider as deciderFichier,
  ecrireGrilles,
  FICHIER_A_RELIRE_VIDE,
  type FichierARelire,
  type GrilleARelire,
  type Verdict,
} from "./aRelire.ts";
import type { FichierGrilles } from "./tarifsPeriode.ts";

// Les fichiers du dépôt, ceux que le relevé écrit : la décision n'a de sens
// que là où l'on relance `npm run forfaits:releve`.
const DOSSIER = resolve(process.cwd(), "src/lib/forfaits");
const A_RELIRE = resolve(DOSSIER, "grillesMisesDeCote.json");
const OFFICIELLES = resolve(DOSSIER, "grillesOfficielles.json");

function lire(): FichierARelire {
  if (!existsSync(A_RELIRE)) return FICHIER_A_RELIRE_VIDE;
  return {
    ...FICHIER_A_RELIRE_VIDE,
    ...(JSON.parse(readFileSync(A_RELIRE, "utf8")) as FichierARelire),
  };
}

export function lister(): GrilleARelire[] {
  return lire().aRelire;
}

/** Valide (la grille rejoint les officielles) ou écarte une grille mise de côté. */
export function decider(id: string, verdict: Verdict): GrilleARelire[] {
  const f = lire();
  const item = f.aRelire.find((x) => x.grille.id === id);
  if (!item) throw new Error(`Grille introuvable parmi celles à relire : ${id}`);
  if (verdict === "validee") {
    const { grilles, ...entete } = existsSync(OFFICIELLES)
      ? (JSON.parse(readFileSync(OFFICIELLES, "utf8")) as FichierGrilles & {
          misesDeCote?: string[];
        })
      : { grilles: [] };
    const tete = entete as Record<string, unknown> & { misesDeCote?: string[] };
    if (tete.misesDeCote) tete.misesDeCote = tete.misesDeCote.filter((x) => x !== id);
    const validee = {
      ...item.grille,
      notes: [...item.grille.notes, `validée à la main le ${jour()} malgré l'écart avec le témoin`],
    };
    writeFileSync(
      OFFICIELLES,
      ecrireGrilles(tete, [...grilles.filter((g) => g.id !== id), validee]),
    );
  }
  const suite = deciderFichier(f, id, verdict, jour());
  writeFileSync(A_RELIRE, `${JSON.stringify(suite, null, 1)}\n`);
  return suite.aRelire;
}

const jour = () => new Date().toISOString().slice(0, 10);
