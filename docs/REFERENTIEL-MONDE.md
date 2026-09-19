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

## Ce que le référentiel pèse

| | |
| --- | --- |
| Domaines | 5 720 |
| Pays | 73 |
| Fichiers | 74, dont `index.json` |
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
- **L'Antarctique est dans le référentiel et hors de la navigation.**
  `Kiwi Ski Hill`, un téléski en exploitation près de McMurdo, passe le seuil ;
  `continents.ts` a délibérément posé six continents sans l'Antarctique. Les
  deux décisions sont justes et se contredisent : un écran qui listera « tous
  les pays » devra dire ce qu'il fait de celui-là.
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

- **Aucun relevé de terrain n'est encore stocké pour les 5 720 domaines.**
  `fetchElevations()` les sert à la demande, par lots de 40 points et avec un
  cache de 24 heures, ce dont un écran de fiche se contente. Un cache
  persistant demanderait 143 appels d'un coup à un service public gratuit :
  c'est une décision à prendre, pas à glisser dans une phase.
