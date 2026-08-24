# Relevé des centrales — ce qui répond et ce qui est renseigné

*Généré par `npm run centrales:sweep` — ne pas éditer à la main.*
*Une recherche par centrale : arrivée le 2027-02-13, 7 nuits, 4 personnes.*
*Une seule tentative, trois centrales interrogées de front.*

## Chiffres

| | |
| --- | --- |
| Centrales interrogées | **104** |
| Qui rendent des offres | **27** |
| Qui répondent sans offre | 68 |
| En échec | 9 |
| Rattrapées en seconde passe | 0 |
| Stations couvertes | **43** / 157 |
| Offres relevées | 200 |

## Champs renseignés, sur l’ensemble des offres relevées

| Champ | Part des offres |
| --- | ---: |
| prix | 100 % |
| prix ferme | 100 % |
| personnes | 84 % |
| pièces | 52 % |
| chambres | 0 % |
| surface | 95 % |
| coordonnées | 69 % |
| ville | 60 % |
| photo | 69 % |
| avis | 46 % |
| équipements | 2 % |
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
| `booking.prazsurarly.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `booking.valdisere.com` | 1 | 11 | 43 s | 11 | 0 | 0 | 11 | 11 | ok |
| `booking.yoplanning.pro` | 3 | — | 0 s | — | — | — | — | — | aucune offre |
| `font-romeu.fr` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `fr.locationlesmenuires.com` | 1 | 5 | 37 s | 5 | 5 | 4 | 5 | 5 | ok |
| `fr.locationsaintmartin.com` | 1 | 12 | 35 s | 12 | 12 | 12 | 12 | 12 | ok |
| `hiver.auron.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `isola2000.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `lesangles.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `luz-ardiden.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `megeve-booking.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `metabief.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `resa.saintlary.com` | 2 | 6 | 14 s | 6 | 6 | 6 | 6 | 6 | ok |
| `reservation.alpedhuez.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.areches-beaufort.com` | 1 | — | 32 s | — | — | — | — | — | échec : page.goto: NS_ERROR_NET_TIMEOUT |
| `reservation.auris-en-oisans.fr` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.avoriaz.com` | 1 | — | 10 s | — | — | — | — | — | échec : Firefox Playwright indisponible (browserType.launchPersistentContext: Failed to launch the |
| `reservation.ax-ski.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.chamberymontagnes.com` | 1 | 4 | 11 s | 4 | 3 | 0 | 0 | 4 | ok |
| `reservation.combloux.com` | 1 | — | 0 s | — | — | — | — | — | échec : station-web : https://reservation.combloux.com interdit le relevé automatique (robots.txt) |
| `reservation.courchevel.com` | 4 | — | 23 s | — | — | — | — | — | aucune offre |
| `reservation.haute-maurienne-vanoise.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.haute-maurienne-vanoise.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.haute-maurienne-vanoise.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.haute-maurienne-vanoise.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.haute-maurienne-vanoise.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.haute-maurienne-vanoise.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.haute-maurienne-vanoise.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.la-toussuire.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.labresse.net` | 1 | 12 | 24 s | 12 | 12 | 0 | 12 | 0 | ok |
| `reservation.larosiere.net` | 1 | — | 45 s | — | — | — | — | — | échec : Timeout AJAX résultats Ingénie (25s). Sonde: GET … ? https://reservation.larosiere.net/boo |
| `reservation.le-corbier.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.lecollet.com` | 1 | 2 | 7 s | 2 | 2 | 0 | 2 | 2 | ok |
| `reservation.ledevoluy.com` | 3 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.legrandbornand.com` | 1 | — | 31 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.les2alpes.com` | 1 | 12 | 31 s | 12 | 12 | 6 | 12 | 12 | ok |
| `reservation.les7laux.com` | 3 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.lescarroz.com` | 1 | 12 | 34 s | 12 | 12 | 2 | 12 | 0 | ok |
| `reservation.lescontamines.com` | 1 | 2 | 7 s | 2 | 0 | 1 | 2 | 0 | ok |
| `reservation.lesgets.com` | 2 | 2 | 26 s | 2 | 2 | 0 | 0 | 2 | ok |
| `reservation.lesorres.com` | 3 | 12 | 34 s | 12 | 12 | 12 | 12 | 12 | ok |
| `reservation.lessaisies.com` | 3 | 3 | 56 s | 3 | 2 | 3 | 3 | 3 | ok |
| `reservation.matheysine-tourisme.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.montgenevre.com` | 1 | — | 0 s | — | — | — | — | — | échec : station-web : https://reservation.montgenevre.com interdit le relevé automatique (robots.t |
| `reservation.orcieres.com` | 1 | 12 | 18 s | 12 | 12 | 11 | 7 | 12 | ok |
| `reservation.paysdegex-montsjura.com` | 1 | — | 31 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.saintfrancoislongchamp.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.saintsorlindarves.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.samoens.com` | 2 | 12 | 20 s | 12 | 5 | 6 | 12 | 12 | ok |
| `reservation.serre-chevalier.com` | 4 | — | 38 s | — | — | — | — | — | aucune offre |
| `reservation.tignes.net` | 5 | 12 | 34 s | 12 | 12 | 8 | 12 | 12 | ok |
| `reservation.valdarly-montblanc.com` | 4 | 1 | 10 s | 1 | 1 | 0 | 1 | 1 | ok |
| `reservation.valleesdegavarnie.com` | 1 | — | 33 s | — | — | — | — | — | échec : Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué o |
| `reservation.valthorens.com` | 2 | 6 | 30 s | 6 | 6 | 6 | 6 | 6 | ok |
| `reservation.vaujany.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.villard-reculas.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservation.villarddelans-correnconenvercors.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `reservations.meribel.net` | 3 | — | 0 s | — | — | — | — | — | aucune offre |
| `sites.valdabondance.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.alpes-sudlocations.com` | 2 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.ballons-hautes-vosges.com` | 1 | 7 | 11 s | 7 | 7 | 6 | 7 | 0 | ok |
| `www.brides-les-bains.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.chamrousse.com` | 3 | — | 32 s | — | — | — | — | — | échec : page.goto: NS_ERROR_NET_TIMEOUT |
| `www.chatelreservation.com` | 1 | 11 | 47 s | 11 | 11 | 7 | 11 | 11 | ok |
| `www.chioula.fr` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.flaine.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.gerardmer-reservation.net` | 1 | 5 | 14 s | 5 | 5 | 0 | 5 | 0 | ok |
| `www.grand-massif.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.guzet.ski` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.haute-garonne-montagne.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.hirmentaz.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.karellis-reservation.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.lac-blanc.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.laclusaz.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.laplagneresort.com` | 12 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.lelioran.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.leman-mountains-explore.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.lemourtis.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.lesarcs.com` | 2 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.lesrousses-reservation.com` | 2 | 12 | 18 s | 12 | 12 | 0 | 12 | 12 | ok |
| `www.manigod.com` | 1 | — | 12 s | — | — | — | — | — | aucune offre |
| `www.mole-brasses.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.montclar.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.n-py.com` | 3 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.n-py.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.n-py.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.paysdesecrins.com` | 3 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.peisey-vallandry.com` | 1 | 10 | 32 s | 10 | 0 | 2 | 10 | 0 | ok |
| `www.porte-puymorens.net` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.reservationpralognan.fr` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.risoul.com` | 1 | 2 | 10 s | 2 | 2 | 2 | 2 | 0 | ok |
| `www.saintefoy-reservation.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.saintgervais.com` | 2 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.saintjeandarves.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.sancy.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.sancy.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.valberg.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.valdallos.com` | 2 | — | 14 s | — | — | — | — | — | aucune offre |
| `www.valdazun.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.valloire.com` | 1 | 2 | 15 s | 2 | 2 | 2 | 2 | 2 | ok |
| `www.valmeinier-reservation.com` | 1 | 12 | 6 s | 12 | 12 | 8 | 12 | 0 | ok |
| `www.valmorel.com` | 1 | — | 0 s | — | — | — | — | — | aucune offre |
| `www.vercors-experience.com` | 1 | 1 | 26 s | 1 | 1 | 0 | 1 | 1 | ok |

## Les échecs, un par un

### `reservation.areches-beaufort.com` — Arêches-Beaufort

> page.goto: NS_ERROR_NET_TIMEOUT

### `reservation.avoriaz.com` — Avoriaz 1800

> Firefox Playwright indisponible (browserType.launchPersistentContext: Failed to launch the browser process.

### `reservation.combloux.com` — Combloux

> station-web : https://reservation.combloux.com interdit le relevé automatique (robots.txt) — ouvrir le lien de la centrale.

### `reservation.larosiere.net` — La Rosière

> Timeout AJAX résultats Ingénie (25s). Sonde: GET … ? https://reservation.larosiere.net/booking?cid=3&action=getMoteurTypePrestataire&typePrestataire=G&mo | GET 200 application/json https://reservation.larosiere.net/booking?cid=3&action=getMoteurTypePrestataire&typePrestataire=G&mo | GET … ? https://reservation.larosiere.net/booking?action=validDatesDispos&cid=3&type_prestataire=G&date_debu | GET 200 application/json https://reservation.larosiere.net/booking?action=validDatesDispos&cid=3&type_prestataire=G&date_debu | GET … ? https://reservation.larosiere.net/booking?action=getListeDatePossiblesParAnnee&cid=3&type_prestatair | GET 200 text/html https://reservation.larosiere.net/booking?action=getListeDatePossiblesParAnnee&cid=3&type_prestatair | GET … ? https://reservation.larosiere.net/booking?action=result&cid=3&type_prestataire=G&datedeb=13%2F02%2F2 | GET 200 text/html https://reservation.larosiere.net/booking?action=result&cid=3&type_prestataire=G&datedeb=13%2F02%2F2

### `reservation.legrandbornand.com` — Le Grand-Bornand

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `reservation.montgenevre.com` — Montgenèvre

> station-web : https://reservation.montgenevre.com interdit le relevé automatique (robots.txt) — ouvrir le lien de la centrale.

### `reservation.paysdegex-montsjura.com` — Monts Jura

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `reservation.valleesdegavarnie.com` — Gavarnie-Gèdre

> Timeout AJAX formulaire Ingénie (30s) — le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).

### `www.chamrousse.com` — Chamrousse, Chamrousse 1650, Chamrousse 1750

> page.goto: NS_ERROR_NET_TIMEOUT

## Répondent sans offre

Ni erreur ni logement : la centrale a accepté la recherche et n’a rien à
proposer pour ces dates, ou sa page de résultats ne se lit pas comme celle
d’Ingénie. Les deux se distinguent en ouvrant le lien.

- `booking.chamonix.com` — Chamonix-Mont-Blanc, Les Houches, Vallorcine
- `booking.prazsurarly.com` — Praz-sur-Arly
- `booking.yoplanning.pro` — Pra Loup 1500, Pra Loup 1600, Pra-Loup
- `font-romeu.fr` — Font-Romeu
- `hiver.auron.com` — Auron
- `isola2000.com` — Isola 2000
- `lesangles.com` — Les Angles
- `luz-ardiden.com` — Luz-Ardiden
- `megeve-booking.com` — Megève
- `metabief.com` — Métabief
- `reservation.alpedhuez.com` — Alpe d'Huez
- `reservation.auris-en-oisans.fr` — Auris-en-Oisans
- `reservation.ax-ski.com` — Ax 3 Domaines
- `reservation.courchevel.com` — Courchevel, Courchevel Le Praz, Courchevel Moriond 1650, Courchevel Village 1550
- `reservation.haute-maurienne-vanoise.com` — Aussois
- `reservation.haute-maurienne-vanoise.com` — Bessans
- `reservation.haute-maurienne-vanoise.com` — Bonneval-sur-Arc
- `reservation.haute-maurienne-vanoise.com` — La Norma
- `reservation.haute-maurienne-vanoise.com` — Termignon
- `reservation.haute-maurienne-vanoise.com` — Val Cenis
- `reservation.haute-maurienne-vanoise.com` — Valfréjus
- `reservation.la-toussuire.com` — La Toussuire
- `reservation.le-corbier.com` — Le Corbier
- `reservation.ledevoluy.com` — La Joue du Loup, Le Dévoluy, Super-Dévoluy
- `reservation.les7laux.com` — Le Pleynet, Les 7 Laux, Prapoutel
- `reservation.matheysine-tourisme.com` — Alpe du Grand Serre
- `reservation.saintfrancoislongchamp.com` — Saint-François-Longchamp
- `reservation.saintsorlindarves.com` — Saint-Sorlin-d’Arves
- `reservation.serre-chevalier.com` — Serre Chevalier Briancon, Serre Chevalier Chantemerle, Serre Chevalier Le Monêtier, Serre Chevalier Villeneuve
- `reservation.vaujany.com` — Vaujany
- `reservation.villard-reculas.com` — Villard-Reculas
- `reservation.villarddelans-correnconenvercors.com` — Villard-de-Lans – Corrençon
- `reservations.meribel.net` — Méribel, Méribel Village, Méribel-Mottaret
- `sites.valdabondance.com` — Abondance
- `www.alpes-sudlocations.com` — Vars, Vars Sainte-Marie
- `www.brides-les-bains.com` — Brides-les-Bains
- `www.chioula.fr` — Le Chioula
- `www.flaine.com` — Flaine
- `www.grand-massif.com` — Morillon
- `www.guzet.ski` — Guzet
- `www.haute-garonne-montagne.com` — Superbagnères
- `www.hirmentaz.com` — Hirmentaz
- `www.karellis-reservation.com` — Les Karellis
- `www.lac-blanc.com` — Le Lac Blanc
- `www.laclusaz.com` — La Clusaz
- `www.laplagneresort.com` — Aime 2000, Belle Plagne, Champagny-en-Vanoise, La Plagne, La Plagne Montalbert, Les Coches, Montchavin La Plagne, Plagne 1800, Plagne Bellecôte, Plagne Centre, Plagne Soleil, Plagne Villages
- `www.lelioran.com` — Le Lioran
- `www.leman-mountains-explore.com` — Thollon-les-Mémises
- `www.lemourtis.com` — Le Mourtis
- `www.lesarcs.com` — Les Arcs Bourg St Maurice, Villaroger
- `www.manigod.com` — Manigod/Col de Merdassier
- `www.mole-brasses.com` — Les Brasses
- `www.montclar.com` — Montclar
- `www.n-py.com` — Barèges, Grand Tourmalet, La Mongie
- `www.n-py.com` — Peyragudes
- `www.n-py.com` — Piau-Engaly
- `www.paysdesecrins.com` — Puy-Saint-Vincent, Puy-Saint-Vincent 1600, Puy-Saint-Vincent 1800
- `www.porte-puymorens.net` — Porté-Puymorens
- `www.reservationpralognan.fr` — Pralognan-la-Vanoise
- `www.saintefoy-reservation.com` — Sainte-Foy-Tarentaise
- `www.saintgervais.com` — Saint-Gervais Mont-Blanc, Saint-Nicolas-de-Véroce
- `www.saintjeandarves.com` — Saint-Jean-d’Arves
- `www.sancy.com` — Besse Super Besse
- `www.sancy.com` — Le Mont-Dore
- `www.valberg.com` — Valberg
- `www.valdallos.com` — Le Seignus, Val d'Allos
- `www.valdazun.com` — Val d’Azun
- `www.valmorel.com` — Valmorel

