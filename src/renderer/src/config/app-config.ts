/**
 * Réglages techniques de l'application — hors interface.
 *
 * Ces valeurs pilotaient l'onglet Admin. Elles n'y sont plus : un utilisateur
 * qui cherche un séjour au ski n'a pas à choisir un fournisseur d'itinéraires,
 * et un réglage qu'on expose sans savoir l'expliquer produit surtout des
 * configurations cassées qu'il faut ensuite diagnostiquer.
 *
 * ## Ce fichier **déclare**, il ne duplique pas
 *
 * Plusieurs réglages techniques vivaient déjà hors de l'interface, chacun à sa
 * place, et **y restent** : les recopier ici créerait deux sources de vérité
 * qui divergeraient au premier changement. Ce fichier les nomme et dit où ils
 * sont ; il ne porte que ce qui n'avait pas d'autre domicile que l'écran
 * Réglages.
 *
 * | Réglage | Où il vit |
 * | --- | --- |
 * | Marge de la zone d'un domaine | `OUT_OF_ZONE_MARGIN_KM`, `src/shared/geo.ts` |
 * | Centrales autorisées | `src/main/providers/station/centrals.ts` |
 * | Règle `robots.txt` | `src/main/providers/station/robots.ts` |
 * | Clés d'API | stockage chiffré du processus principal — voir `docs/config.md` |
 *
 * ## Les clés d'API ne sont pas ici
 *
 * Et elles ne doivent pas y venir. Ce fichier est versionné ; une clé écrite
 * dedans part dans l'historique Git et n'en sort plus. Elles restent dans le
 * stockage chiffré d'Electron (`safeStorage`), alimentées par variable
 * d'environnement au premier lancement. La procédure tient en cinq lignes dans
 * `docs/config.md`.
 */

/** Fournisseur d'itinéraires demandé au sidecar au démarrage. */
export const ROUTING_PROVIDER = 'openrouteservice' as const

/**
 * Service OSRM interrogé pour les temps de trajet en masse.
 *
 * **Écart assumé avec la feuille de route**, qui demandait un OSRM local par
 * défaut : l'application interroge aujourd'hui le service public, et basculer
 * la valeur sur `localhost` couperait le calcul d'itinéraires sur toutes les
 * machines qui n'hébergent pas d'instance — c'est-à-dire toutes, aujourd'hui.
 * La bascule se fait ici, en une ligne, le jour où une instance locale existe :
 *
 *     export const OSRM_BASE = 'http://localhost:5000'
 *
 * Le repli en cas d'échec est déjà en place : `domain/travel.ts` conserve son
 * estimation à vol d'oiseau quand la requête ne répond pas.
 */
export const OSRM_BASE = 'https://router.project-osrm.org'

/**
 * Sources de logement désactivées au démarrage.
 *
 * Vide : toutes les sources actives répondent. Le tri par source se faisait
 * dans les filtres de l'écran Logements ; il n'était utile qu'au diagnostic, et
 * une source coupée à la main puis oubliée fait disparaître des annonces sans
 * que rien ne l'explique.
 */
export const LODGING_SOURCES_OFF: readonly string[] = []
