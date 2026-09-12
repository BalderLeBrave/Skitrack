/**
 * Historique de neige, relevé par l'application elle-même.
 *
 * ## La question, et ce qu'on peut honnêtement en faire
 *
 * « Quel est l'historique de neige de cette station ? » est une des premières
 * questions d'un vacancier. SKITRACK n'a **aucune** base historique :
 * Open-Meteo rend l'instant et la prévision, pas le passé. Inventer une
 * climatologie, moyennes plausibles, « en général en février... », est
 * exactement ce que le projet s'interdit.
 *
 * Ce module fait donc ce que fait déjà le suivi de prix : il **enregistre ce
 * que l'application relève**, un point par jour et par station, sur cette
 * machine. L'historique commence le jour de l'installation et l'écran le dit.
 * Rien avant, rien d'importé, rien de comblé.
 *
 * ## Forme et limites
 *
 * `localStorage`, une entrée par station, un point par jour calendaire (le
 * premier relevé du jour gagne : c'est celui du matin qui décrit la journée de
 * ski). Les hauteurs sont celles d'Open-Meteo au bas et au haut des pistes, en
 * centimètres, `null` quand le service ne les rend pas : un jour sans relevé
 * est un trou assumé, pas un zéro.
 *
 * Repris de `src/renderer/src/data/snowHistory.ts` (commit 2d960d5). Seule la
 * clé change : l'identifiant textuel de station remplace l'identifiant
 * numérique de domaine, qui n'existe plus comme clé primaire.
 */

export type SnowPoint = {
  /** Jour calendaire, AAAA-MM-JJ. */
  day: string;
  /** Hauteur au bas des pistes, en cm. `null` = non rendue ce jour-là. */
  bas: number | null;
  /** Hauteur au point culminant, en cm. */
  haut: number | null;
};

export type SnowSeries = {
  points: SnowPoint[];
};

const KEY = "skitrack-v1-snow-history";
/** ~2 saisons par station : au-delà, les points les plus anciens partent. */
const MAX_POINTS = 400;
/** Stations suivies au maximum : celles que l'utilisateur consulte réellement. */
const MAX_STATIONS = 120;

type Store = Record<string, SnowSeries>;

/** Rendu serveur : pas de stockage, pas d'historique, et surtout pas d'erreur. */
function available(): boolean {
  return typeof localStorage !== "undefined";
}

function read(): Store {
  if (!available()) return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store): void {
  if (!available()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* stockage plein : l'historique s'arrête, il ne casse rien */
  }
}

export function todayKey(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Enregistre les relevés du jour.
 *
 * Appelée après chaque relevé **abouti**, jamais sur un cache relu dont les
 * valeurs peuvent dater : `fetchedAt` fait foi, un relevé plus vieux que ce
 * matin n'écrit rien.
 */
export function recordSnow(
  readings: { stationId: string; bas: number | null; haut: number | null; fetchedAt: number }[],
): void {
  if (readings.length === 0 || !available()) return;
  const day = todayKey();
  const startOfDay = new Date(`${day}T00:00:00`).getTime();
  const store = read();
  let changed = false;

  for (const r of readings) {
    if (r.fetchedAt < startOfDay) continue;
    if (r.bas == null && r.haut == null) continue;
    const series = store[r.stationId] ?? { points: [] };
    // Un point par jour : le premier relevé décrit la journée, les suivants
    // (retour de fenêtre, nouvelle visite de la fiche) ne réécrivent pas
    // l'histoire.
    if (series.points.some((p) => p.day === day)) continue;
    series.points.push({ day, bas: r.bas, haut: r.haut });
    if (series.points.length > MAX_POINTS) series.points = series.points.slice(-MAX_POINTS);
    store[r.stationId] = series;
    changed = true;
  }

  // Le plafond de stations écarte les moins suivies (les séries les plus
  // courtes) : celle qu'on consulte tous les jours reste.
  const keys = Object.keys(store);
  if (keys.length > MAX_STATIONS) {
    keys
      .sort((a, b) => store[a].points.length - store[b].points.length)
      .slice(0, keys.length - MAX_STATIONS)
      .forEach((k) => delete store[k]);
    changed = true;
  }

  if (changed) write(store);
}

/** Série d'une station, du plus ancien au plus récent. Vide = rien d'enregistré. */
export function snowHistoryOf(stationId: string): SnowPoint[] {
  return read()[stationId]?.points ?? [];
}

/**
 * Jour du premier relevé, toutes stations confondues.
 *
 * C'est la date que l'écran affiche : « SKITRACK relève depuis le... ». `null`
 * quand rien n'a encore été enregistré sur cette machine.
 */
export function snowHistorySince(): string | null {
  let first: string | null = null;
  for (const series of Object.values(read())) {
    const day = series.points[0]?.day;
    if (day && (first == null || day < first)) first = day;
  }
  return first;
}
