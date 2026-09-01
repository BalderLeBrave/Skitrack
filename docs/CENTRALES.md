# CENTRALES.md

Source de vérité : `src/main/providers/station/centrals.ts` (généré par `npm run centrales:import` depuis `docs/sources/centrales-selecteurs.xlsx`).

**Lu en entier.** 74 entrées, 52 hôtes, 72 centrales locales + 2 OTA.

## Import vivant

`CENTRALS` est importé par `src/main/providers/station/centralLookup.ts`
(`centralsLoaded`, `familyOfHost`, `emptyStationReason`). `aggregateResults`
pose un `reasonCode` (`not_wired` / `delegated` / `empty_inventory`) sur un
`station-web` muet au lieu d’un zéro silencieux.

Le moteur n’itère pas la table pour lancer 74 adapters : une recherche passe
`SearchParams.officialUrl` à `station-web` **et** aux familles Ceto / Ublo /
Open System / Deskline / LocVacances / Diffusio. La table sert à **nommer** l’hôte, pas à inventer un parseur.

VRBO, Gîtes de France, CozyCozy **ne sont pas** dans `CENTRALS`. Ils existent
comme connecteurs webscrape enregistrés dans `buildEngine`.

## Légende `enabled`

| valeur | sens |
| --- | --- |
| yes | un `AccommodationProvider` est `register()` dans `buildEngine` **et** peut être sollicité si `officialUrl` / destination matche |
| partial | code de recherche existant, hors `SearchEngine` |
| no | `status=not_wired` — pas d’adapter importable pour cet hôte |

## Tableau (74/74)

