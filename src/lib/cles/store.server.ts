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

/** Les variables déjà posées au lancement. Relevées **avant** toute écriture,
 *  pour pouvoir dire d'où vient une valeur. */
const DEPUIS_ENV = new Set<string>();
for (const c of CLES) {
  for (const nom of c.env) {
    if (process.env[nom]?.trim()) DEPUIS_ENV.add(c.id);
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

function lire(): Fichier {
  try {
    const brut = readFileSync(cheminFichier(), "utf8");
    const lu: unknown = JSON.parse(brut);
    if (lu && typeof lu === "object" && "cles" in lu) {
      const cles = (lu as { cles: unknown }).cles;
      if (cles && typeof cles === "object") return { version: 1, cles: cles as Record<string, Enregistre> };
    }
  } catch {
    // Fichier absent ou illisible : on repart d'un fichier vide. Ne jamais
    // journaliser le contenu — il porte des secrets.
  }
  return { version: 1, cles: {} };
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
 *  l'environnement avait déjà. Appelée au chargement, et après chaque écriture. */
function appliquer(): void {
  const f = lire();
  for (const c of CLES) {
    const enr = f.cles[c.id];
    if (!enr?.valeur) continue;
    if (DEPUIS_ENV.has(c.id)) continue;
    process.env[c.env[0]!] = enr.valeur;
  }
}

appliquer();

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
    for (const nom of cleParId(id)!.env) delete process.env[nom];
  }
  return etatCles();
}

/** La valeur retenue pour une clé, côté serveur uniquement. */
export function valeurCle(id: string): string | null {
  const c = cleParId(id);
  if (!c) return null;
  return c.env.map((n) => process.env[n]?.trim()).find(Boolean) ?? null;
}
