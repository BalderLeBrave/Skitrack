# Référentiel des stations

**233 stations, une par fiche Skiinfo** depuis le 5 octobre 2026 (table
validée : [REFERENTIEL-SKIINFO.md](REFERENTIEL-SKIINFO.md), code :
`src/lib/villages.ts`). Les 230 stations du dépôt, plus Sollières-Sardières,
et deux exceptions sans fiche gardées par le propriétaire : Val d'Ese et
Haut Asco, que Skiinfo cite dans sa page Corse.

Le classeur France Montagnes × OpenSkiMap (284 lignes) reste la source des
chiffres de domaine. Les 83 lignes que seul lui décrivait ne sont plus des
stations : 65 villages rattachés à leur station (Plagne Centre est La Plagne,
Lanslebourg est Val Cenis), 17 lignes sans fiche ni station où les rattacher,
retirées, et « Le Granier », doublon de la station du dépôt. Jusqu'à cette
date, le référentiel comptait 315 puis 313 entrées.

## Stations, villages et grands domaines

- **Une station = une fiche Skiinfo.** Un village sans fiche propre est
  rattaché à sa station (`VILLAGES`) et garde ses coordonnées, avec leur
  source (relevé du 15 septembre 2026, toponyme IGN BD TOPO ou repère du
  classeur). Son identifiant se résout vers la station (`stationById`), sans
  migration de ce qui a été enregistré.
- **Grands domaines reliés** (`grandsDomaines.ts`) : une couche à part, qui
  liste ses stations membres, reliées par les remontées. Jamais un forfait
  commercial (Espace Haute Maurienne Vanoise, Eski-mo, Mont Blanc Unlimited),
  jamais le libellé de domaine d'OpenStreetMap. Le verdict de domaine des
  logements, les voisines du menu « Plus », la puce et la ligne « Domaine
  relié » lisent tous cette table. Un grand domaine ne fusionne aucun
  logement.
- **Rattachement d'un logement** (`rattachement.ts`) : la localité publiée par
  la table, puis le repère le plus proche (station ou village) à 12 km au plus
  (`RATTACHEMENT_MAX_KM`), puis le texte, seulement sans coordonnées. Sans
  rien, le logement est « non rattaché », avec son motif (`trop-loin`,
  `sans-lieu`), et l'écran Logements les compte. Recalculé à chaque relecture
  (`rejugerDomaine`).
