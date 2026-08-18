# Vérification de la liste de stations contre bergfex.fr

*Généré par `npm run bergfex:audit` — ne pas éditer à la main.*
*Référence : `docs/diagnostics/bergfex-france.txt`, relevée le 18 août 2026 sur https://www.bergfex.fr/frankreich/*

## Chiffres

| | |
| --- | --- |
| Stations SKITRACK | **134** |
| Stations bergfex | **259** |
| Rapprochées exactement | 88 |
| Rapprochées approximativement | 30 |
| SKITRACK sans équivalent bergfex | **16** |
| bergfex absentes de SKITRACK | **124** |

## Stations de SKITRACK que bergfex ne connaît pas

Ce sont les **suspectes** : un annuaire de stations qui ignore un nom laisse
penser que ce nom désigne autre chose — un domaine, un secteur, un lieu-dit.
Chaque ligne est à trancher à la main ; rien n’est retiré automatiquement.

| Station SKITRACK | Domaine | Massif |
| --- | --- | --- |
| Les Rousses | Les Rousses | Jura |
| Monts Jura | — | Jura |
| Champagny-en-Vanoise | Paradiski | Alpes du Nord |
| Notre-Dame-de-Bellecombe | Espace Diamant | Alpes du Nord |
| Saint-Jean-d'Aulps | — | Alpes du Nord |
| Espace Nordique du Capcir | — | Pyrénées |
| Iraty | — | Pyrénées |
| Le Chioula | — | Pyrénées |
| Bourg-Saint-Maurice | Paradiski | Alpes du Nord |
| Peisey-Nancroix | Paradiski | Alpes du Nord |
| Landry | Paradiski | Alpes du Nord |
| Plateau des Glières | — | Alpes du Nord |
| Saint-Nicolas-de-Véroce | Evasion Mont-Blanc | Alpes du Nord |
| Corrençon-en-Vercors | Villard-de-Lans – Corrençon | Alpes du Nord |
| La Joue du Loup | Le Dévoluy | Alpes du Sud |
| Gap | — | Alpes du Sud |

## Stations de bergfex absentes de SKITRACK

Manques possibles du référentiel. La liste inclut des stations suisses
frontalières que bergfex range sous « France » (Champéry, La Dôle, Torgon) et
des sites qui ne sont pas des stations de ski alpin — elles sont laissées,
signalées plutôt que triées d’office.

- Cauterets
- Chabanon
- Serre-Eyraud
- Camurac
- Champéry
- Laguiole
- Laye
- Dolleren
- Font d'Urle
- Lélex - Crozet
- Monts d'Olmes
- Abriès en Queyras
- Saint Colomban des Villards
- Passy Plaine-Joux
- Mijoux - La Faucille
- Aillons-Margériaz
- Cordon
- Saint-Léger-les-Mélèzes
- Réallon
- Pelvoux / Vallouise
- La Bresse Hohneck
- Col de Rousset
- Bernex
- Albiez Montrond
- Formiguères
- Roc d'Enfer
- Mijanès - Donezan
- Grands Montets / Argentière
- Terre Ronde
- Gréolières
- Balme
- Luchon
- Le Planolet
- Le Markstein
- Turini
- GresseEnVercors
- ChastreixSancy
- La Colmiane
- Ceillac
- Molines
- Crévoux
- Le Collet
- Roubion
- Sainte-Anne
- Peisey Vallandry
- Les 2 Alpes
- La Dôle
- Le Semnoz
- Chaillol 1600
- Torgon
- Les Planards
- Le Désert
- Col de Porte
- Les Égaux
- Romme
- Grand-Ballon
- Le Salève
- Bleymard
- Le Reposoir
- Croix de Bauzon
- Les Fourgs
- Lajoux
- La Bonade
- Goulier
- Gaschney 360°
- Les Chosalets
- Saint-Nizier
- Le Poli
- La Poya
- Brameloup
- La Grave
- Brabant
- Cauterets-E
- La Schlucht
- St Hilaire
- Les Bagenelles
- Lus-La-Jarjatte
- ND de Bellecombe
- Larcenaire
- Tourchet
- Le Frenz
- Morbier - Les Gentianes
- La Combe Saint-Pierre
- Champ Du Feu
- Les Moussières
- Sappey-en-Chartreuse
- La Quillane
- Chaux Neuve
- Plateau de Beille
- Barioz - Crêt du Poulet
- Snowworld Amnéville
- Bourg d'Oueil
- Les Bottières - Les Sybelles
- Les Coulmes
- Schnepfenried
- Saint-Urcize
- Le Chazelet
- Les Signaraux
- Gérardmer / La Mauselaine
- Col d'Ornon
- Lispach - La Bresse
- Ballon d'Alsace
- Col de Marcieu
- Mézenc - Les Estables
- Mouthe
- Granier
- Capanelle Ghisoni
- Longchaumois - Rosset
- Névache
- La Pesse
- La Vormaine
- EntreLesFourgs
- Menthières
- Les Rafforts
- La Stass'
- Grand Valtin
- Les Truches
- Le Manon
- Cernay Blanche
- Rouge Gazon
- Chalmazel
- Loge des Gardes
- Le Tanet
- Ristolas

## Rapprochements approximatifs

Rapprochés par un segment de nom, pas par égalité. À relire : un segment
commun ne prouve pas qu’il s’agit du même lieu.

| SKITRACK | bergfex |
| --- | --- |
| Avoriaz | Avoriaz 1800 |
| Saint-Lary-Soulan | Saint-Lary |
| Les Gets | Les Gets / Portes du Soleil |
| La Rosière | La Rosière - Espace San Bernardo |
| Sainte-Foy-Tarentaise | Sainte Foy |
| Villard-de-Lans | Villard de Lans - Corrençon |
| Super-Dévoluy | Le Dévoluy |
| Puy-Saint-Vincent | Puy St Vincent |
| Montchavin | Mont Serein - Mont Ventoux |
| Crest-Voland Cohennoz | Crest-Voland |
| Saint-François-Longchamp | St François Long |
| Saint-Sorlin-d'Arves | Saint Sorlin |
| Saint-Jean-d'Arves | Saint Jean d'Arves - Les Sybelles |
| Alpe du Grand Serre | Grand Serre |
| Sixt-Fer-à-Cheval | Ancelle |
| Praz-de-Lys | Praz Lys Sommand |
| Vallorcine | Val Thorens |
| Superbagnères | Super Besse |
| Barèges | Planche B Filles |
| La Pierre Saint-Martin | Pierre St-Martin |
| Val d'Azun | Valloire |
| Gavarnie-Gèdre | Gavarnie |
| Espace Cambre d'Aze | Cambre d'Aze |
| Saint-Martin-de-Belleville | St. Martin Belle |
| Savoie Grand Revard | Le Revard |
| Flumet | Flumet / Saint Nicolas la Chapelle |
| Hauteluce | Haut Asco |
| Barcelonnette | Planche B Filles |
| Beuil | Beuil Launes |
| Le Haut Pilat | Hautacam |
