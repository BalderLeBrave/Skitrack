# Découverte La Clusaz — 2026-09-01 (round 10)

Parseur **non réécrit dans l’aperçu Grok**. Contrat Deskline dumpé, session froide
rejouée sans navigateur.

## Contournement

Le widget « Vérifier disponibilités » part à **2 adultes** → 8 hôtels,
fromPrice/nuit. On n’emprunte pas ce chemin.

À la place :

1. `POST https://webapi.deskline.net/searches`  
   `searchLines: [{ units: 1, adults: 8 }]` + `dateFrom`/`dateTo`  
   En-tête `DW-SessionId: Q` + `Date.now()`, `DW-Source: desklineweb`.  
   HTTP **201**, id de recherche.
2. `POST https://webapi.deskline.net/filters`  
   `filterAccommodation.bedrooms: [4, 5, …]` — **List<Int16>**, un scalaire
   rend 400. HTTP **201**.
3. `GET /laclusaz/fr/accommodations/searchresults/{id}?filterId=`  
   **31 logements** (13–20 fév. 2027, ≥ 4 chb), chalets / appartements, GPS,
   `fromPrice.value` = **tarif séjour** (2 548–23 651 €).  
   `bedrooms:[4]` seul → 17.

Session froide confirmée 2026-09-01 23:15 (`probe-deskline-cold.mjs`) :
searches 201, filters 201, searchresults 200, paging `totalRecordCount: 31`.

## Captures

| id | HTTP | fait |
| --- | --- | --- |
| GET accommodations (navigateur) | 200 | 24/page, **898** total, GPS + fromPrice/nuit |
| POST `/filters` widget | 201 | `{name, bestPrice, specialPrice, specialOffer}` |
| Custom element | — | `<dw-app-container>` (shadow) |
| GET nu + `DW-Source` | 400 | session `dw-sessionid` requise |
| POST `/searches` 8p + dates | 201 | session `Q`+timestamp, **sans page** |
| POST `/filters` bedrooms[] | 201 | List<Int16> |
| GET searchresults filtré | 200 | **31** cartes, GPS, tarif séjour |

## Ce qu’on n’écrit pas dans l’aperçu

Un parseur Grok. Le connecteur Electron (`src/main/providers/deskline`) reprend
ce contrat. `bedrooms` sur la carte = plancher du filtre, pas un décompte
publié.
