/**
 * Limites de taux, même fichier que le sidecar Python.
 *
 * Relancer pendant la fenêtre ne recommence pas le compteur. Un 429 pose
 * `until` : Node et Python s'arrêtent tous les deux.
 *
 * Chaque appel réserve son créneau sous un verrou de fichier, puis attend
 * jusqu'à lui — même protocole que `scrape/airbnb/taux.py`, sur les mêmes
 * fichiers. L'ancien « regarder, attendre, noter » laissait deux processus
 * partir ensemble et s'effacer leurs appels : 4 appels comptés sur 18 envoyés
 * par six processus, mesuré le 23 septembre 2026.
 */
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Le dossier temporaire de l'utilisateur : le même que Python (`tempfile.gettempdir()`). */
export const TAUX_PATH = () => process.env.SKITRACK_TAUX?.trim() || join(tmpdir(), "skitrack-taux.json");
const WINDOW_MS = 60_000;
const SLEEP_CAP_MS = 5_000;
/** Un verrou plus vieux que ça a été abandonné (processus tué) : on le reprend. */
const VERROU_PERIME_MS = 2_000;
/**
 * On n'attend jamais le verrou plus longtemps : au pire, l'ancien comportement.
 * Au-delà du plus long passage sous verrou (reprises du remplacement sous
 * Windows, 150 ms au plus, des deux côtés). L'attente bloque la boucle
 * d'événements ; elle n'est longue que si un processus tient le fichier.
 */
const VERROU_ATTENTE_MS = 500;
const HOSTS: Record<string, { gapMs: number; maxHits: number }> = {
  airbnb: { gapMs: 2_000, maxHits: 18 },
  gites: { gapMs: 2_000, maxHits: 24 },
  booking: { gapMs: 1_200, maxHits: 24 },
};

type Row = { hits?: unknown; until?: unknown };
type Ledger = Record<string, Row>;

/** Le verrou n'est tenu que le temps d'une lecture-écriture : l'attente est brève. */
function dormirSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Retire un verrou abandonné, un seul prétendant à la fois (même protocole que
 * `taux._reprendre_si_perime`). Deux prétendants qui jugeaient le même verrou
 * périmé pouvaient effacer l'un le verrou tout frais de l'autre, et entrer
 * ensemble : la reprise passe elle-même par un verrou (`.reprise`).
 */
function reprendreSiPerime(chemin: string): boolean {
  const reprise = `${chemin}.reprise`;
  try {
    closeSync(openSync(reprise, "wx"));
  } catch {
    try {
      // Un prétendant mort pendant sa reprise : on retire son `.reprise`.
      if (Date.now() - statSync(reprise).mtimeMs > VERROU_PERIME_MS) unlinkSync(reprise);
    } catch {
      /* déjà retiré */
    }
    return false;
  }
  try {
    if (Date.now() - statSync(chemin).mtimeMs > VERROU_PERIME_MS) {
      unlinkSync(chemin);
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    try {
      unlinkSync(reprise);
    } catch {
      /* déjà retiré */
    }
  }
}

/**
 * Verrou de fichier inter-processus, compatible avec celui de Python
 * (`taux.verrou`). Le fichier porte un jeton propre au détenteur : on ne
 * retire que le sien, jamais celui qu'un autre a repris comme périmé.
 */
export function avecVerrouFichier<T>(chemin: string, fn: () => T): T {
  const jeton = `${process.pid}-${process.hrtime.bigint()}`;
  let tenu = false;
  const limite = Date.now() + VERROU_ATTENTE_MS;
  for (;;) {
    try {
      mkdirSync(dirname(chemin), { recursive: true });
      const fd = openSync(chemin, "wx");
      try {
        writeFileSync(fd, jeton);
        tenu = true;
      } catch {
        /* jeton non écrit : ce verrou ne serait jamais rendu */
      } finally {
        closeSync(fd);
      }
      if (!tenu) {
        try {
          unlinkSync(chemin);
        } catch {
          /* déjà retiré */
        }
      }
      break;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "EPERM" && code !== "EACCES") break;
      try {
        if (Date.now() - statSync(chemin).mtimeMs > VERROU_PERIME_MS && reprendreSiPerime(chemin)) continue;
      } catch {
        /* disparu entre-temps : on réessaie */
      }
      if (Date.now() >= limite) break;
      dormirSync(10);
    }
  }
  try {
    return fn();
  } finally {
    if (tenu) {
      try {
        if (readFileSync(chemin, "utf8") === jeton) unlinkSync(chemin);
      } catch {
        /* déjà repris comme périmé */
      }
    }
  }
}

function avecVerrou<T>(fn: () => T): T {
  return avecVerrouFichier(`${TAUX_PATH()}.lock`, fn);
}

/**
 * Le contenu d'un fichier partagé, ou `null` s'il n'existe pas. Vide : un
 * écrivain le réécrit en place (repli quand Windows refuse le remplacement) ;
 * on relit un instant plus tard, au lieu de le prendre pour « aucune pause ».
 */
