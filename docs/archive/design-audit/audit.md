# Audit de design SKITRACK

- **Commit audité** : `aba6172` (`Merge pull request #9 … carte-des-stations-classeur`).
- **Copie de travail** : propre, `git status --short` vide avant et après.
- **Serveur** : `SKITRACK_NO_WINDOW=1 VITE_AUTH_ENABLED=false` puis Vite sur
  `http://127.0.0.1:8080`.
- **Captures** : 30 fichiers dans `docs/design-audit/avant/`, 15 écrans aux deux
  tailles 1440x900 et 390x844, plus le relevé `avant/releve.json`.
- **Harnais** : `scripts/recette.mjs`, réutilisé sans modification. Son
  commentaire d'en-tête explique déjà pourquoi `browser-smoke.mjs` ne convient
  pas : il borne ses sorties à `/workspace` via `browser-guard.mjs`. Je n'ai
  touché ni l'un ni l'autre.

## Limites de cet audit

Deux choses que je n'ai pas pu observer, dites ici plutôt que devinées.

**Les tuiles de carte sont bloquées.** Le proxy de sortie de cet environnement
refuse `tile.openstreetmap.org` et `data.geopf.fr`. Les quatre écrans qui
portent une carte apparaissent donc avec une zone vide à la place du fond.
Les 8 à 36 « images cassées » relevées par le harnais sont toutes des tuiles,
vérifié une par une dans `releve.json` : aucun défaut applicatif derrière.
Le placement des épingles, des légendes et des contrôles reste lisible, le
rendu du fond ne l'est pas.

**La maquette v6 n'est pas dans le dépôt.** `docs/design/v6-contrat.md` désigne
`design/v6/SKITRACK - App v6 (parcours complet).html` comme source unique, et ce
dossier n'existe ni dans l'arbre git ni sur le disque. Il est probablement chez
vous en fichier non suivi. Je m'appuie donc sur le contrat, que votre consigne
déclare faisant foi, et jamais sur la maquette elle-même.

---

## Contradictions entre la consigne et le dépôt

Votre document dit : quand une consigne contredit le dépôt, le dépôt gagne et je
le signale. Voici les quatre contradictions, par ordre d'importance.

### 1. La bibliothèque de carte est déjà tranchée

Vous me demandez de choisir entre `maplibre-gl` et `leaflet`. Le dépôt a déjà
choisi. `docs/design/v6-ecarts.md`, section « Décisions prises (12 septembre
2026) », décision 3 : « **Carte Leaflet 1.9.4**, comme la maquette ». Le contrat
v6 relève le `link` et le `script` Leaflet 1.9.4 dans le `head` de la maquette.

La question qui reste n'est pas « laquelle » mais « faut-il migrer les deux
écrans restés sur MapLibre ». Je la traite en décision A plus bas.

### 2. L'esthétique que vous voulez défaire est celle de la maquette v6

