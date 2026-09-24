/**
 * 429 / 503 : l'attente demandée, sans appel réseau.
 *
 * Airbnb envoie parfois `Retry-After` en secondes, parfois une date HTTP.
 * Sans en-tête, on double : 2 s, 4 s, 8 s, plafonné. Rien n'est inventé
 * comme donnée d'annonce — seulement une pause.
 */

export const RETRY_STATUSES = new Set([429, 503]);
export const DEFAULT_WAIT_MS = 2_000;
export const MAX_WAIT_MS = 12_000;
/** Après un 429, on ne rappelle plus Airbnb pendant ce délai au moins. */
export const CIRCUIT_COOLDOWN_MS = 45_000;
/**
 * Plafond d'une pause demandée par Retry-After : on la tient en entier. Le
 * plafond `MAX_WAIT_MS` ne vaut que pour une attente sur place.
 */
export const PAUSE_MAX_MS = 3_600_000;

export function estStatutRalenti(status: number): boolean {
  return RETRY_STATUSES.has(status);
}

export function estHoteAirbnb(url: string): boolean {
  try {
    return /(^|\.)airbnb\.(fr|com)$/i.test(new URL(url).hostname);
  } catch {
    return /airbnb\.(fr|com)/i.test(url);
  }
}

/**
 * Millisecondes à attendre avant un nouvel appel.
 * `headers` accepte un `Headers` fetch ou un dictionnaire.
 */
export function retryAfterMs(
  headers: Headers | Record<string, string> | null | undefined,
  attempt = 0,
  cap = MAX_WAIT_MS,
): number {
  const raw = headerOf(headers, "retry-after");
  let wait: number | null = null;
  if (raw) {
    const token = raw.trim();
    if (/^\d+(\.\d+)?$/.test(token)) wait = Number(token) * 1000;
    else {
      const at = Date.parse(token);
      if (Number.isFinite(at)) wait = Math.max(0, at - Date.now());
    }
  }
  if (wait == null) wait = DEFAULT_WAIT_MS * 2 ** Math.max(0, attempt);
  return Math.min(cap, Math.max(200, wait));
}

export function htmlEstBloque(html: string): boolean {
  return /<(?:title)>[^<]{0,120}(?:503|429|blocked|unavailable|captcha|access denied)/i.test(html);
}

function headerOf(
  headers: Headers | Record<string, string> | null | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const cible = name.toLowerCase();
  if (typeof (headers as Headers).get === "function") {
    const v = (headers as Headers).get(name);
    return v && v.trim() ? v.trim() : null;
  }
  for (const [k, v] of Object.entries(headers as Record<string, string>)) {
    if (k.toLowerCase() === cible && v && v.trim()) return v.trim();
  }
  return null;
}
