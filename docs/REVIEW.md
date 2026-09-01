# REVIEW.md

Relecture adverse après patch, dépôt `scrape-barriers`.

## Checklist

| question | réponse |
| --- | --- |
| Ai-je ouvert centrals.ts et listé 100 % des id ? | **Oui.** 74 entrées, tableau CENTRALES.md. Import vivant : `centralLookup.ts` → `aggregateResults` (`centralsLoaded()`). |
| Ai-je patché un adapter jamais appelé ? | **Non.** Expedia-web reste non `register()` (documenté, pas enabled). 7 hôtes `not_wired` : pas de parseur inventé. |
| Ai-je cassé le résolveur captcha/WAF ? | **Non.** `CaptchaSolver` intact. `STEALTH_INIT` intact. Ajout : `POST /api/scrape/captcha/solve` + `captchaBridge.ts` appelé **après** le wait humain Airbnb. Pas de nouveau kit. |
| `matchesDemand` est-il sur le chemin UI réel ? | **Oui.** `matchesLodgingFilters` → `selectors.tsx` `lodgFiltered`. Défaut `lodgHideUnannounced: true` (schéma 8). |
| Airbnb/Booking appellent-ils geo pistes ? | **Oui, inchangé.** `enrichWithAccess`. Sans GPS : plus de pin centroïde (`lodgingCoords` → `null`). |
| Pagination : boucle visible ? | **Oui.** `collectPages` tamponne `pageIndex`, `stoppedReason`. Gîtes : `page = offset + 1`. Airbnb `scrollCount: 8` + `min_bedrooms`. |
| Fixture présentée comme live ? | **Non.** |
| Tests lancés ? | **Oui.** `lodgfilter:test` (dont §12 matchesDemand 4p/2chb + plancher 14/7). `providers:test` (Gîtes `towns=50301`, centrals/reason_code). `avail:test`, `lodgaccess:test`. `families:test`, `ublourl:test`, `ublo:parse-test`. |
| Découpage ? | centrals.ts lu par exports + CENTRALES.md, pas collé ici. |

## Captcha / WAF — diff

- **Aucune suppression** de `STEALTH_INIT`, `looksBlocked`, `ProxyManager`, `CaptchaSolver`, `waitForCaptchaSolved`.
- **Ajout de connexions** : sidecar `/captcha/solve`, Electron `trySolveVisibleCaptcha` après timeout humain.

## Ce qui n’est pas un point rouge (warnings documentés)

1. VRBO live = **429 `Bot or Not?`** (dump 2026-09-01). Motif `blocked`. Parseur **non** retouché — pas de SERP.
2. Gîtes : GET `towns=50301` + `.js-search-tile` dumpés (33 résultats, 16 ≥ 8p/4ch). Live Electron **non relancé** ici → 0 carte tant que Playwright n’a pas couru. Pas d’inventaire fictif.
3. CozyCozy : catalogue SEO `article.hoj_seo_card` dumpé. `getResultList` **jamais** vu (clic Search → Booking affiliate). Pas de connecteur JSON inventé.
4. **7** centrales `not_wired` : motif explicite `reasonCode=not_wired`. Dumps : Karellis CF 403 ; Pralognan 26 tarifs sans chambres ; Clusaz Deskline 898 fromPrice/nuit, filters sans dates ; Elloha 0 SERP logements ; Angles OS 1395 / 1 produit, 0 vueinfo ; Sancy OT éditorial.
5. Sidecar `/api/scrape/{provider}` hors chemin UI. Solveur rebranché via `/captcha/solve`.
6. `ttl_availability` 6 h sur `scannedAt`. Pas de cache dispo Electron séparé.
7. Expedia-web **existe**, **non `register()`** — pas un `central_id` enabled.
8. GPS Airbnb approximatif (locPrecision=approximate) — mesuré, pas un centroïde inventé.

Valberg / Écrins **sortis du rouge** (Ublo 665/OT-665, 30015/PDE).

## Plancher personnes / chambres (2026-09-01)

`matchesDemand` / `partyVerdict` comparaient déjà en `<` (plancher). Correctifs UI : `lodg_travelers_field`, `lodg_party_floor_help`, puce voyageurs, tests §12 bis (14/7 retenu, 7/4 et 8/3 écartés). Défaut `includeUnannounced=false`.

## Critique

1. **Fixture ≠ live.** Un zéro live n’est pas un succès. Gîtes GET et CozyCozy SEO sont des **URLs dumpées**, pas 33 cartes injectées dans l’UI.
2. **CozyCozy est un méta-moteur.** Une SERP live dupliquerait Airbnb/Booking/VRBO.
3. **Booking ne transmet pas le plancher chambres** (`no_rooms=1` = unités). Le 4 chb min n’est appliqué qu’en aval.
4. **PARTY_LIMITS 20 / 9** borne l’UI, pas le prédicat.
5. **`includeUnannounced`** (défaut off) : beaucoup d’OTA n’écrivent pas les chambres. Strict = liste courte ; relâché = studios.
