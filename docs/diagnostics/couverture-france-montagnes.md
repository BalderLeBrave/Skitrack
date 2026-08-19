# Couverture du catalogue France Montagnes

*Généré par `npm run refs:audit` — ne pas éditer à la main.*
*Relevé du site : `data/franceMontagnes.ts`, 18 août 2026,*
*https://www.france-montagnes.com/les-stations-de-ski/ — 232 stations distinctes.*
*Classeur : `docs/sources/stations-ski-france-montagnes.xlsx`, converti en*
*`data/franceMontagnesStations.ts` — 285 lignes.*

## Chiffres

| | |
| --- | --- |
| Stations publiées par le site | 232 |
| Lignes du classeur | 285 |
| Publiées et absentes du classeur | **8** |
| Ajoutées par le classeur | 31 |
| **Stations affichées par l’application** | **283** |
| Domaines skiables formés | 151 |
| Tarif de forfait relevé | 176 |
| Tarif estimé, faute de relevé | 107 |

Le rapport de force a changé : le référentiel livré décrivait 115 des
232 stations publiées, le classeur en décrit 224.
Les altitudes, les kilomètres et les positions viennent de lui ; le
référentiel n’apporte plus que les tarifs, la saisonnalité et les glaciers.

## Les 8 stations publiées que le classeur ne décrit pas

Le relevé du site date du 18 août 2026 ; le classeur, plus récent, écarte ce
qui ne skie plus. Sa feuille « Paramètres » documente les fermetures — La
Sambuy (2023, démantelée en 2025), Le Grand Puy (2024), Puigmal (liquidé fin
2023), Chalmazel (fermée l’hiver 2025-2026) — et les stations sans piste
alpine cartographiée à moins de 15 km, dont Valdrôme et Soleilhas-Vauplane.
Saint-Pierre-de-Chartreuse, elle, est bien au classeur, sous les noms de ses
secteurs (Le Granier, Le Planolet, Saint-Hugues-les-Égaux).

Aucune n’est affichée, et toutes sont nommées ici.

- Puigmal
- Chalmazel
- Le Grand Puy
- Valdrôme
- Saint-Pierre de Chartreuse
- La Sambuy Pays de Faverges
- Soleilhas - Vauplane
- Le Tanet

## Les 31 lignes que le classeur ajoute

Villages-stations des grands domaines (Arc 1600, Belle Plagne, Val Claret…),
graphies différentes du relevé, et stations que le site nomme autrement. Une
ligne de type « village-station » reste une station de la liste : c’est un
endroit où l’on dort et d’où l’on skie.

- Aime 2000 — Paradiski (Les Arcs – La Plagne)
- Arc 1600 — Paradiski (Les Arcs – La Plagne)
- Arc 1800 — Paradiski (Les Arcs – La Plagne)
- Arc 1950 — Paradiski (Les Arcs – La Plagne)
- Arc 2000 — Paradiski (Les Arcs – La Plagne)
- Bisanne 1500 *(village-station)* — Espace Diamant
- La Daille — Tignes - Val d'Isère
- La Tania — Les Trois Vallées
- Le Bettex *(village-station)* — Megève
- Le Chinaillon — Le Grand-Bornand
- Le Fornet — Tignes - Val d'Isère
- Le Pleynet *(village-station)* — Les 7 Laux
- Les Coches — Paradiski (Les Arcs – La Plagne)
- Pipay *(village-station)* — Les 7 Laux
- Prapoutel *(village-station)* — Les 7 Laux
- Reberty *(village-station)* — Les Trois Vallées
- Sainte-Foy Station *(village-station)* — Sainte-Foy Tarentaise
- Termignon — Espace Haute Maurienne Vanoise
- La Foux d'Allos — Espace Lumière
- La Joue du Loup — Dévoluy
- Le Seignus — Val d'Allos - Le Seignus
- Les Claux *(village-station)* — Forêt Blanche : Vars/Risoul
- Pra Loup 1500 *(village-station)* — Espace Lumière
- Pra Loup 1600 *(village-station)* — Espace Lumière
- Serre Chevalier Chantemerle — Serre-Chevalier
- Serre Chevalier Le Monêtier — Serre-Chevalier
- Serre Chevalier Villeneuve — Serre-Chevalier
- Barèges — Grand Tourmalet
- Espiaube *(village-station)* — Saint-Lary
- La Mongie — Grand Tourmalet
- Saint-Lary Pla d'Adet — Saint-Lary

