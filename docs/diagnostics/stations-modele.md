# Passage au modèle « stations d'abord » — diagnostic préalable

*Relevé du 18 août 2026, sur `master` à `51d295a`, référentiel livré
(`src/renderer/src/data/referentiel.json`), moteur local arrêté.*

Ce document répond aux trois questions imposées avant tout codage. Sa
conclusion change le périmètre du chantier : **la donnée cherchée existe déjà**,
et ce qui manque n'est pas un référentiel de stations mais un *vocabulaire* et
un *regroupement*.

---

## Q1 — Que contient réellement le référentiel ?

```
$ node -e "…" ./src/renderer/src/data/referentiel.json
entrées referentiel.json : 173 — en exploitation : 173

--- grep meribel / méribel ---
{"n":"Méribel",         "pass":"Les 3 Vallées","lat":45.396,"lon":6.566,"village":1450,"km":150}
{"n":"Méribel-Mottaret","pass":"Les 3 Vallées","lat":null,  "lon":null, "village":1750,"km":150}
```

**Méribel est dans le référentiel, avec ses coordonnées.** Il en va de même de
toutes les stations des 3 Vallées :

| entrée | lat | altitude village | km |
| --- | --- | --- | --- |
| Val Thorens – Orelle | 45.298 | 2 300 | 150 |
| Les Menuires – Saint-Martin | 45.325 | 1 850 | 160 |
| Courchevel | 45.415 | 1 850 | 150 |
| Méribel | 45.396 | 1 450 | 150 |
| Courchevel 1550 – Le Praz | 45.412 | 1 300 | 150 |
| Brides-les-Bains | 45.452 | 1 260 | 150 |
| Orelle | 45.216 | 1 800 | 150 |
| Méribel-Mottaret | — | 1 750 | 150 |
| Saint-Martin-de-Belleville | — | 1 450 | 160 |
| Val Thorens | — | 2 300 | 150 |

### Le constat central

Le fichier nommé « domaines » **est déjà une liste de stations**. Chaque entrée
porte un nom de station, ses coordonnées propres et l'altitude de *son* village.
Ce qui joue le rôle de domaine, c'est le champ `pass` — le forfait relié :

```
forfaits reliés distincts : 40      entrées sans pass : 53
 10  Les 3 Vallées      10  Paradiski        8  Espace Diamant
  7  Evasion Mont-Blanc  6  Portes du Soleil 5  Le Grand Massif
  5  Haute Maurienne Vanoise          5  Serre Chevalier
  4  Espace Killy · Mont Blanc Unlimited · Les Sybelles · Alpe d'Huez Grand Domaine
```

Autrement dit, le modèle demandé — `Station.domaine_id` — existe déjà sous une
autre forme : `entrée.pass`. Les 53 entrées sans `pass` sont des stations dont le
domaine se confond avec elles-mêmes.

**Conséquence sur le chantier 1** : il n'y a pas de référentiel de stations à
constituer, ni de table manuelle à écrire pour Les 3 Vallées, les Sybelles, les
Portes du Soleil ou le Grand Massif — leurs stations sont là. Le travail est de
*nommer* les deux entités et de *grouper*, non d'acquérir de la donnée.

### Trous réels, à documenter comme dette

- **63 entrées sur 173 n'ont pas de coordonnées** (`lat`/`lon` à `null`), dont
  Méribel-Mottaret, Saint-Martin-de-Belleville et Val Thorens. Elles sortent de
  la carte, du tri par distance et du calcul de trajet. `data/domainGeo.ts` les
  géocode déjà en tâche de fond, avec contrôle d'altitude.
- Le prompt annonce **259 domaines** ; le fichier livré en compte **173** et la
  base OpenSkiMap du moteur local 277. Le chiffre dépend donc de la source
  chargée, pas d'un manque. À vérifier moteur démarré.

---

## Q2 — Où le code suppose-t-il « 1 résultat = 1 domaine » ?

Treize sites lisent `derived.filtered` ou `domains`. Inventaire, qui est la
carte du chantier 3 :