Vous nommez deux motifs à supprimer : l'étiquette `text-xs uppercase
tracking-wide text-muted` au-dessus de chaque valeur, et le bloc
`rounded-[var(--radius-card)] border border-line bg-panel p-4`.

Les deux sont dans v6, pas seulement dans le code ancien. Les captures le
montrent : « ÉTAPE 1 · STATION », « VOTRE SÉJOUR », « ALTITUDE DES PISTES »,
« ÉPINGLES », « DATES », « VOYAGEURS ». Six règles `text-transform: uppercase`
dans `src/design/v6.css`, cinq dans `src/styles.css`. La bande de faits de la
fiche station et le panneau de séjour sont des cartes bordées avec `--shadow`.

Vous me dites aussi de ne pas améliorer la maquette v6 et d'attendre là où votre
document et elle divergent. Ils divergent ici, frontalement, sur les cinq écrans
du parcours. C'est la décision B, et c'est celle qui commande tout le reste.

### 3. L'écran « Comparaison » que vous décrivez n'est pas l'écran `/comparer`

Vous décrivez un tableau, stations en colonnes, critères en lignes. `/comparer`
est aujourd'hui l'étape 1 du parcours : une liste de 320 stations à gauche, une
carte à droite, et un panneau de comparaison qui se déplie. Le tableau que vous
décrivez n'existe nulle part.

Le remplacer serait une refonte de l'étape 1, pas une mise en ordre, et cela
sortirait du contrat v6. Deux lectures possibles, à trancher : ajouter une vue
tableau au panneau de comparaison existant, ou remplacer l'écran. Je recommande
la première et j'attends votre mot.

### 4. Deux écrans cités n'ont pas la forme annoncée

`/reservation` n'est plus `/reservation/$id` depuis la campagne v6. Et le
tableau dense de logements que vous demandez pour `/logements` existe déjà,
mais sur `/traces` : « Logements et départ », 21 fiches, colonnes logement,
séjour, prix par personne, lieu, remontée, trace. C'est exactement la forme que
votre document réclame. Elle est à reprendre, pas à réinventer.

---

## 0.2 Relevé du système actuel

### Typographie

Deux familles chargées par `__root.tsx` : `Plus Jakarta Sans` en cinq graisses
(400, 500, 600, 700, 800) et `IBM Plex Mono` en trois (400, 500, 600). Le relevé
d'écarts v6 note que la seconde « reste chargée pour les écrans non migrés
(`.num`) ; aucun écran v6 ne l'emploie ».

Tailles employées, comptées sur `src/styles.css` et `src/design/v6.css` :

| Unité | Valeurs distinctes | Total d'occurrences |
| --- | --- | --- |
| `px` | 16 | 80 |
| `rem` | 13 | 48 |

Soit 29 tailles distinctes en CSS. Les plus fréquentes : `12px` (17),
`14px` (9), `0.78125rem` (9), `15px` (8), `0.75rem` (8), `16px` (7),
`12.5px` (7), `0.8125rem` (7). S'y ajoutent les classes Tailwind dans les
`.tsx` : `text-xs` (93), `text-sm` (90), `text-3xl` (4), `text-lg` (3),
`text-[11px]` (3), `text-4xl` (3), `text-2xl` (3), `text-xl` (2),
`text-base` (2).

Graisses : sept valeurs en CSS (400, 500, 600, 650, 700, 800, `inherit`) et
trois classes Tailwind (`font-medium` 41, `font-semibold` 37, `font-bold` 2).
La valeur `650` n'existe pas dans la police chargée et sera rendue par
synthèse.

Interlignes déclarés : `1.04`, `1.1`, `1.45`, `normal`, plus le `1.5` de
Tailwind sur `html`, que v6 neutralise dans `.v6`.

### Espacement

79 valeurs distinctes de `padding` et 34 de `gap`, sans base commune. Les `gap`
les plus fréquents suivent un pas de 2 px : `8px` (22), `10px` (14), `6px` (12),
`12px` (11), `4px` (8), `16px` (8). Le reste mélange `px` et `rem` pour des
valeurs voisines : `0.5rem` et `8px` coexistent, `0.75rem` et `12px` aussi.

### Couleurs

`src/design/tokens.ts` porte 18 jetons recopiés du bloc `:root` de la maquette,
plus une trentaine de jetons complémentaires préfixés `--v6-` dans `v6.css`
(§ 1 bis du contrat). `src/styles.css` porte un second jeu, préfixé `--color-`,
pour les écrans non migrés.

Couleurs écrites en dur dans les `.tsx`, cinq fichiers :

| Fichier | Ce qu'elles y font |
| --- | --- |
| `src/components/MountainScene.tsx` | palette de la scène 3D (composant orphelin) |
| `src/components/Flocons.tsx` | flocons de l'accueil |
| `src/components/MapPanel.tsx` | couleurs de tracé et de relief MapLibre |
| `src/components/PisteFilterBar.tsx` | couleurs de piste (composant orphelin) |
| `src/routes/__root.tsx` | `theme-color` du manifeste |

### Rayons, bordures, ombres

22 valeurs distinctes de `border-radius`. Les deux dominantes sont `999px` (24)
et `50%` (11), qui sont la même intention « rond ». Restent 20 valeurs pour les
angles : `3px`, `14px`, `16px`, `10px`, `8px`, `6px`, `0.5rem`, `12px`, `2px`,
`5px`, `1rem`, `18px`, `0.7rem`, `0.55rem`, `0.4rem`, `0.375rem`, `0.625rem`,
`99px`, `var(--radius-card)`, `0`.

21 ombres distinctes, dont 6 par le jeton `var(--shadow)` et 3 par
`var(--v6-shadow-haute)`. Les autres sont écrites en clair dans la feuille.

### Composants

38 fichiers dans `src/components/`, plus 7 dans `src/components/v6/`.

**Seize ne sont importés nulle part**, vérifié sur tout `src/` :
`AltCard`, `CentraleCard`, `FicheDetail`, `ForfaitCard`, `IgnSkiCard`,
`LiftBoard`, `LodgingCard`, `MfCard`, `MountainScene`, `OsmSkiCard`,
`PartyStepper`, `PisteFilterBar`, `SceneGuard`, `SelectionNotes`, `SnowCard`,
`StationCard`. Ensemble ils pèsent plus de 2 000 lignes. La campagne v6 les a
remplacés sans les retirer.

Doublons fonctionnels encore vivants :

| Fonction | Deux implémentations |
| --- | --- |
| Coquille de page et navigation | `AppShell.tsx` (5 écrans) et `v6/App.tsx` avec `v6/Nav.tsx` (5 écrans) |
| Profil d'altitude | `AltitudeProfile.tsx` en SVG dessiné, `ElevationProfile.tsx` en `recharts` |
| Carte | `AlpineMap.tsx` et `MapPanel.tsx` en MapLibre, `v6/StationMap.tsx` en Leaflet |
| Logement | `LodgeSheet.tsx`, `LodgeCompare.tsx`, et `LodgingCard.tsx` orphelin |

### Icônes

Trois sources coexistent.

1. `src/components/v6/icons.tsx` : dix pictogrammes SVG en ligne, tous sur
   `viewBox="0 0 24 24"`, `aria-hidden`. C'est le registre propre.
2. `lucide-react` : encore importé par `GpxDrop.tsx`, `traces.tsx` et
   `src/lib/error-component.tsx`.
3. SVG écrits à la main hors du registre, dans onze fichiers, dont
   `ForecastCard.tsx` (4), `carte.tsx` (2), `SelectionNotes.tsx` (2),
   `PartyStepper.tsx` (2).

Glyphes Unicode employés comme texte, et non comme icône : `→` (9 occurrences)
et `↗` (1). Le relevé d'écarts les tient pour partie du libellé. Aucun emoji
nulle part. Sur ce point le dépôt est déjà conforme à votre règle.

### Bibliothèques de carte

| Bibliothèque | Composant | Écrans |
| --- | --- | --- |
| `leaflet` | `v6/StationMap.tsx` (218 lignes) | `/comparer`, minicarte de la fiche station |
| `maplibre-gl` | `AlpineMap.tsx` (214 lignes) | `/carte` |
| `maplibre-gl` | `MapPanel.tsx` (318 lignes) | `/traces`, `StayReport.tsx` |

MapLibre pèse 1 058 ko dans le bundle de sortie, mesuré au build. Leaflet en
pèse environ 150.

### Dépendances devenues inutiles

`cmdk`, `vaul`, `sonner`, `@tanstack/react-table` et `react-resizable-panels`
ne sont importés par aucun fichier de `src/`. `three` et `@react-three/fiber`
ne servent plus qu'à `MountainScene.tsx`, qui est orphelin. `recharts` ne sert
plus qu'à `ElevationProfile.tsx`.

---

## 0.3 Diagnostic, écran par écran

### `/` Accueil

L'œil voit d'abord la couverture pleine largeur et le titre en 52 px. C'est le
bon ordre : la barre de recherche vient juste après et porte l'action unique.
Ce qui gêne : les six étiquettes en capitales de la barre de recherche pèsent
autant que les valeurs qu'elles nomment, et « CHAMBRES 0 » demande une phrase
d'explication sous la barre pour être compris. Ce qui manque : rien. À
conserver : la hiérarchie couverture, titre, recherche, puis les quatre chips
de filtre, qui est juste.

### `/carte` Carte des stations

L'œil voit la carte, qui occupe les deux tiers. Il devrait voir d'abord la liste
et son compte, car c'est elle qui décide. Ce qui gêne : les quatre chips de fond
de carte flottent en haut à droite avec le même poids que la légende en bas à
gauche, et les altitudes de la liste sont en chasse fixe alors que rien d'autre
ne l'est. Ce qui manque : le lien entre survol de la liste et épingle, annoncé
par le texte « survolez la carte pour la retrouver dans la liste » mais pas
réciproque. À conserver : le compte « 320 stations sur 320 » en texte simple.

### `/stations/<id>` Fiche station

L'œil voit la couverture et le nom, ce qui est juste. Ce qui gêne : la bande de
faits met six valeurs au même poids, et les colonnes sont trop étroites, si bien
que « 1 825–3 230 m » se casse sur trois lignes chez Val Thorens comme chez
Larche. Ce qui gêne encore : dix sections se suivent sans rang, de « Profil
altimétrique » à « Risque d'avalanche », toutes dans une carte bordée de même
poids. Ce qui manque : un ordre qui distingue ce qui décide de ce qui rassure.
À conserver : le panneau « Votre séjour » avec son action unique en accent, et
l'en-tête de `larche`, qui dit « Aucune photo relevée pour Larche » au lieu de
laisser un trou.

### `/comparer` Étape 1

L'œil voit la carte. Il devrait voir la liste et le nombre de stations. Ce qui
gêne : à 390 px la légende des épingles flotte au-dessus de la liste et masque
deux stations, et la navigation du haut est coupée à droite. Ce qui manque :
la comparaison proprement dite, qui vit dans un panneau dépliant et non dans
une vue où les colonnes s'alignent. À conserver : la ligne de station, dense et
lisible, qui tient altitudes, village, remontées, distance à la piste et mix de
couleurs sur trois lignes.

### `/logements` Étape 2

L'œil voit l'état vide, correctement titré « Choisissez d'abord une station »
avec la cause nommée et l'action pour en sortir. Ce qui gêne : la carte blanche
de l'état vide occupe un cinquième de la hauteur et les quatre cinquièmes
restants sont vides, ce qui donne une page qui semble cassée. Ce qui manque :
rien de fonctionnel. À conserver : l'état vide dit sa cause, ce que votre
document exige en phase 7 et qui est déjà fait.

### `/reservation` Étape 3

Même forme et même défaut que `/logements` : état vide juste, page vide en
dessous. Le récapitulatif imprimable `StayReport.tsx` n'a pas pu être vu, faute
d'une sélection en place. Il embarque `MapPanel`, donc MapLibre, alors que votre
document demande qu'il tienne sur une A4 sans la carte.

### `/forfaits`

L'œil voit un mur. La page fait 11 327 px de haut en une seule colonne, une
ligne par station, sans regroupement par domaine ni pagination. Ce qui gêne :
le texte est à sa plus petite taille sur toute la hauteur et les prix ne sont
pas alignés en colonne. Ce qui manque : un tri, un filtre, et le regroupement
par forfait lié, puisque plusieurs stations partagent le même. À conserver :
la mention de la date de relevé sur chaque ligne.

### `/altitudes`

12 557 px de haut, même diagnostic. C'est un tableau de contrôle interne qui a
gardé l'apparence d'un écran de produit. Ce qui gêne : les écarts en mètres,
qui sont la seule raison de venir ici, ne sont pas mis en avant. Ce qui manque :
un résumé en tête. À conserver : les cinq chips de verdict, qui sont le bon
filtre.

### `/traces`

L'œil voit le dépôt de fichier GPX, ce qui est juste puisque rien ne marche sans
lui. Ce qui gêne : la carte occupe la moitié droite et reste vide tant qu'aucune
trace n'est chargée. Ce qui manque : rien. À conserver, et c'est le point le
plus utile de cet audit : le tableau « Logements et départ » en bas est
exactement la liste dense que votre document réclame pour `/logements`,
distance aux remontées comprise.

### `/openskimap`

Écran de contrôle interne, hors parcours, accessible par le menu « Plus ». Il
n'a pas de défaut de mise en page parce qu'il n'a presque pas de mise en page.
Je le laisse hors périmètre sauf mot de votre part.

---

## 0.4 Proposition de système

### Échelle typographique, cinq tailles

| Nom | Taille | Interligne | Emploi |
| --- | --- | --- | --- |
| `t-affiche` | 52 px, 44 px sous 700 px | 1.04 | titre de couverture, une fois par écran au plus |
| `t-titre` | 34 px | 1.1 | titre d'écran |
| `t-section` | 20 px | 1.2 | titre de section |
| `t-corps` | 15 px | 1.45 | texte courant, valeurs |
| `t-note` | 12.5 px | 1.35 | libellés, unités, mentions de source |

Trois graisses : 400, 600, 800. La graisse `650` disparaît. `IBM Plex Mono`
est retirée du chargement, aucun écran v6 ne l'emploie ; l'alignement des
chiffres vient de `font-variant-numeric: tabular-nums`, comme le contrat v6 le
note déjà pour `.rel`.

### Échelle d'espacement

Base 4 px, multiples retenus : 4, 8, 12, 16, 24, 32, 48, 64. Les 79 valeurs de
`padding` et 34 de `gap` s'y ramènent. Une seule unité, le pixel, pour ne plus
avoir `0.5rem` et `8px` côte à côte.

### Palette

Les 18 jetons de `src/design/tokens.ts` suffisent et restent la source. Je
propose de les nommer par rôle, sans changer une valeur :

| Rôle | Jeton existant |
| --- | --- |
| Fond | `--bg` `#f7fbfe` |
| Surface | `--v6-surface` `#fdfeff` |
| Surface secondaire | `--glacier` `#e8f3fa` |
| Encre | `--ink` `#0b1f33` |
| Encre secondaire | `--texte-2` `#63717d` |
| Accent | `--cta` `#ff5a3c` |
| Lien et sélection | `--marque` `#0b6fc2` |
| Bordure | `--bordure` `#c9d3dc` |

