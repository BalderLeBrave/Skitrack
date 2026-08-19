# Couverture stations → domaines

*Généré par `npm run areas:audit` — ne pas éditer à la main.*
*Source : le catalogue France Montagnes — `docs/sources/stations-ski-france-montagnes.xlsx`,*
*285 lignes, converti en `data/franceMontagnesStations.ts`. Forfaits, saisonnalité et*
*glaciers viennent du référentiel livré, posés par `data/catalogue.ts`.*

## Chiffres

| | |
| --- | --- |
| Lignes au classeur | 285 |
| Stations affichées | **283** |
| dont villages-stations | 23 |
| Écartées | 2 |
| Domaines | **151** |
| dont multi-stations | 41 |
| dont mono-station | 110 |
| Domaines sans station | **0** |
| Stations sans coordonnées | 0 |

La couverture est de 100 % par construction : un domaine est un *groupe de
stations*, il ne peut donc pas en être dépourvu. Les domaines mono-station
sont les stations dont le domaine se confond avec elles-mêmes — elles ne sont
pas dupliquées, et le badge de domaine ne s’affiche pas pour elles.

## Provenance

Toutes les stations viennent du **classeur France Montagnes** — aucune n’est
fabriquée. Chaque ligne y porte ses coordonnées, l’altitude de son village
(modèle de terrain RGE ALTI de l’IGN) et son domaine skiable de rattachement,
mesuré sur les tracés OpenSkiMap. Le référentiel livré n’apporte plus que ce
que le classeur ne connaît pas : le tarif du forfait, la saisonnalité, le
glacier et le logo.

Deux tables restent tenues à la main, et rien d’autre :

- `DOMAIN_FIXES` (`data/catalogue.ts`) — les rattachements corrigés ci-dessous ;
- `VILLAGE_ALIASES` (`data/places.ts`) — des **hameaux** (Val Claret, Mottaret,
  Reberty…) qui n’ont pas de ligne au classeur et servent de termes de
  recherche vers leur station, sans devenir des stations eux-mêmes.

### Rattachements corrigés

Le classeur rattache une station au domaine dont les pistes sont les plus
proches de son **village**, ce qui se trompe quand le village est loin de son
propre domaine. Une correction ne peut que déplacer une station vers un autre
domaine du classeur : les chiffres restent ceux du classeur, pris sur le
domaine d’arrivée.

- **Orelle** → Les Trois Vallées — le funitel d'Orelle monte à la Cime Caron et le forfait vendu est celui des 3 Vallées ; le classeur voit les pistes de Galibier-Thabor plus près du village.
- **Auris en Oisans** → Alpe d'Huez Grand Domaine — Auris est un secteur de l'Alpe d'Huez Grand Domaine — c'est ce que déclare le référentiel livré ; le classeur la rattache aux 2 Alpes, dont les pistes passent plus près.
- **Samoens** → Le Grand Massif — Samoëns est une porte du Grand Massif, où le classeur range déjà « Samoëns 1600 » ; le village, en fond de vallée, est rattaché aux Portes du Soleil par proximité.

### Lignes du classeur écartées

- **Chamonix-Mont-Blanc** — doublon du catalogue.
- **Les Monts du Pilat** — domaine inconnu.

## Contrôle sur la liste nominative de l’énoncé

Chaque ligne confronte ce que l’énoncé attendait à ce que le catalogue
contient. **Un manque est écrit, jamais comblé** : un rattachement inventé
coûterait plus cher qu’une lacune connue.

### Les 3 Vallées

14 station(s), point culminant 3223 m.

- Val Thorens — village 2321 m
- Les Menuires — village 1812 m
- Reberty — village 1798 m
- Courchevel — village 1779 m
- Méribel-Mottaret — village 1717 m
- Courchevel Moriond 1650 — village 1568 m
- Courchevel Village 1550 — village 1489 m
- Méribel — village 1435 m
- Méribel Village — village 1413 m
- La Tania — village 1375 m
- Saint-Martin-de-Belleville — village 1349 m
- Courchevel Le Praz — village 1256 m
- Orelle — village 988 m
- Brides-les-Bains — village 662 m

