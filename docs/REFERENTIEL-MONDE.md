# Référentiel mondial

Frère de `REFERENTIEL.md`, qui décrit les 320 stations françaises et ne bouge
pas. Ce document décrit ce qui vient s'ajouter à côté, pour le reste du monde.

Il était incomplet tant que le fichier de données restait hors de portée : la
politique de sortie réseau du poste refusait alors `openskidata.org`. Elle ne
le refuse plus, le fichier a été lu, et **les chiffres qui suivent sont
mesurés**. Ceux qui manquent encore sont nommés à la fin, comme avant.

## La source

| | |
| --- | --- |
| Page de téléchargement | `https://openskidata.org` |
| Fichier | `https://tiles.openskimap.org/geojson/ski_areas.geojson` |
| Poids | 4,4 Mo compressés, 20,7 Mo lus |
| Date du relevé | **18 septembre 2026, 23 h 31 UTC** |
| Schéma | `openskidata-format`, version 16.0.0, publiée sur npm |

La date ne se devine pas : `https://tiles.openskimap.org/metadata.json` la
porte, et donne aussi l'horodatage OpenStreetMap du relevé (18 septembre 2026,
22 h 08) et celui du téléchargement Skimap.org (22 h 09). C'est la date du
fichier, et non celle de son téléchargement, qui se note ici.

Le relevé complet compte 12 244 domaines toutes activités confondues, dont
**7 018 de ski alpin**, 229 646 pistes et 33 201 remontées.

L'adresse a été vérifiée plutôt que devinée. `openskimap.org` est le site de
consultation ; les fichiers se téléchargent sur `openskidata.org`. C'est le
README du dépôt `russellporter/openskidata-processor` qui l'indique : « Data
outputs are available for download at OpenSkiData.org ».

Le fichier n'est pas versionné. Il reste dans un répertoire temporaire, et
c'est sa date qui se note ici.

## Les sources d'une entrée, et leur licence

Le schéma associe à chaque domaine une liste `sources`, dont le type ne peut
prendre que deux valeurs :

```
enum SourceType { SKIMAP_ORG = "skimap.org", OPENSTREETMAP = "openstreetmap" }
```

Un même domaine peut porter les deux : le traitement d'OpenSkiMap fusionne une
relation `site=piste` ou une zone `landuse=winter_sports` d'OpenStreetMap avec
la fiche Skimap.org correspondante. Les deux ne relèvent pas des mêmes
conditions, et l'origine se lit donc entrée par entrée, jamais globalement.

`scripts/build-monde.py --recenser` compte la répartition. Sur les 7 018
domaines de ski alpin :

| Origine | Domaines |
| --- | ---: |
| OpenStreetMap **et** Skimap.org | 2 700 |
| Skimap.org seul | 2 387 |
| OpenStreetMap seul | 1 068 |
| **aucune source** | 863 |

Les 863 sans source sont à noter : ils ne portent aucun identifiant stable, et
ce sont eux qui obligent la clé à se construire plutôt qu'à se reprendre.

## Trois propriétés du schéma qui changent le plan

Elles sont lues dans les définitions TypeScript publiées, pas supposées.

### 1. L'identifiant d'un domaine n'est pas stable

Le schéma le dit sans détour :

> The ID is just a hash of the feature, so will change if the feature changes
> in any way. If a stable identifier is needed, use the wikidataID property, or
> a source id.

Conséquence directe : `id` ne peut pas servir de clé de rattachement d'un
relevé au suivant. Or c'est ce que trois étapes prévues en attendaient, pour
rattacher un domaine frontalier à sa station française, pour départager deux
identifiants en collision, et pour remplir le champ `osmAreaId`.

La nuance compte : sur **un même fichier source**, le condensé ne bouge pas.
Le contrôle prévu, « deux exécutions du script sur la même source produisent
les mêmes identifiants », passera donc. C'est d'un relevé au suivant que la
valeur change, et c'est là que le danger est réel, puisqu'un identifiant de
station se retrouve enregistré dans un séjour et dans un logement.

Deux candidats stables existent dans le schéma :

- `wikidataID`, absent d'une partie des domaines ;
- `sources[].id`, l'identifiant OpenStreetMap ou Skimap.org d'origine, présent
  dès qu'une source l'est.

Le recensement a compté les deux, et les effectifs ont tranché contre eux :
**487 domaines sur 7 018 portent un `wikidataID`**, et 6 155 portent au moins
une source. Ni l'un ni l'autre ne couvre le référentiel.