| fichier | ce qui suppose le domaine |
| --- | --- |
| `state/selectors.tsx` | `matchesFilters`, `filtered`, `compared` (60), `lodgDomain` |
| `pages/DomainSearchPage.tsx` | `MAX_RESULTS = 40`, compteur `{filtered.length} {t('results_count')} {t('results_of')} {domains.length}`, grille de `DomainCard` |
| `components/DomainCard.tsx` | vignette = une entrée du référentiel |
| `components/DomainMap.tsx` | une épingle par entrée `filtered.filter(hasCoords)` |
| `components/DomainSheet.tsx` | fiche d'une entrée |
| `pages/HomePage.tsx` | `home_badge`, `home_stat_domains`, bandeau neige sur `filtered` |
| `pages/CombosPage.tsx`, `OffersPage.tsx` | `compared`, calculs par entrée |
| `hooks/useShortcuts.ts` | `MAX_RESULTS = 40` dupliqué |
| `App.tsx` | sélection courante `selectedId` dans `filtered` |
| `i18n/index.ts` | **52 occurrences** de « domaine » |

### Ce que l'inventaire révèle

Comme chaque entrée *est* une station, ces treize sites manipulent déjà des
stations. Le renommage est donc à faible risque fonctionnel et à fort coût de
libellés : l'essentiel du chantier 3 est du vocabulaire (52 clés i18n) et
l'ajout du **badge de domaine**, absent aujourd'hui.

### Un point de vérité à ne pas franchir

Le prompt donne en exemple un badge « *Les 3 Vallées* · 600 km · 3 230 m ». Le
référentiel ne porte aucun total de domaine : il donne 150 km à Méribel, 160 aux
Menuires, 150 à Courchevel. Les additionner donnerait 1 060 km — les secteurs se
recouvrent —, et prendre le maximum donnerait 160. **Aucune de ces valeurs n'est
600.** Un total de kilomètres de domaine serait donc une invention. Le badge
portera ce que la donnée soutient : le nom du domaine, son nombre de stations,
et les agrégats qui sont de vrais agrégats (le point culminant est un maximum,
donc licite). Le kilométrage reste celui de la station, à sa place.

---

## Q3 — La recherche actuelle échoue-t-elle vraiment ?

Sonde de 33 cas, tirés des critères d'acceptation, exécutée contre l'index
courant (`data/places.ts`) :

```
29/33 cas passent.
```

Passent déjà, accents et casse compris : `Méribel`, `meribel`, `MERIBEL`,
`Méribel-Mottaret`, `Les Menuires`, `menuires`, `menu` (préfixe),
`Saint-Martin-de-Belleville`, `st martin de belleville`, `La Toussuire`,
`le corbier`, `st sorlin d arves`, `Combloux`, `La Giettaz`, `Avoriaz`,
`chatel`, `Samoëns`, `samoens`, `Montchavin`, `Peisey-Vallandry`, `Aime 2000`,
`Vaujany`, `Le Monêtier`, `Les 3 Vallées`, `3 vallées`, `Les Deux Alpes`,
`Les 2 Alpes`, `Les 7 Laux`, `Vallorcine`.

**Le symptôme d'origine est déjà corrigé.** « Meribel » ne renvoyait rien avant
le commit `09f7b5c` (« un village mène à son domaine dans la recherche »), qui a
introduit `data/places.ts` : normalisation sans accents, sans articles, `st` ↔
`saint`, et indexation des segments de libellé et du forfait relié. La sonde le
confirme sur l'index courant.

### Les quatre échecs, tous de la même cause

```
KO « Aime deux mille »   → 0 résultat
KO « Les Trois Vallées » → 0 résultat
KO « trois vallees »     → 0 résultat
KO « Les Sept Laux »     → 0 résultat
```

**Les nombres écrits en lettres ne sont pas convertis.** C'est le seul manque
réel de l'index. Il est traité au chantier 2.

*(Un cinquième cas, « Le Monêtier », est apparu en échec à la première passe :
mon attendu était orthographié « Monétier » avec un accent aigu, quand le
référentiel écrit « Monêtier » avec un circonflexe. L'index avait raison, la
sonde avait tort. Corrigé.)*

### Contre-test exigé

```
« Vallorcine » → Chamonix – Les Grands Montets, Chamonix – Le Brévent Flégère,
                 Chamonix – Le Tour Balme, Vallorcine
```

Vallorcine remonte son propre domaine (Mont Blanc Unlimited) et **aucune station
des Portes du Mont-Blanc**. Le contre-test passe.

