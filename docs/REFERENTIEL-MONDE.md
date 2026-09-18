# Référentiel mondial

Frère de `REFERENTIEL.md`, qui décrit les 320 stations françaises et ne bouge
pas. Ce document décrit ce qui vient s'ajouter à côté, pour le reste du monde.

**Il est incomplet, et dit où il s'arrête.** Le fichier de données n'a pas pu
être téléchargé depuis ce poste : la politique de sortie réseau refuse
`openskidata.org` et `openskimap.org`. Tout ce qui dépend d'un chiffre réel est
donc marqué comme tel, et rien n'y est inventé pour faire nombre.

## La source

| | |
| --- | --- |
| Page de téléchargement | `https://openskidata.org` |
| Fichier attendu | `ski_areas.geojson` |
| Date du relevé | **non relevé** |
| Schéma | `openskidata-format`, version 16.0.0, publiée sur npm |

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

`scripts/build-monde.py --recenser` compte la répartition : combien d'entrées
viennent d'OpenStreetMap seul, de Skimap.org seul, et des deux. **Ce comptage
reste à faire**, faute de fichier.

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

Le recensement compte les deux, pour que le choix se fasse sur des effectifs.

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

## Régénérer

```
python3 scripts/build-monde.py --src /tmp/ski_areas.geojson --recenser
```

Recense sans rien écrire. C'est le mode qui produit les chiffres des deux
décisions à prendre : le seuil de sélection, et ce qu'est une station hors de
France.

## Ce qui reste à établir

Tout ce qui suit attend le fichier de données.

- Les effectifs par pays, pour chacun des seuils envisagés.
- Le seuil retenu.
- Le choix entre une station par domaine et une station par localité.
- La liste des domaines à cheval sur une frontière.
- La règle d'identifiant, une fois tranchée la question de la stabilité.
- Les exceptions d'appariement, dans `src/lib/monde/corrections.ts`.
- Les effectifs par continent et par pays.
