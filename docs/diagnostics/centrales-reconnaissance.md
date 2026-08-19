# Reconnaissance des centrales de réservation

*Généré par `npm run centrales:recon` — ne pas éditer à la main.*
*Source des adresses : `docs/sources/centrales-selecteurs.xlsx`, relevé à la main.*
*Deux requêtes par hôte — `robots.txt` puis la page d’accueil —, espacées de 2 s.*
*Aucune recherche n’est lancée : ce rapport dit ce qui est lisible, pas ce qui a été relevé.*

## Chiffres

| | |
| --- | --- |
| Centrales sondées | **50** |
| Stations desservies | 73 |
| Joignables | 47 |
| dont joignables seulement en navigateur | 0 |
| Relevé interdit par robots.txt | **2** |
| Sur Ingénie — déjà couvertes par le connecteur | **27** |
| Plateforme non identifiée | 2 |
| Publient un bloc ld+json | 14 |

## Centrales dont le relevé est interdit

Leur `robots.txt` interdit le chemin. Elles ne sont jamais interrogées ; l’écran
proposera d’ouvrir la page à la main, dates pré-remplies.

- **reservation.combloux.com** — `Disallow: /` — Combloux
- **reservation.montgenevre.com** — `Disallow: /` — Montgenèvre, Les Alberts

## Par plateforme

### Ingénie — 27 centrale(s), 37 station(s)

- `reservation.les2alpes.com` — ld+json — Les 2 Alpes
- `reservation.areches-beaufort.com` — Arêches Beaufort
- `reservation.valdarly-montblanc.com` — formulaire GET — Crest-Voland, Cohennoz, Flumet, Saint-Nicolas-la-Chapelle, La Giettaz en Aravis, Notre-Dame-de-Bellecombe
- `reservation.haute-maurienne-vanoise.com` — La Norma, Val Cenis, Aussois, Bonneval-sur-Arc
- `reservation.larosiere.net` — La Rosière
- `reservation.lessaisies.com` — formulaire GET — Les Saisies
- `fr.locationsaintmartin.com` — formulaire GET — Saint Martin de Belleville, Saint Martin de Belleville
- `www.valloire.com` — formulaire GET — Valloire
- `www.valmeinier-reservation.com` — Valmeinier
- `reservation.courchevel.com` — Courchevel
- `fr.locationlesmenuires.com` — formulaire GET — Les Trois Vallées
- `reservation.valthorens.com` — formulaire GET — Les Trois Vallées
- `www.saintsorlindarves.com` — ld+json · formulaire GET — Les Sybelles
- `www.peisey-vallandry.com` — formulaire GET — Les Arcs
- `reservation.tignes.net` — Tignes - Val d'Isère
- `reservation.valdisere.com` — formulaire GET — Tignes - Val d'Isère
- `www.chamrousse.com` — formulaire GET — Chamrousse
- `reservation.lecollet.com` — formulaire GET — Le Collet d'Allevard
- `reservation.orcieres.com` — Orcières Merlette
- `www.risoul.com` — ld+json · formulaire GET — Forêt Blanche : Vars/Risoul
- `reservation.lesorres.com` — Les Orres
- `reservation.serre-chevalier.com` — formulaire GET — Serre-Chevalier
- `www.valdallos.com` — formulaire GET — Val d'Allos - La Foux, Val d'Allos - Le Seignus
- `resa.saintlary.com` — formulaire GET — Saint Lary
- `www.labresse.net` — ld+json · formulaire GET — La Bresse Hohneck
- `www.ballons-hautes-vosges.com` — formulaire GET — Saint Maurice sur Moselle
- `www.gerardmer-reservation.net` — formulaire GET — Gérardmer

### Open System — 6 centrale(s), 6 station(s)

- `www.valmorel.com` — ld+json · formulaire GET — Valmorel
- `reservation.la-toussuire.com` — Les Sybelles
- `www.valfrejus.com` — ld+json — Valfréjus
- `reservation.ledevoluy.com` — Dévoluy
- `reservation.ax-ski.com` — Ax 3 Domaines
- `www.n-py.com` — ld+json — Grand Tourmalet

