# Couverture stations → domaines

*Généré par `npm run areas:audit` — ne pas éditer à la main.*
*Source : référentiel livré (`src/renderer/src/data/referentiel.json`), 173 entrées.*

## Chiffres

| | |
| --- | --- |
| Stations | **173** |
| Domaines | **78** |
| dont multi-stations | 32 |
| dont mono-station | 46 |
| Domaines sans station | **0** |
| Stations sans coordonnées | 63 |

La couverture est de 100 % par construction : un domaine est un *groupe de
stations*, il ne peut donc pas en être dépourvu. Les domaines mono-station
sont les stations dont le domaine se confond avec elles-mêmes — elles ne sont
pas dupliquées, et le badge de domaine ne s’affiche pas pour elles.

## Provenance

Toutes les stations viennent du **référentiel** — aucune n’est fabriquée. Le
champ `pass` (forfait relié) fournit le rattachement au domaine ; à défaut, la
station forme son propre domaine. Aucune table manuelle de stations n’a été
nécessaire : le diagnostic a montré qu’elles y étaient déjà. La seule table
tenue à la main reste `VILLAGE_ALIASES` dans `data/places.ts` — des **hameaux**
(Val Claret, Mottaret, Reberty…) qui n’ont pas d’entrée propre et servent de
termes de recherche vers leur station, sans devenir des stations eux-mêmes.

## Contrôle sur la liste nominative de l’énoncé

Chaque ligne confronte ce que l’énoncé attendait à ce que le référentiel
contient. **Un manque est écrit, jamais comblé** : un rattachement inventé
coûterait plus cher qu’une lacune connue.

### Les 3 Vallées

10 station(s), point culminant 3230 m.

- Val Thorens *(sans coordonnées)* — village 2300 m
- Val Thorens – Orelle — village 2300 m
- Courchevel — village 1850 m
- Les Menuires – Saint-Martin — village 1850 m
- Orelle — village 1800 m
- Méribel-Mottaret *(sans coordonnées)* — village 1750 m
- Méribel — village 1450 m
- Saint-Martin-de-Belleville *(sans coordonnées)* — village 1450 m
- Courchevel 1550 – Le Praz — village 1300 m
- Brides-les-Bains — village 1260 m

### Paradiski

10 station(s), point culminant 3250 m.

- La Plagne — village 1970 m
- Plagne Bellecôte *(sans coordonnées)* — village 1930 m
- Les Arcs – Peisey-Vallandry — village 1800 m
- Aime 2000 *(sans coordonnées)* — village 1600 m
- Peisey-Nancroix *(sans coordonnées)* — village 1350 m
- Champagny-en-Vanoise — village 1250 m
- Montchavin – Les Coches — village 1250 m
- Bourg-Saint-Maurice – Les Arcs *(sans coordonnées)* — village 1200 m
- Landry *(sans coordonnées)* — village 1200 m
- Villaroger — village 1200 m

### Espace Killy

4 station(s), point culminant 3456 m.

- Tignes – Val d'Isère — village 2100 m
- Tignes Le Lac *(sans coordonnées)* — village 2100 m
- Val d’Isère *(sans coordonnées)* — village 1785 m
- Tignes – Les Brévières — village 1550 m

### Les Sybelles

4 station(s), point culminant 2620 m.

- La Toussuire – Les Sybelles — village 1800 m
- Le Corbier – Les Sybelles — village 1550 m
- Saint-Jean-d’Arves — village 1550 m
- Saint-Sorlin-d’Arves — village 1550 m

> ⚠ Attendu par l’énoncé, absent de ce domaine. Où se trouvent ces stations :
>
> - **Les Bottières** → *absent du référentiel*
> - **Saint-Colomban-des-Villards** → *absent du référentiel*

### Les Portes du Mont-Blanc

> ⚠ **Absent du référentiel.** Aucun domaine ne porte ce nom. Les stations
> citées existent, mais rattachées ailleurs :

