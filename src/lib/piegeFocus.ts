/**
 * Le focus d'une fenêtre modale reste dans la fenêtre : Tab sur la dernière
 * commande revient à la première, Maj+Tab sur la première va à la dernière.
 *
 * Seule la règle est ici, sans DOM, pour être éprouvée seule. La fenêtre
 * (`VoletAnnonce`) compte ses commandes et applique la réponse.
 */

/**
 * La commande à focaliser après une tabulation, ou `null` quand le navigateur
 * peut faire lui-même : le focus reste dans la fenêtre sans aide.
 *
 * `n` : le nombre de commandes de la fenêtre. `i` : le rang de celle qui a le
 * focus, -1 si le focus est hors des commandes (sur la fenêtre elle-même, ou
 * dehors). `arriere` : Maj+Tab. Rend -1 quand il n'y a aucune commande : le
 * focus reste alors sur la fenêtre.
 */
export function rangApresTab(n: number, i: number, arriere: boolean): number | null {
  if (n <= 0) return -1;
  if (i < 0 || i >= n) return arriere ? n - 1 : 0;
  if (arriere && i === 0) return n - 1;
  if (!arriere && i === n - 1) return 0;
  return null;
}
