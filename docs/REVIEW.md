# REVIEW.md

Relecture adverse après patch, dépôt `scrape-barriers`.

## Checklist

| question | réponse |
| --- | --- |
| Ai-je ouvert centrals.ts et listé 100 % des id ? | **Oui.** 74 entrées, tableau CENTRALES.md. Import vivant : `centralLookup.ts` → `aggregateResults` (`centralsLoaded()`). |
| Ai-je patché un adapter jamais appelé ? | **Non.** Expedia-web reste non `register()`. 9 hôtes `not_wired` : pas de parseur inventé. |
| Ai-je cassé le résolveur captcha/WAF ? | **Non.** `CaptchaSolver` intact. `STEALTH_INIT` intact. Ajout : `POST /api/scrape/captcha/solve` + `captchaBridge.ts` appelé **après** le wait humain Airbnb. Pas de nouveau kit. |
| `matchesDemand` est-il sur le chemin UI réel ? | **Oui.** `matchesLodgingFilters` → `selectors.tsx` `lodgFiltered`. Défaut `lodgHideUnannounced: true` (schéma 8). |
| Airbnb/Booking appellent-ils geo pistes ? | **Oui, inchangé.** `enrichWithAccess`. Sans GPS : plus de pin centroïde (`lodgingCoords` → `null`). |
| Pagination : boucle visible ? | **Oui.** `collectPages` tamponne `pageIndex`, `stoppedReason`. Gîtes : `page = offset + 1` (off-by-one corrigé). Airbnb `scrollCount: 8` + `min_bedrooms`. |
| Fixture présentée comme live ? | **Non.** |
| Tests lancés ? | **Oui.** `lodgfilter:test` (tous passent, dont §12 matchesDemand 4p/2chb). `providers:test` (dont §13 Gîtes page_index + §14 centrals/reason_code). `avail:test`, `lodgaccess:test`. `tsc` web + node : 0 erreur. |
| Découpage ? | centrals.ts lu par exports + CENTRALES.md généré précédemment, pas collé ici. |

## Captcha / WAF — diff

- **Aucune suppression** de `STEALTH_INIT`, `looksBlocked`, `ProxyManager`, `CaptchaSolver`, `waitForCaptchaSolved`.
- **Ajout de connexions** : sidecar `/captcha/solve`, Electron `trySolveVisibleCaptcha` après timeout humain.

## Ce qui reste rouge

1. VRBO live = **429 `Bot or Not?`** (dump 2026-09-01). Motif désormais `blocked`, pas `selector_miss`. Parseur **non** retouché — pas de SERP.
2. Gîtes 0 = **destination Drupal sans `entity_id`**, pas un `.gite-card` mort. GET `search[value]` et GET `destination=` : même `.g2f-searchResult-noResults`. Parseur **non** retouché.
3. 9 centrales `not_wired` : motif explicite, pas d'adapter.
4. Sidecar `/api/scrape/{provider}` toujours hors chemin UI (Playwright Electron reste le chemin). Le solveur est rebranché via `/captcha/solve`.
5. `ttl_availability` 6 h : appliqué sur `scannedAt` dans `availabilityOf`. Pas de cache dispo Electron séparé.
6. Typecheck `src/main/**/*.test.ts` exclu du `tsconfig.node.json` (déjà le cas).
7. Inventaire 2 Alpes 13–20 fév. 2027 : **non chiffré** — VRBO bloqué, Gîtes non résolu, centrale Ingénie homepage sans datepicker monté.