### WordPress (moteur non identifié) — 5 centrale(s), 6 station(s)

- `www.karellis.com` — ld+json — Les Karellis
- `www.laclusaz.com` — ld+json · formulaire GET — La Clusaz
- `www.valberg.com` — ld+json · formulaire GET — Valberg
- `www.paysdesecrins.com` — ld+json · formulaire GET — Puy-Saint-Vincent
- `www.sancy.com` — ld+json — Super Besse, le Mont Dore

### Ceto / Orchestra — 3 centrale(s), 14 station(s)

- `booking.chamonix.com` — Chamonix
- `www.laplagneresort.com` — ld+json — Plagne Aime 2000, Belle Plagne, Champagny en Vanoise, Plagne Montalbert, Montchavin les Coches, Plagne 1800, Plagne Bellecote, Plagne Centre, Plagne Soleil, Plagne Villages, Les Hameaux de la Roche, Vallée
- `reservations.meribel.net` — Les Trois Vallées

### non identifiée — 2 centrale(s), 2 station(s)

- `www.reservationpralognan.fr` — Pralognan la Vanoise
- `lesangles.com` — refuse fetch, répond au navigateur · HTTP 403 — Les Angles

### Ublo — 2 centrale(s), 2 station(s)

- `www.saintefoy-reservation.com` — Sainte-Foy Tarentaise
- `reservation.alpedhuez.com` — Alpe d'Huez Grand Domaine

### injoignable — 2 centrale(s), 3 station(s)

- `reservation.combloux.com` — robots: interdit · HTTP échec — Combloux
- `reservation.montgenevre.com` — robots: interdit · HTTP échec — Montgenèvre, Les Alberts

### Eliberty — 1 centrale(s), 1 station(s)

- `reservation.saintfrancoislongchamp.com` — Saint François Longchamp

### Yoplanning — 1 centrale(s), 1 station(s)

- `isola2000.com` — Isola 2000

### Elloha — 1 centrale(s), 1 station(s)

- `www.alpes-sudlocations.com` — ld+json · formulaire GET — Forêt Blanche : Vars/Risoul

## Détail