Sémantiques : `--ok` pour le relevé confirmé, `--v6-warn` pour le tarif non à
jour, `--neige` pour la neige. Couleurs de piste réservées aux pistes, elles le
sont déjà.

### Rayons, deux valeurs

`8px` pour les surfaces, `999px` pour les pastilles et les chips. Les vingt
autres valeurs se ramènent à l'une des deux.

### Élévation

Une seule ombre, `var(--shadow)`, réservée aux surfaces flottantes : la
navigation collante, le panneau de comparaison, la barre de séjour, la légende
de carte. Aucune ombre sur un bloc posé dans la page. Vingt des vingt et une
ombres actuelles disparaissent.

---

## Les trois décisions

### A. Une seule bibliothèque de carte

**Ma recommandation : Leaflet, et retrait de `maplibre-gl`.**

Le contrat v6 l'a déjà choisi et le parcours entier tourne dessus. Garder les
deux coûte 1 058 ko de bundle pour deux écrans du menu « Plus ».

Coût de la migration, honnêtement : `AlpineMap.tsx` demande un regroupement
d'épingles, qui en Leaflet passe par `leaflet.markercluster`, une dépendance de
plus, ou par un regroupement écrit à la main. Les fonds IGN et l'overlay
OpenSnowMap sont des tuiles raster et se portent tels quels. `MapPanel.tsx`
perd deux choses que Leaflet ne sait pas faire : la vue 3D en relief du bouton
« Vue 3D · relief » et l'ombrage du modèle d'élévation. Si vous tenez à la vue
3D sur `/traces`, dites-le et je garde MapLibre sur ce seul écran, documenté
comme exception.

