/**
 * Les clés saisies dans l'application, gardées sur la machine — et nulle part
 * ailleurs.
 *
 * Trois règles, et tout le reste en découle :
 *
 * 1. **L'environnement gagne.** Une variable posée au lancement est la
 *    configuration du déploiement : ce fichier ne l'écrase jamais. Ce qui est
 *    saisi ici ne sert que là où rien n'était posé.
 * 2. **Les valeurs entrent dans `process.env`**, au chargement du module. Les
 *    lecteurs existants — `loadMeteofranceKey`, le relevé Airbnb — ne changent
 *    pas d'une ligne : il n'y a pas deux chemins de lecture d'une clé, il y en
 *    a un.
 * 3. **Un secret ne repart jamais vers le navigateur.** L'écran apprend qu'une
 *    clé est posée et d'où elle vient ; sa valeur reste ici.
 *
 * Le fichier vit dans le dossier de configuration de l'utilisateur, hors du
 * dépôt : il ne peut donc pas être commité par accident, ce qui est précisément
 * ce qui était arrivé à la clé Météo-France.
 */

import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { CLES, cleParId, type EtatCle } from "./registre.ts";

type Enregistre = { valeur: string; saisieLe: string };
type Fichier = { version: 1; cles: Record<string, Enregistre> };

/**
 * Les variables que **nous** avons posées, tenues sur `globalThis`.
 *
 * Le relevé « d'où vient cette valeur » se fait à l'import du module. En
 * développement, le module est réévalué à chaque modification : le second
 * relevé aurait pris nos propres écritures pour la configuration du
 * déploiement, l'écran aurait annoncé « posée par l'environnement », le champ
 * de saisie aurait disparu et « Retirer » n'aurait plus rien retiré.
 *
 * `src/lib/db.ts` tient son état de la même façon, et pour la même raison.
 */
const g = globalThis as typeof globalThis & {
  __skitrackClesPosees__?: Set<string>;
  __skitrackClesAppliquees__?: boolean;
};
const POSEES: Set<string> = (g.__skitrackClesPosees__ ??= new Set<string>());

/** Les variables posées au lancement, hors les nôtres : celles-là font foi. */
const DEPUIS_ENV = new Set<string>();
for (const c of CLES) {
  for (const nom of c.env) {
    if (process.env[nom]?.trim() && !POSEES.has(nom)) DEPUIS_ENV.add(c.id);
  }
}