> - Combloux → Evasion Mont-Blanc
> - Megève Le Jaillet → *introuvable*
> - La Giettaz → Evasion Mont-Blanc, Espace Diamant
> - Cordon → *introuvable*

### Portes du Soleil

6 station(s), point culminant 2466 m.

- Avoriaz 1800 — village 1800 m
- Châtel — village 1200 m
- Les Gets – Morzine — village 1172 m
- Abondance — village 1000 m
- La Chapelle-d’Abondance *(sans coordonnées)* — village 1000 m
- Morzine – Avoriaz — village 1000 m

> ⚠ Attendu par l’énoncé, absent de ce domaine. Où se trouvent ces stations :
>
> - **Montriond** → *absent du référentiel*
> - **Saint-Jean-d'Aulps** → Saint-Jean-d’Aulps

### Alpe d'Huez Grand Domaine

5 station(s), point culminant 3330 m.

- Alpe d'Huez Grand Domaine — village 1860 m
- Auris-en-Oisans — village 1600 m
- Villard-Reculas — village 1500 m
- Oz-en-Oisans — village 1350 m
- Vaujany — village 1250 m

### Le Grand Massif

5 station(s), point culminant 2480 m.

- Flaine — village 1600 m
- Les Carroz d’Arâches — village 1140 m
- Sixt-Fer-à-Cheval — village 760 m
- Morillon — village 720 m
- Samoëns – Le Grand Massif — village 720 m

### Serre Chevalier

5 station(s), point culminant 2800 m.

- Serre Chevalier – Le Monêtier 1500 *(sans coordonnées)* — village 1500 m
- Serre Chevalier – Villeneuve 1400 *(sans coordonnées)* — village 1400 m
- Serre Chevalier – Chantemerle 1350 *(sans coordonnées)* — village 1350 m
- Serre Chevalier Vallée — village 1350 m
- Serre Chevalier – Briançon 1200 *(sans coordonnées)* — village 1200 m

### Evasion Mont-Blanc

7 station(s), point culminant 2500 m.

- Saint-Nicolas-de-Véroce *(sans coordonnées)* — village 1200 m
- Les Contamines-Montjoie — village 1160 m
- Megève – Evasion Mont-Blanc — village 1113 m
- Megève – Rochebrune *(sans coordonnées)* — village 1113 m
- Combloux — village 980 m
- Combloux – La Princesse *(sans coordonnées)* — village 980 m
- Saint-Gervais – Le Bettex — village 850 m

### Espace Diamant

8 station(s), point culminant 2069 m.

- Les Saisies – Espace Diamant — village 1650 m
- Bisanne 1500 *(sans coordonnées)* — village 1500 m
- Crest-Voland Cohennoz — village 1230 m
- Flumet – Val d’Arly *(sans coordonnées)* — village 1150 m
- Hauteluce *(sans coordonnées)* — village 1150 m
- La Giettaz *(sans coordonnées)* — village 1150 m
- Notre-Dame-de-Bellecombe — village 1150 m
- Praz-sur-Arly — village 1150 m

### Le Grand Domaine

2 station(s), point culminant 2550 m.

- Saint-François-Longchamp — village 1650 m
- Valmorel – Le Grand Domaine — village 1400 m

## Tous les domaines multi-stations

