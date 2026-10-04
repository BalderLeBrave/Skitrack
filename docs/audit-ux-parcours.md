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

## Reste à faire, par priorité

**P0**
- **Mobile inutilisable (390 px)** : barre du haut, barre de recherche, grille Logements et barre « Logement retenu » débordent. Aucune règle responsive hors 900/1100 px.
- **Tri Logements par défaut « prix par personne »** : fait remonter les villages les moins chers et les plus éloignés. Proposer « Dans la station d'abord » (altitude / secteur), ou un filtre « Au village ».

**P1**
- Séjour par défaut figé (6→13 févr. 2027, 8 voyageurs) : pour le grand public, 2 adultes et les prochaines vacances scolaires.
- Navigation en double sur la fiche : onglets « Val Thorens | Fiche station | Logements », lien « Comparer les stations », étapes du haut où « Comparer » reste actif.
- Bloc collant de Logements (~200 px : titre + ruban + filtres) : réduire au défilement.
- Jargon : « relevé », « fiabilité faible », « ≈ estimé », « Centrale », « trous dans la fiche » → mots de vacancier (« prix vérifié pour vos dates », « prix approximatif »).
- Bouton « Comparer » sur les cartes de l'écran Comparer : « Ajouter au comparatif » + coche.

**P2**
- Carte de Comparer : libellés en anglais (Germany, Belgium), tuiles qui disparaissent au défilement.
- Épingles de prix qui se chevauchent sur la carte Logements : regroupement.
- Webcam tierce : le bouton « RÉSERVER » de l'embed concurrence le parcours.
- Langue FR/EN non conservée au rechargement.