## Lignes écartées de la liste

- **Chamonix-Mont-Blanc** — doublon du catalogue.
- **Les Monts du Pilat** — domaine inconnu.

## Les 107 stations dont le tarif de forfait n’est pas relevé

Le référentiel livré porte les tarifs relevés à la main sur les sites
officiels, domaine par domaine. Une station dont le domaine n’y figure pas
affiche un tarif **estimé**, marqué comme tel partout où il s’affiche, et qui
n’entre pas dans le score. Ce sont presque toutes de petites stations que le
référentiel n’a jamais décrites.

- Aillons-Margeriaz — Aillon-Margériaz
- Albiez-Montrond — Albiez-Montrond
- Argentière — Les Grands Montets
- Autrans Méaudres en Vercors — Domaine Autrans - Méaudre
- Bernex — Bernex
- Chamonix-Mont-Blanc — Brévent/Flégère (Chamonix)
- Col d'Ornon — Domaine Alpin du Col d'Ornon
- Col de l'Arzelier — Col de l'Arzelier
- Col du Rousset — Station du Col de Rousset
- Cordon — Les Portes du Mont-Blanc
- Fond d'Urle — Font d'Urle Chaud Clapier
- Gresse-en-Vercors — Gresse en Vercors
- Habère-Poche — Hirmentaz - Les Habères
- Hirmentaz — Hirmentaz - Les Habères
- La Motte-d'Aveillans — Les Signaraux
- Le Barioz Alpin — Le Collet d'Allevard
- Le Col De Marcieu - Chartreuse — Col de Marcieu
- Le Collet — Le Collet d'Allevard
- Le Granier — Saint-Pierre-de-Chartreuse
- Le Planolet — Saint-Pierre-de-Chartreuse
- Le Reposoir — Le Reposoir
- Le Semnoz — Le Semnoz
- Lullin — Stade de neige du Col du Feu
- Lus-la-Croix-Haute — Lus la Jarjatte
- Mégevette — Hirmentaz - Les Habères
- Mont-Saxonnex — Mont Saxonnex
- Montmin — Montmin - Col de la Forclaz
- Nancy-sur-Cluses — Romme
- Passy Plaine Joux — Passy - Plaine Joux
- Pralognan-la-Vanoise — Pralognan-la-Vanoise
- Saint-Colomban-des-Villards — domaine non nommé (OpenStreetMap)
- Saint Hugues - Les Egaux — Saint-Pierre-de-Chartreuse
- Saint-Hilaire du touvet — Saint-Hilaire-du-Touvet
- Abriès Aiguilles & Ristolas — Queyras - Haut-Guil (Abriès)
- Ancelle Village Station — Ancelle
- Arvieux — Queyras - Arvieux
- Audibergue — L'Audibergue
- Ceillac en Queyras — Queyras - Ceillac
- Chabanon — Chabanon
- Crévoux — Crévoux
- Greolieres Les Neiges — Gréolières-Les-Neiges
- La Colmiane — La Colmiane
- La Grave — Le Chazelet
- Laye en Champsaur — Chaillol, Chalhòl
- Le Queyras — Queyras - Arvieux
- Molines Saint-Véran en Queyras — Queyras - Molines/Saint-Véran
- Mont Serein / Ventoux Sud — Mont Serein
- Montagne de Lure — Montagne de Lure
- Montclar — Montclar
- Névache — domaine non nommé (OpenStreetMap)
- Orcieres Merlette — Orcières Merlette
- Pelvoux Vallouise — Pelvoux-Vallouise
- Pra-Loup — Le Sauze 1400 / Le Super-Sauze 1700
- Roubion les Buisses — Roubion-Les-Buisses
- Réallon — Réallon
- Saint-Michel-de-Chaillol — Chaillol, Chalhòl
- Saint-Léger-les-Mélèzes — Domaine Skiable Saint-Léger-Les-Mélèzes
- Serre-Eyraud — Serre Eyraud
- Seyne les Alpes — Le Grand Puy
- Super Sauze — Le Sauze 1400 / Le Super-Sauze 1700
- Chaux de Gilley — La Cernay Blanche
- Hauteville - Lompnes — Terre Ronde
- La Combe Saint-Pierre — La Combe Saint-Pierre
- Le Larmont — Les Fourgs
- Les Fourgs — Les Fourgs
- Plateau de Retord — Plateau de Retord
- Val de Morteau — Site du Meix Musy
- Chastreix-Sancy — Chastreix-Sancy
- Croix de Bauzon — La Croix de Bauzon
- Espace Aubrac — Laguiole
- La Loge des Gardes — La Loge des Gardes
- Laguiole — Laguiole
- Le Bleymard Mont Lozère — Station de ski Bleymard Mont Lozère
- Les Estables — Les Estables
- Prat Peyrot / Mont Aigoual — Prat-Peyrot
- Saint-Anthème - Praboure — Prabouré
- Artouste — Artouste
- Ascou-Pailheres — Ascou
- Bolquere Pyrenees 2000 — Font-Romeu Pyrénées 2000, Font-Romeu
- Camurac — Camurac
- Espiaube — Saint-Lary
- Font-Romeu — Font-Romeu Pyrénées 2000, Font-Romeu
- Formiguères — Formiguères
- Goulier Neige — Goulier-Neige
- Hautacam — Hautacam
- Le Somport / Candanchu — Candanchu
- Les Monts d'Olmes — Les Monts d'Olmes
- Mijanes - Donezan — Mijanès-Donezan
- Plateau de Beille — domaine non nommé (OpenStreetMap)
- Puyvalador Rieutort — Puyvalador Rieutort
- Saint-Lary Pla d'Adet — Saint-Lary
- Val Louron — Val-Louron
- Champ Du Feu — Le Champ du Feu
- Gérardmer — Gérardmer
- La Bresse Brabant — La Bresse Brabant
- La Bresse Hohneck — La Bresse - Hohneck
- La Schlucht — La Schlucht
- Le Ballon d'Alsace — Ballon d'Alsace
- Le Frenz — Thanner Hubel
- Le Markstein — Le Markstein
- Le Schlumpf — Le Schlumpf
- Lispach - La Bresse — Gérardmer
- Saint-Maurice-sur-Moselle — Saint-Maurice-sur-Moselle
- Schnepfenried — Station de ski du Schnepfenried
- Ventron — Ventron
- Xonrupt-Longemer — La Bresse - Lispach
- la Planche des Belles Filles — La Planche-des-Belles-Filles

