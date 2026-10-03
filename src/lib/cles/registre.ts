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

import { aTraduire } from "../i18n/tr.ts";

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
  /**
   * Vrai quand l'application fonctionne entièrement sans elle : l'écran ne la
   * compte pas parmi celles qui restent à renseigner.
   */
  facultative?: boolean;
};

export const CLES: readonly Cle[] = [
  {
    id: "meteofrance",
    env: ["METEOFRANCE_API_KEY", "SKITRACK_METEOFRANCE_API_KEY"],
    label: aTraduire("Clé API Météo-France"),
    sert: aTraduire("Bulletins d’avalanche lus directement par l’API « Données Publiques BRA » de Météo-France."),
    sans: aTraduire("Les bulletins d’avalanche viennent de l’archive publique de Météo-France sur data.gouv.fr, en accès libre, sans compte ni clé. La clé n’est utile que pour les lire par l’API."),
    obtenir: {
      texte: aTraduire("Portail API Météo-France : souscrire à « Données Publiques BRA », puis copier la clé API de l’application"),
      url: "https://portail-api.meteofrance.fr/",
    },
    secret: true,
    exemple: aTraduire("un jeton JWT, trois blocs séparés par des points"),
    essayable: true,
    facultative: true,
  },
  {
    id: "pyairbnb",
    env: ["SKITRACK_PYAIRBNB_PYTHON", "SKITRACK_PYTHON"],
    label: aTraduire("Interpréteur Python des relevés Airbnb et Booking"),
    sert: aTraduire("Chemin de l’exécutable Python qui lance les relevés directs d’Airbnb et de Booking."),
    sans: aTraduire("Les relevés cherchent eux-mêmes un Python 3 : l’environnement virtuel scrape/.venv (npm run scrape:python), puis py -3, python ou python3. S’ils n’en trouvent aucun avec curl_cffi et bs4, le relevé direct Airbnb se limite à une seule page de résultats, ce que le rapport de la source signale. Airbnb, Abritel et Booking restent relevés par CozyCozy."),
    obtenir: null,
    secret: false,
    exemple: "/usr/bin/python3",
    essayable: false,
  },
  {
    id: "apify",
    env: ["APIFY_TOKEN", "SKITRACK_APIFY_TOKEN"],
    label: aTraduire("Jeton API Apify"),
    sert: aTraduire("Complète par Apify les annonces Airbnb auxquelles il manque encore capacité, chambres, photo, prix ou position, dans un plafond de 5 $ par recherche."),
    sans: aTraduire("Les annonces Airbnb restent complétées par leurs pages, lues directement ; celles qu’elles laissent incomplètes le restent."),
    obtenir: {
      texte: aTraduire("Console Apify : Settings → API & Integrations, copier le jeton personnel"),
      url: "https://console.apify.com/settings/integrations",
    },
    secret: true,
    exemple: aTraduire("apify_api_ suivi d’une quarantaine de caractères"),
    essayable: false,
    facultative: true,
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
