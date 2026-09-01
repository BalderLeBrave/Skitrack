# Découverte CozyCozy — 2026-09-01

Demande : Les 2 Alpes, 13–20 fév. 2027, 8 pers., 4 chambres.

Parseur `extractCozycozyCards` **non réécrit**. Pas de SERP cartes.

## Captures

| id | méthode | HTTP | title | cartes |
| --- | --- | --- | --- | --- |
| `cozycozy_curl` | curl GET `/fr/search?location=…&checkin&checkout&adults=8&nights=7` | 200 | (vide) | 0 — coquille SPA |
| `cozycozy_p1` | Playwright Chromium headless-shell + STEALTH_INIT, 10 s | 200 | (vide) | 0 — `joli-root` monté, `router-outlet` vide |

HTML brut local, non commis. Preuve : `dumps/capture-report.json`.

## Ce que le dump montre

1. **SPA Angular 16** (`ng-version="16.2.6"`, `joli-root`, `joli-market`). `curl` 59 Ko, Playwright 77 Ko : pas un challenge Cloudflare, pas un 429.
2. **Aucun XHR search.** Réseau : `runtime.js`, `main.js`, `api/logVisit`, CMP InMobi, GTM, Hotjar. Zéro appel catalogue.
3. **Outlet `filters` nommé** dans le routeur Angular — le filtre CozyCozy est un overlay frontend, pas un HTML statique.
4. **Sérialisation des filtres** lue dans `main.f7e84b9d7beb408c.js` (2,2 Mo, HTTP 200) :
   ```
   u.minBedRoomCount="e"
   u.minBathRoomCount="h"
   u.price="p"
   ```
   Le connecteur posait `location`, `checkin`, `checkout`, `adults`, `nights`, `page`. Il **omettait `e`**. C’est le seul patch URL : `bedrooms → e`.
5. Le sidecar Python posait `guests=` — **absent du bundle**. Corrigé en `adults=`.
6. Sélecteurs existants (`a[href*="/offer"]`, `[class*="Offer"]`, `.accommodation-card`) : **0 hit** sur le dump. Ce n’est pas une preuve qu’ils sont justes sur une SERP réelle. On ne les réécrit pas.

## Ce qu’on n’a pas

- JSON-LD de cartes
- classe DOM de résultat (`ResultItemPrice*` n’existe que comme clé i18n dans le bundle)
- `entity`/place id de « Les 2 Alpes » (possible parallèle Gîtes `entity_id`)
- confirmation que `e=4` filtre réellement une SERP humaine — seulement que c’est le short-key du filtre chambres

## Motif désormais

`emptyReason` : SPA Cosmos montée, recherche non lancée → `[0_after_parse]`, pas `selector_miss`, pas `blocked`.