| Domaine | Stations | Sommet | Massif |
| --- | --- | ---: | --- |
| Les 3 Vallées | Val Thorens, Val Thorens – Orelle, Courchevel, Les Menuires – Saint-Martin, Orelle, Méribel-Mottaret, Méribel, Saint-Martin-de-Belleville, Courchevel 1550 – Le Praz, Brides-les-Bains | 3230 m | Alpes du Nord |
| Paradiski | La Plagne, Plagne Bellecôte, Les Arcs – Peisey-Vallandry, Aime 2000, Peisey-Nancroix, Champagny-en-Vanoise, Montchavin – Les Coches, Bourg-Saint-Maurice – Les Arcs, Landry, Villaroger | 3250 m | Alpes du Nord |
| Espace Diamant | Les Saisies – Espace Diamant, Bisanne 1500, Crest-Voland Cohennoz, Flumet – Val d’Arly, Hauteluce, La Giettaz, Notre-Dame-de-Bellecombe, Praz-sur-Arly | 2069 m | Alpes du Nord |
| Evasion Mont-Blanc | Saint-Nicolas-de-Véroce, Les Contamines-Montjoie, Megève – Evasion Mont-Blanc, Megève – Rochebrune, Combloux, Combloux – La Princesse, Saint-Gervais – Le Bettex | 2500 m | Alpes du Nord |
| Portes du Soleil | Avoriaz 1800, Châtel, Les Gets – Morzine, Abondance, La Chapelle-d’Abondance, Morzine – Avoriaz | 2466 m | Alpes du Nord |
| Alpe d'Huez Grand Domaine | Alpe d'Huez Grand Domaine, Auris-en-Oisans, Villard-Reculas, Oz-en-Oisans, Vaujany | 3330 m | Alpes du Nord |
| Haute Maurienne Vanoise | Bonneval-sur-Arc, Bessans, Aussois, Val Cenis – Haute Maurienne, Termignon | 2800 m | Alpes du Nord |
| Le Grand Massif | Flaine, Les Carroz d’Arâches, Sixt-Fer-à-Cheval, Morillon, Samoëns – Le Grand Massif | 2480 m | Alpes du Nord |
| Les Rousses | Bellefontaine, Bois-d’Amont – Les Rousses Nordique, Lamoura, Les Rousses, Prémanon | 1680 m | Jura |
| Mont Blanc Unlimited | Chamonix – Le Tour Balme, Vallorcine, Chamonix – Le Brévent Flégère, Chamonix – Les Grands Montets, Les Houches | 3275 m | Alpes du Nord |
| Serre Chevalier | Serre Chevalier – Le Monêtier 1500, Serre Chevalier – Villeneuve 1400, Serre Chevalier – Chantemerle 1350, Serre Chevalier Vallée, Serre Chevalier – Briançon 1200 | 2800 m | Alpes du Sud |
| Espace Killy | Tignes – Val d'Isère, Tignes Le Lac, Val d’Isère, Tignes – Les Brévières | 3456 m | Alpes du Nord |
| Le Sancy | Super-Besse – Le Sancy, Besse – Super Besse, Le Mont-Dore, Mont-Dore – Chastreix | 1850 m | Massif central |
| Les Sybelles | La Toussuire – Les Sybelles, Le Corbier – Les Sybelles, Saint-Jean-d’Arves, Saint-Sorlin-d’Arves | 2620 m | Alpes du Nord |
| Espace Lumière | Val d’Allos – La Foux, Pra Loup – Val d'Allos, Val d’Allos – Le Seignus | 2600 m | Alpes du Sud |
| Espace San Bernardo | La Rosière – San Bernardo, La Rosière 1850, Séez | 2800 m | Alpes du Nord |
| La Forêt Blanche | Risoul 1850, Vars – Risoul, La Forêt Blanche, Vars Les Claux | 2750 m | Alpes du Sud |
| Le Dévoluy | Le Dévoluy – Superdévoluy, Superdévoluy – La Joue du Loup, La Joue du Loup | 2500 m | Alpes du Sud |
| Les 7 Laux | Le Pleynet, Les 7 Laux, Prapoutel – Les 7 Laux | 2400 m | Alpes du Nord |
| Métabief Mont d'Or | Métabief Mont d'Or, Jougne – Métabief, Rochejean | 1420 m | Jura |
| Monts Jura – Mijoux, Lélex | Mijoux, Monts Jura – Mijoux, Lélex, Lélex – Crozet | 1680 m | Jura |
| Villard-de-Lans – Corrençon | Corrençon-en-Vercors, Villard-de-Lans – Côte 2000, Villard-de-Lans – Corrençon | 2170 m | Alpes du Nord |
| Chamrousse | Chamrousse 1750, Chamrousse | 2250 m | Alpes du Nord |
| Galibier Thabor | Valmeinier, Valloire – Galibier Thabor | 2600 m | Alpes du Nord |
| Grand Tourmalet | Barèges – La Mongie, Grand Tourmalet | 2500 m | Pyrénées |
| La Clusaz | Manigod – La Croix Fry, La Clusaz | 2477 m | Alpes du Nord |
| Le Grand Domaine | Saint-François-Longchamp, Valmorel – Le Grand Domaine | 2550 m | Alpes du Nord |
| Le Lac Blanc | Le Lac Blanc – Orbey, Le Lac Blanc 1200 | 1200 m | Vosges |
| Le Lioran | Le Lioran, Le Lioran – Super Lioran | 1850 m | Massif central |
| Le Sauze – Super Sauze | Le Sauze – Super Sauze, Barcelonnette – Le Sauze | 2440 m | Alpes du Sud |
| Les 2 Alpes | Les 2 Alpes, Les Deux Alpes 1800 | 3600 m | Alpes du Nord |
| Valberg | Valberg, Beuil – Les Launes | 2100 m | Alpes du Sud |

