# Rapport d'extraction — capacité et position

Mesures du **30 août 2026**, sur des fiches réelles, sans authentification.
Chaque chemin cité ci-dessous a été relevé par `discover.py` sur la fiche
nommée, et non recopié d'une documentation.

## Taux de succès

Sur le lot d'épreuve — deux fiches valides par plate-forme, plus les cas de
bord — hors URL mortes, qui sont des succès de robustesse et non d'extraction :

| Plate-forme | Fiches valides | Capacité | Position | Statut `ok` |
| --- | --- | --- | --- | --- |
| Airbnb | 2 | 2 / 2 | 2 / 2 | 2 / 2 |
| Booking | 2 | 2 / 2 | 2 / 2 | 2 / 2 |

Les cas de bord — fiche inexistante Booking, identifiant Airbnb invalide, URL
d'un autre site — sortent tous en `not_found` sans plantage.

## Chemins qui ont fonctionné

### Airbnb

La fiche **ne porte plus ses données dans le DOM**. Aucun
`<script type="application/json">` exploitable : `discover.py` a lu zéro blob
sur une page de 942 Ko servie normalement. Tout arrive par le réseau, dans
`/api/v3/StaysPdpSections`.

| Donnée | Chemin | Fiche 40088811 | Fiche 5520726 |
| --- | --- | --- | --- |
| Capacité | `$.data.presentation.stayProductDetailPage.sections.metadata.sharingConfig.personCapacity` | 2 | 4 |
| Capacité (confirmation) | `$.data.node.personCapacity` | 2 | 4 |
| Position | `$.data.node.location.coordinate.latitude` / `.longitude` | 45.456 / 6.9001 | 45.45467 / 6.89779 |

Quatre chemins portent la même capacité et s'accordaient sur les deux fiches.
Le premier est retenu ; les autres servent de repli.

Corroboration indépendante : le titre de la fiche 5520726 est « Appartement de
deux chambres pour **quatre** personnes », et la capacité extraite vaut 4.

### Booking

Tout est dans le magasin Apollo, `script[data-capla-store-data="apollo"]`.

| Donnée | Chemin |
| --- | --- |
| Capacité d'une unité | `[apollo].RTRoomCard:{"roomId":…}.occupancy.maxPersons` |
| Couchage par pièce | `[apollo].RDSApartmentRoom:<id>.maxPersons` |
| Position | `[apollo].BasicPropertyData:<id>.location.latitude` / `.longitude` |

Replis prévus et non nécessaires sur les fiches testées :
`data-atlas-latlng` dans le HTML, puis `geo` du bloc `application/ld+json`.

## Booking : hôtel contre appartement

C'est la distinction que le brief exigeait, et elle se lit dans la forme du
magasin — mesurée sur deux fiches de la même station.

| | `type-relax-challeet-val-frejus` | `le-valfrejus` |
| --- | --- | --- |
| Nature | maison entière | hôtel |
| `RTRoomCard` | **1**, à 10 personnes | **6**, à 2, 2, 3, 4, 5, 6 |
| `RDSApartmentRoom` | 6 pièces : 1, 2, 2, 2, 2, 1 | aucun |
| `guest_capacity_max` | **10** | **null** |
| `capacity_scope` | `listing` | `room_type` |
| `room_types[]` | vide | 6 entrées nommées |

La règle retenue : **une seule** unité, c'est la capacité du logement ;
**plusieurs**, ce sont des types de chambre et le logement n'a pas de capacité
propre. Additionner les six chambres de l'hôtel donnerait « 22 personnes », un
nombre que Booking n'affiche nulle part.

La somme des pièces de l'appartement (1+2+2+2+2+1 = 10) tombe juste sur le
`maxPersons` publié. L'écart, quand il existe, est **signalé** en avertissement
et jamais corrigé : la valeur publiée fait foi, la somme n'est qu'un contrôle.

## Airbnb : le cas du cercle

Aucune des deux fiches ne publie de clé de précision — ni `isLocationExact`, ni
`showExactLocation`. Et Airbnb ne publie pas d'adresse exacte avant
réservation : le point sert de centre à une zone.