---

## Ce que ce diagnostic change au plan

| chantier | tel qu'annoncé | tel que la donnée l'impose |
| --- | --- | --- |
| 1 — référentiel | constituer des stations, table manuelle pour 12 domaines | **grouper** l'existant : `Station` = entrée, `Domaine` = `pass`. Table manuelle réduite aux hameaux sans entrée propre (déjà commencée dans `places.ts`) |
| 2 — recherche | index, normalisation, filet géographique | index déjà en place à 29/33 ; reste **les nombres en lettres**, la priorité aux stations dans les suggestions, et le filet géographique |
| 3 — listes | refonte station | **renommage** (52 clés i18n) + **badge domaine**, à modèle de données constant |

Le temps de trajet, en particulier, part **déjà** de la station :
`travelOf(domain, …)` lit `domain.lat/lon`, et Orelle (45.216) comme Courchevel
(45.415) portent les leurs. Le critère « valeurs différentes pour Orelle et
Courchevel » est satisfait par construction ; il sera vérifié, pas construit.

---

## Suite — le classeur France Montagnes (19 août 2026)

Le diagnostic ci-dessus concluait que la donnée cherchée existait déjà, et que
le chantier était un *regroupement*. C'était vrai du référentiel livré ; ça ne
l'était pas du catalogue. L'audit du 18 août l'a chiffré : sur les **232
stations publiées par France Montagnes, le référentiel n'en décrivait que
115**. Les 108 autres n'étaient pas mal rangées — elles étaient absentes, sans
coordonnées ni altitudes, donc inaffichables sans les inventer.

Un classeur a été livré le 19 août :
`docs/sources/stations-ski-france-montagnes.xlsx`, **285 lignes**, chacune avec
ses coordonnées contrôlées, l'altitude de son village mesurée sur le modèle de
terrain RGE ALTI de l'IGN, et son domaine skiable de rattachement mesuré sur
les tracés OpenSkiMap. Il comble exactement le trou constaté.

### Ce que ça change au rangement

| | avant | après |
| --- | --- | --- |
| Liste affichée | référentiel (ou moteur) filtré par les noms France Montagnes | **catalogue** (`data/franceMontagnesStations.ts`) |
| Stations | 115 | **283** (2 lignes écartées : un doublon, une station sans domaine cartographié) |
| Domaines | 69 | 151 |
| Altitudes, km, remontées, position | référentiel / moteur | **classeur** |
| Forfait, saisonnalité, glacier, logo | référentiel | référentiel, posé par `data/catalogue.ts` |
| Sites officiels, réservation | table `stations.ts` + moteur | classeur, puis table, puis moteur |

`collapseToStations` a disparu : le repli des libellés composites du référentiel
(« Val Thorens – Orelle ») n'a plus d'objet quand la liste **est** une liste de
stations. `stationList.ts` ne garde que `stationOwning`, qui rattache un
logement importé sous un ancien identifiant à sa station.

### Le tarif du forfait suit le domaine

Un forfait s'achète pour un domaine : les dix entrées des 3 Vallées du
référentiel portent le même tarif à l'euro près. `forfaitIndexByArea` indexe
donc les tarifs relevés **par domaine** en plus de par station, ce qui donne à
Orelle, Belle Plagne ou Le Fornet le tarif relevé de leur domaine au lieu d'une
estimation. 176 des 283 stations affichent un tarif relevé ; les 107 autres, un
tarif estimé et marqué comme tel — ce sont les petites stations que le
référentiel n'a jamais décrites.

### Ce que le classeur se trompe, et ce qu'on en fait

Le rattachement au domaine est mesuré « par proximité des pistes au village »,
ce qui se trompe quand le village est loin de son propre domaine. Confronté au
forfait relié que le référentiel déclare, l'écart apparaît sur cinq stations :
Orelle, Auris-en-Oisans et Samoëns sont recollées par `DOMAIN_FIXES`
(`data/catalogue.ts`), justification écrite ligne par ligne ; Combloux et La
Giettaz sont laissées au classeur, qui a raison contre le référentiel. Aucune
correction n'invente de chiffre : elle déplace une station vers **un autre
domaine du classeur**, dont elle prend les mesures.
