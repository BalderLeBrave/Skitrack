# Relevé des centrales — ce qui répond et ce qui est renseigné

*Généré par `npm run centrales:sweep` — ne pas éditer à la main.*
*Une recherche par centrale : arrivée le 2027-01-09, 7 nuits, 2 personnes.*
*Une seule tentative, trois centrales interrogées de front.*

## Chiffres

| | |
| --- | --- |
| Centrales interrogées | **79** |
| Qui rendent des offres | **24** |
| Qui répondent sans offre | 33 |
| En échec | 22 |
| Rattrapées en seconde passe | 0 |
| Stations couvertes | **45** / 122 |
| Offres relevées | 200 |

## Champs renseignés, sur l’ensemble des offres relevées

| Champ | Part des offres |
| --- | ---: |
| prix | 100 % |
| prix ferme | 100 % |
| personnes | 87 % |
| pièces | 44 % |
| chambres | 0 % |
| surface | 82 % |
| coordonnées | 82 % |
| ville | 81 % |
| photo | 82 % |
| avis | 44 % |
| équipements | 5 % |
| lien | 100 % |

Le **prix ferme** se distingue du prix : une fiche qui affiche « à partir de »
donne un tarif d’appel, pas le prix du séjour demandé. Il est relevé, marqué
comme partiel, et n’entre pas tel quel dans le coût du séjour.

Les **chambres** ne sont pas publiées par ces centrales : elles comptent des
**pièces** — « 2 pièces 4 personnes ». Les deux colonnes disent donc la même
chose sur la donnée disponible, pas sur le connecteur.

## Par centrale

