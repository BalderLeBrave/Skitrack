/**
 * Le rythme des pages de fiche, hôte par hôte (hors Airbnb, qui a son propre
 * limiteur partagé avec Python).
 *
 * `fillFiches` lançait dix lectures à la fois, sans écart, vers des hôtes
 * que rien ne rythmait : une centrale ou abritel.fr recevaient tout d'un coup,
 * et un refus ne changeait rien à la suite (la fiche suivante partait). Désormais :
 * deux lectures au plus en vol par hôte, une seconde au moins entre deux
 * départs vers le même hôte, et l'hôte laissé au premier 429, 403 ou 503.
 *
 * Pur : ni réseau, ni minuterie. L'appelant dort le temps rendu.
 */

/** Lectures en vol à la fois vers un même hôte. */
export const PAR_HOTE = 2;
/** Écart minimal entre deux départs vers un même hôte. */
export const ECART_HOTE_MS = 1_000;

/**
 * Les départs réservés et les refus, par hôte. Une réservation vaut place :
 * deux lecteurs qui demandent en même temps partent à une seconde d'écart,
 * pas ensemble.
 *
 * `departs` : le prochain départ permis par hôte, à partager d'une passe à
 * l'autre (tranches de Prix, recherches de Logements) ; sans lui, chaque
 * passe repartait de zéro, et sa première page pouvait suivre de près la
 * dernière de la passe d'avant. Les refus, eux, restent ceux de la passe et
 * de ce qu'on lui a transmis.
 */
export class RythmeHotes {
  private readonly prochain: Map<string, number>;
  private readonly refus: Set<string>;
  private readonly ecartMs: number;
  private readonly now: () => number;

  constructor(
    opts: {
      ecartMs?: number;
      now?: () => number;
      refus?: Iterable<string>;
      departs?: Map<string, number>;
    } = {},
  ) {
    this.ecartMs = opts.ecartMs ?? ECART_HOTE_MS;
    this.now = opts.now ?? Date.now;
    this.refus = new Set(opts.refus ?? []);
    this.prochain = opts.departs ?? new Map();
  }

  /** Dans combien de millisecondes partir vers `hote`. Le départ est réservé. */
  reserver(hote: string): number {
    const t = this.now();
    const depart = Math.max(t, this.prochain.get(hote) ?? 0);
    this.prochain.set(hote, depart + this.ecartMs);
    // Partagée, la table ne garde que les départs à venir.
    for (const [h, p] of this.prochain) if (p <= t) this.prochain.delete(h);
    return depart - t;
  }

  /** L'hôte a refusé : plus rien ne part vers lui. */
  refuser(hote: string): void {
    this.refus.add(hote);
  }

  aRefuse(hote: string): boolean {
    return this.refus.has(hote);
  }

  /** Les hôtes qui ont refusé, ou qu'on a reçus comme tels. */
  refuses(): string[] {
    return [...this.refus];
  }
}

/** Au plus `n` tâches à la fois : les lectures de tous les hôtes réunis. */
export function semaphore(n: number): { prendre(): Promise<void>; rendre(): void } {
  let libres = Math.max(1, Math.floor(n));
  const file: Array<() => void> = [];
  return {
    prendre() {
      if (libres > 0) {
        libres -= 1;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => file.push(resolve));
    },
    rendre() {
      const suivant = file.shift();
      if (suivant) suivant();
      else libres += 1;
    },
  };
}

/** Les éléments rangés par hôte, dans l'ordre reçu ; ceux sans hôte sont laissés. */
export function parHote<T>(items: readonly T[], hoteOf: (x: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const x of items) {
    const h = hoteOf(x);
    if (!h) continue;
    const liste = out.get(h);
    if (liste) liste.push(x);
    else out.set(h, [x]);
  }
  return out;
}