La clé est donc **construite**, comme celle du référentiel français : le pays,
puis le nom replié — `ch-zermatt-breuil-cervinia-breuil-cervinia-ski-paradise`.
Deux cas la complètent par les coordonnées arrondies au dix-millième de degré,
soit environ onze mètres : un domaine sans nom, qu'OpenSkiMap accepte, et deux
domaines de même nom dans le même pays. Le détail est dans `identifiant()`, au
plus près de la valeur qu'il fixe.

### 2. Un domaine n'a pas de nom traduit

`name` est une chaîne unique, `string | null`. Seuls les lieux de `places`
portent un bloc `localized`, et il ne contient que l'anglais :

```
localized: { en: { country: string; region: string | null; locality: string | null } }
```

Il n'y a donc **ni nom français ni nom anglais à extraire** au niveau du
domaine. Ce que le plan appelait « les noms français et anglais s'ils
existent » n'existe pas dans cette source.

### 3. Les statistiques sont facultatives

`statistics?: SkiAreaStatistics`. Un domaine peut n'en porter aucune, et
`minElevation` comme `maxElevation` peuvent manquer à l'intérieur.

Ce n'est pas zéro kilomètre : c'est une absence de mesure. Les deux ne se
confondent pas, et c'est exactement la règle du référentiel français. Le
recensement compte donc « mesuré » comme un cran à part entière, avant les
seuils chiffrés : un seuil actif sur un champ non mesuré doit écarter le
domaine, pas le compter comme nul.

## Rien n'est estimé

La règle du référentiel français s'applique à l'identique. Un champ d'échelle
domaine vient du domaine ou vaut `null` ; un champ d'échelle station vaut
`null` s'il n'est pas mesuré ; l'écran affiche l'absence.

## Les trois décisions, et ce qui les a tranchées

### Le seuil : « en exploitation », puis « mesuré »

**5 720 domaines, 73 pays.** Les effectifs de chaque cran envisagé :

| Seuil | Domaines | Pays | Perdus |
| --- | ---: | ---: | ---: |
| ski alpin | 7 018 | 82 | — |
| en exploitation | 5 723 | 74 | 1 295 |
| mesuré | 5 723 | 74 | 0 |
| 1 remontée ou plus | 5 147 | 71 | 576 |
| 3 remontées ou 5 km | 2 831 | 63 | 2 316 |
| 10 km ou plus | 1 115 | 47 | 1 716 |

**C'est la France qui a tranché.** Elle porte ici 340 domaines de ski alpin,
280 en exploitation, 248 avec au moins une remontée et 204 à « 3 remontées ou
5 km », quand son référentiel en montre 320. Un seuil plus exigeant aurait
soumis l'étranger à une sélection que la France n'a jamais subie, et effacé un
tiers de ce que l'app affiche déjà.

Le cran « mesuré » ne coûte rien — aucun domaine en exploitation n'est sans
statistiques — et il se garde pour ce qu'il dit.

Trois domaines retenus n'ont **aucun pays** dans la source. Leurs coordonnées
les placeraient en Chine, aux îles Åland et au Svalbard ; l'audit interdisant
de deviner un pays, ils sont écartés, et l'index les compte sous `sansPays`
pour que l'absence se voie. D'où 5 720, et non 5 723.

> Ces 5 720 sont le résultat du **seuil**, au 18 septembre 2026. Le périmètre
> a changé depuis : la Russie en est sortie le 21 septembre, et le référentiel
> en porte 5 476. Les deux nombres sont justes, chacun à sa question.

### Une station est un domaine, jamais une localité

| | Domaines | Avec localité | Localité ≠ nom |
| --- | ---: | ---: | ---: |
| Autriche | 420 | 101 | 96 |
| Suisse | 356 | 356 | 279 |
| États-Unis | 1 096 | 637 | 624 |

Trois domaines autrichiens sur quatre ne portent aucune localité, et quand elle
existe elle nomme la commune et non la station : « Axamer Lizum » a pour
localité Axams, et un domaine viennois a simplement Vienna. Ranger par localité
aurait rebaptisé les stations du nom de leur mairie. `localite` reste un champ
d'appoint.

### Les domaines frontaliers sortent des deux côtés

**68 domaines retenus portent plusieurs pays** — Les Portes du Soleil, Avoriaz,
Zermatt–Breuil-Cervinia, Montgenèvre, La Rosière, GrandValira, la Zugspitze,
Kranjska Gora. L'ordre des pays ne veut rien dire : la source écrit aussi bien
`CZ+DE` que `DE+CZ`.

Chacun n'est **écrit qu'une fois**, dans le fichier de son pays principal, et
porte la liste entière dans `pays` ; `index.json` les rappelle dans `partages`.
`domainesPays("CH")` va donc chercher Les Portes du Soleil dans le fichier
français plutôt que d'en garder une copie suisse, qu'un relevé pourrait rendre
divergente.