| id | nom | hostnames | adapter_file | search_fn | listing_fn | geo_fn | enabled | station_coverage | family | selectors | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| c00-reservation-les2alpes-com | Les 2 Alpes | reservation.les2alpes.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Les 2 Alpes | ingenie | checkIn, checkOut, guests, submit |  |
| c01-booking-chamonix-com | Chamonix | booking.chamonix.com | src/main/providers/ceto/{chamonix,meribel,plagne,megeve}.ts | createCeto*Provider.search | chamonixParse.ts / occupancy.ts | JSON-LD / parse Ceto | yes | Chamonix | ceto | lodging, checkIn, checkOut, guests, submit |  |
| c02-reservation-areches-beaufort-com | Arêches Beaufort | reservation.areches-beaufort.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Arêches Beaufort | ingenie | lodging, stayType, checkIn, duration, guests, submit |  |
| c03-reservation-valdarly-montblanc-com | Crest-Voland | reservation.valdarly-montblanc.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Crest-Voland | ingenie | station, lodging, stayType, checkIn, duration, guests, submit |  |
| c04-reservation-valdarly-montblanc-com | Cohennoz | reservation.valdarly-montblanc.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Cohennoz | ingenie | station, lodging, stayType, checkIn, duration, guests, submit |  |
| c05-reservation-valdarly-montblanc-com | Flumet | reservation.valdarly-montblanc.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Flumet | ingenie | station, lodging, stayType, checkIn, duration, guests, submit |  |
| c06-reservation-valdarly-montblanc-com | Saint-Nicolas-la-Chapelle | reservation.valdarly-montblanc.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Saint-Nicolas-la-Chapelle | ingenie | station, lodging, stayType, checkIn, duration, guests, submit |  |
| c07-reservation-valdarly-montblanc-com | La Giettaz en Aravis | reservation.valdarly-montblanc.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | La Giettaz en Aravis | ingenie | station, lodging, stayType, checkIn, duration, guests, submit |  |
| c08-reservation-valdarly-montblanc-com | Notre-Dame-de-Bellecombe | reservation.valdarly-montblanc.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Notre-Dame-de-Bellecombe | ingenie | station, lodging, stayType, checkIn, duration, guests, submit |  |
| c09-reservation-haute-maurienne-vanoise-com | La Norma | reservation.haute-maurienne-vanoise.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | La Norma | ingenie | lodging, checkIn, checkOut, guests |  |
| c10-www-laplagneresort-com | Plagne Aime 2000 | www.laplagneresort.com | src/main/providers/ceto/{chamonix,meribel,plagne,megeve}.ts | createCeto*Provider.search | chamonixParse.ts / occupancy.ts | JSON-LD / parse Ceto | yes | Plagne Aime 2000 | ceto | station, checkIn, duration, submit |  |
| c11-www-laplagneresort-com | Belle Plagne | www.laplagneresort.com | src/main/providers/ceto/{chamonix,meribel,plagne,megeve}.ts | createCeto*Provider.search | chamonixParse.ts / occupancy.ts | JSON-LD / parse Ceto | yes | Belle Plagne | ceto | station, checkIn, duration, submit |  |
| c12-www-laplagneresort-com | Champagny en Vanoise | www.laplagneresort.com | src/main/providers/ceto/{chamonix,meribel,plagne,megeve}.ts | createCeto*Provider.search | chamonixParse.ts / occupancy.ts | JSON-LD / parse Ceto | yes | Champagny en Vanoise | ceto | station, checkIn, duration, submit |  |
| c13-www-laplagneresort-com | Plagne Montalbert | www.laplagneresort.com | src/main/providers/ceto/{chamonix,meribel,plagne,megeve}.ts | createCeto*Provider.search | chamonixParse.ts / occupancy.ts | JSON-LD / parse Ceto | yes | Plagne Montalbert | ceto | station, checkIn, duration, submit |  |
| c14-www-laplagneresort-com | Montchavin les Coches | www.laplagneresort.com | src/main/providers/ceto/{chamonix,meribel,plagne,megeve}.ts | createCeto*Provider.search | chamonixParse.ts / occupancy.ts | JSON-LD / parse Ceto | yes | Montchavin les Coches | ceto | station, checkIn, duration, submit |  |
| c15-www-laplagneresort-com | Plagne 1800 | www.laplagneresort.com | src/main/providers/ceto/{chamonix,meribel,plagne,megeve}.ts | createCeto*Provider.search | chamonixParse.ts / occupancy.ts | JSON-LD / parse Ceto | yes | Plagne 1800 | ceto | station, checkIn, duration, submit |  |
| c16-www-laplagneresort-com | Plagne Bellecote | www.laplagneresort.com | src/main/providers/ceto/{chamonix,meribel,plagne,megeve}.ts | createCeto*Provider.search | chamonixParse.ts / occupancy.ts | JSON-LD / parse Ceto | yes | Plagne Bellecote | ceto | station, checkIn, duration, submit |  |
| c17-www-laplagneresort-com | Plagne Centre | www.laplagneresort.com | src/main/providers/ceto/{chamonix,meribel,plagne,megeve}.ts | createCeto*Provider.search | chamonixParse.ts / occupancy.ts | JSON-LD / parse Ceto | yes | Plagne Centre | ceto | station, checkIn, duration, submit |  |
| c18-www-laplagneresort-com | Plagne Soleil | www.laplagneresort.com | src/main/providers/ceto/{chamonix,meribel,plagne,megeve}.ts | createCeto*Provider.search | chamonixParse.ts / occupancy.ts | JSON-LD / parse Ceto | yes | Plagne Soleil | ceto | station, checkIn, duration, submit |  |
| c19-www-laplagneresort-com | Plagne Villages | www.laplagneresort.com | src/main/providers/ceto/{chamonix,meribel,plagne,megeve}.ts | createCeto*Provider.search | chamonixParse.ts / occupancy.ts | JSON-LD / parse Ceto | yes | Plagne Villages | ceto | station, checkIn, duration, submit |  |
| c20-www-laplagneresort-com | Les Hameaux de la Roche | www.laplagneresort.com | src/main/providers/ceto/{chamonix,meribel,plagne,megeve}.ts | createCeto*Provider.search | chamonixParse.ts / occupancy.ts | JSON-LD / parse Ceto | yes | Les Hameaux de la Roche | ceto | station, checkIn, duration, submit |  |
| c21-www-laplagneresort-com | Vallée | www.laplagneresort.com | src/main/providers/ceto/{chamonix,meribel,plagne,megeve}.ts | createCeto*Provider.search | chamonixParse.ts / occupancy.ts | JSON-LD / parse Ceto | yes | Vallée | ceto | station, checkIn, duration, submit |  |
| c22-reservation-larosiere-net | La Rosière | reservation.larosiere.net | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | La Rosière | ingenie | lodging, checkIn, checkOut, guests, submit |  |
| c23-www-karellis-com | Les Karellis | www.karellis.com | NONE | — | — | — | no | Les Karellis | not_wired | checkIn, checkOut, guests, submit |  |
| c24-reservation-lessaisies-com | Les Saisies | reservation.lessaisies.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Les Saisies | ingenie | stayType, checkIn, duration, guests, submit |  |
| c25-www-reservationpralognan-fr | Pralognan la Vanoise | www.reservationpralognan.fr | src/main/providers/locvacances/{provider,extract,hosts}.ts | createLocvacancesProvider.search | parseListeCards + getFiche si pièces absentes | initGmap sur fiche | yes | Pralognan la Vanoise | locvacances | checkIn, checkOut, guests, submit | Session cookies + getListe page. Pièces (pas chambres). Tarif séjour daté. |
| c26-reservation-saintfrancoislongchamp-com | Saint François Longchamp | reservation.saintfrancoislongchamp.com | src/main/providers/ublo/provider.ts | createUbloProvider.search | ublo/msem.ts | API MSEM coords | yes | Saint François Longchamp | ublo | checkIn, checkOut, guests, submit |  |
| c27-fr-locationsaintmartin-com | Saint Martin de Belleville | fr.locationsaintmartin.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Saint Martin de Belleville | ingenie | checkIn, checkOut, guests, submit |  |
| c28-www-saintefoy-reservation-com | Sainte-Foy Tarentaise | www.saintefoy-reservation.com | src/main/providers/ublo/provider.ts | createUbloProvider.search | ublo/msem.ts | API MSEM coords | yes | Sainte-Foy Tarentaise | ublo | checkIn, checkOut, guests, submit |  |
| c29-reservation-haute-maurienne-vanoise-com | Val Cenis | reservation.haute-maurienne-vanoise.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Val Cenis | ingenie | checkIn, checkOut, guests |  |
| c30-www-valloire-com | Valloire | www.valloire.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Valloire | ingenie | stayType, checkIn, duration, guests, submit |  |
| c31-www-valmeinier-reservation-com | Valmeinier | www.valmeinier-reservation.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Valmeinier | ingenie | checkIn, duration, guests, submit |  |
| c32-www-valmorel-com | Valmorel | www.valmorel.com | src/main/providers/opensystem/provider.ts | createOpenSystemProvider.search | opensystem/extract.ts | vueinfo.js coords | yes | Valmorel | opensystem | station, checkIn, checkOut, guests, submit |  |
| c33-reservation-combloux-com | Combloux | reservation.combloux.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Combloux | ingenie-heuristic | guests, submit |  |
| c34-www-laclusaz-com | La Clusaz | www.laclusaz.com | src/main/providers/deskline/{provider,extract,hosts}.ts | createDesklineProvider.search | extractDeskline (POST /searches + /filters bedrooms[] + GET searchresults) | location.coordinate | yes | La Clusaz | deskline | checkIn, checkOut, submit | Session `Q`+timestamp. fromPrice = tarif séjour. Chambres = plancher filtre, pas un décompte publié. |
| c35-reservation-alpedhuez-com | Alpe d'Huez Grand Domaine | reservation.alpedhuez.com | src/main/providers/ublo/provider.ts | createUbloProvider.search | ublo/msem.ts | API MSEM coords | yes | Alpe d'Huez Grand Domaine | ublo | checkIn, checkOut, guests, submit |  |
| c36-reservation-haute-maurienne-vanoise-com | Aussois | reservation.haute-maurienne-vanoise.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Aussois | ingenie | checkIn, checkOut, guests |  |
| c37-reservation-haute-maurienne-vanoise-com | Bonneval-sur-Arc | reservation.haute-maurienne-vanoise.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Bonneval-sur-Arc | ingenie | checkIn, checkOut, guests |  |
| c38-reservation-courchevel-com | Courchevel | reservation.courchevel.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Courchevel | ingenie | checkIn, checkOut, guests, submit |  |
| c39-fr-locationlesmenuires-com | Les Trois Vallées | fr.locationlesmenuires.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Les Trois Vallées | ingenie | checkIn, checkOut, guests, submit |  |
| c40-reservations-meribel-net | Les Trois Vallées | reservations.meribel.net | src/main/providers/ceto/{chamonix,meribel,plagne,megeve}.ts | createCeto*Provider.search | chamonixParse.ts / occupancy.ts | JSON-LD / parse Ceto | yes | Les Trois Vallées | ceto | guests, submit |  |
| c41-reservation-valthorens-com | Les Trois Vallées | reservation.valthorens.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Les Trois Vallées | ingenie | stayType, checkIn, duration, guests, submit |  |
| c42-reservation-la-toussuire-com | Les Sybelles | reservation.la-toussuire.com | src/main/providers/opensystem/provider.ts | createOpenSystemProvider.search | opensystem/extract.ts | vueinfo.js coords | yes | Les Sybelles | opensystem | checkIn, checkOut, guests, submit |  |
| c43-www-saintsorlindarves-com | Les Sybelles | www.saintsorlindarves.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Les Sybelles | ingenie | checkIn, checkOut, guests, submit |  |
| c44-www-peisey-vallandry-com | Les Arcs | www.peisey-vallandry.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Les Arcs | ingenie | lodging, checkIn, checkOut, guests, submit |  |
| c45-reservation-tignes-net | Tignes - Val d'Isère | reservation.tignes.net | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Tignes - Val d'Isère | ingenie | checkIn, checkOut, guests, submit |  |
| c46-reservation-valdisere-com | Tignes - Val d'Isère | reservation.valdisere.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Tignes - Val d'Isère | ingenie | checkIn, checkOut, guests, submit |  |
| c47-www-valfrejus-com | Valfréjus | www.valfrejus.com | src/main/providers/opensystem/provider.ts | createOpenSystemProvider.search | opensystem/extract.ts | vueinfo.js coords | yes | Valfréjus | opensystem | submit |  |
| c48-www-chamrousse-com | Chamrousse | www.chamrousse.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Chamrousse | ingenie | stayType, checkIn, duration, guests, submit |  |
| c49-reservation-lecollet-com | Le Collet d'Allevard | reservation.lecollet.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Le Collet d'Allevard | ingenie | stayType, checkIn, duration, guests, submit |  |
| c50-isola2000-com | Isola 2000 | isola2000.com | src/main/providers/ublo/provider.ts | createUbloProvider.search | ublo/msem.ts | API MSEM coords | yes | Isola 2000 | ublo | ∅ | Formulaire SPA / non inspecté — contrôles vides |
| c51-reservation-ledevoluy-com | Dévoluy | reservation.ledevoluy.com | src/main/providers/opensystem/provider.ts | createOpenSystemProvider.search | opensystem/extract.ts | vueinfo.js coords | yes | Dévoluy | opensystem | checkIn, checkOut, guests, submit |  |
| c52-reservation-orcieres-com | Orcières Merlette | reservation.orcieres.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Orcières Merlette | ingenie | checkIn, checkOut, guests, submit |  |
| c53-www-risoul-com | Forêt Blanche : Vars/Risoul | www.risoul.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Forêt Blanche : Vars/Risoul | ingenie | stayType, checkIn, duration, guests, submit |  |
| c54-www-alpes-sudlocations-com | Forêt Blanche : Vars/Risoul | www.alpes-sudlocations.com | NONE | — | — | — | no | Forêt Blanche : Vars/Risoul | not_wired | checkIn, duration, guests, submit |  |
| c55-www-valberg-com | Valberg | www.valberg.com | src/main/providers/ublo/provider.ts | createUbloProvider.search | ublo/msem.ts | API MSEM coords | yes | Valberg | ublo | ∅ | WordPress + widget. Ids dumpés 2026-09-01 : resort 665 / OT-665 |
| c56-reservation-lesorres-com | Les Orres | reservation.lesorres.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Les Orres | ingenie | checkIn, checkOut, guests, submit |  |
| c57-reservation-montgenevre-com | Montgenèvre | reservation.montgenevre.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Montgenèvre | ingenie-heuristic | station, checkIn, checkOut, submit |  |
| c58-reservation-montgenevre-com | Les Alberts | reservation.montgenevre.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Les Alberts | ingenie-heuristic | station, checkIn, checkOut, submit |  |
| c59-www-paysdesecrins-com | Puy-Saint-Vincent | www.paysdesecrins.com | src/main/providers/ublo/provider.ts | createUbloProvider.search | ublo/msem.ts | API MSEM coords | yes | Puy-Saint-Vincent | ublo | ∅ | WordPress + ws-msem. Ids dumpés 2026-09-01 : resort 30015 / PDE |
| c60-reservation-serre-chevalier-com | Serre-Chevalier | reservation.serre-chevalier.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Serre-Chevalier | ingenie | checkIn, checkOut, guests, submit |  |
| c61-www-valdallos-com | Val d'Allos - La Foux | www.valdallos.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Val d'Allos - La Foux | ingenie | stayType, checkIn, duration, guests, submit |  |
| c62-www-valdallos-com | Val d'Allos - Le Seignus | www.valdallos.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Val d'Allos - Le Seignus | ingenie | stayType, checkIn, duration, guests, submit |  |
| c63-reservation-ax-ski-com | Ax 3 Domaines | reservation.ax-ski.com | src/main/providers/opensystem/provider.ts | createOpenSystemProvider.search | opensystem/extract.ts | vueinfo.js coords | yes | Ax 3 Domaines | opensystem | station, lodging, checkIn, checkOut, submit |  |
| c64-www-n-py-com | Grand Tourmalet | www.n-py.com | src/main/providers/opensystem/provider.ts | createOpenSystemProvider.search | opensystem/extract.ts | vueinfo.js coords | yes | Grand Tourmalet | opensystem | station, checkIn, checkOut, guests, submit |  |
| c65-lesangles-com | Les Angles | lesangles.com | NONE | — | — | — | no | Les Angles | not_wired | ∅ | Formulaire SPA / non inspecté — contrôles vides |
| c66-resa-saintlary-com | Saint Lary | resa.saintlary.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Saint Lary | ingenie | stayType, checkIn, duration, guests, submit |  |
| c67-www-sancy-com | Super Besse | www.sancy.com | src/main/providers/diffusio/{provider,extract,hosts}.ts | createDiffusioProvider.search | parseSerpCards + parseFiche | commune `.place` | yes | Super Besse | diffusio | checkIn, checkOut, submit | SERP capacité ; chambres + fourchette semaine sur fiche (`partial`) |
| c68-www-sancy-com | le Mont Dore | www.sancy.com | src/main/providers/diffusio/{provider,extract,hosts}.ts | createDiffusioProvider.search | parseSerpCards + parseFiche | commune `.place` | yes | le Mont Dore | diffusio | checkIn, checkOut, submit | Même hôte / même SERP que Super Besse |
| c69-www-labresse-net | La Bresse Hohneck | www.labresse.net | src/main/providers/opensystem/provider.ts | createOpenSystemProvider.search | opensystem/extract.ts | vueinfo.js coords | yes | La Bresse Hohneck | opensystem | checkIn, checkOut, guests, submit |  |
| c70-www-ballons-hautes-vosges-com | Saint Maurice sur Moselle | www.ballons-hautes-vosges.com | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Saint Maurice sur Moselle | ingenie | stayType, checkIn, duration, guests, submit |  |
| c71-www-gerardmer-reservation-net | Gérardmer | www.gerardmer-reservation.net | src/main/providers/station/station.ts | createStationProvider.search | extractStationCards + fichePrice.ts | application/ld+json lat/lng | yes | Gérardmer | ingenie | station, stayType, checkIn, duration, guests, submit |  |
| c72-www-airbnb-fr | Airbnb | www.airbnb.fr | src/main/providers/airbnb/scrape.ts | scrapeAirbnbSearch | extractFromPage / extractProgressive | airbnbClip.ts locPrecision=approximate | partial | toutes stations (query lieu) | ota-airbnb | location, checkIn, checkOut, guests, adults, children, infants, pets, submit, cards, title, price, link | OTA globale. Rechercher avec le nom de la station + pays (ex. « Chamonix, France |
| c73-www-booking-com | Booking.com | www.booking.com | booking/booking.ts + webscrape/providers.ts | BookingProvider.search / createBookingWebProvider.search | extractBookingCards | extractors.ts Apollo lat/lon | yes | toutes stations (query lieu) | ota-booking | location, checkIn, checkOut, guests, adults, children, submit, cards, title, price, link | OTA globale. Rechercher avec le nom de la station (ex. « Les 2 Alpes »). Sélecte |

## Synthèse par famille

| family | n | moteur |
| --- | ---: | --- |
| ingenie | 35 | `station-web` si officialUrl |
| ingenie-heuristic | 3 | `shouldAttemptIngenie` (préfixe reservation.*) — Combloux, Montgenèvre, Les Alberts |
| ceto | 14 | `ceto-*` si officialUrl (12 Plagne + Chamonix + Méribel) |
| ublo | 6 | `ublo-msem` |
| opensystem | 7 | `opensystem` |
| deskline | 1 | `deskline` (La Clusaz) |
| locvacances | 1 | `locvacances` (Pralognan) |
| diffusio | 2 | `diffusio` (Super Besse + Mont-Dore) |
| ota-airbnb | 1 | IPC `airbnb:scrape`, **pas** `SearchEngine.register` |
| ota-booking | 1 | `booking` + `booking-web` |
| not_wired | 3 | silence ou lien seulement |

## not_wired — tickets concrets

| station | host | fichier à créer | contrat |
| --- | --- | --- | --- |
| Les Karellis | www.karellis.com | `src/main/providers/karellis.ts` **après** dump lodging (CF 403) | `AccommodationProvider.search` ; 0 → reason_code |
| Vars (2e centrale) | www.alpes-sudlocations.com | idem | Elloha : pages résidence WP, pas une SERP logements datée |
| Les Angles | lesangles.com | idem | OS 1395 / login les-angles, 1 produit OSMB, 0 vueinfo |

Pralognan **sorti du rouge** le 2026-09-02 : LocVacances `getListe` + `getFiche`
si « Chalet - N personnes » sans pièces. Voir `discovery_pralognan.md`.

Super Besse + Mont-Dore **sortis du rouge** le 2026-09-02 : Diffusio SERP datée
+ fiche chambres / fourchette semaine. Voir `discovery_sancy.md`.

Valberg et Pays des Écrins **sortis du rouge** le 2026-09-01 : même connecteur
`ublo-msem` qu’Isola, ids relevés sur l’XHR (`665/OT-665`, `30015/PDE`). Voir
`docs/diagnostics/discovery_valberg.md` et `discovery_ecrins.md`.

La Clusaz **sortie du rouge** le 2026-09-01 : connecteur Deskline dumpé
(`POST /searches` 8 pers. + `POST /filters bedrooms:[4,…]` + `GET searchresults`,
31 logements 13–20 fév. 2027). Voir `docs/diagnostics/discovery_clusaz.md`.

**Interdit** : inventer un parseur pour les 3 hôtes restants sans dump HAR/HTML.

## Hôtes partagés

| host | n | stations |
| --- | ---: | --- |
| www.laplagneresort.com | 12 | villages La Plagne |
| reservation.valdarly-montblanc.com | 6 | Val d’Arly |
| reservation.haute-maurienne-vanoise.com | 4 | Norma, Val Cenis, Aussois, Bonneval |
| reservation.montgenevre.com | 2 | Montgenèvre, Les Alberts |
| www.valdallos.com | 2 | La Foux, Le Seignus |
| www.sancy.com | 2 | Super Besse, Mont Dore |

Le filtre village (`criteres[]`) existe dans `station.ts` (`matchVillageOption`) pour Val d’Arly. La Plagne passe par Ceto, pas par les sélecteurs CENTRALS.

## Sélecteurs résultats

- `cards` / `title` / `price` / `link` non nuls : **2/74** (Airbnb, Booking).
- 72 centrales locales : **aucun** sélecteur de carte/prix dans cette table.

## Absents de CENTRALS, présents dans le moteur

| id | host | adapter | note |
| --- | --- | --- | --- |
| vrbo | www.vrbo.com | `createVrboWebProvider` | pas dans centrals.ts |
| gites | www.gites-de-france.com | `createGitesWebProvider` | pas dans centrals.ts |
| cozycozy | www.cozycozy.com | `createCozycozyWebProvider` | pas dans centrals.ts |
| megeve | megeve-booking.com | `createCetoMegeveProvider` | **pas dans CENTRALS** |
| expedia-web | expedia.fr | **non enregistré** dans buildEngine | `createExpediaWebProvider` existe |

## Adapter Ingénie vs table

`station.ts` n’importe **pas** `CENTRALS`. Les sélecteurs du formulaire sont **en dur** dans `FIELD` (`station.ts:175-207`), pas lus depuis la table générée.