- `Listing.stationId` est **la station du relevé** (celle qu'on a cherchée) ;
  la station du logement est `nearestDomainId`.
- Point ouvert : un même bien publié sur deux plateformes reste en double,
  hors des deux preuves que `stay/regroupement.ts` sait lire (identifiant
  CozyCozy, titre identique à moins de 150 m).

## D'où vient chaque chiffre

| Champ                                                             | Source                                                | Échelle     |
| ----------------------------------------------------------------- | ----------------------------------------------------- | ----------- |
| Nom, altitudes vérifiées, IGN RGE ALTI au pin, photo, mix Skiinfo | dépôt (`stations.data.json`, `skiinfo.snapshot.json`) | station     |
| Type, statut, département, commune                                | classeur France Montagnes                             | station     |
| Altitude du village, coordonnées, distance à la piste             | classeur (RGE ALTI au point de la station)            | station     |
| Domaine, km de pistes, tronçons, remontées, comptages par couleur | classeur (OpenSkiMap)                                 | **domaine** |

Une valeur de domaine ne se compare pas à une valeur de fiche. Deux stations
des 3 Vallées portent les mêmes km : c'est le domaine qu'elles partagent.
`pistesKmScale`, `liftsScale` et `colorScale` portent cette distinction jusqu'à
l'écran.

## Rien n'est estimé

Un champ d'échelle domaine vient du domaine de rattachement ou vaut `null`. Un
champ d'échelle station vaut `null` s'il n'est pas mesuré. L'écran affiche
l'absence — « Domaine non renseigné », « Répartition des pistes non relevée » —
il ne la comble pas. Un seuil de filtre actif sur un champ non mesuré écarte la
station plutôt que de la compter comme zéro.

Seuls les km par couleur sont dérivés (part × km du domaine) ; ils sont notés ≈
et n'entrent dans aucun calcul de séjour.

La distance à la piste est mesurée par le classeur depuis son propre repère,
souvent le centre de la commune. Quand la station garde un autre repère
(`GPS_FIXES`, pin du dépôt) à plus de 500 m de celui-là, la mesure décrit un
autre point : elle vaut `null` (`ECART_REPERE_MAX_M`, `stations.ts`).
Lus-la-Jarjatte affichait « piste à 3,1 km » depuis le centre du village, alors
que son repère est à 120 m des remontées. 152 stations gardent la mesure.

Une station sans domaine alpin connu (La Bourboule, `DOMAINES_CORRIGES`) n'est
pas « non renseignée » : l'écran écrit « sans domaine alpin ». Ses altitudes de
pistes valent 0 au référentiel, ce qui n'est pas une mesure.

## Régénérer

```
npm run catalogue:import
```

Lit `docs/sources/stations-ski-france-montagnes.xlsx` et écrit
`src/lib/franceMontagnes.data.ts` (lecture du `.xlsx` : `scripts/xlsx.mjs`).
**Toute correction se fait dans le classeur**,
jamais dans le fichier généré, qui serait écrasé.

Des exceptions vivent dans `src/lib/classeur.ts`, parce qu'elles corrigent le
classeur plutôt que la donnée :

- `DOMAIN_FIXES` — trois rattachements que le vote de proximité du classeur
  rate (Auris en Oisans, Orelle, Samoëns), vérifiés contre le catalogue de
  forfaits.
- `DOMAINES_CORRIGES` — trois rattachements corrigés avec leurs chiffres :
  La Bourboule, sans domaine alpin ; La Bresse-Lispach et Xonrupt, dont le
  classeur décale les libellés.
- `MANUAL_PAIRS` — 49 correspondances qu'aucune règle ne trouve : graphie
  différente, station nommée par son domaine, village-station absorbé.
- `LIGNES_EN_DOUBLE` — quatre lignes qui décrivent une station déjà présente
  (voir [Identifiants](#identifiants)).

Le classeur portait un doublon, « Chamonix Mont-Blanc » et
« Chamonix-Mont-Blanc » aux mêmes coordonnées ; la seconde ligne a été retirée de
la source le 12 septembre 2026. Le garde-fou reste en place à deux niveaux :
`npm run catalogue:import` signale toute ligne en double, et
`CLASSEUR_DUPLICATES` liste celles qu'un appariement écarterait.

## Identifiants

La clé primaire reste celle du dépôt partout où la station y existe. **Les 231
identifiants d'origine survivent tous**, donc aucun `stationId` enregistré dans
un séjour ou un logement ne bouge, et ils n'appellent aucune migration de
données. `stationMigration.test.ts` le vérifie sur les 231, et vérifie aussi
qu'aucune station ajoutée ne réutilise un identifiant ancien.

Deux lignes distinctes du classeur peuvent réclamer le même identifiant. La
seconde n'est pas supprimée : elle reçoit le code INSEE de sa commune en
suffixe, stable d'un import à l'autre là où un numéro de ligne glisserait.
`CLASSEUR_ID_COLLISIONS` les liste ; la liste est vide depuis le 26 septembre
2026.

Cinq identifiants ont été retirés ce jour-là (`IDS_RETIRES`). Quatre lignes du
classeur doublaient une station déjà présente (`LIGNES_EN_DOUBLE`) : « Sainte-Foy
Station », « Saint-Pancrace les Bottières », la seconde ligne « Praloup » et
« Espace Aubrac ». La ligne « Lus la Croix Haute » est appariée à la station du
dépôt `lus-la-jarjatte`. Aucun n'était un identifiant du dépôt. Ils se résolvent
encore : `stationById` rend la station qui les remplace, et le magasin de
parcours (`migrerParcours`, version 3) réécrit la station retenue et la
comparaison enregistrées sous un identifiant retiré.

## `le-granier-vallee-des-entremonts`

Le classeur place une ligne « Le Granier » à Saint-Pierre-de-Chartreuse, à
9,2 km du « Le Granier » du dépôt, avec les mesures du Planolet (vote de
proximité). L'appariement par nom l'exclut (`NAME_MATCH_EXCEPTIONS`), pour ne
pas prêter ces mesures à la station du dépôt. Le 5 octobre 2026, la ligne est
reconnue pour un doublon (`FUSIONS`) : `le-granier` ouvre
`le-granier-vallee-des-entremonts`.

La station du dépôt garde son identifiant et sa fiche. Ce qu'elle n'a pas,
faute de domaine rattaché : domaine, remontées, tronçons par couleur, distance
à la piste. L'écran l'affiche.

## Ce qui ne vaut que pour les stations à fiche

`demM` (IGN RGE ALTI au pin) et la fiche Skiinfo. Les écrans qui les comparent —
`/altitudes`, `/openskimap` — travaillent sur `DEPOT_STATIONS`. Depuis le
5 octobre 2026, c'est tout le référentiel : les 230 du dépôt et les trois
stations ajoutées (Val d'Ese et Haut Asco sans fiche Skiinfo).
