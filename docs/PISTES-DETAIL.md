# Détail des pistes par station

La section « Pistes » de la fiche station dit d'abord un résumé, toujours
visible : nombre de pistes, kilomètres, altitudes et piste la plus longue de
Skiinfo (fiche de la station ou de la vallée), remontées d'OpenSkiMap
(domaine), parts de couleur de Skiinfo. Chaque chiffre dit sa source et son
échelle. Le détail OpenSkiMap ne remplace aucun de ces chiffres
(`docs/PISTES.md`).

« Plus de détails » ouvre le tableau piste par piste : nom, couleur,
longueur, dénivelé, altitudes de départ et d'arrivée, damage, éclairage,
secteur. Quand un domaine relie plusieurs stations, le tableau a deux parties :
les pistes de la station, puis celles du domaine entier, qu'on ouvre à part.

## Source

- **openskidata.org, `runs.geojson`**, filtré au périmètre européen par
  `scripts/filtrer-openskidata-europe.py` (`eu-runs.geojson`, un objet par
  ligne). Export du 22 septembre 2026 pour le premier relevé.
- **Aucune statistique publiée par piste.** openskidata ne donne ni longueur
  ni altitude par piste : le script les calcule depuis la géométrie, qui porte
  l'altitude de chaque point. Longueur à plat (haversine) ; départ et arrivée
  au premier et au dernier point ; plus haut et plus bas point, avec la
  position de ce dernier. Une piste publiée comme surface n'a pas de longueur.
- **Damage et éclairage** : `grooming` et `lit`, souvent absents (62 849 et
  110 938 pistes sur 145 911 en Europe) ; absents, ils s'affichent « non
  publié ».

## Station et domaine

Une piste d'openskidata porte tous les domaines qui la contiennent : une piste
de Val Thorens porte « Val Thorens », « Val Thorens - Orelle » et « Les Trois
Vallées ». Un domaine en contient un autre quand il porte au moins 40 % de ses
pistes et en a au moins une fois et demie plus.

- **Domaine de la station** : celui du témoin OpenSkiMap
  (`src/lib/openskimap.snapshot.json`, champ `osmId`).
- **Domaine de tête** : le plus grand qui le contient, ou lui-même. Un fichier
  est écrit par domaine de tête, avec les pistes des domaines qu'il contient.
- **Pistes de la station** (`portionStation`, `src/lib/pistesDetail.ts`) :
  celles de son domaine, moins celles qu'openskidata range dans le domaine
  plus petit d'une station voisine. Quand deux stations partagent le même
  domaine sans secteur publié (Tignes et Val d'Isère, Le Grand Massif, l'Alpe
  d'Huez Grand Domaine), chaque piste va à la station la plus proche de son
  point bas ; la fiche le dit, avec le nombre de tronçons rattachés ainsi.
- **Secteur** : le plus petit domaine publié qui porte la piste, sous celui du
  tableau. Dans le tableau des Trois Vallées, une piste de Val Thorens dit
  « Val Thorens » ; dans celui de Val Thorens, le secteur n'est pas relevé.

Au relevé du 22 septembre 2026, sur 231 stations : 133 seules dans leur
domaine, 17 publiées comme secteur d'un domaine plus grand (Val Thorens dans
Les Trois Vallées, Avoriaz dans Les Portes du Soleil), 57 qui partagent leur
domaine et passent par la proximité, 24 sans détail (témoin `osm_absent`, ou
domaine du témoin sans piste de descente).

Chamonix est le cas inverse : la station couvre plusieurs domaines
d'openskidata (Brévent/Flégère, Les Grands Montets, La Poya…) qu'aucun
domaine plus grand ne réunit. Seul celui du témoin est lu, et le bandeau
d'échelle le dit.

## Sortie

| Fichier | Contenu |
|---|---|
| `public/pistes-detail/<domaine de tête>.json` | les tronçons de descente du domaine et des domaines qu'il contient, chacun avec ses domaines (`a`) et son point bas (`bas`) ; chargé à l'ouverture du tableau |
| `src/lib/pistesDetail.index.json` | pour chaque domaine de tête, son nom, le nombre de tronçons et le cumul des longueurs ; pour chaque station, son fichier, son domaine et les stations qui le partagent |

Un tronçon OSM n'est pas une piste : les tronçons d'un même nom, d'une même
couleur et d'un même secteur sont regroupés à l'affichage, les tronçons sans
nom listés à part.

Poids au relevé du 22 septembre 2026 : 157 fichiers, 2,7 Mo en tout, 280 Ko
pour le plus gros (Les Trois Vallées).

## Identifiant de domaine qui change

openskidata recalcule parfois l'identifiant d'un domaine d'un export à
l'autre : Auron, Les Gets-Morzine, Les Portes du Soleil et Val Cenis ont
changé entre le témoin du 7 septembre et l'export du 22. Le script retrouve
alors le domaine de descente qui porte exactement le même nom, s'il est seul
à le porter. Le rapport les liste. Régénérer le témoin
(`openskimap.snapshot.json`) supprime l'écart.

## Régénérer

```bash
# 1. Télécharger et filtrer les jeux openskidata (voir docs/TUILES-OPENSKIMAP.md)
npm run tuiles:filtrer -- travail travail
# 2. Écrire le détail et lire le rapport
npm run pistes:detail -- travail/eu-runs.geojson travail/eu-ski_areas.geojson 2026-09-22
```

La date est celle du téléchargement ; sans elle, le script prend la date du
fichier. Aucun appel réseau : le script lit deux fois les fichiers filtrés.

Le rapport donne les stations seules, publiées comme secteur, partagées, sans
détail, et celles dont le cumul des tracés s'écarte de plus de 10 % des
kilomètres Skiinfo (stations non partagées). Cet écart s'affiche dans le
tableau, il n'est pas corrigé.
