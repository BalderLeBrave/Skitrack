/**
 * Lecture de `robots.txt`, la vraie.
 *
 * `src/lib/scrape/robots.ts` existe déjà et il est **inerte** : il rend
 * toujours « autorisé » et ne lit rien, son en-tête le dit et son test le
 * vérifie. Il n'est pas touché ici — les collecteurs de plateformes s'y
 * appuient et ce n'est pas le sujet.
 *
 * Ce module-ci sert les centrales de station, et lui lit vraiment. La raison
 * est simple : une centrale d'office de tourisme n'est pas une plateforme
 * mondiale, et interroger ce qu'elle demande qu'on n'interroge pas serait à la
 * fois impoli et inutile — l'audit (`docs/centrales/audit.md`) a montré que
 * plusieurs d'entre elles ferment explicitement leurs pages de recherche.
 *
 * Ce qui est implémenté, et c'est le nécessaire :
 *
 * - les groupes `User-agent`, avec le groupe le plus spécifique qui l'emporte
 *   sur `*` ;
 * - les motifs, où `*` vaut « n'importe quoi » et `$` ancre la fin. Les
 *   traiter comme de simples préfixes est l'erreur classique : `Disallow:
 *   /*?date=*` se réduirait à `/`, c'est-à-dire « tout le site interdit », ce
 *   qui est faux et coûterait le parc entier ;
 * - la règle au plus long motif, `Allow` l'emportant à longueur égale, comme
 *   la spécification le demande.
 */

export type RegleRobots = { type: "allow" | "disallow"; motif: string };
export type GroupeRobots = { agents: string[]; regles: RegleRobots[] };

export type VerdictRobots = {
  /** `null` quand le fichier est illisible : l'appelant décide quoi en faire. */
  autorise: boolean | null;
  /** La règle qui a tranché, écrite comme dans le fichier. */
  regle: string;
};

/** L'agent que SKITRACK déclare aux centrales. */
export const AGENT_CENTRALES = "SkitrackCentrales";

export function parserRobots(texte: string): GroupeRobots[] {
  const groupes: GroupeRobots[] = [];
  let courant: GroupeRobots | null = null;
  // La marque d'ordre d'octets ouvre certains fichiers, et elle est invisible.
  // Sans ce retrait, la première ligne ne s'apparie plus : un fichier qui
  // commence par « User-agent: * » perd son groupe, donc toutes ses règles, et
  // le site entier passe pour autorisé. Vu le 13 septembre 2026 sur la centrale
  // de Pralognan, dont le robots.txt commence par cette marque.
  for (const brut of texte.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const ligne = brut.replace(/#.*$/, "").trim();
    const m = /^([a-zA-Z-]+)\s*:\s*(.*)$/.exec(ligne);
    if (!m) continue;
    const cle = m[1]!.toLowerCase();
    const valeur = m[2]!.trim();
    if (cle === "user-agent") {
      // Deux `User-agent` de suite forment un seul groupe ; un `User-agent`
      // après une règle en ouvre un nouveau.
      if (!courant || courant.regles.length > 0) {
        courant = { agents: [], regles: [] };
        groupes.push(courant);
      }
      courant.agents.push(valeur.toLowerCase());
    } else if ((cle === "allow" || cle === "disallow") && courant) {
      courant.regles.push({ type: cle, motif: valeur });
    }
  }
  return groupes;
}

/** Le groupe qui nous vise : le nôtre s'il existe, sinon `*`. */
export function groupePour(groupes: readonly GroupeRobots[], agent: string): GroupeRobots | null {
  const nous = agent.toLowerCase();
  const propre = groupes.find((g) => g.agents.some((a) => a !== "*" && nous.includes(a)));
  if (propre) return propre;
  return groupes.find((g) => g.agents.includes("*")) ?? null;
}

/** Un motif robots en expression régulière : `*` libre, `$` ancré à la fin. */
export function motifEnRegex(motif: string): RegExp {
  let m = motif;
  let ancre = false;
  if (m.endsWith("$")) {
    ancre = true;
    m = m.slice(0, -1);
  }
  const echappe = m.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + echappe + (ancre ? "$" : ""));
}

/**
 * Ce chemin est-il autorisé ?
 *
 * `chemin` inclut la chaîne de requête : c'est sur elle que portent la plupart
 * des interdictions des centrales.
 */
export function robotsAutorise(
  texte: string | null,
  chemin: string,
  agent: string = AGENT_CENTRALES,
): VerdictRobots {
  if (texte == null) return { autorise: null, regle: "robots.txt illisible" };
  const groupes = parserRobots(texte);
  if (groupes.length === 0) return { autorise: true, regle: "aucune règle" };
  const g = groupePour(groupes, agent);
  if (!g) return { autorise: true, regle: "aucun groupe applicable" };

  let meilleure: RegleRobots | null = null;
  for (const r of g.regles) {
    if (r.motif === "") continue;
    let re: RegExp;
    try {
      re = motifEnRegex(r.motif);
    } catch {
      continue;
    }
    if (!re.test(chemin)) continue;
    if (
      !meilleure ||
      r.motif.length > meilleure.motif.length ||
      (r.motif.length === meilleure.motif.length && r.type === "allow")
    ) {
      meilleure = r;
    }
  }
  if (!meilleure) {
    return {
      autorise: true,
      regle: g.regles.length ? "aucune règle ne couvre ce chemin" : "aucune règle",
    };
  }
  return {
    autorise: meilleure.type === "allow",
    regle: `${meilleure.type === "allow" ? "Allow" : "Disallow"}: ${meilleure.motif}`,
  };
}