| Centrale | Stations | Offres | Durée | Prix | Personnes | Pièces | Surface | Position | État |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `booking.chamonix.com` | 3 | — | 0 s | — | — | — | — | — | aucune offre |
| `booking.prazsurarly.com` | 1 | — | 30 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `booking.valdisere.com` | 1 | — | 17 s | — | — | — | — | — | échec : page.click: Timeout 15000ms exceeded. |
| `font-romeu.fr` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `fr.locationlesmenuires.com` | 1 | 12 | 12 s | 12 | 12 | 0 | 12 | 12 | ok |
| `fr.locationsaintmartin.com` | 1 | 12 | 13 s | 12 | 12 | 11 | 12 | 12 | ok |
| `hiver.auron.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `isola2000.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `lesangles.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `megeve-booking.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `resa.saintlary.com` | 2 | 11 | 7 s | 11 | 8 | 5 | 11 | 11 | ok |
| `reservation.alpedhuez.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.areches-beaufort.com` | 1 | 8 | 30 s | 8 | 7 | 0 | 8 | 8 | ok |
| `reservation.auris-en-oisans.fr` | 1 | — | 32 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.avoriaz.com` | 1 | 9 | 9 s | 9 | 8 | 8 | 9 | 9 | ok |
| `reservation.ax-ski.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.bareges.com` | 2 | — | 31 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.chamberymontagnes.com` | 1 | 11 | 6 s | 11 | 10 | 0 | 0 | 11 | ok |
| `reservation.combloux.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.courchevel.com` | 4 | 8 | 9 s | 8 | 8 | 6 | 0 | 8 | ok |
| `reservation.haute-maurienne-vanoise.com` | 1 | — | 31 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.haute-maurienne-vanoise.com` | 1 | — | 31 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.haute-maurienne-vanoise.com` | 1 | — | 31 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.haute-maurienne-vanoise.com` | 1 | — | 0 s | — | — | — | — | — | échec : station-web : source écartée après 3 échecs — nouvelle tentative dans 23 s |
| `reservation.haute-maurienne-vanoise.com` | 1 | — | 0 s | — | — | — | — | — | échec : station-web : source écartée après 3 échecs — nouvelle tentative dans 23 s |
| `reservation.la-toussuire.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.larosiere.net` | 1 | 7 | 11 s | 7 | 7 | 4 | 7 | 7 | ok |
| `reservation.le-corbier.com` | 1 | — | 31 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.lecollet.com` | 1 | 9 | 6 s | 9 | 8 | 0 | 9 | 9 | ok |
| `reservation.ledevoluy.com` | 3 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.les2alpes.com` | 1 | 12 | 17 s | 12 | 12 | 1 | 12 | 12 | ok |
| `reservation.les7laux.com` | 3 | — | 31 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.lescarroz.com` | 1 | — | 17 s | — | — | — | — | — | échec : page.click: Timeout 15000ms exceeded. |
| `reservation.lescontamines.com` | 1 | 2 | 3 s | 2 | 0 | 1 | 2 | 0 | ok |
| `reservation.lesgets.com` | 1 | 10 | 20 s | 10 | 9 | 0 | 0 | 10 | ok |
| `reservation.lesorres.com` | 3 | 12 | 14 s | 12 | 12 | 12 | 12 | 12 | ok |
| `reservation.lessaisies.com` | 2 | 8 | 22 s | 8 | 0 | 2 | 8 | 8 | ok |
| `reservation.matheysine-tourisme.com` | 1 | — | 38 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.montgenevre.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.orcieres.com` | 1 | 12 | 8 s | 12 | 12 | 11 | 7 | 12 | ok |
| `reservation.paysdegex-montsjura.com` | 1 | — | 31 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.saintfrancoislongchamp.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.saintsorlindarves.com` | 1 | — | 31 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.samoens.com` | 2 | 12 | 9 s | 12 | 9 | 0 | 12 | 12 | ok |
| `reservation.serre-chevalier.com` | 4 | 4 | 9 s | 4 | 4 | 4 | 4 | 4 | ok |
| `reservation.tignes.net` | 5 | 4 | 21 s | 4 | 4 | 2 | 4 | 4 | ok |
| `reservation.valdarly-montblanc.com` | 4 | 1 | 5 s | 1 | 1 | 0 | 1 | 1 | ok |
| `reservation.valleesdegavarnie.com` | 1 | — | 32 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.valthorens.com` | 2 | 2 | 9 s | 2 | 2 | 1 | 1 | 2 | ok |
| `reservation.vaujany.com` | 1 | — | 31 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.villard-reculas.com` | 1 | — | 31 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.villarddelans-correnconenvercors.com` | 1 | — | 30 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservations.meribel.net` | 3 | — | 0 s | — | — | — | — | — | aucune offre |
| `skipass.lansenvercors.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.ballons-hautes-vosges.com` | 1 | — | 12 s | — | — | — | — | — | aucune offre |
| `www.chamrousse.com` | 3 | 12 | 8 s | 12 | 7 | 6 | 12 | 0 | ok |
| `www.chatelreservation.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.gerardmer-reservation.net` | 1 | 8 | 9 s | 8 | 8 | 0 | 8 | 0 | ok |
| `www.karellis.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.labresse.net` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.laclusaz.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.laplagneresort.com` | 11 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.leman-mountains-explore.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.montclar.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.n-py.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.n-py.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.paysdesecrins.com` | 3 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.peisey-vallandry.com` | 1 | — | 24 s | — | — | — | — | — | échec : page.click: Timeout 15000ms exceeded. |
| `www.reservationpralognan.fr` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.risoul.com` | 1 | 2 | 6 s | 2 | 2 | 2 | 2 | 0 | ok |
| `www.saintefoy-reservation.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.sancy.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.sancy.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.valberg.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.valdallos.com` | 2 | — | 17 s | — | — | — | — | — | échec : page.click: Timeout 15000ms exceeded. |
| `www.valfrejus.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.valloire.com` | 1 | — | 17 s | — | — | — | — | — | échec : page.click: Timeout 15000ms exceeded. |
| `www.valmeinier-reservation.com` | 1 | 12 | 4 s | 12 | 12 | 11 | 11 | 0 | ok |
| `www.valmorel.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |

## Les échecs, un par un

### `booking.prazsurarly.com` — Praz-sur-Arly

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `booking.valdisere.com` — Val d’Isère

> page.click: Timeout 15000ms exceeded.