## Le périmètre, et ce qui en est sorti

**La Russie est écartée du référentiel depuis le 21 septembre 2026**, sur
décision du propriétaire. Ses 244 domaines passaient le seuil comme les
autres : ce n'est pas une question de données, c'est une question de périmètre.

L'exclusion vit dans `scripts/build-monde.py`, sous `PAYS_ECARTES`, et non dans
une suppression de fichiers — la prochaine régénération les ramènerait sans que
personne ne l'ait voulu. Elle retire le pays, ses fiches, ses points
d'altitude, et le raye de la liste des pays d'un domaine frontalier ; aucun
domaine n'était dans ce dernier cas au relevé du 18 septembre, et la règle est
écrite pour que le prochain ne passe pas en silence.

`index.json` publie le compte sous `ecartes`, et l'écran `/monde` l'affiche :
**une absence décidée doit se voir**, faute de quoi 244 domaines manqueraient
au total sans que rien ne distingue la décision d'une perte de données. C'est
la même règle que pour les trois domaines sans pays.

`geo/pays.ts` a perdu sa fiche `RU` du même coup : la règle de cette liste est
« les pays ayant au moins une station retenue ».

## Ce que le référentiel pèse

| | |
| --- | --- |
| Domaines | 5 476 |
| Pays | 72 |
| Fichiers | 73, dont `index.json` |
| Poids total | 2,2 Mo |
| Plus gros pays | `US.json`, 255 Ko |
| `index.json` | 6 Ko, seul fichier importé statiquement |

Aucun écran ne charge le monde d'un bloc : `index.json` porte les compteurs et
le cadrage de chaque pays, et `domainesPays(cc)` n'ouvre qu'un pays. C'est la
réponse au point d'alerte de l'audit, qui tenait le chargement pour ce qui
déciderait si l'extension tient.

Le cadrage de chaque pays est mesuré **sur ses stations**, et non sur ses
frontières. `geo/pays.ts` l'annonçait et disait pourquoi : cadrer l'Australie
sur ses frontières montre Perth pour atteindre trois stations de
Nouvelle-Galles du Sud. `cadrePays()` préfère donc le cadrage des stations, et
retombe sur celui des frontières pour un pays sans domaine.

## Régénérer

Le relevé courant est celui du **21 septembre 2026** (`dataTimestamp`
2026-09-21T22:05:36Z, `formatVersion` 16.0.0), téléchargé sur
openskidata.org le 22. Par rapport au 18 : 2 781 domaines au lieu de 2 780,
huit renommages OSM dans le secteur de Wisła qui changent l'identifiant
construit, dix kilométrages et douze comptes de tronçons corrigés.

**`--ecrire` ne vide que les fichiers de pays et l'index.** Il vidait tout le
dossier, relevés compris — `skiinfo.json`, `bergfex.json`,
`sitesOfficiels.json`… — et l'a fait le 22 septembre ; git les portait, c'est
la seule raison pour laquelle ils existent encore.

```
python3 scripts/build-monde.py --src /tmp/ski_areas.geojson --recenser
python3 scripts/build-monde.py --src /tmp/ski_areas.geojson --ecrire --releve 2026-09-18T23:31:32Z
```

Le premier chiffre sans rien écrire. Le second écrit `src/lib/monde/data/`, un
fichier par pays plus l'index, et vide le dossier avant : un pays qui perd sa
dernière station perd son fichier.

Sans `--releve`, la date du fichier source fait foi — ce qui date le
téléchargement et non le relevé. Passez-la explicitement, en la lisant dans
`metadata.json`.

## L'écran : `/monde`

Trois niveaux — **continent → pays → domaines** — et non un filtre de plus sur
un écran existant. Soixante-treize pays ne tiennent pas dans une rangée de
jetons comme les dix massifs de `/carte`, et aplatir le référentiel en une
liste unique demanderait de charger le monde entier pour en montrer vingt.

La forme de l'écran suit donc celle des données : les deux premiers niveaux ne
lisent que `index.json`, et `domainesPays()` n'ouvre que le pays regardé.

| Niveau | Ce qu'il lit | Ce qu'il coûte |
| --- | --- | --- |
| Continents | `CONTINENTS` × `index.json` | rien de plus que le lot de départ |
| Pays | `index.json` | rien |
| Domaines | `<CC>.json` + `couleurs.json` | un pays, une fois |

