# DIAGNOSTIC_ZERO — 0 Airbnb / 0 Booking vs 100+ site

Preuve **code + dumps + tests**, 2026-09-03, `master`. Pas de `station_run` live Windows dans ce bac : les compteurs *live* sont produits par `formatStationRun` (`[SKITRACK] station_run` dans le journal). Les `fetched` d’une session utilisateur ne sont pas dans le dépôt.

Recherche UI visée : station + dates + guests + logement entier.

## Tableau (fork depuis le code, après walk)

| centrale | fetched (code) | parsed | shown (après matchesDemand) | pages_fetched | fork | stop fichier:ligne |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Airbnb | scrape IPC, **pas** `SearchEngine` | StaySearchResult | 0 si `pers==0` ou `ch==0` | scroll max **15**, idle **2**, **pas de cursor** (INCONNU sans HAR) | **F4** si occupancy absente ; **F5** si pages_fetched===1 live | `index.ts` « pas un connecteur » · `dynamicHtml.ts` extractProgressive · `lodgingFilter.ts:249` |
| Booking API | 0 sans jeton Demand | 0 | 0 | 0 | **F1** | `booking.ts` clés requises |
| Booking web | Playwright si `SKITRACK_WEB_SCRAPE≠0` | cartes `property-card` | 0 si occupancy regex rate | `offset` pas 25, **max 15** / 250 | **F5** si live pages_fetched===1 ; **F4** si parsed>0 shown=0 | `searchWalk.ts` SEARCH_WALK · `providers.ts` collectPages |
| Abritel (vrbo-web) | re-scroll getResultList idle 2 / 15 | occupancy obligatoire | quelques si dump 1 écran | **walk** jusqu’à idle / 250 | **F5** tant que live = 1 payload | `providers.ts` collectCozyApiHits |
| Gîtes | GET `towns=` + `page=` | tuiles `.js-search-tile` | devis ITEA, cap **250** (budget 3 min) | `GITES_PAGE_STEP=1`, max **15** | **F5** si pages=1 live · **F4** hors devis | `urls.ts:172-173` · `providers.ts` collectPages |
| Autres centrals.ts | délégué famille / `not_wired` | — | — | — | **F1** Karellis, Vars Elloha, Les Angles | `centralLookup.ts` `not_wired` |

## Fork (ordre figé)

**Airbnb**

- F1 [FAUX] si `LodgingsPage` lance `runAirbnbSearch`. [VRAI] dans `SearchEngine` : aucun adapter.
- F2 [INCONNU] sans log session. Chemin challenge : `scrape.ts` `trySolveVisibleCaptcha` → `challenge_unresolved` / `blocked`.
- F3 [FAUX] si `data-deferred-state-0` présent : parser `StaySearchResult`.
- F4 [VRAI] **tant que** occupancy absente du nœud search : `matchesDemand` exige `pers>0` et chambres. `personCapacity` + `bedroomCount` + « N chambres » lus.
- F5 **walk** : scroll 15 / idle 2 / max 250. Cursor source **INCONNU** (pas de HAR) → pas inventé. Prouver live : `pages_fetched` dans `station_run`.

**Booking**

- F1 [FAUX] web scrape enregistré sauf `SKITRACK_WEB_SCRAPE=0`.
- F2 [INCONNU] live. `looksBlocked` + `emptyReason` → error.
- F3 [INCONNU] sans dump SERP. Sélecteur `property-card`.
- F4 [VRAI] si cartes sans « N chambres » / « N voyageurs » : `ch=0` → exclu.
- F5 **walk** : `SEARCH_WALK.maxPages = 15`. Site > 80 → 15×25=375 coupés à 250. Si extract page 1 < 25, `collectPages` s’arrête en croyant la dernière page (`scrollToEnd` idle 2 mitige).

**Abritel**

- F5 **walk** : re-scroll CozyCozy tant que `getResultList` apporte des ids (idle 2, max 15, 250). Dump D2A avant patch : 2 payloads / 45 entries.

**listingHosts** : Airbnb/Booking **non** veto (`listingHosts.ts` cozycozy only).

**Entire home URL** : Gîtes `f[0]=type:36172` [VRAI]. Airbnb `room_types` / Booking `nflt` **INCONNU** sans HAR → filtre local `isPrivateOrSharedListing` (type absent = keep).

## Cible après patch

- `max_pages` défaut **15**, `max_listings` **250** (`SEARCH_WALK`).
- Booking `offset` jusqu’à exhausted / max_pages / max_listings / blocked (page 2 bloquée **conserve** page 1).
- Abritel : re-scroll CozyCozy.
- Airbnb : scroll idle 2, max 15 ; curseur **non inventé**.
- Compteurs `pagination` + journal `station_run`.

## Tests

- T1 Airbnb fixture 2 pages JSON → ids page 2 exclusifs (`providers.test.ts`).
- T2 Booking offset 0 ∪ offset=N : union 50 > 25.
- T3 Abritel 1 batch < 3 batchs, dédup id.
- T4 `station_run` pages_fetched>=2.
- T5 entire : chambre privée / hôtes drop ; type absent conservé.
- T6 fetched=0 → F1 / F2, pas silence.
- T7 `npm run providers:test` + typecheck.