## Stations retenues, par domaine skiable

| Domaine | Stations |
| --- | --- |
| Paradiski | Arc 2000, Aime 2000, Plagne Villages, Belle Plagne, Plagne Soleil, Arc 1950, La Plagne, Plagne Centre, Plagne Bellecôte, Plagne 1800, Les Arcs Bourg St Maurice, Arc 1800, Arc 1600, Les Coches, La Plagne Montalbert, Villaroger, Peisey-Vallandry, Champagny-en-Vanoise, Montchavin La Plagne |
| Les 3 Vallées | Val Thorens, Les Menuires, Reberty, Courchevel, Méribel-Mottaret, Courchevel Moriond 1650, Courchevel Village 1550, Méribel, Méribel Village, La Tania, Saint-Martin-de-Belleville, Courchevel Le Praz, Orelle, Brides-les-Bains |
| Haute Maurienne Vanoise | Lanslebourg, Bonneval-sur-Arc, Bessans, Lanslevillard, Valfréjus, Aussois, La Norma, Val Cenis, Termignon |
| Espace Killy | Tignes, Tignes Val Claret, Tignes Le Lac, Le Fornet, Val d’Isère, Tignes Les Boisses, La Daille, Tignes – Les Brévières |
| Portes du Soleil | Avoriaz 1800, Les Gets, Châtel, Montriond, Abondance, Morzine, Chapelle d'Abondance, Espace Roc d'Enfer |
| Le Grand Massif | Samoëns 1600, Flaine, Samoëns, Les Carroz d’Arâches, Morillon, Haut Giffre, Sixt |
| Espace Diamant | Les Saisies, Bisanne 1500, Crest-Voland Cohennoz, Notre-Dame-de-Bellecombe, Praz-sur-Arly, Flumet - Saint Nicolas La Chapelle |
| Evasion Mont-Blanc | Le Bettex, Hauteluce Val Joly, Les Contamines-Montjoie, Megève, Saint-Nicolas-de-Véroce, Saint-Gervais Mont-Blanc |
| Les Sybelles | La Toussuire, Le Corbier, Saint-Jean-d’Arves, Saint-Sorlin-d’Arves, Les Bottières, Saint-Pancrace les Bottières |
| Alpe d'Huez Grand Domaine | Alpe d'Huez, Villard-Reculas, Oz 3300, Vaujany, Auris-en-Oisans |
| Espace Lumière | Val d'Allos, La Foux d'Allos, Pra Loup 1600, Pra Loup 1500 |
| La Forêt Blanche | Risoul, Vars, Les Claux, Vars Sainte-Marie |
| Les 7 Laux | Pipay, Le Pleynet, Les 7 Laux, Prapoutel |
| Serre Chevalier | Serre Chevalier Le Monêtier, Serre Chevalier Briancon, Serre Chevalier Villeneuve, Serre Chevalier Chantemerle |
| Chamrousse | Chamrousse, Chamrousse 1750, Chamrousse 1650 |
| domaine non nommé (OpenStreetMap) | Plateau de Beille, Névache, Saint-Colomban-des-Villards |
| Grand Tourmalet | Grand Tourmalet, La Mongie, Barèges |
| Hirmentaz - Les Habères | Hirmentaz, Habère-Poche, Mégevette |
| La Clusaz | Manigod/Col de Merdassier, La Clusaz, Plateau de Beauregard |
| Le Dévoluy | Le Dévoluy, Super-Dévoluy, La Joue du Loup |
| Le Grand-Bornand | Le Chinaillon, Le Grand-Bornand, Orange |
| Le Sancy | Besse – Super Besse, Le Mont-Dore, La Bourboule |
| Le Sauze 1400 / Le Super-Sauze 1700 | Super Sauze, Pra-Loup, Sauze Supersauze |
| Les Orres | Les Orres 1800, Les Orres 1650, Les Orres |
| Les Portes du Mont-Blanc | Cordon, La Giettaz, Combloux |
| Mont Blanc Unlimited | Le Tour, Vallorcine, Les Houches |
| Puy-Saint-Vincent | Puy-Saint-Vincent 1800, Puy-Saint-Vincent 1600, Puy-Saint-Vincent |
| Saint-Lary | Saint-Lary Pla d'Adet, Espiaube, Saint-Lary-Soulan |
| Saint-Pierre-de-Chartreuse | Le Granier, Saint Hugues - Les Egaux, Le Planolet |
| Ax 3 Domaines | Ax 3 Domaines, Le Chioula |
| Chaillol, Chalhòl | Saint-Michel-de-Chaillol, Laye en Champsaur |
| Font-Romeu Pyrénées 2000, Font-Romeu | Font-Romeu, Bolquere Pyrenees 2000 |
| Galibier Thabor | Valmeinier, Valloire |
| Gérardmer | Lispach - La Bresse, Gérardmer |
| Laguiole | Laguiole, Espace Aubrac |
| Le Collet d'Allevard | Le Collet, Le Barioz Alpin |
| Le Grand Domaine | Valmorel, Saint-François-Longchamp |
| Les Fourgs | Les Fourgs, Le Larmont |
| Les Rousses | Les Rousses, Bellefontaine |
| Queyras - Arvieux | Arvieux, Le Queyras |
| Sainte-Foy Tarentaise | Sainte-Foy-Tarentaise, Sainte-Foy Station |

Et 110 stations dont le domaine se confond avec elles-mêmes.

## Note sur le moteur local

Le moteur local ne fournit plus la liste : il l’**enrichit**. Sa base
OpenSkiMap (`npm run sidecar:stats`) apporte les sites officiels et les pages
de réservation que le classeur n’a pas retenus, et les glaciers qu’elle
déclare. Démarrer le moteur ne change donc ni le nombre de stations, ni leurs
altitudes, ni leur rattachement — c’est le point de ce rangement.
