# Relevé des centrales — ce qui répond et ce qui est renseigné

*Généré par `npm run centrales:sweep` — ne pas éditer à la main.*
*Une recherche par centrale : arrivée le 2027-02-13, 7 nuits, 4 personnes.*
*Une seule tentative, trois centrales interrogées de front.*

## Chiffres

| | |
| --- | --- |
| Centrales interrogées | **3** |
| Qui rendent des offres | **0** |
| Qui répondent sans offre | 0 |
| En échec | 3 |
| Stations couvertes | **0** / 13 |
| Offres relevées | 0 |

## Champs renseignés, sur l’ensemble des offres relevées

| Champ | Part des offres |
| --- | ---: |
| prix | — |
| prix ferme | — |
| personnes | — |
| pièces | — |
| chambres | — |
| surface | — |
| coordonnées | — |
| ville | — |
| photo | — |
| avis | — |
| équipements | — |
| lien | — |

Le **prix ferme** se distingue du prix : une fiche qui affiche « à partir de »
donne un tarif d’appel, pas le prix du séjour demandé. Il est relevé, marqué
comme partiel, et n’entre pas tel quel dans le coût du séjour.

Les **chambres** ne sont pas publiées par ces centrales : elles comptent des
**pièces** — « 2 pièces 4 personnes ». Les deux colonnes disent donc la même
chose sur la donnée disponible, pas sur le connecteur.

## Par centrale

| Centrale | Stations | Offres | Durée | Prix | Personnes | Pièces | Surface | Position | État |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `reservation.alpedhuez.com` | 1 | — | 30 s | — | — | — | — | — | échec : station-web : https://reservation.alpedhuez.com n'expose pas de moteur Ingénie — réservati |
| `reservation.matheysine-tourisme.com` | 1 | — | 24 s | — | — | — | — | — | échec : station-web : https://reservation.matheysine-tourisme.com n'expose pas de moteur Ingénie — |
| `www.laplagneresort.com` | 11 | — | 25 s | — | — | — | — | — | échec : station-web : https://www.laplagneresort.com n'expose pas de moteur Ingénie — réservation  |

## Les échecs, un par un

### `reservation.alpedhuez.com` — Alpe d'Huez

> station-web : https://reservation.alpedhuez.com n'expose pas de moteur Ingénie — réservation par le lien direct.

### `reservation.matheysine-tourisme.com` — Alpe du Grand Serre

> station-web : https://reservation.matheysine-tourisme.com n'expose pas de moteur Ingénie — réservation par le lien direct.

### `www.laplagneresort.com` — Aime 2000, Belle Plagne, Champagny-en-Vanoise, La Plagne, La Plagne Montalbert, Les Coches, Plagne 1800, Plagne Bellecôte, Plagne Centre, Plagne Soleil, Plagne Villages

> station-web : https://www.laplagneresort.com n'expose pas de moteur Ingénie — réservation par le lien direct.

