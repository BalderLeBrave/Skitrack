import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * L'interpréteur Python des workers de relevé (`scrape/airbnb`, `scrape/booking`).
 *
 * Les deux collecteurs lançaient `python3` en dur. Sous Windows, cette commande
 * est le plus souvent le raccourci du Microsoft Store : il sort en erreur
 * (« Python est introuvable ») sans rien lire, et le relevé retombait à zéro
 * — ou au repli HTML d'une seule page — sans que rien ne le dise. Mesuré le
 * 23 septembre 2026 : python 3.12 et py 3.14 installés, `python3` inutilisable.
 *
 * On essaie donc, dans l'ordre : la variable d'environnement explicite ; le
 * venv propre aux workers (`scrape/.venv`, que `npm run scrape:python` crée) ;
 * puis les commandes usuelles de la plateforme. Un candidat n'est retenu que
 * s'il répond réellement en Python 3, et on préfère celui qui importe les
 * modules demandés. Sans aucun candidat valable, `null` : l'appelant l'écrit
 * dans son rapport de source au lieu de se taire.
 */

export type Interpreteur = {
  cmd: string;
  args: string[];
  /** Modules demandés qui manquent à cet interpréteur (vide : tout est là). */
  manquants: string[];
};

type Candidat = { cmd: string; args: string[] };

/** Les candidats, dans l'ordre d'essai. Pur, pour être testé sans processus. */
export function candidatsPython(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  scrapeDir: string | null,
  envVar?: string,
): Candidat[] {
  const out: Candidat[] = [];
  const push = (cmd: string, args: string[] = []) => {
    if (!out.some((c) => c.cmd === cmd && c.args.join(" ") === args.join(" "))) out.push({ cmd, args });
  };
  for (const name of [envVar, "SKITRACK_PYTHON"]) {
    const v = name ? env[name]?.trim() : "";
    if (v) push(v);
  }
  if (scrapeDir) {
    push(
      platform === "win32" ? join(scrapeDir, ".venv", "Scripts", "python.exe") : join(scrapeDir, ".venv", "bin", "python"),
    );
  }
  if (platform === "win32") {
    push("py", ["-3"]);
    push("python");
    push("python3");
  } else {
    push("python3");
    push("python");
  }
  return out;
}

/** Le dossier `scrape/` qui contient le worker, déduit du chemin de son `cli.py`. */
export function dossierScrape(cli: string): string {
  return join(cli, "..", "..");
}

function sonder(c: Candidat, modules: readonly string[]): Promise<string[] | null> {
  // Chaque module est importé à part : on veut la liste de ceux qui manquent,
  // pas seulement le premier qui échoue.
  const code = [
    "import importlib.util, json, sys",
    "assert sys.version_info[0] == 3",
    `print(json.dumps([m for m in ${JSON.stringify(modules)} if importlib.util.find_spec(m) is None]))`,
  ].join("\n");
  return new Promise((resolve) => {
    let out = "";
    let fini = false;
    const done = (v: string[] | null) => {
      if (fini) return;
      fini = true;
      clearTimeout(timer);
      resolve(v);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(c.cmd, [...c.args, "-c", code], { windowsHide: true });
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      done(null);
    }, 8_000);
    child.stdout?.on("data", (b: Buffer) => (out += b.toString("utf8")));
    child.on("error", () => done(null));
    child.on("close", (code) => {
      if (code !== 0) return done(null);
      try {
        const manquants = JSON.parse(out.trim().split(/\r?\n/).pop() ?? "");
        done(Array.isArray(manquants) ? manquants.map(String) : null);
      } catch {
        done(null);
      }
    });
  });
}

const cache = new Map<string, Promise<Interpreteur | null>>();

/**
 * Le premier interpréteur Python 3 qui a tous les modules demandés, à défaut
 * le premier Python 3 valable (avec la liste de ce qui lui manque), sinon `null`.
 *
 * Seul un succès est gardé pour la vie du processus. Un échec est resondé à
 * l'appel suivant : la raison rendue invite à lancer `npm run scrape:python`,
 * et le venv ainsi créé doit servir sans redémarrer l'application.
 */
export function trouverPython(
  scrapeDir: string | null,
  modules: readonly string[],
  envVar?: string,
): Promise<Interpreteur | null> {
  const candidats = candidatsPython(process.platform, process.env, scrapeDir, envVar);
  const key = JSON.stringify([candidats, modules]);
  let hit = cache.get(key);
  if (!hit) {
    hit = (async () => {
      let repli: Interpreteur | null = null;
      for (const c of candidats) {
        if (c.cmd.includes("/") || c.cmd.includes("\\")) {
          if (!existsSync(c.cmd)) continue;
        }
        const manquants = await sonder(c, modules);
        if (manquants == null) continue;
        if (manquants.length === 0) return { ...c, manquants };
        repli ??= { ...c, manquants };
      }
      return repli;
    })();
    cache.set(key, hit);
    const sonde = hit;
    void sonde.then((it) => {
      if ((!it || it.manquants.length > 0) && cache.get(key) === sonde) cache.delete(key);
    });
  }
  return hit;
}

/** L'environnement d'un worker : sortie UTF-8 quelle que soit la console. */
export function envWorker(extra: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...extra,
    // Sous Windows, stdout d'un Python lancé par tube est en cp1252 : un
    // libellé Airbnb portant une espace fine (U+202F) faisait lever
    // UnicodeEncodeError au milieu du JSON, que Node déclarait illisible.
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
    PYTHONUNBUFFERED: "1",
    PYTHONDONTWRITEBYTECODE: "1",
  };
}

/** Le message à écrire quand aucun interpréteur ne convient. */
export function raisonPython(it: Interpreteur | null): string | null {
  if (!it) return "aucun Python 3 trouvé (npm run scrape:python)";
  if (it.manquants.length) return `modules Python manquants : ${it.manquants.join(", ")} (npm run scrape:python)`;
  return null;
}
