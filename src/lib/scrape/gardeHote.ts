/**
 * Un refus (403, 429, 503) ferme l'hôte pour tout le processus, et pour
 * Python quand la clé est la même (`stay/taux.server.ts`).
 *
 * On ne renvoie pas la requête refusée. Tant que la pause est ouverte, la
 * suivante ne part pas. L'écart du journal (2 s, 24 par minute pour les
 * Gîtes, moins pour un hôte non nommé) espace ce qui part encore.
 */

import { CIRCUIT_COOLDOWN_MS, PAUSE_MAX_MS, estRefus, retryAfterMs } from "../stay/http429.ts";
import { noterBlocage, pauseTauxMs, paceTaux } from "../stay/taux.server.ts";

/** La clé du journal de taux. Les hôtes d'une même source partagent la leur. */
export function cleHote(url: string): string {
  let host = url;
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    host = url.toLowerCase();
  }
  if (/(^|\.)airbnb\.(fr|com)$/.test(host)) return "airbnb";
  if (/(^|\.)booking\.com$/.test(host)) return "booking";
  if (host.endsWith("gites-de-france.com") || host.endsWith("itea.fr")) return "gites";
  if (/(^|\.)hometogo\./.test(host)) return "hometogo";
  if (host.includes("cozycozy.")) return "cozy";
  if (host.endsWith("greengo.voyage")) return "greengo";
  if (host.endsWith("msem.tech")) return "msem";
  if (host.endsWith("deskline.net")) return "feratel";
  return host;
}

/** Ce qu'il reste de la pause ouverte par un refus, 0 sinon. */
export function pauseHoteMs(url: string, now = Date.now()): number {
  return pauseTauxMs(cleHote(url), now);
}

/** Raison de ne pas partir, ou `null`. Aucune requête. */
export function porteFermee(url: string, now = Date.now()): string | null {
  const reste = pauseHoteMs(url, now);
  if (reste <= 0) return null;
  return `pause après un refus (encore ${Math.max(1, Math.round(reste / 1000))} s)`;
}

/**
 * Attend le créneau du journal si `plafondMs` le permet.
 * Une pause de refus, ou un créneau trop loin, s'entend sans requête.
 */
export async function respecterCadence(url: string, plafondMs: number): Promise<string | null> {
  const ferme = porteFermee(url);
  if (ferme) return ferme;
  const attente = await paceTaux(cleHote(url), Math.max(0, plafondMs));
  if (attente <= 0) return null;
  return porteFermee(url) ?? `limiteur local (${Math.max(1, Math.round(attente / 1000))} s)`;
}

/** 403, 429 ou 503 : pause partagée d'au moins 45 s. Vrai si c'était un refus. */
export function poserRefus(
  url: string,
  status: number,
  headers?: Headers | Record<string, string> | null,
  now = Date.now(),
): boolean {
  if (!estRefus(status)) return false;
  const pause = Math.max(CIRCUIT_COOLDOWN_MS, retryAfterMs(headers ?? null, 0, PAUSE_MAX_MS));
  noterBlocage(cleHote(url), pause, now);
  return true;
}

/** Un message qui dit un refus, pas un « 503 ms » ni un compte « en publie 429 ». */
export function estMessageRefus(msg: string): boolean {
  return /HTTP (403|429|503)\b|répondu (403|429|503)\b|bloqué \((403|429|503)\)|pause après un refus/.test(msg);
}