### Paradiski

19 station(s), point culminant 3216 m.

- Arc 2000 — village 2145 m
- Aime 2000 — village 2101 m
- Plagne Villages — village 2097 m
- Belle Plagne — village 2068 m
- Plagne Soleil — village 2062 m
- Arc 1950 — village 2040 m
- La Plagne — village 1966 m
- Plagne Centre — village 1964 m
- Plagne Bellecôte — village 1925 m
- Plagne 1800 — village 1914 m
- Les Arcs Bourg St Maurice — village 1738 m
- Arc 1800 — village 1727 m
- Arc 1600 — village 1671 m
- Les Coches — village 1392 m
- La Plagne Montalbert — village 1357 m
- Villaroger — village 1314 m
- Peisey-Vallandry — village 1239 m
- Champagny-en-Vanoise — village 1217 m
- Montchavin La Plagne — village 1173 m

### Espace Killy

8 station(s), point culminant 3456 m.

- Tignes — village 2171 m
- Tignes Val Claret — village 2118 m
- Tignes Le Lac — village 2090 m
- Le Fornet — village 1932 m
- Val d’Isère — village 1829 m
- Tignes Les Boisses — village 1797 m
- La Daille — village 1795 m
- Tignes Les Brévières — village 1566 m

### Les Sybelles

6 station(s), point culminant 2588 m.

- La Toussuire — village 1692 m
- Le Corbier — village 1563 m
- Saint-Jean-d’Arves — village 1513 m
- Saint-Sorlin-d’Arves — village 1499 m
- Les Bottières — village 1279 m
- Saint-Pancrace les Bottières — village 1249 m

> ⚠ Attendu par l’énoncé, absent de ce domaine. Où se trouvent ces stations :
>
> - **Saint-Colomban-des-Villards** → domaine non nommé (OpenStreetMap)

### Les Portes du Mont-Blanc

3 station(s), point culminant 1925 m.

- Cordon — village 1129 m
- La Giettaz — village 1112 m
- Combloux — village 976 m

> ⚠ Attendu par l’énoncé, absent de ce domaine. Où se trouvent ces stations :
>
> - **Megève Le Jaillet** → *absent du catalogue*

### Portes du Soleil

8 station(s), point culminant 2230 m.

- Avoriaz 1800 — village 1351 m
- Les Gets — village 1234 m
- Châtel — village 1157 m
- Montriond — village 1070 m
- Abondance — village 1050 m
- Morzine — village 1049 m
- Chapelle d'Abondance — village 1013 m
- Espace Roc d'Enfer — village 799 m

> ⚠ Attendu par l’énoncé, absent de ce domaine. Où se trouvent ces stations :
>
> - **Saint-Jean-d'Aulps** → *absent du catalogue*

### Alpe d'Huez Grand Domaine

5 station(s), point culminant 3314 m.

- Alpe d'Huez — village 1807 m
- Villard-Reculas — village 1501 m
- Oz 3300 — village 1336 m
- Vaujany — village 1207 m
- Auris-en-Oisans — village 945 m

> ⚠ Attendu par l’énoncé, absent de ce domaine. Où se trouvent ces stations :
>
> - **Oz-en-Oisans** → Alpe d'Huez Grand Domaine

### Le Grand Massif

7 station(s), point culminant 2485 m.

- Samoëns 1600 — village 1623 m
- Flaine — village 1140 m
- Samoëns — village 1103 m
- Les Carroz d’Arâches — village 1030 m
- Morillon — village 878 m
- Haut Giffre — village 815 m
- Sixt — village 762 m

### Serre Chevalier

4 station(s), point culminant 2769 m.

- Serre Chevalier Le Monêtier — village 1481 m
- Serre Chevalier Briancon — village 1413 m
- Serre Chevalier Villeneuve — village 1396 m
- Serre Chevalier Chantemerle — village 1356 m

### Evasion Mont-Blanc

6 station(s), point culminant 2444 m.

