# Altitudes de station — ce qui était mesuré, et ce qui filtrait

*Constat établi le 2026-08-24, en exécutant le code de l'application sur le
catalogue livré. Aucun appel réseau.*

## Le bug n'était pas dans la donnée

La feuille de route visait un défaut d'altitudes : `referentiel.json` donne
`village: 1260` à Brides-les-Bains, valeur recopiée de son `min`, là où la
réalité est d'environ 600 m. Le champ existe toujours et porte toujours cette
valeur — mais **plus rien ne le lit pour la liste des stations**.

La liste vient du catalogue France Montagnes, et le catalogue porte une
altitude mesurée par station, au point de la station, sur le modèle de terrain
RGE ALTI de l'IGN. Mesuré en construisant la liste affichée :

| | |
| --- | ---: |
| Stations construites | **283** |
| Dont `village` absent dans le catalogue | **0** |
| Dont l'altitude retombe sur le repli `?? min` | **0** |

Les quatre valeurs d'acceptation du chantier, telles que l'application les
calcule :

| Station | Attendu | Mesuré |
| --- | ---: | ---: |
| Brides-les-Bains | ≈ 600 m | **662** |
| Orelle | ≈ 900 m | **988** |
| Val Thorens | ≈ 2 300 m | **2 321** |
| Courchevel | ≈ 1 750 m | **1 779** |

Les 3 Vallées, un seul domaine — `min` 1 110 m, `max` 3 223 m — et huit fronts
de neige distincts : Brides 662, Orelle 988, Le Praz 1 256, Courchevel Village
1 489, Moriond 1 568, Courchevel 1 779, Les Menuires 1 812, Val Thorens 2 321.
Le nom ne ment pas seulement à Brides : « Courchevel 1850 » mesure 1 779 m.

**Conséquence** : les étapes 0 à 2 du chantier — géocodage des coordonnées
manquantes, `tools/enrich-altitudes.mjs`, réécriture de `referentiel.json` —
n'ont pas lieu d'être. Elles remesureraient avec RGE ALTI une donnée que le
même modèle a déjà produite, et réécriraient un champ que l'invariant du
projet réserve au classeur (« le catalogue fait foi pour les altitudes »).

## Le bug était dans le filtre

Le curseur d'altitude et le tri portaient sur `d.min` : le point le plus bas
des pistes du **domaine**, commun à toutes les stations qui le partagent. Sur
65 des 283 stations, cette valeur s'écarte de plus de 400 m du front de neige.

Effet du seuil « au moins 1 800 m », avant et après :

| Mesure filtrée | Stations retenues |
| --- | ---: |
| `d.min` — bas des pistes du domaine | **3** / 283 |
| `d.village` — front de neige de la station | **33** / 283 |

Trente et une stations reparaissent, toutes des stations d'altitude dont le
domaine descend en fond de vallée : Val Thorens, Alpe d'Huez, Arc 1950 et Arc
2000, Aime 2000, Belle Plagne, La Plagne, La Rosière, Bonneval-sur-Arc,
Lanslebourg, Le Fornet… Une seule disparaît, à juste titre : Gavarnie-Gèdre,
village à 1 155 m sous des pistes qui démarrent à 1 820 m.

Le raccourci « Haute altitude » de la page d'accueil pointait sur ce filtre :
il renvoyait trois stations et cachait Val Thorens.

## Ce qui a changé

- `state/selectors.tsx` — le filtre et le tri `altitude_min_desc` lisent
  `d.village`. Le profil d'altitude continue d'afficher `min`–`max` : le bas
  des pistes reste une mesure du domaine, et reste montrée comme telle.
- Le libellé du filtre passe de « Bas des pistes » à **« Front de neige »** —
  la clé i18n `altitude_village`, déjà employée par la carte et la fiche pour
  ce même nombre. Une mesure, un nom.
- `state/appState.tsx` — schéma des préférences 4 → 5. `baseMin`/`baseMax`
  change de mesure : la valeur enregistrée n'est **pas** reportée, la plage
  repart à son défaut. Reconduire le nombre ferait passer pour un choix de
  l'utilisateur une plage qu'il n'a jamais posée sur cette mesure.

Effet de bord assumé du défaut `baseMin: 1200`, qui change de sens avec le
champ : 178 stations le passent désormais contre 147 auparavant. Cinquante-trois
apparaissent, vingt-deux disparaissent — des villages de fond de vallée sous
des pistes hautes (Col d'Ornon, Le Barioz, Prat Peyrot…). Le filtre est moins
restrictif qu'avant, et il filtre enfin ce que son libellé annonce.

## Vérification

`npm run altitudes:test` — 17 contrôles sur la liste affichée, dont les quatre
valeurs d'acceptation, l'absence d'altitude héritée, et le seuil 1 800 m qui
retient Val Thorens et Les Menuires en écartant Brides et Orelle.