### `reservation.auris-en-oisans.fr` — Auris-en-Oisans

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `reservation.bareges.com` — Barèges, La Mongie

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `reservation.haute-maurienne-vanoise.com` — Aussois

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `reservation.haute-maurienne-vanoise.com` — Bonneval-sur-Arc

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `reservation.haute-maurienne-vanoise.com` — La Norma

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `reservation.haute-maurienne-vanoise.com` — Termignon

> station-web : source écartée après 3 échecs — nouvelle tentative dans 23 s

### `reservation.haute-maurienne-vanoise.com` — Val Cenis

> station-web : source écartée après 3 échecs — nouvelle tentative dans 23 s

### `reservation.le-corbier.com` — Le Corbier

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `reservation.les7laux.com` — Le Pleynet, Les 7 Laux, Prapoutel

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `reservation.lescarroz.com` — Les Carroz d’Arâches

> page.click: Timeout 15000ms exceeded.

### `reservation.matheysine-tourisme.com` — Alpe du Grand Serre

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `reservation.paysdegex-montsjura.com` — Monts Jura

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `reservation.saintsorlindarves.com` — Saint-Sorlin-d’Arves

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `reservation.valleesdegavarnie.com` — Gavarnie-Gèdre

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `reservation.vaujany.com` — Vaujany

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `reservation.villard-reculas.com` — Villard-Reculas

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `reservation.villarddelans-correnconenvercors.com` — Villard-de-Lans – Corrençon

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `www.peisey-vallandry.com` — Peisey-Vallandry

> page.click: Timeout 15000ms exceeded.

### `www.valdallos.com` — Le Seignus, Val d'Allos

> page.click: Timeout 15000ms exceeded.

### `www.valloire.com` — Valloire

> page.click: Timeout 15000ms exceeded.

## Répondent sans offre

Ni erreur ni logement : la centrale a accepté la recherche et n’a rien à
proposer pour ces dates, ou sa page de résultats ne se lit pas comme celle
d’Ingénie. Les deux se distinguent en ouvrant le lien.

- `booking.chamonix.com` — Chamonix-Mont-Blanc, Les Houches, Vallorcine
- `font-romeu.fr` — Font-Romeu
- `hiver.auron.com` — Auron
- `isola2000.com` — Isola 2000
- `lesangles.com` — Les Angles
- `megeve-booking.com` — Megève
- `reservation.alpedhuez.com` — Alpe d'Huez
- `reservation.ax-ski.com` — Ax 3 Domaines
- `reservation.combloux.com` — Combloux
- `reservation.la-toussuire.com` — La Toussuire
- `reservation.ledevoluy.com` — La Joue du Loup, Le Dévoluy, Super-Dévoluy
- `reservation.montgenevre.com` — Montgenèvre
- `reservation.saintfrancoislongchamp.com` — Saint-François-Longchamp
- `reservations.meribel.net` — Méribel, Méribel Village, Méribel-Mottaret
- `skipass.lansenvercors.com` — Lans-en-Vercors
- `www.ballons-hautes-vosges.com` — Saint-Maurice-sur-Moselle
- `www.chatelreservation.com` — Châtel
- `www.karellis.com` — Les Karellis
- `www.labresse.net` — La Bresse Hohneck
- `www.laclusaz.com` — La Clusaz
- `www.laplagneresort.com` — Aime 2000, Belle Plagne, Champagny-en-Vanoise, La Plagne, La Plagne Montalbert, Les Coches, Plagne 1800, Plagne Bellecôte, Plagne Centre, Plagne Soleil, Plagne Villages
- `www.leman-mountains-explore.com` — Thollon-les-Mémises
- `www.montclar.com` — Montclar
- `www.n-py.com` — Grand Tourmalet
- `www.n-py.com` — Peyragudes
- `www.paysdesecrins.com` — Puy-Saint-Vincent, Puy-Saint-Vincent 1600, Puy-Saint-Vincent 1800
- `www.reservationpralognan.fr` — Pralognan-la-Vanoise
- `www.saintefoy-reservation.com` — Sainte-Foy-Tarentaise
- `www.sancy.com` — Besse Super Besse
- `www.sancy.com` — Le Mont-Dore
- `www.valberg.com` — Valberg
- `www.valfrejus.com` — Valfréjus
- `www.valmorel.com` — Valmorel