| Centrale | HTTP | Plateformes | ld+json | chemins interdits | Stations |
| --- | ---: | --- | :-: | --- | --- |
| `reservation.les2alpes.com` | 200 | Ingénie | ✓ | aucun | 1 |
| `booking.chamonix.com` | 200 | Ceto / Orchestra | — | aucun | 1 |
| `reservation.areches-beaufort.com` | 200 | Ingénie | — | aucun | 1 |
| `reservation.valdarly-montblanc.com` | 200 | Ingénie, WordPress (moteur non identifié) | — | aucun | 6 |
| `reservation.haute-maurienne-vanoise.com` | 200 | Ingénie, Open System | — | aucun | 4 |
| `www.laplagneresort.com` | 200 | Ceto / Orchestra | ✓ | aucun | 12 |
| `reservation.larosiere.net` | 200 | Ingénie | — | aucun | 1 |
| `www.karellis.com` | 200 | WordPress (moteur non identifié) | ✓ | aucun | 1 |
| `reservation.lessaisies.com` | 200 | Ingénie | — | aucun | 1 |
| `www.reservationpralognan.fr` | 200 | non identifiée | — | aucun | 1 |
| `reservation.saintfrancoislongchamp.com` | 200 | Eliberty, Ublo, React (moteur embarqué) | — | aucun | 1 |
| `fr.locationsaintmartin.com` | 200 | Ingénie | — | aucun | 2 |
| `www.saintefoy-reservation.com` | 200 | Ublo, React (moteur embarqué) | — | aucun | 1 |
| `www.valloire.com` | 200 | Ingénie | — | aucun | 1 |
| `www.valmeinier-reservation.com` | 200 | Ingénie | — | aucun | 1 |
| `www.valmorel.com` | 200 | Open System, WordPress (moteur non identifié) | ✓ | aucun | 1 |
| `reservation.combloux.com` | échec | relevé interdit par robots.txt | — | `/booking` `/serp` `/recherche` `/reservation` `/hebergements` `/location` | 1 |
| `www.laclusaz.com` | 200 | WordPress (moteur non identifié) | ✓ | aucun | 1 |
| `reservation.alpedhuez.com` | 200 | Ublo, React (moteur embarqué) | — | aucun | 1 |
| `reservation.courchevel.com` | 200 | Ingénie | — | aucun | 1 |
| `fr.locationlesmenuires.com` | 200 | Ingénie | — | aucun | 1 |
| `reservations.meribel.net` | 200 | Ceto / Orchestra | — | pas de robots.txt | 1 |
| `reservation.valthorens.com` | 200 | Ingénie | — | aucun | 1 |
| `reservation.la-toussuire.com` | 200 | Open System | — | pas de robots.txt | 1 |
| `www.saintsorlindarves.com` | 200 | Ingénie, Open System | ✓ | aucun | 1 |
| `www.peisey-vallandry.com` | 200 | Ingénie | — | aucun | 1 |
| `reservation.tignes.net` | 200 | Ingénie | — | aucun | 1 |
| `reservation.valdisere.com` | 200 | Ingénie | — | aucun | 1 |
| `www.valfrejus.com` | 200 | Open System, WordPress (moteur non identifié) | ✓ | aucun | 1 |
| `www.chamrousse.com` | 200 | Ingénie | — | aucun | 1 |
| `reservation.lecollet.com` | 200 | Ingénie | — | aucun | 1 |
| `isola2000.com` | 200 | Yoplanning, WordPress (moteur non identifié) | — | aucun | 1 |
| `reservation.ledevoluy.com` | 200 | Open System | — | pas de robots.txt | 1 |
| `reservation.orcieres.com` | 200 | Ingénie | — | aucun | 1 |
| `www.risoul.com` | 200 | Ingénie | ✓ | aucun | 1 |
| `www.alpes-sudlocations.com` | 200 | Elloha, WooCommerce, WordPress (moteur non identifié) | ✓ | aucun | 1 |
| `www.valberg.com` | 200 | WordPress (moteur non identifié) | ✓ | aucun | 1 |
| `reservation.lesorres.com` | 200 | Ingénie | — | aucun | 1 |
| `reservation.montgenevre.com` | échec | relevé interdit par robots.txt | — | `/booking` `/serp` `/recherche` `/reservation` `/hebergements` `/location` | 2 |
| `www.paysdesecrins.com` | 200 | WordPress (moteur non identifié) | ✓ | aucun | 1 |
| `reservation.serre-chevalier.com` | 200 | Ingénie | — | aucun | 1 |
| `www.valdallos.com` | 200 | Ingénie | — | aucun | 2 |
| `reservation.ax-ski.com` | 200 | Open System, Eliberty | — | aucun | 1 |
| `www.n-py.com` | 200 | Open System | ✓ | aucun | 1 |
| `lesangles.com` | 403 | non identifiée | — | aucun | 1 |
| `resa.saintlary.com` | 200 | Ingénie | — | aucun | 1 |
| `www.sancy.com` | 200 | WordPress (moteur non identifié) | ✓ | aucun | 2 |
| `www.labresse.net` | 200 | Ingénie, Open System, WordPress (moteur non identifié) | ✓ | aucun | 1 |
| `www.ballons-hautes-vosges.com` | 200 | Ingénie | — | aucun | 1 |
| `www.gerardmer-reservation.net` | 200 | Ingénie | — | aucun | 1 |

Les chemins testés sont ceux des plateformes rencontrées — `/booking` pour
Ingénie, `/serp` pour Ceto, puis `/recherche`, `/reservation`, `/hebergements`
et `/location`. Aucun n’a été visité : seule la règle a été lue.

## Ce que ce rapport ne dit pas

Il ne dit rien des **pages de résultats** : ni la forme des cartes, ni où se
trouve le prix. C’est le manque que le relevé versionné laisse ouvert — zéro
sélecteur de prix sur 73 lignes — et il se comble plateforme par plateforme,
en lisant une page de résultats réelle, pas en la devinant.