export function cheminFichier(): string {
  const p = platform();
  const base =
    process.env.SKITRACK_CONFIG_DIR?.trim() ||
    (p === "win32"
      ? join(process.env.APPDATA?.trim() || join(homedir(), "AppData", "Roaming"), "skitrack")
      : p === "darwin"
        ? join(homedir(), "Library", "Application Support", "skitrack")
        : join(process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"), "skitrack"));
  return join(base, "cles.json");
}

/**
 * Le fichier, ou une erreur.
 *
 * « Absent » et « illisible » ne se confondent pas : repartir d'un fichier
 * vide dans le second cas faisait perdre **toutes** les autres clés à la
 * première écriture, un disque plein ou un fichier tronqué suffisant à les
 * effacer. L'absence, elle, est l'état normal au premier lancement.
 *
 * Ne jamais journaliser le contenu — il porte des secrets.
 */
function lire(): Fichier {
  let brut: string;
  try {
    brut = readFileSync(cheminFichier(), "utf8");
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return { version: 1, cles: {} };
    throw new Error(
      `Le fichier de clés est illisible (${(e as NodeJS.ErrnoException)?.code ?? "erreur"}). Rien n’a été écrit.`,
    );
  }
  try {
    const lu: unknown = JSON.parse(brut);
    if (lu && typeof lu === "object" && "cles" in lu) {
      const cles = (lu as { cles: unknown }).cles;
      if (cles && typeof cles === "object") return { version: 1, cles: cles as Record<string, Enregistre> };
    }
  } catch {
    throw new Error("Le fichier de clés n’est pas du JSON lisible. Rien n’a été écrit.");
  }
  throw new Error("Le fichier de clés n’a pas la forme attendue. Rien n’a été écrit.");
}

/** Écriture atomique, et lisible du seul propriétaire. */
function ecrire(f: Fichier): void {
  const cible = cheminFichier();
  mkdirSync(dirname(cible), { recursive: true });
  // Le temporaire est dans le même dossier : `rename` n'est atomique qu'à
  // l'intérieur d'un même système de fichiers.
  const temp = `${cible}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(f, null, 2), { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(temp, 0o600);
  } catch {
    // Windows n'a pas ces bits : l'écriture reste valide.
  }
  renameSync(temp, cible);
}

/** Pose dans `process.env` ce que le fichier porte, sans jamais écraser ce que
 *  l'environnement avait déjà. Appelée au premier besoin, et après chaque
 *  écriture. */
function appliquer(): void {
  let f: Fichier;
  try {
    f = lire();
  } catch (e: unknown) {
    // Ici, contrairement à une écriture, on ne peut que continuer sans : le
    // lecteur obtiendra « aucune clé », ce qui se dit à l'écran.
    console.warn("[cles] fichier illisible :", e instanceof Error ? e.message : String(e));
    return;
  }
  for (const c of CLES) {
    const enr = f.cles[c.id];
    if (!enr?.valeur) continue;
    if (DEPUIS_ENV.has(c.id)) continue;
    process.env[c.env[0]!] = enr.valeur;
    POSEES.add(c.env[0]!);
  }
}

/**
 * Verser les clés du fichier dans `process.env`, une fois par processus.
 *
 * Ce module ne s'évaluait qu'au premier appel de l'API des clés : tant que
 * l'écran « Clés » n'avait pas été ouvert, une clé enregistrée n'existait pour
 * personne, et l'application se comportait comme si rien n'avait été saisi.
 * Les lecteurs — `loadMeteofranceKey`, le relevé Airbnb — appellent donc ceci
 * avant de lire l'environnement. L'appel est idempotent et sans coût après le
 * premier.
 */
export function assurerCles(): void {
  if (g.__skitrackClesAppliquees__) return;
  g.__skitrackClesAppliquees__ = true;
  appliquer();
}

assurerCles();

/** Ce que l'écran a le droit de savoir. Aucune valeur secrète n'en sort. */
export function etatCles(): EtatCle[] {
  const f = lire();
  return CLES.map((c) => {
    const enr = f.cles[c.id];
    const parEnv = DEPUIS_ENV.has(c.id);
    const posee = parEnv || !!enr?.valeur;
    const valeurEnv = c.env.map((n) => process.env[n]?.trim()).find(Boolean) ?? null;
    return {
      id: c.id,
      posee,
      origine: parEnv ? "environnement" : enr?.valeur ? "saisie" : null,
      // Un réglage non secret se relit : c'est un chemin, pas un secret.
      valeur: c.secret ? null : (enr?.valeur ?? valeurEnv ?? null),
      saisieLe: enr?.saisieLe ?? null,
    };
  });
}

export function poserCle(id: string, valeur: string): EtatCle[] {
  const c = cleParId(id);
  if (!c) throw new Error("Clé inconnue.");
  const v = valeur.trim();
  if (!v) return retirerCle(id);
  const f = lire();
  f.cles[id] = { valeur: v, saisieLe: new Date().toISOString() };
  ecrire(f);
  appliquer();
  return etatCles();
}

export function retirerCle(id: string): EtatCle[] {
  if (!cleParId(id)) throw new Error("Clé inconnue.");
  const f = lire();
  delete f.cles[id];
  ecrire(f);
  // `appliquer` ne peut pas défaire une variable déjà posée dans ce processus :
  // on la retire explicitement, sauf si elle venait de l'environnement.
  if (!DEPUIS_ENV.has(id)) {
    for (const nom of cleParId(id)!.env) {
      delete process.env[nom];
      POSEES.delete(nom);
    }
  }
  return etatCles();
}

/** La valeur retenue pour une clé, côté serveur uniquement. */
export function valeurCle(id: string): string | null {
  const c = cleParId(id);
  if (!c) return null;
  return c.env.map((n) => process.env[n]?.trim()).find(Boolean) ?? null;
}
