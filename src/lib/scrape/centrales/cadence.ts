/**
 * La cadence des détails de centrale : une seconde au moins entre deux
 * requêtes vers un même hôte.
 *
 * Feratel, Arkiane et Orchestra lisent, après leurs résultats, un détail par
 * logement : les services d'un hébergement, le détail d'un lot, la fiche d'un
 * logement. Ces détails se suivent un à un, et chacun part au plus tôt une
 * seconde après la fin de la requête précédente vers le même hôte, quelle
 * qu'elle soit : une page de résultats, un calendrier, un autre détail. Le
 * premier détail attend donc aussi la fin de la dernière page de résultats.
 *
 * **Par hôte, et pour tout le serveur.** Deux recherches menées en même temps
 * vers la même centrale se partagent la file : leurs détails ne partent pas de
 * front. `webapi.deskline.net`, qui sert toutes les centrales Feratel, n'a
 * qu'une file.
 *
 * Les requêtes de résultats ne passent pas par la file ; elles y notent
 * seulement leur fin (`noterFin`). Leur propre cadence est celle de chaque
 * moteur.
 */

/** Écart minimal, en millisecondes, entre deux requêtes vers un même hôte. */
export const ECART_HOTE_MS = 1_000;

type Hote = {
  /** Fin de la dernière requête notée vers cet hôte. */
  fin: number;
  /** Le dernier détail en file : le suivant part après lui. */
  file: Promise<void>;
};
const hotes = new Map<string, Hote>();

function hoteDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function etat(url: string): Hote {
  const cle = hoteDe(url);
  let h = hotes.get(cle);
  if (!h) {
    h = { fin: 0, file: Promise.resolve() };
    hotes.set(cle, h);
  }
  return h;
}

function dormir(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** Note qu'une requête vers l'hôte de `url` vient de finir, réussie ou non. */
export function noterFin(url: string, quand = Date.now()): void {
  const h = etat(url);
  h.fin = Math.max(h.fin, quand);
}

/**
 * Mène `appel` à son tour : après le détail précédent vers le même hôte, et
 * `ecartMs` au moins après la fin de la dernière requête notée vers lui. Sa
 * fin est notée, qu'il réussisse ou non ; un échec ne bloque pas la file.
 */
export function aTourDeRole<T>(
  url: string,
  appel: () => Promise<T>,
  ecartMs = ECART_HOTE_MS,
): Promise<T> {
  const h = etat(url);
  const tour = h.file.then(async () => {
    // L'écart se recompte après chaque attente : une page de résultats d'une
    // autre recherche a pu finir entre-temps.
    let reste = h.fin + ecartMs - Date.now();
    while (reste > 0) {
      await dormir(reste);
      reste = h.fin + ecartMs - Date.now();
    }
    try {
      return await appel();
    } finally {
      noterFin(url);
    }
  });
  h.file = tour.then(
    () => undefined,
    () => undefined,
  );
  return tour;
}

/** Pour les tests : oublie tous les hôtes. */
export function oublierCadence(): void {
  hotes.clear();
}