### B. Le motif de bloc

**Ma recommandation : sections séparées par le vide et un titre pour le
contenu, surface bordée réservée au flottant et au panneau d'action.**

Mais je ne peux pas l'appliquer aux cinq écrans du parcours sans votre accord,
parce que cela contredit la maquette v6, que vous me demandez de ne pas
améliorer. Deux voies, et il faut en choisir une :

**B1, la maquette gagne.** Les règles de votre document sur les capitales, les
cartes bordées et les ombres ne s'appliquent qu'aux cinq écrans non migrés
(`/carte`, `/forfaits`, `/altitudes`, `/traces`, `/openskimap`), qu'on aligne
sur le vocabulaire v6. Le travail devient une mise en ordre, ce que votre titre
annonce. Le contrat v6 reste valide.

**B2, votre document gagne.** La maquette v6 est amendée, le contrat relu et
réémis avec de nouveaux hashes, et les cinq écrans du parcours sont repris.
C'est une refonte, avec le risque de défaire un travail validé le 12 septembre.

Je recommande **B1**, et j'ajoute une réserve : v6 a des défauts propres que
B1 doit corriger sans toucher à son vocabulaire. La bande de faits qui casse
les altitudes sur trois lignes, la coupe à 390 px sur `/comparer`, les seize
composants orphelins, les trois sources d'icônes, les deux bibliothèques de
carte. Ce sont des défauts d'exécution, pas des choix de maquette.

