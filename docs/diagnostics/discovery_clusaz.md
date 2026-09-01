# Découverte La Clusaz — 2026-09-01 (round 6)

Parseur **non écrit**. JSON Deskline sessionné, `fromPrice` = nuit.

## Captures

| id | HTTP | fait |
| --- | --- | --- |
| `clusaz_hebergements6` | 200 | Gardeners ski-widget + Deskline |
| `clusaz_deskline` | 200 | XHR `webapi.deskline.net/laclusaz/…` |
| `clusaz_deskline_accommodations.json` | 200 | 24 logements, paging **898** |
| `clusaz_deskline_filterresults.json` | 200 | Location 874, chalet 115, studio 112, 4 chb 152 |
| GET nu + `DW-Source: desklineweb` | 400 | Session widget requise |
| `atherac_home` | 200 | **Agence** LocVacances, 73 biens — pas l’OT |

## Contrat dumpé

- Client Deskline : `laclusaz`. Tag DW5 `0a6466c6-8058-4958-b502-d52767741f5b`.
- Header obligatoire : `DW-Source: desklineweb` (+ `dw-sessionid` du widget).
- Liste : `GET webapi.deskline.net/laclusaz/fr/accommodations?fields=…`
- Objet : `id` UUID, `name`, `location.coordinate.{lat,long}`, `fromPrice.value` (€/nuit, `calcDuration: 1`), `categories`, `stars`.
- Gardeners `ski-widget.js` = forfaits, pas lodging.

## Ce qu’on n’écrit pas

Un connecteur `fromPrice` / nuit présenté comme tarif séjour.
ATHERAC n’est pas la centrale OT.
