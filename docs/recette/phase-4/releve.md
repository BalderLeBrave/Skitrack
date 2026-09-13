# Phase 4 — fenêtre de survol et de clic

## Les cotes du kit, et où l'on s'en écarte

Largeur 327, croix de fermeture en haut à gauche dans une pastille circulaire
sombre translucide, fenêtre posée au-dessus de l'épingle : repris tels quels.

La hauteur de 289 devient un **plancher** et non un plafond. Fixée, elle
écrasait le titre à zéro : le kit suppose une photo et une note, là où
SKITRACK affiche une distance et un verdict de disponibilité, qui prennent
deux lignes de plus. La fenêtre grandit donc jusqu'à 380 si son contenu
l'exige. Sans photo — cas ordinaire sur ce relevé — elle se resserre au lieu
de garder un cadre vide.

## Survol et clic

| Geste | Effet |
| --- | --- |
| Survol d'une épingle | La fenêtre s'ouvre après 300 ms |
| Le pointeur part | Elle se ferme |
| Le pointeur entre dans la fenêtre | Elle reste : sinon elle serait inatteignable |
| Clic sur l'épingle | Elle reste jusqu'à fermeture explicite |
| Clic sur la même épingle | Elle se ferme |
| Croix, ou Échap | Elle se ferme |

Les 300 ms sont là pour qu'un pointeur qui traverse la carte ne déclenche rien.

## Synchronisation, dans les deux sens

Mesuré sur Comparer : survoler la carte « Brides les Bains » dans la liste
rend `.stc7--vif` sur la carte et `.epingle--vive` sur l'épingle. Survoler
l'épingle produit l'inverse. Sur Logements, même chose entre `.lodge7--vif` et
la pastille de prix.

L'ordre des priorités est fixe : le clic l'emporte sur le survol de la carte,
qui l'emporte sur le survol de la liste.

## Deux défauts trouvés en route

**Les épingles de station n'avaient pas de cible.** Le marqueur Leaflet mesure
0 × 0 et le dessin déborde par une translation. Le disque, en `display: grid`,
héritait donc d'une largeur nulle : il se voyait mais ne se survolait pas. Une
largeur de contenu suffit.

**Les quarante marqueurs étaient reconstruits à chaque rendu.** `ficheDe` est
une fonction écrite en ligne par l'écran, donc neuve à chaque fois, et elle
figurait dans les dépendances de l'effet qui pose les marqueurs. Chaque frappe
vidait la couche et la reremplissait, ce qui effaçait au passage l'éclairage de
l'épingle vive. Lue par une référence, elle ne déclenche plus rien.

## Au doigt

Pas de survol : le clic ouvre la fenêtre, ancrée en bas de la carte plutôt que
posée sous le pouce.

## Captures

| Fichier | Ce qu'il montre |
| --- | --- |
| `fenetre-logement-1440x900.png` | Fenêtre d'annonce, avec photo, source, prix, verdict |
| `fenetre-logement-390x844.png` | Même écran au format téléphone |
| `fenetre-station-1440x900.png` | Fenêtre de station, sans photo, resserrée |
| `fenetre-station-390x844.png` | Même écran au format téléphone |

Au format 390 la carte reste hors champ (`min-width: 1100px` de la coquille,
limite relevée en phase 2).