Les filtres vivent dans `monde/filtres.ts`, et ils tiennent la règle du dépôt :
**un seuil porte sur une valeur mesurée.** Un domaine dont les kilomètres ne
sont pas relevés est écarté par un seuil sur les kilomètres, jamais compté pour
zéro — c'est `atLeast` de `carte.ts`, la même fonction que pour la France, pas
une seconde écriture. Le tri suit la même règle : le non mesuré passe en
dernier **dans les deux sens**, parce que le traiter comme un zéro le mettrait
en tête d'un tri décroissant inversé et le ferait passer pour une mesure nulle.

Le compte affiché dit « X sur Y » où Y est ce que le pays rend, et non ce que
l'index compte : `domainesPays()` ramène les domaines hébergés **et** ceux qui
débordent d'un pays voisin, si bien que l'Autriche en rend 396 là où l'index en
compte 381. L'écart est écrit en toutes lettres sous le compte, avec le nombre
de frontaliers ; les deux nombres se contredisaient à l'écran sans rien dire.

## Les couleurs, et le rattachement qui les étend

OpenSkiMap compte les tronçons par couleur pour 4 239 domaines sur 5 720. Pour
les autres, il n'a relevé aucune piste — ce qui n'est pas « ce domaine n'a pas
de pistes ». Deux relevés du dépôt en savent pourtant quelque chose, et ils
sont rangés par fiche, pas par domaine.

`scripts/build-couleurs-monde.ts` fait la jointure et écrit
`src/lib/monde/data/couleurs.json` (181 Ko, chargé à la demande).

| | Domaines | Part |
| --- | ---: | ---: |
| Mesurés par OpenSkiMap | 4 239 | 74,1 % |
| Rattachés à une fiche Skiinfo | 234 | 4,1 % |
| Rattachés à une fiche skiresort | 630 | 11,0 % |
| **Couverts** | **5 103** | **89,2 %** |
| Aucune couleur possible | 617 | 10,8 % |

**La jointure se fait par la position, et n'affirme rien de plus.** Aucune clé
n'est commune aux trois sources : ni identifiant, ni nom comparable. Deux
points à moins de cinq kilomètres sont donc rapprochés, le plus proche gagne,
et trois choses en découlent :

1. **La distance est écrite à côté du rattachement**, et paraît à l'écran. La
   médiane est de 0,38 km et 70 % des rattachements sont à moins d'un
   kilomètre, mais un rattachement à 4,8 km existe et ne doit pas se lire comme
   un rattachement à 200 m.
2. **La fiche retenue est nommée**, pour qu'un doute se lève à la main.
3. **Le fichier porte les valeurs brutes de la source**, pas une répartition
   calculée : la règle qui en tire quatre couleurs vit dans `monde/couleurs.ts`
   et n'est écrite qu'une fois. La recopier dans la donnée en ferait une
   seconde, que la prochaine mesure de `partVerte.json` laisserait en arrière.

Le recours par les pistes du GeoPackage — 159 domaines de plus dans l'analyse —
n'y est pas : ce fichier de 2 Go n'est pas dans le dépôt, et un script du dépôt
ne dépend pas d'un téléchargement local.

À l'écran, une répartition dérivée de skiresort porte la mention **« vert et
bleu estimés »** à côté de sa barre, et non seulement dans une infobulle. Une
valeur estimée qui ne se dit pas estimée est pire qu'une absence, puisque
l'absence, elle, se voit — et les 617 domaines sans couleur écrivent
« Répartition par couleur non relevée » plutôt qu'une barre vide.

## Photo, forfait, météo : ce que chaque domaine montre

Décision du propriétaire, 22 septembre 2026 : **garder les 2 780 domaines
nommés, et afficher l'absence** plutôt que resserrer le périmètre à ce qui est
complet. Un forfait ou une photo qu'aucune source ne publie s'écrit « non
relevé », à la place même où il paraîtrait.

| | Domaines | Photo | Forfait | Les six tarifs | Météo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tous, nommés | 2 781 | 60,1 % | 69,4 % | 20,0 % | 100 % |
| 3 remontées et plus | 1 554 | 73,4 % | 81,5 % | 31,5 % | 100 % |
| 10 km et plus | 682 | 83,7 % | 86,4 % | 48,7 % | 100 % |

La part de photos **baisse** par rapport au relevé précédent (73,4 % au
22 septembre), et c'est voulu : 2 026 images ont été regardées une à une, et
697 adresses écartées — 250 sans neige, 153 hors sujet (plans de pistes
dessinés, logos, intérieurs), 47 filigranées, 46 partagées entre plusieurs
domaines, 24 simples paysages de montagne, le reste inatteignable au
contrôle. Une absence vraie vaut mieux qu'une photo qui ne montre pas la
station.

