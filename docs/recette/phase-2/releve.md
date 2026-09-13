# Phase 2 — la carte redevient manipulable

## Ce que le symptôme désignait

`statique` n'était pas en cause. `routes/carte.tsx` monte `Carte` sans cette
option, et la fiche station n'a plus de carte depuis la maquette v7 : les deux
seuls appels à `statique` avaient disparu avec elle.

La cause était une ligne de `CarteEpingles`, la carte des écrans Comparer et
Logements :

```
const m = Lf.map(hote.current, { zoomControl: false, scrollWheelZoom: false });
```

`dragging` et `touchZoom` étaient actifs (Leaflet les active par défaut), seul
le zoom à la molette était coupé. La carte occupant toute la hauteur de la
colonne de droite et suivant le défilement, une molette passée au-dessus
d'elle faisait défiler la page derrière : de l'extérieur, cela se lit
« impossible de zoomer, impossible de faire défiler la carte ».

## Avant et après, mesuré

Un changement de molette ne se photographie pas. Il se mesure : on lit le
niveau de zoom dans l'URL d'une tuile, on passe la molette au-dessus de la
carte, on relit.

| Mesure | Avant | Après |
| --- | --- | --- |
| Classes du conteneur | `leaflet-grab leaflet-touch-drag leaflet-touch-zoom` | inchangées à la souris |
| Zoom après molette (souris) | 13 → 13, page défilée | 13 → 15, `window.scrollY` reste 0 |
| Contrôle de zoom | bas-droite | bas-droite, inchangé |
| Au doigt : classes | `leaflet-grab leaflet-touch-drag` présentes dès le chargement | absentes tant qu'on n'a pas appuyé |
| Au doigt : après un appui | — | `leaflet-grab` et `leaflet-touch-drag` posées, voile retiré |

La ligne « Avant » du doigt est le défaut que la règle 3 nomme : la carte
prenait le geste sans qu'on le lui demande, donc elle avalait le défilement de
la page au milieu de la liste.

## Captures

| Fichier | Ce qu'il montre |
| --- | --- |
| `carte-manipulable-1440x900.png` | Logements, souris : carte pleine, pas de voile |
| `carte-manipulable-390x844.png` | Logements au format téléphone |
| `comparer-carte-1440x900.png` | Comparer, souris |
| `comparer-carte-390x844.png` | Comparer au format téléphone |
| `carte-garde-tactile-1100x1200.png` | Le voile « Appuyez pour déplacer la carte » |

## Une limite à dire

Au format 390 × 844, la carte n'est pas sur la capture, et le voile non plus.
Ce n'est pas la garde tactile qui manque — la sonde la relève bien — c'est la
coquille qui porte `min-width: 1100px` depuis la maquette v6, reprise telle
quelle en v7. En dessous de 1100 px, la page est rognée à droite et la colonne
de carte sort du champ. Rendre la coquille adaptative est un chantier à part
entière, hors du périmètre de cette phase.

C'est pourquoi la garde tactile est photographiée à 1100 × 1200 avec le doigt
émulé, largeur à laquelle la carte est visible : la preuve porte sur le
comportement, pas sur la largeur.