- Le Bettex — village 1395 m
- Hauteluce Val Joly — village 1324 m
- Les Contamines-Montjoie — village 1175 m
- Megève — village 1101 m
- Saint-Nicolas-de-Véroce — village 896 m
- Saint-Gervais Mont-Blanc — village 808 m

> ⚠ Attendu par l’énoncé, absent de ce domaine. Où se trouvent ces stations :
>
> - **Combloux** → Les Portes du Mont-Blanc

### Espace Diamant

6 station(s), point culminant 2054 m.

- Les Saisies — village 1601 m
- Bisanne 1500 — village 1506 m
- Crest-Voland Cohennoz — village 1226 m
- Notre-Dame-de-Bellecombe — village 1086 m
- Praz-sur-Arly — village 1004 m
- Flumet - Saint Nicolas La Chapelle — village 919 m

### Le Grand Domaine

2 station(s), point culminant 2516 m.

- Valmorel — village 1488 m
- Saint-François-Longchamp — village 1412 m

## Tous les domaines multi-stations

| Domaine | Stations | Sommet | Massif |
| --- | --- | ---: | --- |
| Paradiski | Arc 2000, Aime 2000, Plagne Villages, Belle Plagne, Plagne Soleil, Arc 1950, La Plagne, Plagne Centre, Plagne Bellecôte, Plagne 1800, Les Arcs Bourg St Maurice, Arc 1800, Arc 1600, Les Coches, La Plagne Montalbert, Villaroger, Peisey-Vallandry, Champagny-en-Vanoise, Montchavin La Plagne | 3216 m | Alpes du Nord |
| Les 3 Vallées | Val Thorens, Les Menuires, Reberty, Courchevel, Méribel-Mottaret, Courchevel Moriond 1650, Courchevel Village 1550, Méribel, Méribel Village, La Tania, Saint-Martin-de-Belleville, Courchevel Le Praz, Orelle, Brides-les-Bains | 3223 m | Alpes du Nord |
| Haute Maurienne Vanoise | Lanslebourg, Bonneval-sur-Arc, Bessans, Lanslevillard, Valfréjus, Aussois, La Norma, Val Cenis, Termignon | 2952 m | Alpes du Nord |
| Espace Killy | Tignes, Tignes Val Claret, Tignes Le Lac, Le Fornet, Val d’Isère, Tignes Les Boisses, La Daille, Tignes Les Brévières | 3456 m | Alpes du Nord |
| Portes du Soleil | Avoriaz 1800, Les Gets, Châtel, Montriond, Abondance, Morzine, Chapelle d'Abondance, Espace Roc d'Enfer | 2230 m | Alpes du Nord |
| Le Grand Massif | Samoëns 1600, Flaine, Samoëns, Les Carroz d’Arâches, Morillon, Haut Giffre, Sixt | 2485 m | Alpes du Nord |
| Espace Diamant | Les Saisies, Bisanne 1500, Crest-Voland Cohennoz, Notre-Dame-de-Bellecombe, Praz-sur-Arly, Flumet - Saint Nicolas La Chapelle | 2054 m | Alpes du Nord |
| Evasion Mont-Blanc | Le Bettex, Hauteluce Val Joly, Les Contamines-Montjoie, Megève, Saint-Nicolas-de-Véroce, Saint-Gervais Mont-Blanc | 2444 m | Alpes du Nord |
| Les Sybelles | La Toussuire, Le Corbier, Saint-Jean-d’Arves, Saint-Sorlin-d’Arves, Les Bottières, Saint-Pancrace les Bottières | 2588 m | Alpes du Nord |
| Alpe d'Huez Grand Domaine | Alpe d'Huez, Villard-Reculas, Oz 3300, Vaujany, Auris-en-Oisans | 3314 m | Alpes du Nord |
| Espace Lumière | Val d'Allos, La Foux d'Allos, Pra Loup 1600, Pra Loup 1500 | 2592 m | Alpes du Sud |
| La Forêt Blanche | Risoul, Vars, Les Claux, Vars Sainte-Marie | 2728 m | Alpes du Sud |
| Les 7 Laux | Pipay, Le Pleynet, Les 7 Laux, Prapoutel | 2373 m | Alpes du Nord |
| Serre Chevalier | Serre Chevalier Le Monêtier, Serre Chevalier Briancon, Serre Chevalier Villeneuve, Serre Chevalier Chantemerle | 2769 m | Alpes du Sud |
| Chamrousse | Chamrousse, Chamrousse 1750, Chamrousse 1650 | 2246 m | Alpes du Nord |
| domaine non nommé (OpenStreetMap) | Plateau de Beille, Névache, Saint-Colomban-des-Villards | 1232 m | Alpes du Nord |
| Grand Tourmalet | Grand Tourmalet, La Mongie, Barèges | 2464 m | Pyrénées |
| Hirmentaz - Les Habères | Hirmentaz, Habère-Poche, Mégevette | 1604 m | Alpes du Nord |
| La Clusaz | Manigod/Col de Merdassier, La Clusaz, Plateau de Beauregard | 2476 m | Alpes du Nord |
| Le Dévoluy | Le Dévoluy, Super-Dévoluy, La Joue du Loup | 2496 m | Alpes du Sud |
| Le Grand-Bornand | Le Chinaillon, Le Grand-Bornand, Orange | 2028 m | Alpes du Nord |
| Le Sancy | Besse Super Besse, Le Mont-Dore, La Bourboule | 1834 m | Massif Central |
| Le Sauze 1400 / Le Super-Sauze 1700 | Super Sauze, Pra-Loup, Sauze Supersauze | 2438 m | Alpes du Sud |
| Les Orres | Les Orres 1800, Les Orres 1650, Les Orres | 2702 m | Alpes du Sud |
| Les Portes du Mont-Blanc | Cordon, La Giettaz, Combloux | 1925 m | Alpes du Nord |
| Mont Blanc Unlimited | Le Tour, Vallorcine, Les Houches | 2255 m | Alpes du Nord |
| Puy-Saint-Vincent | Puy-Saint-Vincent 1800, Puy-Saint-Vincent 1600, Puy-Saint-Vincent | 2666 m | Alpes du Sud |
| Saint-Lary | Saint-Lary Pla d'Adet, Espiaube, Saint-Lary-Soulan | 2475 m | Pyrénées |
| Saint-Pierre-de-Chartreuse | Le Granier, Saint Hugues - Les Egaux, Le Planolet | 1746 m | Alpes du Nord |
| Ax 3 Domaines | Ax 3 Domaines, Le Chioula | 2345 m | Pyrénées |
| Chaillol, Chalhòl | Saint-Michel-de-Chaillol, Laye en Champsaur | 1932 m | Alpes du Sud |
| Font-Romeu Pyrénées 2000, Font-Romeu | Font-Romeu, Bolquere Pyrenees 2000 | 2215 m | Pyrénées |
| Galibier Thabor | Valmeinier, Valloire | 2741 m | Alpes du Nord |
| Gérardmer | Lispach - La Bresse, Gérardmer | 1138 m | Vosges |
| Laguiole | Laguiole, Espace Aubrac | 1399 m | Massif Central |
| Le Collet d'Allevard | Le Collet, Le Barioz Alpin | 2086 m | Alpes du Nord |
| Le Grand Domaine | Valmorel, Saint-François-Longchamp | 2516 m | Alpes du Nord |
| Les Fourgs | Les Fourgs, Le Larmont | 1224 m | Jura |
| Les Rousses | Les Rousses, Bellefontaine | 1423 m | Jura |
| Queyras - Arvieux | Arvieux, Le Queyras | 2106 m | Alpes du Sud |
| Sainte-Foy Tarentaise | Sainte-Foy-Tarentaise, Sainte-Foy Station | 2624 m | Alpes du Nord |

## Dette connue

- **0 stations sans coordonnées** : elles sortent de la carte, du tri
  par distance et du calcul de trajet tant que `data/domainGeo.ts` ne les a pas
  géocodées. Liste :


- **5 écart(s)** entre la liste nominative de l’énoncé et le catalogue,
  détaillés ci-dessus. Ils ne sont pas comblés : le classeur fait foi, et un
  rattachement incertain serait pire qu’un manque signalé.
