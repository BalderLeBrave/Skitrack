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
3. CozyCozy live = **HTTP 200 SPA Angular `joli-root`**, recherche **non lancée** (0 XHR catalogue, `router-outlet` vide). Motif `[0_after_parse]`, pas `selector_miss`. `extractCozycozyCards` **non** réécrit. Seul patch URL : query `e` = `minBedRoomCount` (dump `main.js`) ; sidecar `guests=` → `adults=`.
4. 9 centrales `not_wired` : motif explicite, pas d'adapter.
5. Sidecar `/api/scrape/{provider}` toujours hors chemin UI (Playwright Electron reste le chemin). Le solveur est rebranché via `/captcha/solve`.
6. `ttl_availability` 6 h : appliqué sur `scannedAt` dans `availabilityOf`. Pas de cache dispo Electron séparé.
7. Typecheck `src/main/**/*.test.ts` exclu du `tsconfig.node.json` (déjà le cas).
8. Inventaire 2 Alpes 13–20 fév. 2027 : **non chiffré** — VRBO bloqué, Gîtes non résolu, CozyCozy SPA non lancée, centrale Ingénie homepage sans datepicker monté.

## Plancher personnes / chambres (2026-09-01)

`matchesDemand` / `partyVerdict` comparaient déjà en `<` (plancher). Le défaut n’était pas le prédicat : c’était le **contrat UI**.

- Libellé « Voyageurs » sans « min » alors que « Chambres min » existait.
- Aucune puce « N voyageur(s) minimum ».
- Corpus et titres collés à 8 pers / 4 chb : un 14/7 n’apparaissait pas, donc le filtre **paraissait exact**.

Correctifs : `lodg_travelers_field`, `lodg_party_floor_help`, puce voyageurs, tests §12 bis (14/7 retenu, 7/4 et 8/3 écartés).

## Critique

1. **Fixture ≠ live.** CozyCozy 9 cartes et Gîtes 8 dans l’aperçu sont un corpus interne. Live : SPA 0 carte / Drupal destination vide. Un zéro live n’est pas un succès.
2. **CozyCozy est un méta-moteur.** Même une SERP live dupliquerait Airbnb/Booking/VRBO. Le garder comme source a un coût anti-bot pour un inventaire non original.
3. **Booking ne transmet pas le plancher chambres** (`no_rooms=1` = unités). Le 4 chb min n’est appliqué qu’en aval : on ramène trop de 2 pièces pour les jeter.
4. **PARTY_LIMITS 20 / 9** borne l’UI, pas le prédicat. Un gîte 24 pers ne peut pas s’exprimer comme *demande*, mais passerait le filtre si relevé.
5. **`includeUnannounced`** (défaut off) reste le vrai trou : beaucoup d’OTA n’écrivent pas les chambres. Strict = liste courte ; relâché = studios.