`gps_precision` vaut donc **`approximate_public`** et `map_display_type`
vaut `circle`, avec l'avertissement `GPS_CIRCLE_ONLY`. Une garde de validation
ajoute un avertissement si `exact_public` devait un jour apparaître sur Airbnb :
rien dans les fiches observées ne le justifierait.

**Piège écarté.** Le nombre de décimales ne mesure pas la précision : 4
décimales sur une fiche, 5 sur l'autre, pour la même qualité de position. Une
première version de la note en déduisait « environ 10 m » — c'était faux, et
une précision affichée supérieure à la précision réelle est pire qu'aucune
précision affichée. La note dit maintenant les deux séparément.

## Pièges rencontrés, et ce qu'ils coûtent

**Un détecteur de blocage trop large.** La première version cherchait le mot
« captcha » n'importe où dans le HTML. Sur une fiche Airbnb servie normalement
— HTTP 200, 942 Ko, titre réel — le mot apparaissait une fois dans un bundle
JavaScript, et toute la plate-forme sortait en `blocked`. Le critère porte
maintenant sur des marqueurs spécifiques **et** une page courte (< 20 Ko), et
le motif retenu est rapporté dans le diagnostic. Un détecteur qui crie au loup
fait renoncer à une page qui répondait.

**Des positions qui ne sont pas le logement.** Le magasin Apollo de
`le-valfrejus` porte un `SkiLift:42395` à `(0, 0)`. La position n'est donc lue
que sur `BasicPropertyData`, et `(0, 0)` est refusé — c'est le large du golfe
de Guinée, jamais un logement.

**Le statut par défaut.** `extraction_status` vaut `not_found` à la
construction, et la validation excluait cette valeur de ses mises à jour :
trois extractions réussies sortaient en `not_found`. Seuls `blocked` et
`parse_error` survivent maintenant à cette étape.

## Ce qu'il faudra changer si le schéma bouge

L'ordre est toujours le même, et il commence par la reconnaissance :

1. `discover.py --url <fiche>` sur une fiche témoin de la plate-forme touchée.
   Le rapport dit quels chemins existent aujourd'hui, et liste les clés de
   premier niveau quand rien ne correspond.
2. Comparer aux listes `AIRBNB_CAPACITE`, `AIRBNB_POSITION` de `parsers.py`.
3. Ajouter le nouveau chemin **en tête** de liste, garder l'ancien en dessous.

Entre-temps, l'outil ne se tait pas : la recherche récursive de repli trouve les
mêmes clés ailleurs et marque le résultat `JSON_SCHEMA_CHANGED`. La valeur reste
utilisable, avec le signal qu'il faut relancer la reconnaissance.

## Recours si le blocage devient permanent

Dans l'ordre, et sans jamais franchir la ligne :

1. **Rejouer** avec consentement traité et défilement jusqu'à la carte — déjà
   fait par `fetch.py`.
2. **Intercepter le réseau** plutôt que le DOM. C'est déjà le chemin normal
   pour Airbnb, et c'est ce qui a sauvé cette plate-forme.
3. **Mode HAR.** L'utilisateur ouvre la fiche dans son propre navigateur,
   enregistre la session, et `--from-har` en tire les mêmes valeurs sans
   qu'aucune requête ne parte de l'outil.
4. **Voie officielle.** Pour Airbnb, un serveur MCP communautaire existe
   (`mcp-server-airbnb`) ; interrogé le 2026-08-30, il a **refusé** la fiche au
   motif que `robots.txt` interdit ce chemin à son user-agent, et proposé une
   option pour l'ignorer. Elle n'a pas été utilisée : passer outre un
   `robots.txt` est exactement l'escalade que ce projet s'interdit. La voie
   durable est un accord de partenariat, pas un drapeau de contournement.

**Ce qui n'est pas fait, et ne le sera pas** : ferme de comptes, rotation
agressive d'identités, résolution de captcha, contournement de pare-feu
applicatif. Un blocage se documente ; il ne se force pas.
