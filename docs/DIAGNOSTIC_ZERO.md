# DIAGNOSTIC_ZERO — 0 Airbnb / 0 Booking vs 100+ site

Preuve **code + dumps + tests + station_run live**, 2026-09-03.

## Live Windows — Les 2 Alpes 2027-02-13→20, 4 pers, 2 chb

`[SKITRACK] station_run` (avant ce patch) :

| provider | fetched | pages | stop | fork | lecture |
| --- | ---: | ---: | --- | --- | --- |
| booking (Demand API) | 0 | 0 | — | F1 | **pas une panne** : pas de jeton. Message « Réglages → Clés d’API » dans le JSON. Repli = booking-web. |
| booking-web | 25 | 1 | exhausted | **F5** | Page pleine (25) traitée comme dernière ; rapport reconstruit après zone (écrase le walk). |
| gites-web | 14 | 3 | exhausted | — | Walk OK. |
| vrbo-web (Abritel) | 168 | 9 | exhausted | — | Walk OK. |
| station-web | 319 | 1 | exhausted | F5 | AJAX 2 Alpes, un écran. |
| ceto-* / ublo / opensystem / deskline / locvacances / diffusio | 0 | 0 | — | F1 | **delegated** : hôte Ingénie, pas leur station. |

Airbnb n’est **pas** dans ce JSON : autre IPC (`runAirbnbSearch`).

## Correctifs (ce patch)

- `collectPages` : page « pleine » = ≥ 80 % (23/25 continue). Gîtes pageSize=1 inchangé.
- Booking : suivre le lien `offset=` **de la page** (dest_id session), pas une URL minimale reconstruite.
- Rapport `collectPages` stampé sur la liste → `SearchEngine` → `annotateOutcome` ne l’écrase plus.
- Page 0 cartes + `looksBlocked` → `trySolveVisibleCaptcha` (déjà dans le dépôt), sinon `blocked` (page 1 conservée).
- Demand API sans jeton : `[]`, `not_wired`, plus de throw.
- Spécialistes hors hôte : `delegated`, fork null.

## Tableau (fork depuis le code, après walk)

| centrale | fetched (code) | parsed | shown (après matchesDemand) | pages_fetched | fork | stop fichier:ligne |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Airbnb | scrape IPC, **pas** `SearchEngine` | StaySearchResult | 0 si `pers==0` ou `ch==0` | scroll max **15**, idle **2**, **pas de cursor** (INCONNU sans HAR) | **F4** si occupancy absente ; **F5** si pages_fetched===1 live | `index.ts` « pas un connecteur » · `dynamicHtml.ts` extractProgressive · `lodgingFilter.ts` |
| Booking API | 0 sans jeton Demand | 0 | 0 | 0 | **null** (`not_wired`) | `booking.ts` return [] |
| Booking web | Playwright si `SKITRACK_WEB_SCRAPE≠0` | cartes `property-card` | occupancy regex | lien `offset=` page, **max 15** / 375, stop `advertised` | **F5** si live pages_fetched===1 ; **F2** sandbox challenge | `searchWalk.ts` pageLooksLast · `providers.ts` collectPages |
| Abritel (vrbo-web) | re-scroll getResultList idle 2 / 15 | occupancy obligatoire | quelques si dump 1 écran | **walk** jusqu’à idle / 375 | **F5** tant que live = 1 payload | `providers.ts` collectCozyApiHits |
| Gîtes | GET `towns=` + `page=` | tuiles `.js-search-tile` | devis ITEA, cap **375** (budget 3 min) | `GITES_PAGE_STEP=1`, max **15** | **F5** si pages=1 live · **F4** hors devis | `urls.ts` · `providers.ts` collectPages |
| Autres centrals.ts | délégué famille / `not_wired` | — | — | — | **null** delegated ; **F1** Karellis / Elloha | `centralLookup.ts` emptyProviderReason |

## Fork (ordre figé)

**Airbnb**

- F1 [FAUX] si `LodgingsPage` lance `runAirbnbSearch`. [VRAI] dans `SearchEngine` : aucun adapter.
- F2 [INCONNU] sans log session. Chemin challenge : `scrape.ts` `trySolveVisibleCaptcha` → `challenge_unresolved` / `blocked`.
- F3 [FAUX] si `data-deferred-state-0` présent : parser `StaySearchResult`.
- F4 [VRAI] **tant que** occupancy absente du nœud search : `matchesDemand` exige `pers>0` et chambres. `personCapacity` + `bedroomCount` + « N chambres » lus.
- F5 **walk** : scroll 15 / idle 2 / max 375. Cursor source **INCONNU** (pas de HAR) → pas inventé. Prouver live : `pages_fetched` dans `station_run`.

**Booking**

- F1 [FAUX] web scrape enregistré sauf `SKITRACK_WEB_SCRAPE=0`. Demand API absente = `not_wired`, pas F1.
- F2 live : `looksBlocked` → résolveur sidecar, sinon `blocked` (page 1 conservée).
- F3 [INCONNU] sans dump SERP. Sélecteur `property-card`.
- F4 [VRAI] si cartes sans « N chambres » / « N voyageurs » : `ch=0` → exclu.
- F5 **walk** : `SEARCH_WALK.maxPages = 15`. Live avant patch : 25 / 1 page / exhausted. Seuil 80 % + lien suivant Booking + rapport non écrasé. Dump sandbox 2026-09-03 : Booking SERP → `__challenge_` puis accueil (`blocked`, 0 cartes) — le walk ne peut pas s'exercer sans le résolveur headed.

**Abritel**

- F5 **walk** : re-scroll CozyCozy tant que `getResultList` apporte des ids (idle 2, max 15, 375). Live 2 Alpes : 168 / 9 pages.

**listingHosts** : Airbnb/Booking **non** veto (`listingHosts.ts` cozycozy only).

**Entire home URL** : Gîtes `f[0]=type:36172` [VRAI]. Airbnb `room_types` / Booking `nflt` **INCONNU** sans HAR → filtre local `isPrivateOrSharedListing` (type absent = keep).

## Cible après patch

- `max_pages` défaut **15** (Booking, Gîtes, Abritel, Airbnb), `max_listings` **375**. Arrêt anticipé si la SERP annonce un total (`stopped_reason=advertised`).
- Booking suit le lien `offset=` de la SERP ; URL reconstruite en repli.
- Page 2 bloquée **conserve** page 1, `stopped_reason=blocked`.
- Abritel : re-scroll CozyCozy.
- Airbnb : scroll idle 2, max 15 ; curseur **non inventé**.
- Compteurs `pagination` du walk, pas reconstruits après `keepInZone`.

## Tests

- T1 Airbnb fixture 2 pages JSON → ids page 2 exclusifs (`providers.test.ts`).
- T2 Booking offset 0 ∪ offset=N : union 50 > 25.
- T3 Abritel 1 batch < 3 batchs, dédup id.
- T4 `station_run` pages_fetched>=2.
- T5 entire : chambre privée / hôtes drop ; type absent conservé.
- T6 fetched=0 → F1 / F2, pas silence. delegated / not_wired → fork null.
- Extract 23/25 ne coupe pas le walk.
- T7 `npm run providers:test` + typecheck.
