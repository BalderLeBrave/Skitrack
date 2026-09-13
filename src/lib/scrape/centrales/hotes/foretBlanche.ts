/**
 * Forêt Blanche — Risoul, Vars, Les Claux, Vars Sainte-Marie.
 *
 * Quatre stations, et la meilleure chance du moteur Ingénie. Cette centrale a
 * son fichier alors qu'elle n'est pas interrogée, parce que son cas est
 * particulier et mérite d'être écrit là où on le cherchera.
 *
 * **La porte est ouverte ici, et presque nulle part ailleurs.** Le `robots.txt`
 * de `www.risoul.com` n'est pas le gabarit d'Ingénie : il s'arrête après dix
 * règles et ne contient ni `/*booking?*`, ni `/*search?*`, ni `/*?action=*`,
 * ni `/*?cid=*`, ni `/*?ajax=*`. Sur les vingt-huit centrales du moteur, six
 * seulement sont dans ce cas, relevé du 13 septembre 2026.
 *
 * **Mais rien ne répond derrière.** La recherche de liste datée est un `GET`
 * vers `/booking` portant `action=searchAjax` et `cid=4`, forme confirmée par
 * le formulaire que la page d'accueil déclare. Appelée pour de bon, avec et
 * sans session : sans dates elle répond « Le format de la date n'est pas
 * valide », ce qui prouve qu'elle fonctionne et qu'elle attend bien des dates ;
 * avec des dates valides elle répond « Une erreur s'est produite ». La variante
 * `resultatAjax` rend une page de 91 380 octets identique pour sept nuits,
 * quatorze nuits et sans dates, sans un seul montant. Et la fiche datée,
 * autorisée elle aussi, rend 503 « Site en maintenance ! » — comme sur tous les
 * autres hôtes Ingénie essayés.
 *
 * Le connecteur reste donc à écrire, et il n'y a rien d'autre à tenter
 * aujourd'hui : ce n'est pas un paramètre mal deviné, c'est un service qui ne
 * sert pas. C'est la centrale à réessayer en premier.
 */

import type { Connecteur } from "../types";

export const foretBlanche: Connecteur = {
  host: "www.risoul.com",
  nom: "Forêt Blanche : Vars/Risoul",
  moteur: "Ingénie",
  indisponible:
    "son robots.txt autorise la recherche datée, contrairement aux autres centrales Ingénie, mais le service ne répond pas : « Une erreur s'est produite » pour la liste, et 503 « Site en maintenance ! » pour la fiche. Relevé du 13 septembre 2026.",
};
