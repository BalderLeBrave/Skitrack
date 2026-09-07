# Découverte Pays des Écrins — 2026-09-01

Centrale `www.paysdesecrins.com` (Puy-Saint-Vincent). **Pas de parseur HTML.**
Même connecteur `ublo-msem` qu’Isola.

## Captures

| id | méthode | HTTP | ce qu’on lit |
| --- | --- | --- | --- |
| `ecrins_hebergement` | Playwright `/hebergements/` | 200 | plugin `ws-msem`, lodging-widget |
| map-config | XHR `api/location/map-config?r=30015` | 200 | `{id:30015, libelle:"Pays des Ecrins"}` |
| channel | XHR `api/lodging/getLodgingChannelConfig/PDE` | 200 | canal `PDE` |
| list | GET `api/lodging/resort/30015/PDE?language=fr&facet=0` | 200 | **186** logements |
| offers 2p | POST `…/30015/offers` 13–20 fév. 2027, 2 adultes | 200 | **37** tarifs > 0 |
| offers 8p | même semaine, 8 adultes | 200 | **1** tarif (1704,72 €) |
| fiche | GET `/hebergements/test-slug` | 404 | pas de fiche par slug |

Preuve compacte : `dumps/msem-valberg-ecrins.json`.

## Ce que le dump montre

1. `channel` = `PDE`, **pas** `OT-30015`. Même leçon qu’Isola : ne pas
   extrapoler `OT-<resort>`.
2. Page d’entrée `/hebergements/` (le widget y vit). `UBLO_ENTRY_ONLY`.
3. Catalogue avec capacités (ex. chalet 8 pers. / 5 chambres). Une offre
   datée 8 pers. existe pour la semaine testée.

## Ce qu’on n’a pas

- Parseur HTML. Le connecteur parle à l’API, comme Isola.

## Motif désormais

`familyOfHost('www.paysdesecrins.com')` = `ublo`. `emptyStationReason` → `delegated`.
