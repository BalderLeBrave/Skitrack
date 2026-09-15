/**
 * Délai d'une API : on n'attend pas indéfiniment, on rend ce qu'on a.
 *
 * Un timeout n'est pas un relevé vide. C'est une interruption : le repli
 * (relevé précédent, fiches déjà lues) reste, et l'écran le dit.
 */

export class DeadlineError extends Error {
  constructor(label = "api") {
    super(`Délai dépassé (${label})`);
    this.name = "DeadlineError";
  }
}

export function estTimeout(err: unknown): boolean {
  if (err instanceof DeadlineError) return true;
  if (err instanceof DOMException && err.name === "TimeoutError") return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  const m = err instanceof Error ? err.message : String(err ?? "");
  return /timeout|délai dépassé|etimedout|und_err_connect_timeout|aborted/i.test(m);
}

/** 429, délai, abort : l'API a demandé d'arrêter, le relevé précédent reste. */
export function estPauseApi(msg: string | null | undefined): boolean {
  if (!msg) return false;
  return /429|délai dépassé|timeout|etimedout/i.test(msg);
}

export function withDeadline<T>(p: Promise<T>, ms: number, label = "api"): Promise<T> {
  if (ms <= 0) return Promise.reject(new DeadlineError(label));
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new DeadlineError(label)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