export function lireTexte(chemin: string): string | null {
  let texte = "";
  for (let essai = 0; essai < 3; essai++) {
    try {
      texte = readFileSync(chemin, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      texte = "";
    }
    if (texte.trim()) return texte;
    dormirSync(5);
  }
  return texte;
}

function load(): Ledger {
  for (let essai = 0; essai < 3; essai++) {
    const texte = lireTexte(TAUX_PATH());
    if (texte == null) return {};
    try {
      const raw = JSON.parse(texte) as unknown;
      return raw && typeof raw === "object" ? (raw as Ledger) : {};
    } catch {
      // Coupé en pleine écriture en place : on relit.
      dormirSync(5 * (essai + 1));
    }
  }
  return {};
}

function save(data: Ledger): void {
  // Un fichier temporaire par processus : Node et Python écrivaient le même.
  const tmp = `${TAUX_PATH()}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(TAUX_PATH()), { recursive: true });
    writeFileSync(tmp, JSON.stringify(data));
    for (let essai = 0; essai < 5; essai++) {
      try {
        renameSync(tmp, TAUX_PATH());
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw err;
        // Windows : un lecteur tient le fichier à cet instant. Court : c'est
        // sous le verrou, que les autres n'attendent que 500 ms.
        dormirSync(10 * (essai + 1));
      }
    }
  } catch {
    /* tmp plein : le sidecar Python tient le journal */
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* déjà renommé */
    }
  }
}

/** Les créneaux réservés sont dans le futur : ils comptent déjà. */
function hitsOf(row: Row | undefined, now: number): number[] {
  const raw = row?.hits;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is number => typeof t === "number" && now - t * 1000 < WINDOW_MS);
}

/**
 * Le temps jusqu'au prochain créneau libre : après la pause, l'écart et le
 * plafond. La pause ne dispense pas de l'écart : pendant un `until` court,
 * chacun recevait `until` pile, et tous partaient ensemble à sa fin.
 */
export function attenteTauxMs(host: string, now = Date.now()): number {
  const row = load()[host];
  let depart = Math.max(now, typeof row?.until === "number" ? row.until * 1000 : 0);
  const hits = hitsOf(row, now).map((t) => t * 1000);
  const cfg = HOSTS[host] ?? { gapMs: 2_000, maxHits: 20 };
  if (hits.length) depart = Math.max(depart, Math.max(...hits) + cfg.gapMs);
  if (hits.length >= cfg.maxHits) depart = Math.max(depart, Math.min(...hits) + WINDOW_MS);
  return Math.max(0, depart - now);
}

/** Ce qu'il reste d'une pause posée par un refus (`until`), 0 sinon. */
export function pauseTauxMs(host: string, now = Date.now()): number {
  const until = load()[host]?.until;
  return typeof until === "number" ? Math.max(0, until * 1000 - now) : 0;
}

function noterHitSansVerrou(host: string, at: number): void {
  const data = load();
  const row = data[host];
  const hits = hitsOf(row, at);
  hits.push(at / 1000);
  data[host] = { hits, until: typeof row?.until === "number" ? row.until : 0 };
  save(data);
}

export function noterHit(host: string, now = Date.now()): void {
  avecVerrou(() => noterHitSansVerrou(host, now));
}

export function noterBlocage(host: string, waitMs: number, now = Date.now()): void {
  avecVerrou(() => {
    const data = load();
    const row = data[host];
    const until = Math.max(typeof row?.until === "number" ? row.until : 0, now / 1000 + Math.max(0.2, waitMs / 1000));
    data[host] = { hits: hitsOf(row, now), until };
    save(data);
  });
}

/**
 * Réserve le prochain créneau libre s'il tombe dans `sleepCapMs`. Réservé :
 * l'appelant attend `waitMs` puis part, et le créneau compte déjà pour les
 * autres. Non réservé : rien n'est écrit, l'appelant s'arrête.
 */
export function reserverTaux(host: string, sleepCapMs = SLEEP_CAP_MS): { waitMs: number; reserve: boolean } {
  return avecVerrou(() => {
    const now = Date.now();
    const waitMs = attenteTauxMs(host, now);
    if (waitMs > sleepCapMs) return { waitMs, reserve: false };
    noterHitSansVerrou(host, now + waitMs);
    return { waitMs, reserve: true };
  });
}

/**
 * Attend le créneau réservé, ou rend l'attente si elle dépasse le plafond.
 * Après l'attente, la pause est relue : un refus arrivé entre-temps (autre
 * relevé, Python) arrête aussi ce créneau-là.
 */
export async function paceTaux(host: string, sleepCapMs = SLEEP_CAP_MS): Promise<number> {
  const { waitMs, reserve } = reserverTaux(host, sleepCapMs);
  if (!reserve) return waitMs;
  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
    const reste = pauseTauxMs(host);
    if (reste > 0) return reste;
  }
  return 0;
}