### C. La densité de la fiche station

**Ma recommandation, trois rangs dans cet ordre :**

**Rang 1, ce qui décide.** Couverture, nom, massif et domaine. Puis quatre
valeurs seulement, en grand : altitude des pistes, altitude du village,
kilomètres de pistes du domaine, distance à la piste la plus proche. Puis le
panneau « Votre séjour » et son action unique. Les tronçons et le nombre de
remontées descendent au rang 2 : ils comptent, mais après.

**Rang 2, ce qui informe.** En deux colonnes, sans cadre, séparées par le vide :
profil altimétrique, pistes par couleur, situation sur la minicarte, forfaits.
Ces quatre sections répondent à « est-ce que ça me va », pas à « est-ce que je
prends ».

**Rang 3, ce qui rassure.** Neige au sol, prévision 14 jours, historique,
webcams, risque d'avalanche. Ces cinq sections sont vides ou partielles pour
une large part du catalogue, et un bloc vide au rang 1 fait douter de tout
l'écran. Elles se replient et s'ouvrent au clic, fermées par défaut quand la
donnée manque, ouvertes quand elle existe.

Une réserve sur le rang 3 : le relevé d'écarts note que « Forfaits et neige »
affiche « – » tant que rien ne répond, et qu'une phrase de la maquette annonce
que ces valeurs ne sont pas relevées. Cette phrase devient fausse dès qu'une
valeur arrive. Le relevé la marque « à trancher ». Elle fait partie du rang à
mettre en ordre.

---

## Point d'arrêt

Je n'ai écrit aucune ligne de code. Rien n'est commité. J'attends votre
validation sur les décisions A, B et C, et votre mot sur les quatre
contradictions du haut de ce document, en particulier la 2 et la 3, qui
décident du périmètre des phases 3 à 6.