## Dette connue

- **63 stations sans coordonnées** : elles sortent de la carte, du tri
  par distance et du calcul de trajet tant que `data/domainGeo.ts` ne les a pas
  géocodées. Liste :

  - Barèges – La Mongie
  - Arette – La Pierre Saint-Martin
  - Iraty
  - Val d’Azun
  - Gavarnie-Gèdre
  - Le Chioula
  - Espace Cambre d’Aze – Saint-Pierre
  - Le Mourtis – Boutx
  - Bourg-Saint-Maurice – Les Arcs
  - Peisey-Nancroix
  - Landry
  - Aime 2000
  - Plagne Bellecôte
  - Méribel-Mottaret
  - Saint-Martin-de-Belleville
  - Val Thorens
  - Tignes Le Lac
  - Val d’Isère
  - Termignon
  - La Féclaz
  - Savoie Grand Revard
  - Thollon-les-Mémises
  - La Chapelle-d’Abondance
  - Hirmentaz – Bellevaux
  - Plateau des Glières
  - Les Brasses
  - Megève – Rochebrune
  - Saint-Nicolas-de-Véroce
  - Combloux – La Princesse
  - Flumet – Val d’Arly
  - La Giettaz
  - Bisanne 1500
  - Hauteluce
  - La Rosière 1850
  - Séez
  - Les Deux Alpes 1800
  - Prapoutel – Les 7 Laux
  - Le Pleynet
  - Méaudre
  - Corrençon-en-Vercors
  - Villard-de-Lans – Côte 2000
  - Serre Chevalier – Briançon 1200
  - Serre Chevalier – Chantemerle 1350
  - Serre Chevalier – Villeneuve 1400
  - Serre Chevalier – Le Monêtier 1500
  - Risoul 1850
  - Vars Les Claux
  - La Joue du Loup
  - Gap – Bayard
  - Val d’Allos – Le Seignus
  - Barcelonnette – Le Sauze
  - Beuil – Les Launes
  - Le Lioran – Super Lioran
  - Besse – Super Besse
  - Le Haut Pilat
  - Le Lac Blanc 1200
  - Jougne – Métabief
  - Rochejean
  - Lamoura
  - Prémanon
  - Mijoux
  - Les Plans d’Hotonnes
  - Bellefontaine

- **5 écart(s)** entre la liste nominative de l’énoncé et le référentiel,
  détaillés ci-dessus. Ils ne sont pas comblés : le référentiel fait foi, et un
  rattachement incertain serait pire qu’un manque signalé.
