# Audit UX — parcours station → logements (grand public)

Relevé sur l'aperçu, 1920 px et 390 px, parcours Accueil → Comparer → Fiche → Logements → Retenir.

## Fait dans ce lot

| # | Constat | Correction |
|---|---------|-----------|
| 1 | Logements : la liste restait en squelettes jusqu'à la fin de **toutes** les sources (jusqu'à ~70 s), alors que des épingles à prix étaient déjà sur la carte. | Les annonces des sources qui ont répondu s'affichent tout de suite, suivies de squelettes ; « N logements, recherche en cours… ». |
| 2 | « Logements à Val Thorens » : les premières cartes sont aux Menuires, au Bettex, à Orelle, à 500–1 500 m sous le village, sans que rien ne le signale. | Pastille ambre « 750 m sous le village » quand l'altitude mesurée de l'annonce est ≥ 300 m sous le village. |
| 3 | Titres en capitales avec référence interne (« LES CHALETS DU DORON ( CHDORA3 ) »), « capacité non renseignée » écrite deux fois. | Casse de phrase, référence gardée en infobulle ; trous déjà dits ailleurs retirés ; une seule mention quand capacité et chambres manquent. |
| 4 | Fiche station : la pilule de séjour flottait sur le contenu et chevauchait titres et encadré « Votre séjour ici ». | Bande opaque floutée ; l'encadré colle sous elle. |
| 5 | Fiche : bandeau « 771 km » et section Pistes « 150 km », « 142 remontées » sans échelle. | « Pistes, station », « Kilomètres, station », « Remontées, domaine ». |
| 6 | Comparer : 14 stations des 3 Vallées à égalité (771 km), Brides-les-Bains (585 m) en tête par l'alphabet. | À égalité de km, la plus haute d'abord (Val Thorens). |

## Fait au second lot

- **Téléphone (≤ 760 px)** : une colonne partout, barre du haut sur deux rangs, recherche empilée, carte au-dessus de la liste, pied « Logement retenu » réduit au nom, au total et à l'action. L'écran n'était pas utilisable (`min-width: 1100px`).
- **Tri « dans la station d'abord »** par défaut sur Logements : au niveau du village, puis altitude inconnue, puis en contrebas ; le moins cher d'abord dans chaque groupe.
- **Séjour par défaut** : 2 voyageurs, premier samedi des prochaines vacances scolaires de ski (aujourd'hui : 19 → 26 déc. 2026). Un séjour déjà enregistré n'est pas touché.
- **Coût par personne avec les forfaits** sur chaque carte d'annonce (« 831 € / pers. avec les forfaits »), égal au total du pied de page.
- **Relevé des forfaits par période** (`lecteurGrille.ts`) : PDF bilingues (« 1 jour | 1day »), en-têtes d'une catégorie par ligne avec âges, bandeau de page qui nomme le périmètre, ligne de dates posée après les tarifs. Les 3 Vallées et Les Menuires–Saint-Martin sont lus avec leurs périodes (378,50 € début/fin de saison, 421 € du 19/12 au 09/04).
- **Contrôle du relevé** : une grille contredite de plus de 50 % par un témoin (Skiinfo, skiresort.fr) est mise de côté (`misesDeCote` dans le fichier) au lieu d'être servie. Six l'ont été : Alpe d'Huez, Évasion Mont-Blanc, Le Mont-Dore, Queyras, Savoie Grand Revard, Valberg.
- Relevé complet du 4 octobre 2026 : 96 pages lues sur 125, 51 grilles, 81 périodes, 112 stations.

## Reste à faire sur le relevé des forfaits

- 24 pages refusées (403, défi anti-robot) ou qui demandent un navigateur : Playwright n'est pas installé ici ; lancer `npm run forfaits:releve` sur le poste avec Chromium.
- 38 pages lues sans tarif reconnu, dont le PDF d'Orelle (prix en colonnes, une valeur par ligne) et les pages en anglais (« €84.20 », « 6 days »).
- 5 grilles publiées en image.
- Les grilles mises de côté sont à relire à la main.

## Reste à faire, par priorité

**P1**
- Navigation en double sur la fiche : onglets « Val Thorens | Fiche station | Logements », lien « Comparer les stations », étapes du haut où « Comparer » reste actif.
- Bloc collant de Logements (~200 px : titre + ruban + filtres) : réduire au défilement.
- Jargon : « relevé », « fiabilité faible », « ≈ estimé », « Centrale », « trous dans la fiche » → mots de vacancier (« prix vérifié pour vos dates », « prix approximatif »).
- Bouton « Comparer » sur les cartes de l'écran Comparer : « Ajouter au comparatif » + coche.

**P2**
- Carte de Comparer : libellés en anglais (Germany, Belgium), tuiles qui disparaissent au défilement.
- Épingles de prix qui se chevauchent sur la carte Logements : regroupement.
- Webcam tierce : le bouton « RÉSERVER » de l'embed concurrence le parcours.
- Langue FR/EN non conservée au rechargement.
