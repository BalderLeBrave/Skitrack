/**
 * Les clés et réglages dont l'application a besoin pour fonctionner.
 *
 * **Seule table de ces noms.** Une clé absente ne se devine pas et ne se
 * contourne pas : l'écran dit ce qui ne marchera pas sans elle, où l'obtenir, et
 * la reçoit. Rien n'est écrit en dur dans le dépôt — c'est exactement ce qui
 * était arrivé à la clé Météo-France, commitée en clair puis recopiée dans le
 * bundle du serveur.
 *
 * Le registre est pur : le serveur l'utilise pour savoir quoi lire, l'écran
 * pour savoir quoi présenter. Ajouter une clé, c'est ajouter une entrée ici.
 */

export type Cle = {
  /** Identifiant stable, employé par l'écran et le magasin. */
  id: string;
  /**
   * Les variables d'environnement lues, par ordre de préséance. La première
   * est celle qu'on documente ; les suivantes sont des alias hérités.
   */
  env: string[];
  label: string;
  /** Ce que la clé fait marcher, en une ligne. */
  sert: string;
  /** Ce qui ne marche pas sans elle. Dit sans dramatiser ni minimiser. */
  sans: string;
  /** Où l'obtenir. `null` quand il n'y a rien à demander à personne. */
  obtenir: { texte: string; url: string } | null;
  /**
   * Vrai pour un secret : la valeur n'est alors **jamais** renvoyée au
   * navigateur, ni journalisée. Faux pour un simple réglage, un chemin par
   * exemple, qui peut se relire.
   */
  secret: boolean;
  /** Forme attendue, pour aider à coller la bonne chose. */
  exemple?: string;
  /** L'écran propose un essai réel quand la clé peut être vérifiée. */
  essayable: boolean;
};

export const CLES: readonly Cle[] = [
  {
    id: "meteofrance",
    env: ["METEOFRANCE_API_KEY", "SKITRACK_METEOFRANCE_API_KEY"],
    label: "Clé API Météo-France",
    sert: "Bulletins d'avalanche officiels (API « Données Publiques BRA »).",
    sans: "Les fiches station affichent « Bulletin non obtenu » avec la cause. Le reste de l'application fonctionne : les prévisions viennent d'Open-Meteo, qui ne demande pas de clé.",
    obtenir: {
      texte: "Portail API Météo-France — souscrire à « Données Publiques BRA », puis copier la clé API de l'application",
      url: "https://portail-api.meteofrance.fr/",
    },
    secret: true,
    exemple: "un jeton JWT, trois blocs séparés par des points",
    essayable: true,
  },
  {
    id: "pyairbnb",
    env: ["SKITRACK_PYAIRBNB_PYTHON", "SKITRACK_PYTHON"],
    label: "Interpréteur Python des relevés Airbnb et Booking",
    sert: "Chemin de l'exécutable Python qui porte les relevés directs d'Airbnb et de Booking.",
    sans: "Les relevés cherchent seuls un Python 3 : le venv scrape/.venv (npm run scrape:python), puis py -3, python ou python3. S'ils n'en trouvent aucun qui ait curl_cffi et bs4, le relevé direct Airbnb se replie sur une seule page de résultats, et le rapport de source le dit ; Airbnb, Abritel et Booking restent servis par CozyCozy.",
    obtenir: null,
    secret: false,
    exemple: "/usr/bin/python3",
    essayable: false,
  },
];

export function cleParId(id: string): Cle | undefined {
  return CLES.find((c) => c.id === id);
}

/** Ce que l'écran sait d'une clé. **Jamais sa valeur quand elle est secrète.** */
export type EtatCle = {
  id: string;
  posee: boolean;
  /**
   * D'où vient la valeur retenue :
   * - `environnement` : posée au lancement, elle gagne sur tout le reste ;
   * - `saisie` : renseignée ici, gardée sur cette machine ;
   * - `null` : absente.
   */
  origine: "environnement" | "saisie" | null;
  /** La valeur, pour les réglages non secrets seulement. */
  valeur: string | null;
  /** Quand elle a été saisie ici. */
  saisieLe: string | null;
};
