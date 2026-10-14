# Skitrack

Comparer un séjour ski **en France**, par domaine skiable et par altitude réelle
(le bas des pistes n’est pas l’altitude du village).

Application web : recherche de logements entiers autour du domaine, totaux de
séjour seulement, mix de pistes, forfaits à jour, neige et bulletin d’avalanche.
Rien n’est inventé.

## Ce que l’app montre

- **Domaines français** — altitudes France Montagnes, mix de pistes publié
  par Skiinfo (à défaut, tronçons OpenStreetMap) réparti sur le kilométrage
  annoncé.
- **Distances** — distance aux **remontées mécaniques**, en mètres, ou
  « non mesurée ». « Skis aux pieds » n’est déduit qu’à 50 m mesurés ou moins ;
  sinon il n’apparaît que si l’annonce le déclare.
- **Forfaits** — prix relevé sur la page officielle du domaine, avec la date
  du relevé. Un tarif saisi à la main n’est pas écrasé. Un estimé ≈ n’entre
  pas dans le coût du séjour. Si le relevé échoue, l’ancien prix reste, marqué
  « non à jour ».
- **Logements** — recherche autour du domaine. Un total de séjour, pas un prix
  « à partir de ».
- **Neige** — Open-Meteo, hauteur au sol et prévision, au village et au sommet.
- **Avalanche** — **BRA officiel Météo-France** quand le massif a un bulletin.
  Sinon, la fiche dit pourquoi (hors saison, pas de bulletin pour ce massif,
  station non rattachée, bulletin non obtenu) ; aucun indice maison ne
  remplace le BRA.
- **Séjours en France uniquement.** L’écran « Le monde » parcourt aussi les
  domaines des autres pays (référentiel OpenSkiMap). Attribution
  OpenStreetMap / OpenSkiMap (ODbL), IGN, OpenFreeMap et Mapterhorn : voir
  *Licences*.

## Utilisation

1. Choisir un massif et des dates.
2. Lire le mix de pistes, le forfait (âge et source), le BRA.
3. Ouvrir les logements : totaux de séjour, distance aux remontées, secteur.
4. Comparer jusqu’à quatre fiches. Déposer une trace GPX si besoin.

Les écrans : accueil des domaines, comparateur, fiche station, logements,
réservation, prix (médiane d’un séjour par station, logements dans le
budget), favoris. Sous « Plus » : carte des stations, le monde, forfaits,
traces GPX, et le contrôle des données (IGN × Skiinfo, OpenSkiMap × Skiinfo,
clés).

## Application Windows

`SKITRACK-<version>-x64.exe` installe l'application de bureau, complète :
Python, navigateur et tuiles de la carte sont embarqués, rien d'autre n'est à
installer. Elle se met à jour d'elle-même depuis les Releases GitHub du dépôt.
Pour fabriquer l'installateur (`npm run release:win`), publier une version
(`npm run release:publier`) et savoir ce qu'il contient :
[docs/INSTALLATEUR-WINDOWS.md](docs/INSTALLATEUR-WINDOWS.md).

Pour développer : Node 24 (22.12 au minimum), puis `SKITRACK.bat` ou
`npm run electron`. `SKITRACK.bat` met d’abord le dossier à jour depuis GitHub
(avance rapide seulement, sans toucher aux modifications locales) et réinstalle
les dépendances quand elles ont changé (`scripts/mettre-a-jour.mjs`).

## Licences

Données de domaines dérivées d’**OpenStreetMap** via **OpenSkiMap**, licence
**ODbL**. Fonds de carte **Plan IGN v2** et **BD ORTHO** de l’**IGN**
(France seulement). Pistes et fond « Relief » : la carte d’OpenSkiMap, sur des
tuiles que Skitrack bâtit depuis openskidata.org ; le fond vectoriel vient
d’**OpenFreeMap** (© OpenMapTiles, données OpenStreetMap), l’ombrage de
**Mapterhorn**. Détail : [docs/TUILES-OPENSKIMAP.md](docs/TUILES-OPENSKIMAP.md).
Photos de l’écran « Le monde » : **Wikimedia Commons** (CC BY, CC BY-SA),
créditées à l’écran.
