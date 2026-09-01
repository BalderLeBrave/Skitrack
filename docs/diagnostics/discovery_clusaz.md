# Découverte La Clusaz — 2026-09-01 (round 7)

Parseur **non écrit**. Widget dans le shadow `dw-app-container`.

## Captures

| id | HTTP | fait |
| --- | --- | --- |
| GET accommodations (navigateur) | 200 | 24/page, **898** total, GPS + fromPrice/nuit |
| POST `/filters` widget | 201 | `{name, bestPrice, specialPrice, specialOffer}` |
| Custom element | — | `<dw-app-container>` (shadow) |
| GET nu + `DW-Source` | 400 | session `dw-sessionid` requise |

Le payload widget **n’envoie pas** d’arrivée / départ / occupancy.
Les champs occupancy ajoutés à la main au POST ne sont **pas** dump-proven
(l’API 201 les ignore).

## Ce qu’on n’écrit pas

Un connecteur `fromPrice` / nuit. ATHERAC n’est pas l’OT.