**Aucune photo affichée n'est restée sans être vue.** Écarter une photo
laisse la place à la source suivante, qui n'avait pas été regardée non plus :
il a fallu trois tours pour que le compte tombe à zéro. Le second tour, sur
les photos ainsi promues, n'en a gardé que 59 sur 170 — les images d'une
source de second rang sont bien plus rarement la station.

Les 1 671 photos affichées se répartissent ainsi : Skiinfo 1 068, Wikimedia
Commons 169, bergfex 125, site officiel 120, tableau des manques 106,
skiresort 83.

Les sources, dans l'ordre où elles servent — `scripts/build-vues-monde.ts`,
qui écrit `vuesDomaines.json` :

| | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| Photo | Skiinfo | skiresort | bergfex | site officiel (`og:image`, puis la plus grande image de l'accueil) | tableau des manques, **corroboré** | Wikimedia Commons, **choisi à l'œil** |
| Forfait | bergfex, **par période datée** | Skiinfo, grille | bergfex, grille simple | skiresort, un nombre | page « Tarifs » **lue ligne à ligne** | tableau des manques, **avec source** |
| Météo | altitudes du référentiel | bas et sommet de la fiche appariée | point de terrain Copernicus, une seule altitude, dite comme telle | — | — | — |

Une source écartée par le regard ne fait pas perdre la place : la chaîne
reprend à la suivante. Cent quatre-vingt-treize domaines ont ainsi retrouvé
une photo ailleurs après le rejet de la leur.

### La photo : unique, de la station ou des pistes, sans filigrane, avec de la neige

Ces quatre conditions ne se vérifient pas sur une adresse. Les 2 023 photos
retenues ont donc été **rapatriées et regardées**, une par une
(`telecharger-photos-pour-audit.py`, puis un agent par lot de douze images) :

- **avec de la neige** : la part de pixels clairs mesurée au téléchargement
  ne suffit pas — un ciel couvert ou un mur blanc la font monter. C'est le
  regard qui tranche ; la mesure est gardée à côté pour comparaison.
- **de la station ou des pistes** : chaque image est rangée en `station`,
  `pistes`, `montagne`, `autre` ou `illisible`. Les deux premières passent.
  `montagne` ne passe pas : un sommet sans remontée ni village n'est pas la
  station, et c'est la station qui a été demandée.
- **sans filigrane** : une trame de banque d'images, un bandeau, un logo
  d'agence en travers. Un petit logo de station dans un coin n'en est pas un.
- **unique** : le contrôle porte sur l'**empreinte du fichier**, pas sur
  l'adresse — deux adresses servent parfois le même cliché. Quand plusieurs
  domaines se partagent une image, aucun ne la garde : rien ne dit lequel
  elle montre.

Ce que le regard a trouvé et qu'aucune mesure n'aurait vu : des plans de
pistes dessinés, des logos vectoriels, des paysages d'été verts, des
intérieurs de restaurant. Une photo écartée **ne laisse pas le domaine sans
rien** : la chaîne des sources reprend à la suivante, et à défaut Wikimedia
Commons est interrogé.

`photosJugees.json` porte un verdict par domaine, avec la description de ce
qui a été vu. Le verdict est comparé à **l'adresse** de la photo, jamais au
domaine seul : si la photo retenue change, le verdict ne la concerne plus.

### Wikimedia Commons, pour les domaines sans photo

`fetch-photos-commons.py` demande à Commons les fichiers **géolocalisés**
dans un rayon de dix kilomètres autour du domaine — pas ce qu'un moteur
associe à son nom. Les candidates sont triées (nom du domaine dans le titre,
mot de neige ou de ski, taille), les hors-sujet écartées avant tout
téléchargement, et un regard choisit. Commons interdit les filigranes, ce
qui règle l'une des quatre conditions à la source.

Mille cent quarante-cinq domaines ont été cherchés, 929 avaient au moins une
candidate, 906 ont été regardés — **202 photos retenues, une sur cinq**.
Le reste est honnêtement vide : autour d'un petit domaine autrichien,
Commons a surtout des églises, des monuments aux morts et des prairies
d'été. Trente-trois des 202 sont ensuite retirées, deux domaines voisins
ayant choisi le même fichier.

Une photo libre ne se montre **qu'avec son auteur et sa licence** : le
crédit paraît sous l'image, lisible et cliquable vers la page du fichier.
Une infobulle n'y suffirait pas.

### Les six tarifs : journée, six jours, saison × adulte, enfant

L'écran n'affichait qu'un prix — la journée adulte — alors que les grilles
moissonnées en portaient bien davantage. `src/lib/monde/matrice.ts` en tire
les six demandés, sans jamais en calculer un : une case vide reste vide.

Chaque case porte **le libellé de la ligne et le nom de la colonne tels que
la source les écrit**, plus sa provenance. C'est ce qui permet de voir qu'un
« 6 jours » vient d'une ligne « 6 Jours » chez bergfex et d'un « Forfait
semaine » chez Skiinfo — deux produits voisins, pas identiques. Le survol du
montant le dit.

Deux règles évitent de mentir :

- **Zéro n'est pas un prix.** Skiinfo remplit de `0` les cases qu'il ne
  publie pas ; 938 grilles ont une ligne « Forfait semaine » entièrement
  nulle. Tout montant nul est lu comme une absence.
- **Enfant n'est pas junior.** Les grilles distinguent Enfant, Junior,
  Sénior ; seule la colonne enfant est lue. Un junior de 14 ans n'est pas
  l'enfant de 6 ans, et les confondre ferait varier le prix au gré de la
  source.

Les cases sont prises à la première source qui les publie, dans le même
ordre que le forfait lui-même, et **seulement parmi les grilles de la devise
retenue** : une couronne à côté d'un euro dans un même tableau ferait lire un
prix pour un autre.

#### Ce que les sites officiels ne publient plus

Cent cinquante-cinq pages de tarifs ont été rapatriées et lues ligne à ligne
(`fetch-pages-tarifs.py`, puis un agent par lot de cinq pages). Vingt-quatre
seulement ont rendu un montant. La raison est écrite dans `tarifsLus.json`,
constat par constat : **la plupart de ces pages ne publient plus de prix**.
Elles annoncent des tarifs « dynamiques » et renvoient à leur boutique en
ligne, ou bien la page trouvée en septembre est la version **été** du
tarifaire. Ce n'est pas un échec de lecture, c'est l'état des sites — et
c'est pourquoi la case reste vide plutôt que d'être remplie d'un prix voisin.

Un montant n'est gardé qu'avec **la ligne de la page d'où il sort**, ligne
entière, retrouvée dans le texte relevé. Une citation réduite au seul
montant — « € 24,00 » — ne dit ni la durée ni la classe d'âge : elle est
écartée, et le compte en est tenu.

`fetch-bergfex-grilles.ts` a rouvert un gisement que le premier relevé
jetait : `fetch-bergfex.ts --prix` ne gardait qu'un tableau **précédé d'une
plage de dates**, et écartait tout le reste. Mille soixante-sept pages ont
été relues, **212 portaient une grille** — « 1 Jour » (219 fois), « 6 Jours »
(98), « Passeport saisonnier » (117), en colonnes « Adultes » et
« Enfants » : exactement ce qu'on cherche. Une grille sans dates ne passe
toujours pas devant Skiinfo (elle n'a pas les bornes d'âge), mais elle passe
devant un nombre unique.

### Le tableau des manques, et ce qu'on en a gardé

`export-manques.ts` écrit `docs/manques-photo-forfait.csv` ; rempli, il se
relit par `scripts/importer-manques.py`, qui écrit `proprietaire.json`. Le
tableau rendu le 22 septembre 2026 (`docs/sources/manques-photo-forfait-recherche-large-2026-09-22.xlsx`)
l'a été par une **recherche large**, automatique : 1 187 adresses d'images,
dont la même photo d'un festival tyrolien pour 146 domaines, une plage
albanaise pour 14, et un quart de banques d'images ; la colonne `source`
porte un libellé, pas une page.

Le crible, hors France : une photo n'entre que **corroborée** — servie par le
site officiel connu du domaine (94), le nom du domaine dans son adresse
(117), un office de tourisme du pays (22), bergfex (23) — puis **contrôlée**
(un octet : type image, 20 ko au moins). Écartées : 244 adresses répétées
entre domaines, 102 de banques ou réseaux sociaux, 457 sans corroboration,
55 non servies. Un forfait n'entre qu'avec prix, devise et source lisible
(page, Skiinfo ou site officiel connu) : 61 sur 66. Les valeurs entrées
servent **après** toutes les sources moissonnées : 124 photos et 53 forfaits
de plus à l'écran, chacun dit « relevé à la main », avec sa corroboration ou
sa source, et « non vérifié à l'œil » pour la photo.

Chaque appariement est fait **par la position** (`scripts/appariement.ts`) :
la fiche la plus proche à 5 km, jusqu'à 20 km quand **le nom corrobore**, une
fiche ne servant qu'un domaine. La distance et la fiche voyagent avec la donnée
jusqu'à l'écran.

`docs/manques-photo-forfait.csv` porte les 2 277 domaines auxquels il manque
une photo, un forfait **ou l'un des six tarifs** : 894 n'attendent que des
tarifs, 578 une photo et un forfait, 480 une photo et des tarifs, 273 un
forfait, 52 une photo. La colonne `tarifs_manquants` nomme les cases vides et
les colonnes `releve_*` disent ce qu'une source publie déjà, pour qu'on ne
cherche pas deux fois la même chose.

La raison de chaque absence est connue : la plupart de ces domaines n'ont
aucun site web publié par OpenSkiMap, et ceux qui en ont un ne publient
souvent plus de prix. Toutes les sources moissonnables l'ont été ; ce qui
reste se remplit à la main, **avec l'adresse d'une page en `source`**, sans
quoi la relecture l'ignore.

## Les devises

L'audit appelait ce point « le plus diffus » : le référentiel n'avait qu'une
devise, et le code ne le disait nulle part — il l'écrivait. La règle qu'il
fixait est tenue dans `src/lib/devises.ts` : **un formateur prend la devise en
argument, et l'euro est devenu un cas particulier.**

| Où | Avant | Maintenant |
| --- | --- | --- |
| `parcours.ts` | `fmt(n) + " €"` | `montant(n, devise)`, dont `eur()` est un raccourci |
| `forfaits/age.ts` | `formatEuroTarif`, dont le nom mentait | `formatTarif(n, devise)` |
| `forfaits/cout.ts` | un total sans devise | le total **porte** sa devise, et ne s'en sépare plus |
| `forfaits/grille.ts` | `devise: "EUR"` quatre fois | la devise du pays du domaine, par `deviseDuDomaine()` |
| `accommodation.ts` | `currency: "EUR"` | `montant(n, devise)` |
| `filtres.ts` | un seuil en euros s'appliquait à tout | il **écarte** les stations d'une autre devise |

Les trente appels existants à `eur()` ne changent ni de forme ni de sortie :
c'est ce que vérifie `devises.test.ts`, espace des milliers comprise. Le
symbole vient de l'ICU et n'est écrit nulle part à la main — en français, la
livre s'écrit « £GB » et le dollar américain « $US », ce qu'une table tenue de
mémoire aurait manqué.

Le filtre mérite un mot. Un seuil de 400 € ne dit rien d'un forfait en francs
suisses, et aucun taux de change ne vit dans ce dépôt : la devise est
d'affichage, elle n'est jamais convertie. Le filtre écarte donc ces stations,
exactement comme il écarte déjà une station dont le champ n'est pas mesuré.
Dans les deux cas la comparaison demandée n'a pas de sens, et y répondre
« oui » serait pire que n'y pas répondre.

**Ce qui n'est pas fait, et qui n'est pas une devise :** les `toLocaleString("fr-FR")`
de `liftSpan.ts`, `gpx.ts` et `carte.ts` pour des mètres et des kilomètres, et
les dates en `fr-FR` de `useForfait.ts`, `age.ts` et `skiinfoStore.ts`. Ceux-là
suivent la langue de l'interface, pas le pays de la station : ils relèvent de
l'i18n, et les traiter ici les aurait mêlés à un sujet qui n'est pas le leur.

## Ce qui reste à établir

- **Deux pays sur 73 restent sans fiche**, et ce sont deux absences sourcées,
  non un reste de travail. Ils étaient 29 ; `geo/pays.ts` en a repris 27 le 19
  septembre 2026, devises lues dans la liste ISO 4217 publiée par SIX Group,
  fuseaux dans la table `zone.tab` de l'IANA, cadrages dans le même fichier
  Natural Earth que la phase 1. Restent l'**Antarctique**, en face de qui
  l'ISO 4217 écrit « No universal currency », et le **Kosovo**, absent des
  deux tables parce que `XK` est un code d'usage et non un code ISO 3166-1.
  `paysSansFiche()` rend exactement ces deux-là, et son test l'exige à
  l'égalité : un troisième pays devra faire échouer la suite, pas s'y ranger.
- **L'Antarctique est dans le référentiel et hors de la navigation** — et
  l'écran le dit. `Kiwi Ski Hill`, un téléski en exploitation près de McMurdo,
  passe le seuil ; `continents.ts` a délibérément posé six continents sans
  l'Antarctique. Les deux décisions sont justes et se contredisent : `/monde`
  ne tranche pas la contradiction, il la **nomme**. Le pied du premier niveau
  écrit que les six onglets portent 5 718 domaines et que deux pays — `AQ` et
  `XK`, un domaine chacun — n'y figurent pas, avec la raison de chacun. C'est
  la réponse que cette ligne appelait : dire, et non ranger d'office.
- **Aucune exception d'appariement n'existe encore**, et `monde/corrections.ts`
  n'est donc pas créé. Les corrections du référentiel français naissent de
  l'appariement classeur × OpenSkiMap ; le monde n'a qu'une source, donc rien à
  apparier. Le fichier viendra avec la deuxième source, pas avant.
- **Les altitudes sont celles du domaine**, `minElevation` et `maxElevation`,
  et non celles d'un village. `altBandsDomaine()` le dit désormais en toutes
  lettres : `villageM` y vaut toujours `null`, et le libellé porte « pas un
  village ». Un relevé de modèle de terrain s'y ajoute sous `pointM`, un champ
  distinct, parce qu'un relevé ponctuel rangé dans `minM` et `maxM` afficherait
  un dénivelé de zéro là où rien n'a été mesuré.

- **Le relevé de terrain est complet : 5 720 domaines sur 5 720.** Il vit dans
  `src/lib/monde/data/dem.json`, fichier distinct du référentiel pour la raison
  que l'audit donne à propos d'`alt.ign.json` : une altitude de modèle de
  terrain et les bornes d'un domaine ne mesurent pas la même chose. Le modèle
  est Copernicus DEM GLO-90, servi par Open-Meteo, et le point relevé est
  `viewportHint.center` — **ni village, ni sommet**, ce que le fichier porte
  écrit.

  Les altitudes vont de −6 m à 3 752 m. Les deux valeurs négatives ne sont pas
  des ratés : `nl-indoor-ski-rotterdam` est une halle couverte des Pays-Bas, où
  le sol est sous le niveau de la mer. `dk-copenhill`, à 4 m, est la piste
  posée sur l'usine de valorisation de Copenhague. Un contrôle naïf « une
  altitude doit être positive » les aurait jetés, et le test dit pourquoi il ne
  le fait pas.

  Il a fallu trois passages, étalés sur deux jours. Open-Meteo compte trois
  quotas — à la minute, à l'heure, au jour — et le relevé les a rencontrés dans
  l'ordre. Le script s'arrête sur n'importe quel `429` en répétant la raison du
  service mot pour mot, et ne réécrit pas le fichier quand un passage n'a rien
  rapporté : la date dit quand les altitudes ont été prises, pas quand on a
  essayé. Pour refaire le relevé après un nouveau millésime du référentiel :

  ```
  node --experimental-strip-types scripts/build-dem-monde.ts
  node --experimental-strip-types scripts/build-dem-monde.ts --completer
  ```

- **Aucune exception d'appariement n'existe encore**, et `monde/corrections.ts`
  n'est donc pas créé. Les corrections du référentiel français naissent de
  l'appariement classeur × OpenSkiMap ; le monde n'a qu'une source, donc rien à
  apparier. Le fichier viendra avec la deuxième source, pas avant.
- **Les altitudes sont celles du domaine**, `minElevation` et `maxElevation`,
  et non celles d'un village. `altBandsDomaine()` le dit désormais en toutes
  lettres : `villageM` y vaut toujours `null`, et le libellé porte « pas un
  village ». Un relevé de modèle de terrain s'y ajoute sous `pointM`, un champ
  distinct, parce qu'un relevé ponctuel rangé dans `minM` et `maxM` afficherait
  un dénivelé de zéro là où rien n'a été mesuré.

- **Le relevé de terrain est fait aux cinq sixièmes : 5 220 domaines sur
  5 720.** Il vit dans `src/lib/monde/data/dem.json`, fichier distinct du
  référentiel pour la raison que l'audit donne à propos d'`alt.ign.json` : une
  altitude de modèle de terrain et les bornes d'un domaine ne mesurent pas la
  même chose. Le modèle est Copernicus DEM GLO-90, servi par Open-Meteo, et le
  point relevé est `viewportHint.center` — **ni village, ni sommet**, ce que le
  fichier porte écrit.

  Les 500 manquants ne sont pas des points fautifs : Open-Meteo compte trois
  quotas — à la minute, à l'heure, au jour — et le relevé les a tous rencontrés
  dans l'ordre. Le journalier est le dernier mot : « Please try again
  tomorrow. » Les identifiants absents forment d'ailleurs une tranche
  alphabétique continue, ce qui dit assez qu'il s'agit d'une fin de parcours et
  non de coordonnées particulières.

  Le script s'arrête désormais net sur n'importe quel `429`, en répétant la
  raison du service mot pour mot, au lieu de marteler puis de rendre des `null`
  muets — ce qu'il faisait, et qui avait fait passer cinq cents refus très
  clairs pour des absences de mesure. Il ne réécrit pas non plus le fichier
  quand un passage n'a rien rapporté : la date dit quand les altitudes ont été
  prises, pas quand on a essayé. `--completer` reprend sans redemander une
  seule altitude déjà obtenue :

  ```
  node --experimental-strip-types scripts/build-dem-monde.ts --completer
  ```
