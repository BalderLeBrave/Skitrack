# Phase 3 — ne montrer que ce que la carte montre

## La règle

La carte rend ses bornes en fin de déplacement et en fin de zoom, jamais
pendant : `moveend` et `zoomend`, pas `move`. Pendant le geste, la liste
clignoterait sous les doigts.

La liste ne s'y accroche que si la case **« Rechercher quand je déplace la
carte »** est cochée, et elle est **décochée par défaut**. C'est le reproche
fait partout à ce motif : cochée, un simple coup d'œil ailleurs efface la
liste qu'on venait de constituer.

Quand elle est cochée, la carte cesse de se recadrer sur la liste. Sans cela
les deux se poursuivraient : la liste change, la carte se recadre, le cadre
change, la liste change.

## Ce qui reste affiché quoi qu'il arrive

Une entrée sans coordonnées n'est pas hors du cadre : elle n'a pas de cadre.
La carte ne peut ni la montrer ni la cacher, et la masquer reviendrait à punir
un relevé incomplet. Elle reste dans la liste, et le compteur la nomme à part.

## Mesuré à l'écran

### Logements, Les 2 Alpes

| Geste | Compteur | Cartes rendues |
| --- | --- | --- |
| Au chargement, case décochée | 78 annonces sur 80 · 11 sans localisation | 78 |
| Case cochée, carte immobile | 78 annonces sur 80 · 11 sans localisation | 78 |
| Molette, cadre resserré | 43 annonces sur 80 · 35 hors du cadre · 11 sans localisation | 43 |
| Case décochée | 72 annonces sur 74 · 5 sans localisation | 72 |

Les 11 sans coordonnées sont dans les 43 : le cadre ne les touche pas. Et
43 + 35 = 78, le compte est entier.

Le dernier relevé porte sur 74 annonces et non 80 : la recherche en direct
avait rendu une réponse de plus entre les deux mesures. C'est le relevé qui
bouge, pas le filtre.

### Comparer, tout le référentiel

| Geste | Compteur | Cartes rendues |
| --- | --- | --- |
| Case décochée | 320 stations sur 320 | 40 (la tranche) |
| Case cochée, vue France | 141 stations sur 320 · 179 hors du cadre | 40 |
| Molette, cadre resserré | 6 stations sur 320 · 314 hors du cadre | 6 |

## Un défaut trouvé en route

Le cadre s'appliquait d'abord à la tranche de quarante déjà affichée, et non
aux 320. Comme la tranche est prise par kilomètres de pistes décroissants,
elle est entièrement alpine : un cadrage sur les Pyrénées n'aurait rien rendu,
alors que le référentiel en compte. Le cadre s'applique maintenant avant la
tranche.

## Captures

| Fichier | Ce qu'il montre |
| --- | --- |
| `cadre-logements-1440x900.png` | La case en haut de la carte, décochée |
| `cadre-logements-390x844.png` | Même écran au format téléphone |
| `cadre-comparer-1440x900.png` | La même case sur Comparer |
| `cadre-comparer-390x844.png` | Même écran au format téléphone |

Au format 390 la carte reste hors champ : la coquille porte
`min-width: 1100px`, limite déjà relevée en phase 2.
