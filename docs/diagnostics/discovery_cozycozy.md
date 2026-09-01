# Découverte CozyCozy — 2026-09-01

Demande : Les 2 Alpes, 13–20 fév. 2027, 8 pers., 4 chambres.

Parseur `extractCozycozyCards` **non réécrit**. Pas de SERP cartes.

## Captures

| id | méthode | HTTP | title | cartes |
| --- | --- | --- | --- | --- |
| `cozycozy_curl` | curl GET `/fr/search?location=…&checkin&checkout&adults=8&nights=7` | 200 | (vide) | 0 — coquille SPA |
| `cozycozy_p1` | Playwright Chromium headless-shell + STEALTH_INIT, 10 s | 200 | (vide) | 0 — `joli-root` monté, `router-outlet` vide |
| `cozycozy_placeid` / `cozycozy_api` | même URL + `e=4`, 12 s | 200 | (vide) | 0 — XHR = `logVisit` + GTM, pas de catalogue |

HTML brut local, non commis. Preuve : `dumps/capture-gites-cozy-2.json`, `dumps/capture-cosmos-probe.json`.

## Ce que le dump montre

1. **SPA Angular 16** (`ng-version="16.2.6"`, `joli-root`, `joli-market`). Pas un challenge Cloudflare, pas un 429.
2. **Aucun XHR search.** Réseau : `runtime.js`, `main.js`, `api/logVisit`, GTM. Zéro `launch`, zéro `getResultList`, zéro `searchInputLocation`.
3. **Sérialisation des filtres** lue dans `main.f7e84b9d7beb408c.js` (2,2 Mo, HTTP 200) :
   ```
   u.minBedRoomCount="e"
   u.minBathRoomCount="h"
   u.price="p"
   ```
   Le connecteur posait `location`, `checkin`, `checkout`, `adults`, `nights`, `page`. Il **omettait `e`**. C’est le seul patch URL : `bedrooms → e`. Ça ne lance pas la recherche.
4. Le sidecar Python posait `guests=` — **absent du bundle**. Corrigé en `adults=`.
5. **Contrat catalogue** (bundle, pas un appel réussi) :
   - `searchByText` → `backend.searchInputLocation({q, siteCode, locale})`
   - `searchByPlaceId` → `backend.getInputLocation({placeId, siteCode, locale, session})`
   - `backend.launch({searchId, …})` démarre la recherche
   - `backend.getResultList({searchId, sorting, offset, count, filters, …})` rend les cartes
   - En-têtes : `X-Search-Id`, `X-Cosmos-Session-Id`, `X-Split-Id`
6. Backend dumpé : `https://cw-1036.fusionauth-cozycozy-backend.deployment.joli.space/cosmos-api` — page Swagger UI 200. Les chemins REST `/getInputLocation`, `/search`, `/api-json` répondent **404**. Ce n’est pas un REST de ces noms.
7. `/s/les-2-alpes` = 404 « Il n’y a rien par ici ».
8. Console : FedCM / GSI `NetworkError` — login Google, pas le catalogue.
9. Sélecteurs existants (`a[href*="/offer"]`, `[class*="Offer"]`, `.accommodation-card`) : **0 hit**. On ne les réécrit pas.

## Ce qu’on n’a pas

- Un `placeId` / `searchId` pour « Les 2 Alpes »
- Une réponse `getResultList` (cartes, prix, capacité)
- JSON-LD de cartes
- Confirmation que `e=4` filtre une SERP humaine

## Motif désormais

`emptyReason` : SPA Cosmos montée, `launch` non appelé → `[0_after_parse]`, pas `selector_miss`, pas `blocked`.
